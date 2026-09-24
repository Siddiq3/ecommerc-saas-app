import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TRIAL_DAYS } from '@storekit/shared';
import { Screen } from '../../src/components/Screen.jsx';
import {
  Alert, Body, Button, Caption, Card, Divider, Heading, Pill, Row,
} from '../../src/components/ui.jsx';
import { SkeletonScreen } from '../../src/components/Skeleton.jsx';
import { useAuth } from '../../src/state/auth.jsx';
import { usePlan } from '../../src/state/plan.jsx';
import { useAction, useAsync } from '../../src/lib/useAsync.js';
import { subscription as subscriptionApi } from '../../src/api/endpoints.js';
import { formatDate } from '../../src/lib/format.js';
import { colors, space, type } from '../../src/theme.js';

/**
 * Subscription and plan usage.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  GOOGLE PLAY POLICY BOUNDARY
 *
 *  Read-only. It shows what the merchant is on and how much of it they are using.
 *  Both "Change plan" and "Manage subscription" call `openBilling`, which hands a
 *  one-time token to the system browser. Nothing here charges, cancels or stores a
 *  payment method — cancellation included, because cancelling is a billing operation and
 *  belongs on the same web surface as paying.
 * ────────────────────────────────────────────────────────────────────────────
 */
export default function Subscription() {
  const router = useRouter();
  const { businessId } = useAuth();
  const { status, planStatus, refresh, openBilling } = usePlan();

  const [refreshing, setRefreshing] = useState(false);

  const { data: usage, loading } = useAsync(
    () => (businessId ? subscriptionApi.usage(businessId) : Promise.resolve(null)),
    [businessId],
  );

  const { run: manage, pending, error } = useAction(() => openBilling({ manage: true }));

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh({ silent: false });
    setRefreshing(false);
  };

  if (loading && !usage && !status) return <SkeletonScreen />;

  const stateCopy = {
    trial_active: {
      tone: 'teal',
      label: 'Free trial',
      detail: status?.trialEndsAt
        ? `Your ${TRIAL_DAYS}-day trial runs until ${formatDate(status.trialEndsAt, undefined, { dateStyle: 'medium' })}.`
        : 'You are on a free trial.',
    },
    trial_expired: { tone: 'red', label: 'Trial ended', detail: 'Choose a plan to reopen your store.' },
    subscribed: {
      tone: 'green',
      label: 'Active',
      detail: status?.currentPeriodEnd
        ? `Renews on ${formatDate(status.currentPeriodEnd, undefined, { dateStyle: 'medium' })}.`
        : 'Your subscription is active.',
    },
    cancelled: {
      tone: 'amber',
      label: 'Cancelled',
      detail: status?.accessEndsAt
        ? `You keep access until ${formatDate(status.accessEndsAt, undefined, { dateStyle: 'medium' })}.`
        : 'Your subscription has been cancelled.',
    },
    past_due: { tone: 'red', label: 'Payment failed', detail: 'Update your payment method to keep your store open.' },
  }[planStatus] ?? { tone: 'slate', label: '—', detail: '' };

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Alert message={error?.message} />

      <Card style={styles.card}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Heading>{status?.planId ? titleCase(status.planId) : 'Your plan'}</Heading>
          <Pill label={stateCopy.label} tone={stateCopy.tone} />
        </Row>
        {stateCopy.detail ? <Caption style={styles.detail}>{stateCopy.detail}</Caption> : null}

        {status?.billingCycle ? (
          <>
            <Divider style={styles.innerDivider} />
            <Row style={{ justifyContent: 'space-between' }}>
              <Caption>Billing</Caption>
              <Body>{status.billingCycle === 'yearly' ? 'Yearly' : 'Monthly'}</Body>
            </Row>
          </>
        ) : null}
      </Card>

      {planStatus === 'subscribed' || planStatus === 'past_due' || planStatus === 'cancelled' ? (
        <Button
          title={planStatus === 'past_due' ? 'Update payment method' : 'Manage subscription'}
          loading={pending}
          onPress={() => manage().catch(() => undefined)}
        />
      ) : (
        <Button title="Choose a plan" onPress={() => router.push('/paywall')} />
      )}

      <Row gap={space.xs} style={styles.browserNote}>
        <Ionicons name="open-outline" size={13} color={colors.ink500} />
        <Caption>Billing is handled on our website, in your browser.</Caption>
      </Row>

      {usage ? (
        <>
          <Heading style={styles.usageTitle}>What you are using</Heading>
          <Card style={styles.card}>
            <Usage label="Products" used={usage.usage?.products} limit={usage.limits?.maxProducts} />
            <Divider style={styles.innerDivider} />
            <Usage label="Orders this month" used={usage.usage?.ordersThisMonth} limit={usage.limits?.maxOrdersPerMonth} />
            <Divider style={styles.innerDivider} />
            <Usage
              label="Storage"
              used={usage.usage?.storageBytes}
              limit={usage.limits?.maxStorageBytes}
              format={(v) => `${(Number(v ?? 0) / (1024 * 1024)).toFixed(0)} MB`}
            />
          </Card>
        </>
      ) : null}

      {usage?.warnings?.length ? (
        <Card style={[styles.card, styles.warnings]}>
          {usage.warnings.map((warning) => (
            <Row key={warning.code ?? warning.message} gap={space.sm} align="flex-start">
              <Ionicons name="alert-circle-outline" size={17} color={colors.warning} />
              <Body style={{ flex: 1 }}>{warning.message}</Body>
            </Row>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

const Usage = ({ label, used, limit, format = (v) => String(v ?? 0) }) => {
  const unlimited = limit === null || limit === undefined || limit < 0;
  const ratio = unlimited ? 0 : Math.min(1, (Number(used) || 0) / Math.max(1, Number(limit)));
  const tone = ratio > 0.9 ? colors.danger : ratio > 0.75 ? colors.warning : colors.accent600;

  return (
    <View>
      <Row style={{ justifyContent: 'space-between' }}>
        <Body>{label}</Body>
        <Body style={type.money}>
          {format(used)}
          {unlimited ? '' : ` / ${format(limit)}`}
        </Body>
      </Row>
      {unlimited ? null : (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.max(2, ratio * 100)}%`, backgroundColor: tone }]} />
        </View>
      )}
    </View>
  );
};

const titleCase = (value) => String(value).charAt(0).toUpperCase() + String(value).slice(1);

const styles = StyleSheet.create({
  card: { marginBottom: space.lg },
  detail: { marginTop: space.sm },
  innerDivider: { marginVertical: space.md },
  browserNote: { justifyContent: 'center', marginTop: space.md, marginBottom: space.xxl },
  usageTitle: { marginBottom: space.md },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.ink200, marginTop: space.sm, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  warnings: { gap: space.md },
});
