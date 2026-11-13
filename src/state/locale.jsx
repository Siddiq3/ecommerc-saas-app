import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { deviceLocale, pickLocale, setActiveLocale, translate } from '../lib/i18n.js';

/**
 * The app language: the merchant's choice if they made one, otherwise the phone's language.
 * t(englishText, vars) everywhere; untranslated text falls back to English.
 */
const KEY = 'sk.locale';
/** 'app' = speak in the app language, 'en' = always English (e.g. English product names in a Telugu app). */
const VOICE_KEY = 'sk.voiceLang';
const LocaleContext = createContext({
  locale: 'en', setLocale: () => {}, t: (s, v) => translate('en', s, v), voiceLang: 'app', voiceLocale: 'en', setVoiceLang: () => {},
});

export const LocaleProvider = ({ children }) => {
  const [locale, setState] = useState(deviceLocale);
  const [voiceLang, setVoiceState] = useState('app');
  // During render, so formatters called by the children below already use the new language.
  setActiveLocale(locale);

  useEffect(() => {
    SecureStore.getItemAsync(KEY).then((saved) => saved && setState(pickLocale(saved))).catch(() => undefined);
    SecureStore.getItemAsync(VOICE_KEY).then((saved) => saved === 'en' && setVoiceState('en')).catch(() => undefined);
  }, []);

  const setLocale = useCallback((code) => {
    setState(code);
    SecureStore.setItemAsync(KEY, code).catch(() => undefined);
  }, []);

  const setVoiceLang = useCallback((choice) => {
    setVoiceState(choice);
    SecureStore.setItemAsync(VOICE_KEY, choice).catch(() => undefined);
  }, []);

  const value = useMemo(
    () => ({
      locale, setLocale, t: (text, vars) => translate(locale, text, vars),
      voiceLang, setVoiceLang, voiceLocale: voiceLang === 'en' ? 'en' : locale,
    }),
    [locale, setLocale, voiceLang, setVoiceLang],
  );
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
};

export const useLocale = () => useContext(LocaleContext);
export const useT = () => useContext(LocaleContext).t;
