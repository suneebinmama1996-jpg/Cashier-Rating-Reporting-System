import React, { useState, useEffect } from 'react';
import { CustomerKiosk } from './components/CustomerKiosk';
import { AdminDashboard } from './components/AdminDashboard';
import { ShareLinksModal } from './components/ShareLinksModal';
import { AdminPinModal } from './components/AdminPinModal';
import { RatingRecord, Counter, SystemSettings } from './types';
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
} from './utils/storage';

export default function App() {
  const [viewMode, setViewMode] = useState<'kiosk' | 'admin'>('kiosk');
  const [ratings, setRatings] = useState<RatingRecord[]>([]);
  const [counters, setCounters] = useState<Counter[]>([]);
  const [activeCounterId, setLocalActiveCounterId] = useState<string>('');
  const [settings, setSettings] = useState<SystemSettings>(getStoredSettings());
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  
  // URL Auth Bypass Logic: If it's a specific branch link, we don't need PIN for admin view
  const isBranchAdminLink = (branchFilter && branchFilter !== 'all') || counterFilter;

  // Sync hash with view mode
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.toLowerCase();
      if (hash === '#admin') {
        setViewMode('admin');
      } else if (hash === '#kiosk' || hash === '') {
        setViewMode('kiosk');
      }
    };

    handleHashChange();

    window.addEventListener('hashchange', handleHashChange);
    
    // Parse branch or counter from URL search params
    try {
      const searchStr = window.location.search || (window.location.hash.includes('?') ? window.location.hash.split('?')[1] : '');
      if (searchStr) {
        const params = new URLSearchParams(searchStr);
        const branchParam = params.get('branch');
        const counterParam = params.get('counter');
        
        if (branchParam) setBranchFilter(branchParam.trim());
        if (counterParam) setCounterFilter(counterParam.trim());
      }
    } catch {
      // Ignore URL parse errors
    }
    
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

    return () => unsubscribeConfig();
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

  const filteredCounters = branchFilter 
    ? (counters.filter(c => c.branchName === branchFilter).length > 0
        ? counters.filter(c => c.branchName === branchFilter)
        : [{ id: `b-url-${branchFilter}`, name: branchFilter, cashierName: '-', branchName: branchFilter, isOnline: true }])
    : counterFilter
      ? counters.filter(c => c.id === counterFilter)
      : counters;

  const filteredRatings = branchFilter
    ? ratings.filter(r => r.branchName === branchFilter)
    : counterFilter
      ? ratings.filter(r => r.counterId === counterFilter)
      : ratings;

  const activeCounter =
    filteredCounters.find((c) => c.id === activeCounterId) ||
    filteredCounters[0] || 
    (branchFilter ? {
      id: `b-url-${branchFilter}`,
      name: branchFilter,
      cashierName: '-',
      branchName: branchFilter,
      isOnline: true,
      isFallbackError: false,
    } : null) ||
    (counterFilter ? {
      id: counterFilter,
      name: `จุดบริการ (${counterFilter})`,
      cashierName: '-',
      branchName: 'สาขาหลัก',
      isOnline: true,
      isFallbackError: false,
    } : null) ||
    counters.find((c) => c.id === activeCounterId) ||
    counters[0] || {
      id: 'c-fallback',
      name: 'สาขา',
      cashierName: '-',
      branchName: branchFilter || (counters.length > 0 ? counters[0].branchName : 'สาขาหลัก'),
      isOnline: true,
      isFallbackError: false,
    };

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
