import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { RatingRecord, Counter, SystemSettings } from '../types';
import { THEMES } from '../constants/theme';
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
} from 'lucide-react';

interface OrderReconciliationProps {
  ratings: RatingRecord[];
  counters: Counter[];
  settings: SystemSettings;
}

interface PosRecord {
  orderNumber: string;
  orderTime?: string;
}

export const OrderReconciliation: React.FC<OrderReconciliationProps> = ({
  ratings,
  counters,
  settings,
}) => {
  const [posRecords, setPosRecords] = useState<PosRecord[]>([]);
  const [posInputText, setPosInputText] = useState<string>('');
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string>(''); // YYYY-MM-DD or empty for all
  const [activeFilter, setActiveFilter] = useState<'all' | 'missing' | 'matched'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const theme = THEMES[settings.themeColor] || THEMES.pink;

  // Handle File Upload (.csv, .txt, .xlsx, .xls)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
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
      const key = orderNum.toUpperCase();
      if (!seen.has(key)) {
        seen.add(key);
        records.push({ orderNumber: orderNum, orderTime });
      }
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
        const key = orderNum.toUpperCase();
        if (!seen.has(key)) {
          seen.add(key);
          records.push({ orderNumber: orderNum, orderTime });
        }
      }
    });

    setPosRecords(records);
  };

  const handleTextareaChange = (text: string) => {
    setPosInputText(text);
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
      list = list.filter((r) => {
        if (r.branchName) return r.branchName === selectedBranch;
        const c = counters.find((counter) => counter.id === r.counterId);
        return c?.branchName === selectedBranch;
      });
    }
    if (selectedDate) {
      list = list.filter((r) => r.timestamp.startsWith(selectedDate));
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
    const records: PosRecord[] = availableSystemOrders.map(o => {
      const match = filteredRatings.find(r => r.orderNumber?.trim().toUpperCase() === o.toUpperCase());
      return {
        orderNumber: o,
        orderTime: match ? new Date(match.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : undefined
      };
    });
    setPosRecords(records);
    setPosInputText(records.map(r => r.orderNumber).join('\n'));
    setUploadedFileName(`ดึงจากระบบประเมิน (${availableSystemOrders.length} ออเดอร์)`);
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

  // Combined List for Display Table
  const tableRows = useMemo(() => {
    if (posOrdersList.length === 0) return [];

    let rows: {
      orderNumber: string;
      status: 'MATCHED' | 'MISSING';
      rating?: RatingRecord;
      posTime?: string;
    }[] = [];

    reconciliationData.matched.forEach((m) => {
      const posTime = posOrderTimeMap.get(m.orderNumber.toUpperCase());
      rows.push({ orderNumber: m.orderNumber, status: 'MATCHED', rating: m.rating, posTime });
    });

    reconciliationData.missing.forEach((m) => {
      const posTime = posOrderTimeMap.get(m.orderNumber.toUpperCase());
      rows.push({ orderNumber: m.orderNumber, status: 'MISSING', posTime });
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
    csvContent += 'เลขออเดอร์ภายใน (POS),เวลาสั่งซื้อจากระบบ,สถานะการประเมิน,สาขา,พนักงาน,คะแนนความพึงพอใจ,ระดับความพึงพอใจ,วัน-เวลาประเมิน\n';

    tableRows.forEach((row) => {
      const order = `"${row.orderNumber.replace(/"/g, '""')}"`;
      const posTime = `"${row.posTime || '-'}"`;
      const status = row.status === 'MATCHED' ? 'ประเมินแล้ว' : 'ตกหล่น (ไม่ปฏิบัติการประเมิน)';
      const counter = row.rating ? `"${row.rating.counterName}"` : '-';
      const cashier = row.rating ? `"${row.rating.cashierName}"` : '-';
      const score = row.rating ? row.rating.score : '-';
      const level = row.rating ? `"${row.rating.level}"` : '-';
      const time = row.rating ? `"${new Date(row.rating.timestamp).toLocaleString('th-TH')}"` : '-';

      csvContent += `${order},${posTime},${status},${counter},${cashier},${score},${level},${time}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reconciliation_report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
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
              className="bg-slate-800 text-white text-xs px-3 py-1.5 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-pink-500"
            >
              <option value="all">ทุกสาขา (All Branches)</option>
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
              <span>วิธีที่ 2: ดึงจากระบบประเมินโดยตรง</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              ดึงเลขออเดอร์ทั้งหมดที่มีการบันทึกในระบบ {selectedDate ? `ประจำวันที่ ${selectedDate}` : 'ทุกช่วงเวลา'}
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
              <span>ดึงเลขออเดอร์จากในระบบทั้งหมด</span>
            </button>
          </div>
          <div className="text-[11px] text-slate-500 text-center">
            {selectedDate ? `คำนวณเฉพาะวันที่ ${selectedDate}` : 'กรองตามวันที่เพื่อกระทบเฉพาะวันนั้นๆ'}
          </div>
        </div>

        {/* Method 3: Direct Text Area Input */}
        <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700 space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2 text-white font-bold text-sm">
              <FileCheck className="w-4 h-4 text-indigo-400" />
              <span>วิธีที่ 3: วางเลขออเดอร์โดยตรง</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              คัดลอกและวางรายการเลขออเดอร์ POS (1 บรรทัดต่อ 1 ออเดอร์)
            </p>
          </div>
          <textarea
            rows={3}
            value={posInputText}
            onChange={(e) => setPosInputText(e.target.value)}
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

          {/* Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-700">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900/80 text-slate-300 font-bold uppercase tracking-wider border-b border-slate-700">
                  <th className="py-3 px-4">ลำดับ</th>
                  <th className="py-3 px-4">เลขออเดอร์ภายใน (POS)</th>
                  <th className="py-3 px-4">เวลาสั่งซื้อจากระบบ</th>
                  <th className="py-3 px-4">สถานะการปฏิบัติงาน</th>
                  <th className="py-3 px-4">สาขา / พนักงาน</th>
                  <th className="py-3 px-4 text-center">คะแนนการประเมิน</th>
                  <th className="py-3 px-4">เวลาประเมิน</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60 text-slate-200">
                {tableRows.length > 0 ? (
                  tableRows.map((row, idx) => (
                    <tr
                      key={row.orderNumber + idx}
                      className={`hover:bg-slate-700/40 transition ${
                        row.status === 'MISSING' ? 'bg-rose-950/20' : ''
                      }`}
                    >
                      <td className="py-3 px-4 text-slate-500">{idx + 1}</td>
                      <td className="py-3 px-4 font-mono font-bold text-white">
                        {row.orderNumber}
                      </td>
                      <td className="py-3 px-4">
                        {row.posTime ? (
                          <span className="font-mono text-cyan-300 bg-cyan-950/40 px-2 py-1 rounded border border-cyan-800/50">
                            {row.posTime}
                          </span>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {row.status === 'MATCHED' ? (
                          <span className="inline-flex items-center space-x-1 bg-emerald-500/20 text-emerald-300 px-2.5 py-1 rounded-full text-[11px] font-bold border border-emerald-500/30">
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                            <span>ประเมินสำเร็จ</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 bg-rose-500/20 text-rose-300 px-2.5 py-1 rounded-full text-[11px] font-bold border border-rose-500/30">
                            <XCircle className="w-3.5 h-3.5 text-rose-400" />
                            <span>ตกหล่น (ไม่ปฏิบัติการประเมิน)</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {row.rating ? (
                          <div>
                            <div className="font-bold text-white">{row.rating.cashierName}</div>
                            <div className="text-[11px] text-slate-400">{row.rating.counterName}</div>
                          </div>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {row.rating ? (
                          <span className="bg-pink-500/20 text-pink-300 font-bold px-2.5 py-1 rounded-lg border border-pink-500/30">
                            ⭐ {row.rating.score} / 5 ({row.rating.level})
                          </span>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-300 font-mono text-[11px]">
                        {row.rating ? (
                          new Date(row.rating.timestamp).toLocaleString('th-TH')
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      ไม่พบเลขออเดอร์ตรงกับเงื่อนไขการค้นหา
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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
                <span>กดดึงเลขออเดอร์ที่ประเมินแล้วในระบบ ({availableSystemOrders.length} รายการ) มากระทบยอดทันที</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
