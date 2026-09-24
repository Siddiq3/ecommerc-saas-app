import { useState } from 'react';
import { Alert as RNAlert, Linking, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../../src/components/Screen.jsx';
import {
  Body, Caption, Card, Display, Divider, Pill, Row, Touchable,
} from '../../src/components/ui.jsx';
import { Thumb } from '../../src/components/domain.jsx';
import { PlanBanner } from '../../src/components/PlanBanner.jsx';
import { useAuth } from '../../src/state/auth.jsx';
import { usePlan } from '../../src/state/plan.jsx';
import { account as accountApi, businesses as businessApi } from '../../src/api/endpoints.js';
import { storeUrl as storeAddress } from '../../src/lib/storefront.js';
import { colors, radius, space, type } from '../../src/theme.js';

/**
 * Account: the store, the plan, and everything that is neither an order nor a product.
 *
 * "Manage subscription" leaves for the browser exactly as the paywall does — there is no
 * second path to billing inside the app, and no screen here that could be mistaken for
 * one.
 *
 * The two deletions at the bottom are deliberately different things. Deleting the store
 * is the merchant's own call and happens here, immediately and for good. Deleting the
 * *account* opens the website, where they say why and a person reviews it — it ends a
 * paid relationship and erases records we may be asked about later, which is not a
 * decision that should turn on one mis-tap.
 */

const STOREFRONT_HOST = String(process.env.EXPO_PUBLIC_STOREFRONT_HOST ?? 'storekit.site');

export default function Account() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, business, businessId, signOut, refreshUser } = useAuth();
  const { status, planStatus, refresh } = usePlan();
  const [busy, setBusy] = useState(false);

  const storeUrl = business?.slug ? storeAddress(business.slug) : null;

  const openStore = () => storeUrl && Linking.openURL(storeUrl).catch(() => undefined);

  const shareStore = () => {
    if (!storeUrl) return;
    Linking.openURL(`https://wa.me/?text=${encodeURIComponent(`Shop with us: ${storeUrl}`)}`).catch(() => undefined);
  };

  const confirmSignOut = () =>
    RNAlert.alert('Sign out?', 'You will need your email, mobile and password to get back in.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);

  const deleteStore = async () => {
    setBusy(true);
    try {
      await businessApi.remove(businessId, business.slug);
      // Both providers, in this order: the layout sends the merchant to onboarding once
      // the user has no store, and the plan status is what tells it there is none.
      await refreshUser();
      await refresh({ silent: true });
    } catch (error) {
      RNAlert.alert('Could not delete the store', error?.message ?? 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  /** Two taps, because the first one is the only thing standing between a tap and losing everything. */
  const confirmDeleteStore = () => {
    if (!businessId || !business?.slug) return;
    RNAlert.alert(
      `Delete ${business.name ?? 'your store'}?`,
      'Your products, orders, customers and store link are deleted for good. Nothing can be restored, and any time left on a paid plan is not refunded. Your account stays, so you can start a new store.',
      [
        { text: 'Keep my store', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            RNAlert.alert('Delete permanently?', 'This is the last step. There is no undo.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete forever', style: 'destructive', onPress: deleteStore },
            ]),
        },
      ],
    );
  };

  /**
   * Opens the deletion form in the device's real browser with a one-time code, the same
   * handoff billing uses. The code is opaque, lives two minutes and is spent on first use.
   */
  const openAccountDeletion = async () => {
    setBusy(true);
    try {
      const { url } = await accountApi.deletionHandoff();
      await WebBrowser.openBrowserAsync(url, {
        toolbarColor: '#ffffff',
        controlsColor: colors.accent600,
        dismissButtonStyle: 'close',
        enableBarCollapsing: true,
        showTitle: true,
      });
    } catch (error) {
      RNAlert.alert('Could not open the form', error?.message ?? 'Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const planLabel = {
    trial_active: `Trial · ${status?.trialDaysRemaining ?? 0} day${status?.trialDaysRemaining === 1 ? '' : 's'} left`,
    trial_expired: 'Trial ended',
    subscribed: status?.planId ? `${titleCase(status.planId)} plan` : 'Subscribed',
    cancelled: 'Cancelled',
    past_due: 'Payment failed',
  }[planStatus] ?? '—';

  const planTone = {
    trial_active: 'teal',
    trial_expired: 'red',
    subscribed: 'green',
    cancelled: 'amber',
    past_due: 'red',
  }[planStatus] ?? 'slate';

  return (
    <Screen contentStyle={{ paddingTop: insets.top + space.md }}>
      <Display style={styles.title}>Account</Display>

      <PlanBanner />

      <Card style={styles.card}>
        <Row gap={space.lg}>
          <Thumb label={business?.name ?? '?'} size={52} />
          <View style={{ flex: 1 }}>
            <Body strong numberOfLines={1}>{business?.name ?? 'Your store'}</Body>
            <Caption numberOfLines={1}>{storeUrl ?? 'No store link yet'}</Caption>
          </View>
        </Row>
        {storeUrl ? (
          <>
            <Divider style={styles.innerDivider} />
            <Row gap={space.xl}>
              <Touchable onPress={openStore} accessibilityLabel="View store" style={styles.inlineAction}>
                <Ionicons name="open-outline" size={17} color={colors.accent700} />
                <Body style={styles.inlineActionText}>View store</Body>
              </Touchable>
              <Touchable onPress={shareStore} accessibilityLabel="Share store link" style={styles.inlineAction}>
                <Ionicons name="share-social-outline" size={17} color={colors.accent700} />
                <Body style={styles.inlineActionText}>Share link</Body>
              </Touchable>
            </Row>
          </>
        ) : null}
      </Card>

      <Group>
        <Item
          icon="card-outline"
          label="Subscription"
          value={<Pill label={planLabel} tone={planTone} />}
          onPress={() => router.push('/settings/subscription')}
        />
        <Item icon="bar-chart-outline" label="Analytics" onPress={() => router.push('/analytics')} />
        <Item icon="notifications-outline" label="Activity" onPress={() => router.push('/notifications')} />
        <Item icon="folder-outline" label="Categories" onPress={() => router.push('/categories')} />
        <Item icon="pricetag-outline" label="Coupons" onPress={() => router.push('/coupons')} last />
      </Group>

      <Group title="You">
        <Item
          icon="person-outline"
          label="Profile"
          value={<Caption numberOfLines={1}>{user?.email}</Caption>}
          onPress={() => router.push('/settings/profile')}
        />
        <Item icon="lock-closed-outline" label="Password and devices" onPress={() => router.push('/settings/security')} last />
      </Group>

      <Group title="Support">
        <Item
          icon="help-circle-outline"
          label="Help"
          onPress={() => Linking.openURL(`https://${STOREFRONT_HOST}/help`).catch(() => undefined)}
        />
        <Item
          icon="document-text-outline"
          label="Terms and privacy"
          onPress={() => Linking.openURL(`https://${STOREFRONT_HOST}/terms`).catch(() => undefined)}
          last
        />
      </Group>

      <Group title="Danger zone">
        {businessId ? (
          <Item
            icon="trash-outline"
            label="Delete store"
            tone="danger"
            disabled={busy}
            onPress={confirmDeleteStore}
          />
        ) : null}
        <Item
          icon="person-remove-outline"
          label="Delete account"
          tone="danger"
          disabled={busy}
          onPress={openAccountDeletion}
          last
        />
      </Group>

      <Touchable onPress={confirmSignOut} style={styles.signOut} accessibilityLabel="Sign out">
        <Ionicons name="log-out-outline" size={18} color={colors.danger} />
        <Body style={{ color: colors.danger }}>Sign out</Body>
      </Touchable>

      <Caption style={styles.version}>StoreKit for merchants · v1.0.0</Caption>
    </Screen>
  );
}

const Group = ({ title, children }) => (
  <View style={styles.group}>
    {title ? <Caption style={styles.groupTitle}>{title.toUpperCase()}</Caption> : null}
    <Card padded={false} style={styles.groupCard}>{children}</Card>
  </View>
);

const Item = ({ icon, label, value, onPress, last, tone, disabled }) => {
  const danger = tone === 'danger';
  return (
    <>
      <Touchable
        onPress={disabled ? undefined : onPress}
        style={[styles.item, disabled && styles.itemDisabled]}
        accessibilityLabel={label}
      >
        <Ionicons name={icon} size={19} color={danger ? colors.danger : colors.ink600} />
        <Body style={[{ flex: 1 }, danger && { color: colors.danger }]}>{label}</Body>
        {value}
        <Ionicons name="chevron-forward" size={17} color={colors.ink400} />
      </Touchable>
      {last ? null : <Divider style={styles.itemDivider} />}
    </>
  );
};

const titleCase = (value) => String(value).charAt(0).toUpperCase() + String(value).slice(1);

const styles = StyleSheet.create({
  title: { fontSize: 28, marginBottom: space.lg },
  card: { marginBottom: space.xl },
  innerDivider: { marginVertical: space.md },
  inlineAction: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  inlineActionText: { ...type.label, color: colors.accent700 },

  group: { marginBottom: space.xl },
  groupTitle: { marginBottom: space.sm, letterSpacing: 0.8, color: colors.ink500 },
  groupCard: { overflow: 'hidden', borderRadius: radius.lg },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
    minHeight: 54,
  },
  itemDisabled: { opacity: 0.5 },
  itemDivider: { marginLeft: space.lg + 19 + space.md },

  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingVertical: space.lg,
  },
  version: { textAlign: 'center', marginTop: space.md, color: colors.ink400 },
});
