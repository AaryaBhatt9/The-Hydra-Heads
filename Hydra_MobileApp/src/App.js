import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, TextInput, Platform } from 'react-native';
import { C, S } from './src/theme';

import RoleSelectScreen from './src/screens/RoleSelectScreen';
import AssessScreen     from './src/screens/AssessScreen';
import { IntakeScreen, ProtocolScreen, SessionScreen, OutcomeScreen } from './src/screens/PractitionerScreens';
import { PatientHomeScreen, PatientCheckScreen } from './src/screens/PatientScreens';
import { loadSettings, saveSettings } from './src/services/api';

const Stack = createNativeStackNavigator();

const NAV_THEME = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: C.bg, card: C.surface, text: C.text, border: C.border, primary: C.sun },
};

const HEADER = {
  headerStyle: { backgroundColor: C.surface },
  headerTintColor: C.text,
  headerTitleStyle: { fontSize: 16, fontWeight: '600', color: C.text },
  headerShadowVisible: false,
  headerBackTitle: 'Back',
};

// ─── Settings Screen ──────────────────────────────────────────────────────────
function SettingsScreen({ navigation }) {
  const [cfg, setCfg] = React.useState({ serverUrl:'', deviceMac:'74:4D:BD:A0:A3:EC', username:'', password:'' });
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => { loadSettings().then(setCfg); }, []);

  const save = async () => {
    await saveSettings(cfg);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <SafeAreaView style={S.safe}>
      <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 22, fontWeight: '700', color: C.text, marginBottom: 6 }}>Device Settings</Text>
        <Text style={{ fontSize: 13, color: C.textMid, marginBottom: 20 }}>API credentials provided at the Saturday 3:30 PM workshop. Leave Server URL blank for demo mode.</Text>
        <View style={S.card}>
          {[
            ['Server URL',   'serverUrl',  'https://your-server.com', false],
            ['Device MAC',   'deviceMac',  '74:4D:BD:A0:A3:EC',      false],
            ['Username',     'username',   'username',                false],
            ['Password',     'password',   '',                        true],
          ].map(([label, key, ph, secure]) => (
            <View key={key} style={{ marginBottom: 14 }}>
              <Text style={styles.lbl}>{label}</Text>
              <TextInput
                style={S.input}
                value={cfg[key]}
                onChangeText={v => setCfg(c => ({ ...c, [key]: v }))}
                placeholder={ph}
                placeholderTextColor={C.textDim}
                secureTextEntry={secure}
                autoCapitalize="none"
              />
            </View>
          ))}
          <TouchableOpacity style={S.btnPrimary} onPress={save}>
            <Text style={S.btnPrimaryTxt}>{saved ? '✓ Saved' : 'Save Settings'}</Text>
          </TouchableOpacity>
        </View>
        <View style={{ marginTop: 16 }}>
          <Text style={{ fontSize: 12, color: C.textDim, lineHeight: 18 }}>
            MQTT topic: HydraWav3Pro/config{'\n'}
            Endpoints: POST /api/v1/auth/login · POST /api/v1/mqtt/publish{'\n'}
            Session control: playCmd 1=Start 2=Pause 3=Stop 4=Resume
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Root Navigator ───────────────────────────────────────────────────────────
export default function App() {
  return (
    <NavigationContainer theme={NAV_THEME}>
      <StatusBar style="light" />
      <Stack.Navigator
        initialRouteName="RoleSelect"
        screenOptions={{ ...HEADER, animation: 'slide_from_right' }}
      >
        <Stack.Screen
          name="RoleSelect"
          component={RoleSelectScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Assess"
          component={AssessScreen}
          options={{
            title: 'Body Assessment',
            headerRight: () => null,
          }}
        />
        <Stack.Screen name="Intake"   component={IntakeScreen}   options={{ title: 'Patient Intake' }} />
        <Stack.Screen name="Protocol" component={ProtocolScreen} options={{ title: 'AI Protocol' }} />
        <Stack.Screen name="Session"  component={SessionScreen}  options={{ title: 'Active Session', headerBackVisible: false }} />
        <Stack.Screen name="Outcome"  component={OutcomeScreen}  options={{ title: 'Recovery Outcomes', headerBackVisible: false }} />

        <Stack.Screen
          name="PatientHome"
          component={PatientHomeScreen}
          options={{
            title: 'Hydrawav3',
            headerLeft: () => null,
          }}
        />
        <Stack.Screen name="PatientCheck" component={PatientCheckScreen} options={{ title: 'Self Check-In' }} />
        <Stack.Screen name="Settings"     component={SettingsScreen}     options={{ title: 'Settings' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  lbl: { fontSize: 11, fontWeight: '600', color: C.textMid, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
});
