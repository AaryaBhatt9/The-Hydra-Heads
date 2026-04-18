import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, T } from '../theme';

export default function RoleSelectScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={styles.container}>

        <View style={styles.header}>
          <Text style={styles.logo}>Hydrawav3</Text>
          <Text style={styles.sub}>Recovery Intelligence · GlobeHack S1</Text>
        </View>

        <View style={styles.tagline}>
          <Text style={styles.taglineText}>
            The recovery ecosystem starts here.
          </Text>
          <Text style={[T.body, { color: C.textMid, textAlign: 'center', marginTop: 8 }]}>
            Who are you today?
          </Text>
        </View>

        <View style={styles.cards}>
          <TouchableOpacity
            style={styles.roleCard}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('Assess')}
          >
            <LinearGradient
              colors={[C.sun + '20', C.sun + '05']}
              style={styles.roleGradient}
            >
              <View style={[styles.roleIcon, { borderColor: C.sun + '60', backgroundColor: C.sun + '15' }]}>
                <Text style={styles.roleIconText}>☀</Text>
              </View>
              <Text style={styles.roleTitle}>Practitioner</Text>
              <Text style={styles.roleDesc}>
                Assess patients, generate AI protocols, control the device, and track outcomes.
              </Text>
              <View style={[styles.roleTag, { borderColor: C.sun + '40', backgroundColor: C.sun + '10' }]}>
                <Text style={[styles.roleTagText, { color: C.sun }]}>Camera · AI Protocol · Device Control</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.roleCard}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('PatientHome')}
          >
            <LinearGradient
              colors={[C.moon + '20', C.moon + '05']}
              style={styles.roleGradient}
            >
              <View style={[styles.roleIcon, { borderColor: C.moon + '60', backgroundColor: C.moon + '15' }]}>
                <Text style={styles.roleIconText}>◎</Text>
              </View>
              <Text style={styles.roleTitle}>Patient</Text>
              <Text style={styles.roleDesc}>
                Track your daily recovery score, coaching tips, and mobility progress between visits.
              </Text>
              <View style={[styles.roleTag, { borderColor: C.moon + '40', backgroundColor: C.moon + '10' }]}>
                <Text style={[styles.roleTagText, { color: C.moon }]}>Daily Score · Coaching · Streaks</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>
          The body heals itself. We empower the journey.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: C.bg },
  container: { flex: 1, padding: 24, justifyContent: 'space-between' },
  header:    { alignItems: 'center', paddingTop: 12 },
  logo:      { fontSize: 32, fontWeight: '700', color: C.text, letterSpacing: -1 },
  sub:       { fontSize: 12, color: C.textMid, marginTop: 4, letterSpacing: 0.5 },
  tagline:   { alignItems: 'center', paddingVertical: 8 },
  taglineText: { fontSize: 22, fontWeight: '600', color: C.text, textAlign: 'center', letterSpacing: -0.3 },
  cards:     { gap: 14 },
  roleCard:  { borderRadius: 20, overflow: 'hidden', borderWidth: 0.5, borderColor: C.border },
  roleGradient: { padding: 22 },
  roleIcon:  { width: 48, height: 48, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  roleIconText: { fontSize: 22 },
  roleTitle: { fontSize: 22, fontWeight: '700', color: C.text, marginBottom: 8 },
  roleDesc:  { fontSize: 14, color: C.textMid, lineHeight: 21, marginBottom: 14 },
  roleTag:   { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 0.5 },
  roleTagText: { fontSize: 11, fontWeight: '600' },
  footer:    { textAlign: 'center', fontSize: 12, color: C.textDim, paddingBottom: 8 },
});
