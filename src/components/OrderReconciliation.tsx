import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { RatingRecord, Counter, SystemSettings, POSReconciliation } from '../types';
import { THEMES } from '../constants/theme';
import { saveReconciliationRecord, formatThaiDate, recordMatchesBranch, matchesBranch, isRecordInDateRange } from '../utils/storage';
import { checkRating, findBursts, parsePosTime, IntegrityFlag, DEFAULT_INTEGRITY_OPTIONS } from '../utils/integrity';
import {
  Upload,
  FileCheck,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Search,
  Download,
  FileSpreadsheet,
  ListFilter,
  RefreshCw,
  HelpCircle,
  UserCheck,
  UserX,
  Clock,
  Camera,
  ShieldAlert,
} from 'lucide-react';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { AutoPosCheck } from './AutoPosCheck';
import { RATING_OPTIONS } from '../constants/ratingOptions';

const RATING_BY_LEVEL = new Map(RATING_OPTIONS.map((o) => [o.level as string, o]));
const BKK_MS = 7 * 60 * 60 * 1000;
// Rating time in Bangkok as HH:MM:SS
function timeOnly(ts: string): string {
  const t = Date.parse(ts);
  return isNaN(t) ? '–' : new Date(t + BKK_MS).toISOString().slice(11, 19);
}

interface OrderReconciliationProps {
  ratings: RatingRecord[];
  allRatings?: RatingRecord[];
  reconciliations: POSReconciliation[];
  counters: Counter[];
  settings: SystemSettings;
  selectedBranch?: string; // branch picked in the admin header
}

interface PosRecord {
  orderNumber: string;
  orderTime?: string;
}

export const OrderReconciliation: React.FC<OrderReconciliationProps> = ({
  ratings,
  allRatings = [],
  reconciliations,
  counters,
  settings,
  selectedBranch: headerBranch,
}) => {
  const [posRecords, setPosRecords] = useState<PosRecord[]>([]);
  const [posInputText, setPosInputText] = useState<string>('');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  // true when the list was copied from the ratings themselves, not from a POS file
  const [fromSystem, setFromSystem] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<string>(headerBranch || 'all');
  // Follow the branch picked in the header so every section shows the same branch
  useEffect(() => {
    setSelectedBranch(headerBranch || 'all');
  }, [headerBranch]);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]); 
  const [activeFilter, setActiveFilter] = useState<'all' | 'missing' | 'matched'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'reconcile' | 'history'>('reconcile');
  const [lateMinutes, setLateMinutes] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem('pos_late_minutes_v1'));
      return v > 0 ? v : DEFAULT_INTEGRITY_OPTIONS.lateMinutes;
    } catch {
      return DEFAULT_INTEGRITY_OPTIONS.lateMinutes;
    }
  });
  const updateLateMinutes = (v: number) => {
    const n = Math.max(1, Math.round(v) || DEFAULT_INTEGRITY_OPTIONS.lateMinutes);
    setLateMinutes(n);
    try { localStorage.setItem('pos_late_minutes_v1', String(n)); } catch { /* ignore */ }
  };

  const theme = THEMES[settings.themeColor] || THEMES.pink;

  // Handle File Upload (.csv, .txt, .xlsx, .xls)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    setFromSystem(false);
    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'xlsx' || ext === 'xls' || ext === 'ods') {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheet];
          const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
          parseRowsToPosRecords(rows);
        } catch (err) {
          console.error('Excel parse error:', err);
          alert('ไม่สามารถอ่านไฟล์ Excel ได้ กรุณาตรวจสอบรูปแบบไฟล์');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        const buffer = event.target?.result as ArrayBuffer;
        if (!buffer) return;

        let text = '';
        try {
          const decoderUtf8 = new TextDecoder('utf-8', { fatal: true });
          text = decoderUtf8.decode(buffer);
        } catch {
          try {
            const decoderTis = new TextDecoder('windows-874');
            text = decoderTis.decode(buffer);
          } catch {
            const decoderDefault = new TextDecoder();
            text = decoderDefault.decode(buffer);
          }
        }

        if (text) {
          if (text.includes(',') || text.includes(';') || text.includes('\t')) {
            const lines = text.split(/[\r\n]+/);
            const rows = lines.map(line => {
              return line.split(/[,;\t]/).map(cell => cell.trim().replace(/^["']|["']$/g, ''));
            });
            parseRowsToPosRecords(rows);
          } else {
            setPosInputText(text);
            parseTextToPosRecords(text);
          }
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const formatExcelDate = (val: any): string | undefined => {
    if (val === undefined || val === null || val === '') return undefined;
    const strVal = String(val).trim();
    if (strVal.toLowerCase() === 'undefined' || strVal.toLowerCase() === 'null') return undefined;

    const num = Number(val);
    if (!isNaN(num) && num > 10000 && num < 60000) {
      const utcDays = Math.floor(num - (num < 61 ? 0 : 1));
      const date = new Date(Date.UTC(1899, 11, utcDays));
      const fractionalDay = num - Math.floor(num);
      let totalSeconds = Math.round(fractionalDay * 86400);
      const seconds = totalSeconds % 60;
      totalSeconds = Math.floor(totalSeconds / 60);
      const minutes = totalSeconds % 60;
      const hours = Math.floor(totalSeconds / 60);
      date.setUTCHours(hours, minutes, seconds);

      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      const h = String(date.getUTCHours()).padStart(2, '0');
      const m = String(date.getUTCMinutes()).padStart(2, '0');
      const s = String(date.getUTCSeconds()).padStart(2, '0');
      return `${year}/${month}/${day} ${h}:${m}:${s}`;
    }
    return strVal;
  };

  const parseRowsToPosRecords = (rows: any[][]) => {
    if (!rows || rows.length === 0) {
      setPosRecords([]);
      return;
    }

    let orderColIdx = 0;
    let timeColIdx = -1;

    let headerRowIdx = 0;
    for (let r = 0; r < Math.min(rows.length, 5); r++) {
      const row = rows[r];
      if (!row) continue;
      const hasOrderKeyword = row.some(cell => {
        const s = String(cell).toLowerCase();
        return s.includes('order') || s.includes('เลขออเดอร์') || s.includes('เลข') || s.includes('bill') || s.includes('id') || s.includes('no') || s.includes('ใบเสร็จ');
      });
      if (hasOrderKeyword) {
        headerRowIdx = r;
        break;
      }
    }

    const header = rows[headerRowIdx]?.map(c => String(c).toLowerCase().trim()) || [];
    header.forEach((h, idx) => {
      if (h.includes('order') || h.includes('เลขออเดอร์') || h.includes('เลข') || h.includes('bill') || h.includes('id') || h.includes('no') || h.includes('ใบเสร็จ')) {
        orderColIdx = idx;
      }
      if (h.includes('time') || h.includes('date') || h.includes('เวลา') || h.includes('วันที่') || h.includes('created')) {
        timeColIdx = idx;
      }
    });

    if (timeColIdx === -1 && rows.length > headerRowIdx + 1) {
      for (let c = 0; c < (rows[headerRowIdx + 1]?.length || 0); c++) {
        if (c === orderColIdx) continue;
        const sampleVal = String(rows[headerRowIdx + 1]?.[c] || '');
        if (sampleVal.includes(':') || sampleVal.includes('/') || (sampleVal.includes('-') && sampleVal.length >= 8) || !isNaN(Number(sampleVal))) {
          timeColIdx = c;
          break;
        }
      }
    }

    const startRow = headerRowIdx + 1;
    const records: PosRecord[] = [];
    const seen = new Set<string>();

    for (let i = startRow; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;
      const orderNum = String(row[orderColIdx] ?? row[0] ?? '').trim().replace(/^["']|["']$/g, '');
      if (!orderNum || orderNum.toLowerCase() === 'undefined' || orderNum.toLowerCase() === 'null') continue;

      const rawTime = timeColIdx !== -1 ? row[timeColIdx] : undefined;
      const orderTime = formatExcelDate(rawTime);
      
      records.push({ orderNumber: orderNum, orderTime });
    }

    setPosRecords(records);
    setPosInputText(records.map(r => r.orderTime ? `${r.orderNumber}, ${r.orderTime}` : r.orderNumber).join('\n'));
  };

  const parseTextToPosRecords = (text: string) => {
    const lines = text.split(/[\r\n]+/).map(s => s.trim()).filter(s => s.length > 0);
    const records: PosRecord[] = [];
    const seen = new Set<string>();

    lines.forEach(line => {
      const parts = line.split(/[,;\t]/).map(p => p.trim().replace(/^["']|["']$/g, ''));
      const orderNum = parts[0];
      const orderTime = formatExcelDate(parts[1]);
      if (orderNum) {
        records.push({ orderNumber: orderNum, orderTime });
      }
    });

    setPosRecords(records);
  };

  const handleTextareaChange = (text: string) => {
    setPosInputText(text);
    setFromSystem(false);
    parseTextToPosRecords(text);
  };

  // Parse POS Order numbers from input text
  const posOrdersList = useMemo(() => {
    return posRecords.map(r => r.orderNumber);
  }, [posRecords]);

  const posOrderTimeMap = useMemo(() => {
    const map = new Map<string, string>();
    posRecords.forEach(r => {
      if (r.orderTime) {
        map.set(r.orderNumber.toUpperCase(), r.orderTime);
      }
    });
    return map;
  }, [posRecords]);

  // Filter ratings by selected branch and date
  const filteredRatings = useMemo(() => {
    let list = ratings;
    if (selectedBranch && selectedBranch !== 'all') {
      list = list.filter((r) => recordMatchesBranch(r, selectedBranch, counters));
    }
    if (selectedDate) {
      list = list.filter((r) => isRecordInDateRange(r.timestamp, selectedDate, selectedDate));
    }
    return list;
  }, [ratings, counters, selectedBranch, selectedDate]);

  // Extract all unique system order numbers for the selected date (or overall)
  const availableSystemOrders = useMemo(() => {
    const orders: string[] = [];
    filteredRatings.forEach((r) => {
      if (r.orderNumber && r.orderNumber.trim()) {
        orders.push(r.orderNumber.trim());
      }
    });
    return Array.from(new Set(orders));
  }, [filteredRatings]);

  const handlePullSystemOrders = () => {
    if (availableSystemOrders.length === 0) {
      alert('ไม่พบเลขออเดอร์ในระบบการประเมินตามช่วงเวลาที่เลือก');
      return;
    }
    // No bill time here: these numbers come from the ratings, so any time would be the rating time
    const records: PosRecord[] = availableSystemOrders.map(o => ({ orderNumber: o }));
    setFromSystem(true);
    setPosRecords(records);
    setPosInputText(records.map(r => r.orderNumber).join('\n'));
    setUploadedFileName(`เลขจากใบประเมิน ไม่ใช่ POS (${availableSystemOrders.length})`);
  };

  // Map of evaluated order numbers (case-insensitive key) -> RatingRecord
  const evaluatedMap = useMemo(() => {
    const map = new Map<string, RatingRecord>();
    filteredRatings.forEach((r) => {
      if (r.orderNumber && r.orderNumber.trim()) {
        map.set(r.orderNumber.trim().toUpperCase(), r);
      }
    });
    return map;
  }, [filteredRatings]);

  // Reconciliation Calculation Results
  const reconciliationData = useMemo(() => {
    if (posOrdersList.length === 0) {
      return {
        matched: [],
        missing: [],
        extraEvaluated: [],
        complianceRate: 0,
      };
    }

    const matched: { orderNumber: string; rating?: RatingRecord }[] = [];
    const missing: { orderNumber: string }[] = [];

    posOrdersList.forEach((posOrder) => {
      const key = posOrder.toUpperCase();
      const rating = evaluatedMap.get(key);
      if (rating) {
        matched.push({ orderNumber: posOrder, rating });
      } else {
        missing.push({ orderNumber: posOrder });
      }
    });

    // Check evaluated ratings that were NOT in the POS list
    const posSet = new Set(posOrdersList.map((o) => o.toUpperCase()));
    const extraEvaluated = filteredRatings.filter(
      (r) => r.orderNumber && !posSet.has(r.orderNumber.trim().toUpperCase())
    );

    const complianceRate = Math.round((matched.length / posOrdersList.length) * 100) || 0;

    return {
      matched,
      missing,
      extraEvaluated,
      complianceRate,
    };
  }, [posOrdersList, evaluatedMap, filteredRatings]);

  // Integrity checks: compare each rating with its POS bill time, server time and neighbours
  const integrityById = useMemo(() => {
    const result = new Map<string, IntegrityFlag[]>();
    const posLoaded = posOrdersList.length > 0;
    const posSet = new Set(posOrdersList.map((o) => o.trim().toUpperCase()));
    const posTimeMs = new Map<string, number>();
    posRecords.forEach((p) => {
      const t = parsePosTime(p.orderTime, selectedDate || undefined);
      if (t !== undefined) posTimeMs.set(p.orderNumber.trim().toUpperCase(), t);
    });
    const orderCount = new Map<string, number>();
    allRatings.forEach((r) => {
      if (r.orderNumber && r.orderNumber.trim()) {
        const k = r.orderNumber.trim().toUpperCase();
        orderCount.set(k, (orderCount.get(k) || 0) + 1);
      }
    });
    const opts = { ...DEFAULT_INTEGRITY_OPTIONS, lateMinutes };
    const bursts = findBursts(filteredRatings, opts.burstSeconds);
    filteredRatings.forEach((r) => {
      const key = (r.orderNumber || '').trim().toUpperCase();
      const flags = checkRating(
        r,
        {
          posLoaded,
          inPos: !!key && posSet.has(key),
          posTimeMs: key ? posTimeMs.get(key) : undefined,
          isDuplicate: !!key && (orderCount.get(key) || 0) > 1,
          burstSize: bursts.get(r.id),
        },
        opts
      );
      if (flags.length > 0) result.set(r.id, flags);
    });
    return result;
  }, [filteredRatings, allRatings, posRecords, posOrdersList, selectedDate, lateMinutes]);

  const suspiciousRatings = useMemo(() => {
    return filteredRatings
      .filter((r) => integrityById.has(r.id))
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [filteredRatings, integrityById]);

  // Combined List for Display Table
  const tableRows = useMemo(() => {
    if (posOrdersList.length === 0) return [];

    // Duplicate = the same order number was rated more than once in the system,
    // or appears more than once in the imported POS list. (Being rated once AND
    // being in the POS list is the normal case, not a duplicate.)
    const ratingCount = new Map<string, number>();
    allRatings.forEach(r => {
      if (r.orderNumber) {
        const key = r.orderNumber.trim().toUpperCase();
        ratingCount.set(key, (ratingCount.get(key) || 0) + 1);
      }
    });
    const posCount = new Map<string, number>();
    posOrdersList.forEach(num => {
      const key = num.trim().toUpperCase();
      posCount.set(key, (posCount.get(key) || 0) + 1);
    });
    const isDup = (order: string) => {
      const key = order.trim().toUpperCase();
      return (ratingCount.get(key) || 0) > 1 || (posCount.get(key) || 0) > 1;
    };

    let rows: {
      orderNumber: string;
      status: 'MATCHED' | 'MISSING';
      rating?: RatingRecord;
      posTime?: string;
      isDuplicate?: boolean;
    }[] = [];

    reconciliationData.matched.forEach((m) => {
      const posTime = posOrderTimeMap.get(m.orderNumber.toUpperCase());
      rows.push({ orderNumber: m.orderNumber, status: 'MATCHED', rating: m.rating, posTime, isDuplicate: isDup(m.orderNumber) });
    });

    reconciliationData.missing.forEach((m) => {
      const posTime = posOrderTimeMap.get(m.orderNumber.toUpperCase());
      rows.push({ orderNumber: m.orderNumber, status: 'MISSING', posTime, isDuplicate: isDup(m.orderNumber) });
    });

    // Filter by tab
    if (activeFilter === 'missing') {
      rows = rows.filter((r) => r.status === 'MISSING');
    } else if (activeFilter === 'matched') {
      rows = rows.filter((r) => r.status === 'MATCHED');
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.orderNumber.toLowerCase().includes(q) ||
          r.rating?.cashierName.toLowerCase().includes(q) ||
          r.rating?.counterName.toLowerCase().includes(q) ||
          (r.posTime && r.posTime.toLowerCase().includes(q))
      );
    }

    return rows;
  }, [posOrdersList, reconciliationData, activeFilter, searchQuery, posOrderTimeMap]);

  // Export Reconciliation Report to CSV
  const handleExportCSV = () => {
    if (posOrdersList.length === 0) return;

    let csvContent = '\uFEFF'; // UTF-8 BOM
    csvContent += 'เลขออเดอร์ภายใน (POS),เวลาสั่งซื้อจากระบบ,สถานะการประเมิน,สาขา,พนักงาน,คะแนนความพึงพอใจ,ระดับความพึงพอใจ,วัน-เวลาประเมิน,ผลตรวจความน่าเชื่อถือ\n';

    tableRows.forEach((row) => {
      const order = `"${row.orderNumber.replace(/"/g, '""')}"`;
      const posTime = `"${row.posTime || '-'}"`;
      const status = row.status === 'MATCHED' ? 'ประเมินแล้ว' : 'ตกหล่น (ไม่ปฏิบัติการประเมิน)';
      const counter = row.rating ? `"${row.rating.counterName}"` : '-';
      const cashier = row.rating ? `"${row.rating.cashierName}"` : '-';
      const score = row.rating ? row.rating.score : '-';
      const level = row.rating ? `"${row.rating.level}"` : '-';
      const time = row.rating ? `"${new Date(row.rating.timestamp).toLocaleString('th-TH')}"` : '-';

      const flags = row.rating ? integrityById.get(row.rating.id) || [] : [];
      const flagText = `"${flags.map((f) => (f.detail ? `${f.label} (${f.detail})` : f.label)).join(' / ').replace(/"/g, '""') || '-'}"`;
      csvContent += `${order},${posTime},${status},${counter},${cashier},${score},${level},${time},${flagText}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reconciliation_report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveReport = async () => {
    if (posOrdersList.length === 0 || fromSystem) return;
    if (!selectedBranch || selectedBranch === 'all') {
      alert('กรุณาเลือกสาขาก่อนบันทึกรายงาน');
      return;
    }
    if (!selectedDate) {
      alert('กรุณาเลือกวันที่ก่อนบันทึกรายงาน');
      return;
    }

    if (!window.confirm(`ยืนยันการบันทึกรายงานกระทบยอด POS ของสาขา ${selectedBranch} ประจำวันที่ ${selectedDate} ใช่หรือไม่?\nข้อมูลจะไม่สามารถแก้ไขหรือลบได้ 100%`)) {
      return;
    }

    setIsSaving(true);
    try {
      const newReport: POSReconciliation = {
        id: `rec-${Date.now()}`,
        timestamp: new Date().toISOString(),
        branchName: selectedBranch,
        date: selectedDate,
        posTotal: posOrdersList.length,
        systemTotal: reconciliationData.matched.length,
        difference: reconciliationData.missing.length,
        notes: notes || undefined
      };

      await saveReconciliationRecord(newReport);
      alert(`บันทึกรายงานสำเร็จแล้ว!\nคุณสามารถดูรายงานนี้ได้ในแท็บ "ประวัติรายงานถาวร" โดยเลือกสาขา ${selectedBranch} และวันที่ ${selectedDate}`);
      setNotes('');
      setViewMode('history');
    } catch (e) {
      console.error(e);
      alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadTemplate = () => {
    let csvContent = '\uFEFF'; // UTF-8 BOM
    csvContent += 'หมายเลขลอเดอร์ภายใน,เวลาสั่งซื้อ\n';
    csvContent += '699957,2026/07/28 17:49:07\n';
    csvContent += '699950,2026/07/28 17:44:20\n';
    csvContent += '699945,2026/07/28 17:42:13\n';

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pos_orders_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filter reconciliations based on current selections
  const filteredHistory = useMemo(() => {
    let list = reconciliations;
    if (selectedBranch && selectedBranch !== 'all') {
      list = list.filter(r => matchesBranch(r.branchName, selectedBranch));
    }
    if (selectedDate) {
      list = list.filter(r => r.date === selectedDate);
    }
    return list;
  }, [reconciliations, selectedBranch, selectedDate]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Automatic check against POS bills from the closing report */}
      <AutoPosCheck ratings={ratings} branch={selectedBranch} />

      {/* Header Banner */}
      <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <FileSpreadsheet className="w-6 h-6 text-pink-400" />
            <span>ระบบกระทบเลขออเดอร์ (POS vs การประเมิน)</span>
          </h2>
          <p className="text-xs text-slate-300 mt-1">
            นำเข้าเลขออเดอร์จริงจากระบบ POS / เครื่องพนักงาน เพื่อตรวจสอบว่าออเดอร์ไหนพนักงานไม่ได้ให้ลูกค้าประเมิน
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Branch Filter */}
          <div className="flex items-center space-x-2 bg-slate-900/80 p-2 rounded-xl border border-slate-700">
            <span className="text-xs font-bold text-slate-300 pl-1">สาขา:</span>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              disabled={!!headerBranch && headerBranch !== 'all'}
              title={headerBranch && headerBranch !== 'all' ? 'ใช้สาขาที่เลือกด้านบน' : undefined}
              className="bg-slate-800 text-white text-xs px-3 py-1.5 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-pink-500 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {(!headerBranch || headerBranch === 'all') && <option value="all">ทุกสาขา (All Branches)</option>}
              {Array.from(new Set(counters.map(c => c.branchName))).filter(Boolean).map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* Date Filter */}
          <div className="flex items-center space-x-2 bg-slate-900/80 p-2 rounded-xl border border-slate-700">
            <span className="text-xs font-bold text-slate-300 pl-1">กรองวันที่:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-slate-800 text-white text-xs px-3 py-1.5 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-pink-500"
            />
            {selectedDate && (
              <button
                onClick={() => setSelectedDate('')}
                className="text-xs text-slate-400 hover:text-white px-2"
                title="แสดงทุกวันที่"
              >
                แสดงทั้งหมด
              </button>
            )}
          </div>
        </div>
      </div>

      {/* View Selector Tabs */}
      <div className="flex items-center bg-slate-800 p-1 rounded-2xl border border-slate-700 w-fit">
        <button
          onClick={() => setViewMode('reconcile')}
          className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl text-sm font-bold transition ${
            viewMode === 'reconcile'
              ? 'bg-pink-600 text-white shadow-lg'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <RefreshCw className="w-4 h-4" />
          <span>ตรวจสอบกระทบยอดใหม่</span>
        </button>
        <button
          onClick={() => setViewMode('history')}
          className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl text-sm font-bold transition ${
            viewMode === 'history'
              ? 'bg-pink-600 text-white shadow-lg'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>ประวัติรายงานถาวร</span>
        </button>
      </div>

      {viewMode === 'reconcile' ? (
        <>
          {/* Step 1: Upload / Input / Pull POS Orders */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Method 1: Upload File */}
        <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700 space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2 text-white font-bold text-sm">
              <Upload className="w-4 h-4 text-pink-400" />
              <span>วิธีที่ 1: เพิ่มไฟล์กระทบรายวัน</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              อัพโหลดไฟล์รายงานออเดอร์จากระบบ POS (.csv, .txt) เพื่อตรวจสอบยอดขายประจำวัน
            </p>
          </div>
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-600 hover:border-pink-500 bg-slate-900/50 rounded-xl p-4 cursor-pointer transition">
            <Upload className="w-6 h-6 text-slate-400 mb-1" />
            <span className="text-xs text-slate-200 font-bold">เลือกไฟล์ POS รายวัน</span>
            <span className="text-[10px] text-slate-500 mt-0.5">.csv, .txt, .xlsx</span>
            <input
              type="file"
              accept=".csv,.txt,.xlsx"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
          <button
            onClick={handleDownloadTemplate}
            className="w-full bg-slate-700 hover:bg-slate-600 text-slate-200 py-1.5 rounded-xl text-xs font-medium transition flex items-center justify-center space-x-1.5 border border-slate-600"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-pink-400" />
            <span>ดาวน์โหลดแม่แบบฟอร์ม (Template)</span>
          </button>
          {uploadedFileName && (
            <div className="text-xs bg-pink-500/10 text-pink-300 p-2 rounded-lg border border-pink-500/30 flex items-center justify-between">
              <span className="truncate max-w-[150px]"><strong>{uploadedFileName}</strong></span>
              <span className="font-bold shrink-0">{posOrdersList.length} รายการ</span>
            </div>
          )}
        </div>

        {/* Method 2: Auto Pull from Rating System */}
        <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700 space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2 text-white font-bold text-sm">
              <RefreshCw className="w-4 h-4 text-teal-400" />
              <span>วิธีที่ 2: ดูเลขที่มีใบประเมิน (ไม่ใช่ข้อมูล POS)</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              ใช้ดูรายการเลขที่ลูกค้าประเมิน {selectedDate ? `วันที่ ${selectedDate}` : 'ทุกช่วงเวลา'} เท่านั้น เพราะเทียบกับตัวเองจะตรงกัน 100% เสมอ ถ้าจะกระทบจริงต้องใช้ไฟล์ POS (วิธีที่ 1) หรือแท็บกระทบแบบประเมินในใบปิดยอด
            </p>
          </div>
          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-700 text-center space-y-2">
            <div className="text-xs text-slate-300">
              พบบันทึกเลขออเดอร์ในระบบ: <strong className="text-teal-400 text-sm font-extrabold">{availableSystemOrders.length}</strong> รายการ
            </div>
            <button
              onClick={handlePullSystemOrders}
              className="w-full bg-teal-600 hover:bg-teal-500 text-white py-2 rounded-xl text-xs font-bold transition shadow-sm flex items-center justify-center space-x-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>แสดงเลขจากใบประเมิน</span>
            </button>
          </div>
          <div className="text-[11px] text-slate-500 text-center">
            {selectedDate ? `คำนวณเฉพาะวันที่ ${selectedDate}` : 'กรองตามวันที่เพื่อกระทบเฉพาะวันนั้นๆ'}
          </div>
        </div>

        {/* Method 3: Direct Text Area Input */}
        <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700 space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-white font-bold text-sm">
                <FileCheck className="w-4 h-4 text-indigo-400" />
                <span>วิธีที่ 3: วางเลขออเดอร์โดยตรง</span>
              </div>
              <button
                onClick={() => setIsScannerOpen(true)}
                className="bg-slate-700 hover:bg-slate-600 text-[10px] text-pink-400 font-bold px-2 py-1 rounded-lg border border-slate-600 transition flex items-center space-x-1"
              >
                <Camera className="w-3 h-3" />
                <span>สแกนบาร์โค้ด</span>
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              คัดลอกและวางรายการเลขออเดอร์ POS (1 บรรทัดต่อ 1 ออเดอร์)
            </p>
          </div>
          <textarea
            rows={3}
            value={posInputText}
            onChange={(e) => handleTextareaChange(e.target.value)}
            placeholder="ตัวอย่าง:&#10;ORD-20260728-0001&#10;ORD-20260728-0002"
            className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs font-mono text-slate-200 focus:outline-none focus:ring-2 focus:ring-pink-500"
          />
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>เตรียมกระทบ: <strong className="text-white font-bold">{posOrdersList.length}</strong> รายการ</span>
            {posInputText && (
              <button
                onClick={() => {
                  setPosInputText('');
                  setUploadedFileName('');
                  setFromSystem(false);
                }}
                className="text-rose-400 hover:underline font-semibold"
              >
                ล้างข้อมูล
              </button>
            )}
          </div>
        </div>
      </div>

      {/* KPI & Compliance Metrics */}
      {posOrdersList.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-in zoom-in-95 duration-200">
          {/* Total POS Orders */}
          <div className="bg-slate-800 p-5 rounded-2xl border border-slate-700">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span>ออเดอร์ทั้งหมดจาก POS</span>
              <FileSpreadsheet className="w-4 h-4 text-slate-400" />
            </div>
            <div className="text-2xl font-extrabold text-white mt-2">
              {posOrdersList.length.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              {selectedDate ? `วันที่ ${selectedDate}` : 'ทุกช่วงเวลา'}
            </div>
          </div>

          {/* Evaluated Matched Orders */}
          <div className="bg-slate-800 p-5 rounded-2xl border border-emerald-500/30">
            <div className="flex items-center justify-between text-emerald-400 text-xs font-medium">
              <span>ประเมินสำเร็จ (ให้คะแนน)</span>
              <UserCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-extrabold text-emerald-400 mt-2">
              {reconciliationData.matched.length.toLocaleString()}
            </div>
            <div className="text-[11px] text-emerald-300/80 mt-1">
              มีการบันทึกการประเมินลงระบบ
            </div>
          </div>

          {/* Missing Un-evaluated Orders */}
          <div className="bg-slate-800 p-5 rounded-2xl border border-rose-500/30">
            <div className="flex items-center justify-between text-rose-400 text-xs font-bold">
              <span>ตกหล่น / พนักงานไม่ปฏิบัติ</span>
              <UserX className="w-4 h-4 text-rose-400" />
            </div>
            <div className="text-2xl font-extrabold text-rose-400 mt-2">
              {reconciliationData.missing.length.toLocaleString()}
            </div>
            <div className="text-[11px] text-rose-300/80 mt-1">
              ไม่มีการกดประเมินความพึงพอใจ
            </div>
          </div>

          {/* Compliance Percentage Rate */}
          <div className="bg-slate-800 p-5 rounded-2xl border border-pink-500/30">
            <div className="flex items-center justify-between text-pink-400 text-xs font-medium">
              <span>อัตราการปฏิบัติงาน (Compliance Rate)</span>
              <CheckCircle className="w-4 h-4 text-pink-400" />
            </div>
            <div className="text-2xl font-extrabold text-white mt-2">
              {reconciliationData.complianceRate}%
            </div>
            <div className="w-full bg-slate-700 h-2 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-pink-500 to-rose-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${reconciliationData.complianceRate}%` }}
              />
            </div>
          </div>
        </div>
      )}

          {/* Suspicious ratings: possibly added by staff instead of the customer */}
          {posOrdersList.length > 0 && (
            <div className="bg-slate-800 rounded-2xl border border-amber-500/30 p-5 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                    <ShieldAlert className="w-5 h-5 text-amber-400" />
                    <span>ใบประเมินที่น่าสงสัย ({suspiciousRatings.length.toLocaleString()} ใบ)</span>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-1">
                    เทียบเวลาที่กดประเมินกับเวลาออกบิล POS, เวลาที่ข้อมูลขึ้นเซิร์ฟเวอร์ และการกดรัวจากเคาน์เตอร์/เครื่องเดียวกัน
                    เพื่อหาใบที่อาจไม่ได้ให้ลูกค้ากดเอง
                  </p>
                </div>
                <label className="flex items-center space-x-2 bg-slate-900/80 p-2 rounded-xl border border-slate-700 text-xs text-slate-300 shrink-0">
                  <span className="font-bold">ประเมินช้าเกิน</span>
                  <input
                    type="number"
                    min={1}
                    value={lateMinutes}
                    onChange={(e) => updateLateMinutes(Number(e.target.value))}
                    className="w-16 bg-slate-800 text-white px-2 py-1 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <span>นาทีหลังออกบิล</span>
                </label>
              </div>
              {suspiciousRatings.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-slate-700 max-h-96 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0">
                      <tr className="bg-slate-900 text-slate-300 font-bold border-b border-slate-700">
                        <th className="py-2.5 px-3">เวลาประเมิน</th>
                        <th className="py-2.5 px-3">เลขบิล</th>
                        <th className="py-2.5 px-3">สาขา / พนักงาน</th>
                        <th className="py-2.5 px-3 text-center">คะแนน</th>
                        <th className="py-2.5 px-3">ช่องทาง</th>
                        <th className="py-2.5 px-3">สิ่งที่พบ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/60 text-slate-200">
                      {suspiciousRatings.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-700/40">
                          <td className="py-2.5 px-3 font-mono text-[11px] whitespace-nowrap">
                            {new Date(r.timestamp).toLocaleString('th-TH')}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold">{r.orderNumber || '-'}</td>
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-white">{r.cashierName}</div>
                            <div className="text-[11px] text-slate-400">{r.counterName}</div>
                          </td>
                          <td className="py-2.5 px-3 text-center">⭐ {r.score}</td>
                          <td className="py-2.5 px-3 text-[11px] text-slate-400">
                            {r.source === 'link' ? 'ลิงก์ออนไลน์' : r.source === 'kiosk' ? 'จอหน้าเคาน์เตอร์' : '-'}
                          </td>
                          <td className="py-2.5 px-3">
                            <FlagChips flags={integrityById.get(r.id)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3">
                  ไม่พบใบประเมินที่น่าสงสัยในช่วงที่เลือก
                </div>
              )}
              <p className="text-[10px] text-slate-500">
                * ธงเป็นสัญญาณให้ตรวจต่อ ไม่ใช่ข้อสรุปว่าทุจริต เช่น เน็ตหลุดทำให้ข้อมูลขึ้นระบบช้าได้
                · ใบประเมินที่บันทึกก่อนอัปเดตระบบนี้จะไม่มีเวลาเซิร์ฟเวอร์ จึงตรวจได้เฉพาะเวลาบิลและการกดรัว
              </p>
            </div>
          )}

          {/* Main Reconciliation Table */}
          {posOrdersList.length > 0 ? (
            <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden space-y-4 p-5">
              {/* Controls Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                {/* Filter Tabs */}
                <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-700 w-full sm:w-auto">
                  <button
                    onClick={() => setActiveFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                      activeFilter === 'all'
                        ? 'bg-pink-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    ทั้งหมด ({posOrdersList.length})
                  </button>
                  <button
                    onClick={() => setActiveFilter('missing')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                      activeFilter === 'missing'
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    ⚠️ ตกหล่น/ไม่ประเมิน ({reconciliationData.missing.length})
                  </button>
                  <button
                    onClick={() => setActiveFilter('matched')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                      activeFilter === 'matched'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    ✅ ประเมินสำเร็จ ({reconciliationData.matched.length})
                  </button>
                </div>

                {/* Search & Export Buttons */}
                <div className="flex items-center space-x-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-60">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="ค้นหาเลขออเดอร์, พนักงาน..."
                      className="w-full bg-slate-900 text-white text-xs pl-9 pr-3 py-2 rounded-xl border border-slate-700 focus:outline-none focus:ring-2 focus:ring-pink-500"
                    />
                  </div>

                  <button
                    onClick={handleExportCSV}
                    className="flex items-center space-x-1.5 bg-slate-700 hover:bg-slate-600 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-sm border border-slate-600 shrink-0"
                  >
                    <Download className="w-4 h-4 text-emerald-400" />
                    <span className="hidden sm:inline">ส่งออกรายงาน CSV</span>
                  </button>
                </div>
              </div>

              {fromSystem && (
                <div className="mb-3 flex items-start gap-2 bg-amber-500/10 border border-amber-500/40 text-amber-200 rounded-xl px-4 py-3 text-xs">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                  <span>
                    รายการนี้เป็นเลขจากใบประเมินเอง <strong>ไม่ใช่ข้อมูล POS</strong> จึงตรงกัน 100% เสมอ และไม่มีเวลาออกบิล
                    ใช้ดูรายการได้ แต่ใช้ตรวจว่าตกหล่นหรือประเมินย้อนหลังไม่ได้ และบันทึกเป็นรายงานถาวรไม่ได้
                  </span>
                </div>
              )}

              {/* Table */}
              <div className="overflow-x-auto rounded-xl border border-slate-700">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900 text-slate-400 text-[11px] font-bold border-b border-slate-700 whitespace-nowrap">
                      <th className="py-3 px-4">ลำดับ</th>
                      <th className="py-3 px-4">เลขออเดอร์ภายใน (POS)</th>
                      <th className="py-3 px-4">เวลาสั่งซื้อจากระบบ</th>
                      <th className="py-3 px-4">สถานะการปฏิบัติงาน</th>
                      <th className="py-3 px-4">สาขา / พนักงาน</th>
                      <th className="py-3 px-4 text-center">คะแนนการประเมิน</th>
                      <th className="py-3 px-4">เวลาประเมิน</th>
                      <th className="py-3 px-4">ผลตรวจความน่าเชื่อถือ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/60 text-slate-200">
                    {tableRows.length > 0 ? (
                      tableRows.map((row, idx) => {
                        const opt = row.rating ? RATING_BY_LEVEL.get(row.rating.level) : undefined;
                        const cashier = row.rating && row.rating.cashierName && row.rating.cashierName !== '-' ? row.rating.cashierName : '';
                        return (
                        <tr
                          key={row.orderNumber + idx}
                          className={`hover:bg-slate-700/30 transition-colors ${
                            row.isDuplicate
                              ? 'bg-amber-500/5 shadow-[inset_3px_0_0_0_rgb(245,158,11)]'
                              : row.status === 'MISSING'
                                ? 'bg-rose-500/5 shadow-[inset_3px_0_0_0_rgb(244,63,94)]'
                                : ''
                          }`}
                        >
                          <td className="py-2.5 px-4 text-slate-500 tabular-nums">{idx + 1}</td>
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            <span className="font-mono font-bold text-white">{row.orderNumber}</span>
                            {row.isDuplicate && (
                              <span className="ml-2 inline-flex items-center gap-1 bg-amber-500/15 text-amber-300 text-[10px] px-1.5 py-0.5 rounded border border-amber-500/30 font-bold">
                                <AlertTriangle className="w-3 h-3" />
                                ซ้ำ
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 whitespace-nowrap font-mono text-cyan-300">
                            {row.posTime || <span className="text-slate-600">–</span>}
                          </td>
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            {row.status === 'MATCHED' ? (
                              <span className="inline-flex items-center gap-1 text-emerald-300 text-[11px] font-bold">
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                                ประเมินแล้ว
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-rose-300 text-[11px] font-bold">
                                <XCircle className="w-3.5 h-3.5 text-rose-400" />
                                ไม่ได้ประเมิน
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4">
                            {row.rating ? (
                              <div className="leading-tight">
                                <div className="font-semibold text-white">{row.rating.counterName || '–'}</div>
                                {cashier && <div className="text-[11px] text-slate-400">{cashier}</div>}
                              </div>
                            ) : (
                              <span className="text-slate-600">–</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-center whitespace-nowrap">
                            {row.rating ? (
                              <span className="inline-flex items-center gap-1.5 bg-slate-900/60 px-2.5 py-1 rounded-lg border border-slate-700">
                                <span className="text-base leading-none">{opt?.emoji || '⭐'}</span>
                                <span className="font-bold text-white">{opt?.labelThai || row.rating.level}</span>
                                <span className="text-slate-500 tabular-nums">{row.rating.score}/5</span>
                              </span>
                            ) : (
                              <span className="text-slate-600">–</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 whitespace-nowrap font-mono text-slate-300">
                            {row.rating ? timeOnly(row.rating.timestamp) : <span className="text-slate-600">–</span>}
                          </td>
                          <td className="py-2.5 px-4">
                            {row.rating ? (
                              <FlagChips flags={integrityById.get(row.rating.id)} />
                            ) : (
                              <span className="text-slate-600">–</span>
                            )}
                          </td>
                        </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-400">
                          ไม่พบเลขออเดอร์ตรงกับเงื่อนไขการค้นหา
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Save Report Section */}
              <div className="mt-6 bg-slate-900/50 p-6 rounded-2xl border border-slate-700 space-y-4">
                <div className="flex items-center space-x-2 text-white font-bold">
                  <FileCheck className="w-5 h-5 text-pink-500" />
                  <span>บันทึกรายงานกระทบยอด POS เป็นรายงานถาวร</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1.5">หมายเหตุเพิ่มเติม (ถ้ามี):</label>
                    <textarea 
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="เช่น สาเหตุที่ตกหล่น หรือคำอธิบายเพิ่มเติม..."
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:ring-2 focus:ring-pink-500"
                      rows={2}
                    />
                  </div>
                  <div className="flex flex-col justify-end">
                    <button
                      onClick={handleSaveReport}
                      disabled={isSaving || posOrdersList.length === 0 || fromSystem}
                      className="w-full bg-pink-600 hover:bg-pink-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-pink-900/20 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                    >
                      {isSaving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <FileCheck className="w-5 h-5" />}
                      <span>บันทึกรายงานถาวร (ห้ามลบ/แก้ไข 100%)</span>
                    </button>
                    <p className="text-[10px] text-slate-500 text-center mt-2">
                      * เมื่อบันทึกแล้ว ข้อมูลจะถูกเก็บไว้ในระบบเพื่อใช้เป็นหลักฐานและตรวจสอบย้อนหลัง
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Empty State */
            <div className="bg-slate-800 rounded-2xl p-12 border border-slate-700 text-center space-y-3">
              <div className="w-16 h-16 bg-pink-500/10 text-pink-400 rounded-2xl border border-pink-500/30 flex items-center justify-center mx-auto">
                <FileSpreadsheet className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-white">ยังไม่มีการนำเข้าเลขออเดอร์ POS</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                กรุณาอัพโหลดไฟล์รายงานออเดอร์จากระบบ POS หรือวางเลขออเดอร์ในช่องทางด้านบนเพื่อเริ่มตรวจสอบว่าพนักงานปฏิบัติการประเมินครบทุกออเดอร์หรือไม่
              </p>
              {availableSystemOrders.length > 0 && (
                <div className="pt-2">
                  <button
                    onClick={handlePullSystemOrders}
                    className="bg-teal-600 hover:bg-teal-500 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition shadow flex items-center justify-center space-x-2 mx-auto"
                  >
                    <RefreshCw className="w-4 h-4 animate-spin-once" />
                    <span>ดูเลขจากใบประเมิน ({availableSystemOrders.length} รายการ) · ไม่ใช่ข้อมูล POS</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        /* History View */
        <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
          <div className="p-4 bg-slate-900/50 border-b border-slate-700 flex justify-between items-center">
            <div className="flex flex-col">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <Clock className="w-4 h-4 text-pink-400" />
                <span>ประวัติรายงานกระทบยอดถาวร (Immutable Logs)</span>
              </h3>
              {(selectedBranch !== 'all' || selectedDate) && (
                <div className="flex items-center space-x-2 mt-1">
                  <span className="text-[10px] text-slate-400">
                    กำลังแสดง: {selectedBranch !== 'all' ? `สาขา ${selectedBranch}` : 'ทุกสาขา'} 
                    {selectedDate ? ` วันที่ ${selectedDate}` : ' ทุกวันที่'}
                  </span>
                  <button 
                    onClick={() => {
                      setSelectedBranch('all');
                      setSelectedDate('');
                    }}
                    className="text-[10px] text-pink-400 hover:text-pink-300 underline"
                  >
                    ล้างตัวกรองเพื่อดูทั้งหมด
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900/80 text-slate-400 font-bold uppercase border-b border-slate-700">
                <tr>
                  <th className="px-6 py-4">วันที่สรุป</th>
                  <th className="px-6 py-4">สาขา</th>
                  <th className="px-6 py-4 text-center">ยอด POS</th>
                  <th className="px-6 py-4 text-center">ประเมินแล้ว</th>
                  <th className="px-6 py-4 text-center">ตกหล่น</th>
                  <th className="px-6 py-4 text-center">Compliance Rate</th>
                  <th className="px-6 py-4">บันทึกเมื่อ</th>
                  <th className="px-6 py-4">หมายเหตุ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {filteredHistory.length > 0 ? (
                  filteredHistory.map((rec) => {
                    const rate = rec.posTotal > 0 ? Math.round((rec.systemTotal / rec.posTotal) * 100) : 0;
                    return (
                      <tr key={rec.id} className="hover:bg-slate-700/30 transition">
                        <td className="px-6 py-4 font-bold text-white">{rec.date}</td>
                        <td className="px-6 py-4">{rec.branchName}</td>
                        <td className="px-6 py-4 text-center font-mono">{rec.posTotal}</td>
                        <td className="px-6 py-4 text-center font-mono text-emerald-400">{rec.systemTotal}</td>
                        <td className="px-6 py-4 text-center font-mono text-rose-400">{rec.difference}</td>
                        <td className="px-6 py-4 text-center">
                          <span className={`px-2 py-1 rounded-lg font-bold ${
                            rate >= 90 ? 'bg-emerald-500/20 text-emerald-400' :
                            rate >= 70 ? 'bg-amber-500/20 text-amber-400' :
                            'bg-rose-500/20 text-rose-400'
                          }`}>
                            {rate}%
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-500 font-mono">{formatThaiDate(rec.timestamp, true)}</td>
                        <td className="px-6 py-4 italic text-slate-400 truncate max-w-[200px]" title={rec.notes}>
                          {rec.notes || '-'}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-slate-500">
                      <div className="flex flex-col items-center space-y-2">
                        <span>{reconciliations.length > 0 ? 'ไม่พบข้อมูลที่ตรงกับตัวกรองที่เลือก' : 'ยังไม่มีประวัติการบันทึกรายงานถาวร'}</span>
                        {reconciliations.length > 0 && (
                          <button 
                            onClick={() => {
                              setSelectedBranch('all');
                              setSelectedDate('');
                            }}
                            className="text-pink-400 underline text-xs font-bold"
                          >
                            แสดงข้อมูลทั้งหมด ({reconciliations.length} รายการ)
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* Barcode Scanner Modal */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={(code) => {
          if (posInputText.trim()) {
            handleTextareaChange(posInputText + '\n' + code);
          } else {
            handleTextareaChange(code);
          }
        }}
      />
    </div>
  );
};

const FlagChips: React.FC<{ flags?: IntegrityFlag[] }> = ({ flags }) => {
  if (!flags || flags.length === 0) {
    return <span className="inline-flex items-center gap-1 text-emerald-400 text-[11px] font-bold whitespace-nowrap">✓ ปกติ</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((f) => (
        <span
          key={f.code}
          title={f.detail || f.label}
          className={`whitespace-nowrap px-1.5 py-0.5 rounded text-[10px] font-bold border ${
            f.severity === 'high'
              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
              : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
          }`}
        >
          {f.label}
          {f.detail ? ` · ${f.detail}` : ''}
        </span>
      ))}
    </div>
  );
};
