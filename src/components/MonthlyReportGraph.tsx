import React, { useMemo } from 'react';
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
  Area,
} from 'recharts';
import { RatingRecord, Counter } from '../types';
import { getMonthlyStats } from '../utils/storage';
import { Calendar, Award, TrendingUp, BarChart3 } from 'lucide-react';

interface MonthlyReportGraphProps {
  ratings: RatingRecord[];
  counters: Counter[];
}

export const MonthlyReportGraph: React.FC<MonthlyReportGraphProps> = ({ ratings, counters }) => {
  const [selectedCounter, setSelectedCounter] = React.useState<string>('all');

  const monthlyData = useMemo(() => {
    return getMonthlyStats(ratings, selectedCounter);
  }, [ratings, selectedCounter]);

  const totalMonthlyVotes = monthlyData.reduce((acc, curr) => acc + curr.total, 0);
  const overallAvgScore =
    totalMonthlyVotes > 0
      ? (
          monthlyData.reduce((acc, curr) => acc + curr.avgScore * curr.total, 0) /
          totalMonthlyVotes
        ).toFixed(2)
      : '0.00';

  const bestMonth = useMemo(() => {
    if (!monthlyData.length) return null;
    return [...monthlyData].sort((a, b) => b.satisfactionRate - a.satisfactionRate)[0];
  }, [monthlyData]);

  return (
    <div className="space-y-6">
      {/* Top Filter & Toolbar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-2">
          <Calendar className="w-5 h-5 text-teal-600" />
          <h3 className="text-base font-bold text-slate-800">กราฟรายงานสรุปผลการประเมินรายเดือน</h3>
        </div>

        <div className="flex items-center space-x-2 text-sm">
          <span className="text-slate-500 text-xs font-medium">กรองตามพนักงาน/สาขา:</span>
          <select
            value={selectedCounter}
            onChange={(e) => setSelectedCounter(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
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

      {/* Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500">รวมผู้รับบริการประเมินรายเดือน</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{totalMonthlyVotes.toLocaleString()} ราย</p>
          </div>
          <div className="p-3 bg-teal-50 rounded-xl text-teal-600">
            <BarChart3 className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500">คะแนนเฉลี่ยความพึงพอใจสะสม</p>
            <div className="flex items-baseline space-x-2 mt-1">
              <span className="text-2xl font-bold text-slate-800">{overallAvgScore}</span>
              <span className="text-xs text-slate-400">/ 5.00</span>
            </div>
          </div>
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500">เดือนที่มีความพึงพอใจสูงสุด</p>
            <p className="text-lg font-bold text-teal-800 mt-1">{bestMonth ? bestMonth.monthName : '-'}</p>
            <p className="text-xs text-emerald-600 font-medium">
              {bestMonth ? `CSAT ${bestMonth.satisfactionRate}%` : ''}
            </p>
          </div>
          <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
            <Award className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Main Monthly Chart */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="mb-6">
          <h4 className="text-lg font-bold text-slate-800">
            เปรียบเทียบแนวโน้มความพึงพอใจการให้บริการรายเดือน
          </h4>
          <p className="text-xs text-slate-500">
            แสดงจำนวนการประเมินร่วมกับคะแนนเฉลี่ยรวมย้อนหลัง
          </p>
        </div>

        <div className="h-96 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="monthName" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 5]} tick={{ fontSize: 11, fill: '#0f766e' }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', borderColor: '#cbd5e1' }}
                formatter={(value: any, name: string) => {
                  if (name === 'avgScore') return [`${value} / 5.00`, 'คะแนนเฉลี่ยประจำเดือน'];
                  if (name === 'satisfactionRate') return [`${value}%`, 'อัตราความพึงพอใจ (CSAT)'];
                  if (name === 'total') return [`${value} ราย`, 'ผู้รับบริการรวม'];
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
                name="คะแนนเฉลี่ยประจำเดือน"
                stroke="#0f766e"
                strokeWidth={3.5}
                dot={{ r: 5, fill: '#0f766e' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly Summary Breakdown Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50/50">
          <h4 className="font-bold text-slate-800 text-sm">ตารางสรุปผลการประเมินแยกตามเดือน</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-100 text-slate-700 font-semibold uppercase border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">ประจำเดือน</th>
                <th className="px-4 py-3 text-center">จำนวนรวม (ราย)</th>
                <th className="px-4 py-3 text-center text-emerald-700">ดีมาก (5)</th>
                <th className="px-4 py-3 text-center text-teal-700">ดี (4)</th>
                <th className="px-4 py-3 text-center text-slate-600">พอใช้ (3)</th>
                <th className="px-4 py-3 text-center text-amber-700">แย่ (2)</th>
                <th className="px-4 py-3 text-center text-rose-700">แย่มาก (1)</th>
                <th className="px-4 py-3 text-center">CSAT %</th>
                <th className="px-4 py-3 text-center font-bold">คะแนนเฉลี่ย</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {monthlyData.map((m) => (
                <tr key={m.monthKey} className="hover:bg-slate-50/80 transition">
                  <td className="px-4 py-3 font-medium text-slate-800">{m.monthName}</td>
                  <td className="px-4 py-3 text-center font-bold text-slate-800">{m.total.toLocaleString()}</td>
                  <td className="px-4 py-3 text-center text-emerald-700 font-medium">{m.excellent}</td>
                  <td className="px-4 py-3 text-center text-teal-700 font-medium">{m.good}</td>
                  <td className="px-4 py-3 text-center text-slate-600">{m.neutral}</td>
                  <td className="px-4 py-3 text-center text-amber-700">{m.poor}</td>
                  <td className="px-4 py-3 text-center text-rose-700">{m.very_poor}</td>
                  <td className="px-4 py-3 text-center font-bold text-teal-700">{m.satisfactionRate}%</td>
                  <td className="px-4 py-3 text-center font-bold text-slate-900 bg-slate-50">{m.avgScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
