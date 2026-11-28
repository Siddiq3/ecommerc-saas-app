import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Modal, Platform, StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Sheet } from './Sheet.jsx';
import { Body, Button, Row, Title } from './ui.jsx';
import { appInfo } from '../api/endpoints.js';
import { PLAY_STORE_URL, PLAY_STORE_WEB_URL, shouldOffer, updateNeed } from '../lib/appUpdate.js';
import { useT } from '../state/locale.jsx';
import { colors, radius, space } from '../theme.js';

const DISMISSED_KEY = 'sk.updateDismissed';
/** Checked when the app opens and when it comes back to the front, at most this often. */
const CHECK_EVERY_MS = 60 * 60 * 1000;

const openStore = () => Linking.openURL(PLAY_STORE_URL).catch(() => Linking.openURL(PLAY_STORE_WEB_URL).catch(() => undefined));

/**
 * Asks owners to update when the Play Store has a newer version: a card they can put off ("Later" brings it back in
 * three days), or, below the minimum version, a screen that only lets them update. Android only, for now: the app is
 * not in the App Store yet. Offline or with the check failing, nothing shows: billing must keep working.
 */
export const AppUpdate = () => {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [need, setNeed] = useState(null); // null | 'available' | 'required'
  const [latest, setLatest] = useState(null);
  const lastCheck = useRef(0);

  const check = useCallback(async () => {
    if (Platform.OS !== 'android' || Date.now() - lastCheck.current < CHECK_EVERY_MS) return;
    lastCheck.current = Date.now();
    try {
      const versions = await appInfo.version();
      const found = updateNeed(Constants.expoConfig?.version, versions);
      if (found === 'available') {
        const saved = await SecureStore.getItemAsync(DISMISSED_KEY).catch(() => null);
        let dismissed = null;
        try { dismissed = saved ? JSON.parse(saved) : null; } catch { dismissed = null; }
        if (!shouldOffer(versions.latest, dismissed)) return;
      }
      setLatest(versions.latest);
      setNeed(found);
    } catch {
      lastCheck.current = 0; // offline: try again next time the app comes to the front
    }
  }, []);

  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') check(); });
    return () => sub.remove();
  }, [check]);

  const later = () => {
    setNeed(null);
    SecureStore.setItemAsync(DISMISSED_KEY, JSON.stringify({ version: latest, at: Date.now() })).catch(() => undefined);
  };

  const safe = (
    <Row gap={space.sm} align="flex-start" style={styles.safe}>
      <Ionicons name="shield-checkmark" size={20} color={colors.success} />
      <Body style={{ flex: 1, color: colors.ink700 }}>{t('Your bills, khata and products stay safe. Nothing is deleted.')}</Body>
    </Row>
  );

  if (need === 'required') {
    return (
      <Modal visible transparent={false} animationType="fade" statusBarTranslucent onRequestClose={() => undefined}>
        <View style={[styles.screen, { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.lg }]}>
          <View style={styles.body}>
            <View style={styles.icon}><Ionicons name="arrow-up" size={40} color="#ffffff" /></View>
            <Title style={styles.center}>{t('Update required')}</Title>
            <Body style={[styles.center, styles.message]}>
              {t('This version of StoreFlick is too old to keep working. Update from the Play Store to continue.')}
            </Body>
            {safe}
          </View>
          <Button title={t('Update now')} onPress={openStore}
            icon={<Ionicons name="logo-google-playstore" size={18} color="#ffffff" />} />
        </View>
      </Modal>
    );
  }

  return (
    <Sheet visible={need === 'available'} onClose={later}>
      <View style={styles.sheetBody}>
        <View style={[styles.icon, styles.iconSmall]}><Ionicons name="sparkles" size={28} color="#ffffff" /></View>
        <Title style={styles.center}>{t('A new version is ready')}</Title>
        <Body style={[styles.center, styles.message]}>
          {t('Update StoreFlick to get the newest features and fixes. It takes a minute.')}
        </Body>
        {safe}
      </View>
      <Button title={t('Update now')} onPress={() => { setNeed(null); openStore(); }}
        icon={<Ionicons name="logo-google-playstore" size={18} color="#ffffff" />} />
      <Button title={t('Later')} variant="ghost" onPress={later} style={{ marginTop: space.sm }} />
    </Sheet>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas, paddingHorizontal: space.xl, justifyContent: 'space-between' },
  body: { flex: 1, justifyContent: 'center', alignItems: 'stretch' },
  sheetBody: { alignItems: 'stretch', paddingBottom: space.lg },
  icon: {
    width: 80, height: 80, borderRadius: radius.pill, backgroundColor: colors.accent600,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: space.xl,
  },
  iconSmall: { width: 60, height: 60, marginBottom: space.lg },
  center: { textAlign: 'center' },
  message: { marginTop: space.md, color: colors.ink700 },
  safe: { marginTop: space.xl, padding: space.md, borderRadius: radius.md, backgroundColor: colors.successTint },
});
