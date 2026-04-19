import { useState } from 'react';
import { BodyMapIntake as BodyMapIntakeType } from '../types';
import { speakText } from './VoiceButton';

interface Props {
  onSubmit: (intake: BodyMapIntakeType) => void;
}

const BODY_AREAS = [
  { id: 'neck', label: 'Neck', x: 50, y: 10 },
  { id: 'left_shoulder', label: 'L. Shoulder', x: 28, y: 20 },
  { id: 'right_shoulder', label: 'R. Shoulder', x: 72, y: 20 },
  { id: 'upper_back', label: 'Upper Back', x: 50, y: 26 },
  { id: 'lower_back', label: 'Lower Back', x: 50, y: 40 },
  { id: 'left_hip', label: 'L. Hip', x: 34, y: 50 },
  { id: 'right_hip', label: 'R. Hip', x: 66, y: 50 },
  { id: 'left_knee', label: 'L. Knee', x: 34, y: 68 },
  { id: 'right_knee', label: 'R. Knee', x: 66, y: 68 },
  { id: 'left_elbow', label: 'L. Elbow', x: 20, y: 40 },
  { id: 'right_elbow', label: 'R. Elbow', x: 80, y: 40 },
  { id: 'feet', label: 'Feet', x: 50, y: 88 },
];

const GOALS = [
  { id: 'recovery', emoji: '♻️', label: 'Recovery', desc: 'Reduce soreness' },
  { id: 'muscle_relaxation', emoji: '🌿', label: 'Relaxation', desc: 'Release tension' },
  { id: 'muscle_activation', emoji: '⚡', label: 'Activation', desc: 'Warm up & prepare' },
  { id: 'parasympathetic_activation', emoji: '🧘', label: 'NS Reset', desc: 'Calm nervous system' },
];

export default function BodyMapIntake({ onSubmit }: Props) {
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [painLevel, setPainLevel] = useState(5);
  const [goal, setGoal] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const handleAreaTap = (areaId: string) => {
    setSelectedArea(areaId);
    setStep(2);
    speakText('How would you rate your discomfort?').catch(() => {});
  };

  const handlePainConfirm = () => {
    setStep(3);
    speakText("What is your goal for today?").catch(() => {});
  };

  const handleSubmit = () => {
    if (!selectedArea || !goal) return;
    onSubmit({
      body_area: selectedArea,
      pain_level: painLevel,
      session_goal: goal as BodyMapIntakeType['session_goal'],
    });
  };

  const selectedAreaLabel = BODY_AREAS.find(a => a.id === selectedArea)?.label;
  const steps = ['Where?', 'How much?', 'Goal?'];

  return (
    <div className="flex flex-col items-center gap-6 p-6 max-w-sm mx-auto">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-800">Quick Intake</h2>
        <p className="text-gray-500 text-sm mt-1">3 taps · Under 30 seconds</p>
      </div>

      <div className="flex items-center gap-2 w-full">
        {steps.map((s, i) => (
          <div key={s} className="flex-1 flex flex-col items-center gap-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition
              ${step > i + 1 ? 'bg-green-500 text-white' : step === i + 1 ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400'}`}>
              {step > i + 1 ? '✓' : i + 1}
            </div>
            <span className="text-xs text-gray-500">{s}</span>
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="w-full">
          <p className="text-center text-gray-600 mb-4 font-medium">Tap where it bothers you</p>
          <div className="relative mx-auto" style={{ width: 200, height: 380 }}>
            <svg viewBox="0 0 100 100" className="w-full h-full">
              {/* Body outline */}
              <ellipse cx="50" cy="7" rx="6" ry="6.5" fill="#e5e7eb" stroke="#9ca3af" strokeWidth="0.5"/>
              <rect x="38" y="15" width="24" height="30" rx="3" fill="#e5e7eb" stroke="#9ca3af" strokeWidth="0.5"/>
              <rect x="26" y="17" width="10" height="26" rx="5" fill="#e5e7eb" stroke="#9ca3af" strokeWidth="0.5"/>
              <rect x="64" y="17" width="10" height="26" rx="5" fill="#e5e7eb" stroke="#9ca3af" strokeWidth="0.5"/>
              <rect x="38" y="46" width="11" height="42" rx="5" fill="#e5e7eb" stroke="#9ca3af" strokeWidth="0.5"/>
              <rect x="51" y="46" width="11" height="42" rx="5" fill="#e5e7eb" stroke="#9ca3af" strokeWidth="0.5"/>
              {BODY_AREAS.map(area => (
                <g key={area.id} onClick={() => handleAreaTap(area.id)} className="cursor-pointer">
                  <circle cx={area.x} cy={area.y} r="5.5"
                    fill={selectedArea === area.id ? '#ef4444' : '#fca5a5'}
                    opacity={selectedArea === area.id ? 1 : 0.8}
                    stroke={selectedArea === area.id ? '#dc2626' : '#f87171'}
                    strokeWidth="0.5"
                  />
                </g>
              ))}
            </svg>
          </div>
          <p className="text-center text-xs text-gray-400 mt-2">Tap a red dot to select area</p>
        </div>
      )}

      {step === 2 && (
        <div className="w-full space-y-6">
          <div className="text-center">
            <p className="font-bold text-gray-800 text-lg">{selectedAreaLabel}</p>
            <p className="text-gray-500 text-sm">How much discomfort right now?</p>
          </div>
          <div className="space-y-4">
            <div className="flex justify-between text-2xl px-2">
              <span title="Minimal">😊</span>
              <span title="Moderate">😐</span>
              <span title="High">😣</span>
            </div>
            <input
              type="range" min={1} max={10} value={painLevel}
              onChange={e => setPainLevel(Number(e.target.value))}
              className="w-full h-3 accent-gray-900"
            />
            <div className="text-center">
              <span className="text-5xl font-black text-gray-800">{painLevel}</span>
              <span className="text-gray-400 text-xl">/10</span>
            </div>
          </div>
          <button onClick={handlePainConfirm} className="w-full bg-gray-900 text-white rounded-2xl py-4 font-bold text-lg hover:bg-gray-700 transition">
            Next →
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="w-full space-y-4">
          <p className="text-center text-gray-600 font-semibold">What's your goal today?</p>
          <div className="grid grid-cols-2 gap-3">
            {GOALS.map(g => (
              <button key={g.id} onClick={() => setGoal(g.id)}
                className={`p-4 rounded-2xl border-2 text-left transition
                  ${goal === g.id ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-100 bg-white text-gray-700 hover:border-gray-300'}`}>
                <div className="text-2xl mb-1">{g.emoji}</div>
                <div className="font-bold text-sm">{g.label}</div>
                <div className={`text-xs mt-0.5 ${goal === g.id ? 'text-gray-300' : 'text-gray-500'}`}>{g.desc}</div>
              </button>
            ))}
          </div>
          {goal && (
            <button onClick={handleSubmit}
              className="w-full bg-gray-900 text-white rounded-2xl py-4 font-black text-lg hover:bg-gray-700 transition">
              Generate My Protocol →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
