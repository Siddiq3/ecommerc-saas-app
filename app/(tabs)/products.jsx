import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { searchQuery } from '@storekit/validation';
import { ListScreen } from '../../src/components/Screen.jsx';
import { Body, Button, Display, Divider, EmptyState, ErrorState, Row, Touchable } from '../../src/components/ui.jsx';
import { ProductRow } from '../../src/components/domain.jsx';
import { FilterChips, SearchBar } from '../../src/components/Filters.jsx';
import { SkeletonList } from '../../src/components/Skeleton.jsx';
import { useAuth } from '../../src/state/auth.jsx';
import { usePaginated } from '../../src/lib/usePaginated.js';
import { useRefreshOnFocus } from '../../src/lib/useAsync.js';
import { products as productsApi } from '../../src/api/endpoints.js';
import { colors, radius, space } from '../../src/theme.js';

/**
 * The catalogue.
 *
 * The old screen stacked two separate filter rows (stock, then visibility) above the list —
 * seven chips over two lines before a merchant saw a single product. Stock state and
 * visibility are folded into one row here: "Hidden" sits alongside the stock filters because
 * a merchant thinks in one question ("show me which products?"), not two. Each stock filter
 * carries a tone, so "Low" and "Out" read as warnings in the filter bar itself.
 */

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'in', label: 'In stock', tone: 'success' },
  { value: 'low', label: 'Low', tone: 'warning' },
  { value: 'out', label: 'Out', tone: 'danger' },
  { value: 'hidden', label: 'Hidden' },
];

/** Maps the single filter selection onto the two query params the API expects. */
const queryFor = (filter) =>
  filter === 'hidden' ? { active: 'false', stock: 'all' } : { active: 'all', stock: filter };

export default function Products() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { businessId } = useAuth();
  const params = useLocalSearchParams();

  const [filter, setFilter] = useState(String(params.stock ?? 'all'));
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

  useEffect(() => {
    if (params.stock) setFilter(String(params.stock));
  }, [params.stock]);

  const { active, stock } = queryFor(filter);

  const list = usePaginated(
    (cursor) =>
      businessId
        ? productsApi.list(businessId, { stock, active, q: query || undefined, cursor, limit: 20 })
        : Promise.resolve({ items: [], nextCursor: null }),
    [businessId, filter, query],
  );

  useFocusEffect(useRefreshOnFocus(list.reload));

  const filtered = query || filter !== 'all';

  const header = (
    <View style={styles.header}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Display style={styles.title}>Products</Display>
        <Touchable
          onPress={() => router.push('/categories')}
          accessibilityLabel="Categories"
          style={styles.iconButton}
        >
          <Ionicons name="folder-outline" size={18} color={colors.ink700} />
          <Body style={styles.iconButtonText}>Categories</Body>
        </Touchable>
      </Row>
      <SearchBar value={search} onChange={setSearch} error={searchError} placeholder="Search products" />
      <FilterChips options={FILTERS} value={filter} onChange={setFilter} />
    </View>
  );

  if (list.loading && !list.items.length) {
    return (
      <ListScreen>
        <View style={{ paddingTop: insets.top + space.md, paddingHorizontal: space.lg }}>
          {header}
          <SkeletonList count={6} thumb={58} />
        </View>
      </ListScreen>
    );
  }

  return (
    <ListScreen
      footer={(
        <Button
          title="Add product"
          icon={<Ionicons name="add" size={20} color="#ffffff" />}
          onPress={() => router.push('/products/new')}
        />
      )}
    >
      <FlatList
        data={list.items}
        keyExtractor={(item) => item.productId}
        renderItem={({ item }) => (
          <ProductRow product={item} onPress={() => router.push(`/products/${item.productId}`)} />
        )}
        ItemSeparatorComponent={Divider}
        ListHeaderComponent={header}
        ListHeaderComponentStyle={{ paddingHorizontal: space.lg }}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.md, paddingBottom: space.xxl }]}
        style={styles.list}
        refreshControl={(
          <RefreshControl refreshing={list.refreshing} onRefresh={list.onRefresh} tintColor={colors.accent600} colors={[colors.accent600]} />
        )}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.4}
        ListFooterComponent={list.loadingMore ? <ActivityIndicator style={styles.more} color={colors.accent600} /> : null}
        ListEmptyComponent={
          list.error ? (
            <ErrorState error={list.error} onRetry={list.reload} />
          ) : (
            <EmptyState
              icon={filtered ? '🔍' : '🏷️'}
              tint={filtered ? colors.sunken : colors.accent50}
              title={filtered ? 'Nothing matches' : 'Your catalogue is empty'}
              message={
                filtered
                  ? 'Try a different filter or search term.'
                  : 'Add your first product and your store is ready to take orders.'
              }
              action={
                filtered ? null : (
                  <Button title="Add your first product" onPress={() => router.push('/products/new')} />
                )
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
  header: { paddingBottom: space.sm, backgroundColor: colors.canvas },
  title: { fontSize: 28, marginBottom: space.md },
  iconButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  iconButtonText: { fontSize: 13, color: colors.ink700 },
  more: { paddingVertical: space.xl },
});
