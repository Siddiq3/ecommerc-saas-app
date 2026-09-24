import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COMPARISON_ROWS, TRIAL_DAYS, describeEntitlement, formatMoney } from '@storekit/shared';
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
/** What a merchant asks about their plan first. The rest of the table is on the website. */
const INCLUDED_KEYS = ['maxProducts', 'monthlyOrderLimit', 'maxCustomDomains', 'prioritySupport', 'customDesign'];
const INCLUDED_ROWS = COMPARISON_ROWS.filter((row) => INCLUDED_KEYS.includes(row.key));

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

  // What the server says the plan is and includes. The bundled table is never consulted here:
  // this screen describes the merchant's actual plan, so it shows the server's answer.
  const entitlements = usage?.entitlements ?? status?.entitlements ?? null;
  const features = usage?.features ?? status?.features ?? null;
  const domains = usage?.customDomains ?? null;
  // The name and price come from the same response as the rows below them, so one screen can never
  // show two different plans. The cached billing status is only the fallback while it loads.
  const planName = usage?.plan?.name ?? status?.plan?.name ?? 'Your plan';
  const monthlyPaise = usage?.plan?.priceMonthly ?? status?.plan?.monthlyPaise ?? 0;

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
          <View style={{ flex: 1 }}>
            <Heading>{planName}</Heading>
            {monthlyPaise > 0 ? <Caption>{formatMoney(monthlyPaise)} / month</Caption> : null}
          </View>
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

      {entitlements ? (
        <>
          <Heading style={styles.usageTitle}>What your plan includes</Heading>
          <Card style={styles.card}>
            {INCLUDED_ROWS.map((row, index) => {
              const value = describeEntitlement(entitlements, row, features);
              // A plan can promise custom domains while the feature is still switched off in this
              // environment. Say so, rather than let "1 domain" read as something to go and use.
              const notSwitchedOn = row.key === 'maxCustomDomains' && value.included && domains?.enabled === false;
              return (
                <View key={row.key}>
                  {index > 0 ? <Divider style={styles.innerDivider} /> : null}
                  <Row gap={space.md} style={{ justifyContent: 'space-between' }}>
                    <Body style={{ flex: 1 }}>{row.label}</Body>
                    <Row gap={space.xs}>
                      <Ionicons
                        name={value.included ? 'checkmark-circle' : 'remove-circle-outline'}
                        size={17}
                        color={value.included ? colors.accent600 : colors.ink400}
                      />
                      <Body style={value.included ? undefined : styles.notIncluded}>{value.text}</Body>
                    </Row>
                  </Row>
                  {value.note || notSwitchedOn ? <Caption style={styles.includedNote}>{value.note ?? 'Not available yet'}</Caption> : null}
                </View>
              );
            })}
          </Card>
        </>
      ) : null}

      {domains?.message ? (
        <Card style={[styles.card, styles.warnings]}>
          <Row gap={space.sm} align="flex-start">
            <Ionicons name="information-circle-outline" size={17} color={colors.warning} />
            <Body style={{ flex: 1 }}>{domains.message}</Body>
          </Row>
        </Card>
      ) : null}

      {usage ? (
        <>
          <Heading style={styles.usageTitle}>What you are using</Heading>
          <Card style={styles.card}>
            <Usage label="Products" used={usage.usage?.products} limit={usage.plan?.maxProducts} />
            <Divider style={styles.innerDivider} />
            <Usage label="Orders this month" used={usage.usage?.ordersThisMonth} limit={usage.plan?.monthlyOrderLimit} />
            <Divider style={styles.innerDivider} />
            <Usage
              label="Storage"
              used={usage.usage?.storageBytes}
              limit={usage.plan?.maxStorageBytes}
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
  // `null` is "no limit" and is worth saying; `undefined` is "we were not told", which is not.
  const unlimited = limit === null || limit < 0;
  const unknown = limit === undefined;
  const ratio = unlimited || unknown ? 0 : Math.min(1, (Number(used) || 0) / Math.max(1, Number(limit)));
  const tone = ratio > 0.9 ? colors.danger : ratio > 0.75 ? colors.warning : colors.accent600;

  return (
    <View>
      <Row style={{ justifyContent: 'space-between' }}>
        <Body>{label}</Body>
        <Body style={type.money}>
          {format(used)}
          {unlimited ? ' · Unlimited' : unknown ? '' : ` / ${format(limit)}`}
        </Body>
      </Row>
      {unlimited || unknown ? null : (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.max(2, ratio * 100)}%`, backgroundColor: tone }]} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: { marginBottom: space.lg },
  detail: { marginTop: space.sm },
  innerDivider: { marginVertical: space.md },
  browserNote: { justifyContent: 'center', marginTop: space.md, marginBottom: space.xxl },
  usageTitle: { marginBottom: space.md },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.ink200, marginTop: space.sm, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  warnings: { gap: space.md },
  notIncluded: { color: colors.ink500 },
  includedNote: { marginTop: space.xs, textAlign: 'right', color: colors.ink500 },
});
