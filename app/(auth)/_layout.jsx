import { Stack } from 'expo-router';
import { colors, type } from '../../src/theme.js';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.canvas },
        headerShadowVisible: false,
        headerTintColor: colors.ink900,
        headerTitleStyle: { ...type.heading, color: colors.ink900 },
        headerBackTitle: 'Back',
        contentStyle: { backgroundColor: colors.canvas },
      }}
    >
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ title: '' }} />
      {/* Setup screens draw their own header (back, step count, progress). */}
      <Stack.Screen name="signup" options={{ headerShown: false }} />
      <Stack.Screen name="create-account" options={{ headerShown: false }} />
      <Stack.Screen name="verify" options={{ headerShown: false }} />
      <Stack.Screen name="forgot-password" options={{ title: '' }} />
    </Stack>
  );
}
