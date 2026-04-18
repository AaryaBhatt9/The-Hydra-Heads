import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, TextInput, Switch, Alert,
} from 'react-native';
import { C, S, T } from '../theme';
import { romStatus, NORMS } from '../utils/pose';
import { generateProtocol, buildSessionConfig, deviceLogin, sendMQTT, saveSession, loadSettings } from '../services/api';

const BODY_AREAS = ['Neck','Left Shoulder','Right Shoulder','Upper Back','Lower Back','Left Hip','Right Hip','Left Knee','Right Knee','Left Calf','Right Calf','Feet'];
const PTYPES = [['physical_therapist','Physical Therapist'],['chiropractor','Chiropractor'],['sports_trainer','Sports Trainer'],['medspa','MedSpa / Wellness']];
const CONCERNS = [['recovery','Post-Workout Recovery'],['muscle_tension','Muscle Tension'],['activation','Pre-Game Warmup'],['chronic_discomfort','Chronic Discomfort'],['nervous_system','Nervous System Reset'],['mobility','Mobility / ROM']];
const TOTAL_SECS = 540;

// ── Shared components ────────────────────────────────────────────────────────

function SectionHeader({ title, sub }) {
  return (
    <View style={{ marginBottom: 20 }}>
      <Text style={{ fontSize: 26, fontWeight: '700', color: C.text, letterSpacing: -0.5 }}>{title}</Text>
      {sub && <Text style={{ fontSize: 13, color: C.textMid, marginTop: 3 }}>{sub}</Text>}
    </View>
  );
}

function Chip({ label, selected, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && { borderColor: C.sun, backgroundColor: C.sun + '15' }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.chipTxt, selected && { color: C.sun, fontWeight: '600' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function LabeledInput({ label, value, onChangeText, placeholder, keyboardType, secure }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        style={S.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.textDim}
        keyboardType={keyboardType || 'default'}
        secureTextEntry={secure}
      />
    </View>
  );
}

function PadCard({ side, area, isHot }) {
  const col = isHot ? C.sun : C.moon;
  return (
    <View style={[styles.padCard, { borderColor: col + '50', backgroundColor: col + '10' }]}>
      <Text style={[styles.padLabel, { color: col }]}>{side.toUpperCase()} — {isHot ? 'HEAT + RED 660nm' : 'COOL + BLUE 450nm'}</Text>
      <Text style={[styles.padArea, { color: col }]}>{area}</Text>
    </View>
  );
}

// ════════════════════════════════════════════════════════
//  INTAKE SCREEN
// ════════════════════════════════════════════════════════
export function IntakeScreen({ route, navigation }) {
  const { assessment } = route.params || {};
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [ptype, setPtype] = useState('physical_therapist');
  const [concern, setConcern] = useState('recovery');
  const [areas, setAreas] = useState(assessment?.areas || []);
  const [mobility, setMobility] = useState(assessment?.mobilityScore || 5);
  const [hrv, setHrv] = useState('');
  const [sleep, setSleep] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggleArea = a => setAreas(prev => prev.includes(a) ? prev.filter(x=>x!==a) : [...prev,a]);

  const generate = async () => {
    if (!name) { setError('Please enter the client name.'); return; }
    if (!areas.length) { setError('Please select at least one focus area.'); return; }
    setError(''); setLoading(true);
    try {
      const patient = { name, age, practitionerType:ptype, primaryConcern:concern, areas, mobilityScore:mobility, hrv, sleepQuality:sleep };
      const proto = await generateProtocol(patient, assessment);
      navigation.navigate('Protocol', { patient, protocol: proto, assessment });
    } catch { setError('Protocol generation failed. Check connection.'); }
    setLoading(false);
  };

  return (
    <SafeAreaView style={S.safe}>
      <ScrollView style={S.scroll} contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
        <SectionHeader title="Patient Intake" sub={assessment ? 'Camera data loaded · Confirm details' : 'Complete in under 60 seconds'} />

        {assessment && (
          <View style={[styles.banner, { borderLeftColor: C.sun }]}>
            <Text style={styles.bannerLabel}>FROM CAMERA ASSESSMENT</Text>
            <Text style={styles.bannerText}>
              Shoulder R {assessment.shoulderR}° / L {assessment.shoulderL}° · Knee R {assessment.kneeR}° / L {assessment.kneeL}°
              {assessment.heartRate ? ` · HR ${assessment.heartRate} bpm` : ''}
            </Text>
            {assessment.flags?.length > 0 && (
              <Text style={[styles.bannerText, { color: C.limited, marginTop: 2 }]}>
                {assessment.flags[0]}{assessment.flags.length > 1 ? ` +${assessment.flags.length - 1} more` : ''}
              </Text>
            )}
          </View>
        )}

        <View style={S.card}>
          <LabeledInput label="Client Name" value={name} onChangeText={setName} placeholder="Full name" />
          <LabeledInput label="Age" value={age} onChangeText={setAge} placeholder="Age" keyboardType="numeric" />

          <Text style={styles.inputLabel}>Practitioner Type</Text>
          <View style={styles.pillRow}>
            {PTYPES.map(([v,l]) => (
              <Chip key={v} label={l} selected={ptype===v} onPress={()=>setPtype(v)} />
            ))}
          </View>

          <Text style={[styles.inputLabel, { marginTop: 14 }]}>Primary Wellness Goal</Text>
          <View style={styles.pillRow}>
            {CONCERNS.map(([v,l]) => (
              <Chip key={v} label={l} selected={concern===v} onPress={()=>setConcern(v)} />
            ))}
          </View>

          <Text style={[styles.inputLabel, { marginTop: 14 }]}>Focus Areas {assessment ? '(pre-filled from camera)' : ''}</Text>
          <View style={styles.pillRow}>
            {BODY_AREAS.map(a => <Chip key={a} label={a} selected={areas.includes(a)} onPress={()=>toggleArea(a)} />)}
          </View>

          <Text style={[styles.inputLabel, { marginTop: 14 }]}>Mobility Score — {mobility}/10</Text>
          <View style={[S.row, { gap: 12, marginBottom: 14 }]}>
            {[1,2,3,4,5,6,7,8,9,10].map(n => (
              <TouchableOpacity
                key={n}
                onPress={()=>setMobility(n)}
                style={[styles.scoreBtn, mobility===n && { backgroundColor: C.sun, borderColor: C.sun }]}
              >
                <Text style={[styles.scoreBtnTxt, mobility===n && { color: C.bg }]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <LabeledInput label={`HRV (ms)${assessment?.heartRate ? ` · rPPG: ${assessment.heartRate} bpm` : ''}`} value={hrv} onChangeText={setHrv} placeholder="e.g. 45" keyboardType="numeric" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>Sleep Quality</Text>
              <View style={styles.pillRow}>
                {[['poor','Poor'],['fair','Fair'],['good','Good'],['excellent','Great']].map(([v,l])=>(
                  <Chip key={v} label={l} selected={sleep===v} onPress={()=>setSleep(v)} />
                ))}
              </View>
            </View>
          </View>

          {error ? <Text style={{ color: C.danger, fontSize: 13, marginBottom: 10 }}>{error}</Text> : null}

          <TouchableOpacity style={S.btnPrimary} onPress={generate} disabled={loading}>
            <Text style={S.btnPrimaryTxt}>
              {loading ? 'Generating...' : `Generate Protocol ${assessment ? '(Camera-Assisted) ↗' : '↗'}`}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ════════════════════════════════════════════════════════
//  PROTOCOL SCREEN
// ════════════════════════════════════════════════════════
export function ProtocolScreen({ route, navigation }) {
  const { patient, protocol, assessment } = route.params;
  const [settings, setSettings] = useState(null);
  const [devErr, setDevErr] = useState('');
  const [starting, setStarting] = useState(false);

  useEffect(() => { loadSettings().then(setSettings); }, []);

  const startSession = async () => {
    setDevErr(''); setStarting(true);
    if (!settings?.serverUrl) {
      navigation.navigate('Session', { patient, protocol, assessment, demoMode: true });
      setStarting(false); return;
    }
    try {
      const token = await deviceLogin(settings.serverUrl, settings.username, settings.password);
      const config = buildSessionConfig(settings.deviceMac, protocol);
      await sendMQTT(settings.serverUrl, token, config);
      navigation.navigate('Session', { patient, protocol, assessment, token, settings });
    } catch (e) { setDevErr(e.message); }
    setStarting(false);
  };

  const GOAL_COLORS = { relaxation:C.moon, activation:C.sun, recovery:C.good, reset:'#A78BFA' };
  const gCol = GOAL_COLORS[protocol.goal] || C.textMid;

  return (
    <SafeAreaView style={S.safe}>
      <ScrollView style={S.scroll} contentContainerStyle={{ padding: 20 }}>
        <SectionHeader title="Protocol" sub={`${patient.name}${assessment ? ' · Camera-assisted' : ''}`} />

        {protocol.primaryFinding && (
          <View style={[styles.banner, { borderLeftColor: C.sun }]}>
            <Text style={styles.bannerLabel}>KEY FINDING</Text>
            <Text style={styles.bannerText}>{protocol.primaryFinding}</Text>
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
          {[['Goal', protocol.goal], ['Intensity', protocol.intensity], ['Duration', `${protocol.sessionDurationMinutes}m`]].map(([l, v]) => (
            <View key={l} style={[S.surface, { flex: 1, alignItems: 'center' }]}>
              <Text style={styles.inputLabel}>{l}</Text>
              <Text style={{ fontSize: 15, fontWeight: '600', color: C.text, textTransform: 'capitalize', marginTop: 2 }}>{v}</Text>
            </View>
          ))}
        </View>

        <View style={S.card}>
          <Text style={[styles.inputLabel, { marginBottom: 10 }]}>PAD PLACEMENT</Text>
          <View style={{ gap: 10, marginBottom: 16 }}>
            <PadCard side="Sun Pad" area={protocol.sunPadPlacement} isHot={true} />
            <PadCard side="Moon Pad" area={protocol.moonPadPlacement} isHot={false} />
          </View>

          {protocol.asymmetryNote && protocol.asymmetryNote !== 'null' && (
            <>
              <View style={S.divider} />
              <Text style={[styles.inputLabel, { marginBottom: 6 }]}>ASYMMETRY NOTE</Text>
              <Text style={T.body}>{protocol.asymmetryNote}</Text>
            </>
          )}

          <View style={S.divider} />
          <Text style={[styles.inputLabel, { marginBottom: 6 }]}>PROTOCOL REASONING</Text>
          <Text style={T.body}>{protocol.reasoning}</Text>

          <View style={S.divider} />
          <Text style={[styles.inputLabel, { marginBottom: 6 }]}>BETWEEN-VISIT TIP</Text>
          <Text style={[T.body, { color: C.textMid, fontStyle: 'italic' }]}>{protocol.coachingTip}</Text>

          <View style={S.divider} />
          <Text style={[styles.inputLabel, { marginBottom: 4 }]}>RETEST AFTER SESSION</Text>
          <Text style={T.body}>{protocol.recoveryFocus}</Text>
        </View>

        <View style={[S.surface, { marginBottom: 16 }]}>
          <Text style={[styles.inputLabel, { marginBottom: 8 }]}>MQTT PAYLOAD</Text>
          {(() => {
            const cfg = buildSessionConfig(settings?.deviceMac || '[MAC]', protocol);
            return (
              <Text style={{ fontFamily: 'Courier New', fontSize: 10, color: C.textMid, lineHeight: 17 }}>
                {`topic: "HydraWav3Pro/config"\nmac: "${cfg.mac}"\nleftFuncs: ${JSON.stringify(cfg.leftFuncs)}\nrightFuncs: ${JSON.stringify(cfg.rightFuncs)}\npwm hot: ${JSON.stringify(cfg.pwmValues.hot)}\nvib: ${cfg.vibMin}–${cfg.vibMax}`}
              </Text>
            );
          })()}
        </View>

        {devErr ? <Text style={{ color: C.danger, fontSize: 13, marginBottom: 10 }}>{devErr}</Text> : null}
        <TouchableOpacity style={S.btnPrimary} onPress={startSession} disabled={starting}>
          <Text style={S.btnPrimaryTxt}>
            {starting ? 'Connecting...' : (settings?.serverUrl ? 'Start Session on Device ↗' : 'Start Session (Demo Mode) ↗')}
          </Text>
        </TouchableOpacity>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ════════════════════════════════════════════════════════
//  SESSION SCREEN
// ════════════════════════════════════════════════════════
export function SessionScreen({ route, navigation }) {
  const { patient, protocol, assessment, token, settings, demoMode } = route.params;
  const [status, setStatus] = useState('running'); // running|paused|complete
  const [elapsed, setElapsed] = useState(0);
  const [log, setLog] = useState(demoMode ? ['[DEMO] Session started'] : ['Session started on device']);
  const timer = useRef(null);

  useEffect(() => {
    if (status === 'running') {
      timer.current = setInterval(() => {
        setElapsed(e => {
          if (e >= TOTAL_SECS) { clearInterval(timer.current); setStatus('complete'); return TOTAL_SECS; }
          return e + 1;
        });
      }, 1000);
    } else clearInterval(timer.current);
    return () => clearInterval(timer.current);
  }, [status]);

  const addLog = m => setLog(l => [...l, m]);

  const pauseResume = async () => {
    const pausing = status === 'running';
    if (!demoMode && settings && token) {
      try { await sendMQTT(settings.serverUrl, token, { mac: settings.deviceMac, playCmd: pausing ? 2 : 4 }); } catch {}
    }
    setStatus(pausing ? 'paused' : 'running');
    addLog(pausing ? 'Session paused' : 'Session resumed');
  };

  const stop = async () => {
    if (!demoMode && settings && token) {
      try { await sendMQTT(settings.serverUrl, token, { mac: settings.deviceMac, playCmd: 3 }); } catch {}
    }
    clearInterval(timer.current);
    setStatus('complete');
    addLog('Session stopped');
  };

  const remaining = TOTAL_SECS - elapsed;
  const pct = (elapsed / TOTAL_SECS) * 100;
  const fmt = s => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;

  return (
    <SafeAreaView style={S.safe}>
      <ScrollView style={S.scroll} contentContainerStyle={{ padding: 20 }}>
        <SectionHeader title="Active Session" sub={`${patient.name} · ${protocol.goal} · ${protocol.intensity}`} />

        <View style={[S.card, { alignItems: 'center', paddingVertical: 32 }]}>
          <Text style={styles.timerStatus}>
            {status==='running' ? 'TIME REMAINING' : status==='paused' ? 'PAUSED' : 'COMPLETE'}
          </Text>
          <Text style={[styles.timerDisplay, { color: status==='complete' ? C.success : C.text }]}>
            {status==='complete' ? '0:00' : fmt(remaining)}
          </Text>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, {
              width: `${Math.min(100, pct)}%`,
              backgroundColor: status==='complete' ? C.success : C.sun,
            }]} />
          </View>

          <View style={styles.padTags}>
            <View style={[styles.padTag, { borderColor: C.sun+'50', backgroundColor: C.sun+'10' }]}>
              <Text style={[styles.padTagTxt, { color: C.sun }]}>☀ Sun → {protocol.sunPadPlacement}</Text>
            </View>
            <View style={[styles.padTag, { borderColor: C.moon+'50', backgroundColor: C.moon+'10' }]}>
              <Text style={[styles.padTagTxt, { color: C.moon }]}>◎ Moon → {protocol.moonPadPlacement}</Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 10, width: '100%', marginTop: 8 }}>
            {status === 'running' && (
              <TouchableOpacity style={[S.btnGhost, { flex: 1 }]} onPress={pauseResume}>
                <Text style={S.btnGhostTxt}>Pause</Text>
              </TouchableOpacity>
            )}
            {status === 'paused' && (
              <TouchableOpacity style={[S.btnPrimary, { flex: 1, marginTop: 0 }]} onPress={pauseResume}>
                <Text style={S.btnPrimaryTxt}>Resume</Text>
              </TouchableOpacity>
            )}
            {(status === 'running' || status === 'paused') && (
              <TouchableOpacity style={[S.btnDanger, { flex: 1 }]} onPress={stop}>
                <Text style={S.btnDangerTxt}>Stop</Text>
              </TouchableOpacity>
            )}
            {status === 'complete' && (
              <TouchableOpacity
                style={[S.btnPrimary, { flex: 1, marginTop: 0 }]}
                onPress={() => navigation.navigate('Outcome', { patient, protocol, assessment })}
              >
                <Text style={S.btnPrimaryTxt}>Log Outcomes ↗</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={S.card}>
          <Text style={styles.inputLabel}>SESSION LOG</Text>
          {log.map((m, i) => (
            <Text key={i} style={{ fontFamily: 'Courier New', fontSize: 11, color: C.textMid, lineHeight: 18, marginTop: 2 }}>{m}</Text>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ════════════════════════════════════════════════════════
//  OUTCOME SCREEN
// ════════════════════════════════════════════════════════
export function OutcomeScreen({ route, navigation }) {
  const { patient, protocol, assessment } = route.params;
  const [romBefore, setRomBefore] = useState(assessment?.shoulderR?.toString() || '');
  const [romAfter,  setRomAfter]  = useState('');
  const [painBefore, setPainBefore] = useState(5);
  const [painAfter,  setPainAfter]  = useState(3);
  const [notes, setNotes] = useState('');
  const [score, setScore] = useState(null);

  const calculate = async () => {
    const rg = (parseInt(romAfter)||0) - (parseInt(romBefore)||0);
    const pd = painBefore - painAfter;
    const s  = Math.min(100, Math.max(0, 50 + rg*2 + pd*5));
    setScore(s);
    await saveSession({
      date: new Date().toISOString(),
      patient: patient.name,
      goal: protocol.goal,
      areas: patient.areas,
      romGain: rg,
      painDrop: pd,
      score: s,
      notes,
      coachingTip: protocol.coachingTip,
      recoveryFocus: protocol.recoveryFocus,
      hasCamera: !!assessment,
    });
  };

  if (score !== null) {
    const col = score>=70 ? C.success : score>=40 ? C.fair : C.danger;
    return (
      <SafeAreaView style={S.safe}>
        <ScrollView style={S.scroll} contentContainerStyle={{ padding: 20 }}>
          <SectionHeader title="Recovery Outcomes" />
          <View style={[S.card, { alignItems: 'center', paddingVertical: 36 }]}>
            <Text style={styles.inputLabel}>RECOVERY SCORE</Text>
            <Text style={[styles.bigScore, { color: col }]}>{score}</Text>
            <Text style={{ fontSize: 14, color: C.textMid, textAlign: 'center', marginTop: 6 }}>
              {score>=70 ? 'Excellent — the body responded well.' : score>=40 ? 'Good progress — compound next visit.' : 'Keep going — recovery builds over time.'}
            </Text>
          </View>
          {protocol.coachingTip && (
            <View style={[styles.banner, { borderLeftColor: C.moon }]}>
              <Text style={styles.bannerLabel}>BETWEEN-VISIT COACHING</Text>
              <Text style={styles.bannerText}>{protocol.coachingTip}</Text>
              <Text style={[styles.bannerText, { color: C.textDim, marginTop: 4 }]}>Track: {protocol.recoveryFocus}</Text>
            </View>
          )}
          <TouchableOpacity style={S.btnPrimary} onPress={() => navigation.navigate('Assess')}>
            <Text style={S.btnPrimaryTxt}>New Client Session ↗</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={S.safe}>
      <ScrollView style={S.scroll} contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
        <SectionHeader title="Log Outcomes" sub="Re-test results build the data layer" />
        <View style={S.card}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <LabeledInput label={`${protocol.recoveryFocus || 'ROM'} Before (°)`} value={romBefore} onChangeText={setRomBefore} placeholder="e.g. 40" keyboardType="numeric" />
            </View>
            <View style={{ flex: 1 }}>
              <LabeledInput label={`${protocol.recoveryFocus || 'ROM'} After (°)`} value={romAfter} onChangeText={setRomAfter} placeholder="e.g. 57" keyboardType="numeric" />
            </View>
          </View>

          <Text style={styles.inputLabel}>Discomfort Before — {painBefore}/10</Text>
          <View style={[S.row, { gap: 6, marginBottom: 14, flexWrap: 'wrap' }]}>
            {[0,1,2,3,4,5,6,7,8,9,10].map(n => (
              <TouchableOpacity key={n} onPress={()=>setPainBefore(n)} style={[styles.scoreBtn, painBefore===n && { backgroundColor: C.danger, borderColor: C.danger }]}>
                <Text style={[styles.scoreBtnTxt, painBefore===n && { color: C.bg }]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.inputLabel}>Discomfort After — {painAfter}/10</Text>
          <View style={[S.row, { gap: 6, marginBottom: 14, flexWrap: 'wrap' }]}>
            {[0,1,2,3,4,5,6,7,8,9,10].map(n => (
              <TouchableOpacity key={n} onPress={()=>setPainAfter(n)} style={[styles.scoreBtn, painAfter===n && { backgroundColor: C.success, borderColor: C.success }]}>
                <Text style={[styles.scoreBtnTxt, painAfter===n && { color: C.bg }]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.inputLabel}>Practitioner Notes</Text>
          <TextInput
            style={[S.input, { height: 80, textAlignVertical: 'top' }]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Client feedback, observations..."
            placeholderTextColor={C.textDim}
            multiline
          />
          <TouchableOpacity style={S.btnPrimary} onPress={calculate}>
            <Text style={S.btnPrimaryTxt}>Calculate Recovery Score ↗</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  chip:     { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 0.5, borderColor: C.borderMid, backgroundColor: C.surface, margin: 3 },
  chipTxt:  { fontSize: 12, color: C.textMid, fontWeight: '500' },
  pillRow:  { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4, marginHorizontal: -3 },
  inputLabel: { fontSize: 11, fontWeight: '600', color: C.textMid, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  scoreBtn: { width: 28, height: 28, borderRadius: 8, borderWidth: 0.5, borderColor: C.borderMid, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface },
  scoreBtnTxt: { fontSize: 12, color: C.textMid, fontWeight: '500' },
  banner:   { borderLeftWidth: 3, paddingLeft: 14, paddingVertical: 10, paddingRight: 12, backgroundColor: C.surface, borderRadius: 10, marginBottom: 14 },
  bannerLabel: { fontSize: 10, fontWeight: '700', color: C.textDim, letterSpacing: 1, marginBottom: 4, textTransform: 'uppercase' },
  bannerText: { fontSize: 13, color: C.text, lineHeight: 20 },
  padCard:  { borderRadius: 12, borderWidth: 0.5, padding: 14 },
  padLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 4, textTransform: 'uppercase' },
  padArea:  { fontSize: 18, fontWeight: '700' },
  timerStatus: { fontSize: 11, fontWeight: '600', color: C.textMid, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  timerDisplay: { fontSize: 72, fontWeight: '700', letterSpacing: -2, marginBottom: 8 },
  progressTrack: { width: '100%', height: 4, backgroundColor: C.border, borderRadius: 2, overflow: 'hidden', marginBottom: 18 },
  progressFill:  { height: '100%', borderRadius: 2 },
  padTags:  { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 20 },
  padTag:   { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 0.5 },
  padTagTxt:{ fontSize: 12, fontWeight: '500' },
  bigScore: { fontSize: 90, fontWeight: '700', letterSpacing: -3, lineHeight: 95 },
});
