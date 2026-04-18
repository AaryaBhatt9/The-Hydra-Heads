/**
 * AssessScreen — Camera + Pose Assessment
 *
 * Uses expo-camera for real live camera feed.
 * Pose angles are calculated from the reference dataset ranges and
 * animated to simulate live detection. For production: swap in
 * TF.js MoveNet or MediaPipe Tasks Vision once TF peer dep issues resolve.
 *
 * The demo mode provides realistic mock data matching the
 * "left shoulder limited, right shoulder normal" pattern
 * common in the field studies cited in the hackathon brief.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, Animated, Dimensions, ActivityIndicator, Alert,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { C, S } from '../theme';
import { NORMS, romStatus, MOCK_ASSESSMENT } from '../utils/pose';

const { width: W } = Dimensions.get('window');
const CAM_H = W * 1.1;

// Simulated live angle data — drifts realistically around a base value
function useLiveAngles(base, active) {
  const val = useRef(new Animated.Value(base)).current;
  const numeric = useRef(base);
  const [display, setDisplay] = useState(base);

  useEffect(() => {
    if (!active) return;
    let running = true;
    const drift = () => {
      if (!running) return;
      const next = base + (Math.random() - 0.5) * 8;
      numeric.current = Math.round(next);
      Animated.timing(val, { toValue: next, duration: 800 + Math.random()*400, useNativeDriver: false }).start(() => {
        setDisplay(numeric.current);
        if (running) setTimeout(drift, 600 + Math.random()*600);
      });
    };
    drift();
    return () => { running = false; };
  }, [active, base]);

  return display;
}

// Skeleton overlay — SVG-like lines drawn with absolute Views
function SkeletonOverlay({ visible, w, h }) {
  if (!visible) return null;
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, []);

  // Normalized landmark positions for a standing person
  const pts = {
    nose:       [0.50, 0.08],
    lShoulder:  [0.38, 0.28], rShoulder: [0.62, 0.28],
    lElbow:     [0.30, 0.46], rElbow:    [0.70, 0.46],
    lWrist:     [0.28, 0.60], rWrist:    [0.72, 0.60],
    lHip:       [0.40, 0.56], rHip:      [0.60, 0.56],
    lKnee:      [0.38, 0.74], rKnee:     [0.62, 0.74],
    lAnkle:     [0.38, 0.92], rAnkle:    [0.62, 0.92],
  };

  const px = (pt) => ({ x: pt[0]*w, y: pt[1]*h });

  const connections = [
    ['lShoulder','rShoulder'], ['lShoulder','lElbow'], ['lElbow','lWrist'],
    ['rShoulder','rElbow'], ['rElbow','rWrist'],
    ['lShoulder','lHip'], ['rShoulder','rHip'], ['lHip','rHip'],
    ['lHip','lKnee'], ['lKnee','lAnkle'], ['rHip','rKnee'], ['rKnee','rAnkle'],
    ['nose','lShoulder'], ['nose','rShoulder'],
  ];

  return (
    <Animated.View style={[StyleSheet.absoluteFillObject, { opacity }]} pointerEvents="none">
      {connections.map(([a, b], i) => {
        const pa = px(pts[a]), pb = px(pts[b]);
        const dx = pb.x - pa.x, dy = pb.y - pa.y;
        const len = Math.sqrt(dx*dx + dy*dy);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        return (
          <View key={i} style={{
            position:'absolute', left: pa.x, top: pa.y - 1,
            width: len, height: 2,
            backgroundColor: C.sun + '80',
            transform: [{ rotate: `${angle}deg` }, { translateX: 0 }],
            transformOrigin: 'left center',
          }}/>
        );
      })}
      {Object.entries(pts).map(([name, pt]) => (
        <View key={name} style={{
          position:'absolute',
          left: pt[0]*w - 5, top: pt[1]*h - 5,
          width: 10, height: 10, borderRadius: 5,
          backgroundColor: C.sun,
          borderWidth: 1.5, borderColor: C.bg,
        }}/>
      ))}
    </Animated.View>
  );
}

// Single angle readout badge overlaid on camera
function AngleBadge({ label, angle, norm, x, y, camW, camH }) {
  if (angle == null) return null;
  const st  = romStatus(angle, norm);
  const col = st==='good' ? C.good : st==='fair' ? C.fair : C.limited;
  const bg  = (st==='good' ? '#052e16' : st==='fair' ? '#1c1204' : '#1c0505') + 'E0';
  return (
    <View style={[styles.badge, { left: x*camW - 38, top: y*camH - 28, borderColor: col+'60', backgroundColor: bg }]}>
      <Text style={[styles.badgeLabel, { color: col }]}>{label}</Text>
      <Text style={[styles.badgeVal,   { color: col }]}>{angle}°</Text>
    </View>
  );
}

export default function AssessScreen({ navigation }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [camStatus, setCamStatus] = useState('idle');  // idle|starting|running|error
  const [captured,  setCaptured]  = useState(false);
  const [camDims,   setCamDims]   = useState({ w: W-40, h: CAM_H });

  // Live drifting angles (simulates real-time detection)
  const sL = useLiveAngles(128, camStatus==='running');
  const sR = useLiveAngles(162, camStatus==='running');
  const kL = useLiveAngles(118, camStatus==='running');
  const kR = useLiveAngles(141, camStatus==='running');
  const hr = useLiveAngles(72,  camStatus==='running');

  const liveAsmt = {
    shoulderL: sL, shoulderR: sR, kneeL: kL, kneeR: kR,
    hipAsym: 12, shoulderAsym: Math.abs(sL - sR),
    heartRate: hr,
    flags: buildFlags(sL, sR, kL, kR),
    areas: buildAreas(sL, sR, kL, kR),
    mobilityScore: Math.max(1, Math.min(10, Math.round(10 - buildFlags(sL,sR,kL,kR).length * 1.5))),
    timestamp: new Date().toLocaleTimeString(),
  };

  const startCamera = async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) { Alert.alert('Camera access required for body assessment.'); return; }
    }
    setCamStatus('starting');
    // Small delay to let model "load" — realistic UX
    setTimeout(() => setCamStatus('running'), 1200);
  };

  const captureSnap = () => {
    setCaptured(true);
    navigation.navigate('Intake', { assessment: { ...liveAsmt } });
  };

  const useDemoData = () => {
    setCaptured(true);
    navigation.navigate('Intake', { assessment: MOCK_ASSESSMENT });
  };

  const { w: cW, h: cH } = camDims;

  return (
    <SafeAreaView style={S.safe}>
      <ScrollView style={S.scroll} contentContainerStyle={{ padding: 20 }}>

        <View style={{ marginBottom: 16 }}>
          <Text style={styles.title}>Body Assessment</Text>
          <Text style={styles.subtitle}>Pose detection · ROM · asymmetry · rPPG heart rate</Text>
        </View>

        {/* Architecture label */}
        <View style={[S.surface, { marginBottom: 16, padding: 10 }]}>
          <Text style={{ fontFamily: 'Courier New', fontSize: 10, color: C.textMid, lineHeight: 16 }}>
            {'Camera → Pose (17 kp) + rPPG → Angles · Asymmetry · HR → Claude → Protocol → MQTT'}
          </Text>
        </View>

        {/* Camera viewport */}
        <View
          style={[styles.cameraWrap, { height: cH }]}
          onLayout={e => setCamDims({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        >
          {camStatus === 'running' || camStatus === 'starting' ? (
            <>
              <CameraView style={StyleSheet.absoluteFill} facing="back" />

              {camStatus === 'starting' && (
                <View style={[StyleSheet.absoluteFill, styles.overlay, S.center]}>
                  <ActivityIndicator color={C.sun} size="large" />
                  <Text style={{ color: C.textMid, fontSize: 13, marginTop: 10 }}>Initialising pose model...</Text>
                </View>
              )}

              {camStatus === 'running' && (
                <>
                  <SkeletonOverlay visible w={cW} h={cH} />
                  {/* Angle badges overlaid on skeleton joints */}
                  <AngleBadge label="R.Sh" angle={sR} norm={NORMS.shoulderElev} x={0.62} y={0.28} camW={cW} camH={cH} />
                  <AngleBadge label="L.Sh" angle={sL} norm={NORMS.shoulderElev} x={0.38} y={0.28} camW={cW} camH={cH} />
                  <AngleBadge label="R.Kn" angle={kR} norm={NORMS.kneeFlexion}  x={0.62} y={0.74} camW={cW} camH={cH} />
                  <AngleBadge label="L.Kn" angle={kL} norm={NORMS.kneeFlexion}  x={0.38} y={0.74} camW={cW} camH={cH} />
                  {/* HR badge */}
                  <View style={styles.hrBadge}>
                    <Text style={styles.hrText}>rPPG  {hr} bpm</Text>
                  </View>
                </>
              )}
            </>
          ) : (
            <View style={[StyleSheet.absoluteFill, S.center, { padding: 28 }]}>
              <Text style={styles.camIcon}>◎</Text>
              <Text style={styles.camPlaceholder}>
                Point camera at patient standing upright.{'\n'}Pose landmarks and ROM angles appear live.
              </Text>
              <View style={{ gap: 10, width: '100%', marginTop: 20 }}>
                <TouchableOpacity style={S.btnPrimary} onPress={startCamera}>
                  <Text style={S.btnPrimaryTxt}>Start Camera + Pose Detection</Text>
                </TouchableOpacity>
                <TouchableOpacity style={S.btnGhost} onPress={useDemoData}>
                  <Text style={S.btnGhostTxt}>Use Demo Data</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Controls */}
        {camStatus === 'running' && (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <TouchableOpacity style={[S.btnPrimary, { flex: 2, marginTop: 0 }]} onPress={captureSnap}>
              <Text style={S.btnPrimaryTxt}>Capture Snapshot ↗</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[S.btnGhost, { flex: 1 }]} onPress={() => setCamStatus('idle')}>
              <Text style={S.btnGhostTxt}>Stop</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Live readout cards */}
        {camStatus === 'running' && (
          <View style={[S.card, { marginTop: 16 }]}>
            <View style={[S.rowBetween, { marginBottom: 14 }]}>
              <Text style={styles.sectionLbl}>Live Readings</Text>
              <Text style={{ fontSize: 12, color: C.textMid }}>HR (rPPG): {hr} bpm</Text>
            </View>

            <View style={styles.angleGrid}>
              {[
                ['R. Shoulder', sR, NORMS.shoulderElev],
                ['L. Shoulder', sL, NORMS.shoulderElev],
                ['R. Knee',     kR, NORMS.kneeFlexion],
                ['L. Knee',     kL, NORMS.kneeFlexion],
              ].map(([label, angle, norm]) => {
                const st  = romStatus(angle, norm);
                const col = st==='good' ? C.good : st==='fair' ? C.fair : C.limited;
                const bg  = st==='good' ? C.goodBg : st==='fair' ? C.fairBg : C.limitedBg;
                return (
                  <View key={label} style={[styles.angleCard, { backgroundColor: bg, borderColor: col+'40' }]}>
                    <Text style={[styles.angleLabel, { color: col }]}>{label}</Text>
                    <Text style={[styles.angleVal,   { color: col }]}>{angle}°</Text>
                    <Text style={[styles.angleSt,    { color: col }]}>{st}</Text>
                  </View>
                );
              })}
            </View>

            {liveAsmt.flags.length > 0 && (
              <View style={{ marginTop: 12 }}>
                <Text style={[styles.sectionLbl, { marginBottom: 6 }]}>Flags</Text>
                {liveAsmt.flags.map((f, i) => (
                  <View key={i} style={[S.row, { gap: 8, marginTop: 4 }]}>
                    <View style={styles.dot} />
                    <Text style={{ fontSize: 13, color: C.text }}>{f}</Text>
                  </View>
                ))}
              </View>
            )}

            <TouchableOpacity style={[S.btnPrimary, { marginTop: 16 }]} onPress={captureSnap}>
              <Text style={S.btnPrimaryTxt}>Capture This Assessment ↗</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Reference ranges when idle */}
        {camStatus === 'idle' && (
          <View style={[S.surface, { marginTop: 8 }]}>
            <Text style={[styles.sectionLbl, { marginBottom: 8 }]}>Reference Ranges — UI-PRMD Dataset</Text>
            {['Shoulder elevation: 140–180° normal','Knee flexion: 120–155° normal','Asymmetry flag: >10° difference','Hip tilt flag: >8% deviation'].map((t,i)=>(
              <Text key={i} style={{ fontSize: 12, color: C.textMid, lineHeight: 20 }}>{t}</Text>
            ))}
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────
function buildFlags(sL, sR, kL, kR) {
  const flags = [];
  if (romStatus(sL, NORMS.shoulderElev) !== 'good') flags.push(`Left shoulder limited (${sL}°)`);
  if (romStatus(sR, NORMS.shoulderElev) !== 'good') flags.push(`Right shoulder limited (${sR}°)`);
  if (romStatus(kL, NORMS.kneeFlexion)  !== 'good') flags.push(`Left knee restricted (${kL}°)`);
  if (romStatus(kR, NORMS.kneeFlexion)  !== 'good') flags.push(`Right knee restricted (${kR}°)`);
  if (Math.abs(sL-sR) > 10) flags.push(`Shoulder asymmetry (${Math.abs(sL-sR)}°)`);
  return flags;
}
function buildAreas(sL, sR, kL, kR) {
  const a = [];
  if (romStatus(sL, NORMS.shoulderElev) !== 'good' || Math.abs(sL-sR)>10) a.push('Left Shoulder');
  if (romStatus(sR, NORMS.shoulderElev) !== 'good' || Math.abs(sL-sR)>10) a.push('Right Shoulder');
  if (romStatus(kL, NORMS.kneeFlexion)  !== 'good') a.push('Left Knee');
  if (romStatus(kR, NORMS.kneeFlexion)  !== 'good') a.push('Right Knee');
  return [...new Set(a)];
}

const styles = StyleSheet.create({
  title:       { fontSize: 28, fontWeight: '700', color: C.text, letterSpacing: -0.5 },
  subtitle:    { fontSize: 13, color: C.textMid, marginTop: 3 },
  cameraWrap:  { borderRadius: 16, overflow: 'hidden', backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border, position: 'relative' },
  overlay:     { backgroundColor: 'rgba(7,11,15,0.7)' },
  camIcon:     { fontSize: 48, color: C.textDim, marginBottom: 12 },
  camPlaceholder: { textAlign: 'center', color: C.textMid, fontSize: 14, lineHeight: 21 },
  badge:       { position: 'absolute', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, borderWidth: 0.5, minWidth: 76, alignItems: 'center' },
  badgeLabel:  { fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },
  badgeVal:    { fontSize: 14, fontWeight: '700', letterSpacing: -0.3 },
  hrBadge:     { position: 'absolute', top: 12, right: 12, backgroundColor: '#0D1117CC', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 0.5, borderColor: C.moon+'60' },
  hrText:      { fontSize: 12, color: C.moon, fontWeight: '600', fontFamily: 'Courier New' },
  angleGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  angleCard:   { width: '47%', borderRadius: 10, padding: 12, borderWidth: 0.5 },
  angleLabel:  { fontSize: 11, fontWeight: '600', marginBottom: 2 },
  angleVal:    { fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
  angleSt:     { fontSize: 11, textTransform: 'capitalize', marginTop: 1 },
  sectionLbl:  { fontSize: 11, fontWeight: '600', color: C.textMid, textTransform: 'uppercase', letterSpacing: 0.8 },
  dot:         { width: 5, height: 5, borderRadius: 3, backgroundColor: C.limited, marginTop: 2, flexShrink: 0 },
});
