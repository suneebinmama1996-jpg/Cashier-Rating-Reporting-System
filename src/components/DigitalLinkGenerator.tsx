import React, { useState, useMemo } from 'react';
import { Link2, Copy, Check, ExternalLink, User, Receipt, Globe, Share2, Info, ArrowLeft } from 'lucide-react';
import { Counter, SystemSettings } from '../types';

interface DigitalLinkGeneratorProps {
  counters: Counter[];
  settings: SystemSettings;
  onBack?: () => void;
  defaultBranch?: string | null;
}

export const DigitalLinkGenerator: React.FC<DigitalLinkGeneratorProps> = ({ counters, settings, onBack, defaultBranch }) => {
  const [selectedBranch, setSelectedBranch] = useState<string>(defaultBranch || '');
  const [staffName, setStaffName] = useState<string>('');
  const [posId, setPosId] = useState<string>('');
  const [isCopied, setIsCopied] = useState(false);

  // Get unique branches
  const branches = useMemo(() => {
    const list = Array.from(new Set(counters.map(c => c.branchName))).filter(Boolean);
    if (defaultBranch && !list.includes(defaultBranch)) {
      list.unshift(defaultBranch);
    }
    return list;
  }, [counters, defaultBranch]);

  // Set default branch if not selected
  React.useEffect(() => {
    if (!selectedBranch && branches.length > 0) {
      if (defaultBranch && branches.includes(defaultBranch)) {
        setSelectedBranch(defaultBranch);
      } else {
        // Prefer "Digital" or "Online" branch if exists
        const digitalBranch = branches.find(b => b.toLowerCase().includes('digital') || b.toLowerCase().includes('online'));
        setSelectedBranch(digitalBranch || branches[0]);
      }
    }
  }, [branches, selectedBranch, defaultBranch]);

  const publicSharedBaseUrl = 'https://ais-pre-te4rx6pbwev3sufbtfprfp-628779573343.asia-southeast1.run.app/';
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const baseUrl = currentOrigin.includes('ais-dev-') ? publicSharedBaseUrl : (currentOrigin + (typeof window !== 'undefined' ? window.location.pathname : ''));

  const generatedUrl = useMemo(() => {
    if (!selectedBranch) return '';
    
    let url = `${baseUrl.replace(/\/$/, '')}/?branch=${encodeURIComponent(selectedBranch)}`;
    
    if (posId.trim()) {
      url += `&pos=${encodeURIComponent(posId.trim())}`;
    }
    
    if (staffName.trim()) {
      url += `&staff=${encodeURIComponent(staffName.trim())}`;
    }
    
    url += '#kiosk';
    return url;
  }, [baseUrl, selectedBranch, staffName, posId]);

  const handleCopy = () => {
    if (!generatedUrl) return;
    navigator.clipboard.writeText(generatedUrl);
    setIsCopied(true);
    setTimeout(() => setIsCopied(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition mr-2"
              title="กลับหน้าหลัก"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600">
            <Globe className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800">เครื่องมือสร้างลิงก์ประเมินออนไลน์</h2>
            <p className="text-xs text-slate-500">สร้างลิงก์สำหรับส่งให้ลูกค้าประเมิน (ระบุเลขออเดอร์และชื่อพนักงานล่วงหน้า)</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Section */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 bg-slate-900 text-white font-bold text-sm flex items-center space-x-2">
            <Link2 className="w-4 h-4 text-teal-400" />
            <span>ระบุข้อมูลสำหรับสร้างลิงก์</span>
          </div>
          
          <div className="p-6 space-y-6">
            <div className="space-y-4">
              {/* Branch Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 flex items-center space-x-1">
                  <Globe className="w-3.5 h-3.5" />
                  <span>เลือกสาขาที่ต้องการ (Branch):</span>
                </label>
                <select
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  disabled={!!defaultBranch}
                  className={`w-full border rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none transition ${
                    defaultBranch ? 'bg-slate-100 border-slate-300 text-slate-500 cursor-not-allowed opacity-80' : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                >
                  {branches.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>

              {/* Staff Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 flex items-center space-x-1">
                  <User className="w-3.5 h-3.5" />
                  <span>ชื่อพนักงานผู้ให้บริการ (Staff Name):</span>
                </label>
                <input
                  type="text"
                  placeholder="เช่น พนักงาน A / แอดมิน B"
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition"
                />
              </div>

              {/* POS ID */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 flex items-center space-x-1">
                  <Receipt className="w-3.5 h-3.5" />
                  <span>เลขออเดอร์ / ใบเสร็จ (Order No.):</span>
                </label>
                <input
                  type="text"
                  placeholder="เช่น ORD-20240101-001"
                  value={posId}
                  onChange={(e) => setPosId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition"
                />
              </div>
            </div>

            <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 flex items-start space-x-3">
              <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-800 space-y-1">
                <p className="font-bold">คำแนะนำ:</p>
                <p>เมื่อลูกค้าเปิดลิงก์นี้ ระบบจะล็อคข้อมูลเลขออเดอร์และชื่อพนักงานให้อัตโนมัติ ลูกค้าเพียงแค่กดเลือกคะแนนความพึงพอใจเท่านั้น</p>
              </div>
            </div>
          </div>
        </div>

        {/* Result Section */}
        <div className="bg-slate-900 rounded-3xl border border-slate-800 shadow-xl overflow-hidden flex flex-col">
          <div className="p-4 bg-slate-800 text-white font-bold text-sm flex items-center space-x-2">
            <Share2 className="w-4 h-4 text-pink-400" />
            <span>ผลลัพธ์ลิงก์สำหรับส่งให้ลูกค้า</span>
          </div>
          
          <div className="p-6 flex-1 flex flex-col justify-center space-y-6">
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">ลิงก์ประเมินความพึงพอใจ:</div>
              <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 break-all font-mono text-[11px] text-teal-400 leading-relaxed shadow-inner">
                {generatedUrl || 'กรุณากรอกข้อมูลเพื่อสร้างลิงก์'}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleCopy}
                disabled={!generatedUrl}
                className="flex-1 flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-2xl font-bold transition shadow-lg shadow-indigo-900/20"
              >
                {isCopied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                <span>{isCopied ? 'คัดลอกสำเร็จแล้ว!' : 'คัดลอกลิงก์ส่งให้ลูกค้า'}</span>
              </button>
              
              <a
                href={generatedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center justify-center space-x-2 bg-white hover:bg-slate-100 text-slate-900 py-3 px-6 rounded-2xl font-bold transition shadow-lg ${!generatedUrl ? 'pointer-events-none opacity-50' : ''}`}
              >
                <ExternalLink className="w-5 h-5" />
                <span>ทดสอบเปิดลิงก์</span>
              </a>
            </div>

            <p className="text-center text-[10px] text-slate-500 italic">
              * ลิงก์นี้จะเปิดหน้าจอประเมินในโหมด Kiosk เฉพาะสาขาและข้อมูลที่ระบุ
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
