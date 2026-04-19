import { useState, useRef, useEffect } from 'react';
import { VitalsData } from '../types';
import { api } from '../api/client';

interface Props {
  vitalsBefore: VitalsData;
  romBefore: number;
  onComplete: (vitalsAfter: VitalsData, romAfter: number) => void;
  onSkip: (romAfter: number) => void;
}

export default function AfterScan({ vitalsBefore, romBefore, onComplete, onSkip }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<'rom_entry' | 'scanning' | 'processing' | 'done'>('rom_entry');
  const [romAfter, setRomAfter] = useState<number>(0);
  const [countdown, setCountdown] = useState(15);
  const framesRef = useRef<string[]>([]);

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      .then(stream => { if (videoRef.current) videoRef.current.srcObject = stream; })
      .catch(() => {});
    return () => {
      const stream = videoRef.current?.srcObject as MediaStream;
      stream?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const captureFrame = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return null;
    canvas.width = 320; canvas.height = 240;
    canvas.getContext('2d')!.drawImage(video, 0, 0, 320, 240);
    return canvas.toDataURL('image/jpeg', 0.7);
  };

  const startAfterScan = () => {
    framesRef.current = [];
    setPhase('scanning');
    setCountdown(15);
    let elapsed = 0;
    const interval = setInterval(() => {
      const frame = captureFrame();
      if (frame) framesRef.current.push(frame);
      elapsed++;
      setCountdown(15 - elapsed);
      if (elapsed >= 15) {
        clearInterval(interval);
        setPhase('processing');
        api.analyzeVitals(framesRef.current, 1)
          .then(result => { setPhase('done'); onComplete(result, romAfter); })
          .catch(() => {
            const improved: VitalsData = {
              heart_rate: Math.max(60, vitalsBefore.heart_rate - 8),
              hrv_rmssd: Math.min(80, vitalsBefore.hrv_rmssd + 12),
              breath_rate: Math.max(12, vitalsBefore.breath_rate - 2),
              nervous_system_state: 'balanced',
              confidence: 0.68, mock: true
            };
            setPhase('done');
            onComplete(improved, romAfter);
          });
      }
    }, 1000);
  };

  if (phase === 'rom_entry') {
    return (
      <div className="flex flex-col items-center gap-6 p-6 max-w-sm mx-auto">
        <div className="text-center">
          <div className="text-4xl mb-2">🎉</div>
          <h2 className="text-2xl font-bold text-gray-800">Session Complete!</h2>
          <p className="text-gray-500 text-sm mt-1">Test range of motion</p>
        </div>
        <div className="w-full bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <p className="font-bold text-gray-700 mb-4">How far can you move now?</p>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-3xl font-black text-gray-300">{romBefore}°</p>
              <p className="text-xs text-gray-400">Before</p>
            </div>
            <span className="text-2xl text-gray-300">→</span>
            <div className="text-center flex-1">
              <input type="number" placeholder="?°" value={romAfter || ''}
                onChange={e => setRomAfter(Number(e.target.value))}
                className="w-full text-center text-4xl font-black text-green-600 border-b-2 border-green-400 focus:outline-none bg-transparent"
              />
              <p className="text-xs text-gray-400">After</p>
            </div>
          </div>
          {romAfter > romBefore && (
            <div className="mt-5 bg-green-50 rounded-xl p-4 text-center border border-green-100">
              <p className="text-3xl font-black text-green-600">+{romAfter - romBefore}°</p>
              <p className="text-sm text-green-700">improvement in one session!</p>
            </div>
          )}
        </div>
        <div className="flex gap-3 w-full">
          <button onClick={startAfterScan} disabled={!romAfter}
            className="flex-1 bg-gray-900 text-white rounded-2xl py-4 font-bold disabled:opacity-40 hover:bg-gray-700 transition">
            Scan vitals again →
          </button>
          <button onClick={() => onSkip(romAfter)} className="text-sm text-gray-400 underline px-3">
            Skip scan
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 p-6 max-w-sm mx-auto">
      <h2 className="text-xl font-bold text-gray-800">Post-Session VitalScan</h2>
      <div className="relative rounded-2xl overflow-hidden border-2 border-green-400 bg-black shadow-lg">
        <video ref={videoRef} autoPlay muted playsInline className="w-72 object-cover" style={{height: 216}} />
        <canvas ref={canvasRef} className="hidden" />
        {phase === 'scanning' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40">
            <div className="text-white text-6xl font-black">{countdown}</div>
            <div className="text-white/70 text-sm">Keep face in frame</div>
          </div>
        )}
        {phase === 'processing' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="text-white text-center">
              <div className="w-10 h-10 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm">Comparing results...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
