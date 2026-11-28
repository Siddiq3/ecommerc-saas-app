import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Alert, Body, Button, Caption, Row, Title } from './ui.jsx';
import { useAuth } from '../state/auth.jsx';
import { usePlan } from '../state/plan.jsx';
import { useT } from '../state/locale.jsx';
import { useAction } from '../lib/useAsync.js';
import { SHOW_INSTAGRAM, canManageInstagramPath } from '../lib/instagram-access.js';
import { SUPPORT_URL } from '../lib/help.js';
import { msg } from '../lib/i18n.js';
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
  trial: {
    title: msg('Free trial ended'),
    message: msg('Your free trial has ended. Your account is currently inactive.'),
  },
  // Every lapse reads as trial_expired (billing/status.js); an owner who has paid before is told it was the plan.
  subscription: {
    title: msg('Subscription ended'),
    message: msg('Your subscription has ended. Your account is currently inactive.'),
  },
};

export const PlanLock = () => {
  const router = useRouter();
  const pathname = usePathname();
  const { status: authStatus, user, signOut } = useAuth();
  const { entitled, status, needsOnboarding, refresh, books, setUsage } = usePlan();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { run: check, pending: checking, error } = useAction(() => refresh({ silent: true }));
  const { run: logout, pending: leaving } = useAction(signOut);
  const { run: keepBooks, pending: switching, error: switchError } = useAction(() => setUsage('books'));

  // `entitled` is null until the first status load, so a slow network never flashes the lock.
  const locked = authStatus === 'authenticated'
    && Boolean(user?.businesses?.length)
    && !needsOnboarding
    && entitled === false
    && !books
    && pathname !== DELETE_ACCOUNT_ROUTE
    && !canManageInstagramPath(pathname);
  const copy = status?.hasSubscription ? COPY.subscription : COPY.trial;

  return (
    <Modal visible={locked} transparent animationType="slide" statusBarTranslucent onRequestClose={() => undefined}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
          <View style={styles.handle} />
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.lockIcon}><Ionicons name="lock-closed" size={40} color="#ffffff" /></View>
            <Title style={styles.center}>{t(copy.title)}</Title>
            {user?.email ? <Caption style={styles.center}>{user.email}</Caption> : null}

            <View style={styles.warning}><Body style={styles.warningText}>{t(copy.message)}</Body></View>

            <Row gap={space.sm} align="flex-start" style={styles.info}>
              <Ionicons name="information-circle" size={20} color={colors.accent700} />
              <Body style={{ flex: 1, color: colors.accent900 }}>
                {t('Your store is closed to customers. Your products, orders and settings are kept.')}
              </Body>
            </Row>

            <Button
              title={t('Contact support')}
              variant="secondary"
              icon={<Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.success} />}
              onPress={() => Linking.openURL(SUPPORT_URL).catch(() => undefined)}
            />
          </ScrollView>

          <View style={styles.footer}>
            <Alert message={(error ?? switchError)?.message} />
            <Body style={styles.center}>{t('Don’t need the website? Keep using bills, khata and expenses for free.')}</Body>
            <Button
              title={t('Continue free with khata only')}
              loading={switching}
              icon={<Ionicons name="book-outline" size={18} color="#ffffff" />}
              onPress={() => keepBooks().catch(() => undefined)}
            />
            <Button
              title={t('Check status again')}
              variant="secondary"
              loading={checking}
              icon={<Ionicons name="refresh" size={18} color={colors.ink700} />}
              onPress={() => check().catch(() => undefined)}
            />
            <Button
              title={t('Log out')}
              variant="secondary"
              loading={leaving}
              icon={<Ionicons name="log-out-outline" size={18} color={colors.ink700} />}
              onPress={() => logout().catch(() => undefined)}
            />
            {SHOW_INSTAGRAM ? (
              <Button title={t('Manage Instagram')} variant="secondary" onPress={() => router.push('/(tabs)/social')} />
            ) : null}
            <Button
              title={t('Delete account')}
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
