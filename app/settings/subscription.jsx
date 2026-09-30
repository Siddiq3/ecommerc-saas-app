import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COMPARISON_ROWS, TRIAL_DAYS, describeEntitlement } from '@storekit/shared';
import { Screen } from '../../src/components/Screen.jsx';
import {
  Body, Caption, Card, Divider, Heading, Pill, Row,
} from '../../src/components/ui.jsx';
import { SkeletonScreen } from '../../src/components/Skeleton.jsx';
import { useAuth } from '../../src/state/auth.jsx';
import { usePlan } from '../../src/state/plan.jsx';
import { useAsync } from '../../src/lib/useAsync.js';
import { subscription as subscriptionApi } from '../../src/api/endpoints.js';
import { formatDate } from '../../src/lib/format.js';
import { colors, space, type } from '../../src/theme.js';

/**
 * Subscription and plan usage.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  GOOGLE PLAY POLICY BOUNDARY
 *
 *  Read-only. It shows what the merchant is on and how much of it they are using — never
 *  a price, and no way to buy, change, renew or cancel a plan, nor a link to anywhere
 *  that does (the app is consumption-only; see src/state/plan.jsx).
 * ────────────────────────────────────────────────────────────────────────────
 */
/** What a merchant asks about their plan first. The rest of the table is on the website. */
const INCLUDED_KEYS = ['maxProducts', 'monthlyOrderLimit', 'maxCustomDomains', 'prioritySupport', 'customDesign'];
const INCLUDED_ROWS = COMPARISON_ROWS.filter((row) => INCLUDED_KEYS.includes(row.key));

export default function Subscription() {
  const { businessId } = useAuth();
  const { status, planStatus, refresh } = usePlan();

  const [refreshing, setRefreshing] = useState(false);

  const { data: usage, loading } = useAsync(
    () => (businessId ? subscriptionApi.usage(businessId) : Promise.resolve(null)),
    [businessId],
  );

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

  const stateCopy = {
    trial_active: {
      tone: 'teal',
      label: 'Free trial',
      detail: status?.trialEndsAt
        ? `Your ${TRIAL_DAYS}-day trial runs until ${formatDate(status.trialEndsAt, undefined, { dateStyle: 'medium' })}.`
        : 'You are on a free trial.',
    },
    trial_expired: { tone: 'red', label: 'Trial ended', detail: 'Your free trial has ended. Your account is currently inactive.' },
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
    past_due: { tone: 'red', label: 'Inactive', detail: 'Your subscription could not be renewed. Your account is currently inactive.' },
  }[planStatus] ?? { tone: 'slate', label: '—', detail: '' };

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Card style={styles.card}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Heading>{planName}</Heading>
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

      {entitlements ? (
        <>
          <Heading style={styles.usageTitle}>What your plan includes</Heading>
          <Card style={styles.card}>
            {INCLUDED_ROWS.map((row, index) => {
              const value = describeEntitlement(entitlements, row, features);
              // A plan can promise custom domains while the feature is still switched off in this
              // environment. Say so, rather than let "Included" read as something to go and use.
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
            {/* Products and orders have no limit on any plan, so there is nothing to meter: only quotas that exist are shown. */}
            {usage.plan?.maxProducts != null ? (
              <>
                <Usage label="Products" used={usage.usage?.products} limit={usage.plan.maxProducts} />
                <Divider style={styles.innerDivider} />
              </>
            ) : null}
            {usage.plan?.monthlyOrderLimit != null ? (
              <>
                <Usage label="Orders this month" used={usage.usage?.ordersThisMonth} limit={usage.plan.monthlyOrderLimit} />
                <Divider style={styles.innerDivider} />
              </>
            ) : null}
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
  usageTitle: { marginBottom: space.md },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.ink200, marginTop: space.sm, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  warnings: { gap: space.md },
  notIncluded: { color: colors.ink500 },
  includedNote: { marginTop: space.xs, textAlign: 'right', color: colors.ink500 },
});
