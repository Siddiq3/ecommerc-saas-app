import { useState } from 'react';
import { Alert as RNAlert, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { changePasswordSchema } from '@storekit/validation';
import { Screen } from '../../src/components/Screen.jsx';
import {
  Alert, Body, Button, Caption, Card, Divider, Field, Heading, Loading, Pill, Row, Touchable,
} from '../../src/components/ui.jsx';
import { useAuth } from '../../src/state/auth.jsx';
import { useAction, useAsync } from '../../src/lib/useAsync.js';
import { check, mergeErrors } from '../../src/lib/validation.js';
import { auth as authApi } from '../../src/api/endpoints.js';
import { formatDate, relativeTime } from '../../src/lib/format.js';
import { colors, space } from '../../src/theme.js';

/**
 * Password and signed-in devices.
 *
 * Every session is listed with where and when it was last used, and any one of them can
 * be cut off from here — which is the only remedy a merchant has if they lose a phone.
 */
export default function Security() {
  const { signOut } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [changed, setChanged] = useState(false);
  const [errors, setErrors] = useState({});

  const { data: sessions, loading, reload, refreshing, onRefresh } = useAsync(() => authApi.sessions(), []);

  const { run: changePassword, pending: changing, error: changeError } = useAction(async (data) => {
    await authApi.changePassword(data);
    setCurrentPassword('');
    setNewPassword('');
    setChanged(true);
    await reload();
  });

  const { run: revoke } = useAction(async (sessionId) => {
    await authApi.revokeSession(sessionId);
    await reload();
  });

  const confirmRevokeAll = () =>
    RNAlert.alert(
      'Sign out everywhere?',
      'Every device, including this one, will need to sign in again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out everywhere',
          style: 'destructive',
          onPress: async () => {
            await authApi.revokeAllSessions().catch(() => undefined);
            await signOut();
          },
        },
      ],
    );

  const submit = () => {
    setChanged(false);
    const result = check(changePasswordSchema, { currentPassword, newPassword });
    setErrors(result.errors);
    if (result.ok) changePassword(result.data).catch(() => undefined);
  };

  const fieldErrors = mergeErrors(errors, changeError);
  const generalError = changeError && Object.keys(changeError.fieldErrors ?? {}).length === 0 ? changeError.message : null;
  const items = sessions?.items ?? sessions ?? [];

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Heading>Change your password</Heading>
      <Caption style={styles.sub}>Changing it signs out every other device.</Caption>

      <Alert message={generalError} />
      {changed && !changeError ? <Alert message="Your password has been changed." tone="success" /> : null}

      <Field
        label="Current password"
        value={currentPassword}
        onChangeText={(v) => { setCurrentPassword(v); if (errors.currentPassword) setErrors((p) => ({ ...p, currentPassword: undefined })); }}
        maxLength={128}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        error={fieldErrors.currentPassword}
      />
      <Field
        label="New password"
        value={newPassword}
        onChangeText={(v) => { setNewPassword(v); if (errors.newPassword) setErrors((p) => ({ ...p, newPassword: undefined })); }}
        maxLength={128}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        hint="Twelve characters or more, with at least one letter and one number."
        error={fieldErrors.newPassword}
      />
      <Button
        title="Change password"
        loading={changing}
        onPress={submit}
      />

      <Heading style={styles.sectionTitle}>Signed in on</Heading>
      {loading && !sessions ? (
        <Loading />
      ) : (
        <Card padded={false} style={styles.card}>
          {items.length ? (
            items.map((session, index) => (
              <View key={session.sessionId}>
                {index > 0 ? <Divider /> : null}
                <Row style={styles.sessionRow} align="flex-start">
                  <Ionicons name="phone-portrait-outline" size={19} color={colors.ink600} style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Row gap={space.sm}>
                      <Body strong>{session.deviceName ?? 'Unknown device'}</Body>
                      {session.current ? <Pill label="This device" tone="green" /> : null}
                    </Row>
                    <Caption>
                      {session.ip ? `${session.ip} · ` : ''}
                      {session.lastUsedAt ? `last used ${relativeTime(session.lastUsedAt)}` : formatDate(session.createdAt)}
                    </Caption>
                  </View>
                  {session.current ? null : (
                    <Touchable
                      onPress={() => revoke(session.sessionId).catch(() => undefined)}
                      accessibilityLabel="Sign out this device"
                      style={styles.revoke}
                    >
                      <Body style={{ color: colors.danger }}>Remove</Body>
                    </Touchable>
                  )}
                </Row>
              </View>
            ))
          ) : (
            <View style={styles.empty}>
              <Body muted>No other devices are signed in.</Body>
            </View>
          )}
        </Card>
      )}

      <Button title="Sign out everywhere" variant="danger" onPress={confirmRevokeAll} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  sub: { marginTop: space.xs, marginBottom: space.lg },
  sectionTitle: { marginTop: space.xxl, marginBottom: space.md },
  card: { marginBottom: space.lg, overflow: 'hidden' },
  sessionRow: { padding: space.lg, gap: space.md },
  revoke: { paddingHorizontal: space.sm, paddingVertical: space.xs },
  empty: { padding: space.xl },
});
