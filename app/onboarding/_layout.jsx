import { Stack } from 'expo-router';
import { colors } from '../../src/theme.js';

/**
 * Guided setup: one question per screen, each pushed on the last so Back walks the same path
 * in reverse and the native swipe-back gesture works. Answers live in OnboardingProvider,
 * not in the screens, so a screen popped and pushed again finds them still filled in.
 *
 * The first question has nothing behind it (the merchant is already verified), and the last
 * two are one-way: once the store is being created, going back would mean asking to create
 * it twice.
 */
export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.canvas },
        animation: 'slide_from_right',
        // The verify screen replaces itself with this one; slide in rather than pop in.
        animationTypeForReplace: 'push',
      }}
    >
      <Stack.Screen name="index" options={{ gestureEnabled: false }} />
      <Stack.Screen name="details" />
      <Stack.Screen name="location" />
      <Stack.Screen name="design" />
      <Stack.Screen name="building" options={{ gestureEnabled: false, animation: 'fade', animationDuration: 500 }} />
      <Stack.Screen name="ready" options={{ gestureEnabled: false, animation: 'fade', animationDuration: 600 }} />
    </Stack>
  );
}
