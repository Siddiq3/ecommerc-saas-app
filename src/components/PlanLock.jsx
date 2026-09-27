import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Alert, Body, Button, Caption, Card, Row, Title } from './ui.jsx';
import { useAuth } from '../state/auth.jsx';
import { usePlan } from '../state/plan.jsx';
import { useAction } from '../lib/useAsync.js';
import { SUPPORT_URL } from '../lib/help.js';
import { colors, radius, space } from '../theme.js';

/**
 * The lock over the whole app once the plan no longer grants access (trial ended, payment
 * failed). It cannot be dismissed — back does nothing — so the only ways on are paying or
 * signing out. It lifts by itself when the plan refresh sees an entitled status.
 *
 * Same Google Play boundary as plan.jsx: no price here. "Subscribe now" opens billing in the
 * system browser.
 */
const COPY = {
  trial_expired: {
    title: 'Trial expired',
    subtitle: 'Your free trial has ended',
    message: 'Your store is closed to customers. Subscribe to reopen it and keep your site live.',
    action: 'Subscribe now',
  },
  past_due: {
    title: 'Payment failed',
    subtitle: 'We could not renew your subscription',
    message: 'Your store is closed to customers. Update your payment to reopen it.',
    action: 'Update payment',
  },
};

export const PlanLock = () => {
  const { status: authStatus, user, signOut } = useAuth();
  const { entitled, planStatus, needsOnboarding, openBilling } = usePlan();
  const insets = useSafeAreaInsets();
  const { run: subscribe, pending, error } = useAction(() => openBilling({ manage: planStatus === 'past_due' }));
  const { run: logout, pending: leaving } = useAction(signOut);

  // `entitled` is null until the first status load, so a slow network never flashes the lock.
  const locked = authStatus === 'authenticated' && Boolean(user?.businesses?.length) && !needsOnboarding && entitled === false;
  const copy = COPY[planStatus] ?? COPY.trial_expired;

  return (
    <Modal visible={locked} transparent animationType="slide" statusBarTranslucent onRequestClose={() => undefined}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
          <View style={styles.handle} />
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.lockIcon}><Ionicons name="lock-closed" size={40} color="#ffffff" /></View>
            <Title style={styles.center}>{copy.title}</Title>
            <Body muted style={styles.center}>{copy.subtitle}</Body>
            {user?.email ? <Caption style={styles.center}>{user.email}</Caption> : null}

            <View style={styles.warning}><Body style={styles.warningText}>{copy.message}</Body></View>

            <Card style={styles.steps}>
              <Body strong>To get access:</Body>
              {['Choose a plan on our website', 'Complete the payment', 'Your store is live again right away'].map((step) => (
                <Body key={step} muted>• {step}</Body>
              ))}
            </Card>

            <Row gap={space.sm} align="flex-start" style={styles.info}>
              <Ionicons name="information-circle" size={20} color={colors.accent700} />
              <Body style={{ flex: 1, color: colors.accent900 }}>All your data is safe. Subscribe to unlock your store and keep everything you’ve built.</Body>
            </Row>

            <Button
              title="Contact support"
              variant="secondary"
              icon={<Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.success} />}
              onPress={() => Linking.openURL(SUPPORT_URL).catch(() => undefined)}
            />
          </ScrollView>

          <View style={styles.footer}>
            <Alert message={error?.message} />
            <Caption style={styles.center}>Billing is handled on our website, in your browser.</Caption>
            <Button
              title={copy.action}
              loading={pending}
              icon={<Ionicons name="arrow-forward" size={18} color="#ffffff" />}
              onPress={() => subscribe().catch(() => undefined)}
            />
            <Button
              title="Log out"
              variant="secondary"
              loading={leaving}
              icon={<Ionicons name="log-out-outline" size={18} color={colors.ink700} />}
              onPress={() => logout().catch(() => undefined)}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  sheet: { maxHeight: '88%', backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.ink200, marginTop: space.sm },
  content: { padding: space.xl, gap: space.md },
  center: { textAlign: 'center' },
  lockIcon: {
    alignSelf: 'center',
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  warning: {
    backgroundColor: colors.dangerTint,
    borderLeftWidth: 4,
    borderLeftColor: colors.danger,
    borderRadius: radius.sm,
    padding: space.lg,
    marginTop: space.md,
  },
  warningText: { color: colors.danger },
  steps: { padding: space.lg, gap: space.sm },
  info: { backgroundColor: colors.accent50, borderRadius: radius.sm, padding: space.lg },
  footer: {
    gap: space.sm,
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
});
