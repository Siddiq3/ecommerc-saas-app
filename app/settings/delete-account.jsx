import { useState } from 'react';
import { Alert as RNAlert, Linking, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../src/components/Screen.jsx';
import { Alert, Body, Button, Caption, Card, Checkbox, Heading, Row } from '../../src/components/ui.jsx';
import { useAuth } from '../../src/state/auth.jsx';
import { useOnboarding } from '../../src/state/onboarding.jsx';
import { useAction } from '../../src/lib/useAsync.js';
import { SUPPORT_URL, WEB_URL } from '../../src/lib/help.js';
import { colors, radius, space } from '../../src/theme.js';

/**
 * Deleting the account, from inside the app.
 *
 * One screen that says exactly what goes and what stays, a checkbox and a final
 * confirmation — then the server deletes the account the session belongs to and ends
 * every session. On success the device forgets its tokens and saved store, and the
 * signed-out screen confirms the deletion.
 *
 * Reachable even while the plan lock is up (see PlanLock): an inactive plan never stands
 * between a merchant and leaving.
 */

const DELETED = [
  'Your account, profile, email address and mobile number',
  'Your store, its link and any connected domain',
  'Products, images, categories, coupons and store settings',
  'Orders, customer details, notifications and activity history',
  'Your sign-in on every device',
];

const KEPT = [
  'Subscription billing records for your store (plan, billing period, amount and payment reference — no card or UPI details), kept for up to 2 years for accounting, then deleted automatically.',
  'A record that this account was deleted and when, kept for up to 2 years, then deleted automatically.',
  'A one-way keyed hash of your email address recording that it has had the free trial, kept with no expiry, so a new account with the same email does not get a second free trial.',
];

const Bullet = ({ icon, color, children }) => (
  <Row gap={space.sm} align="flex-start">
    <Ionicons name={icon} size={17} color={color} style={styles.bulletIcon} />
    <Body style={{ flex: 1 }}>{children}</Body>
  </Row>
);

export default function DeleteAccount() {
  const { user, business, deleteAccount } = useAuth();
  const { reset: resetDraft } = useOnboarding();
  const [understood, setUnderstood] = useState(false);
  const [checkError, setCheckError] = useState(null);

  const { run, pending, error } = useAction(async () => {
    await deleteAccount();
    // Anything typed into setup this session (it can include a password) goes with the account.
    resetDraft();
  });

  const confirm = () => {
    if (!understood) {
      setCheckError('Tick the box to confirm you understand.');
      return;
    }
    RNAlert.alert(
      'Delete your account?',
      'Your account and store are deleted now, and you are signed out on every device. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete account', style: 'destructive', onPress: () => run().catch(() => undefined) },
      ],
    );
  };

  return (
    <Screen>
      <View style={styles.hero}>
        <View style={styles.icon}><Ionicons name="warning" size={30} color={colors.danger} /></View>
        <Heading style={styles.center}>Delete your account</Heading>
        <Body muted style={styles.center}>
          This permanently deletes {user?.email ? <Body strong>{user.email}</Body> : 'your account'}
          {business?.name ? <> and <Body strong>{business.name}</Body></> : null}. It happens straight away and cannot be undone.
        </Body>
      </View>

      <Card style={styles.card}>
        <Body strong style={styles.cardTitle}>What is deleted</Body>
        {DELETED.map((line) => (
          <Bullet key={line} icon="trash-outline" color={colors.danger}>{line}</Bullet>
        ))}
      </Card>

      <Card style={styles.card}>
        <Body strong style={styles.cardTitle}>What is kept</Body>
        {KEPT.map((line) => (
          <Bullet key={line} icon="archive-outline" color={colors.ink500}>{line}</Bullet>
        ))}
        <Caption style={styles.more}>
          Any time left on a paid plan is not refunded. Only want to close your store? Delete the store instead and keep your account.
        </Caption>
      </Card>

      <Checkbox
        checked={understood}
        onChange={(value) => { setUnderstood(value); setCheckError(null); }}
        error={checkError}
      >
        I understand that my account and store are deleted permanently.
      </Checkbox>
      <Alert message={checkError} tone="warning" />

      <View style={styles.actions}>
        <Alert message={error ? failureMessage(error) : null} />
        <Button title="Delete account" variant="danger" loading={pending} onPress={confirm} />
        <Button
          title="Contact support"
          variant="ghost"
          onPress={() => Linking.openURL(SUPPORT_URL).catch(() => undefined)}
        />
        <Caption style={styles.center}>
          More about deletion and what we keep: {WEB_URL.replace(/^https?:\/\//, '')}/account/delete
        </Caption>
      </View>
    </Screen>
  );
}

/** Nothing was deleted when this shows: the account and the session are exactly as they were. */
const failureMessage = (error) => {
  if (error?.status === 0) return 'No connection, so nothing was deleted. Check your network and try again.';
  if (error?.status === 429) return 'Too many attempts. Wait a minute and try again.';
  return `${error?.message ?? 'Something went wrong.'} Nothing was deleted — try again, or contact support.`;
};

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: space.sm, marginBottom: space.lg },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.dangerTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  center: { textAlign: 'center' },
  card: { gap: space.sm, marginBottom: space.lg, borderRadius: radius.lg },
  cardTitle: { marginBottom: space.xs },
  bulletIcon: { marginTop: 2 },
  more: { marginTop: space.sm },
  actions: { gap: space.sm, marginTop: space.lg, marginBottom: space.xxl },
});
