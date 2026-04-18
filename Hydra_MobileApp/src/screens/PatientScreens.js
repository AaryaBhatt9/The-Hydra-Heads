import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, TextInput, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, S, T } from '../theme';
import { loadHistory, getDailyCoaching, saveSession } from '../services/api';

// ════════════════════════════════════════════════════════
//  PATIENT HOME SCREEN — daily hub
// ════════════════════════════════════════════════════════
export function PatientHomeScreen({ navigation }) {
  const [history,  setHistory]  = useState([]);
  const [coaching, setCoaching] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [name,     setName]     = useState('');
  const [nameInput,setNameInput]= useState(false);
  const [tempName, setTempName] = useState('');

  // Derived stats
  const sessions = history.length;
  const streak   = computeStreak(history);
  const avgScore = history.length ? Math.round(history.reduce((s,h)=>s+(h.score||0),0)/history.length) : 0;
  const lastSession = history[0];
  const todayDone = lastSession && new Date(lastSession.date).toDateString() === new Date().toDateString();

  useEffect(() => {
    (async () => {
      const hist = await loadHistory();
      setHistory(hist);
      const n = await loadName();
      if (n) setName(n);
      // Load daily coaching
      try {
        const c = await getDailyCoaching(n || 'there', hist, hist[0]);
        setCoaching(c);
      } catch { setCoaching(FALLBACK_COACHING); }
      setLoading(false);
    })();
  }, []);

  const saveName = async () => {
    if (tempName.trim()) {
      setName(tempName.trim());
      await storeName(tempName.trim());
    }
    setNameInput(false);
  };

  const scoreColor = s => s >= 70 ? C.success : s >= 40 ? C.fair : C.danger;
  const lastScore  = lastSession?.score || null;

  return (
    <SafeAreaView style={S.safe}>
      <ScrollView style={S.scroll} contentContainerStyle={{ padding: 20 }}>

        {/* Header */}
        <View style={[S.rowBetween, { marginBottom: 24 }]}>
          <View>
            <Text style={{ fontSize: 28, fontWeight: '700', color: C.text, letterSpacing: -0.5 }}>
              {name ? `Hey, ${name}` : 'Recovery Hub'}
            </Text>
            <Text style={{ fontSize: 13, color: C.textMid, marginTop: 3 }}>
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => { setTempName(name); setNameInput(true); }}
            style={styles.nameBtn}
          >
            <Text style={{ color: C.textMid, fontSize: 20 }}>
              {name ? name.slice(0,2).toUpperCase() : '?'}
            </Text>
          </TouchableOpacity>
        </View>

        {nameInput && (
          <View style={[S.card, { marginBottom: 14 }]}>
            <Text style={styles.label}>Your name</Text>
            <TextInput
              style={S.input}
              value={tempName}
              onChangeText={setTempName}
              placeholder="Enter your name"
              placeholderTextColor={C.textDim}
              autoFocus
            />
            <TouchableOpacity style={S.btnPrimary} onPress={saveName}>
              <Text style={S.btnPrimaryTxt}>Save</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Stats row */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
          <View style={[S.surface, styles.statCard]}>
            <Text style={styles.statNum}>{sessions}</Text>
            <Text style={styles.statLabel}>Sessions</Text>
          </View>
          <View style={[S.surface, styles.statCard]}>
            <Text style={[styles.statNum, { color: streak > 2 ? C.sun : C.text }]}>{streak}</Text>
            <Text style={styles.statLabel}>Day streak</Text>
          </View>
          <View style={[S.surface, styles.statCard]}>
            <Text style={[styles.statNum, avgScore > 0 ? { color: scoreColor(avgScore) } : {}]}>{avgScore || '—'}</Text>
            <Text style={styles.statLabel}>Avg score</Text>
          </View>
        </View>

        {/* Last recovery score */}
        {lastScore !== null && (
          <LinearGradient
            colors={[C.card, C.surface]}
            style={[styles.scoreCard, { borderColor: scoreColor(lastScore) + '40' }]}
          >
            <Text style={styles.label}>LAST RECOVERY SCORE</Text>
            <View style={[S.rowBetween, { marginTop: 6 }]}>
              <Text style={[styles.bigScore, { color: scoreColor(lastScore) }]}>{lastScore}</Text>
              <View style={{ alignItems: 'flex-end' }}>
                {lastSession.romGain > 0 && (
                  <Text style={{ fontSize: 16, color: C.success, fontWeight: '600' }}>+{lastSession.romGain}° ROM</Text>
                )}
                <Text style={{ fontSize: 12, color: C.textMid, marginTop: 2 }}>{lastSession.goal}</Text>
                <Text style={{ fontSize: 11, color: C.textDim, marginTop: 1 }}>
                  {new Date(lastSession.date).toLocaleDateString()}
                </Text>
              </View>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${lastScore}%`, backgroundColor: scoreColor(lastScore) }]} />
            </View>
          </LinearGradient>
        )}

        {/* Today's coaching */}
        {!loading && coaching && (
          <View style={S.card}>
            <View style={[S.row, S.gap8, { marginBottom: 12 }]}>
              <View style={styles.coachIcon}>
                <Text style={{ fontSize: 16 }}>◎</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>TODAY'S COACHING</Text>
                <Text style={{ fontSize: 15, color: C.text, fontWeight: '600', marginTop: 2 }}>
                  {coaching.greeting}
                </Text>
              </View>
            </View>
            <Text style={[T.body, { marginBottom: 12 }]}>{coaching.tip}</Text>

            <View style={[S.surface, { padding: 12, marginBottom: 12 }]}>
              <Text style={styles.label}>TODAY'S EXERCISE</Text>
              <Text style={{ fontSize: 13, color: C.text, lineHeight: 20, marginTop: 4 }}>{coaching.exercise}</Text>
            </View>

            <View style={[S.surface, { padding: 12 }]}>
              <Text style={styles.label}>CHECK IN WITH YOURSELF</Text>
              <Text style={{ fontSize: 13, color: C.textMid, fontStyle: 'italic', lineHeight: 20, marginTop: 4 }}>{coaching.checkIn}</Text>
            </View>
          </View>
        )}

        {/* Action buttons */}
        <TouchableOpacity
          style={[S.btnPrimary, { marginTop: 4 }]}
          onPress={() => navigation.navigate('PatientCheck')}
        >
          <Text style={S.btnPrimaryTxt}>Self ROM Check ↗</Text>
        </TouchableOpacity>

        {/* Session history */}
        {history.length > 0 && (
          <View style={[S.card, { marginTop: 16 }]}>
            <Text style={[styles.label, { marginBottom: 12 }]}>SESSION HISTORY</Text>
            {history.slice(0, 5).map((h, i) => (
              <View key={h.id || i} style={[styles.historyRow, i < Math.min(4, history.length-1) && { borderBottomWidth: 0.5, borderBottomColor: C.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, color: C.text, fontWeight: '500' }}>
                    {new Date(h.date).toLocaleDateString('en-US', { month:'short', day:'numeric' })}
                  </Text>
                  <Text style={{ fontSize: 12, color: C.textMid, marginTop: 1, textTransform: 'capitalize' }}>
                    {h.goal} · {h.areas?.slice(0,2).join(', ')}
                  </Text>
                  {h.romGain > 0 && <Text style={{ fontSize: 11, color: C.success, marginTop: 1 }}>+{h.romGain}° ROM</Text>}
                </View>
                <Text style={[styles.histScore, { color: scoreColor(h.score) }]}>{h.score}</Text>
              </View>
            ))}
          </View>
        )}

        {history.length === 0 && !loading && (
          <View style={[S.surface, { alignItems: 'center', padding: 32, marginTop: 8 }]}>
            <Text style={{ fontSize: 14, color: C.textMid, textAlign: 'center', lineHeight: 22 }}>
              No sessions yet.{'\n'}Ask your practitioner to set up your first session.
            </Text>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ════════════════════════════════════════════════════════
//  PATIENT SELF-CHECK SCREEN
// ════════════════════════════════════════════════════════
export function PatientCheckScreen({ navigation }) {
  const [romL, setRomL]     = useState('');
  const [romR, setRomR]     = useState('');
  const [pain, setPain]     = useState(5);
  const [energy, setEnergy] = useState(5);
  const [notes, setNotes]   = useState('');
  const [saved, setSaved]   = useState(false);

  const saveCheck = async () => {
    const romGain = 0; // self-check baseline
    await saveSession({
      date: new Date().toISOString(),
      patient: 'Self',
      goal: 'self-check',
      areas: [],
      romGain,
      painDrop: 0,
      score: Math.round(((10-pain)*4 + energy*4 + 12)),
      notes: `L:${romL}° R:${romR}° Pain:${pain} Energy:${energy} ${notes}`,
      selfCheck: true,
    });
    setSaved(true);
  };

  if (saved) {
    return (
      <SafeAreaView style={S.safe}>
        <View style={[S.safe, S.center]}>
          <Text style={{ fontSize: 56, marginBottom: 16 }}>✓</Text>
          <Text style={{ fontSize: 22, fontWeight: '700', color: C.text }}>Check-in saved</Text>
          <Text style={{ fontSize: 14, color: C.textMid, marginTop: 8, marginBottom: 32, textAlign: 'center', paddingHorizontal: 40 }}>
            Your practitioner will see this at your next visit.
          </Text>
          <TouchableOpacity style={[S.btnPrimary, { width: 220 }]} onPress={() => navigation.goBack()}>
            <Text style={S.btnPrimaryTxt}>Back to Home ↗</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={S.safe}>
      <ScrollView style={S.scroll} contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">

        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 26, fontWeight: '700', color: C.text, letterSpacing: -0.5 }}>Self Check-In</Text>
          <Text style={{ fontSize: 13, color: C.textMid, marginTop: 3 }}>Log how you feel today · Builds your recovery data</Text>
        </View>

        <View style={S.card}>
          <Text style={styles.label}>RANGE OF MOTION (estimate)</Text>
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, color: C.textMid, marginBottom: 6 }}>Left side (°)</Text>
              <TextInput style={S.input} value={romL} onChangeText={setRomL} placeholder="e.g. 128" placeholderTextColor={C.textDim} keyboardType="numeric" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, color: C.textMid, marginBottom: 6 }}>Right side (°)</Text>
              <TextInput style={S.input} value={romR} onChangeText={setRomR} placeholder="e.g. 156" placeholderTextColor={C.textDim} keyboardType="numeric" />
            </View>
          </View>

          <Text style={styles.label}>DISCOMFORT LEVEL — {pain}/10</Text>
          <View style={[S.row, { flexWrap: 'wrap', gap: 6, marginBottom: 16 }]}>
            {[0,1,2,3,4,5,6,7,8,9,10].map(n => (
              <TouchableOpacity key={n} onPress={()=>setPain(n)} style={[styles.ratingBtn, pain===n && { backgroundColor: C.danger, borderColor: C.danger }]}>
                <Text style={[styles.ratingTxt, pain===n && { color: C.bg }]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>ENERGY LEVEL — {energy}/10</Text>
          <View style={[S.row, { flexWrap: 'wrap', gap: 6, marginBottom: 16 }]}>
            {[0,1,2,3,4,5,6,7,8,9,10].map(n => (
              <TouchableOpacity key={n} onPress={()=>setEnergy(n)} style={[styles.ratingBtn, energy===n && { backgroundColor: C.success, borderColor: C.success }]}>
                <Text style={[styles.ratingTxt, energy===n && { color: C.bg }]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>NOTES</Text>
          <TextInput
            style={[S.input, { height: 72, textAlignVertical: 'top', marginBottom: 16 }]}
            value={notes}
            onChangeText={setNotes}
            placeholder="How does your body feel today?"
            placeholderTextColor={C.textDim}
            multiline
          />

          <TouchableOpacity style={S.btnPrimary} onPress={saveCheck}>
            <Text style={S.btnPrimaryTxt}>Save Check-In ↗</Text>
          </TouchableOpacity>
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function computeStreak(history) {
  if (!history.length) return 0;
  const dates = [...new Set(history.map(h => new Date(h.date).toDateString()))];
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 30; i++) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    if (dates.includes(d.toDateString())) streak++;
    else break;
  }
  return streak;
}

const FALLBACK_COACHING = {
  greeting: 'Keep building on your progress.',
  tip: 'Focus on gentle movement today — consistent, small actions build lasting mobility gains.',
  exercise: 'Take 2 minutes to do 10 slow shoulder rolls each direction, then 10 controlled hip circles.',
  checkIn: 'On a scale of 1–10, how mobile do you feel compared to last week?',
};

async function loadName() {
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const n = await AsyncStorage.getItem('@hw3_patient_name');
    return n || '';
  } catch { return ''; }
}
async function storeName(n) {
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    await AsyncStorage.setItem('@hw3_patient_name', n);
  } catch {}
}

const styles = StyleSheet.create({
  label: { fontSize: 11, fontWeight: '600', color: C.textMid, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  statCard:   { flex: 1, alignItems: 'center', paddingVertical: 14 },
  statNum:    { fontSize: 28, fontWeight: '700', color: C.text, letterSpacing: -0.5 },
  statLabel:  { fontSize: 11, color: C.textMid, marginTop: 2 },
  scoreCard:  { borderRadius: 16, borderWidth: 1, padding: 18, marginBottom: 14 },
  bigScore:   { fontSize: 72, fontWeight: '700', letterSpacing: -2, lineHeight: 76 },
  progressTrack: { height: 4, backgroundColor: C.border, borderRadius: 2, overflow: 'hidden', marginTop: 14 },
  progressFill:  { height: '100%', borderRadius: 2 },
  coachIcon:  { width: 40, height: 40, borderRadius: 10, backgroundColor: C.moon+'15', borderWidth: 0.5, borderColor: C.moon+'40', alignItems: 'center', justifyContent: 'center' },
  nameBtn:    { width: 48, height: 48, borderRadius: 24, backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  historyRow: { paddingVertical: 12, flexDirection: 'row', alignItems: 'center' },
  histScore:  { fontSize: 24, fontWeight: '700' },
  ratingBtn:  { width: 30, height: 30, borderRadius: 8, borderWidth: 0.5, borderColor: C.borderMid, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface },
  ratingTxt:  { fontSize: 12, color: C.textMid, fontWeight: '500' },
});
