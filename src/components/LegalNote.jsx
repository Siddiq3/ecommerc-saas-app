import { StyleSheet, Text } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { colors, fonts, space, type } from '../theme.js';

/**
 * "By continuing, you agree to…" — consent by continuing, with the two documents one tap
 * away. Shown under the button that actually creates the account, so the agreement sits at
 * the moment it is given rather than behind a checkbox.
 */

const SITE = String(process.env.EXPO_PUBLIC_STOREFRONT_HOST ?? 'storekit.site');
const open = (page) => WebBrowser.openBrowserAsync(`https://${SITE}/legal/${page}`).catch(() => undefined);

export const LegalNote = () => (
  <Text style={styles.note}>
    By continuing, you agree to StoreKit&apos;s{'\n'}
    <Text style={styles.link} onPress={() => open('terms')}>Terms</Text>
    {' '}&amp;{' '}
    <Text style={styles.link} onPress={() => open('privacy')}>Privacy Policy</Text>
  </Text>
);

const styles = StyleSheet.create({
  note: { ...type.caption, textAlign: 'center', color: colors.ink500, lineHeight: 19, paddingHorizontal: space.lg },
  link: { fontFamily: fonts.semibold, color: colors.ink700, textDecorationLine: 'underline' },
});
