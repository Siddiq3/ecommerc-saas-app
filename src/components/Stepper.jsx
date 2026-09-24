import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  interpolateColor, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Body, Caption } from './ui.jsx';
import { colors, fonts, motion, radius, space, type } from '../theme.js';

/**
 * Progress through a multi-step flow.
 *
 * Two shapes for two jobs. `Stepper` is the thin bar used inside a flow the merchant is
 * currently walking through — it has to say "how much is left" without competing with the
 * content. `Checklist` is the vertical list used when the steps themselves are the content:
 * the store setup journey, and the launch sequence.
 */

/* ───────────── Stepper ───────────── */

export const Stepper = ({ steps, current, style }) => (
  <View style={[styles.stepper, style]} accessibilityLabel={`Step ${current + 1} of ${steps.length}`}>
    {steps.map((step, index) => (
      <Segment key={step} filled={index <= current} active={index === current} />
    ))}
  </View>
);

const Segment = ({ filled, active }) => {
  const progress = useSharedValue(filled ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(filled ? 1 : 0, { duration: motion.duration.base, easing: motion.easing.out });
  }, [filled, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [colors.ink200, colors.accent600]),
  }));

  return <Animated.View style={[styles.segment, active && styles.segmentActive, animatedStyle]} />;
};

/* ───────────── Checklist ───────────── */

/**
 * A vertical list of steps that tick themselves off.
 *
 * `items` is `[{ key, label, hint, state }]` where state is 'done' | 'active' | 'todo'.
 * A done row springs its tick in; an active row shows a pulsing dot. Nothing here is
 * decorative — the movement is the only signal that work is progressing during the launch
 * sequence, where there is otherwise nothing to look at.
 */
export const Checklist = ({ items, style }) => (
  <View style={[styles.checklist, style]}>
    {items.map((item, index) => (
      <ChecklistRow key={item.key} item={item} last={index === items.length - 1} />
    ))}
  </View>
);

const ChecklistRow = ({ item, last }) => {
  const done = item.state === 'done';
  const active = item.state === 'active';

  const tick = useSharedValue(done ? 1 : 0);
  const glow = useSharedValue(0);

  useEffect(() => {
    tick.value = withSpring(done ? 1 : 0, motion.spring.enter);
  }, [done, tick]);

  useEffect(() => {
    glow.value = active
      ? withDelay(0, withTiming(1, { duration: motion.duration.base }))
      : withTiming(0, { duration: motion.duration.fast });
  }, [active, glow]);

  const markStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(tick.value, [0, 1], [colors.surface, colors.success]),
    borderColor: interpolateColor(
      Math.max(tick.value, glow.value),
      [0, 1],
      [colors.lineStrong, done ? colors.success : colors.accent600],
    ),
    transform: [{ scale: 0.9 + Math.max(tick.value, glow.value) * 0.1 }],
  }));

  const tickStyle = useAnimatedStyle(() => ({ opacity: tick.value, transform: [{ scale: tick.value }] }));
  const rowStyle = useAnimatedStyle(() => ({ opacity: done || active ? 1 : 0.45 }));

  return (
    <Animated.View style={[styles.checkRow, rowStyle]}>
      <View style={styles.markColumn}>
        <Animated.View style={[styles.mark, markStyle]}>
          <Animated.View style={tickStyle}>
            <Ionicons name="checkmark" size={13} color="#ffffff" />
          </Animated.View>
        </Animated.View>
        {!last ? <View style={[styles.rail, done && styles.railDone]} /> : null}
      </View>

      <View style={styles.checkBody}>
        <Body strong style={styles.checkLabel}>{item.label}</Body>
        {item.hint ? <Caption>{item.hint}</Caption> : null}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', gap: 6 },
  segment: { flex: 1, height: 4, borderRadius: 4, backgroundColor: colors.ink200 },
  segmentActive: { height: 5, borderRadius: 5 },

  checklist: { gap: 0 },
  checkRow: { flexDirection: 'row', gap: space.md },
  markColumn: { alignItems: 'center', width: 24 },
  mark: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rail: { flex: 1, width: 2, backgroundColor: colors.ink200, marginVertical: 3, borderRadius: 2 },
  railDone: { backgroundColor: colors.success },
  checkBody: { flex: 1, paddingBottom: space.lg },
  checkLabel: { ...type.bodyStrong, fontFamily: fonts.semibold },
});
