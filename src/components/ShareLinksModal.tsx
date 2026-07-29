import React, { useState } from 'react';
import { Share2, Copy, Check, ExternalLink, X, Smartphone, ShieldCheck, Link2 } from 'lucide-react';
import { SystemSettings, Counter } from '../types';

interface ShareLinksModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: SystemSettings;
  counters: Counter[];
}

export const ShareLinksModal: React.FC<ShareLinksModalProps> = ({ isOpen, onClose, settings, counters }) => {
  const [copiedType, setCopiedType] = useState<'kiosk' | 'admin' | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<string>('');

  if (!isOpen) return null;

  const publicSharedBaseUrl = 'https://ais-pre-te4rx6pbwev3sufbtfprfp-628779573343.asia-southeast1.run.app/';
  const currentOrigin = window.location.origin;
  
  // Use public share URL if in dev mode or current location origin
  const baseUrl = currentOrigin.includes('ais-dev-') ? publicSharedBaseUrl : (currentOrigin + window.location.pathname);
  
  // URL generation with optional query parameter
  let queryParam = '';
  if (selectedFilter.startsWith('branch:')) {
    queryParam = `?branch=${encodeURIComponent(selectedFilter.replace('branch:', ''))}`;
  } else if (selectedFilter.startsWith('counter:')) {
    queryParam = `?counter=${encodeURIComponent(selectedFilter.replace('counter:', ''))}`;
  }
  
  const kioskUrl = `${baseUrl.replace(/\/$/, '')}/${queryParam}#kiosk`;
  const adminUrl = `${baseUrl.replace(/\/$/, '')}/${queryParam}#admin`;

  const handleCopy = (url: string, type: 'kiosk' | 'admin') => {
    navigator.clipboard.writeText(url);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  // Get unique branches from counters
  const allBranches = Array.from(new Set([
    ...counters.map(c => c.branchName).filter(Boolean)
  ]));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-950 p-5 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-teal-500/20 text-teal-400 rounded-xl border border-teal-500/30">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">ลิงก์แยกการใช้งานระบบ</h3>
              <p className="text-xs text-slate-300">คัดลอกลิงก์สำหรับหน้าจอประเมินฝั่งสาขา และหน้าผู้ดูแลหลังบ้าน</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-lg text-slate-300 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Info Card */}
          <div className="bg-teal-50 p-4 rounded-xl border border-teal-100 flex items-start space-x-3">
            <Info className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
            <p className="text-xs text-teal-800 leading-relaxed">
              หน้านี้สำหรับคัดลอก <strong>"ลิงก์หลัก"</strong> ของระบบเท่านั้น 
              หากต้องการลิงก์แยกรายสาขาที่ล็อคข้อมูลไว้โดยเฉพาะ กรุณาไปที่เมนู 
              <span className="font-bold"> "ตั้งค่าสาขา"</span> เพื่อจัดการและคัดลอกลิงก์รายสาขาได้ทันที
            </p>
          </div>

          {/* Global Kiosk Link */}
          <div className="p-4 rounded-xl bg-teal-50/60 border border-teal-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-teal-900 font-bold text-sm">
                <Smartphone className="w-4 h-4 text-teal-600" />
                <span>1. ลิงก์หน้าจอประเมินรวม (Kiosk - Global)</span>
              </div>
            </div>
            <div className="flex items-center space-x-2 pt-1">
              <input
                type="text"
                readOnly
                value={`${baseUrl.replace(/\/$/, '')}/#kiosk`}
                className="flex-1 bg-white border border-teal-300 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 focus:outline-none"
              />
              <button
                onClick={() => handleCopy(`${baseUrl.replace(/\/$/, '')}/#kiosk`, 'kiosk')}
                className="flex items-center space-x-1.5 bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition shrink-0"
              >
                {copiedType === 'kiosk' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedType === 'kiosk' ? 'คัดลอกแล้ว' : 'คัดลอก'}</span>
              </button>
            </div>
          </div>

          {/* Global Admin Link */}
          <div className="p-4 rounded-xl bg-slate-100/80 border border-slate-300 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-slate-900 font-bold text-sm">
                <ShieldCheck className="w-4 h-4 text-indigo-600" />
                <span>2. ลิงก์หน้าผู้ดูแลระบบรวม (Admin - Global)</span>
              </div>
            </div>
            <div className="flex items-center space-x-2 pt-1">
              <input
                type="text"
                readOnly
                value={`${baseUrl.replace(/\/$/, '')}/#admin`}
                className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 focus:outline-none"
              />
              <button
                onClick={() => handleCopy(`${baseUrl.replace(/\/$/, '')}/#admin`, 'admin')}
                className="flex items-center space-x-1.5 bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition shrink-0"
              >
                {copiedType === 'admin' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedType === 'admin' ? 'คัดลอกแล้ว' : 'คัดลอก'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded-lg transition"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
};
