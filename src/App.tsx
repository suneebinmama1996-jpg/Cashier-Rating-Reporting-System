import React, { useState, useEffect, useMemo } from 'react';
import { CustomerKiosk } from './components/CustomerKiosk';
import { AdminDashboard } from './components/AdminDashboard';
import { DigitalLinkGenerator } from './components/DigitalLinkGenerator';
import { ShareLinksModal } from './components/ShareLinksModal';
import { AdminPinModal } from './components/AdminPinModal';
import { RatingRecord, Counter, SystemSettings, POSReconciliation } from './types';
import {
  getStoredRatings,
  saveRatingRecord,
  deleteRatingRecord,
  getStoredCounters,
  saveCounters,
  getActiveCounterId,
  setActiveCounterId,
  resetRatingsToSample,
  clearAllRatings,
  getStoredSettings,
  saveStoredSettings,
  subscribeToConfig,
  subscribeToRatings,
  fetchRatingsFromFirestore,
  fetchConfigFromFirestore,
  getStoredReconciliations,
  subscribeToReconciliations,
  matchesBranch,
  recordMatchesBranch,
} from './utils/storage';
import { RefreshCw } from 'lucide-react';

export default function App() {
  // 1. Initial State from URL
  const getInitialFilters = () => {
    try {
      const searchStr = window.location.search || (window.location.hash.includes('?') ? window.location.hash.split('?')[1] : '');
      if (searchStr) {
        const params = new URLSearchParams(searchStr);
        return {
          branch: params.get('branch')?.trim() || null,
          counter: params.get('counter')?.trim() || null
        };
      }
    } catch (e) {
      console.error('URL Parse error:', e);
    }
    return { branch: null, counter: null };
  };

  const initialFilters = getInitialFilters();
  const [branchFilter, setBranchFilter] = useState<string | null>(initialFilters.branch);
  const [counterFilter, setCounterFilter] = useState<string | null>(initialFilters.counter);
  
  const [viewMode, setViewMode] = useState<'kiosk' | 'admin' | 'generator'>('kiosk');
  const [ratings, setRatings] = useState<RatingRecord[]>([]);
  const [reconciliations, setReconciliations] = useState<POSReconciliation[]>(getStoredReconciliations());
  const [counters, setCounters] = useState<Counter[]>([]);
  const [activeCounterId, setLocalActiveCounterId] = useState<string>('');
  const [settings, setSettings] = useState<SystemSettings>(getStoredSettings());
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Sync URL params with local filters
  useEffect(() => {
    const handleUrlChange = () => {
      const { branch, counter } = getInitialFilters();
      if (branch !== branchFilter) setBranchFilter(branch);
      if (counter !== counterFilter) setCounterFilter(counter);
    };

    window.addEventListener('popstate', handleUrlChange);
    // Also listen for hash changes that might contain query params
    window.addEventListener('hashchange', handleUrlChange);
    
    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('hashchange', handleUrlChange);
    };
  }, [branchFilter, counterFilter]);

  // URL Auth Bypass Logic
  const isBranchAdminLink = (branchFilter && branchFilter !== 'all') || counterFilter;

  // Sync hash with view mode
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.toLowerCase();
      if (hash.startsWith('#admin')) {
        setViewMode('admin');
      } else if (hash.startsWith('#links')) {
        setViewMode('generator');
      } else {
        setViewMode('kiosk');
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const backToKiosk = () => {
    setViewMode('kiosk');
    window.location.hash = 'kiosk';
  };

  const handleRefreshRatings = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch Ratings
      const fetchedRatings = await fetchRatingsFromFirestore();
      setRatings(fetchedRatings);
      
      // 2. Fetch Config (Counters & Settings)
      const { counters: fetchedCounters, settings: fetchedSettings } = await fetchConfigFromFirestore();
      setCounters(fetchedCounters);
      setSettings(fetchedSettings);
    } catch (e) {
      console.error('Refresh failed:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // 1. Initial local state load
    setRatings(getStoredRatings());
    const storedCounters = getStoredCounters();
    setCounters(storedCounters);
    const actId = getActiveCounterId();
    
    if (storedCounters.some((c) => c.id === actId)) {
      setLocalActiveCounterId(actId);
    } else if (storedCounters.length > 0) {
      setLocalActiveCounterId(storedCounters[0].id);
      setActiveCounterId(storedCounters[0].id);
    }

    // 2. Trigger data recovery from Firestore on mount
    handleRefreshRatings();

    // 3. Subscribe to Config (Always active regardless of viewMode)
    const unsubscribeConfig = subscribeToConfig(
      (updatedCounters) => {
        setCounters(updatedCounters);
        setLocalActiveCounterId((prevActive) => {
          if (updatedCounters.some((c) => c.id === prevActive)) return prevActive;
          return updatedCounters[0]?.id || prevActive;
        });
      },
      (updatedSettings) => setSettings(updatedSettings)
    );

    const unsubscribeRecs = subscribeToReconciliations((updated) => setReconciliations(updated));

    return () => {
      unsubscribeConfig();
      unsubscribeRecs();
    };
  }, []);

  useEffect(() => {
    let unsubscribeRatings: (() => void) | undefined;
    
    // Only subscribe to ratings if we are in admin mode to prevent Kiosk crashes 
    // and quota exhaustion on concurrent kiosk screens
    if (viewMode === 'admin') {
      unsubscribeRatings = subscribeToRatings((updatedRatings) => setRatings(updatedRatings), branchFilter);
    }

    return () => {
      if (unsubscribeRatings) unsubscribeRatings();
    };
  }, [viewMode]);

  // 3. Computed Data with safety checks
  const filteredCounters = useMemo(() => {
    if (!counters) return [];
    
    let result = counters;
    if (branchFilter && branchFilter !== 'all') {
      result = result.filter(c => matchesBranch(c.branchName, branchFilter));
      if (result.length === 0) {
        return [{ id: `b-url-${branchFilter}`, name: branchFilter, cashierName: '-', branchName: branchFilter, isOnline: true }];
      }
    }
    if (counterFilter && counterFilter !== 'all') {
      result = result.filter(c => c.id === counterFilter);
    }
    return result;
  }, [counters, branchFilter, counterFilter]);

  const filteredRatings = useMemo(() => {
    if (!ratings) return [];
    return ratings.filter((r) => {
      // 1. Branch Filter
      if (branchFilter && branchFilter !== 'all') {
        if (!recordMatchesBranch(r, branchFilter, counters)) return false;
      }
      
      // 2. Counter Filter
      if (counterFilter && counterFilter !== 'all') {
        if (r.counterId !== counterFilter) return false;
      }
      
      return true;
    });
  }, [ratings, branchFilter, counterFilter, counters]);

  const filteredReconciliations = useMemo(() => {
    if (!reconciliations) return [];
    if (branchFilter && branchFilter !== 'all') {
      return reconciliations.filter(r => matchesBranch(r.branchName, branchFilter));
    }
    return reconciliations;
  }, [reconciliations, branchFilter]);

  const activeCounter = useMemo(() => {
    if (filteredCounters.length === 0) {
      return {
        id: 'c-loading',
        name: branchFilter || 'กำลังโหลด...',
        cashierName: '-',
        branchName: branchFilter || '...',
        isOnline: true,
        isFallbackError: true
      };
    }
    const found = filteredCounters.find((c) => c.id === activeCounterId);
    return found || filteredCounters[0];
  }, [filteredCounters, activeCounterId, branchFilter]);

  const handleSelectCounter = (id: string) => {
    setLocalActiveCounterId(id);
    setActiveCounterId(id);
  };

  const handleNewRatingSubmitted = async (newRatingData: RatingRecord) => {
    const created = await saveRatingRecord(newRatingData);
    // Local state is already updated via setRatings in subscribeToRatings
    // but we can update it immediately for snappier UI if needed
    setRatings((prev) => {
      if (prev.some(r => r.id === created.id)) return prev;
      return [created, ...prev];
    });
    return created;
  };

  const handleSaveCounters = (updatedCounters: Counter[]) => {
    let newFullCounters = updatedCounters;
    if (branchFilter) {
      // Keep other branches' counters and replace this branch's counters
      const otherBranchesCounters = counters.filter(c => c.branchName !== branchFilter);
      newFullCounters = [...otherBranchesCounters, ...updatedCounters];
    } else if (counterFilter) {
      // Keep other counters and replace this specific counter
      const originalFilteredIds = filteredCounters.map(c => c.id);
      const unchangedCounters = counters.filter(c => !originalFilteredIds.includes(c.id));
      newFullCounters = [...unchangedCounters, ...updatedCounters];
    }
    setCounters(newFullCounters);
    saveCounters(newFullCounters);
  };

  const handleSaveSettings = (updated: Partial<SystemSettings>) => {
    const newSettings = saveStoredSettings(updated);
    setSettings(newSettings);
  };

  const handleResetData = () => {
    if (window.confirm('คุณต้องการล้างข้อมูลการประเมินเพื่อเริ่มต้นใหม่ใช่หรือไม่?')) {
      const refreshed = resetRatingsToSample();
      setRatings(refreshed);
    }
  };

  const handleClearData = async () => {
    if (window.confirm('คุณต้องการล้างข้อมูลการประเมินทั้งหมดในระบบใช่หรือไม่?')) {
      await clearAllRatings();
      setRatings([]);
    }
  };

  if (isLoading && counters.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <RefreshCw className="w-6 h-6 text-teal-600 opacity-20" />
          </div>
        </div>
        <h2 className="mt-6 text-xl font-bold text-slate-800">กำลังเชื่อมต่อฐานข้อมูล...</h2>
        <p className="mt-2 text-slate-500 text-sm">โปรดรอสักครู่ ระบบกำลังดึงข้อมูลล่าสุดของสาขา NUNUH</p>
        <button 
          onClick={handleRefreshRatings}
          className="mt-8 px-6 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 transition shadow-sm flex items-center space-x-2"
        >
          <RefreshCw className="w-4 h-4" />
          <span>ลองใหม่อีกครั้ง (Retry)</span>
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 font-sans antialiased text-slate-800 selection:bg-teal-500 selection:text-white">
      {viewMode === 'kiosk' ? (
        <CustomerKiosk
          activeCounter={activeCounter}
          counters={filteredCounters}
          settings={settings}
          onSelectCounter={handleSelectCounter}
          onNewRatingSubmitted={handleNewRatingSubmitted}
          onOpenAdmin={() => {
            if (isBranchAdminLink) {
              setViewMode('admin');
              window.location.hash = 'admin';
            } else {
              setIsPinModalOpen(true);
            }
          }}
          onOpenShareModal={() => setIsShareModalOpen(true)}
        />
      ) : viewMode === 'admin' ? (
        <AdminDashboard
          ratings={ratings}
          reconciliations={reconciliations}
          counters={counters}
          settings={settings}
          branchFilter={branchFilter}
          counterFilter={counterFilter}
          onBackToKiosk={backToKiosk}
          onSaveCounters={handleSaveCounters}
          onSaveSettings={handleSaveSettings}
          onOpenShareModal={() => setIsShareModalOpen(true)}
          onResetData={handleResetData}
          onClearData={handleClearData}
          onRefreshRatings={handleRefreshRatings}
        />
      ) : (
        <div className="min-h-screen bg-slate-50">
          <div className="max-w-7xl mx-auto px-4 py-8">
            <DigitalLinkGenerator 
              counters={counters} 
              settings={settings} 
              defaultBranch={branchFilter}
              onBack={() => {
                const prevMode = window.location.hash === '#links' ? 'kiosk' : 'admin';
                setViewMode('kiosk');
                window.location.hash = '';
              }}
            />
          </div>
        </div>
      )}

      {/* Admin PIN Modal */}
      <AdminPinModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        adminPin={settings.adminPin || '1234'}
        onSuccess={() => {
          setIsPinModalOpen(false);
          setViewMode('admin');
          window.location.hash = 'admin';
        }}
      />

      {/* Share Links Modal */}
      <ShareLinksModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        settings={settings}
        counters={counters}
      />
    </div>
  );
}
