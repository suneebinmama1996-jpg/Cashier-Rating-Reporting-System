import React, { useState } from 'react';
import { Counter, SystemSettings } from '../types';
import { Store, Plus, Trash2, X, Building, Copy, Check, ExternalLink, Link2 } from 'lucide-react';

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
          {/* Current List with Instant Copy Links */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              สาขาปัจจุบันทั้งหมด ({list.length}) - กดคัดลอกลิงก์แยกได้ทันที
            </h4>
            <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
              {list.map((c) => {
                const kioskLink = getBranchKioskUrl(c.branchName || c.name);
                const isCopied = copiedUrl === `list-${c.id}`;
                return (
                  <div key={c.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 transition">
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
