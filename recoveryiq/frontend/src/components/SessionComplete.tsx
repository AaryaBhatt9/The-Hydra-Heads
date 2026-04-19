import { useState } from 'react';
import { HomeRoutine } from '../types';
import { speakText } from './VoiceButton';

interface Props {
  sessionId: string;
  routine: HomeRoutine;
  onFinish: () => void;
  onSaveROM: (before: number, after: number) => void;
}

export default function SessionComplete({ sessionId: _, routine, onFinish, onSaveROM }: Props) {
  const [romBefore, setRomBefore] = useState<number>(0);
  const [romAfter, setRomAfter] = useState<number>(0);
  const [showRoutine, setShowRoutine] = useState(false);
  const [narrating, setNarrating] = useState(false);

  const handleSaveROM = () => {
    onSaveROM(romBefore, romAfter);
    setShowRoutine(true);
  };

  const narrateRoutine = async () => {
    setNarrating(true);
    const script = routine.days.slice(0, 3).map(day =>
      `Day ${day.day}: ${day.activities.map(a => `${a.name} for ${a.duration}. ${a.instructions}`).join('. ')}`
    ).join('. ');
    await speakText(routine.key_message + '. ' + script);
    setNarrating(false);
  };

  return (
    <div className="p-6 max-w-lg mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">Session Complete ✅</h2>

      {!showRoutine ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-5">
          <h3 className="font-bold text-gray-800">Record Range of Motion</h3>
          <div className="grid grid-cols-2 gap-4">
            {[{ label: 'Before session (°)', val: romBefore, set: setRomBefore, placeholder: 'e.g. 35' },
              { label: 'After session (°)', val: romAfter, set: setRomAfter, placeholder: 'e.g. 47' }].map(f => (
              <div key={f.label} className="space-y-2">
                <label className="text-sm text-gray-500">{f.label}</label>
                <input type="number" value={f.val || ''} onChange={e => f.set(Number(e.target.value))}
                  placeholder={f.placeholder}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-center text-2xl font-black focus:outline-none focus:ring-2 focus:ring-gray-300" />
              </div>
            ))}
          </div>
          {romBefore > 0 && romAfter > romBefore && (
            <div className="bg-green-50 border border-green-100 rounded-xl p-5 text-center">
              <p className="text-4xl font-black text-green-600">+{(romAfter - romBefore).toFixed(1)}°</p>
              <p className="text-sm text-green-700">mobility improvement this session</p>
            </div>
          )}
          <button onClick={handleSaveROM} disabled={!romBefore || !romAfter}
            className="w-full bg-gray-900 text-white rounded-2xl py-4 font-bold disabled:opacity-40 hover:bg-gray-700 transition">
            Save & View Recovery Plan →
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5">
            <p className="font-bold text-indigo-900">Your 7-Day Recovery Plan</p>
            <p className="text-sm text-indigo-700 mt-1">{routine.key_message}</p>
          </div>

          <button onClick={narrateRoutine} disabled={narrating}
            className="w-full flex items-center justify-center gap-2 border border-purple-200 bg-purple-50 text-purple-700 rounded-2xl py-4 font-semibold hover:bg-purple-100 transition">
            {narrating ? '🔊 Playing...' : '🎙 Listen to Your Plan'}
          </button>

          <div className="space-y-3">
            {routine.days.map(day => (
              <div key={day.day} className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
                <p className="font-black text-gray-800 mb-3">Day {day.day}</p>
                <div className="space-y-3">
                  {day.activities.map((act, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-black text-gray-600">
                        {i + 1}
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-gray-800">{act.name} · {act.duration}</p>
                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{act.instructions}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-gray-50 rounded-2xl p-4 text-sm text-gray-600">
            <strong>Next session focus:</strong> {routine.next_session_recommendation}
          </div>

          <button onClick={onFinish} className="w-full bg-gray-900 text-white rounded-2xl py-4 font-bold hover:bg-gray-700 transition">
            Back to Dashboard
          </button>
        </div>
      )}
    </div>
  );
}
