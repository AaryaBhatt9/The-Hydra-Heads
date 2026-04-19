import { VitalsDelta } from '../types';
import { speakText } from './VoiceButton';

interface Props {
  delta: VitalsDelta;
  patientName: string;
  sessionFocus: string;
  onContinue: () => void;
}

export default function ShareCard({ delta, patientName, sessionFocus, onContinue }: Props) {
  const handleShare = async () => {
    const text = `Just had a Hydrawav3 session!\nROM improved ${delta.rom_delta}° and HRV up ${delta.hrv_delta}ms 💪\n#Hydrawav3 #Recovery #RecoveryIQ`;
    if (navigator.share) {
      try { await navigator.share({ title: 'My Hydrawav3 Recovery Results', text }); } catch {}
    } else {
      await navigator.clipboard.writeText(text);
      alert('Results copied! Paste to Instagram, X, or anywhere.');
    }
  };

  const narrateResults = () => {
    speakText(
      `Great session, ${patientName}! Your range of motion improved by ${delta.rom_delta} degrees. ` +
      `Your heart rate variability increased by ${delta.hrv_delta} milliseconds. Keep it up!`
    ).catch(() => {});
  };

  const metrics = [
    { label: 'Heart Rate', before: `${delta.before.heart_rate}`, after: `${delta.after.heart_rate}`, unit: 'bpm', good: delta.hr_delta < 0 },
    { label: 'HRV', before: `${delta.before.hrv_rmssd}`, after: `${delta.after.hrv_rmssd}`, unit: 'ms', good: delta.hrv_delta > 0 },
    { label: 'Breath', before: `${delta.before.breath_rate}`, after: `${delta.after.breath_rate}`, unit: '/min', good: delta.br_delta < 0 },
  ];

  return (
    <div className="flex flex-col items-center gap-6 p-6 max-w-sm mx-auto">
      <h2 className="text-2xl font-bold text-gray-800 text-center">Your Results 🏆</h2>

      <div id="share-card" className="w-full rounded-3xl overflow-hidden shadow-2xl"
        style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)' }}>
        <div className="px-6 pt-7 pb-4 text-center">
          <p className="text-white/50 text-xs uppercase tracking-widest">Hydrawav3 Recovery</p>
          <p className="text-white font-black text-xl mt-1">{patientName}</p>
          <p className="text-white/40 text-sm">{sessionFocus}</p>
        </div>

        <div className="mx-5 bg-white/10 rounded-2xl p-5 text-center mb-4 backdrop-blur-sm">
          <p className="text-white/50 text-xs uppercase tracking-wide mb-3">Range of Motion</p>
          <div className="flex items-center justify-center gap-5">
            <div>
              <p className="text-4xl font-black text-white/40">{delta.rom_before}°</p>
              <p className="text-xs text-white/30">before</p>
            </div>
            <span className="text-3xl text-white/40">→</span>
            <div>
              <p className="text-4xl font-black text-green-400">{delta.rom_after}°</p>
              <p className="text-xs text-white/30">after</p>
            </div>
          </div>
          <div className="mt-4 bg-green-400/20 rounded-xl px-5 py-3 inline-block">
            <p className="text-green-400 font-black text-3xl">+{delta.rom_delta}°</p>
            <p className="text-green-300 text-xs">in one session</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mx-5 mb-6">
          {metrics.map(m => (
            <div key={m.label} className="bg-white/10 rounded-xl p-3 text-center backdrop-blur-sm">
              <p className="text-white/40 text-xs mb-2">{m.label}</p>
              <p className="text-white/40 text-sm">{m.before}</p>
              <p className={`font-black text-lg ${m.good ? 'text-green-400' : 'text-white'}`}>{m.after}</p>
              <p className="text-white/30 text-xs">{m.unit}</p>
            </div>
          ))}
        </div>

        <div className="px-5 pb-6 text-center">
          <p className="text-white/20 text-xs">Powered by Hydrawav3 · hydrawav3.com</p>
        </div>
      </div>

      <div className="flex gap-3 w-full">
        <button onClick={handleShare}
          className="flex-1 text-white rounded-2xl py-4 font-black text-sm hover:opacity-90 transition"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #ec4899)' }}>
          📤 Share Results
        </button>
        <button onClick={narrateResults}
          className="border border-purple-200 text-purple-700 rounded-2xl px-5 text-lg hover:bg-purple-50 transition">
          🎙
        </button>
      </div>

      <button onClick={onContinue} className="w-full bg-gray-900 text-white rounded-2xl py-4 font-bold hover:bg-gray-700 transition">
        View My 7-Day Plan →
      </button>
    </div>
  );
}
