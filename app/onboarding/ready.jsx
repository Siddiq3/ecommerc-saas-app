import { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Body, Button, Caption, Display, Touchable } from '../../src/components/ui.jsx';
import { FadeIn, haptic } from '../../src/components/motion.jsx';
import { useToast } from '../../src/components/Toast.jsx';
import { useAuth } from '../../src/state/auth.jsx';
import { useOnboarding } from '../../src/state/onboarding.jsx';
import { usePlan } from '../../src/state/plan.jsx';
import { categoryById } from '../../src/lib/onboarding.js';
import { storeUrl, storeHostname } from '../../src/lib/storefront.js';
import { colors, fonts, motion, panelTints, radius, shadow, space } from '../../src/theme.js';

/**
 * The store exists. This screen is the payoff for the whole flow, so it is one thing: your
 * store, with your name on it, at the address you chose.
 *
 * Leaving it is the only moment the app refreshes who the merchant is. Until then the root
 * guard still believes there is no store (it reads the cached owner), which is exactly what
 * keeps the merchant on this screen instead of being swept to the dashboard mid-celebration.
 */

const initialsOf = (name) => {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  return words.length ? (words[0][0] + (words[1]?.[0] ?? '')).toUpperCase() : '·';
};

export default function Ready() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { refreshUser } = useAuth();
  const { refresh: refreshPlan } = usePlan();
  const { draft, reset } = useOnboarding();
  const [leaving, setLeaving] = useState(false);

  // Captured once: leaving clears the draft, and the screen must not flash empty while it
  // transitions away.
  const [shown] = useState(() => {
    const created = draft.created.business;
    return {
      name: created?.name ?? draft.business.name,
      slug: created?.slug ?? draft.business.slug,
      category: categoryById(draft.categoryId),
    };
  });
  const { name, slug, category } = shown;
  const url = storeUrl(slug);

  useEffect(() => { haptic.success(); }, []);

  const goToDashboard = async () => {
    setLeaving(true);
    await refreshUser();
    await refreshPlan();
    reset();
    router.replace('/(tabs)');
  };

  const copy = async () => {
    await Clipboard.setStringAsync(url);
    toast.success('Store link copied');
  };

  const view = () => Linking.openURL(url).catch(() => toast.error('Could not open your store'));

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.xxl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.badgeWrap}>
          <Confetti />
          <SuccessBadge />
        </View>

        <FadeIn delay={350}>
          <Display style={styles.title}>Your store is ready! 🎉</Display>
          <Body muted style={styles.subtitle}>Your online store has been successfully created.</Body>
        </FadeIn>

        <FadeIn delay={550} distance={24} style={styles.card}>
          <View style={styles.mark}>
            <Body style={styles.markText}>{initialsOf(name)}</Body>
          </View>
          <Body strong style={styles.storeName} numberOfLines={2}>{name}</Body>
          {category ? (
            <View style={[styles.chip, { backgroundColor: category.tint }]}>
              <Ionicons name={category.icon} size={14} color={colors.ink900} />
              <Caption style={styles.chipText}>{category.label}</Caption>
            </View>
          ) : null}
          <Touchable onPress={copy} style={styles.urlRow} accessibilityLabel="Copy store link">
            <Ionicons name="link-outline" size={18} color={colors.ink500} />
            <Body numberOfLines={1} style={styles.url}>{storeHostname(slug)}</Body>
            <Ionicons name="copy-outline" size={18} color={colors.accent700} />
          </Touchable>
        </FadeIn>
      </ScrollView>

      <FadeIn delay={900} style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        <Button title="Go to Dashboard" size="lg" loading={leaving} onPress={goToDashboard} />
        <Button title="View My Store" size="lg" variant="secondary" disabled={leaving} onPress={view} />
      </FadeIn>
    </View>
  );
}

const SuccessBadge = () => {
  const pop = useSharedValue(0);
  const tick = useSharedValue(0);

  useEffect(() => {
    pop.value = withDelay(150, withSpring(1, { damping: 11, stiffness: 160, mass: 0.8 }));
    tick.value = withDelay(400, withSpring(1, motion.spring.enter));
  }, [pop, tick]);

  const badge = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }], opacity: Math.min(pop.value * 2, 1) }));
  const mark = useAnimatedStyle(() => ({ transform: [{ scale: tick.value }], opacity: tick.value }));

  return (
    <Animated.View style={[styles.badge, badge]}>
      <Animated.View style={mark}>
        <Ionicons name="checkmark" size={44} color="#ffffff" />
      </Animated.View>
    </Animated.View>
  );
};

/* A burst of confetti from behind the badge: one shared clock, thirty pieces. Directions and
   sizes come from the index rather than Math.random, so the burst is the same every time and
   a re-render can never re-roll it. */

const COLORS = [colors.accent600, colors.accent200, colors.success, panelTints.sky, panelTints.butter, panelTints.lilac, panelTints.rose];
const PIECES = Array.from({ length: 30 }, (_, i) => {
  const angle = ((i * 137.5) % 360) * (Math.PI / 180);
  return {
    angle,
    distance: 70 + ((i * 53) % 90),
    fall: 40 + ((i * 29) % 70),
    size: 6 + ((i * 7) % 6),
    spin: ((i % 2 ? 1 : -1) * (180 + ((i * 41) % 360))),
    round: i % 3 === 0,
    color: COLORS[i % COLORS.length],
  };
});

const Confetti = () => {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withDelay(350, withTiming(1, { duration: 1700, easing: Easing.out(Easing.cubic) }));
  }, [t]);

  return (
    <View pointerEvents="none" style={styles.confetti}>
      {PIECES.map((piece, index) => (
        <Piece key={index} piece={piece} t={t} />
      ))}
    </View>
  );
};

const Piece = ({ piece, t }) => {
  const style = useAnimatedStyle(() => ({
    opacity: t.value === 0 ? 0 : 1 - t.value * t.value,
    transform: [
      { translateX: Math.cos(piece.angle) * piece.distance * t.value },
      { translateY: Math.sin(piece.angle) * piece.distance * t.value + piece.fall * t.value * t.value },
      { rotate: `${piece.spin * t.value}deg` },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.piece,
        { width: piece.size, height: piece.round ? piece.size : piece.size * 1.8, borderRadius: piece.round ? piece.size : 2, backgroundColor: piece.color },
        style,
      ]}
    />
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  content: { alignItems: 'center', paddingHorizontal: space.xl, paddingBottom: space.xl },

  badgeWrap: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center', marginBottom: space.xl },
  badge: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.success,
    shadowOpacity: 0.35,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  confetti: { position: 'absolute', width: 0, height: 0, alignItems: 'center', justifyContent: 'center' },
  piece: { position: 'absolute' },

  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center', marginTop: space.sm, fontSize: 16, lineHeight: 23 },

  card: {
    alignSelf: 'stretch',
    alignItems: 'center',
    marginTop: space.xxl,
    padding: space.xl,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    ...shadow.card,
  },
  mark: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: colors.accent600,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markText: { fontFamily: fonts.display, fontSize: 28, lineHeight: 36, color: '#ffffff' },
  storeName: { fontFamily: fonts.display, fontSize: 26, lineHeight: 32, marginTop: space.lg, textAlign: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  chipText: { color: colors.ink900, fontFamily: fonts.semibold },
  urlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.xl,
    alignSelf: 'stretch',
    minHeight: 50,
    backgroundColor: colors.canvas,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
  },
  url: { flex: 1, fontFamily: fonts.semibold, fontSize: 14.5, color: colors.ink800 },

  footer: { paddingHorizontal: space.xl, paddingTop: space.md, gap: space.sm },
});
