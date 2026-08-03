import React, { useState, useMemo } from 'react';
import { RatingRecord, Counter, RatingLevel } from '../types';
import { formatThaiDate, exportRatingsToCSV, deleteRatingRecord } from '../utils/storage';
import { RATING_OPTIONS } from '../constants/ratingOptions';
import { Download, Search, Filter, RefreshCw, Trash2, FileSpreadsheet, X, Clock, AlertTriangle } from 'lucide-react';

interface RawDataLogProps {
  ratings: RatingRecord[];
  counters: Counter[];
  onResetData: () => void;
  onClearData: () => void;
}

export const RawDataLog: React.FC<RawDataLogProps> = ({
  ratings,
  counters,
  onResetData,
  onClearData,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [filterCounter, setFilterCounter] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  // Calculate duplicate frequencies for order numbers
  const orderFrequencies = useMemo(() => {
    const map = new Map<string, number>();
    ratings.forEach(r => {
      if (r.orderNumber) {
        const key = r.orderNumber.trim().toUpperCase();
        map.set(key, (map.get(key) || 0) + 1);
      }
    });
    return map;
  }, [ratings]);

  const filtered = useMemo(() => {
    return ratings.filter((r) => {
      const matchSearch =
        r.counterName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.cashierName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.orderNumber && r.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchLevel = filterLevel === 'all' || r.level === filterLevel;
      const matchCounter = filterCounter === 'all' || r.counterId === filterCounter;
      
      const rDate = r.timestamp.split('T')[0];
      const matchStartDate = !startDate || rDate >= startDate;
      const matchEndDate = !endDate || rDate <= endDate;

      return matchSearch && matchLevel && matchCounter && matchStartDate && matchEndDate;
    });
  }, [ratings, searchTerm, filterLevel, filterCounter, startDate, endDate]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1;
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filtered.slice(start, start + itemsPerPage);
  }, [filtered, currentPage]);

  const getOptionByLevel = (level: RatingLevel) => {
    return RATING_OPTIONS.find((o) => o.level === level) || RATING_OPTIONS[0];
  };

  return (
    <div className="space-y-6">
      {/* Top Filter and Actions */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="ค้นหาเลขออเดอร์, สาขา, พนักงาน..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-9 pr-3 py-1.5 border border-slate-300 rounded-xl text-xs bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none w-64"
            />
          </div>

          {/* Level Filter */}
          <div className="flex items-center space-x-1 text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={filterLevel}
              onChange={(e) => {
                setFilterLevel(e.target.value);
                setCurrentPage(1);
              }}
              className="border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
            >
              <option value="all">ทุกระดับคะแนน</option>
              {RATING_OPTIONS.map((o) => (
                <option key={o.level} value={o.level}>
                  {o.emoji} {o.labelThai} ({o.score} คะแนน)
                </option>
              ))}
            </select>
          </div>

          {/* Counter Filter */}
          <select
            value={filterCounter}
            onChange={(e) => {
              setFilterCounter(e.target.value);
              setCurrentPage(1);
            }}
            className="border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
          >
            <option value="all">ทุกสาขา</option>
            {counters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Date Filter */}
          <div className="flex items-center space-x-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-transparent text-[11px] font-bold text-slate-700 focus:outline-none"
            />
            <span className="text-slate-400">ถึง</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-transparent text-[11px] font-bold text-slate-700 focus:outline-none"
            />
            {(startDate || endDate) && (
              <button 
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                  setCurrentPage(1);
                }}
                className="text-rose-500 hover:text-rose-600 ml-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Buttons: Export & Data Reset */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => exportRatingsToCSV(filtered)}
            className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl text-xs font-semibold transition shadow-sm"
            title="ดาวน์โหลดเป็นไฟล์ CSV สำหรับเปิดด้วย Microsoft Excel"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>ดาวน์โหลดรายงาน (CSV/Excel)</span>
          </button>

          <button
            onClick={onClearData}
            className="flex items-center space-x-1 border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 px-3 py-2 rounded-xl text-xs transition"
            title="ล้างข้อมูลการประเมินทั้งหมดในระบบ"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">ล้างข้อมูลทั้งหมด</span>
          </button>
        </div>
      </div>

      {/* Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center text-xs text-slate-600">
          <span>แสดงผลรายการประเมินทั้งหมด <strong>{filtered.length}</strong> รายการ</span>
          <span>หน้า {currentPage} จาก {totalPages}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-100/80 text-slate-600 font-semibold uppercase border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">เลขออเดอร์/ใบเสร็จ</th>
                <th className="px-4 py-3">วัน-เวลาประเมิน</th>
                <th className="px-4 py-3">สาขา</th>
                <th className="px-4 py-3">พนักงานพนักงาน</th>
                <th className="px-4 py-3 text-center">ระดับผลการประเมิน</th>
                <th className="px-4 py-3 text-center">คะแนน</th>
                <th className="px-4 py-3 text-center">ลบ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginated.length > 0 ? (
                paginated.map((r) => {
                  const opt = getOptionByLevel(r.level);
                  const isDuplicate = r.orderNumber && (orderFrequencies.get(r.orderNumber.trim().toUpperCase()) || 0) > 1;
                  
                  return (
                    <tr key={r.id} className={`hover:bg-slate-50 transition ${isDuplicate ? 'bg-rose-50/50' : ''}`}>
                      <td className="px-4 py-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-1 rounded border ${isDuplicate ? 'bg-rose-100 text-rose-800 border-rose-300' : 'bg-slate-100 text-slate-800 border-slate-200'}`}>
                            {r.orderNumber || '-'}
                          </span>
                          {isDuplicate && (
                            <span className="text-rose-500" title="พบเลขออเดอร์ซ้ำในระบบ">
                              <AlertTriangle className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-600 whitespace-nowrap">
                        {formatThaiDate(r.timestamp, true)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{r.counterName}</td>
                      <td className="px-4 py-3 text-slate-600">{r.cashierName}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold ${opt.textColor} bg-slate-50 border border-slate-200`}>
                          <span>{opt.emoji}</span>
                          <span>{opt.labelThai}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-extrabold text-slate-800 text-sm">
                        {r.score}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => {
                            if (window.confirm('คุณต้องการลบรายการประเมินนี้ใช่หรือไม่?')) {
                              deleteRatingRecord(r.id);
                            }
                          }}
                          className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition"
                          title="ลบรายการนี้"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    ไม่พบข้อมูลการประเมินตามเงื่อนไขที่เลือก
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition"
            >
              ก่อนหน้า
            </button>

            <span className="text-slate-600">
              หน้า <strong>{currentPage}</strong> / {totalPages}
            </span>

            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition"
            >
              ถัดไป
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
