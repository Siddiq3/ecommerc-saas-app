import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
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
 * Three factors, because that is what the API checks: email, mobile and password. The
 * error copy stays identical for every failure — wrong email, wrong number, wrong
 * password — so the form cannot be used to discover which accounts exist.
 */
export default function Login() {
  const router = useRouter();
  const { signIn } = useAuth();

  const [form, setForm] = useState({ email: '', mobile: '', password: '' });
  const [errors, setErrors] = useState({});

  const set = (key) => (value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  // The device fields are filled in by the auth provider, so the form checks only what the
  // merchant types — against the same schema the API applies.
  const credentialsSchema = loginSchema.pick({ email: true, mobile: true, password: true });

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

  const needsVerification = error?.code === 'EMAIL_NOT_VERIFIED';

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
          label="Email"
          value={form.email}
          onChangeText={set('email')}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          maxLength={254}
          error={fieldErrors.email}
        />

        <Field
          label="Mobile number"
          value={form.mobile}
          onChangeText={set('mobile')}
          placeholder="98765 43210"
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          prefix="+91"
          maxLength={17}
          error={fieldErrors.mobile}
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

        {needsVerification ? (
          <Button
            title="Verify my email"
            variant="secondary"
            onPress={() => router.push({ pathname: '/(auth)/verify', params: { email: form.email.trim().toLowerCase() } })}
          />
        ) : null}

        <Button
          title="Forgot your password?"
          variant="ghost"
          onPress={() => router.push({ pathname: '/(auth)/forgot-password', params: { email: form.email.trim().toLowerCase() } })}
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
