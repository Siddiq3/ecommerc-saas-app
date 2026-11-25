import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { BOOK_QTY_MAX, BOOK_UNITS, bookItemSchema, itemTotal, rupeesText } from '@storeflick/validation';
import { normalizeItemCode, toMajor } from '@storeflick/shared';
import { Alert, Body, Button, Caption, Card, Divider, Field, Label, Row, Touchable } from './ui.jsx';
import { FilterChips, SearchBar } from './Filters.jsx';
import { Sheet } from './Sheet.jsx';
import { msg } from '../lib/i18n.js';
import { formatMoney } from '../lib/format.js';
import { useProductSearch } from '../lib/useProductSearch.js';
import { products } from '../api/endpoints.js';
import { findByCode, lineFor, lookupCode, suggest } from '../lib/productCache.js';
import { useBook } from '../state/book.jsx';

/** "M / Red" from a variant's attributes ({ Size: 'M', Colour: 'Red' }). */
const variantLabel = (v) => Object.values(v.attributes ?? {}).join(' / ') || v.sku || '—';
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
        <Label style={[styles.label, error && { color: colors.danger }]}>{error ?? t('Items')}</Label>
        {items.length ? <Caption style={styles.count}>{t(items.length === 1 ? '{n} item' : '{n} items', { n: items.length })}</Caption> : null}
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
        <Body strong style={{ color: colors.accent700, flex: 1 }}>{items.length ? t('Add another item') : t('Add items (what was bought)')}</Body>
      </Touchable>
    </View>
  );
};

/**
 * Adds or changes one line. The item can be picked from the store's products (needs the
 * internet) or typed in, which always works: a counter bill must never wait on a network.
 */
export const ItemSheet = ({ visible, item, onClose, onSave, onQuickAdd, onScan }) => {
  const t = useT();
  const router = useRouter();
  const { businessId } = useAuth();
  const { db } = useBook() ?? {};
  const [source, setSource] = useState('type');
  const [name, setName] = useState('');
  const [qty, setQty] = useState('1');
  const [unit, setUnit] = useState('pcs');
  const [price, setPrice] = useState('');
  const [productId, setProductId] = useState(null);
  // A product sold in sizes or colours: the bill must say which, so its stock can come off.
  const [variants, setVariants] = useState(null); // null: not a variant product; []: loading
  const [variantId, setVariantId] = useState(null);
  const [baseName, setBaseName] = useState('');
  const [errors, setErrors] = useState({});
  const search = useProductSearch(businessId, visible && source === 'products');

  // Billing by item code: each code typed (or sent by a USB/Bluetooth scanner, which types and presses Enter) puts
  // its item on the bill at once, or one more of it, and the box clears for the next. The keyboard stays up.
  const quick = Boolean(onQuickAdd) && !item && Boolean(db);
  const [code, setCode] = useState('');
  const [hints, setHints] = useState([]);
  const [codeNote, setCodeNote] = useState(null); // { added } | { missing, offline }
  const typing = useRef(0);

  const addRow = (row) => {
    const line = lineFor(row);
    onQuickAdd(line);
    setCode('');
    setHints([]);
    setCodeNote({ added: line.name });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  };

  const onCode = (text) => {
    setCode(text);
    setCodeNote(null);
    const id = ++typing.current;
    if (!text.trim()) { setHints([]); return; }
    suggest(db, text).then(async (list) => {
      if (id !== typing.current) return;
      setHints(list);
      // A whole code that no other code starts with is added without pressing Enter.
      const exact = await findByCode(db, text);
      const key = normalizeItemCode(text);
      if (id === typing.current && exact && list.filter((r) => r.sku?.startsWith(key)).length === 1) addRow(exact);
    }).catch(() => undefined);
  };

  const submitCode = async () => {
    const text = code.trim();
    if (!text) return;
    const id = ++typing.current;
    const found = await lookupCode(db, products, businessId, text);
    if (id !== typing.current) return;
    if (found.row) { addRow(found.row); return; }
    setHints([]);
    if (found.needsSize) {
      // A code on the whole product of something sold in sizes: the size has to be chosen.
      setCode('');
      pick(found.needsSize);
      return;
    }
    setCodeNote({ missing: normalizeItemCode(text), offline: Boolean(found.offline) });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
  };

  useEffect(() => {
    if (!visible) return;
    setErrors({});
    setSource('type');
    setName(item?.name ?? '');
    setQty(item ? formatQty(item.qty) : '1');
    setUnit(item?.unit ?? 'pcs');
    setPrice(item ? String(toMajor(item.price)) : '');
    setProductId(item?.productId ?? null);
    setVariantId(item?.variantId ?? null);
    setVariants(null);
    setCode('');
    setHints([]);
    setCodeNote(null);
  }, [visible, item]);

  const pick = (product) => {
    setName(product.name ?? '');
    setBaseName(product.name ?? '');
    setPrice(product.price ? String(toMajor(product.price)) : '');
    setProductId(product.productId);
    setVariantId(null);
    setVariants(product.hasVariants ? [] : null);
    setErrors({});
    setSource('type');
    if (product.hasVariants) {
      products.get(businessId, product.productId)
        .then((full) => setVariants(full.variants ?? []))
        .catch(() => setVariants(null));
    }
  };

  const pickVariant = (v) => {
    setVariantId(v.variantId);
    setName(`${baseName} (${variantLabel(v)})`.slice(0, 80));
    if (v.price) setPrice(String(toMajor(v.price)));
    setErrors((e) => ({ ...e, variant: undefined }));
  };

  const parsedQty = QTY.test(qty.trim()) ? Number(qty.trim()) : null;
  const parsedPrice = priceField.safeParse(price);
  const preview = parsedQty && parsedPrice.success ? itemTotal({ qty: parsedQty, price: parsedPrice.data }) : null;

  const save = () => {
    const next = {};
    if (!parsedQty || parsedQty > BOOK_QTY_MAX) next.qty = t('Enter a quantity, like 1 or 2.5');
    if (!parsedPrice.success) next.price = t('Enter a price, like 250 or 99.50');
    if (variants?.length && !variantId) next.variant = t('Choose the size or colour');
    if (Object.keys(next).length) { setErrors(next); return; }
    const line = { name, qty: parsedQty, unit, price: parsedPrice.data, ...(productId ? { productId } : {}), ...(productId && variantId ? { variantId } : {}) };
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
      {quick ? (
        <>
          <Field latin voice={false}
            label={t('Item code')}
            value={code}
            onChangeText={onCode}
            onSubmitEditing={submitCode}
            submitBehavior="submit"
            returnKeyType="done"
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            maxLength={64}
            placeholder={t('Like KUR-M-001')}
            containerStyle={styles.codeField}
          />
          {hints.map((row) => (
            <Touchable key={`${row.productId}#${row.variantId}`} onPress={() => addRow(row)} style={styles.pickRow}
              accessibilityLabel={lineFor(row).name}>
              <View style={{ flex: 1 }}>
                <Body numberOfLines={1}>{lineFor(row).name}</Body>
                {row.sku ? <Caption style={styles.code}>{row.sku}</Caption> : null}
              </View>
              <Caption>{formatMoney(row.price)}</Caption>
            </Touchable>
          ))}
          {codeNote?.added ? (
            <Row gap={space.sm} style={styles.added}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <Caption style={{ color: colors.success, flex: 1 }} numberOfLines={1}>{t('Added: {name}', { name: codeNote.added })}</Caption>
            </Row>
          ) : null}
          {codeNote?.missing ? (
            <CodeNotFound code={codeNote.missing} offline={codeNote.offline}
              onNewProduct={() => { onClose(); router.push({ pathname: '/products/new', params: { sku: codeNote.missing } }); }}
              onType={() => { setCodeNote(null); setCode(''); setSource('type'); }} />
          ) : null}
        </>
      ) : null}
      <FilterChips
        options={[
          { value: 'type', label: msg('Type item') },
          { value: 'products', label: msg('From my products') },
          ...(onScan && !item ? [{ value: 'scan', label: msg('Scan') }] : []),
        ]}
        value={source}
        onChange={(v) => (v === 'scan' ? onScan() : setSource(v))}
        style={styles.source}
      />
      {source === 'products' ? (
        <>
          <SearchBar value={search.query} onChange={search.setQuery} placeholder={msg('Search products')} />
          {search.items.map((p) => (
            <Touchable key={p.productId} onPress={() => pick(p)} style={styles.pickRow}>
              <View style={{ flex: 1 }}>
                <Body numberOfLines={2}>{p.name}</Body>
                {p.sku ? <Caption style={styles.code}>{p.sku}</Caption> : null}
              </View>
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
            onChangeText={(v) => { setName(v); setProductId(null); setVariantId(null); setVariants(null); setErrors((e) => ({ ...e, name: undefined })); }}
            placeholder={t('Like Cotton saree, Shirt cloth')}
            maxLength={80}
            autoFocus={!item && !quick}
            error={errors.name}
          />
          {variants ? (
            <>
              <Label style={[styles.variantLabel, errors.variant && { color: colors.danger }]}>{errors.variant ?? t('Size or colour')}</Label>
              {variants.length ? (
                <FilterChips options={variants.map((v) => ({ value: v.variantId, label: variantLabel(v) }))} value={variantId}
                  onChange={(id) => pickVariant(variants.find((v) => v.variantId === id))} style={styles.units} />
              ) : <ActivityIndicator color={colors.accent600} style={{ marginBottom: space.md }} />}
            </>
          ) : null}
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

/**
 * A code no product has: add it as a new product (the code already filled in), or type the item onto this bill. Offline,
 * only this phone's copy was searched, so it says so.
 */
export const CodeNotFound = ({ code, offline, onNewProduct, onType, dark = false }) => {
  const t = useT();
  return (
    <View style={[styles.missing, dark && styles.missingDark]}>
      <Body strong style={dark ? { color: '#ffffff' } : null}>{t('Code not found: {code}', { code })}</Body>
      {offline ? (
        <Caption style={[styles.missingNote, dark && { color: '#e4e4e7' }]}>
          {t('Not on this phone yet. Connect to the internet to look it up, or type the item.')}
        </Caption>
      ) : null}
      <Row gap={space.sm} style={{ marginTop: space.md }}>
        <Button title={t('Add as new product')} size="sm" full={false} style={{ flex: 1 }} onPress={onNewProduct} />
        <Button title={t('Type item')} size="sm" variant="secondary" full={false} style={{ flex: 1 }} onPress={onType} />
      </Row>
    </View>
  );
};

const styles = StyleSheet.create({
  codeField: { marginBottom: space.sm },
  code: { color: colors.ink500, fontVariant: ['tabular-nums'], letterSpacing: 0.3 },
  added: { paddingVertical: space.sm, marginBottom: space.sm },
  missing: { padding: space.lg, borderRadius: 18, backgroundColor: colors.warningTint, marginBottom: space.md },
  missingDark: { backgroundColor: 'rgba(24,24,27,0.92)' },
  missingNote: { marginTop: space.xs, color: colors.ink600 },
  block: { marginBottom: space.md },
  head: { justifyContent: 'space-between', marginBottom: space.xs },
  /** Matches the label above a text field (ui.jsx fieldLabel), like every group label in the form. */
  label: { marginBottom: 10, color: colors.ink700 },
  count: { marginBottom: 10, color: colors.ink600 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingLeft: space.lg, paddingRight: space.sm, paddingVertical: space.md, minHeight: 56 },
  remove: { padding: space.xs },
  add: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md, minHeight: 48 },
  source: { marginBottom: space.md },
  variantLabel: { marginBottom: 10, color: colors.ink700 },
  units: { marginBottom: space.md },
  total: { justifyContent: 'space-between', paddingVertical: space.md, marginBottom: space.sm },
  pickRow: {
    flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, minHeight: 52,
    borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line,
  },
});
