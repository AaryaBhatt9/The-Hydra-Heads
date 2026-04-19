import { useState, useEffect } from 'react';
import { ProtocolRecommendation } from '../types';
import { api } from '../api/client';

interface Props {
  sessionId: string;
  protocol: ProtocolRecommendation;
  sessionType: string;
  onComplete: () => void;
}

export default function SessionActive({ sessionId, protocol, sessionType, onComplete }: Props) {
  const totalSeconds = protocol.duration_minutes * 60;
  const [remaining, setRemaining] = useState(totalSeconds);
  const [deviceStatus, setDeviceStatus] = useState<'starting' | 'running' | 'mock' | 'error'>('starting');
  const [deviceMessage, setDeviceMessage] = useState('Connecting to device...');
  const progress = ((totalSeconds - remaining) / totalSeconds) * 100;

  useEffect(() => {
    const startDevice = async () => {
      try {
        const result = await api.startDevice(
          sessionId,
          protocol.intensity,
          sessionType,
          protocol.duration_minutes,
          protocol.mqtt_payload,
        );
        if (result.success) {
          if (result.mock) { setDeviceStatus('mock'); setDeviceMessage('Session active (demo mode)'); }
          else { setDeviceStatus('running'); setDeviceMessage('Device active — session running'); }
        } else {
          setDeviceStatus('error');
          setDeviceMessage(`Device error: ${result.error || 'Could not connect'}`);
        }
      } catch {
        setDeviceStatus('mock');
        setDeviceMessage('Session active (offline mode)');
      }
    };
    startDevice();
  }, [protocol, sessionId, sessionType]);

  useEffect(() => {
    if (deviceStatus === 'starting') return;
    if (remaining <= 0) { api.stopDevice().catch(() => {}); onComplete(); return; }
    const timer = setInterval(() => setRemaining(r => r - 1), 1000);
    return () => clearInterval(timer);
  }, [remaining, deviceStatus]);

  const handleStop = async () => {
    await api.stopDevice().catch(() => {});
    onComplete();
  };

  const mins = Math.floor(remaining / 60).toString().padStart(2, '0');
  const secs = (remaining % 60).toString().padStart(2, '0');

  const statusColors = {
    starting: 'bg-yellow-50 text-yellow-800 border-yellow-200',
    running: 'bg-green-50 text-green-800 border-green-200',
    mock: 'bg-blue-50 text-blue-800 border-blue-200',
    error: 'bg-red-50 text-red-800 border-red-200',
  };

  const statusIcons = { starting: '⏳', running: '🟢', mock: '🔵', error: '🔴' };

  return (
    <div className="flex flex-col items-center gap-6 p-8 max-w-md mx-auto">
      <h2 className="text-2xl font-bold text-gray-800">Session Active</h2>

      <div className={`w-full px-4 py-3 rounded-xl border text-sm font-medium ${statusColors[deviceStatus]}`}>
        <div className="flex items-center gap-2">
          {deviceStatus === 'starting' && <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
          {deviceStatus !== 'starting' && <span>{statusIcons[deviceStatus]}</span>}
          <span>{deviceMessage}</span>
        </div>
      </div>

      <div className="relative w-52 h-52">
        <svg className="w-52 h-52 -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="54" fill="none" stroke="#f3f4f6" strokeWidth="8" />
          <circle cx="60" cy="60" r="54" fill="none" stroke="#111827" strokeWidth="8" strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 54}`}
            strokeDashoffset={`${2 * Math.PI * 54 * (1 - progress / 100)}`}
            style={{ transition: 'stroke-dashoffset 1s linear' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-black text-gray-800">{mins}:{secs}</span>
          <span className="text-sm text-gray-500">remaining</span>
        </div>
      </div>

      <div className="w-full bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-3">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Pad Placement</p>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3 text-sm">
            <span className="w-3 h-3 rounded-full bg-red-500 flex-shrink-0" />
            <span className="text-gray-700"><strong>Sun:</strong> {protocol.sun_pad_placement}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="w-3 h-3 rounded-full bg-blue-500 flex-shrink-0" />
            <span className="text-gray-700"><strong>Moon:</strong> {protocol.moon_pad_placement}</span>
          </div>
        </div>
      </div>

      <div className="flex gap-3 w-full">
        <button onClick={handleStop} className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-3 text-sm font-semibold hover:bg-gray-50 transition">
          End Session
        </button>
        <button onClick={onComplete} className="text-xs text-gray-400 underline px-3">
          Skip (demo)
        </button>
      </div>
    </div>
  );
}
