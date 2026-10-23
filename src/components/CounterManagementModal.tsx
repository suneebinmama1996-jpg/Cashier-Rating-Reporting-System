import React, { useState } from 'react';
import { Counter, SystemSettings, CashierEntry } from '../types';
import { cashierEntries, mergeCashiers, parseCashierFile, branchMatches, downloadCashierTemplate, CashierImportRow } from '../utils/cashiers';
import { Store, Plus, Trash2, X, Building, Copy, Check, ExternalLink, Link2, UserRound, FileSpreadsheet, Upload } from 'lucide-react';

interface CounterManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  counters: Counter[];
  settings: SystemSettings;
  onSaveCounters: (counters: Counter[]) => void;
  branchFilter?: string | null;
}

export const CounterManagementModal: React.FC<CounterManagementModalProps> = ({
  isOpen,
  onClose,
  counters,
  settings,
  onSaveCounters,
  branchFilter,
}) => {
  const [list, setList] = useState<Counter[]>(counters);
  const [newName, setNewName] = useState('');
  const [recentlyAddedBranch, setRecentlyAddedBranch] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [cashierDraft, setCashierDraft] = useState<Record<string, string>>({});
  const [codeDraft, setCodeDraft] = useState<Record<string, string>>({});
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Sync list when counters prop changes
  React.useEffect(() => {
    setList(counters);
  }, [counters]);

  if (!isOpen) return null;

  const publicSharedBaseUrl = 'https://ais-pre-te4rx6pbwev3sufbtfprfp-628779573343.asia-southeast1.run.app/';
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const baseUrl = currentOrigin.includes('ais-dev-') ? publicSharedBaseUrl : (currentOrigin + (typeof window !== 'undefined' ? window.location.pathname : ''));

  const getBranchKioskUrl = (branchName: string) => {
    return `${baseUrl.replace(/\/$/, '')}/?branch=${encodeURIComponent(branchName)}#kiosk`;
  };

  const getBranchAdminUrl = (branchName: string) => {
    return `${baseUrl.replace(/\/$/, '')}/?branch=${encodeURIComponent(branchName)}#admin`;
  };

  const handleAdd = () => {
    if (!newName.trim()) return;
    const trimmed = newName.trim();
    const newCounter: Counter = {
      id: `b-${Date.now()}`,
      name: trimmed,
      cashierName: '-',
      branchName: trimmed,
      isOnline: true,
    };
    const updated = [...list, newCounter];
    setList(updated);
    onSaveCounters(updated);
    setNewName('');
    setRecentlyAddedBranch(trimmed);
  };

  const handleDelete = (id: string) => {
    if (list.length <= 1) {
      alert('ต้องมีอย่างน้อย 1 สาขาค่ะ');
      return;
    }
    const updated = list.filter((c) => c.id !== id);
    setList(updated);
    onSaveCounters(updated);
  };

  const updateCashiers = (id: string, entries: CashierEntry[]) => {
    const updated = list.map((c) => (c.id === id ? { ...c, cashiers: entries } : c));
    setList(updated);
    onSaveCounters(updated);
  };

  const handleAddCashier = (c: Counter) => {
    const names = (cashierDraft[c.id] || '')
      .split(/[,\n]/)
      .map((n) => n.trim())
      .filter(Boolean);
    if (!names.length) return;
    const code = (codeDraft[c.id] || '').trim();
    // a code only makes sense for a single name
    const incoming = names.map((name) => ({ name, ...(code && names.length === 1 ? { code } : {}) }));
    updateCashiers(c.id, mergeCashiers(cashierEntries(c), incoming));
    setCashierDraft((d) => ({ ...d, [c.id]: '' }));
    setCodeDraft((d) => ({ ...d, [c.id]: '' }));
  };

  /**
   * Excel import. With a branch column, each row goes to the branch it names
   * (only that branch when importing from a branch's own button).
   * Without one, rows go to the branch whose button was used.
   */
  const handleImport = async (file: File | undefined, only?: Counter) => {
    if (!file) return;
    setImportMsg(null);
    let rows: CashierImportRow[] = [];
    try {
      rows = await parseCashierFile(file);
    } catch {
      setImportMsg({ ok: false, text: 'อ่านไฟล์ไม่ได้ กรุณาใช้ไฟล์ .xlsx, .xls หรือ .csv' });
      return;
    }
    if (!rows.length) {
      setImportMsg({ ok: false, text: 'ไม่พบรายชื่อในไฟล์ ต้องมีคอลัมน์ "ชื่อแคชเชียร์" (ดาวน์โหลดไฟล์ตัวอย่างได้)' });
      return;
    }
    const hasBranch = rows.some((r) => r.branch);
    if (!hasBranch && !only) {
      setImportMsg({ ok: false, text: 'ไฟล์ไม่มีคอลัมน์ "สาขา" กรุณาใส่คอลัมน์สาขา หรือกดนำเข้าจากปุ่มของแต่ละสาขา' });
      return;
    }
    const targets = only ? [only] : list;
    const added: Record<string, CashierEntry[]> = {};
    let unmatched = 0;
    rows.forEach((r) => {
      const c = r.branch ? targets.find((t) => branchMatches(t, r.branch!)) : only;
      if (!c) {
        if (!only) unmatched++;
        return;
      }
      (added[c.id] = added[c.id] || []).push({ name: r.name, ...(r.code ? { code: r.code } : {}) });
    });
    const ids = Object.keys(added);
    if (!ids.length) {
      setImportMsg({ ok: false, text: only ? `ไม่มีแถวของสาขา ${only.name} ในไฟล์` : 'ชื่อสาขาในไฟล์ไม่ตรงกับสาขาในระบบ' });
      return;
    }
    const updated = list.map((c) => (added[c.id] ? { ...c, cashiers: mergeCashiers(cashierEntries(c), added[c.id]) } : c));
    setList(updated);
    onSaveCounters(updated);
    const parts = ids.map((id) => `${list.find((c) => c.id === id)?.name} ${added[id].length} คน`);
    setImportMsg({ ok: true, text: `นำเข้าแล้ว: ${parts.join(', ')}` + (unmatched ? ` · ข้าม ${unmatched} แถวที่ชื่อสาขาไม่ตรง` : '') });
  };

  const handleCopy = (url: string, key: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(key);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-xl w-full overflow-hidden max-h-[90vh] flex flex-col">
        <div className="p-5 bg-slate-900 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center space-x-2">
            <Building className="w-5 h-5 text-teal-400" />
            <h3 className="font-bold text-lg">จัดการรายชื่อสาขา และลิงก์ใช้งานอัตโนมัติ</h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Add New Branch Form */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              เพิ่มสาขาใหม่
            </h4>
            <div className="grid grid-cols-1 gap-2">
              <input
                type="text"
                placeholder="ชื่อสาขา เช่น สาขาเซ็นทรัลเวิลด์"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
                className="border border-slate-300 rounded-xl px-3 py-2 text-xs bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>
            <button
              onClick={handleAdd}
              className="w-full flex items-center justify-center space-x-1.5 bg-teal-600 hover:bg-teal-700 text-white py-2 rounded-xl text-xs font-semibold transition"
            >
              <Plus className="w-4 h-4" />
              <span>บันทึกเพิ่มสาขา และสร้างลิงก์ทันที</span>
            </button>
          </div>

          {/* Recently Added Branch Auto Links Card */}
          {recentlyAddedBranch && (
            <div className="bg-emerald-50 border-2 border-emerald-300 p-4 rounded-2xl space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-emerald-900 font-bold text-sm">
                  <Link2 className="w-4 h-4 text-emerald-600" />
                  <span>ลิงก์แยกอัตโนมัติสำหรับสาขา: "{recentlyAddedBranch}"</span>
                </div>
                <button 
                  onClick={() => setRecentlyAddedBranch(null)}
                  className="text-xs text-emerald-700 hover:text-emerald-900 font-bold"
                >
                  ✕ ซ่อน
                </button>
              </div>

              {/* Kiosk Link */}
              <div className="bg-white p-3 rounded-xl border border-emerald-200 space-y-1.5">
                <div className="text-xs font-bold text-emerald-800">1. ลิงก์หน้าจอประเมิน (Kiosk - สำหรับแท็บเล็ตประจำสาขา):</div>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    readOnly
                    value={getBranchKioskUrl(recentlyAddedBranch)}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-[11px] font-mono text-slate-800 focus:outline-none"
                  />
                  <button
                    onClick={() => handleCopy(getBranchKioskUrl(recentlyAddedBranch), `kiosk-${recentlyAddedBranch}`)}
                    className="flex items-center space-x-1 bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-lg text-xs font-bold transition shrink-0"
                  >
                    {copiedUrl === `kiosk-${recentlyAddedBranch}` ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedUrl === `kiosk-${recentlyAddedBranch}` ? 'คัดลอกแล้ว' : 'คัดลอก'}</span>
                  </button>
                  <a
                    href={getBranchKioskUrl(recentlyAddedBranch)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center space-x-1 bg-slate-900 hover:bg-slate-800 text-white px-2 py-1 rounded-lg text-xs transition shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>เปิด</span>
                  </a>
                </div>
              </div>

              {/* Admin Link */}
              <div className="bg-white p-3 rounded-xl border border-emerald-200 space-y-1.5">
                <div className="text-xs font-bold text-emerald-800">2. ลิงก์หลังบ้าน / รายงาน (Admin Dashboard):</div>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    readOnly
                    value={getBranchAdminUrl(recentlyAddedBranch)}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-[11px] font-mono text-slate-800 focus:outline-none"
                  />
                  <button
                    onClick={() => handleCopy(getBranchAdminUrl(recentlyAddedBranch), `admin-${recentlyAddedBranch}`)}
                    className="flex items-center space-x-1 bg-slate-900 hover:bg-slate-800 text-white px-2.5 py-1 rounded-lg text-xs font-bold transition shrink-0"
                  >
                    {copiedUrl === `admin-${recentlyAddedBranch}` ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedUrl === `admin-${recentlyAddedBranch}` ? 'คัดลอกแล้ว' : 'คัดลอก'}</span>
                  </button>
                  <a
                    href={getBranchAdminUrl(recentlyAddedBranch)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center space-x-1 bg-pink-600 hover:bg-pink-700 text-white px-2 py-1 rounded-lg text-xs transition shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>เปิด</span>
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Cashier Excel import (all branches) */}
          <div className="bg-pink-50/60 p-4 rounded-2xl border border-pink-200 space-y-2.5">
            <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              นำเข้ารายชื่อแคชเชียร์จาก Excel (ทุกสาขาในไฟล์เดียว)
            </h4>
            <p className="text-[11px] text-slate-500">คอลัมน์: สาขา · รหัสพนักงาน (ไม่บังคับ ใช้สแกนบัตร) · ชื่อแคชเชียร์ — ชื่อที่มีอยู่แล้วจะไม่ซ้ำ ถ้ามีรหัสใหม่จะอัปเดตให้</p>
            <div className="flex flex-wrap gap-2">
              <label className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition">
                <Upload className="w-3.5 h-3.5" />
                เลือกไฟล์ Excel
                <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { handleImport(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              <button onClick={() => downloadCashierTemplate(list)} className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold transition">
                ดาวน์โหลดไฟล์ตัวอย่าง
              </button>
            </div>
            {importMsg && (
              <div className={`text-xs font-semibold ${importMsg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{importMsg.text}</div>
            )}
          </div>

          {/* Current List with Instant Copy Links */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              สาขาปัจจุบันทั้งหมด ({list.length}) - กดคัดลอกลิงก์แยกได้ทันที
            </h4>
            <div className="max-h-[28rem] overflow-y-auto divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
              {list.map((c) => {
                const kioskLink = getBranchKioskUrl(c.branchName || c.name);
                const isCopied = copiedUrl === `list-${c.id}`;
                return (
                  <div key={c.id} className="p-3.5 hover:bg-slate-50/80 transition space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="font-bold text-slate-800 text-sm flex items-center space-x-2">
                        <Store className="w-4 h-4 text-teal-600" />
                        <span>{c.name}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono truncate max-w-xs mt-0.5">
                        {kioskLink}
                      </div>
                    </div>
                    <div className="flex items-center space-x-1.5 shrink-0">
                      <button
                        onClick={() => handleCopy(kioskLink, `list-${c.id}`)}
                        className="flex items-center space-x-1 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 px-2.5 py-1.5 rounded-lg text-xs font-bold transition"
                        title="คัดลอกลิงก์เฉพาะสาขานี้"
                      >
                        {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-teal-600" />}
                        <span>{isCopied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}</span>
                      </button>
                      <a
                        href={kioskLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center space-x-1 bg-slate-900 hover:bg-slate-800 text-white px-2 py-1.5 rounded-lg text-xs font-medium transition"
                        title="เปิดหน้าจอ Kiosk สาขานี้ในแท็บใหม่"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>เปิด</span>
                      </a>
                    </div>
                  </div>
                  {/* Cashier names for this branch */}
                  <div className="bg-slate-50 rounded-xl border border-slate-200 p-2.5 space-y-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
                      <UserRound className="w-3.5 h-3.5 text-pink-600" />
                      <span className="flex-1">แคชเชียร์ของสาขานี้ ({cashierEntries(c).length})</span>
                      <label className="flex items-center gap-1 text-emerald-700 hover:text-emerald-900 cursor-pointer font-bold" title="นำเข้าจาก Excel เฉพาะสาขานี้">
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        นำเข้า Excel
                        <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { handleImport(e.target.files?.[0], c); e.target.value = ''; }} />
                      </label>
                    </div>
                    {cashierEntries(c).length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {cashierEntries(c).map((n) => (
                          <span key={n.name} className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-full pl-2.5 pr-1 py-0.5 text-xs font-semibold text-slate-700">
                            {n.code && <span className="font-mono text-[10px] text-slate-400">{n.code}</span>}
                            {n.name}
                            <button
                              onClick={() => updateCashiers(c.id, cashierEntries(c).filter((x) => x.name !== n.name))}
                              className="text-slate-400 hover:text-rose-600 px-1"
                              title={`ลบ ${n.name}`}
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[11px] text-amber-700">ยังไม่มีรายชื่อ หน้าประเมินจะให้พิมพ์ชื่อเองแทนการเลือก</div>
                    )}
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={codeDraft[c.id] || ''}
                        onChange={(e) => setCodeDraft((d) => ({ ...d, [c.id]: e.target.value }))}
                        placeholder="รหัส"
                        className="w-20 border border-slate-300 rounded-lg px-2 py-1 text-xs bg-white font-mono focus:ring-2 focus:ring-teal-500 focus:outline-none"
                      />
                      <input
                        type="text"
                        value={cashierDraft[c.id] || ''}
                        onChange={(e) => setCashierDraft((d) => ({ ...d, [c.id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddCashier(c); }}
                        placeholder="ชื่อแคชเชียร์ (ใส่หลายชื่อคั่นด้วย , ได้)"
                        className="flex-1 min-w-0 border border-slate-300 rounded-lg px-2.5 py-1 text-xs bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
                      />
                      <button
                        onClick={() => handleAddCashier(c)}
                        className="flex items-center gap-1 bg-teal-600 hover:bg-teal-700 text-white px-2.5 py-1 rounded-lg text-xs font-bold transition shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        เพิ่ม
                      </button>
                    </div>
                  </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 transition"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
};
