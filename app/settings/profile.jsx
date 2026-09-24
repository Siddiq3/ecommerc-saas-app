import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { updateProfileSchema } from '@storekit/validation';
import { Screen } from '../../src/components/Screen.jsx';
import { Alert, Body, Button, Caption, Card, Field, Toggle } from '../../src/components/ui.jsx';
import { useAuth } from '../../src/state/auth.jsx';
import { useAction } from '../../src/lib/useAsync.js';
import { check, mergeErrors } from '../../src/lib/validation.js';
import { auth as authApi } from '../../src/api/endpoints.js';
import { space } from '../../src/theme.js';

/** Your details. The email is fixed: it identifies the account and is how we reach you. */
export default function Profile() {
  const { user, refreshUser } = useAuth();

  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [marketingOptIn, setMarketingOptIn] = useState(Boolean(user?.marketingOptIn));
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState({});

  const { run, pending, error } = useAction(async (data) => {
    await authApi.updateProfile(data);
    await refreshUser();
    setSaved(true);
  });

  const submit = () => {
    setSaved(false);
    const result = check(updateProfileSchema, { name, phone, marketingOptIn });
    setErrors(result.errors);
    if (result.ok) run(result.data).catch(() => undefined);
  };

  const fieldErrors = mergeErrors(errors, error);
  const generalError = error && Object.keys(error.fieldErrors ?? {}).length === 0 ? error.message : null;

  return (
    <Screen
      footer={
        <Button
          title="Save changes"
          loading={pending}
          onPress={submit}
        />
      }
    >
      <Alert message={generalError} />
      {saved && !error ? <Alert message="Saved." tone="success" /> : null}

      <Field
        label="Your name"
        value={name}
        onChangeText={(v) => { setName(v); if (errors.name) setErrors((p) => ({ ...p, name: undefined })); }}
        autoCapitalize="words"
        maxLength={80}
        error={fieldErrors.name}
      />

      <Field
        label="Mobile number"
        value={phone}
        onChangeText={(v) => { setPhone(v); if (errors.phone) setErrors((p) => ({ ...p, phone: undefined })); }}
        keyboardType="phone-pad"
        prefix="+91"
        maxLength={17}
        hint="You sign in with this number, so keep it current."
        error={fieldErrors.phone}
      />

      <Card style={styles.card}>
        <Body strong>Email</Body>
        <Caption>{user?.email}</Caption>
        <Caption style={styles.emailNote}>
          Your email identifies your account and cannot be changed here. Contact support if you need to move it.
        </Caption>
      </Card>

      <Card style={styles.card}>
        <Toggle
          label="Product updates by email"
          hint="Occasional notes about new features. Never more than once a month."
          value={marketingOptIn}
          onChange={setMarketingOptIn}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: space.lg },
  emailNote: { marginTop: space.sm },
});
