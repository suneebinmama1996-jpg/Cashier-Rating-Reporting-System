import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Area,
} from 'recharts';
import { RatingRecord, Counter } from '../types';
import { getDailyStats, getHourlyStats } from '../utils/storage';
import { Calendar, Filter, Clock, TrendingUp, BarChart2 } from 'lucide-react';

interface DailyReportGraphProps {
  ratings: RatingRecord[];
  counters: Counter[];
}

export const DailyReportGraph: React.FC<DailyReportGraphProps> = ({ ratings, counters }) => {
  // Date states (default to All Time - starting from a year ago to today)
  const todayIso = new Date().toISOString().slice(0, 10);
  const defaultStartIso = '2024-01-01'; // Default to All Time starting from 2024

  const [startDate, setStartDate] = useState(defaultStartIso);
  const [endDate, setEndDate] = useState(todayIso);
  const [selectedCounter, setSelectedCounter] = useState<string>('all');
  const [viewType, setViewType] = useState<'daily' | 'hourly'>('daily');
  const [singleDayForHourly, setSingleDayForHourly] = useState<string>(todayIso);

  // Daily aggregated dataset
  const dailyData = useMemo(() => {
    return getDailyStats(ratings, startDate, endDate, selectedCounter);
  }, [ratings, startDate, endDate, selectedCounter]);

  // Hourly aggregated dataset
  const hourlyData = useMemo(() => {
    return getHourlyStats(ratings, singleDayForHourly, selectedCounter);
  }, [ratings, singleDayForHourly, selectedCounter]);

  // Calculations for summary metrics
  const totalVotes = dailyData.reduce((acc, curr) => acc + curr.total, 0);
  const avgCsatScore =
    totalVotes > 0
      ? (
          dailyData.reduce((acc, curr) => acc + curr.avgScore * curr.total, 0) /
          totalVotes
        ).toFixed(2)
      : '0.00';

  const totalSatisfied = dailyData.reduce((acc, curr) => acc + curr.excellent + curr.good, 0);
  const satisfactionRate = totalVotes > 0 ? ((totalSatisfied / totalVotes) * 100).toFixed(1) : '0.0';

  // Quick preset filter
  const handlePresetDays = (days: number) => {
    const end = new Date('2026-07-28').toISOString().slice(0, 10);
    const start = new Date(new Date('2026-07-28').getTime() - (days - 1) * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    setStartDate(start);
    setEndDate(end);
    setViewType('daily');
  };

  return (
    <div className="space-y-6">
      {/* Filter Toolbar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-2 bg-slate-100 p-1 rounded-xl text-xs font-medium">
            <button
              onClick={() => setViewType('daily')}
              className={`px-3 py-1.5 rounded-lg transition flex items-center space-x-1 ${
                viewType === 'daily' ? 'bg-white shadow-sm text-teal-700 font-bold' : 'text-slate-600'
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              <span>สรุปรายวัน</span>
            </button>
            <button
              onClick={() => setViewType('hourly')}
              className={`px-3 py-1.5 rounded-lg transition flex items-center space-x-1 ${
                viewType === 'hourly' ? 'bg-white shadow-sm text-teal-700 font-bold' : 'text-slate-600'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>สรุปรายชั่วโมง</span>
            </button>
          </div>

          {viewType === 'daily' ? (
            <div className="flex items-center space-x-2 text-sm text-slate-700">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span>ช่วงวันที่:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border border-slate-300 rounded-lg px-2.5 py-1 text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
              <span>ถึง</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border border-slate-300 rounded-lg px-2.5 py-1 text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>
          ) : (
            <div className="flex items-center space-x-2 text-sm text-slate-700">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span>เลือกวันที่:</span>
              <input
                type="date"
                value={singleDayForHourly}
                onChange={(e) => setSingleDayForHourly(e.target.value)}
                className="border border-slate-300 rounded-lg px-2.5 py-1 text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>
          )}

          {/* Quick Preset Buttons for Daily View */}
          {viewType === 'daily' && (
            <div className="flex items-center space-x-1 text-xs text-slate-500">
              <button
                onClick={() => handlePresetDays(7)}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-md transition"
              >
                7 วัน
              </button>
              <button
                onClick={() => handlePresetDays(14)}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-md transition"
              >
                14 วัน
              </button>
              <button
                onClick={() => handlePresetDays(30)}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-md transition"
              >
                30 วัน
              </button>
            </div>
          )}
        </div>

        {/* Counter Filter */}
        <div className="flex items-center space-x-2 text-sm">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-slate-600 text-xs font-medium">จุดบริการ:</span>
          <select
            value={selectedCounter}
            onChange={(e) => setSelectedCounter(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1 text-xs bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
          >
            <option value="all">ทุกสาขา</option>
            {counters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.cashierName})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Highlight Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500">จำนวนผู้ประเมินรวม</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{totalVotes.toLocaleString()} ราย</p>
          </div>
          <div className="p-3 bg-teal-50 rounded-xl text-teal-600">
            <BarChart2 className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500">คะแนนเฉลี่ยความพึงพอใจ</p>
            <div className="flex items-baseline space-x-2 mt-1">
              <span className="text-2xl font-bold text-slate-800">{avgCsatScore}</span>
              <span className="text-xs text-slate-400">/ 5.00</span>
            </div>
          </div>
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500">อัตราความพึงพอใจ (CSAT)</p>
            <p className="text-2xl font-bold text-teal-700 mt-1">{satisfactionRate}%</p>
            <p className="text-[11px] text-slate-400 mt-0.5">% ของระดับดีมาก + ดี</p>
          </div>
          <div className="p-3 bg-cyan-50 rounded-xl text-cyan-600">
            <span className="text-xl font-black">😊</span>
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      {viewType === 'daily' ? (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-bold text-slate-800">
                กราฟสรุปการประเมินรายวัน ({dailyData.length} วัน)
              </h3>
              <p className="text-xs text-slate-500">
                แสดงจำนวนผู้ประเมินรายวันร่วมกับสัดส่วนระดับความพึงพอใจ
              </p>
            </div>
            <div className="flex items-center space-x-4 text-xs font-medium">
              <span className="flex items-center space-x-1">
                <span className="w-3 h-3 rounded bg-emerald-500" />
                <span className="text-slate-600">ดีมาก (5)</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-3 h-3 rounded bg-teal-500" />
                <span className="text-slate-600">ดี (4)</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-3 h-3 rounded bg-slate-400" />
                <span className="text-slate-600">พอใช้ (3)</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-3 h-3 rounded bg-amber-500" />
                <span className="text-slate-600">แย่ (2)</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-3 h-3 rounded bg-rose-500" />
                <span className="text-slate-600">แย่มาก (1)</span>
              </span>
            </div>
          </div>

          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="dateFormatted" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 5]} tick={{ fontSize: 11, fill: '#0f766e' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', borderColor: '#cbd5e1', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  formatter={(value: any, name: string) => {
                    if (name === 'avgScore') return [`${value} / 5.00`, 'คะแนนเฉลี่ย'];
                    if (name === 'excellent') return [`${value} ราย`, 'ดีมาก'];
                    if (name === 'good') return [`${value} ราย`, 'ดี'];
                    if (name === 'neutral') return [`${value} ราย`, 'พอใช้'];
                    if (name === 'poor') return [`${value} ราย`, 'แย่'];
                    if (name === 'very_poor') return [`${value} ราย`, 'แย่มาก'];
                    return [value, name];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />

                <Bar yAxisId="left" dataKey="excellent" name="ดีมาก" stackId="a" fill="#10b981" />
                <Bar yAxisId="left" dataKey="good" name="ดี" stackId="a" fill="#14b8a6" />
                <Bar yAxisId="left" dataKey="neutral" name="พอใช้" stackId="a" fill="#94a3b8" />
                <Bar yAxisId="left" dataKey="poor" name="แย่" stackId="a" fill="#f59e0b" />
                <Bar yAxisId="left" dataKey="very_poor" name="แย่มาก" stackId="a" fill="#f43f5e" />

                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="avgScore"
                  name="คะแนนเฉลี่ย"
                  stroke="#0f766e"
                  strokeWidth={3}
                  dot={{ r: 4, fill: '#0f766e' }}
                  activeDot={{ r: 6 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        /* Hourly Chart */
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-bold text-slate-800">
                กราฟสรุปช่วงเวลาประจำวัน ({singleDayForHourly})
              </h3>
              <p className="text-xs text-slate-500">
                แสดงจำนวนผู้รับบริการประเมินแยกตามช่วงเวลาเปิดให้บริการ (08:00 - 20:00 น.)
              </p>
            </div>
          </div>

          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', borderColor: '#cbd5e1' }}
                  formatter={(value: any, name: string) => {
                    if (name === 'total') return [`${value} ราย`, 'จำนวนผู้รับบริการทั้งหมด'];
                    if (name === 'excellent') return [`${value} ราย`, 'ดีมาก'];
                    if (name === 'good') return [`${value} ราย`, 'ดี'];
                    return [value, name];
                  }}
                />
                <Bar dataKey="excellent" name="ดีมาก" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="good" name="ดี" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="neutral" name="พอใช้" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="poor" name="แย่" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="very_poor" name="แย่มาก" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};
