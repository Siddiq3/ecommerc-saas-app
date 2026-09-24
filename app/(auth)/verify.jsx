import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { OTP_RESEND_COOLDOWN_SECONDS, maskEmail } from '@storekit/shared';
import { otpCode } from '@storekit/validation';
import { StepScreen } from '../../src/components/StepScreen.jsx';
import { OtpInput } from '../../src/components/OtpInput.jsx';
import { Alert, Body, Button, Caption, Touchable } from '../../src/components/ui.jsx';
import { useAuth } from '../../src/state/auth.jsx';
import { useOnboarding } from '../../src/state/onboarding.jsx';
import { useAction } from '../../src/lib/useAsync.js';
import { auth as authApi } from '../../src/api/endpoints.js';
import { colors, fonts, space } from '../../src/theme.js';

/**
 * Step 1, continued — proving the address is theirs.
 *
 * The API verifies an emailed code (there is no SMS sender behind it), so that is what this
 * screen says. Verifying returns a session, and the root guard — seeing a signed-in owner
 * with no store — carries on to the first setup question by itself; there is no "now sign
 * in" round trip.
 */

const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export default function Verify() {
  const router = useRouter();
  const { email } = useLocalSearchParams();
  const { verifyEmail } = useAuth();
  const { update } = useOnboarding();

  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(OTP_RESEND_COOLDOWN_SECONDS);
  const [resent, setResent] = useState(false);
  const [errorKey, setErrorKey] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const { run: verify, pending, error, clearError } = useAction(async (value) => {
    try {
      await verifyEmail({ email: String(email), code: value });
    } catch (err) {
      setCode('');
      setErrorKey((n) => n + 1);
      throw err;
    }
    // The password has done its job; do not keep it in memory any longer than needed.
    update('account', { password: '' });
  });

  const { run: resend, pending: resending } = useAction(async () => {
    await authApi.requestOtp(String(email), 'email_verification');
    setResent(true);
    setCooldown(OTP_RESEND_COOLDOWN_SECONDS);
  });

  const ready = otpCode.safeParse(code).success;

  const onChange = (value) => {
    setCode(value);
    if (error) clearError();
    setResent(false);
    // Submits itself the moment the sixth digit lands — nobody wants to reach for a button.
    if (value.length === 6 && !pending) verify(value).catch(() => undefined);
  };

  return (
    <StepScreen
      step={1}
      from={0.13}
      progress={0.2}
      title="Verify your account"
      subtitle={`We've sent a 6-digit verification code to ${maskEmail(String(email))}.`}
      onBack={() => router.back()}
      footer={
        <Button
          title="Continue"
          size="lg"
          loading={pending}
          disabled={!ready}
          onPress={() => verify(code).catch(() => undefined)}
        />
      }
    >
      <OtpInput value={code} onChange={onChange} error={error?.message} errorKey={errorKey} editable={!pending} />

      <View style={styles.messages}>
        <Alert message={error?.message} />
        {resent && !error ? <Alert message="A new code is on its way." tone="success" /> : null}
      </View>

      <View style={styles.resend}>
        {cooldown > 0 ? (
          <Body muted style={styles.timer}>
            Resend code in <Body style={styles.timerValue}>{clock(cooldown)}</Body>
          </Body>
        ) : (
          <Touchable
            onPress={() => resend().catch(() => undefined)}
            disabled={resending}
            haptics="tap"
            scaleTo={1}
            style={styles.resendButton}
            accessibilityLabel="Resend code"
          >
            <Body style={styles.resendLabel}>{resending ? 'Sending…' : 'Resend code'}</Body>
          </Touchable>
        )}
        <Caption style={styles.hint}>Nothing yet? Check your spam folder, and that the address above is right.</Caption>
      </View>
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  messages: { marginTop: space.lg },
  resend: { alignItems: 'center', marginTop: space.md, gap: space.sm },
  timer: { fontSize: 15 },
  timerValue: { fontFamily: fonts.semibold, color: colors.ink900, fontVariant: ['tabular-nums'] },
  resendButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.lg },
  resendLabel: { color: colors.accent700, fontFamily: fonts.semibold, fontSize: 15.5 },
  hint: { textAlign: 'center', maxWidth: 280 },
});
