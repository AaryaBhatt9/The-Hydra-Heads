import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Patient } from '../types';
import ROMChart from '../components/ROMChart';
import TimeSavingsWidget from '../components/TimeSavingsWidget';

export default function DashboardPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.getPatients().then(data => { setPatients(data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const totalSessions = patients.reduce((s, p) => s + p.session_count, 0);
  const allROM = patients.flatMap(p => p.rom_trend.map(s => s.rom_after - s.rom_before));
  const avgGain = allROM.length > 0 ? Math.round(allROM.reduce((a, b) => a + b, 0) / allROM.length) : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div>
          <h1 className="text-xl font-black text-gray-900">RecoveryIQ</h1>
          <p className="text-xs text-gray-400">Powered by Hydrawav3</p>
        </div>
        <button onClick={() => navigate('/new-session')}
          className="bg-gray-900 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-gray-700 transition shadow-sm">
          + New Session
        </button>
      </div>

      <div className="px-6 py-5 space-y-5 max-w-2xl mx-auto pb-10">
        <div className="grid grid-cols-3 gap-3">
          {[
            { val: patients.length, label: 'Active Clients', color: 'text-gray-800' },
            { val: totalSessions, label: 'Total Sessions', color: 'text-gray-800' },
            { val: avgGain > 0 ? `+${avgGain}°` : '—', label: 'Avg ROM Gain', color: 'text-green-600' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-4 text-center shadow-sm">
              <p className={`text-2xl font-black ${s.color}`}>{s.val}</p>
              <p className="text-xs text-gray-400 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        <TimeSavingsWidget totalSessionsThisWeek={totalSessions} />

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="font-black text-gray-800 text-lg">Patients</h2>
            {patients.map(patient => (
              <div key={patient.id} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-black text-gray-800 text-lg">{patient.name}</p>
                    <p className="text-sm text-gray-500 mt-0.5">{patient.age} · {patient.condition}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
                        {patient.session_count} sessions
                      </span>
                      <span className={`text-xs px-2.5 py-1 rounded-full ${
                        patient.activity_level === 'high' ? 'bg-red-50 text-red-600' :
                        patient.activity_level === 'moderate' ? 'bg-yellow-50 text-yellow-600' : 'bg-green-50 text-green-600'
                      }`}>
                        {patient.activity_level} activity
                      </span>
                    </div>
                    {patient.last_session && (
                      <p className="text-xs text-gray-400 mt-1">Last: {new Date(patient.last_session).toLocaleDateString()}</p>
                    )}
                  </div>
                  <button onClick={() => navigate(`/new-session?patient=${patient.id}`)}
                    className="text-sm bg-gray-900 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-gray-700 transition shadow-sm">
                    New Session
                  </button>
                </div>
                {patient.rom_trend.length > 0 && (
                  <ROMChart data={patient.rom_trend} patientName={patient.name} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
