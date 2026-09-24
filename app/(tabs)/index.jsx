import { useState } from 'react';
import { Linking, Share, StyleSheet, View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../../src/components/Screen.jsx';
import {
  Body, Caption, Card, Display, Divider, ErrorState, Figure, Heading, Row, StatusDot, Touchable,
} from '../../src/components/ui.jsx';
import { OrderRow } from '../../src/components/domain.jsx';
import { PlanBanner } from '../../src/components/PlanBanner.jsx';
import { Checklist } from '../../src/components/Stepper.jsx';
import { SkeletonList, SkeletonStats } from '../../src/components/Skeleton.jsx';
import { FadeIn, Stagger, haptic } from '../../src/components/motion.jsx';
import { useToast } from '../../src/components/Toast.jsx';
import { useAuth } from '../../src/state/auth.jsx';
import { useAsync, useRefreshOnFocus } from '../../src/lib/useAsync.js';
import { analytics, businesses as businessesApi, products as productsApi } from '../../src/api/endpoints.js';
import { formatMoney, percentChange } from '../../src/lib/format.js';
import { colors, fonts, radius, space, type } from '../../src/theme.js';

/**
 * Home — the merchant's command center.
 *
 * Ordered by what a merchant opens the app to answer, in order: is my store on and can I
 * reach it, is anything waiting on me, and how is business today. A brand-new store with
 * nothing to sell gets a setup path instead of empty stat cards — the dashboard's job on
 * day one is to get the merchant to their first product, not to show them three zeroes.
 *
 * The store strip at the top is the through-line from the launch screen: the same live
 * dot, the same address, the same open/share actions. The merchant lands here straight
 * after watching their store go live, and it is still right there.
 */

const STOREFRONT_HOST = String(process.env.EXPO_PUBLIC_STOREFRONT_HOST ?? 'storekit.site');

/** Everything a merchant manages, one tap from Home. Settings is the Account tab. */
const SHORTCUTS = [
  { label: 'Orders', icon: 'receipt-outline', href: '/(tabs)/orders' },
  { label: 'Products', icon: 'pricetag-outline', href: '/(tabs)/products' },
  { label: 'Customers', icon: 'people-outline', href: '/(tabs)/customers' },
  // Payments here means the customer payments waiting on the merchant to confirm them. Where
  // the store's own payout details are entered is deliberately not in this app (see plan.jsx).
  { label: 'Payments', icon: 'card-outline', href: '/(tabs)/orders?paymentStatus=PENDING_VERIFICATION' },
  { label: 'Coupons', icon: 'ticket-outline', href: '/coupons' },
  { label: 'Website', icon: 'globe-outline', action: 'website' },
  { label: 'Analytics', icon: 'bar-chart-outline', href: '/analytics' },
  { label: 'Settings', icon: 'settings-outline', href: '/(tabs)/account' },
];

export default function Dashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { businessId, business, user, refreshUser } = useAuth();
  const [publishing, setPublishing] = useState(false);

  const { data, error, loading, refreshing, onRefresh, reload } = useAsync(
    () => (businessId ? analytics.dashboard(businessId) : Promise.resolve(null)),
    [businessId],
  );

  // One cheap call answers "has this merchant added anything yet", which decides between
  // the setup path and the running dashboard. Kept separate so it resolves independently.
  const { data: firstProducts } = useAsync(
    () => (businessId ? productsApi.list(businessId, { limit: 1 }) : Promise.resolve(null)),
    [businessId],
  );

  // Coming back from an order detail should show the new status, not a cached row.
  useFocusEffect(useRefreshOnFocus(reload));

  const storeUrl = business?.slug ? `https://${STOREFRONT_HOST}/${business.slug}` : null;

  if (error && !data) return <ErrorState error={error} onRetry={reload} />;

  const today = data?.today ?? {};
  const yesterday = data?.yesterday ?? {};
  const pending = data?.pending ?? {};
  const hasProducts = (firstProducts?.items?.length ?? 0) > 0;
  const hasOrders = (data?.recentOrders?.length ?? 0) > 0;
  const isNew = firstProducts != null && !hasProducts && !hasOrders;

  const actions = [
    { key: 'newOrders', label: 'New orders', count: pending.newOrders, icon: 'sparkles', href: '/(tabs)/orders?status=NEW' },
    { key: 'verify', label: 'Payments to verify', count: pending.awaitingPaymentVerification, icon: 'shield-checkmark', href: '/(tabs)/orders?paymentStatus=PENDING_VERIFICATION' },
    { key: 'toShip', label: 'Ready to ship', count: pending.toShip, icon: 'cube', href: '/(tabs)/orders?status=CONFIRMED' },
    { key: 'lowStock', label: 'Low on stock', count: pending.lowStock, icon: 'trending-down', href: '/(tabs)/products?stock=low' },
  ].filter((a) => a.count > 0);

  const shareStore = async () => {
    if (!storeUrl) return;
    haptic.tap();
    try {
      await Share.share({ message: `Shop with ${business?.name ?? 'us'}: ${storeUrl}`, url: storeUrl });
    } catch { /* dismissed */ }
  };

  // `active` once published. A store made in setup starts as a draft, and saying "Live"
  // over a draft would send merchants to share a link that does not work yet.
  const isLive = business?.status === 'active';

  const publish = async () => {
    setPublishing(true);
    try {
      await businessesApi.publish(businessId);
      await refreshUser();
      haptic.success();
      toast.success('Your store is live');
    } catch (error) {
      // The API answers with what is missing ("Add your UPI ID"); that is the useful part.
      toast.error(error?.details?.[0]?.message ?? error?.message ?? 'Could not publish your store');
    } finally {
      setPublishing(false);
    }
  };

  const openStore = () => storeUrl && Linking.openURL(storeUrl).catch(() => toast.error('Could not open your store'));

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh} contentStyle={{ paddingTop: insets.top + space.md }}>
      <Row style={styles.header}>
        <View style={{ flex: 1 }}>
          <Caption>{greeting()}, {firstName(user?.name)}</Caption>
          <Display style={styles.storeName} numberOfLines={1}>{business?.name ?? 'Your store'}</Display>
        </View>
        <Touchable onPress={() => router.push('/notifications')} accessibilityLabel="Activity" style={styles.iconButton}>
          <Ionicons name="notifications-outline" size={22} color={colors.ink700} />
        </Touchable>
      </Row>

      {/* The store: its state, its address, and the two things done with it. */}
      <FadeIn>
        <View style={styles.storeStrip}>
          <Row>
            <StatusDot live={isLive} size={9} />
            <Body strong style={[styles.storeLive, !isLive && styles.storeDraft]}>{isLive ? 'Live' : 'Not published'}</Body>
            <View style={{ flex: 1 }} />
            <Touchable onPress={shareStore} accessibilityLabel="Share store" style={styles.stripButton}>
              <Ionicons name="share-social-outline" size={16} color={colors.accent700} />
            </Touchable>
          </Row>
          <Caption numberOfLines={1} style={styles.storeUrl}>{STOREFRONT_HOST}/{business?.slug ?? ''}</Caption>
          <Row gap={space.sm}>
            <Touchable onPress={openStore} accessibilityLabel="View store" style={styles.viewButton}>
              <Ionicons name="open-outline" size={17} color={colors.accent700} />
              <Body strong style={styles.viewText}>View store</Body>
            </Touchable>
            {!isLive ? (
              <Touchable onPress={publish} disabled={publishing} accessibilityLabel="Publish store" style={styles.publishButton}>
                <Body strong style={styles.publishText}>{publishing ? 'Publishing…' : 'Publish'}</Body>
              </Touchable>
            ) : null}
          </Row>
        </View>
      </FadeIn>

      <PlanBanner />

      {isNew ? (
        <SetupCard
          storeName={business?.name}
          onAddProduct={() => router.push('/products/new')}
          onShare={shareStore}
        />
      ) : null}

      {actions.length ? (
        <FadeIn>
          <Card padded={false} style={styles.actionCard}>
            {actions.map((action, index) => (
              <View key={action.key}>
                {index > 0 ? <Divider /> : null}
                <Touchable onPress={() => router.push(action.href)} style={styles.actionRow}>
                  <View style={styles.actionIcon}>
                    <Ionicons name={action.icon} size={17} color={colors.accent700} />
                  </View>
                  <Body strong style={{ flex: 1 }}>{action.label}</Body>
                  <View style={styles.countPill}>
                    <Body style={styles.countText}>{action.count}</Body>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.ink400} />
                </Touchable>
              </View>
            ))}
          </Card>
        </FadeIn>
      ) : null}

      <SectionHeader title="Manage your store" />
      <FadeIn>
        <View style={styles.grid}>
          {SHORTCUTS.map((item) => (
            <Touchable
              key={item.label}
              onPress={() => (item.action === 'website' ? openStore() : router.push(item.href))}
              accessibilityLabel={item.label}
              style={styles.gridTile}
            >
              <View style={styles.gridIcon}>
                <Ionicons name={item.icon} size={22} color={colors.accent700} />
              </View>
              <Caption numberOfLines={1} style={styles.gridLabel}>{item.label}</Caption>
            </Touchable>
          ))}
        </View>
      </FadeIn>

      {/* Today's business. The sales figure leads; orders and visitors support it. */}
      <SectionHeader title="Today" action="Full report" onAction={() => router.push('/analytics')} />
      {loading && !data ? (
        <SkeletonStats />
      ) : (
        <FadeIn>
          <Card style={styles.todayCard}>
            <Row style={styles.todayHead} align="flex-end">
              <View style={{ flex: 1 }}>
                <Caption>Sales today</Caption>
                <Figure style={styles.salesFigure}>{formatMoney(today.sales ?? 0)}</Figure>
              </View>
              <Delta value={percentChange(today.sales ?? 0, yesterday.sales ?? 0)} />
            </Row>

            {data?.trend?.length ? <Sparkline points={data.trend.map((d) => d.sales)} /> : null}

            <Row style={styles.todayStats}>
              <MiniStat label="Orders" value={String(today.orders ?? 0)} icon="receipt-outline" />
              <View style={styles.statSplit} />
              <MiniStat label="Visitors" value={String(today.visitors ?? 0)} icon="eye-outline" />
              <View style={styles.statSplit} />
              <MiniStat label="Views" value={String(today.pageViews ?? 0)} icon="albums-outline" />
            </Row>
          </Card>
        </FadeIn>
      )}

      <SectionHeader
        title="Recent orders"
        action={hasOrders ? 'See all' : undefined}
        onAction={() => router.push('/(tabs)/orders')}
      />
      {loading && !data ? (
        <SkeletonList count={3} />
      ) : hasOrders ? (
        <Card padded={false} style={styles.listCard}>
          <Stagger>
            {data.recentOrders.map((order, index) => (
              <View key={order.orderId}>
                {index > 0 ? <Divider /> : null}
                <OrderRow order={order} onPress={() => router.push(`/orders/${order.orderId}`)} />
              </View>
            ))}
          </Stagger>
        </Card>
      ) : (
        <Card style={styles.emptyOrders}>
          <View style={styles.emptyIcon}>
            <Ionicons name="receipt-outline" size={22} color={colors.accent700} />
          </View>
          <View style={{ flex: 1 }}>
            <Body strong>No orders yet</Body>
            <Caption>Share your store link and your first order will land here.</Caption>
          </View>
        </Card>
      )}

      {data?.lowStockProducts?.length ? (
        <>
          <SectionHeader title="Running low" action="Products" onAction={() => router.push('/(tabs)/products')} />
          <Card padded={false} style={styles.listCard}>
            {data.lowStockProducts.map((product, index) => (
              <View key={product.productId}>
                {index > 0 ? <Divider /> : null}
                <Touchable onPress={() => router.push(`/products/${product.productId}`)} style={styles.stockRow}>
                  <Body strong style={{ flex: 1 }} numberOfLines={1}>{product.name}</Body>
                  <Body style={[styles.stockCount, product.stock === 0 && { color: colors.danger }]}>
                    {product.stock === 0 ? 'Out of stock' : `${product.stock} left`}
                  </Body>
                  <Ionicons name="chevron-forward" size={18} color={colors.ink400} />
                </Touchable>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

/**
 * The day-one path. Shown only until the merchant has a product or an order, then it
 * disappears for good — it is scaffolding, not a permanent widget.
 */
const SetupCard = ({ storeName, onAddProduct, onShare }) => (
  <FadeIn>
    <Card style={styles.setupCard}>
      <Caption style={styles.setupKicker}>GET YOUR STORE SELLING</Caption>
      <Heading style={styles.setupTitle}>Two steps to your first sale</Heading>
      <Body muted style={styles.setupBody}>
        {storeName ?? 'Your store'} is live, but it needs something to sell before customers can order.
      </Body>

      <View style={styles.setupListWrap}>
        <Checklist
          items={[
            { key: 'created', label: 'Store created', hint: 'Done', state: 'done' },
            { key: 'product', label: 'Add your first product', hint: 'About a minute', state: 'active' },
            { key: 'share', label: 'Share your link with customers', state: 'todo' },
          ]}
        />
      </View>

      <Row gap={space.md}>
        <Touchable onPress={onAddProduct} style={styles.setupPrimary} accessibilityLabel="Add your first product">
          <Ionicons name="add" size={18} color="#ffffff" />
          <Body style={styles.setupPrimaryText}>Add product</Body>
        </Touchable>
        <Touchable onPress={onShare} style={styles.setupSecondary} accessibilityLabel="Share store">
          <Ionicons name="share-social-outline" size={17} color={colors.ink800} />
          <Body strong style={styles.setupSecondaryText}>Share</Body>
        </Touchable>
      </Row>
    </Card>
  </FadeIn>
);

/** A signed percentage chip against yesterday. Neutral when flat. */
const Delta = ({ value }) => {
  if (typeof value !== 'number' || value === 0) {
    return <Caption style={styles.deltaFlat}>vs yesterday</Caption>;
  }
  const up = value > 0;
  return (
    <View style={[styles.delta, { backgroundColor: up ? colors.successTint : colors.dangerTint }]}>
      <Ionicons name={up ? 'arrow-up' : 'arrow-down'} size={12} color={up ? colors.success : colors.danger} />
      <Caption style={[styles.deltaText, { color: up ? colors.success : colors.danger }]}>
        {Math.abs(value)}%
      </Caption>
    </View>
  );
};

const MiniStat = ({ label, value, icon }) => (
  <View style={styles.miniStat}>
    <Ionicons name={icon} size={15} color={colors.ink400} />
    <Body strong style={styles.miniValue}>{value}</Body>
    <Caption>{label}</Caption>
  </View>
);

const SectionHeader = ({ title, action, onAction }) => (
  <Row style={styles.sectionHeader}>
    <Heading style={{ flex: 1 }}>{title}</Heading>
    {action ? (
      <Touchable onPress={onAction} accessibilityLabel={action} haptics={null}>
        <Body style={styles.sectionAction}>{action}</Body>
      </Touchable>
    ) : null}
  </Row>
);

/**
 * A minimal 14-day bar chart drawn with views.
 *
 * A charting library would be the larger half of the bundle for one sparkline, and at this
 * size a bar per day reads better than a line anyway.
 */
const Sparkline = ({ points }) => {
  const max = Math.max(...points, 1);
  return (
    <View style={styles.sparkline} accessibilityLabel="Sales over the last fourteen days">
      {points.map((value, index) => (
        <View
          key={index}
          style={[
            styles.bar,
            {
              height: Math.max(3, (value / max) * 40),
              backgroundColor: index === points.length - 1 ? colors.accent600 : colors.accent200,
            },
          ]}
        />
      ))}
    </View>
  );
};

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

const firstName = (name) => String(name ?? '').trim().split(/\s+/)[0] || 'there';

const styles = StyleSheet.create({
  header: { marginBottom: space.lg },
  storeName: { fontSize: 26, lineHeight: 32, marginTop: 2 },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },

  storeStrip: {
    gap: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: space.lg,
    marginBottom: space.lg,
  },
  storeLive: { color: colors.success, fontSize: 14 },
  storeDraft: { color: colors.ink600 },
  storeUrl: { marginBottom: space.xs },
  viewButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.accent50,
  },
  viewText: { color: colors.accent700, fontSize: 14.5 },
  publishButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.accent600,
  },
  publishText: { color: '#ffffff', fontSize: 14.5 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  gridTile: {
    // Four to a row, allowing for three gaps.
    width: '23%',
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  gridIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.accent50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridLabel: { ...type.caption, color: colors.ink700, fontSize: 11.5 },
  stripButton: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.accent50,
    alignItems: 'center',
    justifyContent: 'center',
  },

  setupCard: { marginBottom: space.lg, borderColor: colors.accent200, backgroundColor: colors.accent50 },
  setupKicker: { ...type.overline, color: colors.accent700, marginBottom: space.xs },
  setupTitle: { fontSize: 19 },
  setupBody: { marginTop: space.xs, marginBottom: space.lg },
  setupListWrap: { marginBottom: space.lg, paddingLeft: space.xs },
  setupPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.accent600,
  },
  setupPrimaryText: { ...type.bodyStrong, color: '#ffffff', fontSize: 15 },
  setupSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    height: 48,
    paddingHorizontal: space.xl,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
  },
  setupSecondaryText: { color: colors.ink800 },

  actionCard: { overflow: 'hidden', marginBottom: space.xs },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.accent50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countPill: {
    minWidth: 26,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.accent600,
    alignItems: 'center',
  },
  countText: { color: '#ffffff', ...type.caption, fontFamily: fonts.bold },

  todayCard: {},
  todayHead: { marginBottom: space.md },
  salesFigure: { fontSize: 32, marginTop: 2 },
  delta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  deltaText: { fontFamily: fonts.bold },
  deltaFlat: { marginBottom: 4 },

  todayStats: {
    marginTop: space.lg,
    paddingTop: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  miniStat: { flex: 1, alignItems: 'center', gap: 3 },
  miniValue: { ...type.figure, fontSize: 20 },
  statSplit: { width: StyleSheet.hairlineWidth, backgroundColor: colors.line, alignSelf: 'stretch' },

  sectionHeader: { marginTop: space.xxl, marginBottom: space.md },
  sectionAction: { ...type.label, color: colors.accent700 },

  listCard: { overflow: 'hidden' },
  emptyOrders: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  emptyIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.accent50,
    alignItems: 'center',
    justifyContent: 'center',
  },

  stockRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  stockCount: { ...type.money, color: colors.warning },

  sparkline: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 44 },
  bar: { flex: 1, borderRadius: 3, minHeight: 3 },
});
