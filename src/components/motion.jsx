import { useEffect, useRef, useState } from 'react';
import { Pressable, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
  useReducedMotion,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { motion } from '../theme.js';

/**
 * The motion layer.
 *
 * Every animation in the app comes from here, so that "how things move" is a design
 * decision made once rather than re-invented per screen. Three rules hold throughout:
 *
 *  1. Motion carries meaning. Something moves to show where it came from, that it
 *     responded, or that it changed — never for decoration.
 *  2. Motion is interruptible. Everything runs on the UI thread via Reanimated, so a
 *     scroll or a second tap is never blocked waiting for an animation to finish.
 *  3. Motion is short. See `motion.duration` in the theme for why.
 */

/* ───────────── Haptics ───────────── */

/**
 * Haptics are advisory: a device with the motor disabled, or a simulator, rejects these.
 * A failed buzz must never break the action it was decorating, so every call swallows.
 */
const safely = (fn) => (...args) => { try { fn(...args); } catch { /* no haptic engine */ } };

export const haptic = {
  /** A control was pressed. */
  tap: safely(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** A heavier control — a primary submit, a sheet opening. */
  press: safely(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Something worked. Pair with a success toast, never on its own. */
  success: safely(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: safely(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: safely(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  /** A discrete step — a segmented control moving, a stepper incrementing. */
  select: safely(() => Haptics.selectionAsync()),
};

/* ───────────── Press ───────────── */

/**
 * A pressable that physically responds.
 *
 * The scale is deliberately small (default 0.97): at a glance it should read as the
 * surface yielding under a finger, not as the element shrinking. Larger targets get less
 * scale than smaller ones would need, because the same ratio moves more pixels.
 *
 * Android still gets its ripple — the two read as one response, and removing the ripple
 * would make the app feel foreign on the platform most of these merchants use.
 */
export const Press = ({
  children,
  onPress,
  onLongPress,
  disabled,
  scaleTo = 0.97,
  haptics = 'tap',
  style,
  ripple,
  ...rest
}) => {
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pressed.value, [0, 1], [1, scaleTo], Extrapolation.CLAMP) }],
  }));

  return (
    <AnimatedPressable
      onPressIn={() => {
        pressed.value = withSpring(1, motion.spring.press);
        if (haptics && !disabled) haptic[haptics]?.();
      }}
      onPressOut={() => { pressed.value = withSpring(0, motion.spring.press); }}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      android_ripple={ripple}
      style={[style, animatedStyle, disabled && { opacity: 0.45 }]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/* ───────────── Entrances ───────────── */

/**
 * Fades a subtree in on mount, optionally rising into place.
 *
 * `from` picks the direction of travel. A list item rises ('bottom'); a detail panel that
 * replaced something slides from the side. Travel distance is a token, not a prop, so
 * entrances across the app share a rhythm.
 */
export const FadeIn = ({
  children,
  delay = 0,
  from = 'bottom',
  distance = motion.travel,
  duration = motion.duration.base,
  style,
}) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { duration, easing: motion.easing.out }));
  }, [delay, duration, progress]);

  const animatedStyle = useAnimatedStyle(() => {
    const offset = interpolate(progress.value, [0, 1], [distance, 0], Extrapolation.CLAMP);
    return {
      opacity: progress.value,
      transform: [
        from === 'bottom' ? { translateY: offset } : { translateY: 0 },
        from === 'left' ? { translateX: -offset } : from === 'right' ? { translateX: offset } : { translateX: 0 },
      ],
    };
  });

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
};

/**
 * Springs a subtree in: fades up from slightly smaller. For the one element a screen wants the eye to finish on,
 * such as a call to action that arrives after the content explaining it.
 */
export const PopIn = ({ children, delay = 0, style }) => {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(delay, withSpring(1, motion.spring.enter));
  }, [delay, progress]);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.94, 1]) }],
  }));
  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
};

/**
 * Staggers a list of children in.
 *
 * Capped at `motion.maxStaggered`: past roughly eight items the last one arrives long
 * after the user has started reading, which reads as jank rather than polish. Everything
 * beyond the cap shares the final delay.
 */
export const Stagger = ({ children, step = motion.stagger, initialDelay = 0, from = 'bottom', style }) => {
  const items = Array.isArray(children) ? children : [children];
  return items.filter(Boolean).map((child, index) => (
    <FadeIn
      key={child?.key ?? index}
      delay={initialDelay + Math.min(index, motion.maxStaggered) * step}
      from={from}
      style={style}
    >
      {child}
    </FadeIn>
  ));
};

/* ───────────── Value transitions ───────────── */

/**
 * Animates a container's height when its content changes size.
 *
 * Used for revealing a field error or expanding a card: the surrounding layout eases into
 * its new shape instead of jumping, which is the difference between "the page changed"
 * and "something appeared".
 */
export const Collapsible = ({ open, children, duration = motion.duration.fast }) => {
  const progress = useSharedValue(open ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, { duration, easing: motion.easing.inOut });
  }, [open, duration, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: interpolate(progress.value, [0, 1], [-4, 0], Extrapolation.CLAMP) }],
  }));

  if (!open) return null;
  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
};

/**
 * A progress bar that eases to its target.
 *
 * `value` is 0–1. Used by the setup journey and the launch sequence, where the movement
 * itself is the message: the bar advancing is what tells the merchant a step completed.
 */
export const ProgressBar = ({ value, height = 6, track, fill, duration = motion.duration.slow, style }) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(Math.max(0, Math.min(1, value)), { duration, easing: motion.easing.out });
  }, [value, duration, progress]);

  const animatedStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  return (
    <Animated.View style={[{ height, borderRadius: height, backgroundColor: track, overflow: 'hidden' }, style]}>
      <Animated.View style={[{ height, borderRadius: height, backgroundColor: fill }, animatedStyle]} />
    </Animated.View>
  );
};

/**
 * A number that counts up to its value: from 0 on first show, from the old value when it changes, so a new period's
 * total visibly arrives. Screen readers get the final value; with Reduce Motion on, the final value shows at once.
 *
 * Runs on the JS thread with requestAnimationFrame, not a worklet: it formats with Intl (money, grouping), which is
 * not available on the UI thread, and it lives for well under a second. `step` rounds the frames (100 = whole rupees
 * when the value is paise); the last frame is always the exact value.
 */
export const CountUp = ({ value, format = String, step = 1, duration = motion.duration.ceremony, style, ...rest }) => {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const from = useRef(reduce ? value : 0);

  useEffect(() => {
    if (reduce || !Number.isFinite(value)) { from.current = value; setShown(value); return undefined; }
    const start = from.current, began = Date.now();
    let frame;
    const tick = () => {
      const t = Math.min(1, (Date.now() - began) / duration);
      // Quartic ease-out: most of the distance early, then a glide into the final number.
      const next = t === 1 ? value : Math.round((start + (value - start) * (1 - (1 - t) ** 4)) / step) * step;
      from.current = next; setShown(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, reduce, duration, step]);

  return <Text style={style} accessibilityLabel={format(value)} {...rest}>{format(shown)}</Text>;
};

export { Animated };
