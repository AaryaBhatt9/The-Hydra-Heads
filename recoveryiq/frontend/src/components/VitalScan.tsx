import { useRef, useState, useEffect } from 'react';
import { VitalsData } from '../types';
import { api } from '../api/client';

interface Props {
  onComplete: (vitals: VitalsData) => void;
  onSkip: () => void;
  label?: string;
}

const NS_LABELS = {
  stressed:  { label: 'Stressed / Depleted',  color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200',    rec: 'Recommend: Parasympathetic reset session' },
  balanced:  { label: 'Balanced',              color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200', rec: 'Recommend: Recovery or relaxation session' },
  recovered: { label: 'Recovered / Ready',     color: 'text-green-600',  bg: 'bg-green-50',  border: 'border-green-200',  rec: 'Recommend: Activation or performance session' },
};

export default function VitalScan({ onComplete, onSkip, label = 'BEFORE' }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'processing' | 'done' | 'error'>('idle');
  const [countdown, setCountdown] = useState(30);
  const [vitals, setVitals] = useState<VitalsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const framesRef = useRef<string[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      setError('Camera unavailable — skip to continue.');
    }
  };

  const stopCamera = () => {
    const stream = videoRef.current?.srcObject as MediaStream;
    stream?.getTracks().forEach(t => t.stop());
  };

  const captureFrame = (): string | null => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return null;
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0, 320, 240);
    return canvas.toDataURL('image/jpeg', 0.7);
  };

  const startScan = () => {
    framesRef.current = [];
    setPhase('scanning');
    setCountdown(30);
    let elapsed = 0;
    intervalRef.current = setInterval(() => {
      const frame = captureFrame();
      if (frame) framesRef.current.push(frame);
      elapsed += 1;
      setCountdown(30 - elapsed);
      if (elapsed >= 30) {
        clearInterval(intervalRef.current!);
        processFrames();
      }
    }, 1000);
  };

  const processFrames = async () => {
    setPhase('processing');
    try {
      const result = await api.analyzeVitals(framesRef.current, 1);
      setVitals(result);
      setPhase('done');
    } catch {
      const mockVitals: VitalsData = {
        heart_rate: 74, hrv_rmssd: 38, breath_rate: 16,
        nervous_system_state: 'balanced', confidence: 0.72, mock: true
      };
      setVitals(mockVitals);
      setPhase('done');
    }
  };

  return (
    <div className="flex flex-col items-center gap-6 p-6 max-w-lg mx-auto">
      <div className="text-center">
        <div className="inline-flex items-center gap-2 bg-gray-100 rounded-full px-4 py-1 mb-2">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">{label} Session</span>
        </div>
        <h2 className="text-2xl font-bold text-gray-800">VitalScan</h2>
        <p className="text-gray-500 text-sm mt-1">30-second face scan · HR, HRV, Breath Rate</p>
      </div>

      <div className="relative rounded-2xl overflow-hidden border-2 border-gray-200 bg-black shadow-lg">
        <video ref={videoRef} autoPlay muted playsInline className="w-72 h-54 object-cover" style={{height: 216}} />
        <canvas ref={canvasRef} className="hidden" />

        {phase === 'scanning' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40">
            <div className="text-white text-6xl font-black">{countdown}</div>
            <div className="text-white/70 text-sm mt-1">Keep face in frame</div>
            <div className="absolute top-0 left-0 w-full h-0.5 bg-green-400 opacity-80"
              style={{ animation: 'scanline 2s linear infinite' }} />
          </div>
        )}

        {phase === 'processing' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="text-white text-center">
              <div className="w-10 h-10 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm">Analyzing vitals...</p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-sm w-full">
          {error}
        </div>
      )}

      {phase === 'done' && vitals && (() => {
        const ns = NS_LABELS[vitals.nervous_system_state];
        return (
          <div className="w-full space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: vitals.heart_rate, unit: 'BPM', label: 'Heart Rate' },
                { value: vitals.hrv_rmssd, unit: 'ms', label: 'HRV' },
                { value: vitals.breath_rate, unit: '/min', label: 'Breath Rate' },
              ].map(m => (
                <div key={m.label} className="bg-white border border-gray-100 rounded-2xl p-4 text-center shadow-sm">
                  <p className="text-2xl font-bold text-gray-800">{m.value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{m.unit}</p>
                  <p className="text-xs text-gray-500 mt-1">{m.label}</p>
                </div>
              ))}
            </div>
            <div className={`${ns.bg} ${ns.border} border rounded-2xl p-4`}>
              <p className={`font-semibold ${ns.color}`}>Nervous System: {ns.label}</p>
              <p className="text-sm text-gray-600 mt-1">{ns.rec}</p>
              {vitals.mock && <p className="text-xs text-gray-400 mt-2">* Simulated reading for demo</p>}
            </div>
            <button
              onClick={() => onComplete(vitals)}
              className="w-full bg-gray-900 text-white rounded-2xl py-4 font-bold hover:bg-gray-700 transition"
            >
              Continue →
            </button>
          </div>
        );
      })()}

      {phase === 'idle' && (
        <div className="flex gap-3">
          <button onClick={startScan} className="bg-gray-900 text-white rounded-xl px-8 py-3 font-semibold hover:bg-gray-700 transition">
            Start 30s Scan
          </button>
          <button onClick={onSkip} className="border border-gray-200 text-gray-500 rounded-xl px-6 py-3 font-medium hover:bg-gray-50 transition">
            Skip
          </button>
        </div>
      )}
    </div>
  );
}
