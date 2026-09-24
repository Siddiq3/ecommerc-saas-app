import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { colors, motion, radius, space } from '../theme.js';

/**
 * Loading placeholders.
 *
 * A spinner says "wait"; a skeleton says "here is what is coming". Because these mirror the
 * real layout, the screen does not reflow when data lands — the grey blocks are replaced in
 * place, which is what makes a load feel fast even when it isn't.
 *
 * The pulse is opacity rather than a travelling gradient: a gradient sweep needs a gradient
 * dependency and a masked layer per block, and at this size nobody can tell the difference.
 */

const PULSE_MIN = 0.45;

export const Skeleton = ({ width, height = 12, radius: r = radius.xs, style }) => {
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(PULSE_MIN, { duration: 700, easing: motion.easing.inOut }),
        withTiming(1, { duration: 700, easing: motion.easing.inOut }),
      ),
      -1,
      false,
    );
  }, [pulse]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      style={[{ width, height, borderRadius: r, backgroundColor: colors.ink200 }, style, animatedStyle]}
    />
  );
};

/** A line of text. Width is a percentage so lines ragged-right like real copy. */
export const SkeletonText = ({ width = '100%', height = 12, style }) => (
  <Skeleton width={width} height={height} style={style} />
);

/**
 * Mirrors the shape of OrderRow / ProductRow / CustomerRow in domain.jsx: a square thumb,
 * a title, a meta line and a pill.
 */
export const SkeletonRow = ({ thumb = 52 }) => (
  <View style={styles.row}>
    <Skeleton width={thumb} height={thumb} radius={radius.md} />
    <View style={styles.rowBody}>
      <SkeletonText width="58%" height={13} />
      <SkeletonText width="38%" height={11} />
      <Skeleton width={76} height={20} radius={radius.pill} />
    </View>
  </View>
);

/** A card of `count` rows, matching the divided list cards used across the app. */
export const SkeletonList = ({ count = 4, thumb = 52 }) => (
  <View style={styles.card}>
    {Array.from({ length: count }, (_, index) => (
      <View key={index}>
        {index > 0 ? <View style={styles.divider} /> : null}
        <SkeletonRow thumb={thumb} />
      </View>
    ))}
  </View>
);

/** The three-figure block on the dashboard and analytics. */
export const SkeletonStats = () => (
  <View style={[styles.card, styles.statCard]}>
    {Array.from({ length: 3 }, (_, index) => (
      <View key={index} style={styles.stat}>
        <SkeletonText width="60%" height={11} />
        <SkeletonText width="80%" height={22} />
        <SkeletonText width="50%" height={10} />
      </View>
    ))}
  </View>
);

/** A generic content card — a heading and a few lines. */
export const SkeletonCard = ({ lines = 3 }) => (
  <View style={[styles.card, styles.padded]}>
    <SkeletonText width="45%" height={14} />
    <View style={{ height: space.md }} />
    {Array.from({ length: lines }, (_, index) => (
      <SkeletonText
        key={index}
        width={index === lines - 1 ? '65%' : '100%'}
        style={{ marginTop: index ? space.sm : 0 }}
      />
    ))}
  </View>
);

/**
 * The whole-screen placeholder used while a screen's first payload is in flight, in place
 * of the full-screen spinner this app used to show everywhere.
 */
export const SkeletonScreen = ({ stats = false, rows = 4 }) => (
  <View style={styles.screen}>
    <SkeletonText width="42%" height={13} />
    <SkeletonText width="66%" height={26} style={{ marginTop: space.sm, marginBottom: space.xl }} />
    {stats ? <SkeletonStats /> : null}
    <View style={{ height: space.xl }} />
    <SkeletonList count={rows} />
  </View>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas, padding: space.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  padded: { padding: space.lg },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  rowBody: { flex: 1, gap: space.sm },
  statCard: { flexDirection: 'row', padding: space.lg, gap: space.lg },
  stat: { flex: 1, gap: space.sm },
});
