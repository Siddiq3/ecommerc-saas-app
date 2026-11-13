import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Press } from './motion.jsx';
import { useLocale } from '../state/locale.jsx';
import { LANGUAGES } from '../lib/i18n.js';
import { colors, MIN_TAP, radius, space, type } from '../theme.js';

export { spokenNumber } from '../lib/voice.js';

/**
 * Mic button inside every Field: speak, and the words land in that field as ordinary,
 * editable text. Uses the phone's own speech service (Google on Android, Apple on iOS) in
 * the app's language, so Hindi, Tamil, etc. work without any server or cost.
 */

let Speech = null;
try {
  // Native module: absent in Expo Go and in Node checks, where the mic simply does not show.
  Speech = require('expo-speech-recognition').ExpoSpeechRecognitionModule;
} catch {
  Speech = null;
}

let available = null;
const isAvailable = () => {
  if (available === null) {
    try { available = Boolean(Speech?.isRecognitionAvailable()); } catch { available = false; }
  }
  return available;
};

// One mic at a time across the whole app.
let stopOther = null;

export const VoiceButton = ({ onText, label, hint }) => {
  const { locale, t, voiceLang, setVoiceLang, voiceLocale } = useLocale();
  const [listening, setListening] = useState(false);
  const subs = useRef([]);
  const mounted = useRef(true);

  const cleanup = () => {
    subs.current.forEach((s) => s.remove());
    subs.current = [];
    if (mounted.current) setListening(false);
  };

  useEffect(() => () => {
    mounted.current = false;
    if (subs.current.length) { Speech?.abort(); cleanup(); }
  }, []);

  if (!Speech || !isAvailable()) return null;

  const toggle = async () => {
    if (listening) { Speech.stop(); return; }
    stopOther?.();

    const perm = await Speech.requestPermissionsAsync().catch(() => ({ granted: false }));
    if (!perm.granted) {
      Alert.alert(t('Microphone needed'), t('Allow microphone access in Settings to type with your voice.'));
      return;
    }

    subs.current = [
      Speech.addListener('result', (e) => {
        const said = e.results?.[0]?.transcript?.trim();
        if (e.isFinal && said) onText(said);
      }),
      Speech.addListener('end', cleanup),
      Speech.addListener('error', (e) => {
        cleanup();
        if (!['aborted', 'no-speech', 'speech-timeout'].includes(e.error)) {
          Alert.alert(t('Voice typing failed'), t('Could not understand that. Please try again or type it.'));
        }
      }),
    ];
    stopOther = () => { Speech.abort(); cleanup(); };
    setListening(true);
    Speech.start({ lang: `${voiceLocale}-IN`, interimResults: false, continuous: false, addsPunctuation: true });
  };

  const icon = <Ionicons name={listening ? 'stop-circle' : 'mic-outline'} size={22} color={listening ? colors.danger : label ? colors.accent600 : colors.ink500} />;

  // With a label it is a full-width button (e.g. "Speak product details"); without, the small mic inside a Field.
  return label ? (
    <>
      <Press onPress={toggle} haptics="tap" style={styles.wide} accessibilityRole="button" accessibilityLabel={listening ? t('Stop listening') : label} accessibilityHint={hint}>
        {icon}
        <Text style={styles.wideText}>{listening ? t('Listening… tap to stop') : label}</Text>
      </Press>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {locale === 'en' ? null : (
        // Speak in the app language or in English (English names are easier for customers to search).
        <View style={styles.langs} accessibilityRole="radiogroup" accessibilityLabel={t('Voice typing language')}>
          {[['app', LANGUAGES.find((l) => l.code === locale)?.name], ['en', 'English']].map(([key, name]) => (
            <Press
              key={key}
              onPress={() => setVoiceLang(key)}
              haptics="tap"
              style={[styles.lang, voiceLang === key && styles.langOn]}
              accessibilityRole="radio"
              accessibilityState={{ checked: voiceLang === key }}
            >
              <Text style={[styles.langText, voiceLang === key && styles.langTextOn]}>{name}</Text>
            </Press>
          ))}
        </View>
      )}
    </>
  ) : (
    <Press
      onPress={toggle}
      haptics="tap"
      hitSlop={8}
      style={styles.mic}
      accessibilityRole="button"
      accessibilityLabel={listening ? t('Stop listening') : t('Type with your voice')}
    >
      {icon}
    </Press>
  );
};

const styles = StyleSheet.create({
  mic: { width: MIN_TAP, height: MIN_TAP, alignItems: 'center', justifyContent: 'center' },
  wide: {
    minHeight: MIN_TAP,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accent200,
    backgroundColor: colors.accent50,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    marginBottom: space.xs,
  },
  hint: { ...type.caption, color: colors.ink500, marginBottom: space.sm },
  langs: { flexDirection: 'row', gap: space.sm, marginBottom: space.md },
  lang: {
    minHeight: 36, justifyContent: 'center', paddingHorizontal: space.md,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface,
  },
  langOn: { borderColor: colors.ink900, backgroundColor: colors.ink900 },
  langText: { ...type.label, color: colors.ink700 },
  langTextOn: { color: colors.surface },
  wideText: { ...type.label, color: colors.accent700 },
});
