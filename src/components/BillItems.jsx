import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BOOK_QTY_MAX, BOOK_UNITS, bookItemSchema, itemTotal, rupeesText } from '@storekit/validation';
import { toMajor } from '@storekit/shared';
import { Alert, Body, Button, Caption, Card, Divider, Field, Row, Touchable } from './ui.jsx';
import { FilterChips, SearchBar } from './Filters.jsx';
import { Sheet } from './Sheet.jsx';
import { msg } from '../lib/i18n.js';
import { formatMoney } from '../lib/format.js';
import { useProductSearch } from '../lib/useProductSearch.js';
import { useAuth } from '../state/auth.jsx';
import { useT } from '../state/locale.jsx';
import { colors, space, type } from '../theme.js';

export const UNIT_LABELS = {
  pcs: msg('Pcs'),
  m: msg('Meter'),
  kg: msg('Kg'),
  g: msg('Gram'),
  l: msg('Litre'),
  ml: msg('ml'),
  pair: msg('Pair'),
  set: msg('Set'),
  dozen: msg('Dozen'),
  box: msg('Box'),
};

const priceField = rupeesText('Price');
const QTY = /^\d{1,6}(?:\.\d{1,3})?$/;

/** 2.500 → "2.5", 3 → "3": quantities read the way they are spoken at the counter. */
export const formatQty = (qty) => String(Number(Number(qty).toFixed(3)));

/** "2.5 Meter × ₹180" for one line. */
const lineDetail = (t, item) => `${formatQty(item.qty)} ${t(UNIT_LABELS[item.unit] ?? 'Pcs')} × ${formatMoney(item.price)}`;

/**
 * A one-line list of what was bought, for the day book and the khata: "Silk saree, Cotton
 * cloth 2.5 Meter +2 more". Pieces of one are left as just the name.
 */
export const itemsSummary = (t, items, shown = 2) => {
  if (!Array.isArray(items) || !items.length) return null;
  const part = (i) => (i.unit === 'pcs' && Number(i.qty) === 1 ? i.name : `${i.name} ${formatQty(i.qty)} ${t(UNIT_LABELS[i.unit] ?? 'Pcs')}`);
  const head = items.slice(0, shown).map(part).join(', ');
  return items.length > shown ? `${head} ${t('+{n} more', { n: items.length - shown })}` : head;
};

/** The items on a bill, each tappable to change, with the running total under them. */
export const ItemList = ({ items, onEdit, onRemove, onAdd, error }) => {
  const t = useT();
  return (
    <View style={styles.block}>
      <Row style={styles.head}>
        <Caption style={[styles.label, error && { color: colors.danger }]}>{error ?? t('Items')}</Caption>
        {items.length ? <Caption style={styles.label}>{t('{n} items', { n: items.length })}</Caption> : null}
      </Row>
      {items.length ? (
        <Card padded={false}>
          {items.map((item, i) => (
            <View key={`${item.productId ?? 'typed'}-${i}`}>
              {i ? <Divider /> : null}
              <Touchable onPress={() => onEdit(i)} style={styles.row} accessibilityLabel={`${item.name} ${formatMoney(itemTotal(item))}`}>
                <View style={{ flex: 1 }}>
                  <Body numberOfLines={1}>{item.name}</Body>
                  <Caption>{lineDetail(t, item)}</Caption>
                </View>
                <Body style={type.money}>{formatMoney(itemTotal(item))}</Body>
                <Touchable onPress={() => onRemove(i)} accessibilityLabel={t('Remove {name}', { name: item.name })} style={styles.remove} hitSlop={8}>
                  <Ionicons name="close-circle-outline" size={20} color={colors.ink400} />
                </Touchable>
              </Touchable>
            </View>
          ))}
        </Card>
      ) : null}
      <Touchable onPress={onAdd} style={styles.add}>
        <Ionicons name="add-circle-outline" size={20} color={colors.accent700} />
        <Body strong style={{ color: colors.accent700 }}>{items.length ? t('Add another item') : t('Add items (what was bought)')}</Body>
      </Touchable>
    </View>
  );
};

/**
 * Adds or changes one line. The item can be picked from the store's products (needs the
 * internet) or typed in, which always works: a counter bill must never wait on a network.
 */
export const ItemSheet = ({ visible, item, onClose, onSave }) => {
  const t = useT();
  const { businessId } = useAuth();
  const [source, setSource] = useState('type');
  const [name, setName] = useState('');
  const [qty, setQty] = useState('1');
  const [unit, setUnit] = useState('pcs');
  const [price, setPrice] = useState('');
  const [productId, setProductId] = useState(null);
  const [errors, setErrors] = useState({});
  const search = useProductSearch(businessId, visible && source === 'products');

  useEffect(() => {
    if (!visible) return;
    setErrors({});
    setSource('type');
    setName(item?.name ?? '');
    setQty(item ? formatQty(item.qty) : '1');
    setUnit(item?.unit ?? 'pcs');
    setPrice(item ? String(toMajor(item.price)) : '');
    setProductId(item?.productId ?? null);
  }, [visible, item]);

  const pick = (product) => {
    setName(product.name ?? '');
    setPrice(product.price ? String(toMajor(product.price)) : '');
    setProductId(product.productId);
    setErrors({});
    setSource('type');
  };

  const parsedQty = QTY.test(qty.trim()) ? Number(qty.trim()) : null;
  const parsedPrice = priceField.safeParse(price);
  const preview = parsedQty && parsedPrice.success ? itemTotal({ qty: parsedQty, price: parsedPrice.data }) : null;

  const save = () => {
    const next = {};
    if (!parsedQty || parsedQty > BOOK_QTY_MAX) next.qty = t('Enter a quantity, like 1 or 2.5');
    if (!parsedPrice.success) next.price = t('Enter a price, like 250 or 99.50');
    if (Object.keys(next).length) { setErrors(next); return; }
    const line = { name, qty: parsedQty, unit, price: parsedPrice.data, ...(productId ? { productId } : {}) };
    const result = bookItemSchema.safeParse(line);
    if (!result.success) {
      const issues = Object.fromEntries(result.error.issues.map((i) => [i.path[0], i.message]));
      setErrors({
        ...(issues.name ? { name: t('Enter the item name') } : {}),
        ...(issues.qty ? { qty: t('Enter a quantity, like 1 or 2.5') } : {}),
        ...(issues.price ? { price: t('Enter a price, like 250 or 99.50') } : {}),
      });
      return;
    }
    onSave(result.data);
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={item ? t('Edit item') : t('Add item')}>
      <FilterChips
        options={[{ value: 'type', label: msg('Type item') }, { value: 'products', label: msg('From my products') }]}
        value={source}
        onChange={setSource}
        style={styles.source}
      />
      {source === 'products' ? (
        <>
          <SearchBar value={search.query} onChange={search.setQuery} placeholder={msg('Search products')} />
          {search.items.map((p) => (
            <Touchable key={p.productId} onPress={() => pick(p)} style={styles.pickRow}>
              <Body style={{ flex: 1 }} numberOfLines={2}>{p.name}</Body>
              <Caption>{formatMoney(p.price)}</Caption>
            </Touchable>
          ))}
          {search.loading ? <ActivityIndicator color={colors.accent600} style={{ marginVertical: space.md }} /> : null}
          {search.error ? (
            <>
              <Alert message={t('Could not load products. Check the internet, or type the item instead.')} />
              <Button title={t('Try again')} variant="secondary" onPress={search.retry} />
            </>
          ) : null}
          {!search.loading && !search.error && !search.items.length ? <Caption>{t('No products found. Type the item instead.')}</Caption> : null}
          {search.nextCursor && !search.error ? <Button title={t('Show more')} variant="ghost" loading={search.loading} onPress={search.loadMore} /> : null}
        </>
      ) : (
        <>
          <Field
            label={t('Item name')}
            value={name}
            onChangeText={(v) => { setName(v); setProductId(null); setErrors((e) => ({ ...e, name: undefined })); }}
            placeholder={t('Like Cotton saree, Shirt cloth')}
            maxLength={80}
            autoFocus={!item}
            error={errors.name}
          />
          <Row gap={space.sm} align="flex-start">
            <Field
              label={t('Quantity')}
              value={qty}
              onChangeText={(v) => { setQty(v); setErrors((e) => ({ ...e, qty: undefined })); }}
              keyboardType="decimal-pad"
              maxLength={10}
              containerStyle={{ flex: 1 }}
              error={errors.qty}
            />
            <Field
              label={t('Price per unit')}
              value={price}
              onChangeText={(v) => { setPrice(v); setErrors((e) => ({ ...e, price: undefined })); }}
              keyboardType="decimal-pad"
              prefix="₹"
              placeholder="0"
              maxLength={10}
              containerStyle={{ flex: 1.3 }}
              error={errors.price}
            />
          </Row>
          <Caption style={styles.label}>{t('Unit')}</Caption>
          <FilterChips options={BOOK_UNITS.map((u) => ({ value: u, label: UNIT_LABELS[u] }))} value={unit} onChange={setUnit} style={styles.units} />
          <Row style={styles.total}>
            <Body>{t('Item total')}</Body>
            <Body strong style={type.money}>{preview == null ? '—' : formatMoney(preview)}</Body>
          </Row>
          <Button title={item ? t('Update item') : t('Add to bill')} onPress={save} />
        </>
      )}
    </Sheet>
  );
};

const styles = StyleSheet.create({
  block: { marginBottom: space.md },
  head: { justifyContent: 'space-between', marginBottom: space.xs },
  label: { marginBottom: space.xs, color: colors.ink600 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingLeft: space.lg, paddingRight: space.sm, paddingVertical: space.md, minHeight: 56 },
  remove: { padding: space.xs },
  add: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md, minHeight: 48 },
  source: { marginBottom: space.md },
  units: { marginBottom: space.md },
  total: { justifyContent: 'space-between', paddingVertical: space.md, marginBottom: space.sm },
  pickRow: {
    flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, minHeight: 52,
    borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line,
  },
});
