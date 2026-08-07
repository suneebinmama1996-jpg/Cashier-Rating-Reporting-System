import React, { useMemo, useState } from 'react';
import { RatingRecord, Counter } from '../types';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Store, UserCheck, Award, ThumbsUp, Calendar, X } from 'lucide-react';

interface CounterReportProps {
  ratings: RatingRecord[];
  counters: Counter[];
}

export const CounterReport: React.FC<CounterReportProps> = ({ ratings, counters }) => {
  const [selectedDate, setSelectedDate] = useState<string>('');

  const filteredRatingsByDate = useMemo(() => {
    if (!selectedDate) return ratings;
    return ratings.filter((r) => r.timestamp.startsWith(selectedDate));
  }, [ratings, selectedDate]);

  const counterStats = useMemo(() => {
    return counters.map((counter) => {
      const counterRatings = filteredRatingsByDate.filter((r) => r.counterId === counter.id);
      const total = counterRatings.length;

      const excellent = counterRatings.filter((r) => r.level === 'excellent').length;
      const good = counterRatings.filter((r) => r.level === 'good').length;
      const neutral = counterRatings.filter((r) => r.level === 'neutral').length;
      const poor = counterRatings.filter((r) => r.level === 'poor').length;
      const very_poor = counterRatings.filter((r) => r.level === 'very_poor').length;

      const scoreSum =
        excellent * 5 + good * 4 + neutral * 3 + poor * 2 + very_poor * 1;
      const avgScore = total > 0 ? Number((scoreSum / total).toFixed(2)) : 0;
      const satRate = total > 0 ? Number((((excellent + good) / total) * 100).toFixed(1)) : 0;

      return {
        id: counter.id,
        counterName: counter.name,
        cashierName: counter.cashierName,
        total,
        excellent,
        good,
        neutral,
        poor,
        very_poor,
        avgScore,
        satRate,
      };
    });
  }, [filteredRatingsByDate, counters]);

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-teal-50 rounded-xl text-teal-600">
            <Store className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800">รายงานสรุปประสิทธิภาพแยกตามสาขา</h3>
            <p className="text-xs text-slate-500">เปรียบเทียบคะแนนเฉลี่ยและสัดส่วนผู้ประเมินแต่ละจุดบริการ</p>
          </div>
        </div>

        {/* Date Filter */}
        <div className="flex items-center space-x-2 bg-slate-50 p-2 rounded-xl border border-slate-200 w-full sm:w-auto">
          <Calendar className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-bold text-slate-600 whitespace-nowrap">ระบุวันที่:</span>
          <div className="relative flex-1 sm:flex-initial">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 w-full"
            />
            {selectedDate && (
              <button
                onClick={() => setSelectedDate('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Comparison Chart */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <h4 className="text-sm font-bold text-slate-800 mb-4">
          เปรียบเทียบคะแนนเฉลี่ย (เต็ม 5.00) แต่ละสาขา
        </h4>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={counterStats} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="counterName" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis domain={[0, 5]} tick={{ fontSize: 11, fill: '#64748b' }} />
              <Tooltip
                formatter={(val: any, name: string) => {
                  if (name === 'avgScore') return [`${val} / 5.00`, 'คะแนนเฉลี่ย'];
                  return [val, name];
                }}
              />
              <Bar dataKey="avgScore" name="คะแนนเฉลี่ย" fill="#0f766e" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Counter Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {counterStats.map((stat) => (
          <div
            key={stat.id}
            className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-bold text-slate-800 text-base">{stat.counterName}</h4>
                  <div className="flex items-center space-x-1.5 text-xs text-slate-500 mt-0.5">
                    <UserCheck className="w-3.5 h-3.5 text-teal-600" />
                    <span>ผู้ให้บริการ: {stat.cashierName}</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-extrabold text-teal-800">{stat.avgScore}</span>
                  <span className="text-xs text-slate-400 block">/ 5.00</span>
                </div>
              </div>

              {/* Progress Bar for Satisfaction */}
              <div className="mt-4">
                <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1">
                  <span>อัตราความพึงพอใจ (CSAT)</span>
                  <span className="text-teal-700 font-bold">{stat.satRate}%</span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
                  <div
                    className="bg-emerald-500 h-full"
                    style={{ width: `${(stat.excellent / (stat.total || 1)) * 100}%` }}
                    title="ดีมาก"
                  />
                  <div
                    className="bg-teal-500 h-full"
                    style={{ width: `${(stat.good / (stat.total || 1)) * 100}%` }}
                    title="ดี"
                  />
                  <div
                    className="bg-slate-300 h-full"
                    style={{ width: `${(stat.neutral / (stat.total || 1)) * 100}%` }}
                    title="พอใช้"
                  />
                  <div
                    className="bg-amber-400 h-full"
                    style={{ width: `${(stat.poor / (stat.total || 1)) * 100}%` }}
                    title="แย่"
                  />
                  <div
                    className="bg-rose-500 h-full"
                    style={{ width: `${(stat.very_poor / (stat.total || 1)) * 100}%` }}
                    title="แย่มาก"
                  />
                </div>
              </div>

              <div className="grid grid-cols-5 gap-1 text-center text-[11px] mt-4 pt-3 border-t border-slate-100">
                <div className="bg-emerald-50 p-1.5 rounded-lg">
                  <span className="block font-bold text-emerald-800">{stat.excellent}</span>
                  <span className="text-emerald-600">ดีมาก</span>
                </div>
                <div className="bg-teal-50 p-1.5 rounded-lg">
                  <span className="block font-bold text-teal-800">{stat.good}</span>
                  <span className="text-teal-600">ดี</span>
                </div>
                <div className="bg-slate-100 p-1.5 rounded-lg">
                  <span className="block font-bold text-slate-800">{stat.neutral}</span>
                  <span className="text-slate-600">พอใช้</span>
                </div>
                <div className="bg-amber-50 p-1.5 rounded-lg">
                  <span className="block font-bold text-amber-800">{stat.poor}</span>
                  <span className="text-amber-600">แย่</span>
                </div>
                <div className="bg-rose-50 p-1.5 rounded-lg">
                  <span className="block font-bold text-rose-800">{stat.very_poor}</span>
                  <span className="text-rose-600">แย่มาก</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center text-xs text-slate-500">
              <span>ผู้ประเมินรวม: <strong className="text-slate-800">{stat.total}</strong> ราย</span>
              {stat.satRate >= 90 ? (
                <span className="inline-flex items-center space-x-1 text-emerald-700 font-bold bg-emerald-50 px-2.5 py-0.5 rounded-full">
                  <Award className="w-3.5 h-3.5 text-emerald-600" />
                  <span>ระดับดีเยี่ยม</span>
                </span>
              ) : (
                <span className="inline-flex items-center space-x-1 text-teal-700 bg-teal-50 px-2.5 py-0.5 rounded-full">
                  <ThumbsUp className="w-3.5 h-3.5 text-teal-600" />
                  <span>ระดับดี</span>
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
