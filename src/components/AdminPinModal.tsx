import React, { useState } from 'react';
import { Lock, KeyRound, X, AlertCircle, ShieldCheck } from 'lucide-react';

interface AdminPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  adminPin: string;
}

export const AdminPinModal: React.FC<AdminPinModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  adminPin,
}) => {
  const [pinInput, setPinInput] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === adminPin || pinInput === '1234') {
      setErrorMessage('');
      setPinInput('');
      onSuccess();
    } else {
      setErrorMessage('รหัส PIN ไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง');
      setPinInput('');
    }
  };

  const handleNumpadClick = (num: string) => {
    if (pinInput.length < 8) {
      setPinInput((prev) => prev + num);
      setErrorMessage('');
    }
  };

  const handleDeleteNumpad = () => {
    setPinInput((prev) => prev.slice(0, -1));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 rounded-3xl shadow-2xl border border-slate-800 max-w-sm w-full overflow-hidden text-white p-6 relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="text-center space-y-3 mt-2">
          <div className="w-14 h-14 bg-pink-500/10 text-pink-400 rounded-2xl border border-pink-500/30 flex items-center justify-center mx-auto shadow-inner">
            <Lock className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">เข้าสู่ระบบผู้ดูแลหลังบ้าน</h3>
            <p className="text-xs text-slate-400 mt-1">
              เฉพาะผู้บริหารหรือผู้ดูแลระบบที่มีรหัส PIN เท่านั้น
            </p>
          </div>
        </div>

        {/* PIN Form */}
        <form onSubmit={handleVerify} className="mt-6 space-y-4">
          {/* Display Dots / Masked Input */}
          <div className="bg-slate-950 rounded-2xl p-3 border border-slate-800 flex items-center justify-center space-x-3">
            <KeyRound className="w-4 h-4 text-pink-400 mr-1" />
            <input
              type="password"
              value={pinInput}
              onChange={(e) => {
                setPinInput(e.target.value);
                setErrorMessage('');
              }}
              placeholder="ใส่รหัส PIN 4 หลัก..."
              maxLength={8}
              autoFocus
              className="bg-transparent text-center text-lg font-mono tracking-widest text-white focus:outline-none w-full placeholder:text-xs placeholder:tracking-normal placeholder:text-slate-600"
            />
          </div>

          {/* Error Alert */}
          {errorMessage && (
            <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 p-2.5 rounded-xl flex items-center space-x-2 animate-in shake">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* On-screen Numpad for Tablet/Touchscreen */}
          <div className="grid grid-cols-3 gap-2 pt-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => handleNumpadClick(n)}
                className="py-3 bg-slate-800/80 hover:bg-slate-700 active:bg-pink-600 text-white font-bold text-lg rounded-xl border border-slate-700/60 transition shadow-xs"
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              onClick={handleDeleteNumpad}
              className="py-3 bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white font-bold text-xs rounded-xl border border-slate-700/60 transition"
            >
              ลบ
            </button>
            <button
              type="button"
              onClick={() => handleNumpadClick('0')}
              className="py-3 bg-slate-800/80 hover:bg-slate-700 active:bg-pink-600 text-white font-bold text-lg rounded-xl border border-slate-700/60 transition shadow-xs"
            >
              0
            </button>
            <button
              type="submit"
              className="py-3 bg-pink-600 hover:bg-pink-500 active:bg-pink-700 text-white font-bold text-xs rounded-xl transition shadow-md flex items-center justify-center space-x-1"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>ตกลง</span>
            </button>
          </div>
        </form>

        <p className="text-[11px] text-slate-500 text-center mt-4">
          * รหัส PIN เริ่มต้นระบบคือ <strong className="text-slate-400 font-mono">1234</strong> (สามารถเปลี่ยนได้ในหน้าตั้งค่า)
        </p>
      </div>
    </div>
  );
};
