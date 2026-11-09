import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { OTP_RESEND_COOLDOWN_SECONDS, maskEmail } from '@storekit/shared';
import { otpCode } from '@storekit/validation';
import { Screen } from '../../src/components/Screen.jsx';
import { OtpInput } from '../../src/components/OtpInput.jsx';
import { Alert, Body, Button, Caption, Touchable } from '../../src/components/ui.jsx';
import { useToast } from '../../src/components/Toast.jsx';
import { useAuth } from '../../src/state/auth.jsx';
import { useAction } from '../../src/lib/useAsync.js';
import { auth as authApi } from '../../src/api/endpoints.js';
import { colors, fonts, space } from '../../src/theme.js';

/**
 * Optional email verification, any time after sign-up. Nothing in the app waits on it: it
 * confirms the address password-reset codes go to. The code is sent when the screen opens.
 */
export default function VerifyEmail() {
  const router = useRouter();
  const toast = useToast();
  const { user, refreshUser } = useAuth();

  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [errorKey, setErrorKey] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const { run: send, pending: sending, error: sendError } = useAction(async () => {
    try {
      await authApi.requestEmailVerification();
      setCooldown(OTP_RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      // A code sent moments ago (reopening this screen, say) is still valid: just wait to resend.
      if (err?.code === 'OTP_COOLDOWN') { setCooldown(OTP_RESEND_COOLDOWN_SECONDS); return; }
      throw err;
    }
  });

  // Once per visit. `send` is a new function every render, so it cannot be the effect's trigger.
  const sentOnOpen = useRef(false);
  useEffect(() => {
    if (sentOnOpen.current) return;
    sentOnOpen.current = true;
    send().catch(() => undefined);
  });

  const { run: confirm, pending, error, clearError } = useAction(async (value) => {
    try {
      await authApi.confirmEmailVerification(value);
    } catch (err) {
      setCode('');
      setErrorKey((n) => n + 1);
      throw err;
    }
    await refreshUser();
    toast.success('Email verified');
    router.back();
  });

  const onChange = (value) => {
    setCode(value);
    if (error) clearError();
    if (value.length === 6 && !pending) confirm(value).catch(() => undefined);
  };

  return (
    <Screen
      footer={
        <Button
          title="Verify"
          loading={pending}
          disabled={!otpCode.safeParse(code).success}
          onPress={() => confirm(code).catch(() => undefined)}
        />
      }
    >
      <Body style={styles.lead}>
        Enter the 6-digit code we sent to {maskEmail(user?.email ?? '')}. Verifying makes sure password reset codes reach you.
      </Body>

      <OtpInput value={code} onChange={onChange} error={error?.message} errorKey={errorKey} editable={!pending} />

      <View style={styles.messages}>
        <Alert message={error?.message ?? sendError?.message} />
      </View>

      <View style={styles.resend}>
        {cooldown > 0 ? (
          <Body muted>Resend code in <Body style={styles.timer}>{cooldown}s</Body></Body>
        ) : (
          <Touchable
            onPress={() => send().catch(() => undefined)}
            disabled={sending}
            haptics="tap"
            scaleTo={1}
            style={styles.resendButton}
            accessibilityLabel="Resend code"
          >
            <Body style={styles.resendLabel}>{sending ? 'Sending…' : 'Resend code'}</Body>
          </Touchable>
        )}
        <Caption style={styles.hint}>Nothing yet? Check your spam folder.</Caption>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  lead: { marginBottom: space.xl },
  messages: { marginTop: space.lg },
  resend: { alignItems: 'center', marginTop: space.md, gap: space.sm },
  timer: { fontFamily: fonts.semibold, color: colors.ink900, fontVariant: ['tabular-nums'] },
  resendButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.lg },
  resendLabel: { color: colors.accent700, fontFamily: fonts.semibold, fontSize: 15.5 },
  hint: { textAlign: 'center', maxWidth: 280 },
});
