import { ProtocolRecommendation, VitalsData } from '../types';
import FluidFlowDiagram from './FluidFlowDiagram';

interface Props {
  protocol: ProtocolRecommendation;
  vitals?: VitalsData | null;
  onStartSession: () => void;
}

const INTENSITY_COLORS = {
  low: 'bg-green-100 text-green-800 border border-green-200',
  moderate: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
  high: 'bg-red-100 text-red-800 border border-red-200',
};

export default function ProtocolCard({ protocol, vitals, onStartSession }: Props) {
  return (
    <div className="p-6 max-w-lg mx-auto space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-gray-800">Protocol Recommendation</h2>
        <p className="text-gray-500 text-sm mt-1">AI-generated based on your assessment</p>
      </div>

      {vitals && (
        <div className="bg-gray-50 rounded-2xl p-4 flex gap-4">
          <div className="text-center flex-1">
            <p className="text-lg font-bold text-gray-800">{vitals.heart_rate}</p>
            <p className="text-xs text-gray-500">BPM</p>
          </div>
          <div className="text-center flex-1">
            <p className="text-lg font-bold text-gray-800">{vitals.hrv_rmssd}</p>
            <p className="text-xs text-gray-500">HRV ms</p>
          </div>
          <div className="text-center flex-1">
            <p className={`text-sm font-bold ${vitals.nervous_system_state === 'stressed' ? 'text-red-600' : vitals.nervous_system_state === 'recovered' ? 'text-green-600' : 'text-yellow-600'}`}>
              {vitals.nervous_system_state.charAt(0).toUpperCase() + vitals.nervous_system_state.slice(1)}
            </p>
            <p className="text-xs text-gray-500">NS State</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-red-50 rounded-xl p-4 border border-red-100">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-3 h-3 rounded-full bg-red-500 flex-shrink-0" />
              <span className="text-xs font-bold text-red-700 uppercase tracking-wide">Sun Pad</span>
            </div>
            <p className="font-bold text-gray-800">{protocol.sun_pad_placement}</p>
          </div>
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-3 h-3 rounded-full bg-blue-500 flex-shrink-0" />
              <span className="text-xs font-bold text-blue-700 uppercase tracking-wide">Moon Pad</span>
            </div>
            <p className="font-bold text-gray-800">{protocol.moon_pad_placement}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-center">
            <p className="text-3xl font-black text-gray-800">{protocol.duration_minutes}</p>
            <p className="text-xs text-gray-500">minutes</p>
          </div>
          <span className={`px-3 py-1.5 rounded-full text-sm font-semibold ${INTENSITY_COLORS[protocol.intensity]}`}>
            {protocol.intensity.charAt(0).toUpperCase() + protocol.intensity.slice(1)} intensity
          </span>
        </div>

        <div className="bg-gray-50 rounded-xl p-4 border-l-4 border-gray-300">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Why this protocol</p>
          <p className="text-sm text-gray-700 leading-relaxed">{protocol.practitioner_rationale}</p>
        </div>

        {protocol.multi_pad && protocol.multi_pad.pads.length > 0 && (
          <FluidFlowDiagram protocol={protocol.multi_pad} />
        )}
      </div>

      <button
        onClick={onStartSession}
        className="w-full bg-gray-900 text-white rounded-2xl py-5 font-black text-xl hover:bg-gray-700 transition shadow-lg"
      >
        Start Session ▶
      </button>
    </div>
  );
}
