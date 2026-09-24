import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { searchQuery } from '@storekit/validation';
import { ListScreen } from '../../src/components/Screen.jsx';
import { Display, Divider, EmptyState, ErrorState } from '../../src/components/ui.jsx';
import { OrderRow } from '../../src/components/domain.jsx';
import { SkeletonList } from '../../src/components/Skeleton.jsx';
import { FilterChips, SearchBar } from '../../src/components/Filters.jsx';
import { useAuth } from '../../src/state/auth.jsx';
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
  { value: 'all', label: 'All' },
  { value: 'NEW', label: 'New' },
  { value: 'PENDING_PAYMENT', label: 'Awaiting payment' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'PREPARING', label: 'Preparing' },
  { value: 'READY_TO_SHIP', label: 'Ready to ship' },
  { value: 'SHIPPED', label: 'Shipped' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export default function Orders() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { businessId } = useAuth();
  const params = useLocalSearchParams();

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

  /* Arriving from a dashboard shortcut carries a filter in the route params. */
  useEffect(() => {
    if (params.status) setStatus(String(params.status));
    if (params.paymentStatus) setPaymentStatus(String(params.paymentStatus));
  }, [params.status, params.paymentStatus]);

  const list = usePaginated(
    (cursor) =>
      businessId
        ? ordersApi.list(businessId, { status, paymentStatus, q: query || undefined, cursor, limit: 20 })
        : Promise.resolve({ items: [], nextCursor: null }),
    [businessId, status, paymentStatus, query],
  );

  useFocusEffect(useRefreshOnFocus(list.reload));

  const header = (
    <View style={styles.header}>
      <Display style={styles.title}>Orders</Display>
      <SearchBar value={search} onChange={setSearch} error={searchError} placeholder="Order number, name or mobile" />
      <FilterChips options={STATUS_FILTERS} value={status} onChange={setStatus} />
      {paymentStatus !== 'all' ? (
        <FilterChips
          options={[
            { value: 'all', label: 'Any payment' },
            { value: 'PENDING_VERIFICATION', label: 'To verify' },
            { value: 'VERIFIED', label: 'Verified' },
          ]}
          value={paymentStatus}
          onChange={setPaymentStatus}
        />
      ) : null}
    </View>
  );

  if (list.loading && !list.items.length) {
    return (
      <ListScreen>
        <View style={{ paddingTop: insets.top + space.md, paddingHorizontal: space.lg }}>
          {header}
          <SkeletonList count={6} />
        </View>
      </ListScreen>
    );
  }

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
          list.error ? (
            <ErrorState error={list.error} onRetry={list.reload} />
          ) : (
            <EmptyState
              icon="🧾"
              tint={query || status !== 'all' ? colors.sunken : colors.accent50}
              title={query || status !== 'all' ? 'Nothing matches' : 'No orders yet'}
              message={
                query || status !== 'all'
                  ? 'Try a different filter or search term.'
                  : 'Orders placed on your store will appear here as they come in. Share your store link to get your first one.'
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
  title: { fontSize: 28, marginBottom: space.sm },
  more: { paddingVertical: space.xl },
});
