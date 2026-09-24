import { Image, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useEffect } from 'react';
import { Body, Caption } from './ui.jsx';
import { STOREFRONT_DOMAIN } from '../lib/storefront.js';
import { colors, fonts, motion, panelTints, radius, shadow, space, type } from '../theme.js';

/**
 * A live miniature of the merchant's own storefront.
 *
 * This is the spine of onboarding. A merchant filling in "store name" and "store link" is
 * doing database entry; a merchant watching their shop take shape as they type is building
 * something. The same component is reused at every point where the answer to "what am I
 * making?" matters — store creation, branding, and the launch sequence — so the thing they
 * were promised at signup is literally the thing they are shown at launch.
 *
 * It is a *representation*, not an iframe: there is no storefront web app to embed yet, and
 * even once there is, loading a real page behind a form field would be slow, offline-fragile
 * and impossible to keep at 60fps while someone types. Everything here is drawn from the
 * same data the storefront will render, so it stays honest.
 */

/**
 * Each category gets its own palette and props, so switching category visibly changes the
 * shop rather than just the label — the preview has to react to be worth having.
 */
const CATEGORY_LOOK = {
  fashion: { tints: [panelTints.lilac, panelTints.rose, panelTints.peach], icons: ['👗', '👜', '👠', '🧥', '👖', '🕶'] },
  jewellery: { tints: [panelTints.butter, panelTints.peach, panelTints.rose], icons: ['💍', '📿', '💎', '⌚️', '👑', '✨'] },
  grocery: { tints: [panelTints.mint, panelTints.butter, panelTints.sky], icons: ['🥬', '🍎', '🥛', '🍞', '🧅', '🫚'] },
  electronics: { tints: [panelTints.sky, panelTints.lilac, panelTints.mint], icons: ['🎧', '📱', '⌨️', '🔌', '💡', '🖱'] },
  beauty: { tints: [panelTints.rose, panelTints.peach, panelTints.lilac], icons: ['💄', '🧴', '🧼', '💅', '🪞', '🌸'] },
  home: { tints: [panelTints.mint, panelTints.sky, panelTints.butter], icons: ['🏠', '🕯', '🪴', '🛋', '🖼', '🧺'] },
  food: { tints: [panelTints.peach, panelTints.butter, panelTints.rose], icons: ['🍰', '🥘', '🍪', '☕️', '🍯', '🥗'] },
  sports: { tints: [panelTints.sky, panelTints.mint, panelTints.lilac], icons: ['⚽️', '🏏', '🏸', '🧘', '🚴', '🥊'] },
  books: { tints: [panelTints.butter, panelTints.sky, panelTints.mint], icons: ['📚', '📖', '✏️', '🔖', '📓', '🗞'] },
  handmade: { tints: [panelTints.peach, panelTints.mint, panelTints.rose], icons: ['🧶', '🪡', '🎨', '🕯', '🧵', '🪵'] },
  other: { tints: [panelTints.lilac, panelTints.mint, panelTints.peach], icons: ['🛍', '📦', '🎁', '✨', '🏷', '🛒'] },
};

const lookFor = (category) => CATEGORY_LOOK[category] ?? CATEGORY_LOOK.other;

/** Two initials from the store name, for the logo medallion before a real logo exists. */
const initialsOf = (name) => {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '·';
  return (words[0][0] + (words[1]?.[0] ?? '')).toUpperCase();
};

/**
 * How a chosen store style reshapes the preview. `theme` is the same object the settings
 * API stores, so what is drawn here is what the storefront will render — not a lookalike.
 */
const CORNERS = { none: 0, small: 4, medium: radius.sm, large: radius.md };

export function StorePreview({
  name,
  slug,
  category = 'other',
  logoUri,
  tagline,
  tiles = 6,
  theme,
  style,
}) {
  const look = lookFor(category);
  const accent = theme?.primaryColor ?? colors.accent600;
  const corner = CORNERS[theme?.cornerRadius] ?? radius.sm;
  const listed = theme?.layout === 'list';
  const displayName = String(name ?? '').trim() || 'Your store';
  const displaySlug = String(slug ?? '').trim() || 'your-store';
  const named = Boolean(String(name ?? '').trim());

  return (
    <View style={[styles.frame, style]}>
      {/* Browser chrome. The URL is the payoff of the "store link" field above it. */}
      <View style={styles.chrome}>
        <View style={styles.dots}>
          <View style={[styles.dot, { backgroundColor: '#ff5f57' }]} />
          <View style={[styles.dot, { backgroundColor: '#febc2e' }]} />
          <View style={[styles.dot, { backgroundColor: '#28c840' }]} />
        </View>
        <View style={styles.urlBar}>
          <Caption numberOfLines={1} style={styles.url}>
            <Caption style={[styles.urlSlug, { color: accent }]}>{displaySlug}</Caption>.{STOREFRONT_DOMAIN}
          </Caption>
        </View>
      </View>

      <View style={styles.page}>
        <View style={styles.identity}>
          <View style={[styles.logo, { backgroundColor: accent, borderRadius: corner }]}>
            {logoUri ? (
              <Image source={{ uri: logoUri }} style={styles.logoImage} resizeMode="cover" />
            ) : (
              <Body style={styles.logoText}>{initialsOf(name)}</Body>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Body
              numberOfLines={1}
              style={[styles.storeName, !named && styles.placeholderText]}
            >
              {displayName}
            </Body>
            <Caption numberOfLines={1} style={styles.tagline}>
              {tagline?.trim() || 'Open for orders'}
            </Caption>
          </View>
          <View style={[styles.cartChip, { backgroundColor: `${accent}1f` }]}>
            <Body style={styles.cartText}>🛍</Body>
          </View>
        </View>

        <View style={styles.grid}>
          {/* A list storefront shows fewer, larger rows — the same stock, presented the way
              that style presents it. */}
          {Array.from({ length: listed ? Math.min(tiles, 3) : tiles }, (_, index) => (
            <Tile
              key={index}
              tint={look.tints[index % look.tints.length]}
              icon={look.icons[index % look.icons.length]}
              corner={corner}
              listed={listed}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

/**
 * One product tile.
 *
 * Re-keyed by category upstream, so switching category re-mounts the grid and the tiles
 * stagger back in — the shop visibly restocking is the feedback for that choice.
 */
const Tile = ({ tint, icon, corner = radius.sm, listed = false }) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, {
      duration: motion.duration.base,
      easing: motion.easing.out,
    });
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.9 + progress.value * 0.1 }],
  }));

  return (
    <Animated.View
      style={[
        styles.tile,
        listed ? styles.tileListed : styles.tileGrid,
        { backgroundColor: tint, borderRadius: corner },
        animatedStyle,
      ]}
    >
      <Body style={[styles.tileIcon, listed && styles.tileIconListed]}>{icon}</Body>
      <View style={[styles.tileLine, listed && styles.tileLineListed]} />
      <View style={[styles.tileLine, styles.tileLineShort, listed && styles.tileLineListed]} />
    </Animated.View>
  );
};

/**
 * The preview wrapped in a phone silhouette, for the launch moment where the storefront is
 * the subject rather than a companion to a form.
 */
export function StorePreviewDevice({ style, ...props }) {
  const enter = useSharedValue(0);

  useEffect(() => {
    enter.value = withSpring(1, motion.spring.enter);
  }, [enter]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ scale: 0.92 + enter.value * 0.08 }],
  }));

  return (
    <Animated.View style={[styles.device, animatedStyle, style]}>
      <StorePreview {...props} style={styles.deviceScreen} />
    </Animated.View>
  );
}

export { CATEGORY_LOOK };

const styles = StyleSheet.create({
  frame: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    overflow: 'hidden',
    ...shadow.lift,
  },

  chrome: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: colors.sunken,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  dots: { flexDirection: 'row', gap: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  urlBar: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 4,
  },
  url: { fontSize: 10, color: colors.ink500 },
  urlSlug: { fontSize: 10, color: colors.accent700, fontFamily: fonts.semibold },

  page: { padding: space.md, gap: space.md },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  logo: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.accent600,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImage: { width: '100%', height: '100%' },
  logoText: { ...type.bodyStrong, fontSize: 13, color: '#ffffff' },
  storeName: { ...type.bodyStrong, fontSize: 14, color: colors.ink900 },
  placeholderText: { color: colors.ink400 },
  tagline: { fontSize: 10 },
  cartChip: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.accent50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartText: { fontSize: 12 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: {
    borderRadius: radius.sm,
    padding: space.sm,
    justifyContent: 'flex-end',
    gap: 3,
  },
  // Three to a row, accounting for the two gaps between them. `aspectRatio` lives here
  // rather than on `tile` because a later `undefined` does not reliably clear it.
  tileGrid: { width: '31.5%', aspectRatio: 0.82 },
  tileListed: { width: '100%', height: 40, justifyContent: 'center', paddingLeft: 42 },
  tileIcon: { fontSize: 16, position: 'absolute', top: space.sm, left: space.sm },
  tileIconListed: { top: 10, fontSize: 18 },
  tileLineListed: { width: '55%' },
  tileLine: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(16,16,20,0.16)',
    width: '80%',
  },
  tileLineShort: { width: '45%' },

  device: {
    borderRadius: radius.xl,
    padding: space.sm,
    backgroundColor: colors.ink900,
    ...shadow.sheet,
  },
  deviceScreen: { borderRadius: radius.lg, borderWidth: 0 },
});
