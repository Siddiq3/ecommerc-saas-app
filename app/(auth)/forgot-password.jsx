import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { forgotPasswordSchema, resetPasswordSchema } from '@storekit/validation';
import { Screen } from '../../src/components/Screen.jsx';
import { Alert, Body, Button, Display, Field } from '../../src/components/ui.jsx';
import { Logo } from '../../src/components/Brand.jsx';
import { FadeIn } from '../../src/components/motion.jsx';
import { useAction } from '../../src/lib/useAsync.js';
import { check, mergeErrors } from '../../src/lib/validation.js';
import { auth as authApi } from '../../src/api/endpoints.js';
import { space } from '../../src/theme.js';

/**
 * Password reset, in two steps on one screen.
 *
 * The request step always reports success, matching the API: whether an address has an
 * account is not something this screen is allowed to reveal.
 */
export default function ForgotPassword() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const [step, setStep] = useState('request');
  const [email, setEmail] = useState(String(params.email ?? ''));
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [errors, setErrors] = useState({});

  const { run: requestCode, pending: requesting, error: requestError } = useAction(async (data) => {
    await authApi.forgotPassword(data.email);
    setStep('reset');
  });

  const { run: reset, pending: resetting, error: resetError } = useAction(async (data) => {
    await authApi.resetPassword(data);
    router.replace({ pathname: '/(auth)/login', params: { email: data.email } });
  });

  const submitRequest = () => {
    const result = check(forgotPasswordSchema, { email });
    setErrors(result.errors);
    if (result.ok) requestCode(result.data).catch(() => undefined);
  };

  const submitReset = () => {
    const result = check(resetPasswordSchema, { email, code, newPassword });
    setErrors(result.errors);
    if (result.ok) reset(result.data).catch(() => undefined);
  };

  const error = requestError ?? resetError;
  const fieldErrors = mergeErrors(errors, error);
  const generalError = error && Object.keys(error.fieldErrors ?? {}).length === 0 ? error.message : null;

  if (step === 'request') {
    return (
      <Screen
        footer={
          <Button
            title="Send reset code"
            size="lg"
            loading={requesting}
            onPress={submitRequest}
          />
        }
      >
        <FadeIn><Logo size={28} style={styles.logo} /></FadeIn>
        <Display>Reset your password</Display>
        <Body muted style={styles.sub}>
          Enter your email and we will send a six-digit code.
        </Body>

        <View>
          <Alert message={generalError} />
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            autoFocus
            maxLength={254}
            error={fieldErrors.email}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <Button
          title="Set new password"
          size="lg"
          loading={resetting}
          onPress={submitReset}
        />
      }
    >
      <Display>Choose a new password</Display>
      <Body muted style={styles.sub}>
        If {email} has an account, a code is on its way. Enter it below.
      </Body>

      <View>
        <Alert message={generalError} />

        <Field
          label="Reset code"
          value={code}
          onChangeText={setCode}
          placeholder="123456"
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={6}
          autoFocus
          error={fieldErrors.code}
        />

        <Field
          label="New password"
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder="At least 8 characters"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          maxLength={128}
          hint="Eight characters or more, with at least one letter and one number."
          error={fieldErrors.newPassword}
        />

        <Button title="Use a different email" variant="ghost" onPress={() => setStep('request')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  logo: { marginBottom: space.xl },
  sub: { marginTop: space.sm, marginBottom: space.xxl },
});
