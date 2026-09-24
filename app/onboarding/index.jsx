import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { StepScreen } from '../../src/components/StepScreen.jsx';
import { Body, Button, Caption, Touchable } from '../../src/components/ui.jsx';
import { Press, haptic } from '../../src/components/motion.jsx';
import { useAuth } from '../../src/state/auth.jsx';
import { useOnboarding } from '../../src/state/onboarding.jsx';
import { CATEGORY_OPTIONS } from '../../src/lib/onboarding.js';
import { colors, fonts, motion, radius, space, type } from '../../src/theme.js';

/**
 * Step 2 — what do you sell?
 *
 * One tap, no typing. The answer picks the products the store previews are stocked with for
 * the rest of setup, so the merchant sees their choice reflected almost immediately.
 */

const GAP = space.md;

export default function Category() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { signOut } = useAuth();
  const { draft, update } = useOnboarding();

  // Two columns inside the screen's 24pt gutters.
  const cardWidth = (width - space.xl * 2 - GAP) / 2;

  return (
    <StepScreen
      step={2}
      from={0.2}
      progress={0.42}
      title="Let's set up your business"
      subtitle="Tell us what you sell so we can personalize your store."
      footer={
        <Button
          title="Continue"
          size="lg"
          disabled={!draft.categoryId}
          onPress={() => router.push('/onboarding/details')}
        />
      }
    >
      <View style={styles.grid}>
        {CATEGORY_OPTIONS.map((option, index) => (
          <CategoryCard
            key={option.id}
            option={option}
            index={index}
            width={cardWidth}
            selected={draft.categoryId === option.id}
            onPress={() => update('categoryId', option.id)}
          />
        ))}
      </View>

      <Touchable onPress={signOut} haptics={null} scaleTo={1} style={styles.signOut} accessibilityLabel="Sign out">
        <Caption style={styles.signOutText}>Not you? Sign out</Caption>
      </Touchable>
    </StepScreen>
  );
}

const CategoryCard = ({ option, index, width, selected, onPress }) => {
  const enter = useSharedValue(0);
  const pick = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    enter.value = withDelay(220 + index * 45, withTiming(1, { duration: motion.duration.slow, easing: motion.easing.out }));
  }, [enter, index]);

  useEffect(() => {
    pick.value = withSpring(selected ? 1 : 0, motion.spring.snap);
  }, [selected, pick]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * 16 }, { scale: 1 + pick.value * 0.025 }],
  }));
  // The selection ring is a separate layer so the border can fade in without shifting the
  // card's layout by a pixel between the resting and selected borders.
  const ringStyle = useAnimatedStyle(() => ({ opacity: pick.value }));
  const badgeStyle = useAnimatedStyle(() => ({ opacity: pick.value, transform: [{ scale: 0.3 + pick.value * 0.7 }] }));
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + pick.value * 0.12 }, { rotate: `${pick.value * -6}deg` }] }));

  return (
    <Animated.View style={[{ width }, cardStyle]}>
      <Press
        onPress={() => { haptic.select(); onPress(); }}
        haptics={null}
        scaleTo={0.96}
        style={styles.card}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={option.label}
      >
        <Animated.View pointerEvents="none" style={[styles.ring, ringStyle]} />
        <Animated.View style={[styles.badge, badgeStyle]}>
          <Ionicons name="checkmark" size={14} color="#ffffff" />
        </Animated.View>
        <Animated.View style={[styles.medallion, { backgroundColor: option.tint }, iconStyle]}>
          <Ionicons name={option.icon} size={28} color={colors.ink900} />
        </Animated.View>
        <Body strong style={styles.label}>{option.label}</Body>
      </Press>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  card: {
    // Tall enough for a two-line label, so a wrapped name doesn't make its row uneven.
    minHeight: 150,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.lg,
    justifyContent: 'space-between',
  },
  ring: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.accent600,
    backgroundColor: colors.accent50,
    opacity: 0,
  },
  badge: {
    position: 'absolute',
    top: space.md,
    right: space.md,
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.accent600,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medallion: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { ...type.heading, fontFamily: fonts.semibold, fontSize: 16, lineHeight: 21, marginTop: space.lg },

  signOut: { alignSelf: 'center', marginTop: space.xl, minHeight: 44, justifyContent: 'center', paddingHorizontal: space.lg },
  signOutText: { color: colors.ink500 },
});
