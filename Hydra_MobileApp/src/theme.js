import { StyleSheet, Platform } from 'react-native';
export const C = {
  bg:        '#070B0F',
  surface:   '#111620',
  card:      '#161C28',
  border:    '#1E2535',
  borderMid: '#2A3347',

  sun:       '#FF6B35',   // Sun pad — warm/orange
  sunLight:  '#FF6B3520',
  sunBorder: '#FF6B3540',
  moon:      '#4DA8FF',   // Moon pad — cool/blue
  moonLight: '#4DA8FF20',
  moonBorder:'#4DA8FF40',

  text:      '#EAE4DC',
  textMid:   '#9CA3AF',
  textDim:   '#4B5563',

  good:      '#4ADE80',
  goodBg:    '#052e16',
  fair:      '#FBBF24',
  fairBg:    '#1c1204',
  limited:   '#F87171',
  limitedBg: '#1c0505',

  success:   '#22C55E',
  danger:    '#EF4444',
  white:     '#FFFFFF',
};

export const T = StyleSheet.create({
  h1:  { fontSize: 28, fontWeight: '700', color: C.text, letterSpacing: -0.5 },
  h2:  { fontSize: 20, fontWeight: '600', color: C.text },
  h3:  { fontSize: 16, fontWeight: '600', color: C.text },
  body:{ fontSize: 14, fontWeight: '400', color: C.text, lineHeight: 22 },
  sm:  { fontSize: 12, fontWeight: '400', color: C.textMid },
  xs:  { fontSize: 11, fontWeight: '500', color: C.textMid, letterSpacing: 0.5 },
  mono:{ fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', color: C.textMid },
  label:{ fontSize: 11, fontWeight: '600', color: C.textMid, textTransform: 'uppercase', letterSpacing: 0.8 },
});

export const S = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1, backgroundColor: C.bg },
  safe:   { flex: 1, backgroundColor: C.bg },
  pad:    { padding: 20 },
  padH:   { paddingHorizontal: 20 },

  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: C.border,
    padding: 18,
    marginBottom: 12,
  },
  cardSm: {
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: C.border,
    padding: 14,
    marginBottom: 10,
  },
  surface: {
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: C.border,
    padding: 14,
  },

  row:    { flexDirection: 'row', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  center: { alignItems: 'center', justifyContent: 'center' },
  gap4:   { gap: 4 },
  gap8:   { gap: 8 },
  gap12:  { gap: 12 },
  gap16:  { gap: 16 },

  divider: { height: 0.5, backgroundColor: C.border, marginVertical: 14 },

  input: {
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: C.borderMid,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: C.text,
    fontSize: 15,
    marginBottom: 12,
  },

  btnPrimary: {
    backgroundColor: C.text,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  btnPrimaryTxt: { color: C.bg, fontSize: 16, fontWeight: '600' },

  btnGhost: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: C.borderMid,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnGhostTxt: { color: C.textMid, fontSize: 14, fontWeight: '500' },

  btnDanger: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: C.danger + '60',
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnDangerTxt: { color: C.danger, fontSize: 14, fontWeight: '500' },

  tag: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 0.5,
  },
});
