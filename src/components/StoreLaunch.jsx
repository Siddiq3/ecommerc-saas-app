import { useEffect, useState } from 'react';
import { Linking, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Body, Button, Caption, Display, Row, Title, Touchable } from './ui.jsx';
import { Checklist } from './Stepper.jsx';
import { StorePreviewDevice } from './StorePreview.jsx';
import { FadeIn, ProgressBar, haptic } from './motion.jsx';
import { useToast } from './Toast.jsx';
import { colors, radius, space, type } from '../theme.js';

/**
 * The launch moment.
 *
 * A merchant has just spent several minutes describing a shop that does not visibly exist
 * yet. This is where it becomes real. Everything the sequence narrates has genuinely
 * happened server-side by the time it runs — the business record, the reserved slug, the
 * default delivery and payment settings — so the ceremony is a summary of real work, not
 * theatre over a spinner. It is paced rather than instant on purpose: this is the one place
 * in the product where slowing down is the right call, because the point is to mark an
 * occasion, not to save 900ms.
 *
 * Rendered as an overlay inside the onboarding screen rather than as its own route, because
 * the root route guard moves the user to the tabs the moment a store exists — the parent
 * holds back `refreshUser()` until the merchant dismisses this.
 */

const STOREFRONT_HOST = String(process.env.EXPO_PUBLIC_STOREFRONT_HOST ?? 'storekit.site');

const STEPS = [
  { key: 'identity', label: 'Store identity', hint: 'Name, category and contact saved' },
  { key: 'link', label: 'Store link reserved', hint: 'Your address is yours alone' },
  { key: 'catalogue', label: 'Catalogue prepared', hint: 'Ready for your first product' },
  { key: 'checkout', label: 'Checkout configured', hint: 'Cash on delivery enabled to start' },
  { key: 'live', label: 'Storefront published', hint: 'Customers can reach you now' },
];

/** How long each row waits before ticking. Slow enough to read, short enough not to stall. */
const STEP_INTERVAL = 620;

export function StoreLaunch({ name, slug, category, onDone }) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [completed, setCompleted] = useState(0);

  const url = `https://${STOREFRONT_HOST}/${slug}`;
  const finished = completed >= STEPS.length;

  useEffect(() => {
    if (completed >= STEPS.length) {
      haptic.success();
      return undefined;
    }
    const timer = setTimeout(() => {
      setCompleted((n) => n + 1);
      haptic.tap();
    }, STEP_INTERVAL);
    return () => clearTimeout(timer);
  }, [completed]);

  const share = async () => {
    try {
      await Share.share({ message: `${name} is now online. Shop here: ${url}`, url });
    } catch {
      // The merchant dismissed the sheet — not an error worth reporting.
    }
  };

  const copy = async () => {
    await Clipboard.setStringAsync(url);
    toast.success('Store link copied');
  };

  const open = () => Linking.openURL(url).catch(() => toast.error('Could not open your store'));

  const items = STEPS.map((step, index) => ({
    ...step,
    state: index < completed ? 'done' : index === completed ? 'active' : 'todo',
  }));

  return (
    <View style={[styles.overlay, { paddingTop: insets.top }]}>
      {finished ? (
        <ScrollView
          contentContainerStyle={[styles.done, { paddingBottom: insets.bottom + space.xxl }]}
          showsVerticalScrollIndicator={false}
        >
          <FadeIn>
            <Caption style={styles.kicker}>YOUR STORE IS LIVE</Caption>
            <Display style={styles.headline}>{name} is open{'\n'}for business.</Display>
          </FadeIn>

          <FadeIn delay={120} style={styles.deviceWrap}>
            <StorePreviewDevice name={name} slug={slug} category={category} tiles={6} />
          </FadeIn>

          <FadeIn delay={240} style={{ alignSelf: 'stretch' }}>
            <Touchable onPress={copy} style={styles.urlRow} accessibilityLabel="Copy store link">
              <Ionicons name="link-outline" size={17} color={colors.ink500} />
              <Body numberOfLines={1} style={styles.urlText}>{STOREFRONT_HOST}/{slug}</Body>
              <Ionicons name="copy-outline" size={17} color={colors.accent700} />
            </Touchable>

            <Row gap={space.md} style={styles.actions}>
              <Button title="Open store" onPress={open} style={{ flex: 1 }} full={false} />
              <Button title="Share" variant="secondary" onPress={share} style={{ flex: 1 }} full={false} />
            </Row>
          </FadeIn>

          <FadeIn delay={340} style={styles.nextWrap}>
            <Title style={styles.nextTitle}>What&apos;s next</Title>
            <Caption style={styles.nextHint}>
              Your store works right now, but it has nothing to sell yet.
            </Caption>
            <View style={styles.nextCard}>
              <Checklist
                items={[
                  { key: 'created', label: 'Store created', hint: 'Done', state: 'done' },
                  { key: 'product', label: 'Add your first product', hint: 'Takes about a minute', state: 'active' },
                  { key: 'delivery', label: 'Set your delivery area', state: 'todo' },
                  { key: 'share', label: 'Share your link with customers', state: 'todo' },
                ]}
              />
            </View>
          </FadeIn>

          <FadeIn delay={420} style={{ alignSelf: 'stretch' }}>
            <Button title="Add my first product" size="lg" onPress={() => onDone('product')} />
            <Button title="Go to my dashboard" variant="ghost" onPress={() => onDone('dashboard')} />
          </FadeIn>
        </ScrollView>
      ) : (
        <View style={styles.building}>
          <FadeIn>
            <Title style={styles.buildingTitle}>Building your store…</Title>
          </FadeIn>

          <ProgressBar
            value={completed / STEPS.length}
            track={colors.ink200}
            fill={colors.accent600}
            style={styles.progress}
          />

          <Checklist items={items} style={styles.buildingList} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.canvas, zIndex: 20 },

  building: { flex: 1, justifyContent: 'center', paddingHorizontal: space.xl, paddingBottom: space.xxxl },
  buildingTitle: { marginBottom: space.xl },
  progress: { marginBottom: space.xxl },
  buildingList: { paddingLeft: space.xs },

  done: { paddingHorizontal: space.xl, paddingTop: space.xxl, alignItems: 'flex-start' },
  kicker: { ...type.overline, color: colors.success, marginBottom: space.sm },
  headline: { fontSize: 32, lineHeight: 39 },

  deviceWrap: { alignSelf: 'stretch', marginTop: space.xxl, marginBottom: space.xl },

  urlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  urlText: { flex: 1, ...type.bodyStrong, fontSize: 14, color: colors.ink800 },
  actions: { marginTop: space.md },

  nextWrap: { alignSelf: 'stretch', marginTop: space.xxxl, marginBottom: space.xl },
  nextTitle: { fontSize: 19 },
  nextHint: { marginTop: 2, marginBottom: space.lg },
  nextCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: space.lg,
    paddingBottom: space.xs,
  },
});
