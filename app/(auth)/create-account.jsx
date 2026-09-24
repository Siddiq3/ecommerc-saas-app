import { useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { signupSchema } from '@storekit/validation';
import { StepScreen } from '../../src/components/StepScreen.jsx';
import { LegalNote } from '../../src/components/LegalNote.jsx';
import { Alert, Button, Field, Touchable } from '../../src/components/ui.jsx';
import { useAuth } from '../../src/state/auth.jsx';
import { useOnboarding } from '../../src/state/onboarding.jsx';
import { useAction } from '../../src/lib/useAsync.js';
import { check, mergeErrors } from '../../src/lib/validation.js';
import { colors } from '../../src/theme.js';

/**
 * Step 1, continued — who you are and how you'll sign in.
 *
 * Validated live against the same `signupSchema` the API enforces, plus a retype of the
 * password. Continue stays disabled until everything passes; a field explains itself once it
 * has been visited. Continuing is also the agreement to the terms (the note under the
 * button), so `acceptedTerms` is sent as true here.
 *
 * Values live in the onboarding draft, so coming back from the code screen finds them still
 * filled in — and pressing Continue again with the same values does not sign up twice.
 */
export default function CreateAccount() {
  const router = useRouter();
  const { signUp } = useAuth();
  const { draft, update } = useOnboarding();
  const { account } = draft;

  const [touched, setTouched] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const phoneRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmRef = useRef(null);

  const blur = (key) => () => setTouched((prev) => ({ ...prev, [key]: true }));

  const result = check(signupSchema, {
    name: account.name,
    email: account.email,
    phone: account.phone,
    password: account.password,
    acceptedTerms: true,
    // Off, and not asked here: consent to marketing is not part of creating an account.
    marketingOptIn: false,
  });

  // Compared only once a password is there to compare against, and reported on the confirm field.
  const mismatch = account.confirm.length > 0 && account.confirm !== account.password;
  const canContinue = result.ok && account.confirm === account.password;

  const fingerprint = `${account.name}|${account.email}|${account.phone}|${account.password}`;

  const { run, pending, error, clearError } = useAction(async () => {
    // Already signed up with exactly these values (they went back from the code screen):
    // the account exists, so just move forward.
    if (draft.submittedAccount !== fingerprint) {
      await signUp(result.data);
      update('submittedAccount', fingerprint);
    }
    router.push({ pathname: '/(auth)/verify', params: { email: result.data.email } });
  });

  const shown = (key) => mergeErrors(touched[key] ? result.errors : {}, error)[key];
  const generalError = error && Object.keys(error.fieldErrors ?? {}).length === 0 ? error.message : null;

  const edit = (key) => (value) => {
    if (error) clearError();
    update('account', { [key]: value });
  };

  const eye = (
    <Touchable
      onPress={() => setShowPassword((v) => !v)}
      haptics={null}
      scaleTo={1}
      hitSlop={10}
      accessibilityLabel={showPassword ? 'Hide passwords' : 'Show passwords'}
    >
      <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.ink500} />
    </Touchable>
  );

  return (
    <StepScreen
      step={1}
      from={0.06}
      progress={0.13}
      title="Create your account"
      subtitle={account.email}
      onBack={() => router.back()}
      footer={
        <>
          <Button
            title="Continue"
            size="lg"
            loading={pending}
            disabled={!canContinue}
            onPress={() => run().catch(() => undefined)}
          />
          <LegalNote />
        </>
      }
    >
      <Alert message={generalError} />

      <Field
        label="Your name"
        value={account.name}
        onChangeText={edit('name')}
        onBlur={blur('name')}
        placeholder="Asha Verma"
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
        onSubmitEditing={() => phoneRef.current?.focus()}
        maxLength={80}
        error={shown('name')}
      />

      <Field
        ref={phoneRef}
        label="Mobile number"
        value={account.phone}
        onChangeText={edit('phone')}
        onBlur={blur('phone')}
        placeholder="98765 43210"
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        prefix="+91"
        // Long enough for "+91 98765 43210", so a pasted number is not cut in half.
        maxLength={17}
        error={shown('phone')}
      />

      <Field
        ref={passwordRef}
        label="Password"
        value={account.password}
        onChangeText={edit('password')}
        onBlur={blur('password')}
        placeholder="At least 8 characters"
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
        onSubmitEditing={() => confirmRef.current?.focus()}
        maxLength={128}
        hint="8 or more characters, with a letter and a number."
        error={shown('password')}
        right={eye}
      />

      <Field
        ref={confirmRef}
        label="Confirm password"
        value={account.confirm}
        onChangeText={edit('confirm')}
        onBlur={blur('confirm')}
        placeholder="Type it again"
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="newPassword"
        returnKeyType="done"
        maxLength={128}
        error={mismatch ? "Passwords don't match" : undefined}
        right={
          account.confirm && !mismatch ? <Ionicons name="checkmark-circle" size={20} color={colors.success} /> : null
        }
      />
    </StepScreen>
  );
}
