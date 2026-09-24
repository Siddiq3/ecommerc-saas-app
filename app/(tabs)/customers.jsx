import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { searchQuery } from '@storekit/validation';
import { ListScreen } from '../../src/components/Screen.jsx';
import { Display, Divider, EmptyState, ErrorState, Loading } from '../../src/components/ui.jsx';
import { CustomerRow } from '../../src/components/domain.jsx';
import { FilterChips, SearchBar } from '../../src/components/Filters.jsx';
import { useAuth } from '../../src/state/auth.jsx';
import { usePaginated } from '../../src/lib/usePaginated.js';
import { useRefreshOnFocus } from '../../src/lib/useAsync.js';
import { customers as customersApi } from '../../src/api/endpoints.js';
import { colors, space } from '../../src/theme.js';

/**
 * Customers, derived from orders.
 *
 * Records are per store and unlinked across stores — the same shopper at two businesses
 * is two records, because the id is salted with the business. There is nothing to import
 * and nothing to create here; the list fills itself as orders arrive.
 */

const SORTS = [
  { value: 'recent', label: 'Recent' },
  { value: 'spend', label: 'Top spenders' },
  { value: 'orders', label: 'Most orders' },
];

export default function Customers() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { businessId } = useAuth();

  const [sort, setSort] = useState('recent');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [searchError, setSearchError] = useState(null);

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

  const list = usePaginated(
    (cursor) =>
      businessId
        ? customersApi.list(businessId, { sort, q: query || undefined, cursor, limit: 20 })
        : Promise.resolve({ items: [], nextCursor: null }),
    [businessId, sort, query],
  );

  useFocusEffect(useRefreshOnFocus(list.reload));

  const header = (
    <View style={styles.header}>
      <Display style={styles.title}>Customers</Display>
      <SearchBar value={search} onChange={setSearch} error={searchError} placeholder="Name, mobile or email" />
      <FilterChips options={SORTS} value={sort} onChange={setSort} />
    </View>
  );

  if (list.loading && !list.items.length) {
    return (
      <ListScreen>
        <View style={{ paddingTop: insets.top + space.md, paddingHorizontal: space.lg }}>{header}</View>
        <Loading />
      </ListScreen>
    );
  }

  return (
    <ListScreen>
      <FlatList
        data={list.items}
        keyExtractor={(item) => item.customerId}
        renderItem={({ item }) => (
          <CustomerRow customer={item} onPress={() => router.push(`/customers/${item.customerId}`)} />
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
        ListFooterComponent={list.loadingMore ? <ActivityIndicator style={styles.more} color={colors.accent600} /> : null}
        ListEmptyComponent={
          list.error ? (
            <ErrorState error={list.error} onRetry={list.reload} />
          ) : (
            <EmptyState
              icon="👥"
              title={query ? 'Nobody matches' : 'No customers yet'}
              message={
                query
                  ? 'Try a different name or number.'
                  : 'Everyone who orders from your store shows up here, with what they have spent.'
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
