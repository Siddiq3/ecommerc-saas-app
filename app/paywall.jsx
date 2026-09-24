import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BILLING_PLANS, TRIAL_DAYS, effectiveMonthlyPrice, formatMoney, yearlyPrice, yearlySavingPercent,
} from '@storekit/shared';
import { Screen } from '../src/components/Screen.jsx';
import {
  Alert, Body, Button, Caption, Card, Display, Divider, Pill, Row, Touchable,
} from '../src/components/ui.jsx';
import { usePlan } from '../src/state/plan.jsx';
import { useAction } from '../src/lib/useAsync.js';
import { colors, radius, space, type } from '../src/theme.js';

/**
 * The paywall.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  GOOGLE PLAY POLICY BOUNDARY
 *
 *  This screen describes plans and nothing more. It collects no card, no UPI id and no
 *  billing address; it imports no payment SDK; it renders no WebView. "Continue" calls
 *  `openBilling`, which mints a one-time token server-side and opens the website in the
 *  device's own browser (Custom Tabs / SFSafariViewController) — a surface with its own
 *  URL bar that this app cannot script or read.
 *
 *  The plan the merchant taps here is a hint passed along for pre-selection on the web
 *  page. It is not an order, and nothing on this screen charges anyone.
 * ────────────────────────────────────────────────────────────────────────────
 */
export default function Paywall() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status, planStatus, refresh, openBilling, loading } = usePlan();

  const [cycle, setCycle] = useState('yearly');
  const [selected, setSelected] = useState(BILLING_PLANS.find((p) => p.popular)?.planId ?? BILLING_PLANS[0].planId);
  const [refreshing, setRefreshing] = useState(false);

  const { run: continueToBrowser, pending, error } = useAction(() => openBilling());

  /**
   * The manual fallback. The deep link back from the website usually beats the merchant
   * to the app, but a browser that was dismissed with the system back gesture may not
   * fire it at all — so pulling down here is always a way out of a stale paywall.
   */
  const onRefresh = async () => {
    setRefreshing(true);
    await refresh({ silent: false });
    setRefreshing(false);
  };

  const headline = {
    trial_active: 'Pick your plan',
    trial_expired: 'Your trial has ended',
    past_due: 'We could not take your last payment',
    cancelled: 'Your subscription is cancelled',
    subscribed: "You're subscribed",
  }[planStatus] ?? 'Choose your plan';

  /** A small urgency chip above the headline — only for the states worth hurrying over. */
  const badge = {
    trial_active: `⏳ ${status?.trialDaysRemaining ?? TRIAL_DAYS} days left`,
    trial_expired: '⚠️ Trial ended',
    past_due: '⚠️ Payment failed',
  }[planStatus] ?? null;

  const subhead = {
    trial_active: 'Pick a plan now and nothing changes until your trial runs out.',
    trial_expired: 'Choose a plan to reopen your store and get back to your orders.',
    past_due: 'Update your payment method to keep your store open.',
    cancelled: 'Resubscribe any time — your products and orders are exactly where you left them.',
    subscribed: 'You have full access. Manage your plan from the website any time.',
  }[planStatus] ?? '';

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={onRefresh}
      contentStyle={{ paddingTop: insets.top + space.md }}
      footer={
        planStatus === 'subscribed' ? (
          <Button title="Done" onPress={() => router.back()} />
        ) : (
          <>
            <Button
              title="Continue"
              size="lg"
              loading={pending}
              onPress={() => continueToBrowser().catch(() => undefined)}
            />
            {/* Stated plainly, because a browser opening unannounced reads as a hijack. */}
            <Row gap={space.xs} style={styles.browserNote}>
              <Ionicons name="open-outline" size={13} color={colors.ink500} />
              <Caption>Payment opens securely in your browser</Caption>
            </Row>
          </>
        )
      }
    >
      <Row style={styles.head}>
        <View style={{ flex: 1 }} />
        <Touchable onPress={() => router.back()} accessibilityLabel="Close" style={styles.close}>
          <Ionicons name="close" size={22} color={colors.ink600} />
        </Touchable>
      </Row>

      {badge ? <Pill label={badge} tone="accent" style={styles.urgencyBadge} /> : null}
      <Display style={styles.headline}>{headline}</Display>
      <Body muted style={styles.subhead}>{subhead}</Body>

      <Alert message={error?.message} />
      {loading && !status ? <Caption style={styles.checking}>Checking your plan…</Caption> : null}

      {planStatus !== 'subscribed' ? (
        <>
          <View style={styles.toggle}>
            {[
              { value: 'monthly', label: 'Monthly' },
              { value: 'yearly', label: `Yearly · save ${yearlySavingPercent()}%` },
            ].map((option) => (
              <Touchable
                key={option.value}
                onPress={() => setCycle(option.value)}
                accessibilityLabel={option.label}
                style={[styles.toggleOption, cycle === option.value && styles.toggleOptionActive]}
              >
                <Body style={[styles.toggleText, cycle === option.value && styles.toggleTextActive]}>
                  {option.label}
                </Body>
              </Touchable>
            ))}
          </View>

          <View style={styles.plans}>
            {BILLING_PLANS.map((plan) => {
              const active = selected === plan.planId;
              const price = cycle === 'yearly' ? yearlyPrice(plan.monthlyPaise) : plan.monthlyPaise;

              return (
                <Touchable
                  key={plan.planId}
                  onPress={() => setSelected(plan.planId)}
                  accessibilityLabel={`${plan.name} plan`}
                  style={[styles.plan, active && styles.planActive]}
                >
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Row gap={space.sm}>
                      <Body strong style={styles.planName}>{plan.name}</Body>
                      {plan.popular ? <Pill label="Most popular" tone="accent" /> : null}
                    </Row>
                    <Ionicons
                      name={active ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={active ? colors.accent600 : colors.ink400}
                    />
                  </Row>

                  <Caption style={styles.tagline}>{plan.tagline}</Caption>

                  <Row gap={space.xs} align="baseline" style={styles.priceRow}>
                    <Body style={styles.price}>{formatMoney(price)}</Body>
                    <Caption>/{cycle === 'yearly' ? 'year' : 'month'}</Caption>
                  </Row>
                  {cycle === 'yearly' ? (
                    <Row gap={space.xs} align="center" style={styles.effectiveRow}>
                      <Caption>{formatMoney(effectiveMonthlyPrice(plan.planId, 'yearly'))}/mo, billed yearly</Caption>
                      <Pill label={`Save ${yearlySavingPercent()}%`} tone="accent" style={styles.saveBadge} />
                    </Row>
                  ) : null}

                  {active ? (
                    <>
                      <Divider style={styles.planDivider} />
                      {plan.highlights.map((highlight) => (
                        <Row key={highlight} gap={space.sm} align="flex-start" style={styles.highlight}>
                          <Ionicons name="checkmark" size={16} color={colors.accent600} style={{ marginTop: 2 }} />
                          <Body style={{ flex: 1 }}>{highlight}</Body>
                        </Row>
                      ))}
                    </>
                  ) : null}
                </Touchable>
              );
            })}
          </View>

          <Card style={styles.reassurance}>
            <Row gap={space.md} align="flex-start">
              <Ionicons name="lock-closed-outline" size={18} color={colors.ink600} />
              <Body muted style={{ flex: 1 }}>
                You will be taken to our website to pay. Cancel any time — your store stays online until the end of
                the period you have paid for.
              </Body>
            </Row>
          </Card>

          <Caption style={styles.pullHint}>Already paid? Pull down to refresh.</Caption>
        </>
      ) : (
        <Card>
          <Row gap={space.md} align="flex-start">
            <Ionicons name="checkmark-circle" size={22} color={colors.accent600} />
            <View style={{ flex: 1 }}>
              <Body strong>{status?.planId ? titleCase(status.planId) : 'Your'} plan is active</Body>
              <Caption>
                {status?.currentPeriodEnd ? `Renews on ${new Date(status.currentPeriodEnd).toLocaleDateString('en-IN', { dateStyle: 'medium' })}.` : ''}
              </Caption>
            </View>
          </Row>
        </Card>
      )}
    </Screen>
  );
}

const titleCase = (value) => String(value).charAt(0).toUpperCase() + String(value).slice(1);

const styles = StyleSheet.create({
  head: { marginBottom: space.md },
  close: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.ink200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  urgencyBadge: { marginBottom: space.md },
  headline: { fontSize: 28, lineHeight: 34 },
  subhead: { marginTop: space.sm, marginBottom: space.xl, fontSize: 16, lineHeight: 23 },
  checking: { marginBottom: space.md },

  toggle: {
    flexDirection: 'row',
    backgroundColor: colors.ink200,
    borderRadius: radius.pill,
    padding: 4,
    marginBottom: space.xl,
  },
  toggleOption: { flex: 1, paddingVertical: 9, borderRadius: radius.pill, alignItems: 'center' },
  toggleOptionActive: { backgroundColor: colors.surface },
  toggleText: { ...type.label, color: colors.ink600 },
  toggleTextActive: { color: colors.ink900 },

  plans: { gap: space.md },
  plan: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.line,
    padding: space.lg,
  },
  planActive: { borderColor: colors.accent600, backgroundColor: colors.accent50 },
  planName: { fontSize: 17 },
  tagline: { marginTop: 2 },
  priceRow: { marginTop: space.md },
  price: { ...type.display, fontSize: 26, color: colors.ink900 },
  effectiveRow: { marginTop: 2 },
  saveBadge: { paddingHorizontal: space.sm, paddingVertical: 2 },
  planDivider: { marginVertical: space.lg },
  highlight: { marginBottom: space.sm },

  reassurance: { marginTop: space.xl },
  pullHint: { textAlign: 'center', marginTop: space.lg },
  browserNote: { justifyContent: 'center', marginTop: space.sm },
});
