import { ActivityIndicator, View } from 'react-native';
import { Alert, Button, Caption, Field } from './ui.jsx';
import { ProductOption } from './instagram.jsx';
import { colors, space } from '../theme.js';

export function InstagramProductPicker({ search, selectedId, onSelect, disabled = false }) {
  return <View>
    <Field accessibilityLabel="Search products" placeholder="Search products" value={search.query} onChangeText={search.setQuery} autoCorrect={false} />
    {search.items.map(p => <ProductOption key={p.productId} product={p} chosen={p.productId === selectedId}
      disabled={disabled} onPress={() => onSelect(p)} />)}
    {search.loading ? <ActivityIndicator color={colors.accent600} style={{ marginVertical: space.md }} /> : null}
    {search.error ? <><Alert message="Could not load products. Please try again." /><Button title="Retry products" variant="secondary" onPress={search.retry} /></> : null}
    {!search.loading && !search.error && !search.items.length ? <Caption>No active products match your search.</Caption> : null}
    {search.nextCursor && !search.error ? <Button title="Show more products" variant="ghost" loading={search.loading} onPress={search.loadMore} /> : null}
  </View>;
}
