import { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Urbanist_600SemiBold, Urbanist_700Bold } from '@expo-google-fonts/urbanist';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { AuthProvider, useAuth } from '../src/state/auth.jsx';
import { OnboardingProvider } from '../src/state/onboarding.jsx';
import { PlanProvider, usePlan } from '../src/state/plan.jsx';
import { ToastProvider } from '../src/components/Toast.jsx';
import { colors, type } from '../src/theme.js';

/**
 * Root layout: providers, navigation chrome, and the one guard that decides which of the
 * three worlds the app is in — signed out, signed in without a store, or running.
 */

/**
 * Redirects rather than conditionally rendering trees.
 *
 * Conditional trees unmount every screen on a state change, so a token refresh landing
 * mid-navigation would throw the user back to the root. Redirecting keeps the navigator
 * intact and only moves where the user is standing.
 */
const RouteGuard = () => {
  const { status, user } = useAuth();
  const { needsOnboarding } = usePlan();
  const segments = useSegments();
  const router = useRouter();
  // Navigating before the navigator has mounted is a no-op that silently drops the route.
  const navigationReady = Boolean(useRootNavigationState()?.key);

  useEffect(() => {
    if (!navigationReady || status === 'loading') return;

    const group = segments[0];
    const inAuth = group === '(auth)';
    const inOnboarding = group === 'onboarding';
    // The bare launch route (`app/index.jsx`, segments `[]`) is only ever a splash while the
    // session is read — nobody should be left sitting on it. A returning merchant cold-starts
    // here with a saved session, so an authenticated user at the root must be moved on, not
    // just one who happens to be on an auth or onboarding screen.
    const atLaunch = group === undefined;

    if (status === 'unauthenticated') {
      if (!inAuth) router.replace('/(auth)/welcome');
      return;
    }

    // Signed in but no store yet: the product has nothing to show until one exists.
    const hasStore = Boolean(user?.businesses?.length) && !needsOnboarding;
    if (!hasStore && user) {
      if (!inOnboarding) router.replace('/onboarding');
      return;
    }

    if (inAuth || atLaunch || (inOnboarding && hasStore)) router.replace('/(tabs)');
  }, [navigationReady, status, user, needsOnboarding, segments, router]);

  return null;
};

const Boot = () => (
  <View style={styles.boot}>
    <ActivityIndicator color={colors.accent600} size="large" />
  </View>
);

const Navigation = () => {
  const { isLoading } = useAuth();

  return (
    <>
      <RouteGuard />
      {isLoading ? <Boot /> : null}
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.canvas },
          headerShadowVisible: false,
          headerTintColor: colors.ink900,
          headerTitleStyle: { ...type.heading, color: colors.ink900 },
          headerBackTitle: 'Back',
          contentStyle: { backgroundColor: colors.canvas },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />

        {/* Presented as a sheet: upgrading is an interruption, not a destination. */}
        <Stack.Screen
          name="paywall"
          options={{ presentation: 'modal', headerShown: false, animation: 'slide_from_bottom' }}
        />

        <Stack.Screen name="orders/[orderId]" options={{ title: 'Order' }} />
        <Stack.Screen name="products/[productId]" options={{ title: 'Product' }} />
        <Stack.Screen name="products/new" options={{ title: 'New product', presentation: 'modal' }} />
        <Stack.Screen name="customers/[customerId]" options={{ title: 'Customer' }} />
        <Stack.Screen name="categories/index" options={{ title: 'Categories' }} />
        <Stack.Screen name="coupons/index" options={{ title: 'Coupons' }} />
        <Stack.Screen name="analytics" options={{ title: 'Analytics' }} />
        <Stack.Screen name="notifications" options={{ title: 'Activity' }} />
        <Stack.Screen name="settings/profile" options={{ title: 'Your profile' }} />
        <Stack.Screen name="settings/security" options={{ title: 'Security' }} />
        <Stack.Screen name="settings/subscription" options={{ title: 'Subscription' }} />
      </Stack>
    </>
  );
};

export default function RootLayout() {
  /**
   * Nothing renders until the brand faces are in memory.
   *
   * Android does not synthesise weights for custom families, and a first paint in the
   * system font followed by a swap would reflow every line of text on screen. A held boot
   * screen for a few hundred milliseconds is the cheaper trade.
   */
  const [fontsLoaded, fontError] = useFonts({
    Urbanist_600SemiBold,
    Urbanist_700Bold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  // A hard ceiling on how long fonts may hold the app hostage. On a cold start the native
  // font load can stall past what a merchant will wait; after this we render in the system
  // face rather than showing a spinner forever, and the real fonts swap in when they arrive.
  const [fontTimedOut, setFontTimedOut] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setFontTimedOut(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  const ready = fontsLoaded || Boolean(fontError) || fontTimedOut;

  if (!ready) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" backgroundColor={colors.canvas} />
        <Boot />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" backgroundColor={colors.canvas} />
      <AuthProvider>
        <PlanProvider>
          <ToastProvider>
            {/* Above the navigator: the account and code screens (auth group) and the
                rest of setup (onboarding group) share one draft. */}
            <OnboardingProvider>
              <Navigation />
            </OnboardingProvider>
          </ToastProvider>
        </PlanProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
});
