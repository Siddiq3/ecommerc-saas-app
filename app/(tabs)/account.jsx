import { useState } from 'react';
import { Alert as RNAlert, Linking, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../../src/components/Screen.jsx';
import {
  Body, Caption, Card, Display, Divider, Pill, Row, Touchable,
} from '../../src/components/ui.jsx';
import { Thumb } from '../../src/components/domain.jsx';
import { PlanBanner } from '../../src/components/PlanBanner.jsx';
import { useAuth } from '../../src/state/auth.jsx';
import { useLocale } from '../../src/state/locale.jsx';
import { LANGUAGES } from '../../src/lib/i18n.js';
import { usePlan } from '../../src/state/plan.jsx';
import { businesses as businessApi } from '../../src/api/endpoints.js';
import { storeUrl as storeAddress, storeHostname } from '../../src/lib/storefront.js';
import { WEB_URL } from '../../src/lib/help.js';
import { colors, radius, space, type } from '../../src/theme.js';

/**
 * Account: the store, the plan, and everything that is neither an order nor a product.
 *
 * The app is consumption-only: the plan shows as a status, and nothing here sells, prices
 * or links to a purchase (see src/state/plan.jsx).
 *
 * The two deletions at the bottom are deliberately different things. Deleting the store
 * removes the store and keeps the account, so they can start again. Deleting the account
 * removes the account and every store it owns, and signs out every device. Both happen
 * immediately and for good, behind a warning and a confirmation.
 */


export default function Account() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, business, businessId, signOut, refreshUser } = useAuth();
  const { status, refresh } = usePlan();
  const [busy, setBusy] = useState(false);
  const { locale, t } = useLocale();

  const storeUrl = business?.slug ? storeAddress(business.slug) : null;

  const openStore = () => storeUrl && Linking.openURL(storeUrl).catch(() => undefined);

  const shareStore = () => {
    if (!storeUrl) return;
    Linking.openURL(`https://wa.me/?text=${encodeURIComponent(t('Shop with us: {url}', { url: storeUrl }))}`).catch(() => undefined);
  };

  const confirmSignOut = () =>
    RNAlert.alert(t('Sign out?'), t('You will need your email or mobile number and your password to sign back in.'), [
      { text: t('Stay'), style: 'cancel' },
      { text: t('Sign out'), style: 'destructive', onPress: signOut },
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
      RNAlert.alert(t('Could not delete the store'), error?.message ?? t('Something went wrong. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  /** Two taps, because the first one is the only thing standing between a tap and losing everything. */
  const confirmDeleteStore = () => {
    if (!businessId || !business?.slug) return;
    RNAlert.alert(
      t('Delete {name}?', { name: business.name ?? t('your store') }),
      t('Your products, orders, customers and store link are deleted for good. Nothing can be restored, and any time left on a paid plan is not refunded. Your account stays, so you can start a new store.'),
      [
        { text: t('Keep my store'), style: 'cancel' },
        {
          text: t('Delete'),
          style: 'destructive',
          onPress: () =>
            RNAlert.alert(t('Delete permanently?'), t('This is the last step. There is no undo.'), [
              { text: t('Cancel'), style: 'cancel' },
              { text: t('Delete forever'), style: 'destructive', onPress: deleteStore },
            ]),
        },
      ],
    );
  };

  /* Used by the hidden Subscription row below.
  const planLabel = {
    trial_active: `Trial · ${status?.trialDaysRemaining ?? 0} day${status?.trialDaysRemaining === 1 ? '' : 's'} left`,
    trial_expired: 'Trial ended',
    subscribed: status?.plan?.name ? `${status.plan.name} plan` : 'Subscribed',
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
  */

  return (
    <Screen contentStyle={{ paddingTop: insets.top + space.md }}>
      <Display style={styles.title}>{t('Account')}</Display>

      <PlanBanner />

      <Card style={styles.card}>
        <Row gap={space.lg}>
          <Thumb label={business?.name ?? '?'} size={52} />
          <View style={{ flex: 1 }}>
            <Body strong numberOfLines={1}>{business?.name ?? t('Your store')}</Body>
            {/* Selectable: Help tells owners to press and hold it to copy for Instagram. */}
            {/* Not selectable: on Android that disables truncation (the link showed half a second line). */}
            <Caption numberOfLines={1} ellipsizeMode="middle">{business?.slug ? storeHostname(business.slug) : t('No store link yet')}</Caption>
          </View>
        </Row>
        {storeUrl ? (
          <>
            <Divider style={styles.innerDivider} />
            <Row gap={space.xl}>
              <Touchable onPress={openStore} accessibilityLabel={t('View store')} style={styles.inlineAction}>
                <Ionicons name="open-outline" size={17} color={colors.accent700} />
                <Body style={styles.inlineActionText}>{t('View store')}</Body>
              </Touchable>
              <Touchable onPress={shareStore} accessibilityLabel={t('Share store link')} style={styles.inlineAction}>
                <Ionicons name="share-social-outline" size={17} color={colors.accent700} />
                <Body style={styles.inlineActionText}>{t('Share link')}</Body>
              </Touchable>
            </Row>
          </>
        ) : null}
      </Card>

      <Group title={t('Store')}>
        <Item icon="storefront-outline" label={t('Store details & payments')} onPress={() => router.push('/settings/store')} />
        <Item icon="color-palette-outline" label={t('Storefront')} onPress={() => router.push('/settings/storefront')} />
        <Item icon="bicycle-outline" label={t('Delivery')} onPress={() => router.push('/settings/delivery')} />
        <Item icon="shield-checkmark-outline" label={t('Policies')} onPress={() => router.push('/settings/policies')} />
        {/* Hidden for now: subscription is managed on the website.
        <Item
          icon="card-outline"
          label={t('Subscription')}
          value={<Pill label={planLabel} tone={planTone} />}
          onPress={() => router.push('/settings/subscription')}
        />
        */}
        <Item icon="book-outline" label={t('Bill book')} onPress={() => router.push('/book')} />
        <Item icon="people-outline" label={t('Khata')} onPress={() => router.push('/khata')} />
        <Item icon="bar-chart-outline" label={t('Analytics')} onPress={() => router.push('/analytics')} />
        <Item icon="notifications-outline" label={t('Activity')} onPress={() => router.push('/notifications')} />
        <Item icon="folder-outline" label={t('Categories')} onPress={() => router.push('/categories')} />
        <Item icon="pricetag-outline" label={t('Coupons')} onPress={() => router.push('/coupons')} />
        <Item
          icon="globe-outline"
          label={t('Custom domain')}
          // Only when the plan does not include it: an included feature needs no label, and
          // "not included" is the one thing worth saying before they tap.
          value={status?.entitlements && !status.entitlements.maxCustomDomains ? <Pill label={t('Not included')} tone="slate" /> : null}
          onPress={() => router.push('/settings/domain')}
          last
        />
      </Group>

      <Group title={t('You')}>
        <Item
          icon="person-outline"
          label={t('Profile')}
          value={<Caption numberOfLines={1}>{user?.email}</Caption>}
          onPress={() => router.push('/settings/profile')}
        />
        {/* Optional: only until it is done. Sign-up never waits on it. */}
        {user && !user.emailVerified ? (
          <Item
            icon="mail-unread-outline"
            label={t('Verify email')}
            value={<Pill label={t('Not verified')} tone="amber" />}
            onPress={() => router.push('/settings/verify-email')}
          />
        ) : null}
        <Item icon="lock-closed-outline" label={t('Password and devices')} onPress={() => router.push('/settings/security')} />
        <Item
          icon="language-outline"
          label={t('Language')}
          value={<Caption>{LANGUAGES.find((l) => l.code === locale)?.name}</Caption>}
          onPress={() => router.push('/settings/language')}
          last
        />
      </Group>

      <Group title={t('Support')}>
        <Item
          icon="help-circle-outline"
          label={t('Help')}
          onPress={() => router.push('/help')}
        />
        <Item
          icon="document-text-outline"
          label={t('Terms of service')}
          onPress={() => Linking.openURL(`${WEB_URL}/legal/terms`).catch(() => undefined)}
        />
        <Item
          icon="shield-outline"
          label={t('Privacy policy')}
          onPress={() => Linking.openURL(`${WEB_URL}/legal/privacy`).catch(() => undefined)}
          last
        />
      </Group>

      <Group title={t('Danger zone')}>
        {businessId ? (
          <Item
            icon="trash-outline"
            label={t('Delete store')}
            tone="danger"
            disabled={busy}
            onPress={confirmDeleteStore}
          />
        ) : null}
        <Item
          icon="person-remove-outline"
          label={t('Delete account')}
          tone="danger"
          disabled={busy}
          onPress={() => router.push('/settings/delete-account')}
          last
        />
      </Group>

      <Touchable onPress={confirmSignOut} style={styles.signOut} accessibilityLabel={t('Sign out')}>
        <Ionicons name="log-out-outline" size={18} color={colors.danger} />
        <Body style={{ color: colors.danger }}>{t('Sign out')}</Body>
      </Touchable>

      <Caption style={styles.version}>{t('StoreKit for merchants')} · v1.0.0</Caption>
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
        {/* The value under the label, not beside it: beside, "Custom domain" broke letter by letter at large text. */}
        <View style={styles.itemText}>
          <Body style={danger && { color: colors.danger }}>{label}</Body>
          {value ? <View style={styles.itemValue}>{value}</View> : null}
        </View>
        <Ionicons name="chevron-forward" size={17} color={colors.ink400} />
      </Touchable>
      {last ? null : <Divider style={styles.itemDivider} />}
    </>
  );
};

const styles = StyleSheet.create({
  itemText: { flex: 1, gap: 2 },
  itemValue: { alignSelf: 'flex-start' },
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
