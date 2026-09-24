import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Body, Caption } from './ui.jsx';
import { colors, fonts, panelTints, radius, shadow, space, type } from '../theme.js';

/**
 * The landing hero — a single storefront card that cycles through the kinds of business
 * StoreKit is for.
 *
 * The message is carried by the motion, not the copy: a shop card settles into place, its
 * category and products quietly change every few seconds — fashion, then jewellery, then a
 * bakery — and two tilted cards rest behind it. Before reading a word, a merchant sees
 * "this works for a shop like mine, and for lots of others."
 *
 * Deliberately restrained. One thing moves at a time, on a slow cadence, with spring
 * settling rather than bouncing. Two depth cards behind are near-static — they exist to say
 * "there are many of these", not to draw the eye from the headline below. Everything is a
 * transform or opacity on the UI thread, so it costs nothing and never blocks the CTA.
 */

const CATEGORIES = [
  { key: 'fashion', label: 'Fashion', tint: panelTints.lilac, hero: '👗', items: ['👗', '👜', '👠'] },
  { key: 'jewellery', label: 'Jewellery', tint: panelTints.peach, hero: '💍', items: ['💍', '📿', '💎'] },
  { key: 'bakery', label: 'Bakery', tint: panelTints.butter, hero: '🍰', items: ['🍰', '🍪', '☕️'] },
  { key: 'beauty', label: 'Beauty', tint: panelTints.rose, hero: '💄', items: ['💄', '🧴', '🌸'] },
  { key: 'home', label: 'Home & decor', tint: panelTints.mint, hero: '🪴', items: ['🪴', '🕯', '🖼'] },
  { key: 'grocery', label: 'Grocery', tint: panelTints.sky, hero: '🥬', items: ['🥬', '🍎', '🥛'] },
];

/** How long each business stays on screen before the card turns to the next one. */
const DWELL = 2600;

export function HeroShowcase() {
  const [index, setIndex] = useState(0);
  const category = CATEGORIES[index % CATEGORIES.length];

  // Advances the front card. Paused implicitly when the screen unmounts.
  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => (i + 1) % CATEGORIES.length), DWELL);
    return () => clearInterval(timer);
  }, []);

  // Content turn: on each category change the face fades down-and-out, swaps, and settles
  // back up. Keyed remount below drives this from 0 on every change.
  const turn = useSharedValue(0);
  useEffect(() => {
    turn.value = 0;
    turn.value = withTiming(1, { duration: 460, easing: Easing.out(Easing.cubic) });
  }, [index, turn]);

  // A slow, shallow vertical drift so the whole stack reads as a physical object at rest
  // rather than a pinned graphic. ±5px over three seconds — present, never distracting.
  const drift = useSharedValue(0);
  useEffect(() => {
    drift.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 3000, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [drift]);

  const stackStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(drift.value, [0, 1], [-5, 5]) }],
  }));

  const faceStyle = useAnimatedStyle(() => ({
    opacity: turn.value,
    transform: [{ translateY: interpolate(turn.value, [0, 1], [10, 0]) }],
  }));

  // The two rearward cards borrow the neighbouring categories' tints, so the "other
  // businesses" behind the current one are real, not decorative filler.
  const behindA = CATEGORIES[(index + 1) % CATEGORIES.length];
  const behindB = CATEGORIES[(index + 2) % CATEGORIES.length];

  return (
    <View style={styles.stage} pointerEvents="none">
      <Animated.View style={[styles.stack, stackStyle]}>
        {/* Depth: two tilted cards resting behind the live one. */}
        <View style={[styles.card, styles.behind, styles.behindTwo, { backgroundColor: behindB.tint }]} />
        <View style={[styles.card, styles.behind, styles.behindOne, { backgroundColor: behindA.tint }]} />

        {/* The live storefront card. */}
        <View style={styles.card}>
          <Animated.View style={[styles.face, faceStyle]}>
            <View style={[styles.hero, { backgroundColor: category.tint }]}>
              <Body style={styles.heroGlyph}>{category.hero}</Body>
            </View>

            <View style={styles.meta}>
              <Body strong style={styles.metaLabel} numberOfLines={1}>{category.label}</Body>
              <Caption style={styles.metaSub}>Now taking orders</Caption>
            </View>

            <View style={styles.items}>
              {category.items.map((glyph, i) => (
                <View key={i} style={[styles.item, { backgroundColor: withAlpha(category.tint) }]}>
                  <Body style={styles.itemGlyph}>{glyph}</Body>
                </View>
              ))}
            </View>
          </Animated.View>
        </View>
      </Animated.View>
    </View>
  );
}

/** A softer wash of a tint for the little product tiles, so they sit under the hero panel. */
const withAlpha = (hex) => `${hex}88`;

const CARD_W = 232;
const CARD_H = 264;

const styles = StyleSheet.create({
  stage: { height: CARD_H + 44, alignItems: 'center', justifyContent: 'center' },
  stack: { width: CARD_W, height: CARD_H, alignItems: 'center', justifyContent: 'center' },

  card: {
    position: 'absolute',
    width: CARD_W,
    height: CARD_H,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: space.lg,
    ...shadow.lift,
  },
  behind: { ...shadow.card },
  behindOne: { transform: [{ rotate: '6deg' }, { translateX: 16 }, { scale: 0.96 }] },
  behindTwo: { transform: [{ rotate: '-7deg' }, { translateX: -16 }, { scale: 0.92 }] },

  face: { flex: 1 },
  hero: {
    flex: 1,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroGlyph: { fontSize: 76, lineHeight: 92 },

  meta: { marginTop: space.md },
  metaLabel: { ...type.title, fontSize: 19, fontFamily: fonts.display },
  metaSub: { marginTop: 1 },

  items: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  item: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemGlyph: { fontSize: 20, lineHeight: 26 },
});
