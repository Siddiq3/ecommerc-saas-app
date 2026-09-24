import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  useAnimatedStyle, useSharedValue, withSpring, withTiming, runOnJS,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { haptic, Press } from './motion.jsx';
import { colors, motion, radius, shadow, space, type } from '../theme.js';

/**
 * Toasts — the app's answer to "did that work?".
 *
 * Before this, confirmation came from the platform's own alert dialog, which stops the
 * merchant, steals focus, and looks like the operating system rather than the product. A
 * toast reports the same thing without interrupting: it arrives over the content, says what
 * happened, and leaves.
 *
 * Deliberately *not* used for destructive confirmations — "are you sure you want to delete
 * this?" must block, so those stay as real dialogs. Toasts are for reporting what already
 * happened, never for asking.
 */

const ToastContext = createContext(null);

const TONES = {
  success: { icon: 'checkmark-circle', fg: colors.success, bg: colors.successTint, border: '#bbf7d0' },
  error: { icon: 'alert-circle', fg: colors.danger, bg: colors.dangerTint, border: '#fecdd3' },
  info: { icon: 'information-circle', fg: colors.ink800, bg: colors.surface, border: colors.line },
};

const DURATION = 3200;

export const ToastProvider = ({ children }) => {
  const [current, setCurrent] = useState(null);
  const timer = useRef(null);

  const dismiss = useCallback(() => {
    clearTimeout(timer.current);
    setCurrent(null);
  }, []);

  const show = useCallback((message, tone = 'info') => {
    if (!message) return;
    clearTimeout(timer.current);
    // A key per call so an identical consecutive message still re-animates — otherwise
    // saving the same thing twice looks like the second save did nothing.
    setCurrent({ message: String(message), tone, key: Date.now() });
    if (tone === 'success') haptic.success();
    else if (tone === 'error') haptic.error();
    timer.current = setTimeout(() => setCurrent(null), DURATION);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  const api = useMemo(() => ({
    show,
    success: (message) => show(message, 'success'),
    error: (message) => show(message, 'error'),
    info: (message) => show(message, 'info'),
    dismiss,
  }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {current ? <Toast key={current.key} {...current} onDismiss={dismiss} /> : null}
    </ToastContext.Provider>
  );
};

/**
 * Returns the toast API.
 *
 * Safe to call outside the provider — it returns no-ops rather than throwing, so a screen
 * rendered in isolation (a test, a storybook-style preview) does not crash on feedback.
 */
export const useToast = () => useContext(ToastContext) ?? NOOP;

const NOOP = { show: () => {}, success: () => {}, error: () => {}, info: () => {}, dismiss: () => {} };

const Toast = ({ message, tone, onDismiss }) => {
  const insets = useSafeAreaInsets();
  const palette = TONES[tone] ?? TONES.info;
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withSpring(1, motion.spring.enter);
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * -24 }],
  }));

  const close = () => {
    progress.value = withTiming(0, { duration: motion.duration.fast }, (finished) => {
      if (finished) runOnJS(onDismiss)();
    });
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrap, { top: insets.top + space.sm }, animatedStyle]}
    >
      <Press
        onPress={close}
        haptics={null}
        scaleTo={0.985}
        accessibilityRole="alert"
        accessibilityLabel={message}
        style={[styles.toast, { backgroundColor: palette.bg, borderColor: palette.border }]}
      >
        <Ionicons name={palette.icon} size={19} color={palette.fg} />
        <Text style={[styles.text, { color: palette.fg }]} numberOfLines={3}>{message}</Text>
      </Press>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: space.lg, right: space.lg, zIndex: 999 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    ...shadow.lift,
  },
  text: { ...type.bodyStrong, flex: 1, fontSize: 14 },
});
