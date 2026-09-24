import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ERROR_CODES } from '@storekit/shared';
import { CreationOrb } from '../../src/components/CreationOrb.jsx';
import { CATEGORY_LOOK } from '../../src/components/StorePreview.jsx';
import { Alert, Body, Button, Caption, Display } from '../../src/components/ui.jsx';
import { FadeIn, ProgressBar, haptic } from '../../src/components/motion.jsx';
import { useOnboarding } from '../../src/state/onboarding.jsx';
import { businesses, storeSettings } from '../../src/api/endpoints.js';
import { check } from '../../src/lib/validation.js';
import { categoryById, detailsSchema, locationSchema, styleById } from '../../src/lib/onboarding.js';
import { colors, fonts, motion, space } from '../../src/theme.js';

/**
 * Step 5 — the store is made.
 *
 * Two things happen at once here and only one of them is visible. Behind the animation the
 * app really creates the store and saves its address. In front,
 * a sequence is paced to run for a fixed minimum, because a store appearing in 900ms feels
 * like nothing happened; the pause is what lets the merchant register that something was
 * built for them. The bar never reaches the end until the work behind it has: if the network
 * is slow the animation holds at "Almost ready" rather than announcing a store that isn't
 * there yet.
 *
 * The work is resumable. Creating the business is a one-shot call (a second attempt is
 * refused: the owner already has a store), so what has succeeded is recorded in the
 * onboarding draft and a retry starts at the first step that hasn't.
 */

const MESSAGES = [
  'Creating your storefront...',
  'Adding your business details...',
  'Preparing your product catalog...',
  'Applying your store design...',
  'Optimizing your storefront...',
  'Almost ready...',
];

/** How long the sequence runs at minimum. Six messages at about a second and a half each. */
const DURATION = 9000;
const TICK = 250;
/** Where the bar waits for the real work to finish. */
const HOLD = 0.96;

export default function Building() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { draft, update } = useOnboarding();

  const [elapsed, setElapsed] = useState(0);
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState(null);

  // The provisioning function reads the latest draft through a ref, so a retry after the
  // draft changed (a corrected store link) sends what is on screen, not what was captured.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const running = useRef(false);

  const provision = useCallback(async () => {
    const { business: b, categoryId, styleId } = draftRef.current;
    // Parsed rather than passed raw, so the API receives the schema's normalised values
    // (a mobile number as ten digits, trimmed text) exactly as it would validate them.
    const details = check(detailsSchema, { name: b.name, slug: b.slug, phone: b.phone });
    const place = check(locationSchema, { address: b.address, city: b.city, state: b.state, pincode: b.pincode });
    if (!details.ok || !place.ok) {
      // Every earlier screen gates on these same schemas, so this means the draft was lost
      // (the app was restarted mid-setup). Say so plainly rather than surfacing a validator dump.
      const lost = new Error('Some of your details are missing. Go back and check them.');
      lost.code = 'DRAFT_INCOMPLETE';
      throw lost;
    }

    let { created } = draftRef.current;

    if (!created.business) {
      const business = await businesses.create({
        name: details.data.name,
        slug: details.data.slug,
        category: categoryById(categoryId)?.category ?? 'other',
        contactPhone: details.data.phone,
        whatsapp: details.data.phone,
        city: place.data.city,
        state: place.data.state,
      });
      created = { ...created, business };
      update('created', { business });
    }

    const { businessId } = created.business;

    if (!created.contactSaved) {
      // `contact` is replaced as a whole, so every field goes, not just address and pincode.
      await businesses.update(businessId, {
        contact: {
          phone: details.data.phone,
          whatsapp: details.data.phone,
          addressLine: place.data.address,
          city: place.data.city,
          state: place.data.state,
          pincode: place.data.pincode,
        },
      });
      update('created', { contactSaved: true });
    }

    if (!created.themeSaved) {
      // The style chosen on the last screen, written to the settings the storefront renders
      // from. Last because it is the only step that is safe to lose: a store with the
      // default theme is a working store, and the Website tab can set it again.
      await storeSettings.update(businessId, { theme: (styleById(styleId) ?? {}).theme });
      update('created', { themeSaved: true });
    }
  }, [update]);

  const start = useCallback(() => {
    if (running.current) return;
    running.current = true;
    setFailure(null);
    provision()
      .then(() => setDone(true))
      .catch((error) => setFailure(error))
      .finally(() => { running.current = false; });
  }, [provision]);

  useEffect(() => {
    start();
    // Once, on arrival; a retry goes through the button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One-way screen: the hardware back button would otherwise drop the merchant into the
  // middle of a store that is half made.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => !failure);
    return () => sub.remove();
  }, [failure]);

  // The clock stops while something is wrong, so the bar doesn't march on over an error.
  useEffect(() => {
    if (failure) return undefined;
    const id = setInterval(() => setElapsed((ms) => Math.min(ms + TICK, DURATION)), TICK);
    return () => clearInterval(id);
  }, [failure]);

  const finished = done && elapsed >= DURATION;
  const progress = finished ? 1 : Math.min(elapsed / DURATION, 1) * HOLD;
  const stage = Math.min(MESSAGES.length - 1, Math.floor((elapsed / DURATION) * MESSAGES.length));

  useEffect(() => {
    if (!finished) return undefined;
    haptic.success();
    // A beat on a full bar, so the moment of completion is seen before the screen changes.
    const id = setTimeout(() => router.replace('/onboarding/ready'), 900);
    return () => clearTimeout(id);
  }, [finished, router]);

  const category = categoryById(draft.categoryId)?.category ?? 'other';
  const tiles = (CATEGORY_LOOK[category] ?? CATEGORY_LOOK.other).icons;
  const scale = height < 700 ? 0.78 : 1;

  return (
    <View style={styles.root}>
      <View pointerEvents="none" style={[styles.blob, styles.blobTop]} />
      <View pointerEvents="none" style={[styles.blob, styles.blobBottom]} />

      <View style={[styles.center, { paddingTop: insets.top + space.xl }]}>
        <FadeIn duration={motion.duration.ceremony} distance={0}>
          <View style={{ transform: [{ scale }], marginVertical: -150 * (1 - scale) }}>
            <CreationOrb tiles={tiles} />
          </View>
        </FadeIn>

        <FadeIn delay={300}>
          <Display style={styles.title}>Shaping your{'\n'}online store...</Display>
          <Body muted style={styles.subtitle}>We&apos;re putting everything together for you.</Body>
        </FadeIn>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + space.xxl }]}>
        {failure ? (
          <FadeIn>
            <Alert message={failure.message} />
            <Button title="Try again" size="lg" onPress={start} />
            <Button
              title={failure.code === ERROR_CODES.SLUG_TAKEN ? 'Change store link' : 'Go back'}
              variant="ghost"
              onPress={() => (failure.code === ERROR_CODES.SLUG_TAKEN ? router.replace('/onboarding/details') : router.back())}
            />
          </FadeIn>
        ) : (
          <FadeIn delay={500}>
            <StatusLines stage={stage} />
            <View style={styles.barRow}>
              <ProgressBar
                value={progress}
                height={8}
                track={colors.ink200}
                fill={colors.accent600}
                duration={TICK + 60}
                style={styles.bar}
              />
              <Caption style={styles.percent}>{Math.round(progress * 100)}%</Caption>
            </View>
          </FadeIn>
        )}
      </View>
    </View>
  );
}

/**
 * The status messages, all mounted and cross-faded by position.
 *
 * Each line is driven by its distance from the current stage: at distance 0 it is fully
 * visible and in place, and as the stage moves on it drifts up and fades while the next
 * drifts in from below. It runs entirely on the UI thread from one shared value, so the
 * text never stutters when the JS thread is busy with the network.
 */
const StatusLines = ({ stage }) => {
  const position = useSharedValue(0);

  useEffect(() => {
    position.value = withTiming(stage, { duration: 520 });
  }, [stage, position]);

  return (
    <View style={styles.lines}>
      {MESSAGES.map((message, index) => (
        <Line key={message} index={index} position={position} text={message} />
      ))}
    </View>
  );
};

const Line = ({ index, position, text }) => {
  const style = useAnimatedStyle(() => {
    const d = index - position.value;
    return {
      opacity: interpolate(Math.abs(d), [0, 0.8, 1], [1, 0, 0], 'clamp'),
      transform: [{ translateY: d * 14 }],
    };
  });
  return <Animated.Text style={[styles.line, style]}>{text}</Animated.Text>;
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },

  blob: { position: 'absolute', borderRadius: 999, backgroundColor: colors.accent50 },
  blobTop: { width: 380, height: 380, top: -170, right: -150, opacity: 0.9 },
  blobBottom: { width: 340, height: 340, bottom: -150, left: -140, opacity: 0.7 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  title: { textAlign: 'center', marginTop: space.md },
  subtitle: { textAlign: 'center', marginTop: space.md, fontSize: 16, lineHeight: 23 },

  bottom: { paddingHorizontal: space.xl, minHeight: 130 },
  lines: { height: 26, marginBottom: space.lg },
  line: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: fonts.semibold,
    fontSize: 15,
    lineHeight: 22,
    color: colors.accent700,
  },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  bar: { flex: 1 },
  percent: { width: 38, textAlign: 'right', color: colors.ink600, fontVariant: ['tabular-nums'] },
});
