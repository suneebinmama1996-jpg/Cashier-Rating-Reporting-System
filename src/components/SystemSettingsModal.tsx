import React, { useState } from 'react';
import { SystemSettings, ThemeColor } from '../types';
import { THEMES } from '../constants/theme';
import { Settings, Image, Palette, Building, Upload, Trash2, Check, X, Sparkles, Store, Hospital, Coffee, Lock } from 'lucide-react';

interface SystemSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: SystemSettings;
  onSaveSettings: (updated: Partial<SystemSettings>) => void;
}

const PRESET_LOGOS = [
  {
    name: 'โลโก้ NUH (ชมพู)',
    icon: Sparkles,
    url: '/nuh-logo.svg',
  },
  {
    name: 'ห้างสรรพสินค้า / ซูเปอร์มาร์เก็ต',
    icon: Store,
    url: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=200&auto=format&fit=crop&q=80',
  },
  {
    name: 'โรงพยาบาล / ศูนย์สุขภาพ',
    icon: Hospital,
    url: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=200&auto=format&fit=crop&q=80',
  },
  {
    name: 'คาเฟ่ / ร้านอาหารบริการด่วน',
    icon: Coffee,
    url: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=200&auto=format&fit=crop&q=80',
  },
];

export const SystemSettingsModal: React.FC<SystemSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
}) => {
  const [logoUrl, setLogoUrl] = useState<string | null>(settings.logoUrl);
  const [orgName, setOrgName] = useState<string>(settings.orgName);
  const [themeColor, setThemeColor] = useState<ThemeColor>(settings.themeColor);
  const [adminPin, setAdminPin] = useState<string>(settings.adminPin || '1234');
  const [isSavedNotice, setIsSavedNotice] = useState(false);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('ไฟล์รูปภาพขนาดใหญ่เกินไป กรุณาเลือกไฟล์ขนาดไม่เกิน 2MB');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    onSaveSettings({
      logoUrl,
      orgName,
      themeColor,
      adminPin: adminPin.trim() || '1234',
    });
    setIsSavedNotice(true);
    setTimeout(() => {
      setIsSavedNotice(false);
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-teal-500/20 text-teal-400 rounded-xl border border-teal-500/30">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">ตั้งค่าโลโก้ & โทนสีระบบ</h3>
              <p className="text-xs text-slate-300">ปรับแต่งอัตลักษณ์องค์กร ชื่อสาขา และธีมสีสำหรับการแสดงผล</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-lg text-slate-300 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Section 1: Organization Name */}
          <div className="space-y-2">
            <label className="flex items-center space-x-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
              <Building className="w-4 h-4 text-teal-600" />
              <span>1. ชื่อหน่วยงาน / ชื่อองค์กรหลัก</span>
            </label>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="ระบุชื่อหน่วยงาน หรือ ชื่อองค์กร..."
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition"
            />
          </div>

          <hr className="border-slate-200" />

          {/* Section 2: Logo Configuration */}
          <div className="space-y-3">
            <label className="flex items-center space-x-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
              <Image className="w-4 h-4 text-teal-600" />
              <span>2. โลโก้องค์กร / ร้านค้า</span>
            </label>

            <div className="flex flex-col sm:flex-row items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
              {/* Logo Preview */}
              <div className="w-20 h-20 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center overflow-hidden shrink-0 relative group">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="w-full h-full object-contain p-1" />
                ) : (
                  <div className="text-center p-2 text-slate-400">
                    <Store className="w-8 h-8 mx-auto text-slate-300" />
                    <span className="text-[10px] block mt-1">โลโก้เริ่มต้น</span>
                  </div>
                )}
              </div>

              {/* Logo Controls */}
              <div className="flex-1 space-y-2 text-center sm:text-left">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <label className="flex items-center space-x-2 bg-teal-600 hover:bg-teal-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer transition shadow-sm">
                    <Upload className="w-4 h-4" />
                    <span>อัปโหลดรูปโลโก้</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>

                  {logoUrl && (
                    <button
                      onClick={() => setLogoUrl(null)}
                      className="flex items-center space-x-1 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 px-3 py-2 rounded-xl text-xs font-medium transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>ลบโลโก้</span>
                    </button>
                  )}
                </div>

                <p className="text-[11px] text-slate-500">
                  รองรับไฟล์ PNG, JPG, WebP หรือ SVG (แนะนำอัตราส่วนสี่เหลี่ยมจัตุรัส ไม่เกิน 2MB)
                </p>
              </div>
            </div>

            {/* Presets */}
            <div className="space-y-1.5 pt-1">
              <span className="text-xs text-slate-500 font-medium">หรือเลือกใช้โลโก้ตัวอย่าง:</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {PRESET_LOGOS.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => setLogoUrl(preset.url)}
                    className="flex items-center space-x-2.5 p-2 rounded-xl border border-slate-200 bg-white hover:border-teal-400 text-left transition"
                  >
                    <img src={preset.url} alt={preset.name} className="w-8 h-8 rounded-lg object-cover" />
                    <span className="text-[11px] font-semibold text-slate-700 line-clamp-1">
                      {preset.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <hr className="border-slate-200" />

          {/* Section 3: Color Theme Selection */}
          <div className="space-y-3">
            <label className="flex items-center space-x-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
              <Palette className="w-4 h-4 text-teal-600" />
              <span>3. ธีมโทนสีระบบ (Theme Accent)</span>
            </label>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
              {(Object.keys(THEMES) as ThemeColor[]).map((tKey) => {
                const theme = THEMES[tKey];
                const isSelected = themeColor === tKey;
                return (
                  <button
                    key={tKey}
                    onClick={() => setThemeColor(tKey)}
                    className={`relative flex items-center space-x-2.5 p-3 rounded-xl border transition text-left ${
                      isSelected
                        ? 'border-teal-600 bg-teal-50/70 shadow-sm ring-2 ring-teal-500/30'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <span className={`w-6 h-6 rounded-full shrink-0 ${theme.colorSwatch} shadow-sm border border-black/10`} />
                    <span className="text-xs font-bold text-slate-800 truncate">
                      {theme.nameThai.split(' ')[0]}
                    </span>
                    {isSelected && (
                      <Check className="w-4 h-4 text-teal-600 absolute right-2 top-2" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <hr className="border-slate-200" />

          {/* Section 4: Admin PIN Security */}
          <div className="space-y-3">
            <label className="flex items-center space-x-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
              <Lock className="w-4 h-4 text-pink-600" />
              <span>4. รหัส PIN สำหรับเข้าสู่ระบบหลังบ้าน (Admin PIN)</span>
            </label>
            <p className="text-xs text-slate-500">
              รหัสผ่านสำหรับเข้าสู่หน้าบริหารจัดการและรายงาน ป้องกันพนักงานเข้าถึงโดยไม่ได้รับอนุญาต
            </p>
            <input
              type="text"
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value)}
              placeholder="ระบุ PIN เช่น 1234..."
              maxLength={8}
              className="w-full max-w-xs bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-pink-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 font-medium">
            {isSavedNotice && (
              <span className="text-emerald-600 font-bold flex items-center space-x-1 animate-in fade-in">
                <Check className="w-4 h-4" />
                <span>บันทึกการตั้งค่าเรียบร้อยแล้ว</span>
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded-xl transition"
            >
              ยกเลิก
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl transition shadow-sm flex items-center space-x-1.5"
            >
              <Check className="w-4 h-4" />
              <span>บันทึกการเปลี่ยนแปลง</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
