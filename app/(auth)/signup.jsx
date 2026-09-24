import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { email as emailSchema } from '@storekit/validation';
import { StepScreen } from '../../src/components/StepScreen.jsx';
import { LegalNote } from '../../src/components/LegalNote.jsx';
import { Body, Button, Field, Touchable } from '../../src/components/ui.jsx';
import { useOnboarding } from '../../src/state/onboarding.jsx';
import { colors, fonts } from '../../src/theme.js';

/**
 * Step 1 — just an email.
 *
 * The opening question is the smallest one there is, so starting feels like nothing: one
 * field, one button. Name, mobile and password come on the next screen, once the merchant
 * has already said yes. The email is validated with the API's own rule and Continue stays
 * disabled until it passes.
 */
export default function SignUp() {
  const router = useRouter();
  const { draft, update } = useOnboarding();
  const [touched, setTouched] = useState(false);

  const value = draft.account.email;
  const parsed = emailSchema.safeParse(value);
  // Shown once the field has been visited, and only for a value that is actually there.
  const error = touched && value.trim() && !parsed.success ? parsed.error.issues[0].message : undefined;

  const next = () => {
    if (!parsed.success) return;
    update('account', { email: parsed.data });
    router.push('/(auth)/create-account');
  };

  return (
    <StepScreen
      center
      step={1}
      progress={0.06}
      title="Create your account on StoreKit"
      subtitle="This is the gateway to your online store. Enter your email to continue."
      onBack={() => router.back()}
      footer={
        <>
          <Button title="Continue" size="lg" disabled={!parsed.success} onPress={next} />
          <Touchable
            onPress={() => router.replace('/(auth)/login')}
            haptics="tap"
            scaleTo={1}
            style={styles.alt}
            accessibilityLabel="Sign in to an existing account"
          >
            <Body style={styles.altMuted}>Already have an account? </Body>
            <Body style={styles.altLink}>Sign in</Body>
          </Touchable>
          <LegalNote />
        </>
      }
    >
      <Field
        accessibilityLabel="Email"
        value={value}
        onChangeText={(text) => update('account', { email: text })}
        onBlur={() => setTouched(true)}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={next}
        maxLength={254}
        autoFocus
        error={error}
      />
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  alt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  altMuted: { color: colors.ink500, fontSize: 14.5 },
  altLink: { color: colors.accent700, fontFamily: fonts.semibold, fontSize: 14.5 },
});
