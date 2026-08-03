import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { RATING_OPTIONS } from '../constants/ratingOptions';
import { RatingOption, Counter, RatingRecord, SystemSettings } from '../types';
import { THEMES } from '../constants/theme';
import { soundManager } from '../utils/sound';
import { Heart, ThumbsUp, Sparkles, CheckCircle2, Volume2, VolumeX, Store, Receipt, Lock, Maximize, Minimize, Camera } from 'lucide-react';
import { BarcodeScannerModal } from './BarcodeScannerModal';

interface CustomerKioskProps {
  activeCounter: Counter;
  counters: Counter[];
  settings: SystemSettings;
  onSelectCounter: (counterId: string) => void;
  onNewRatingSubmitted: (rating: RatingRecord) => void;
  onOpenAdmin?: () => void;
  onOpenShareModal?: () => void;
}

export const CustomerKiosk: React.FC<CustomerKioskProps> = ({
  activeCounter,
  counters,
  settings,
  onSelectCounter,
  onNewRatingSubmitted,
  onOpenAdmin,
  onOpenShareModal,
}) => {
  const [selectedRating, setSelectedRating] = useState<RatingOption | null>(null);
  const [isThankYouShown, setIsThankYouShown] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [counterMenuOpen, setCounterMenuOpen] = useState(false);

  const [language, setLanguage] = useState<'th' | 'en'>('th');

  const theme = THEMES[settings.themeColor] || THEMES.teal;

  // Cashier Order Number State
  const [orderNumber, setOrderNumber] = useState<string>('');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [lastSubmittedOrder, setLastSubmittedOrder] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    soundManager.setSoundEnabled(soundEnabled);
  }, [soundEnabled]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  useEffect(() => {
    // Read order or orderNumber from URL params if provided
    try {
      const searchStr = window.location.search || (window.location.hash.includes('?') ? window.location.hash.split('?')[1] : '');
      if (searchStr) {
        const params = new URLSearchParams(searchStr);
        const orderParam = params.get('order') || params.get('orderNumber') || params.get('pos');
        if (orderParam) {
          setOrderNumber(orderParam.trim());
        }
      }
    } catch {
      // Ignore URL parse errors
    }
  }, []);

  const handleRatingClick = (option: RatingOption) => {
    setSelectedRating(option);
    setIsThankYouShown(true);

    // Play chime sound
    soundManager.playRatingChime(option.score);

    // Burst confetti for positive feedback (4 or 5 score)
    if (option.score >= 4) {
      confetti({
        particleCount: 60,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#ec4899', '#f43f5e', '#3b82f6', '#10b981', '#fbbf24'],
      });
    }

    const currentOrder = orderNumber.trim();
    setLastSubmittedOrder(currentOrder);

    // Submit rating with Order Number
    onNewRatingSubmitted({
      id: `r-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      counterId: activeCounter.id,
      counterName: activeCounter.name,
      cashierName: activeCounter.cashierName,
      branchName: activeCounter.branchName || activeCounter.name,
      orderNumber: currentOrder,
      score: option.score,
      level: option.level,
      timestamp: new Date().toISOString(),
    } as RatingRecord);

    // Reset order number input for next customer
    setOrderNumber('');

    // Auto reset after 2.5s
    const timer = setTimeout(() => {
      setIsThankYouShown(false);
      setSelectedRating(null);
    }, 2500);

    return () => clearTimeout(timer);
  };

  const handleManualReset = () => {
    setIsThankYouShown(false);
    setSelectedRating(null);
  };

  return (
    <div className={`relative min-h-screen bg-gradient-to-br ${theme.bgGradient} flex flex-col justify-between p-4 md:p-8 select-none overflow-hidden font-sans`}>
      
      {/* Decorative Floating Reactions */}
      <div className="absolute top-8 left-8 pointer-events-none animate-bounce duration-1000">
        <div className="bg-rose-500 text-white p-3 rounded-full shadow-lg flex items-center justify-center transform -rotate-12">
          <Heart className="w-6 h-6 fill-current text-white" />
        </div>
      </div>

      <div className="absolute top-16 left-24 pointer-events-none">
        <div className="bg-blue-500 text-white p-2.5 rounded-full shadow-md flex items-center justify-center transform rotate-6">
          <ThumbsUp className="w-5 h-5 fill-current text-white" />
        </div>
      </div>

      <div className="absolute bottom-12 right-12 pointer-events-none animate-pulse">
        <div className="bg-amber-400 text-slate-900 p-3.5 rounded-full shadow-lg flex items-center justify-center transform rotate-12">
          <Sparkles className="w-6 h-6 text-slate-900" />
        </div>
      </div>

      <div className="absolute bottom-24 right-28 pointer-events-none">
        <div className="bg-blue-600 text-white p-3 rounded-full shadow-md flex items-center justify-center transform -rotate-6">
          <ThumbsUp className="w-5 h-5 fill-current text-white" />
        </div>
      </div>

      {/* Top Header Bar */}
      <div className="relative z-20 flex flex-wrap items-center justify-between gap-4 bg-white/90 backdrop-blur-md px-6 py-3.5 rounded-2xl shadow-sm border border-slate-200/80">
        <div className="flex items-center space-x-3">
          {/* Logo / Org Name */}
          {settings.logoUrl ? (
            <img src={settings.logoUrl} alt="Logo" className="h-9 w-auto max-w-[130px] object-contain rounded-lg border border-slate-200 p-0.5 bg-white shadow-xs" />
          ) : (
            <div className={`p-2 rounded-xl ${theme.badgeBg} border border-slate-200 shadow-xs shrink-0`}>
              <Store className="w-5 h-5" />
            </div>
          )}

          <div className="relative">
            <button
              onClick={() => setCounterMenuOpen(!counterMenuOpen)}
              className="flex items-center space-x-2 text-slate-800 font-semibold hover:opacity-80 transition text-sm"
            >
              <div className="flex flex-col text-left">
                <span className="text-xs text-slate-500 font-medium line-clamp-1">{settings.orgName}</span>
                <span className={`text-sm font-bold ${activeCounter.isFallbackError ? 'text-rose-600' : 'text-slate-900'}`}>
                  {activeCounter.isFallbackError ? (language === 'th' ? 'กรุณาเลือกสาขา (Invalid Link)' : 'Select Branch (Invalid Link)') : activeCounter.name}
                </span>
              </div>
            </button>
            {/* Branch Selection Dropdown */}
            {counterMenuOpen && (
              <div className="absolute top-full left-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50">
                <div className="px-3 py-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider">
                  {language === 'th' ? 'เลือกสาขา' : 'Select Branch'}
                </div>
                {counters.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      onSelectCounter(c.id);
                      setCounterMenuOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2.5 text-sm flex flex-col hover:bg-slate-50 transition ${
                      c.id === activeCounter.id ? 'bg-teal-50/80 font-bold text-teal-800' : 'text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{c.name}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Cashier Order Number Input Panel */}
        <div className="flex items-center space-x-2 bg-slate-100/90 p-1.5 rounded-xl border border-slate-200">
          <div className="flex items-center space-x-1.5 px-2 text-slate-700 text-xs font-bold">
            <Receipt className={`w-4 h-4 ${theme.primaryText}`} />
            <span className="hidden sm:inline">{language === 'th' ? 'เลขออเดอร์/ใบเสร็จ:' : 'Order No:'}</span>
          </div>
          <div className="flex items-center">
            <input
              type="text"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              placeholder={language === 'th' ? 'ระบุเลขออเดอร์...' : 'Enter Order ID...'}
              className={`bg-white border border-slate-300 rounded-l-lg px-3 py-1.5 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 ${theme.accentRing} w-32 sm:w-44 text-center`}
            />
            <button
              onClick={() => setIsScannerOpen(true)}
              className="bg-slate-800 text-white p-1.5 rounded-r-lg hover:bg-slate-700 transition border-y border-r border-slate-300"
              title={language === 'th' ? 'สแกนบาร์โค้ด' : 'Scan Barcode'}
            >
              <Camera className="w-4 h-4" />
            </button>
          </div>
          {orderNumber && (
            <button
              onClick={() => setOrderNumber('')}
              className="text-xs text-slate-400 hover:text-rose-500 font-bold px-1.5"
              title={language === 'th' ? 'ล้างเลขออเดอร์' : 'Clear Order ID'}
            >
              ✕
            </button>
          )}
        </div>

        {/* Right Controls */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setLanguage(language === 'th' ? 'en' : 'th')}
            className={`p-2 rounded-xl border transition flex items-center space-x-1 text-sm font-bold bg-white border-slate-200 text-slate-700 hover:bg-slate-50`}
            title="เปลี่ยนภาษา / Change Language"
          >
            <span className={language === 'th' ? 'text-teal-600' : 'text-slate-400'}>TH</span>
            <span className="text-slate-300">|</span>
            <span className={language === 'en' ? 'text-teal-600' : 'text-slate-400'}>EN</span>
          </button>

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2 rounded-xl border transition flex items-center space-x-1 text-sm ${
              soundEnabled
                ? `${theme.badgeBg} border-slate-200`
                : 'bg-slate-100 border-slate-200 text-slate-500'
            }`}
            title={language === 'th' ? 'เปิด/ปิด เสียงสัมผัส' : 'Toggle Sound'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            <span className="hidden sm:inline text-xs">
              {soundEnabled ? (language === 'th' ? 'เปิดเสียง' : 'Sound On') : (language === 'th' ? 'ปิดเสียง' : 'Sound Off')}
            </span>
          </button>

          <button
            onClick={toggleFullscreen}
            className={`p-2 rounded-xl border transition flex items-center justify-center bg-white border-slate-200 text-slate-700 hover:bg-slate-50`}
            title={isFullscreen ? (language === 'th' ? 'ออกจากการแสดงเต็มจอ' : 'Exit Fullscreen') : (language === 'th' ? 'แสดงเต็มจอ' : 'Fullscreen')}
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>

          {onOpenAdmin && (
            <button
              onClick={onOpenAdmin}
              className="flex items-center space-x-1.5 bg-slate-900 hover:bg-slate-800 text-white px-3 py-2 rounded-xl text-xs font-bold transition shadow-xs border border-slate-700"
              title={language === 'th' ? 'แดชบอร์ดผู้ดูแลระบบ' : 'Admin Dashboard'}
            >
              <Lock className="w-3.5 h-3.5 text-pink-400" />
              <span className="hidden sm:inline">{language === 'th' ? 'ผู้ดูแลระบบ' : 'Admin'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Touchscreen Kiosk Card */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center my-4 md:my-6 max-w-5xl mx-auto w-full">
        <div className="bg-white/95 backdrop-blur-lg rounded-3xl shadow-2xl border border-slate-100 p-6 md:p-8 lg:p-14 w-full text-center relative overflow-hidden flex-1 flex flex-col justify-center">
          
          {/* Subtle Top Accent */}
          <div className={`absolute top-0 left-0 right-0 h-2 ${theme.primaryBg}`} />

          <AnimatePresence mode="wait">
            {!isThankYouShown ? (
              <motion.div
                key="rating-form"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col items-center"
              >
                {/* Order Number Input Box */}
                <div className="flex items-center justify-center space-x-2 bg-slate-900 text-white font-mono text-xs sm:text-sm px-4 py-2 rounded-2xl shadow-sm mb-6 border border-slate-700 max-w-md w-full">
                  <Receipt className="w-4 h-4 text-pink-400 shrink-0" />
                  <span className="shrink-0 font-medium text-slate-300">{language === 'th' ? 'เลขออเดอร์/ใบเสร็จ:' : 'Order No:'}</span>
                  <div className="flex flex-1 items-center">
                    <input
                      type="text"
                      value={orderNumber}
                      onChange={(e) => setOrderNumber(e.target.value)}
                      placeholder={language === 'th' ? 'กรอกเลขออเดอร์ POS' : 'Enter Order ID'}
                      className="bg-slate-800 border border-slate-600 rounded-l-lg px-2.5 py-1 text-xs sm:text-sm font-bold text-pink-300 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-pink-500 flex-1 min-w-0"
                    />
                    <button
                      onClick={() => setIsScannerOpen(true)}
                      className="bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded-r-lg border-y border-r border-slate-600 transition"
                      title={language === 'th' ? 'สแกนบาร์โค้ด' : 'Scan Barcode'}
                    >
                      <Camera className="w-4 h-4 text-pink-400" />
                    </button>
                  </div>
                  {orderNumber && (
                    <button
                      type="button"
                      onClick={() => setOrderNumber('')}
                      className="text-xs text-slate-400 hover:text-white px-1.5 py-0.5 rounded bg-slate-800 shrink-0"
                      title={language === 'th' ? 'ล้างเลขออเดอร์' : 'Clear Order ID'}
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Main Question Header matching photo */}
                {activeCounter.isFallbackError ? (
                  <>
                    <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-rose-600 tracking-tight mb-1 sm:mb-2">
                      {language === 'th' ? 'ไม่พบข้อมูลจุดบริการ' : 'Counter Not Found'}
                    </h1>
                    <p className="text-rose-500 font-bold text-sm md:text-base lg:text-lg mb-6 md:mb-10 lg:mb-14">
                      {language === 'th' ? 'ลิงก์ที่ใช้เปิดไม่ถูกต้อง หรือจุดบริการถูกลบออกไปแล้ว กรุณากดปุ่มด้านบนซ้ายเพื่อเลือกจุดบริการใหม่' : 'Invalid link or counter was deleted. Please select a counter from the top left menu.'}
                    </p>
                  </>
                ) : (
                  <>
                    <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-slate-800 tracking-tight mb-1 sm:mb-2">
                      {language === 'th' ? 'คุณพอใจในการให้บริการหรือไม่' : 'How was your experience today?'}
                    </h1>
                    <p className="text-slate-500 text-sm md:text-base lg:text-lg mb-6 md:mb-10 lg:mb-14">
                      {language === 'th' ? 'โปรดแตะเลือกไอคอนด้านล่างเพื่อประเมินการบริการของคุณวันนี้' : 'Please tap an icon below to rate your experience today'}
                    </p>
                  </>
                )}

                {/* 5 Rating Face Buttons Bar */}
                <div className="grid grid-cols-5 gap-2 sm:gap-4 md:gap-6 lg:gap-10 w-full max-w-5xl lg:max-w-6xl mx-auto px-1 sm:px-2">
                  {RATING_OPTIONS.map((option) => (
                    <motion.button
                      key={option.level}
                      whileHover={{ scale: activeCounter.isFallbackError ? 1 : 1.1, y: activeCounter.isFallbackError ? 0 : -8 }}
                      whileTap={{ scale: activeCounter.isFallbackError ? 1 : 0.92 }}
                      onClick={() => !activeCounter.isFallbackError && handleRatingClick(option)}
                      className={`group flex flex-col items-center focus:outline-none ${activeCounter.isFallbackError ? 'opacity-50 cursor-not-allowed grayscale' : 'cursor-pointer'}`}
                    >
                      {/* Facial Expression Icon Circle */}
                      <div
                        className={`w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 lg:w-36 lg:h-36 rounded-full border-4 md:border-[5px] flex items-center justify-center text-4xl sm:text-5xl md:text-6xl lg:text-7xl transition-all duration-200 shadow-lg ${option.borderColor} ${option.hoverColor} bg-white group-hover:shadow-2xl`}
                      >
                        <span className="transform group-hover:scale-110 transition duration-200">
                          {option.emoji}
                        </span>
                      </div>

                      {/* Label */}
                      <span className={`mt-2 sm:mt-3 md:mt-4 text-sm sm:text-lg md:text-xl lg:text-2xl font-extrabold text-slate-800 group-hover:${option.textColor} transition`}>
                        {language === 'th' ? option.labelThai : option.labelEnglish}
                      </span>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            ) : (
              /* Thank You Feedback Screen */
              <motion.div
                key="thank-you"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                className="flex flex-col items-center justify-center py-8 md:py-12"
              >
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-emerald-100 border-4 border-emerald-400 text-emerald-600 flex items-center justify-center text-5xl mb-6 shadow-inner">
                  {selectedRating?.emoji || '❤️'}
                </div>

                <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-800 mb-3">
                  {language === 'th' ? 'ขอบคุณสำหรับความคิดเห็นค่ะ!' : 'Thank you for your feedback!'}
                </h2>

                <p className="text-slate-600 text-lg md:text-xl max-w-lg mb-2">
                  {language === 'th' 
                    ? `ความคิดเห็นของท่าน (${selectedRating?.labelThai}) มีความสำคัญอย่างยิ่งต่อการปรับปรุงการให้บริการของเรา`
                    : `Your feedback (${selectedRating?.labelEnglish}) is highly appreciated and helps us improve our services.`}
                </p>
                <p className="text-slate-500 text-sm font-mono mb-8 bg-slate-100 px-4 py-1.5 rounded-full border border-slate-200">
                  {language === 'th' ? 'บันทึกสำหรับเลขออเดอร์: ' : 'Recorded for order: '} 
                  <strong className="text-pink-600 font-extrabold">{lastSubmittedOrder || (language === 'th' ? 'ทั่วไป (ไม่มีเลขออเดอร์)' : 'General (No Order ID)')}</strong>
                </p>

                <div className="flex items-center space-x-2 text-emerald-600 font-medium bg-emerald-50 px-5 py-2.5 rounded-full border border-emerald-200 text-sm">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  <span>{language === 'th' ? 'ระบบบันทึกข้อมูลเรียบร้อยแล้ว' : 'Data recorded successfully'}</span>
                </div>

                <button
                  onClick={handleManualReset}
                  className="mt-8 text-xs text-slate-400 hover:text-slate-600 underline"
                >
                  {language === 'th' ? 'กดเพื่อกลับหน้าแรกทันที' : 'Tap to return to home screen'}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Barcode Scanner Modal */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={(code) => setOrderNumber(code)}
      />

      {/* Footer Branding Bar */}
      <div className="relative z-10 text-center text-slate-400 text-xs sm:text-sm py-2">
        <span>{language === 'th' ? 'สาขา • ระบบประเมินความพึงพอใจการให้บริการ' : 'Cashier Service • Customer Satisfaction Rating System'}</span>
      </div>
    </div>
  );
};
