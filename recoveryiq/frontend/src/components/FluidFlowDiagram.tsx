import { MultiPadProtocol } from '../types';

interface Props {
  protocol: MultiPadProtocol;
}

const LANDMARKS: Record<string, { x: number; y: number; label: string }> = {
  neck:            { x: 50, y: 11, label: 'Neck' },
  left_shoulder:   { x: 28, y: 21, label: 'L. Shoulder' },
  right_shoulder:  { x: 72, y: 21, label: 'R. Shoulder' },
  upper_back:      { x: 50, y: 27, label: 'Upper Back' },
  lower_back:      { x: 50, y: 41, label: 'Lower Back' },
  left_hip:        { x: 34, y: 51, label: 'L. Hip' },
  right_hip:       { x: 66, y: 51, label: 'R. Hip' },
  left_knee:       { x: 34, y: 69, label: 'L. Knee' },
  right_knee:      { x: 66, y: 69, label: 'R. Knee' },
  lymph_nodes:     { x: 50, y: 34, label: 'Lymph Nodes' },
  kidney:          { x: 50, y: 39, label: 'Kidney Region' },
  feet:            { x: 50, y: 89, label: 'Feet' },
};

const PAD_COLORS = {
  sun:  { fill: '#fef2f2', stroke: '#ef4444', dot: '#dc2626' },
  moon: { fill: '#eff6ff', stroke: '#3b82f6', dot: '#2563eb' },
};

function resolveLocation(loc: string) {
  const key = loc.toLowerCase().replace(/ /g, '_');
  return LANDMARKS[key] || LANDMARKS['lower_back'];
}

export default function FluidFlowDiagram({ protocol }: Props) {
  const flowPath = protocol.pads
    .sort((a, b) => a.sequence_order - b.sequence_order)
    .map(pad => resolveLocation(pad.body_location));

  const destination = LANDMARKS['lymph_nodes'];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
      <p className="text-sm font-bold text-gray-700 mb-1">Fluid Flow Protocol</p>
      <p className="text-xs text-gray-500 mb-4">{protocol.flow_narrative}</p>
      <div className="flex gap-5">
        <div className="flex-shrink-0">
          <svg viewBox="0 0 100 100" width={130} height={260} className="overflow-visible">
            <defs>
              <marker id="arr-flow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#8b5cf6" />
              </marker>
              <marker id="arr-dest" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#10b981" />
              </marker>
            </defs>
            <ellipse cx="50" cy="13" rx="9" ry="10" fill="#f3f4f6" stroke="#d1d5db" strokeWidth="1"/>
            <rect x="36" y="25" width="28" height="44" rx="4" fill="#f3f4f6" stroke="#d1d5db" strokeWidth="1"/>
            <rect x="22" y="27" width="12" height="36" rx="6" fill="#f3f4f6" stroke="#d1d5db" strokeWidth="1"/>
            <rect x="66" y="27" width="12" height="36" rx="6" fill="#f3f4f6" stroke="#d1d5db" strokeWidth="1"/>
            <rect x="36" y="70" width="12" height="26" rx="6" fill="#f3f4f6" stroke="#d1d5db" strokeWidth="1"/>
            <rect x="52" y="70" width="12" height="26" rx="6" fill="#f3f4f6" stroke="#d1d5db" strokeWidth="1"/>

            {flowPath.map((point, i) => {
              if (i === flowPath.length - 1) return null;
              const next = flowPath[i + 1];
              return (
                <line key={i}
                  x1={point.x} y1={point.y} x2={next.x} y2={next.y}
                  stroke="#8b5cf6" strokeWidth="1.5" strokeDasharray="3,2"
                  markerEnd="url(#arr-flow)" opacity={0.8}
                />
              );
            })}

            {flowPath.length > 0 && (
              <line
                x1={flowPath[flowPath.length - 1].x} y1={flowPath[flowPath.length - 1].y}
                x2={destination.x} y2={destination.y}
                stroke="#10b981" strokeWidth="1.5" strokeDasharray="3,2"
                markerEnd="url(#arr-dest)"
              />
            )}

            {protocol.pads.map((pad, i) => {
              const pos = resolveLocation(pad.body_location);
              const colors = PAD_COLORS[pad.pad_type];
              return (
                <g key={i}>
                  <circle cx={pos.x} cy={pos.y} r="6" fill={colors.fill} stroke={colors.stroke} strokeWidth="1.5"/>
                  <text x={pos.x} y={pos.y + 1.5} textAnchor="middle" fontSize="5" fill={colors.dot} fontWeight="bold">
                    {pad.pad_type === 'sun' ? '☀' : '🌙'}
                  </text>
                </g>
              );
            })}

            <circle cx={destination.x} cy={destination.y} r="5" fill="#d1fae5" stroke="#10b981" strokeWidth="1.5"/>
            <text x={destination.x} y={destination.y + 1.5} textAnchor="middle" fontSize="4.5" fill="#059669">⬇</text>
          </svg>
        </div>

        <div className="flex-1 space-y-2 min-w-0">
          {protocol.pads.map((pad, i) => {
            const colors = PAD_COLORS[pad.pad_type];
            return (
              <div key={i} className="p-3 rounded-xl"
                style={{ background: colors.fill, borderLeft: `3px solid ${colors.stroke}` }}>
                <p className="text-xs font-bold" style={{ color: colors.dot }}>
                  {pad.pad_type === 'sun' ? '☀️ Sun' : '🌙 Moon'} #{pad.sequence_order}
                </p>
                <p className="text-xs text-gray-700 mt-0.5">{pad.body_location}</p>
                <p className="text-xs text-gray-500">{pad.flow_direction} · {pad.purpose}</p>
              </div>
            );
          })}
          <div className="p-3 rounded-xl bg-green-50 border-l-4 border-green-400">
            <p className="text-xs text-green-700 font-semibold">⬇ Lymph nodes / kidney region</p>
          </div>
        </div>
      </div>
    </div>
  );
}
