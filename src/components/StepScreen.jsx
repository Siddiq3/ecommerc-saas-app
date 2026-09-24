import { useEffect } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Body, Caption, Display, Touchable } from './ui.jsx';
import { Logo } from './Brand.jsx';
import { FadeIn } from './motion.jsx';
import { TOTAL_STEPS } from '../lib/onboarding.js';
import { colors, fonts, motion, radius, space } from '../theme.js';

/**
 * The frame every setup screen sits in.
 *
 * One purpose per screen means the chrome has to be identical on all of them, so the
 * merchant's eye learns where the question, the progress and the way forward always are.
 * The bar is continuous rather than five separate segments: it *travels* from where the
 * previous screen left it to where this one ends, so each Continue reads as movement
 * along one path instead of a jump to a new page.
 *
 * `progress` is 0–1 and `from` is where the previous screen ended. Screens that split one
 * step in two (business details) pass a fraction, so the bar still advances honestly.
 */

const Track = ({ from, to }) => {
  const width = useSharedValue(from);

  useEffect(() => {
    // A short beat first, so the bar moves after the screen has settled and is noticed.
    width.value = withDelay(180, withTiming(to, { duration: 620, easing: motion.easing.out }));
  }, [to, width]);

  const fill = useAnimatedStyle(() => ({ width: `${width.value * 100}%` }));

  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, fill]} />
    </View>
  );
};

export const BackButton = ({ onPress }) => (
  <Touchable onPress={onPress} accessibilityLabel="Go back" style={styles.back} hitSlop={8}>
    <Ionicons name="chevron-back" size={22} color={colors.ink800} />
  </Touchable>
);

export const StepScreen = ({
  step,
  progress,
  from = 0,
  title,
  subtitle,
  onBack,
  logo = false,
  center = false,
  headerRight,
  footer,
  children,
}) => {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + space.md }]}>
        <View style={styles.headerRow}>
          {onBack ? <BackButton onPress={onBack} /> : <View style={styles.backSpacer} />}
          <View style={styles.headerMiddle}>{logo ? <Logo size={26} /> : null}</View>
          {headerRight ?? (
            <View style={styles.stepPill}>
              <Caption style={styles.stepLabel}>
                <Caption style={styles.stepNumber}>{step}</Caption> of {TOTAL_STEPS}
              </Caption>
            </View>
          )}
        </View>
        <Track from={from} to={progress} />
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
      >
        {/* `center` is the sign-in-style opener: brand mark, then a large centred headline. */}
        {center ? (
          <FadeIn style={styles.mark}>
            <Logo size={64} showName={false} />
          </FadeIn>
        ) : null}
        <FadeIn>
          <Display style={[styles.title, center && styles.titleCenter]}>{title}</Display>
        </FadeIn>
        {subtitle ? (
          <FadeIn delay={70}>
            <Body muted style={[styles.subtitle, center && styles.subtitleCenter]}>{subtitle}</Body>
          </FadeIn>
        ) : (
          <View style={styles.titleGap} />
        )}
        <FadeIn delay={140} distance={16}>{children}</FadeIn>
      </ScrollView>

      {footer ? <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>{footer}</View> : null}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },

  header: { paddingHorizontal: space.xl, paddingBottom: space.md, gap: space.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  headerMiddle: { flex: 1, alignItems: 'flex-start' },
  back: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backSpacer: { width: 44, height: 44 },
  // A pill rather than loose text: it is the one constant in the header, and giving it a
  // shape lets the eye find "where am I" without reading.
  stepPill: {
    paddingHorizontal: space.md,
    height: 30,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.accent50,
  },
  stepLabel: { color: colors.accent700, fontSize: 12.5 },
  stepNumber: { color: colors.accent700, fontFamily: fonts.bold, fontSize: 13.5 },

  track: { height: 5, borderRadius: 5, backgroundColor: colors.ink200, overflow: 'hidden' },
  fill: { height: 5, borderRadius: 5, backgroundColor: colors.accent600 },

  content: { paddingHorizontal: space.xl, paddingTop: space.xl, paddingBottom: space.xxl },
  // No size override: the heading is the display token, so every setup screen and the
  // ceremonial screens after them speak at exactly the same volume.
  title: {},
  titleGap: { height: space.xxl },
  mark: { alignItems: 'center', marginTop: space.lg, marginBottom: space.xxl },
  titleCenter: { textAlign: 'center', fontSize: 36, lineHeight: 43 },
  subtitleCenter: { textAlign: 'center', paddingHorizontal: space.md },
  subtitle: { marginTop: space.sm, marginBottom: space.xxl, fontSize: 16, lineHeight: 23 },

  // No divider and no white bar: the button floats on the canvas, so the screen reads as
  // one surface with one thing to press.
  footer: { paddingHorizontal: space.xl, paddingTop: space.md, gap: space.sm },
});
