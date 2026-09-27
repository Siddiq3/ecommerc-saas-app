import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { loginSchema } from '@storekit/validation';
import { Screen } from '../../src/components/Screen.jsx';
import { Alert, Body, Button, Display, Field, Touchable } from '../../src/components/ui.jsx';
import { Logo } from '../../src/components/Brand.jsx';
import { FadeIn } from '../../src/components/motion.jsx';
import { useAuth } from '../../src/state/auth.jsx';
import { useAction } from '../../src/lib/useAsync.js';
import { check, mergeErrors } from '../../src/lib/validation.js';
import { colors, fonts, space } from '../../src/theme.js';

/**
 * Sign in.
 *
 * One field for the email or the mobile number, whichever the merchant remembers, and the
 * password. The API tells them apart (an "@" means an email) and checks each with its own
 * rule. The error copy stays identical for every failure — unknown email, unknown number,
 * wrong password — so the form cannot be used to discover which accounts exist.
 */
export default function Login() {
  const router = useRouter();
  const { signIn } = useAuth();
  // Sign-up sends a returning merchant here with the email they just typed.
  const params = useLocalSearchParams();

  const [form, setForm] = useState({ identifier: String(params.email ?? ''), password: '' });
  const [errors, setErrors] = useState({});

  const set = (key) => (value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  // The device fields are filled in by the auth provider, so the form checks only what the
  // merchant types — against the same schema the API applies.
  const credentialsSchema = loginSchema.pick({ identifier: true, password: true });

  const { run, pending, error } = useAction(async (data) => {
    await signIn(data);
    // RouteGuard takes it from here: to the dashboard, or to store creation if there is
    // no store on the account yet.
  });

  const submit = () => {
    const result = check(credentialsSchema, form);
    setErrors(result.errors);
    if (result.ok) run(result.data).catch(() => undefined);
  };

  const fieldErrors = mergeErrors(errors, error);
  const generalError = error && Object.keys(error.fieldErrors ?? {}).length === 0 ? error.message : null;


  return (
    <Screen footer={<Button title="Sign in" size="lg" loading={pending} onPress={submit} />}>
      <FadeIn>
        <Logo size={28} style={styles.logo} />
        <Display>Welcome back</Display>
        <Body muted style={styles.sub}>Sign in to your store.</Body>
      </FadeIn>

      <View>
        <Alert message={generalError} />

        <Field
          label="Email or mobile number"
          value={form.identifier}
          onChangeText={set('identifier')}
          placeholder="you@example.com or 98765 43210"
          // The email keyboard, because it is the one that has both digits and the "@".
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
          maxLength={254}
          error={fieldErrors.identifier}
        />

        <Field
          label="Password"
          value={form.password}
          onChangeText={set('password')}
          placeholder="Your password"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          maxLength={128}
          onSubmitEditing={submit}
          returnKeyType="go"
          error={fieldErrors.password}
        />

      </View>

      <Touchable
        onPress={() => router.replace('/(auth)/signup')}
        haptics="tap"
        scaleTo={1}
        style={styles.altAction}
        accessibilityLabel="Create a new account"
      >
        <Body style={styles.altMuted}>New to StoreKit? </Body>
        <Body style={styles.altLink}>Create an account</Body>
      </Touchable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  logo: { marginBottom: space.xl },
  sub: { marginTop: space.sm, marginBottom: space.xxl },
  altAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: space.sm,
    paddingVertical: space.md,
    minHeight: 44,
  },
  altMuted: { color: colors.ink500, fontSize: 14.5 },
  altLink: { color: colors.accent700, fontFamily: fonts.semibold, fontSize: 14.5 },
});
