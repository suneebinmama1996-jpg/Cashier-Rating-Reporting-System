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
          {/* Global Filter Selector */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <label className="block text-sm font-bold text-slate-800 mb-2">
              เลือกระบุสาขา หรือ จุดบริการ สำหรับแชร์ลิงก์:
            </label>
            <select
              value={selectedFilter}
              onChange={(e) => setSelectedFilter(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="">รวมทุกสาขา และ ทุกจุดบริการ (Default)</option>
              
              <optgroup label="--- แยกลิงก์ตามสาขา (Branch) ---">
                {allBranches.map(b => (
                  <option key={`branch:${b}`} value={`branch:${b}`}>สาขา: {b}</option>
                ))}
              </optgroup>

              <optgroup label="--- แยกลิงก์ตามจุดบริการ (Counter) ---">
                {counters.map(c => (
                  <option key={`counter:${c.id}`} value={`counter:${c.id}`}>จุดบริการ: {c.name} ({c.branchName})</option>
                ))}
              </optgroup>
            </select>
            <p className="text-xs text-slate-500 mt-2">
              เลือกระบุเจาะจงเพื่อล็อคให้ลิงก์นั้นแสดงเฉพาะสาขา หรือ จุดบริการที่เลือกเท่านั้น
            </p>
          </div>

          {/* Kiosk Branch Link */}
          <div className="p-4 rounded-xl bg-teal-50/60 border border-teal-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-teal-900 font-bold text-sm">
                <Smartphone className="w-4 h-4 text-teal-600" />
                <span>1. ลิงก์ฝั่งสาขา / หน้าจอแท็บเล็ตให้คะแนน (Kiosk Only)</span>
              </div>
              <span className="text-[11px] bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full font-medium">
                แสดงเฉพาะหน้าประเมิน
              </span>
            </div>
            <p className="text-xs text-slate-600">
              สำหรับเปิดบน iPad/Tablet ประจำสาขา ล็อคแสดงเฉพาะการให้คะแนน
            </p>
            <div className="flex items-center space-x-2 pt-1">
              <input
                type="text"
                readOnly
                value={kioskUrl}
                className="flex-1 bg-white border border-teal-300 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 selection:bg-teal-200 focus:outline-none"
              />
              <button
                onClick={() => handleCopy(kioskUrl, 'kiosk')}
                className="flex items-center space-x-1.5 bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm shrink-0"
              >
                {copiedType === 'kiosk' ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>คัดลอกแล้ว</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>คัดลอกลิงก์</span>
                  </>
                )}
              </button>
              <a
                href={kioskUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-1 bg-slate-900 hover:bg-slate-800 text-white px-2.5 py-1.5 rounded-lg text-xs font-medium transition shrink-0"
                title="เปิดลิงก์ในแท็บเบราว์เซอร์ใหม่"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">เปิดแท็บใหม่</span>
              </a>
            </div>
          </div>

          {/* Admin Dashboard Link */}
          <div className="p-4 rounded-xl bg-slate-100/80 border border-slate-300 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-slate-900 font-bold text-sm">
                <ShieldCheck className="w-4 h-4 text-indigo-600" />
                <span>2. ลิงก์สำหรับผู้ดูแลระบบหลังบ้าน & รายงาน (Admin Dashboard)</span>
              </div>
              <span className="text-[11px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full font-medium">
                สำหรับผู้บริหาร/แอดมิน
              </span>
            </div>
            <p className="text-xs text-slate-600">
              สำหรับผู้จัดการหรือเจ้าหน้าที่ดูรายงานกราฟ สรุปรายวัน/รายเดือน และส่งออกไฟล์ CSV
            </p>
            <div className="flex items-center space-x-2 pt-1">
              <input
                type="text"
                readOnly
                value={adminUrl}
                className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 focus:outline-none"
              />
              <button
                onClick={() => handleCopy(adminUrl, 'admin')}
                className="flex items-center space-x-1.5 bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm shrink-0"
              >
                {copiedType === 'admin' ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>คัดลอกแล้ว</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>คัดลอกลิงก์</span>
                  </>
                )}
              </button>
              <a
                href={adminUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-1 bg-pink-600 hover:bg-pink-700 text-white px-2.5 py-1.5 rounded-lg text-xs font-medium transition shrink-0"
                title="เปิดลิงก์ในแท็บเบราว์เซอร์ใหม่"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">เปิดแท็บใหม่</span>
              </a>
            </div>
          </div>

          <div className="bg-amber-50 p-3.5 rounded-xl border border-amber-200 text-amber-900 text-xs space-y-1">
            <div className="flex items-center space-x-1.5 font-bold">
              <Link2 className="w-4 h-4 text-amber-600 shrink-0" />
              <span>แนะนำสำหรับการเปิดใช้งานบนอุปกรณ์ภายนอก (iPad/Tablet/มือถือ):</span>
            </div>
            <p className="text-amber-800 text-[11px] leading-relaxed">
              หากต้องการล็อคหน้าจอ Kiosk ให้เปิดเฉพาะจุดบริการที่กำหนด สามารถเลือกระบุ "จุดบริการ" จากรายการด้านบน แล้วคัดลอกลิงก์ไปเปิดที่เครื่องนั้นๆ ได้เลย
            </p>
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
