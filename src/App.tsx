import React, { useState, useEffect, useMemo } from 'react';
import { CustomerKiosk } from './components/CustomerKiosk';
import { AdminDashboard } from './components/AdminDashboard';
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
  getStoredReconciliations,
  subscribeToReconciliations,
} from './utils/storage';

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
  
  const [viewMode, setViewMode] = useState<'kiosk' | 'admin'>('kiosk');
  const [ratings, setRatings] = useState<RatingRecord[]>([]);
  const [reconciliations, setReconciliations] = useState<POSReconciliation[]>(getStoredReconciliations());
  const [counters, setCounters] = useState<Counter[]>([]);
  const [activeCounterId, setLocalActiveCounterId] = useState<string>('');
  const [settings, setSettings] = useState<SystemSettings>(getStoredSettings());
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  
  // URL Auth Bypass Logic
  const isBranchAdminLink = (branchFilter && branchFilter !== 'all') || counterFilter;

  // Sync hash with view mode
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.toLowerCase();
      if (hash.startsWith('#admin')) {
        setViewMode('admin');
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

    // 2. Subscribe to Config (Always active regardless of viewMode)
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
    if (branchFilter) {
      const branchC = counters.filter(c => c.branchName === branchFilter);
      if (branchC.length > 0) return branchC;
      // Fallback for branch URL even if no counters exist yet
      return [{ id: `b-url-${branchFilter}`, name: branchFilter, cashierName: '-', branchName: branchFilter, isOnline: true }];
    }
    if (counterFilter) return counters.filter(c => c.id === counterFilter);
    return counters;
  }, [counters, branchFilter, counterFilter]);

  const filteredRatings = useMemo(() => {
    if (!ratings) return [];
    if (branchFilter) return ratings.filter(r => r.branchName === branchFilter);
    if (counterFilter) return ratings.filter(r => r.counterId === counterFilter);
    return ratings;
  }, [ratings, branchFilter, counterFilter]);

  const filteredReconciliations = useMemo(() => {
    if (!reconciliations) return [];
    if (branchFilter) return reconciliations.filter(r => r.branchName === branchFilter);
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

  const handleRefreshRatings = async () => {
    const fetched = await fetchRatingsFromFirestore();
    setRatings(fetched);
  };

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
      ) : (
        <AdminDashboard
          ratings={filteredRatings}
          reconciliations={filteredReconciliations}
          counters={filteredCounters}
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
