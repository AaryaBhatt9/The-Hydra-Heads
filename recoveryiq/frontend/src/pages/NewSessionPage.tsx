import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  SessionStage, PoseAsymmetry, ProtocolRecommendation,
  HomeRoutine, VitalsData, VitalsDelta
} from '../types';
import VitalScan from '../components/VitalScan';
import BodyMapIntake from '../components/BodyMapIntake';
import ProtocolCard from '../components/ProtocolCard';
import SessionActive from '../components/SessionActive';
import AfterScan from '../components/AfterScan';
import ShareCard from '../components/ShareCard';
import SessionComplete from '../components/SessionComplete';
import { api } from '../api/client';

const DEFAULT_PATIENT_ID = 'patient-001';
const DEFAULT_PATIENT_NAME = 'Maria Gonzalez';

export default function NewSessionPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const patientId = searchParams.get('patient') || DEFAULT_PATIENT_ID;

  const [stage, setStage] = useState<SessionStage>('vitalscan_before');
  const [vitalsBefore, setVitalsBefore] = useState<VitalsData | null>(null);
  const [vitalsAfter, setVitalsAfter] = useState<VitalsData | null>(null);
  const [poseData] = useState<PoseAsymmetry | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionType, setSessionType] = useState<string>('recovery');
  const [protocol, setProtocol] = useState<ProtocolRecommendation | null>(null);
  const [routine, setRoutine] = useState<HomeRoutine | null>(null);
  const [focusArea, setFocusArea] = useState<string>('');
  const [romBefore, setRomBefore] = useState<number>(35);
  const [romAfter, setRomAfter] = useState<number>(0);
  const [delta, setDelta] = useState<VitalsDelta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [patientName] = useState<string>(DEFAULT_PATIENT_NAME);

  const handleBodyMapSubmit = async (intake: { body_area: string; pain_level: number; session_goal: string }) => {
    const fa = intake.body_area.replace(/_/g, ' ');
    setFocusArea(fa);
    setSessionType(intake.session_goal);
    setStage('generating');
    try {
      const result = await api.runPipeline({
        patient_id: patientId,
        focus_area: fa,
        pain_level: intake.pain_level,
        session_type: intake.session_goal,
        intake_notes: '',
        pose_data: poseData || undefined,
        vitals_data: vitalsBefore || undefined,
      });
      setSessionId(result.session_id);
      setProtocol(result.protocol);
      setRoutine(result.routine);
      setStage('protocol');
    } catch (e) {
      console.error(e);
      setError('Pipeline failed. Check backend is running on port 8000.');
      setStage('bodymap');
    }
  };

  const handleAfterScanComplete = (vitals: VitalsData, rom: number) => {
    setVitalsAfter(vitals);
    setRomAfter(rom);
    if (vitalsBefore) {
      const d: VitalsDelta = {
        before: vitalsBefore,
        after: vitals,
        hr_delta: Math.round(vitals.heart_rate - vitalsBefore.heart_rate),
        hrv_delta: Math.round(vitals.hrv_rmssd - vitalsBefore.hrv_rmssd),
        br_delta: Math.round(vitals.breath_rate - vitalsBefore.breath_rate),
        rom_before: romBefore,
        rom_after: rom,
        rom_delta: Math.round(rom - romBefore),
      };
      setDelta(d);
      setStage('sharecard');
    } else {
      setStage('complete');
    }
  };

  const handleSaveROM = async (before: number, after: number) => {
    setRomBefore(before);
    setRomAfter(after);
    if (sessionId) await api.completeSession(sessionId, before, after, vitalsAfter || undefined);
  };

  const STAGES: SessionStage[] = ['vitalscan_before', 'bodymap', 'generating', 'protocol', 'active', 'vitalscan_after', 'sharecard', 'complete'];
  const stageIndex = STAGES.indexOf(stage);

  const stageLabels: Record<SessionStage, string> = {
    vitalscan_before: 'VitalScan', bodymap: 'Intake', flowscan: 'Body Scan',
    generating: 'AI Analysis', protocol: 'Protocol', active: 'Session',
    vitalscan_after: 'Post-Scan', sharecard: 'Results', complete: 'Recovery Plan',
  };

  // suppress unused warning
  void vitalsAfter;
  void romAfter;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-5 py-3.5 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <button onClick={() => navigate('/')} className="text-gray-500 text-sm font-medium hover:text-gray-800 transition">
          ← Dashboard
        </button>
        <div className="text-center">
          <p className="text-xs font-bold text-gray-700">{stageLabels[stage]}</p>
          <div className="flex items-center gap-1 mt-1 justify-center">
            {STAGES.slice(0, -1).map((s, i) => (
              <div key={s} className={`rounded-full transition ${i < stageIndex ? 'w-2 h-2 bg-green-500' : i === stageIndex ? 'w-2.5 h-2.5 bg-gray-900' : 'w-2 h-2 bg-gray-200'}`} />
            ))}
          </div>
        </div>
        <div className="w-16" />
      </div>

      <div className="py-4">
        {stage === 'vitalscan_before' && (
          <VitalScan label="BEFORE" onComplete={v => { setVitalsBefore(v); setStage('bodymap'); }} onSkip={() => setStage('bodymap')} />
        )}
        {stage === 'bodymap' && (
          <BodyMapIntake onSubmit={handleBodyMapSubmit} />
        )}
        {stage === 'generating' && (
          <div className="flex flex-col items-center justify-center h-80 gap-5">
            <div className="w-14 h-14 border-4 border-gray-900 border-t-transparent rounded-full animate-spin" />
            <div className="text-center">
              <p className="text-gray-800 font-bold text-lg">Analyzing your assessment...</p>
              <p className="text-gray-400 text-sm mt-1">3 agents: Assess → Recommend → Plan</p>
            </div>
          </div>
        )}
        {stage === 'protocol' && protocol && (
          <ProtocolCard protocol={protocol} vitals={vitalsBefore} onStartSession={() => setStage('active')} />
        )}
        {stage === 'active' && protocol && (
          <SessionActive
            sessionId={sessionId || ''}
            protocol={protocol}
            sessionType={sessionType}
            onComplete={() => setStage('vitalscan_after')}
          />
        )}
        {stage === 'vitalscan_after' && (
          <AfterScan
            vitalsBefore={vitalsBefore || { heart_rate: 74, hrv_rmssd: 38, breath_rate: 16, nervous_system_state: 'balanced', confidence: 0.7 }}
            romBefore={romBefore}
            onComplete={handleAfterScanComplete}
            onSkip={rom => { setRomAfter(rom); setStage('complete'); }}
          />
        )}
        {stage === 'sharecard' && delta && (
          <ShareCard delta={delta} patientName={patientName} sessionFocus={focusArea} onContinue={() => setStage('complete')} />
        )}
        {stage === 'complete' && routine && sessionId && (
          <SessionComplete sessionId={sessionId} routine={routine}
            onSaveROM={handleSaveROM} onFinish={() => navigate('/')} />
        )}
        {stage === 'complete' && (!routine || !sessionId) && (
          <div className="p-6 text-center">
            <p className="text-gray-600">Session data unavailable.</p>
            <button onClick={() => navigate('/')} className="mt-4 bg-gray-900 text-white rounded-xl px-6 py-3 font-bold">
              Back to Dashboard
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="fixed bottom-4 left-4 right-4 bg-red-50 border border-red-200 rounded-2xl p-4 text-red-700 text-sm shadow-lg z-50">
          <div className="flex items-start justify-between gap-3">
            <p>{error}</p>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
          </div>
        </div>
      )}
    </div>
  );
}
