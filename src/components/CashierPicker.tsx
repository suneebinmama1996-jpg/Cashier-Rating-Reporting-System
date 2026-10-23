import React, { useEffect, useMemo, useRef, useState } from 'react';
import { UserRound, Search, Camera, Check, ChevronDown } from 'lucide-react';
import { CashierEntry } from '../types';
import { findCashier, searchCashiers } from '../utils/cashiers';
import { BarcodeScannerModal } from './BarcodeScannerModal';

interface CashierPickerProps {
  list: CashierEntry[];
  value: string; // chosen cashier name ('' = none)
  onChange: (name: string) => void;
  language: 'th' | 'en';
}

/**
 * Header control for the cashier on duty. Search by name or employee code,
 * scan a badge with the camera, or type/scan with a USB barcode reader and press Enter.
 */
export const CashierPicker: React.FC<CashierPickerProps> = ({ list, value, onChange, language }) => {
  const t = (th: string, en: string) => (language === 'th' ? th : en);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [error, setError] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasList = list.length > 0;
  const matches = useMemo(() => searchCashiers(list, query), [list, query]);
  const current = hasList ? list.find((c) => c.name === value) : value ? { name: value } : undefined;

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setError('');
    const id = setTimeout(() => inputRef.current?.focus(), 30);
    const onDown = (e: MouseEvent) => {
      if (scanOpen) return;
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open, scanOpen]);

  const pick = (name: string) => {
    onChange(name);
    setOpen(false);
    setError('');
  };

  // Enter or a scan: exact code/name match, or the only search result
  const submit = (raw: string) => {
    const v = raw.trim();
    if (!v) return;
    if (!hasList) return pick(v);
    const hit = findCashier(list, v) || (searchCashiers(list, v).length === 1 ? searchCashiers(list, v)[0] : undefined);
    if (hit) return pick(hit.name);
    setQuery(v);
    setError(t(`ไม่พบ "${v}" ในรายชื่อแคชเชียร์ของสาขานี้`, `"${v}" is not on this branch's cashier list`));
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 bg-slate-100/90 border rounded-xl pl-2.5 pr-2 py-1.5 text-xs font-bold transition ${
          current ? 'border-slate-200 text-slate-800' : 'border-rose-300 text-rose-600 bg-rose-50'
        }`}
        title={t('เลือกแคชเชียร์', 'Choose cashier')}
      >
        <UserRound className={`w-4 h-4 ${current ? 'text-pink-600' : 'text-rose-500'}`} />
        <span className="hidden sm:inline text-slate-500 font-semibold">{t('แคชเชียร์:', 'Cashier:')}</span>
        <span className="max-w-[9rem] truncate">{current ? current.name : t('ยังไม่ได้เลือก', 'Not chosen')}</span>
        {current?.code && <span className="font-mono text-[10px] text-slate-400">{current.code}</span>}
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </button>

      {open && (
        <div className="absolute top-full right-0 sm:left-0 sm:right-auto mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <div className="flex items-center gap-1">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submit(query);
                    if (e.key === 'Escape') setOpen(false);
                  }}
                  placeholder={hasList ? t('ค้นหาชื่อ / รหัส หรือสแกน', 'Search name / code or scan') : t('พิมพ์ชื่อแคชเชียร์ แล้วกด Enter', 'Type cashier name, press Enter')}
                  className="w-full border border-slate-300 rounded-lg pl-8 pr-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-pink-500"
                />
              </div>
              <button
                type="button"
                onClick={() => setScanOpen(true)}
                className="bg-slate-800 hover:bg-slate-700 text-white p-2 rounded-lg"
                title={t('สแกนบัตรพนักงาน', 'Scan staff badge')}
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
            </div>
            {error && <div className="text-[11px] text-rose-600 font-semibold mt-1.5 px-0.5">{error}</div>}
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {hasList ? (
              matches.length ? (
                matches.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => pick(c.name)}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-slate-50 ${c.name === value ? 'bg-pink-50 font-bold text-pink-700' : 'text-slate-700'}`}
                  >
                    <span className="truncate">{c.name}</span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      {c.code && <span className="font-mono text-[11px] text-slate-400">{c.code}</span>}
                      {c.name === value && <Check className="w-3.5 h-3.5" />}
                    </span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-3 text-xs text-slate-400">{t('ไม่พบชื่อที่ค้นหา', 'No match')}</div>
              )
            ) : (
              <div className="px-3 py-2 text-[11px] text-amber-700">
                {t('สาขานี้ยังไม่มีรายชื่อแคชเชียร์ ผู้ดูแลเพิ่มได้ที่ "จัดการสาขา"', 'No cashier list yet. An admin can add one in branch management.')}
                {query.trim() && (
                  <button type="button" onClick={() => submit(query)} className="block mt-2 text-pink-700 font-bold">
                    {t(`ใช้ชื่อ "${query.trim()}"`, `Use "${query.trim()}"`)}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <BarcodeScannerModal
        isOpen={scanOpen}
        onClose={() => setScanOpen(false)}
        onScanSuccess={(code) => {
          setScanOpen(false);
          submit(code);
        }}
      />
    </div>
  );
};
