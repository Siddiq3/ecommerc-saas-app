import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TRIAL_DAYS } from '@storekit/shared';
import { Ionicons } from '@expo/vector-icons';
import { Logo } from '../../src/components/Brand.jsx';
import { HeroShowcase } from '../../src/components/HeroShowcase.jsx';
import { Alert, Body, Button, Caption, Display, Row, Touchable } from '../../src/components/ui.jsx';
import { useAuth } from '../../src/state/auth.jsx';
import { FadeIn } from '../../src/components/motion.jsx';
import { colors, fonts, space } from '../../src/theme.js';

/**
 * First run.
 *
 * Reads top to bottom as a four-beat story: this is StoreKit (the wordmark), this is what
 * it does (the storefront cycling through businesses), here is why it helps (three words of
 * benefit), and here is the way in (one confident button). Each beat enters a little after
 * the one above, so the eye is led down the page rather than meeting it all at once.
 *
 * The layout is proportional, not pixel-placed: the hero takes the slack on a tall phone
 * and yields it on a short one, and the action block stays pinned to the thumb. Nothing
 * here is a fixed offset that would strand the CTA mid-screen on one device and off it on
 * another.
 */

/** Shown once after an account deletion; the route guard lands a signed-out merchant here. */
const NOTICES = {
  account_deleted: { tone: 'success', message: 'Your account has been deleted and you have been signed out on every device.' },
  account_delete_unconfirmed: {
    tone: 'warning',
    message: 'You were signed out before we could confirm the deletion. If you can still sign in, your account was not deleted — sign in and try again.',
  },
  session_restore_failed: {
    tone: 'warning',
    message: 'We could not restore your saved sign-in on this device. Please sign in once more.',
  },
};

export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { notice, clearNotice } = useAuth();
  const shown = NOTICES[notice];

  const go = (path) => {
    if (notice) clearNotice();
    router.push(path);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.lg }]}>
      <FadeIn from="bottom" distance={8}>
        <Logo size={30} />
      </FadeIn>

      {/* The hero takes the free vertical space, so it is centred on any height of phone. */}
      <View style={styles.heroRegion}>
        <FadeIn delay={120} distance={16}>
          <HeroShowcase />
        </FadeIn>
      </View>

      <View style={styles.pitch}>
        <FadeIn delay={280}>
          <Display style={styles.headline}>Run your store,{'\n'}from your pocket.</Display>
        </FadeIn>

        <FadeIn delay={400}>
          <Body style={styles.subhead}>
            Take orders, manage products and get paid — all from your phone.
          </Body>
        </FadeIn>
      </View>

      <FadeIn delay={660} style={styles.actions}>
        {shown ? <Alert message={shown.message} tone={shown.tone} /> : null}
        <Button title="Create account" size="lg" onPress={() => go('/(auth)/signup')} />

        <Touchable
          onPress={() => go('/(auth)/login')}
          haptics="tap"
          scaleTo={1}
          style={styles.signInRow}
          accessibilityLabel="Sign in to an existing account"
        >
          <Body style={styles.signInMuted}>Already have an account? </Body>
          <Body style={styles.signInLink}>Sign in</Body>
        </Touchable>

        <Row style={styles.trial} gap={6}>
          <Ionicons name="shield-checkmark" size={13} color={colors.ink400} />
          <Caption style={styles.trialText}>
            {TRIAL_DAYS} days free · No card needed to start
          </Caption>
        </Row>
      </FadeIn>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
    paddingHorizontal: space.xl,
  },

  heroRegion: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 260 },

  pitch: { marginBottom: space.xxl },
  headline: {
    fontSize: 37,
    lineHeight: 43,
    letterSpacing: -1.1,
    maxWidth: 320,
  },
  subhead: {
    marginTop: space.md,
    fontSize: 15.5,
    lineHeight: 23,
    color: colors.ink600,
    maxWidth: 320,
  },

  actions: {},
  signInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    paddingVertical: space.md,
    minHeight: 44,
  },
  signInMuted: { color: colors.ink500, fontSize: 14.5 },
  signInLink: { color: colors.accent700, fontFamily: fonts.semibold, fontSize: 14.5 },

  trial: { justifyContent: 'center', marginTop: space.xs },
  trialText: { color: colors.ink400 },
});
