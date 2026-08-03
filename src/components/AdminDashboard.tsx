import React, { useState, useMemo } from 'react';
import { RatingRecord, Counter, SystemSettings, POSReconciliation } from '../types';
import { DailyReportGraph } from './DailyReportGraph';
import { MonthlyReportGraph } from './MonthlyReportGraph';
import { CounterReport } from './CounterReport';
import { RawDataLog } from './RawDataLog';
import { OrderReconciliation } from './OrderReconciliation';
import { CounterManagementModal } from './CounterManagementModal';
import { SystemSettingsModal } from './SystemSettingsModal';
import { THEMES } from '../constants/theme';
import { useFirestoreStatus } from '../hooks/useFirestoreStatus';
import {
  BarChart2,
  Calendar,
  Store,
  Table,
  ArrowLeft,
  Settings,
  Printer,
  Share2,
  Palette,
  FileSpreadsheet,
  LogOut,
  Lock,
  RefreshCw,
  Wifi,
  WifiOff,
} from 'lucide-react';

interface AdminDashboardProps {
  ratings: RatingRecord[];
  reconciliations: POSReconciliation[];
  counters: Counter[];
  settings: SystemSettings;
  onBackToKiosk: () => void;
  onSaveCounters: (counters: Counter[]) => void;
  onSaveSettings: (updated: Partial<SystemSettings>) => void;
  onOpenShareModal: () => void;
  onResetData: () => void;
  onClearData: () => void;
  onRefreshRatings?: () => Promise<void>;
  branchFilter?: string | null;
  counterFilter?: string | null;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  ratings,
  reconciliations,
  counters,
  settings,
  branchFilter,
  counterFilter,
  onBackToKiosk,
  onSaveCounters,
  onSaveSettings,
  onOpenShareModal,
  onResetData,
  onClearData,
  onRefreshRatings,
}) => {
  const [activeTab, setActiveTab] = useState<'daily' | 'monthly' | 'counter' | 'reconcile' | 'raw'>('daily');
  // If branchFilter is present, default to it and disable changing
  const [selectedBranch, setSelectedBranch] = useState<string>(branchFilter || 'all');
  const [isCounterModalOpen, setIsCounterModalOpen] = useState(false);
  const [isSystemSettingsOpen, setIsSystemSettingsOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const theme = THEMES[settings.themeColor] || THEMES.teal;

  const handlePrint = () => {
    window.print();
  };

  const filteredRatings = useMemo(() => {
    if (!selectedBranch || selectedBranch === 'all') return ratings;
    return ratings.filter((r) => {
      if (r.branchName) return r.branchName === selectedBranch;
      const c = counters.find((counter) => counter.id === r.counterId);
      return c?.branchName === selectedBranch;
    });
  }, [ratings, counters, selectedBranch]);

  const filteredCounters = useMemo(() => {
    if (!selectedBranch || selectedBranch === 'all') return counters;
    return counters.filter((c) => c.branchName === selectedBranch);
  }, [counters, selectedBranch]);

  const { isOnline, lastSync } = useFirestoreStatus();

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-800 pb-12">
      {/* Top Admin Header */}
      <header className="bg-slate-900 text-white sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <button
              onClick={onBackToKiosk}
              className={`flex items-center space-x-2 ${theme.primaryBg} text-white px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-sm`}
            >
              <ArrowLeft className="w-4 h-4" />
              <span>หน้าประเมิน (สำหรับลูกค้า)</span>
            </button>
            <div className="h-6 w-px bg-slate-700 hidden sm:block" />

            {/* Logo and Org Title */}
            <div className="flex items-center space-x-3">
              {settings.logoUrl && (
                <img
                  src={settings.logoUrl}
                  alt="Organization Logo"
                  className="h-10 w-auto max-w-[120px] object-contain rounded-lg bg-white p-1 border border-slate-700"
                />
              )}
              <div>
                <h1 className="text-base sm:text-lg font-bold text-white flex items-center space-x-2">
                  <span>{settings.orgName}</span>
                  <span className={`text-[11px] ${theme.badgeBg} font-medium px-2.5 py-0.5 rounded-full border border-teal-500/30`}>
                    ระบบหลังบ้าน
                  </span>
                </h1>
                <p className="text-xs text-slate-400">
                  รายงานสรุปผลความพึงพอใจการให้บริการพนักงาน
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Sync Status */}
            <div 
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border ${isOnline ? 'bg-emerald-900/40 border-emerald-500/30 text-emerald-400' : 'bg-rose-900/40 border-rose-500/30 text-rose-400'}`}
              title={isOnline ? `เชื่อมต่อระบบคลาวด์เรียลไทม์ (ซิงค์ล่าสุด: ${lastSync?.toLocaleTimeString()})` : 'ไม่สามารถเชื่อมต่อระบบคลาวด์ได้ กำลังพยายามใหม่...'}
            >
              {isOnline ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
              <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:inline">
                {isOnline ? 'Real-time' : 'Offline'}
              </span>
            </div>

            {/* Global Filter Selector */}
            {counterFilter ? (
              <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border bg-fuchsia-900/40 border-fuchsia-500/30">
                <span className="text-xs font-bold text-fuchsia-400">จุดบริการ (ล็อค):</span>
                <div className="text-xs px-2.5 py-1 rounded-lg border bg-fuchsia-950/50 text-fuchsia-300 border-fuchsia-500/30 opacity-90 font-semibold truncate max-w-[150px]">
                  {counters.find(c => c.id === counterFilter)?.name || counterFilter}
                </div>
              </div>
            ) : (
              <div className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border ${branchFilter ? 'bg-emerald-900/40 border-emerald-500/30' : 'bg-slate-800 border-slate-700'}`}>
                <span className={`text-xs font-bold ${branchFilter ? 'text-emerald-400' : 'text-slate-300'}`}>สาขา:</span>
                <select
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  disabled={!!branchFilter}
                  className={`text-xs px-2.5 py-1 rounded-lg border focus:outline-none focus:ring-2 focus:ring-teal-500 font-semibold ${
                    branchFilter ? 'bg-emerald-950/50 text-emerald-300 border-emerald-500/30 opacity-90 cursor-not-allowed' : 'bg-slate-900 text-white border-slate-600'
                  }`}
                >
                  {!branchFilter && <option value="all">ทุกสาขา (All Branches)</option>}
                  {Array.from(new Set(counters.map(c => c.branchName))).filter(Boolean).map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
            )}

            {onRefreshRatings && (
              <button
                onClick={async () => {
                  setIsRefreshing(true);
                  try {
                    await onRefreshRatings();
                  } finally {
                    setIsRefreshing(false);
                  }
                }}
                disabled={isRefreshing}
                className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-xl text-xs font-medium border border-slate-700 transition"
                title="ดึงข้อมูลล่าสุดจากหลังบ้านทันที"
              >
                <RefreshCw className={`w-4 h-4 text-emerald-400 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>รีเฟรชข้อมูล</span>
              </button>
            )}
            {!branchFilter && (
              <>
                <button
                  onClick={onOpenShareModal}
                  className="flex items-center space-x-1.5 bg-teal-600 hover:bg-teal-500 text-white px-3 py-2 rounded-xl text-xs font-bold transition shadow-sm"
                  title="คัดลอกลิงก์แยก Kiosk / Admin"
                >
                  <Share2 className="w-4 h-4" />
                  <span>คัดลอกลิงก์ใช้งานระบบ</span>
                </button>

                <button
                  onClick={() => setIsSystemSettingsOpen(true)}
                  className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-xl text-xs font-medium border border-slate-700 transition"
                  title="ตั้งค่าโลโก้ ชื่อองค์กร และธีมสี"
                >
                  <Palette className="w-4 h-4 text-teal-400" />
                  <span>โลโก้ & ธีมสี</span>
                </button>
              </>
            )}

            <button
              onClick={() => setIsCounterModalOpen(true)}
              className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-xl text-xs font-medium border border-slate-700 transition"
            >
              <Settings className="w-4 h-4 text-indigo-400" />
              <span>ตั้งค่าสาขา</span>
            </button>

            <button
              onClick={handlePrint}
              className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-xl text-xs font-medium border border-slate-700 transition"
              title="พิมพ์สรุปรายงานเป็นเอกสารหรือ PDF"
            >
              <Printer className="w-4 h-4 text-cyan-400" />
              <span className="hidden lg:inline">พิมพ์ (PDF)</span>
            </button>

            <button
              onClick={onBackToKiosk}
              className="flex items-center space-x-1.5 bg-rose-600 hover:bg-rose-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-sm ml-2"
              title="ออกจากระบบผู้ดูแล สลับกลับไปหน้าประเมินสำหรับลูกค้า"
            >
              <LogOut className="w-4 h-4" />
              <span>ออกจากระบบ (Lock)</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation Navigation Bar */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 bg-slate-900 border-t border-slate-800">
          <div className="flex space-x-2 overflow-x-auto py-2 scrollbar-none">
            <button
              onClick={() => setActiveTab('daily')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                activeTab === 'daily'
                  ? `${theme.primaryBg} text-white shadow-sm`
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <BarChart2 className="w-4 h-4" />
              <span>กราฟสรุปรายวัน</span>
            </button>

            <button
              onClick={() => setActiveTab('monthly')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                activeTab === 'monthly'
                  ? `${theme.primaryBg} text-white shadow-sm`
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>กราฟสรุปรายเดือน</span>
            </button>

            <button
              onClick={() => setActiveTab('counter')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                activeTab === 'counter'
                  ? `${theme.primaryBg} text-white shadow-sm`
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Store className="w-4 h-4" />
              <span>สรุปแยกตามสาขา</span>
            </button>

            <button
              onClick={() => setActiveTab('reconcile')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                activeTab === 'reconcile'
                  ? `${theme.primaryBg} text-white shadow-sm`
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 text-pink-400" />
              <span>กระทบเลขออเดอร์ (POS)</span>
            </button>

            <button
              onClick={() => setActiveTab('raw')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                activeTab === 'raw'
                  ? `${theme.primaryBg} text-white shadow-sm`
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Table className="w-4 h-4" />
              <span>ประวัติการประเมิน & Export CSV</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {activeTab === 'daily' && <DailyReportGraph ratings={filteredRatings} counters={counters} />}
        {activeTab === 'monthly' && <MonthlyReportGraph ratings={filteredRatings} counters={counters} />}
        {activeTab === 'counter' && <CounterReport ratings={filteredRatings} counters={filteredCounters} />}
        {activeTab === 'reconcile' && (
          <OrderReconciliation
            ratings={filteredRatings}
            allRatings={ratings}
            reconciliations={reconciliations}
            counters={counters}
            settings={settings}
            selectedBranch={selectedBranch}
          />
        )}
        {activeTab === 'raw' && (
          <RawDataLog
            ratings={filteredRatings}
            allRatings={ratings}
            counters={counters}
            onResetData={onResetData}
            onClearData={onClearData}
          />
        )}
      </main>

      {/* Modal Counter Management */}
      <CounterManagementModal
        isOpen={isCounterModalOpen}
        onClose={() => setIsCounterModalOpen(false)}
        counters={counters}
        settings={settings}
        onSaveCounters={onSaveCounters}
        branchFilter={branchFilter}
      />

      {/* Modal System Settings */}
      <SystemSettingsModal
        isOpen={isSystemSettingsOpen}
        onClose={() => setIsSystemSettingsOpen(false)}
        settings={settings}
        onSaveSettings={onSaveSettings}
      />
    </div>
  );
};
