import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { searchQuery } from '@storekit/validation';
import { ListScreen, listColumn } from '../../src/components/Screen.jsx';
import { Display, Divider, EmptyState, ErrorState, Row } from '../../src/components/ui.jsx';
import { HelpButton } from '../../src/components/Help.jsx';
import { OrderRow } from '../../src/components/domain.jsx';
import { SkeletonList } from '../../src/components/Skeleton.jsx';
import { FilterChips, SearchBar } from '../../src/components/Filters.jsx';
import { useAuth } from '../../src/state/auth.jsx';
import { useT } from '../../src/state/locale.jsx';
import { msg } from '../../src/lib/i18n.js';
import { usePaginated } from '../../src/lib/usePaginated.js';
import { useRefreshOnFocus } from '../../src/lib/useAsync.js';
import { orders as ordersApi } from '../../src/api/endpoints.js';
import { colors, space } from '../../src/theme.js';

/**
 * The orders list.
 *
 * Filters mirror the API exactly, so a chip is a server-side query rather than a filter
 * over whatever happened to be loaded — which matters once a store has more orders than
 * one page.
 */

const STATUS_FILTERS = [
  { value: 'all', label: msg('All') },
  { value: 'NEW', label: msg('New') },
  { value: 'PENDING_PAYMENT', label: msg('Awaiting payment') },
  { value: 'CONFIRMED', label: msg('Confirmed') },
  { value: 'PREPARING', label: msg('Preparing') },
  { value: 'READY_TO_SHIP', label: msg('Ready to ship') },
  { value: 'SHIPPED', label: msg('Shipped') },
  { value: 'DELIVERED', label: msg('Delivered') },
  { value: 'CANCELLED', label: msg('Cancelled') },
];

export default function Orders() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { businessId } = useAuth();
  const params = useLocalSearchParams();
  const t = useT();

  const [status, setStatus] = useState(String(params.status ?? 'all'));
  const [paymentStatus, setPaymentStatus] = useState(String(params.paymentStatus ?? 'all'));
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [searchError, setSearchError] = useState(null);

  /* Debounced search: the endpoint is rate limited, and typing is bursty. */
  /*
   * Debounced, and only sent when it matches the search format. A term the API would
   * refuse is shown as a message under the box instead of making a request that 400s.
   */
  useEffect(() => {
    const timer = setTimeout(() => {
      const result = searchQuery.safeParse(search);
      if (result.success) {
        setSearchError(null);
        setQuery(result.data ?? '');
      } else {
        setSearchError(result.error.issues[0].message);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  /*
   * Arriving from a dashboard shortcut carries a filter in the route params. A shortcut sets
   * the whole filter: "New orders" after "Payments" must not keep the payment filter too.
   */
  useEffect(() => {
    if (!params.status && !params.paymentStatus) return;
    setStatus(String(params.status ?? 'all'));
    setPaymentStatus(String(params.paymentStatus ?? 'all'));
  }, [params.status, params.paymentStatus]);

  const list = usePaginated(
    (cursor) =>
      businessId
        ? ordersApi.list(businessId, { status, paymentStatus, q: query || undefined, cursor, limit: 20 })
        : Promise.resolve({ items: [], nextCursor: null }),
    [businessId, status, paymentStatus, query],
  );

  useFocusEffect(useRefreshOnFocus(list.reload));

  const filtered = Boolean(query) || status !== 'all' || paymentStatus !== 'all';
  const verifying = !query && status === 'all' && paymentStatus === 'PENDING_VERIFICATION';

  const header = (
    <View style={styles.header}>
      <Row style={[styles.title, { justifyContent: 'space-between' }]}>
        <Display style={styles.titleText}>{t('Orders')}</Display>
        <HelpButton context="orders" />
      </Row>
      <SearchBar value={search} onChange={setSearch} error={searchError} placeholder={msg('Order, name, mobile')} />
      <FilterChips options={STATUS_FILTERS} value={status} onChange={setStatus} />
      {paymentStatus !== 'all' ? (
        <FilterChips
          options={[
            { value: 'all', label: msg('Any payment') },
            { value: 'PENDING_VERIFICATION', label: msg('To verify') },
            { value: 'VERIFIED', label: msg('Verified') },
          ]}
          value={paymentStatus}
          onChange={setPaymentStatus}
        />
      ) : null}
    </View>
  );

  // One list for every state, so the header (and the search box being typed in) stays
  // mounted while a new filter loads; swapping to a separate loading layout would drop the
  // keyboard mid-word.
  return (
    <ListScreen>
      <FlatList
        data={list.items}
        keyExtractor={(item) => item.orderId}
        renderItem={({ item }) => (
          <OrderRow order={item} onPress={() => router.push(`/orders/${item.orderId}`)} />
        )}
        ItemSeparatorComponent={Divider}
        ListHeaderComponent={header}
        ListHeaderComponentStyle={{ paddingHorizontal: space.lg }}
        contentContainerStyle={[
          styles.content,
          listColumn,
          { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl },
        ]}
        style={styles.list}
        refreshControl={
          <RefreshControl refreshing={list.refreshing} onRefresh={list.onRefresh} tintColor={colors.accent600} colors={[colors.accent600]} />
        }
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          list.loadingMore ? <ActivityIndicator style={styles.more} color={colors.accent600} /> : null
        }
        ListEmptyComponent={
          list.loading ? (
            <View style={styles.skeleton}><SkeletonList count={6} /></View>
          ) : list.error ? (
            <ErrorState error={list.error} onRetry={list.reload} />
          ) : (
            <EmptyState
              icon={verifying ? '✅' : '🧾'}
              tint={filtered && !verifying ? colors.sunken : colors.accent50}
              title={verifying ? t('No payments to verify') : filtered ? t('Nothing matches') : t('No orders yet')}
              message={
                verifying
                  ? t('When a customer sends a UPI reference, the order shows up here for you to check.')
                  : filtered
                    ? t('Try a different filter or search term.')
                    : t('Orders placed on your store will appear here as they come in. Share your store link to get your first one.')
              }
            />
          )
        }
      />
    </ListScreen>
  );
}

const styles = StyleSheet.create({
  list: { backgroundColor: colors.canvas },
  content: { backgroundColor: colors.canvas, flexGrow: 1 },
  header: { paddingBottom: space.md, backgroundColor: colors.canvas },
  title: { marginBottom: space.sm },
  titleText: { fontSize: 28 },
  more: { paddingVertical: space.xl },
  skeleton: { paddingHorizontal: space.lg },
});
