import React, { useState } from 'react';
import { KeyRound, X, AlertCircle, Check, Eye, EyeOff } from 'lucide-react';
import { SystemSettings } from '../types';
import { checkPin, hashPin, MIN_PIN_LEN } from '../utils/adminAuth';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: SystemSettings;
  onSaveSettings: (updated: Partial<SystemSettings>) => void;
}

export const ChangePasswordModal: React.FC<Props> = ({ isOpen, onClose, settings, onSaveSettings }) => {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  const close = () => {
    setCurrent('');
    setNext('');
    setAgain('');
    setErr('');
    setDone(false);
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (next.length < MIN_PIN_LEN) return setErr(`รหัสผ่านใหม่ต้องมีอย่างน้อย ${MIN_PIN_LEN} ตัว`);
    if (next !== again) return setErr('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน');
    if (next === current) return setErr('รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม');
    setBusy(true);
    try {
      if (!(await checkPin(current, settings))) return setErr('รหัสผ่านปัจจุบันไม่ถูกต้อง');
      // Keep only the hash; clear the old plain-text PIN
      onSaveSettings({ adminPinHash: await hashPin(next), adminPin: '' });
      setDone(true);
      setTimeout(close, 1500);
    } finally {
      setBusy(false);
    }
  };

  const field = (label: string, value: string, set: (v: string) => void, auto: string) => (
    <label className="block space-y-1">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => {
          set(e.target.value);
          setErr('');
        }}
        autoComplete={auto}
        maxLength={32}
        className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-base font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-pink-500"
      />
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={close}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-pink-600" />
            เปลี่ยนรหัสผ่านผู้ดูแลระบบ
          </h3>
          <button type="button" onClick={close} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="ปิด">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {field('รหัสผ่านปัจจุบัน', current, setCurrent, 'current-password')}
          {field(`รหัสผ่านใหม่ (อย่างน้อย ${MIN_PIN_LEN} ตัว)`, next, setNext, 'new-password')}
          {field('ยืนยันรหัสผ่านใหม่', again, setAgain, 'new-password')}
          <button type="button" onClick={() => setShow((v) => !v)} className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1.5">
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
          </button>
          {err && (
            <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 p-3 rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" /> {err}
            </div>
          )}
          {done && (
            <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 p-3 rounded-xl flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" /> เปลี่ยนรหัสผ่านเรียบร้อยแล้ว ใช้รหัสใหม่ในการเข้าครั้งต่อไป
            </div>
          )}
          <p className="text-xs text-slate-500">ใช้ได้ทั้งตัวเลขและตัวอักษร รหัสเดิมจะใช้ไม่ได้ทันทีหลังเปลี่ยน</p>
        </div>
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
          <button type="button" onClick={close} className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 font-semibold hover:bg-slate-100">ยกเลิก</button>
          <button type="submit" disabled={busy || done} className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-bold disabled:opacity-50">บันทึกรหัสผ่านใหม่</button>
        </div>
      </form>
    </div>
  );
};
