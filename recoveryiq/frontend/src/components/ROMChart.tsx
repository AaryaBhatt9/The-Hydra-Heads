import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ROMDataPoint } from '../types';

interface Props {
  data: ROMDataPoint[];
  patientName: string;
}

export default function ROMChart({ data, patientName }: Props) {
  const formatted = data.map(d => ({
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    Before: d.rom_before,
    After: d.rom_after,
  }));

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
      <p className="text-sm font-bold text-gray-600 mb-4">Range of Motion — {patientName}</p>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={formatted}>
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} unit="°" axisLine={false} tickLine={false} />
          <Tooltip formatter={(val: number) => `${val}°`} contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb' }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="Before" stroke="#f87171" strokeWidth={2.5} dot={{ r: 4, fill: '#f87171' }} />
          <Line type="monotone" dataKey="After" stroke="#34d399" strokeWidth={2.5} dot={{ r: 4, fill: '#34d399' }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
