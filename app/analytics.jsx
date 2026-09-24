import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatMoney } from '@storekit/shared';
import { Screen } from '../src/components/Screen.jsx';
import {
  Alert, Body, Caption, Card, Divider, ErrorState, Figure, Heading, Row, Touchable,
} from '../src/components/ui.jsx';
import { Thumb } from '../src/components/domain.jsx';
import { FilterChips } from '../src/components/Filters.jsx';
import { SkeletonCard, SkeletonStats } from '../src/components/Skeleton.jsx';
import { FadeIn, ProgressBar } from '../src/components/motion.jsx';
import { useAuth } from '../src/state/auth.jsx';
import { useAsync } from '../src/lib/useAsync.js';
import { analytics as analyticsApi } from '../src/api/endpoints.js';
import { compactMoney } from '../src/lib/format.js';
import { colors, fonts, radius, space, type } from '../src/theme.js';

/**
 * The full report.
 *
 * Reads top-down as a story rather than a metric dump: how much did I make (the hero figure
 * and its trend), where did it come from (the funnel — visitors who became buyers), and what
 * sold (best sellers, searches). The funnel is the point of the page: a small merchant's
 * single most useful question is "how many of the people who looked actually bought", and
 * seeing it as a narrowing bar answers it faster than two percentages in a list.
 *
 * Every figure is derived from what the API already aggregates per day, so the range picker
 * is a query rather than a client-side filter, and a longer range costs one request.
 */

const PRESETS = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
];

export default function Analytics() {
  const router = useRouter();
  const { businessId } = useAuth();
  const [preset, setPreset] = useState('30d');

  const { data, error, loading, refreshing, onRefresh, reload } = useAsync(
    () => (businessId ? analyticsApi.overview(businessId, { preset }) : Promise.resolve(null)),
    [businessId, preset],
  );

  if (error && !data) return <ErrorState error={error} onRetry={reload} />;

  const totals = data?.totals ?? {};
  const daily = data?.daily ?? [];
  const maxRevenue = Math.max(...daily.map((d) => d.revenue ?? 0), 1);
  const peakIndex = daily.reduce((best, d, i) => ((d.revenue ?? 0) > (daily[best]?.revenue ?? 0) ? i : best), 0);

  const visitors = totals.uniqueVisitors ?? 0;
  const orders = totals.orders ?? 0;

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <FilterChips options={PRESETS} value={preset} onChange={setPreset} />

      {data?.range?.clamped ? (
        <Alert
          tone="warning"
          message={`Your plan keeps ${data.range.retentionDays} days of history. Showing from ${data.range.from}.`}
        />
      ) : null}

      {loading && !data ? (
        <>
          <SkeletonCard lines={4} />
          <View style={{ height: space.lg }} />
          <SkeletonStats />
        </>
      ) : (
        <>
          {/* Hero: the number, then its shape over time. */}
          <FadeIn>
            <Card style={styles.hero}>
              <Caption>Sales this period</Caption>
              <Figure style={styles.heroValue}>{formatMoney(totals.revenue)}</Figure>

              <Row gap={space.xl} style={styles.heroMeta}>
                <View>
                  <Caption>Orders</Caption>
                  <Body strong style={styles.heroMetaValue}>{orders}</Body>
                </View>
                <View style={styles.heroSplit} />
                <View>
                  <Caption>Avg order</Caption>
                  <Body strong style={styles.heroMetaValue}>{formatMoney(data?.averageOrderValue)}</Body>
                </View>
              </Row>

              {daily.length ? (
                <>
                  <View style={styles.chart} accessibilityLabel="Daily sales chart">
                    {daily.map((day, index) => {
                      const isPeak = index === peakIndex && (day.revenue ?? 0) > 0;
                      return (
                        <View key={day.date} style={styles.barSlot}>
                          <View
                            style={[
                              styles.bar,
                              { height: Math.max(3, ((day.revenue ?? 0) / maxRevenue) * 88) },
                              isPeak && styles.barPeak,
                              index === daily.length - 1 && styles.barLast,
                            ]}
                          />
                        </View>
                      );
                    })}
                  </View>
                  <Row style={styles.chartAxis}>
                    <Caption>{daily[0]?.date}</Caption>
                    {daily[peakIndex]?.revenue > 0 ? (
                      <Caption style={styles.peakLabel}>Peak {compactMoney(daily[peakIndex].revenue)}</Caption>
                    ) : null}
                    <Caption>{daily[daily.length - 1]?.date}</Caption>
                  </Row>
                </>
              ) : null}
            </Card>
          </FadeIn>

          {/* The funnel: the page's real insight. */}
          <FadeIn delay={60}>
            <Card style={styles.card}>
              <Heading style={styles.blockTitle}>Who bought</Heading>
              <FunnelBar label="Opened your store" value={visitors} of={visitors} tone={colors.ink400} />
              <FunnelBar
                label="Placed an order"
                value={orders}
                of={visitors}
                tone={colors.accent600}
                caption={`${data?.conversionRate ?? 0}% of visitors`}
              />
              <Divider style={styles.divider} />
              <Metric
                label="Carts that became orders"
                value={`${data?.cartConversionRate ?? 0}%`}
                hint="Of everyone who added something to a cart."
              />
              <Metric label="Cancelled orders" value={String(totals.cancelledOrders ?? 0)} />
            </Card>
          </FadeIn>

          {data?.topProducts?.length ? (
            <FadeIn delay={120}>
              <Heading style={styles.sectionHeading}>Best sellers</Heading>
              <Card padded={false} style={styles.card}>
                {data.topProducts.map((product, index) => (
                  <View key={product.productId}>
                    {index > 0 ? <Divider /> : null}
                    <Touchable onPress={() => router.push(`/products/${product.productId}`)} style={styles.productRow}>
                      <View style={[styles.rank, index === 0 && styles.rankTop]}>
                        <Caption style={[styles.rankText, index === 0 && styles.rankTextTop]}>{index + 1}</Caption>
                      </View>
                      <Thumb uri={product.thumbUrl} size={40} />
                      <View style={{ flex: 1 }}>
                        <Body strong numberOfLines={1}>{product.name}</Body>
                        <Caption>{product.units ?? product.quantity ?? 0} sold</Caption>
                      </View>
                      <Body style={type.money}>{compactMoney(product.revenue)}</Body>
                    </Touchable>
                  </View>
                ))}
              </Card>
            </FadeIn>
          ) : null}

          {data?.topSearches?.length ? (
            <FadeIn delay={160}>
              <Heading style={styles.sectionHeading}>What people searched for</Heading>
              <Card style={styles.card}>
                {data.topSearches.map((row, index) => (
                  <Row key={row.term ?? index} style={styles.searchRow}>
                    <Ionicons name="search" size={14} color={colors.ink400} />
                    <Body style={{ flex: 1 }} numberOfLines={1}>{row.term}</Body>
                    <Caption>{row.count} time{row.count === 1 ? '' : 's'}</Caption>
                  </Row>
                ))}
                <Caption style={styles.searchHint}>Searches with no results are worth stocking.</Caption>
              </Card>
            </FadeIn>
          ) : null}
        </>
      )}
    </Screen>
  );
}

/** One tier of the funnel: a labelled bar whose fill is its share of the top of the funnel. */
const FunnelBar = ({ label, value, of, tone, caption }) => {
  const ratio = of > 0 ? Math.min(1, value / of) : 0;
  return (
    <View style={styles.funnelRow}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Body>{label}</Body>
        <Body strong>{value}</Body>
      </Row>
      <ProgressBar value={ratio} track={colors.sunken} fill={tone} height={8} style={{ marginTop: 6 }} />
      {caption ? <Caption style={{ marginTop: 4 }}>{caption}</Caption> : null}
    </View>
  );
};

const Metric = ({ label, value, hint }) => (
  <Row style={styles.metricRow} align="flex-start">
    <View style={{ flex: 1 }}>
      <Body>{label}</Body>
      {hint ? <Caption>{hint}</Caption> : null}
    </View>
    <Body style={styles.metricValue}>{value}</Body>
  </Row>
);


const styles = StyleSheet.create({
  hero: { marginBottom: space.lg },
  heroValue: { fontSize: 34, marginTop: 2 },
  heroMeta: { marginTop: space.md, marginBottom: space.sm },
  heroMetaValue: { ...type.figure, fontSize: 18, marginTop: 2 },
  heroSplit: { width: StyleSheet.hairlineWidth, backgroundColor: colors.line, alignSelf: 'stretch' },

  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 92, marginTop: space.xl },
  barSlot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: '100%', backgroundColor: colors.accent200, borderRadius: 2, minHeight: 3 },
  barPeak: { backgroundColor: colors.accent500 },
  barLast: { backgroundColor: colors.accent600 },
  chartAxis: { justifyContent: 'space-between', marginTop: space.sm },
  peakLabel: { color: colors.accent700 },

  card: { marginBottom: space.lg },
  blockTitle: { fontSize: 16, marginBottom: space.lg },
  sectionHeading: { fontSize: 16, marginTop: space.sm, marginBottom: space.md },

  funnelRow: { marginBottom: space.lg },
  divider: { marginVertical: space.xs },
  metricRow: { justifyContent: 'space-between', paddingVertical: space.sm },
  metricValue: { ...type.money, fontSize: 16, color: colors.ink900 },

  productRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  rank: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.sunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankTop: { backgroundColor: colors.accent600 },
  rankText: { fontSize: 12, color: colors.ink600, fontFamily: fonts.bold },
  rankTextTop: { color: '#ffffff' },

  searchRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.sm, gap: space.md },
  searchHint: { marginTop: space.md },
});
