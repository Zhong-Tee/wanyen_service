import { useEffect, useRef, useState } from 'react'

// Declare BarcodeDetector type (not yet in standard TS lib)
declare class BarcodeDetector {
  constructor(options?: { formats: string[] })
  detect(image: HTMLVideoElement | ImageBitmap): Promise<{ rawValue: string; format: string }[]>
  static getSupportedFormats(): Promise<string[]>
}

interface BarcodeScannerProps {
  onDetected: (value: string) => void
  onClose: () => void
}

export function BarcodeScanner({ onDetected, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [supported, setSupported] = useState<boolean | null>(null)

  useEffect(() => {
    const hasBD = 'BarcodeDetector' in window
    setSupported(hasBD)
    if (!hasBD) return

    let detector: BarcodeDetector
    let active = true

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }

        const formats = await BarcodeDetector.getSupportedFormats()
        const wantedFormats = ['code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code', 'data_matrix']
        detector = new BarcodeDetector({ formats: formats.filter((f) => wantedFormats.includes(f)) })
        setScanning(true)

        const scan = async () => {
          if (!active || !videoRef.current || videoRef.current.readyState < 2) {
            rafRef.current = requestAnimationFrame(scan)
            return
          }
          try {
            const results = await detector.detect(videoRef.current)
            if (results.length > 0) {
              const value = results[0].rawValue
              stopCamera()
              onDetected(value)
              return
            }
          } catch {
            // ignore detection errors
          }
          rafRef.current = requestAnimationFrame(scan)
        }
        rafRef.current = requestAnimationFrame(scan)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'ไม่สามารถเปิดกล้องได้')
      }
    }

    const stopCamera = () => {
      active = false
      cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }

    startCamera()
    return () => stopCamera()
  }, [onDetected])

  // Fallback: file input for browsers without BarcodeDetector (iOS Safari)
  if (supported === false) {
    return (
      <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4 text-center">
          <p className="text-2xl">📷</p>
          <p className="font-semibold text-gray-900">สแกนบาร์โค้ดจากรูปภาพ</p>
          <p className="text-xs text-gray-400">เบราว์เซอร์นี้ไม่รองรับสแกนแบบ Real-time<br />ใช้กล้องถ่ายรูปบาร์โค้ดแทนได้</p>
          <label className="block w-full py-3 rounded-xl bg-pink-600 text-white font-semibold text-sm cursor-pointer hover:bg-pink-700 active:scale-95 transition-all">
            เปิดกล้องถ่ายรูป
            <input type="file" accept="image/*" capture="environment" className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                try {
                  const img = await createImageBitmap(file)
                  // Try BarcodeDetector one more time (might be available)
                  if ('BarcodeDetector' in window) {
                    const det = new BarcodeDetector({ formats: ['code_128', 'code_39', 'ean_13', 'qr_code'] })
                    const results = await det.detect(img)
                    if (results.length > 0) { onDetected(results[0].rawValue); return }
                  }
                  setError('ไม่พบบาร์โค้ดในรูป — ลองถ่ายใหม่ให้ชัดขึ้น')
                } catch {
                  setError('อ่านรูปไม่ได้')
                }
              }}
            />
          </label>
          <button onClick={onClose} className="w-full py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">ยกเลิก</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Video */}
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          muted
          playsInline
          className="w-full h-full object-cover"
        />
        {/* Viewfinder overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-72 h-36 relative">
            {/* Corner borders */}
            <span className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-pink-400 rounded-tl-lg" />
            <span className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-pink-400 rounded-tr-lg" />
            <span className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-pink-400 rounded-bl-lg" />
            <span className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-pink-400 rounded-br-lg" />
            {/* Scan line animation */}
            {scanning && (
              <div className="absolute left-2 right-2 top-0 h-0.5 bg-pink-400 opacity-80 animate-[scanline_2s_linear_infinite]" />
            )}
          </div>
        </div>
        {/* Status */}
        <div className="absolute bottom-24 left-0 right-0 flex flex-col items-center gap-2">
          {error ? (
            <span className="bg-red-500/80 text-white text-sm px-4 py-2 rounded-xl">{error}</span>
          ) : scanning ? (
            <span className="bg-black/60 text-white text-sm px-4 py-2 rounded-xl">กำลังสแกน...</span>
          ) : (
            <span className="bg-black/60 text-white text-sm px-4 py-2 rounded-xl">กำลังเปิดกล้อง...</span>
          )}
        </div>
      </div>
      {/* Bottom bar */}
      <div className="bg-black px-6 py-5 flex items-center justify-center safe-area-bottom">
        <button
          onClick={onClose}
          className="px-8 py-3 rounded-2xl bg-white/10 text-white font-semibold border border-white/20 hover:bg-white/20 transition-colors"
        >
          ยกเลิก
        </button>
      </div>
    </div>
  )
}
