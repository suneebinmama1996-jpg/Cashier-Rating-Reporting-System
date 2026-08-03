import React, { useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Camera, Zap, ZapOff } from 'lucide-react';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (decodedText: string) => void;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
}) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [hasCamera, setHasCamera] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [torchOn, setTorchOn] = React.useState(false);

  useEffect(() => {
    if (isOpen) {
      startScanner();
    } else {
      stopScanner();
    }
    return () => stopScanner();
  }, [isOpen]);

  const startScanner = async () => {
    try {
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 0) {
        setHasCamera(true);
        const scanner = new Html5Qrcode("reader", {
          verbose: false,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.ITF
          ]
        });
        scannerRef.current = scanner;

        // Custom QR Box function to make it wider for 1D barcodes
        const qrboxFunction = (viewfinderWidth: number, viewfinderHeight: number) => {
          const minEdgePercentage = 0.7; 
          const minEdgeSize = Math.min(viewfinderWidth, viewfinderHeight);
          const qrboxSize = Math.floor(minEdgeSize * minEdgePercentage);
          return {
            width: Math.min(viewfinderWidth - 40, 400),
            height: 160
          };
        };

        const config = {
          fps: 20, // Faster processing
          qrbox: qrboxFunction,
          aspectRatio: 1.0,
          disableFlip: false,
        };

        await scanner.start(
          { facingMode: "environment" },
          config,
          (decodedText) => {
            onScanSuccess(decodedText);
            onClose();
          },
          () => {
            // Silence silent scan errors
          }
        );
      } else {
        setError("ไม่พบกล้องในอุปกรณ์ของคุณ / No camera found");
      }
    } catch (err) {
      console.error("Scanner Error:", err);
      setError("ไม่สามารถเข้าถึงกล้องได้ กรุณาอนุญาตการเข้าถึงกล้อง / Camera access denied");
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop();
        scannerRef.current = null;
      } catch (err) {
        console.error("Stop Error:", err);
      }
    }
  };

  const toggleTorch = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        const state = !torchOn;
        // Note: torch support depends on browser/hardware
        await scannerRef.current.applyVideoConstraints({
          // @ts-ignore - advanced constraints might not be in types
          advanced: [{ torch: state }]
        });
        setTorchOn(state);
      } catch (err) {
        console.warn("Torch not supported", err);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/95 backdrop-blur-md">
      <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="p-4 bg-slate-100 border-b border-slate-200 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Camera className="w-5 h-5 text-teal-600" />
            <h3 className="font-bold text-slate-800">สแกนบาร์โค้ดออเดอร์ (Scan Barcode)</h3>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-200 rounded-full transition"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="relative aspect-square sm:aspect-video bg-black flex items-center justify-center overflow-hidden">
          <div id="reader" className="w-full h-full" />
          
          {/* Scanning Line Animation */}
          {hasCamera && !error && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-[80%] h-40 border-2 border-teal-500/50 rounded-lg relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-[2px] bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)] animate-[scan_2s_linear_infinite]" />
              </div>
            </div>
          )}
          
          {!hasCamera && !error && (
            <div className="absolute inset-0 flex items-center justify-center text-white flex-col space-y-4">
              <RefreshCw className="w-8 h-8 animate-spin text-teal-400" />
              <p className="text-sm font-medium">กำลังเตรียมกล้อง...</p>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center text-center p-8 flex-col space-y-4 bg-rose-950/80">
              <Camera className="w-12 h-12 text-rose-400" />
              <p className="text-rose-200 font-bold">{error}</p>
              <button 
                onClick={onClose}
                className="bg-white text-rose-600 px-6 py-2 rounded-xl font-bold"
              >
                ตกลง (Close)
              </button>
            </div>
          )}

          {hasCamera && !error && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center space-x-4">
              <button
                onClick={toggleTorch}
                className={`p-4 rounded-full shadow-lg transition ${torchOn ? 'bg-amber-400 text-slate-900' : 'bg-slate-800/80 text-white hover:bg-slate-700'}`}
                title="เปิด/ปิด ไฟแฟลช"
              >
                {torchOn ? <Zap className="w-6 h-6 fill-current" /> : <ZapOff className="w-6 h-6" />}
              </button>
            </div>
          )}
        </div>

        <div className="p-6 text-center space-y-2">
          <p className="text-slate-600 font-medium">
            วางบาร์โค้ดบนใบเสร็จให้ตรงกับกรอบสแกน
          </p>
          <p className="text-xs text-slate-400">
            (Position the barcode inside the scan frame)
          </p>
        </div>
      </div>
    </div>
  );
};

const RefreshCw = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>
);
