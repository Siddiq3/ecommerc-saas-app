import { forwardRef, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  interpolateColor, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { Collapsible, FadeIn, Press } from './motion.jsx';
import { colors, fonts, motion, radius, shadow, space, tones, type, MIN_TAP } from '../theme.js';

/**
 * The app's UI primitives.
 *
 * Native conventions over web ones: real touch feedback, 44pt minimum targets, no hover
 * states. Everything interactive responds physically — a press scales the surface and fires
 * a light haptic — because a control that does nothing until its work finishes is the single
 * clearest tell of an unfinished app.
 *
 * The visual language (warm neutrals, one confident accent, soft corners, Urbanist over
 * Jakarta) matches the marketing site, so the jump to the browser for checkout does not feel
 * like a different product.
 */

/* ───────────── Type ───────────── */

export const Title = ({ children, style, ...rest }) => (
  <Text style={[styles.title, style]} {...rest}>{children}</Text>
);

export const Display = ({ children, style, ...rest }) => (
  <Text style={[styles.display, style]} {...rest}>{children}</Text>
);

export const Heading = ({ children, style, ...rest }) => (
  <Text style={[styles.heading, style]} {...rest}>{children}</Text>
);

export const Body = ({ children, muted, strong, style, ...rest }) => (
  <Text style={[strong ? styles.bodyStrong : styles.body, muted && styles.muted, style]} {...rest}>
    {children}
  </Text>
);

export const Caption = ({ children, muted = true, style, ...rest }) => (
  <Text style={[styles.caption, muted && styles.muted, style]} {...rest}>{children}</Text>
);

export const Label = ({ children, style, ...rest }) => (
  <Text style={[styles.label, style]} {...rest}>{children}</Text>
);

/** An all-caps kicker, used above section titles. */
export const Eyebrow = ({ children, style }) => (
  <Text style={[styles.eyebrow, style]}>{children}</Text>
);

/** A headline figure — a dashboard stat, a price. Tabular so digits do not jitter. */
export const Figure = ({ children, style, ...rest }) => (
  <Text style={[styles.figure, style]} {...rest}>{children}</Text>
);

/* ───────────── Surfaces ───────────── */

export const Card = ({ children, style, padded = true, ...rest }) => (
  <View style={[styles.card, padded && styles.cardPadded, style]} {...rest}>{children}</View>
);

export const Divider = ({ style }) => <View style={[styles.divider, style]} />;

export const Row = ({ children, style, gap = space.md, align = 'center', ...rest }) => (
  <View style={[{ flexDirection: 'row', alignItems: align, gap }, style]} {...rest}>{children}</View>
);

export const Spacer = ({ size = space.lg }) => <View style={{ height: size }} />;

/* ───────────── Buttons ───────────── */

const buttonTone = {
  primary: { bg: colors.accent600, fg: '#ffffff', ripple: colors.accent700 },
  secondary: { bg: colors.surface, fg: colors.ink800, ripple: colors.ink200, border: true },
  ghost: { bg: 'transparent', fg: colors.ink700, ripple: colors.ink200 },
  danger: { bg: colors.dangerTint, fg: colors.danger, ripple: '#fecaca' },
};

export const Button = ({
  title, onPress, variant = 'primary', size = 'md', loading, disabled, style, icon, full = true,
}) => {
  const tone = buttonTone[variant] ?? buttonTone.primary;
  const isDisabled = Boolean(disabled || loading);

  return (
    <Press
      onPress={onPress}
      disabled={isDisabled}
      // A primary action earns a heavier tap than a ghost link does.
      haptics={variant === 'primary' ? 'press' : 'tap'}
      scaleTo={0.975}
      ripple={isDisabled ? undefined : { color: tone.ripple }}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: Boolean(loading) }}
      style={[
        styles.button,
        size === 'sm' && styles.buttonSm,
        size === 'lg' && styles.buttonLg,
        { backgroundColor: tone.bg },
        tone.border && styles.buttonBordered,
        full && { alignSelf: 'stretch' },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={tone.fg} size="small" />
      ) : (
        <>
          {icon}
          <Text style={[styles.buttonText, size === 'sm' && styles.buttonTextSm, { color: tone.fg }]}>
            {title}
          </Text>
        </>
      )}
    </Press>
  );
};

/** A whole row that behaves as a button — list items, settings rows. */
export const Touchable = ({
  children, onPress, style, disabled, accessibilityLabel, accessibilityRole = 'button',
  haptics = 'tap', scaleTo = 0.985, ...rest
}) => (
  <Press
    onPress={onPress}
    disabled={disabled}
    haptics={haptics}
    scaleTo={scaleTo}
    ripple={{ color: colors.ink200 }}
    accessibilityRole={accessibilityRole}
    accessibilityLabel={accessibilityLabel}
    style={style}
    {...rest}
  >
    {children}
  </Press>
);

/* ───────────── Pills ───────────── */

export const Pill = ({ label, tone = 'slate', style }) => {
  const palette = tones[tone] ?? tones.slate;
  return (
    <View style={[styles.pill, { backgroundColor: palette.bg }, style]}>
      <Text style={[styles.pillText, { color: palette.fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
};

/**
 * A live status dot — used for "your store is live".
 *
 * The pulse is the point: a static green dot is a label, a breathing one reads as a signal
 * coming from somewhere real.
 */
export const StatusDot = ({ live = true, size = 8, style }) => {
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (!live) return undefined;
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1100, easing: motion.easing.out }),
        withTiming(0, { duration: 0 }),
      ),
      -1,
      false,
    );
    return () => { pulse.value = 0; };
  }, [live, pulse]);

  // The halo expands and fades outward like a ping, then restarts — the dot itself stays put.
  const haloStyle = useAnimatedStyle(() => ({
    opacity: (1 - pulse.value) * 0.45,
    transform: [{ scale: 1 + pulse.value * 1.8 }],
  }));

  return (
    <View style={[{ width: size, height: size }, style]}>
      {live ? (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: size, backgroundColor: colors.success },
            haloStyle,
          ]}
        />
      ) : null}
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size,
          backgroundColor: live ? colors.success : colors.ink400,
        }}
      />
    </View>
  );
};

/* ───────────── Inputs ───────────── */

export const Field = forwardRef(function Field(
  { label, error, hint, style, containerStyle, prefix, right, onFocus, onBlur, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const focus = useSharedValue(0);
  const invalid = useSharedValue(error ? 1 : 0);

  useEffect(() => {
    focus.value = withTiming(focused ? 1 : 0, { duration: motion.duration.fast });
  }, [focused, focus]);

  useEffect(() => {
    invalid.value = withTiming(error ? 1 : 0, { duration: motion.duration.fast });
  }, [error, invalid]);

  // Border and fill ease between three states rather than snapping, so tabbing through a
  // form reads as one continuous movement of attention. The focused field also warms
  // very slightly — enough to say "this one" without turning the form into a colour chart.
  const boxStyle = useAnimatedStyle(() => ({
    borderColor: invalid.value > 0
      ? interpolateColor(invalid.value, [0, 1], [colors.line, colors.danger])
      : interpolateColor(focus.value, [0, 1], [colors.line, colors.accent600]),
    backgroundColor: invalid.value > 0
      ? interpolateColor(invalid.value, [0, 1], [colors.surface, colors.dangerTint])
      : interpolateColor(focus.value, [0, 1], [colors.surface, colors.accent50]),
  }));

  return (
    <View style={[styles.fieldGroup, containerStyle]}>
      {label ? <Label style={styles.fieldLabel}>{label}</Label> : null}
      <Animated.View style={[styles.fieldBox, boxStyle]}>
        {typeof prefix === 'string' ? <Text style={styles.fieldPrefix}>{prefix}</Text> : prefix}
        <TextInput
          ref={ref}
          style={[styles.input, style]}
          placeholderTextColor={colors.ink400}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          accessibilityLabel={label}
          {...rest}
        />
        {right}
      </Animated.View>
      <Collapsible open={Boolean(error)}>
        <Text style={styles.fieldError}>{error}</Text>
      </Collapsible>
      {!error && hint ? <Caption style={styles.fieldHint}>{hint}</Caption> : null}
    </View>
  );
});

/** A labelled on/off row. Uses a pill rather than Switch so it matches the card styling. */
export const Toggle = ({ label, hint, value, onChange, disabled }) => {
  const on = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    on.value = withSpring(value ? 1 : 0, motion.spring.snap);
  }, [value, on]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], [colors.ink200, colors.accent600]),
  }));

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: on.value * 20 }] }));

  return (
    <Touchable
      onPress={() => onChange?.(!value)}
      disabled={disabled}
      haptics="select"
      scaleTo={1}
      style={styles.toggleRow}
      accessibilityRole="switch"
      accessibilityState={{ checked: Boolean(value), disabled: Boolean(disabled) }}
      accessibilityLabel={label}
    >
      <View style={{ flex: 1 }}>
        <Body strong>{label}</Body>
        {hint ? <Caption>{hint}</Caption> : null}
      </View>
      <Animated.View style={[styles.toggleTrack, trackStyle]}>
        <Animated.View style={[styles.toggleThumb, thumbStyle]} />
      </Animated.View>
    </Touchable>
  );
};

/**
 * A checkbox row for consent. `children` is the label, so it can carry inline links —
 * tapping the words toggles the box, tapping a link inside them opens the link instead.
 */
export const Checkbox = ({ checked, onChange, children, error }) => {
  const on = useSharedValue(checked ? 1 : 0);

  useEffect(() => {
    on.value = withSpring(checked ? 1 : 0, motion.spring.snap);
  }, [checked, on]);

  const boxStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], [colors.surface, colors.accent600]),
    borderColor: interpolateColor(on.value, [0, 1], [error ? colors.danger : colors.lineStrong, colors.accent600]),
    transform: [{ scale: 1 + on.value * 0.06 }],
  }));
  const tickStyle = useAnimatedStyle(() => ({ opacity: on.value, transform: [{ scale: 0.4 + on.value * 0.6 }] }));

  return (
    <Touchable
      onPress={() => onChange?.(!checked)}
      haptics="select"
      scaleTo={1}
      style={styles.checkRow}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: Boolean(checked) }}
    >
      <Animated.View style={[styles.checkBox, boxStyle]}>
        <Animated.Text style={[styles.checkTick, tickStyle]}>✓</Animated.Text>
      </Animated.View>
      <Text style={styles.checkLabel}>{children}</Text>
    </Touchable>
  );
};

/* ───────────── States ───────────── */

export const Loading = ({ label }) => (
  <View style={styles.centered}>
    <ActivityIndicator color={colors.accent600} />
    {label ? <Caption style={{ marginTop: space.md }}>{label}</Caption> : null}
  </View>
);

/**
 * An empty screen that explains itself.
 *
 * Every empty state answers three questions: what is missing, why it matters, and what to
 * do next. `icon` renders in a tinted medallion rather than bare, so an empty screen still
 * looks designed rather than unfinished.
 */
export const EmptyState = ({ title, message, action, icon, tint = colors.accent50 }) => (
  <FadeIn style={styles.centered}>
    {icon ? (
      <View style={[styles.emptyMedallion, { backgroundColor: tint }]}>
        <Text style={styles.emptyIcon}>{icon}</Text>
      </View>
    ) : null}
    <Heading style={{ textAlign: 'center' }}>{title}</Heading>
    {message ? (
      <Body muted style={{ textAlign: 'center', marginTop: space.sm, maxWidth: 300 }}>{message}</Body>
    ) : null}
    {action ? <View style={{ marginTop: space.xl, alignSelf: 'stretch', maxWidth: 320 }}>{action}</View> : null}
  </FadeIn>
);

export const ErrorState = ({ error, onRetry }) => (
  <EmptyState
    icon="⚠"
    tint={colors.dangerTint}
    title="Could not load this"
    message={error?.message ?? 'Something went wrong. Please try again.'}
    action={onRetry ? <Button title="Try again" variant="secondary" onPress={onRetry} /> : null}
  />
);

/** Inline error above a form's submit button. */
export const Alert = ({ message, tone = 'danger' }) => {
  const palette =
    tone === 'warning'
      ? { bg: colors.warningTint, fg: colors.warning }
      : tone === 'success'
        ? { bg: colors.successTint, fg: colors.success }
        : { bg: colors.dangerTint, fg: colors.danger };

  return (
    <Collapsible open={Boolean(message)}>
      <View style={[styles.alert, { backgroundColor: palette.bg }]} accessibilityLiveRegion="polite">
        <Text style={[styles.alertText, { color: palette.fg }]}>{message}</Text>
      </View>
    </Collapsible>
  );
};

/* ───────────── Styles ───────────── */

const styles = StyleSheet.create({
  display: { ...type.display, color: colors.ink900 },
  title: { ...type.title, color: colors.ink900 },
  heading: { ...type.heading, color: colors.ink900 },
  body: { ...type.body, color: colors.ink800 },
  bodyStrong: { ...type.bodyStrong, color: colors.ink900 },
  caption: { ...type.caption, color: colors.ink600 },
  label: { ...type.label, color: colors.ink800 },
  figure: { ...type.figure, color: colors.ink900 },
  muted: { color: colors.ink600 },
  eyebrow: { ...type.overline, color: colors.accent700, textTransform: 'uppercase', marginBottom: space.sm },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    ...shadow.card,
  },
  cardPadded: { padding: space.lg },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line },

  button: {
    minHeight: MIN_TAP,
    borderRadius: radius.md,
    paddingHorizontal: space.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    overflow: 'hidden',
  },
  buttonSm: { minHeight: 40, paddingHorizontal: space.lg, borderRadius: radius.sm },
  /** The same 58pt as an input, so a form reads as one stack of equal blocks. */
  buttonLg: { minHeight: 58, borderRadius: radius.md },
  buttonBordered: { borderWidth: 1.5, borderColor: colors.line },
  buttonText: { ...type.bodyStrong, fontFamily: fonts.bold, fontSize: 16.5, letterSpacing: -0.2 },
  buttonTextSm: { fontSize: 14.5 },

  pill: {
    paddingHorizontal: space.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  pillText: { ...type.caption, fontFamily: fonts.semibold },

  fieldGroup: { marginBottom: space.xl },
  fieldLabel: { marginBottom: 10, color: colors.ink700 },
  /**
   * 58pt tall and 18pt round. Bigger than the 44pt minimum on purpose: these are typed into
   * one-handed, often while standing, and a generous box is easier to hit and reads as
   * confident rather than cramped. The height also sets the rhythm the large button matches.
   */
  fieldBox: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 58,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    paddingHorizontal: space.lg + 2,
    gap: space.sm,
  },
  fieldPrefix: { ...type.body, fontFamily: fonts.medium, fontSize: 16.5, color: colors.ink500 },
  input: {
    flex: 1,
    ...type.body,
    // Larger than body text: what you are typing is the subject of the screen, and 16+
    // is also the threshold below which mobile browsers and some keyboards zoom.
    fontSize: 16.5,
    lineHeight: 22,
    fontFamily: fonts.medium,
    color: colors.ink900,
    paddingVertical: space.md,
  },
  fieldError: { ...type.caption, color: colors.danger, marginTop: 7, marginLeft: 2 },
  fieldHint: { marginTop: 7, marginLeft: 2 },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    paddingVertical: space.md,
    minHeight: MIN_TAP,
  },
  toggleTrack: {
    width: 48,
    height: 28,
    borderRadius: radius.pill,
    padding: 3,
    justifyContent: 'center',
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    ...shadow.card,
  },

  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingVertical: space.sm, minHeight: MIN_TAP },
  checkBox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkTick: { color: '#ffffff', fontFamily: fonts.bold, fontSize: 15, lineHeight: 18 },
  checkLabel: { flex: 1, ...type.body, fontSize: 14.5, lineHeight: 21, color: colors.ink600 },

  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xxl,
    minHeight: 240,
  },
  emptyMedallion: {
    width: 68,
    height: 68,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.lg,
  },
  emptyIcon: { fontSize: 30 },

  alert: {
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.lg,
  },
  alertText: { ...type.body, fontSize: 14 },
});

export { styles as uiStyles };
