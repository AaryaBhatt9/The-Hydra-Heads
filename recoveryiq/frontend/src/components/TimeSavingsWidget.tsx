interface Props {
  totalSessionsThisWeek: number;
  parallelSessionsRun?: number;
}

export default function TimeSavingsWidget({ totalSessionsThisWeek, parallelSessionsRun = 0 }: Props) {
  const intakeTimeSaved = Math.round(totalSessionsThisWeek * 4.5);
  const parallelTimeSaved = parallelSessionsRun * 9;
  const totalMins = intakeTimeSaved + parallelTimeSaved;
  const hours = (totalMins / 60).toFixed(1);
  const extraPatients = Math.floor(totalMins / 30);

  return (
    <div className="rounded-2xl p-5 text-white shadow-lg" style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}>
      <p className="text-indigo-200 text-xs uppercase tracking-widest font-bold mb-4">Time RecoveryIQ Gave Back This Week</p>
      <div className="grid grid-cols-3 gap-4 text-center">
        {[{ val: hours, label: 'hours saved' }, { val: totalSessionsThisWeek, label: 'sessions run' }, { val: `+${extraPatients}`, label: 'patients possible' }].map(s => (
          <div key={s.label}>
            <p className="text-3xl font-black">{s.val}</p>
            <p className="text-indigo-200 text-xs mt-1">{s.label}</p>
          </div>
        ))}
      </div>
      <p className="text-indigo-300 text-xs mt-4 text-center">RecoveryIQ handles intake + protocol — you handle the people</p>
    </div>
  );
}
