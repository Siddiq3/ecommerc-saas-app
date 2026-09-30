import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Alert, Body, Button, Caption, Row, Title } from './ui.jsx';
import { useAuth } from '../state/auth.jsx';
import { usePlan } from '../state/plan.jsx';
import { useAction } from '../lib/useAsync.js';
import { SUPPORT_URL } from '../lib/help.js';
import { colors, radius, space } from '../theme.js';

/** The account-deletion screen stays reachable while locked: a lapsed plan never blocks leaving. */
export const DELETE_ACCOUNT_ROUTE = '/settings/delete-account';

/**
 * The lock over the whole app once the plan no longer grants access (trial ended, renewal
 * failed). It cannot be dismissed — back does nothing — and it lifts by itself when a
 * status check sees an entitled plan.
 *
 * Information only, like PlanBanner: it says the account is inactive and offers support,
 * a fresh status check, deleting the account and signing out. No plan, price, purchase
 * button or link to one (see src/state/plan.jsx).
 */
const COPY = {
  trial_expired: {
    title: 'Free trial ended',
    message: 'Your free trial has ended. Your account is currently inactive.',
  },
  past_due: {
    title: 'Subscription inactive',
    message: 'Your subscription could not be renewed. Your account is currently inactive.',
  },
};

export const PlanLock = () => {
  const router = useRouter();
  const pathname = usePathname();
  const { status: authStatus, user, signOut } = useAuth();
  const { entitled, planStatus, needsOnboarding, refresh } = usePlan();
  const insets = useSafeAreaInsets();
  const { run: check, pending: checking, error } = useAction(() => refresh({ silent: true }));
  const { run: logout, pending: leaving } = useAction(signOut);

  // `entitled` is null until the first status load, so a slow network never flashes the lock.
  const locked = authStatus === 'authenticated'
    && Boolean(user?.businesses?.length)
    && !needsOnboarding
    && entitled === false
    && pathname !== DELETE_ACCOUNT_ROUTE;
  const copy = COPY[planStatus] ?? COPY.trial_expired;

  return (
    <Modal visible={locked} transparent animationType="slide" statusBarTranslucent onRequestClose={() => undefined}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
          <View style={styles.handle} />
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.lockIcon}><Ionicons name="lock-closed" size={40} color="#ffffff" /></View>
            <Title style={styles.center}>{copy.title}</Title>
            {user?.email ? <Caption style={styles.center}>{user.email}</Caption> : null}

            <View style={styles.warning}><Body style={styles.warningText}>{copy.message}</Body></View>

            <Row gap={space.sm} align="flex-start" style={styles.info}>
              <Ionicons name="information-circle" size={20} color={colors.accent700} />
              <Body style={{ flex: 1, color: colors.accent900 }}>
                Your store is closed to customers. Your products, orders and settings are kept.
              </Body>
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
            <Button
              title="Check status again"
              variant="secondary"
              loading={checking}
              icon={<Ionicons name="refresh" size={18} color={colors.ink700} />}
              onPress={() => check().catch(() => undefined)}
            />
            <Button
              title="Log out"
              variant="secondary"
              loading={leaving}
              icon={<Ionicons name="log-out-outline" size={18} color={colors.ink700} />}
              onPress={() => logout().catch(() => undefined)}
            />
            <Button
              title="Delete account"
              variant="ghost"
              onPress={() => router.push(DELETE_ACCOUNT_ROUTE)}
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
  info: { backgroundColor: colors.accent50, borderRadius: radius.sm, padding: space.lg },
  footer: {
    gap: space.sm,
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
});
