import React, { useState } from 'react';
import { Counter, SystemSettings } from '../types';
import { Store, Plus, Trash2, X, Building } from 'lucide-react';

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

  // Sync list when counters prop changes
  React.useEffect(() => {
    setList(counters);
  }, [counters]);

  if (!isOpen) return null;

  const handleAdd = () => {
    if (!newName.trim()) return;
    const newCounter: Counter = {
      id: `b-${Date.now()}`,
      name: newName.trim(),
      cashierName: '-',
      branchName: newName.trim(),
      isOnline: true,
    };
    const updated = [...list, newCounter];
    setList(updated);
    onSaveCounters(updated);
    setNewName('');
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

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden">
        <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Building className="w-5 h-5 text-teal-400" />
            <h3 className="font-bold text-lg">จัดการรายชื่อสาขา</h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
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
                className="border border-slate-300 rounded-xl px-3 py-2 text-xs bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>
            <button
              onClick={handleAdd}
              className="w-full flex items-center justify-center space-x-1.5 bg-teal-600 hover:bg-teal-700 text-white py-2 rounded-xl text-xs font-semibold transition"
            >
              <Plus className="w-4 h-4" />
              <span>บันทึกเพิ่มสาขา</span>
            </button>
          </div>

          {/* Current List */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              สาขาปัจจุบัน ({list.length})
            </h4>
            <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200">
              {list.map((c) => (
                <div key={c.id} className="p-3 bg-white flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-800 text-sm">{c.name}</span>
                  </div>
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition"
                    title="ลบสาขานี้"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 text-right">
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
