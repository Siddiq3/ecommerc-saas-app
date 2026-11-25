import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as Print from 'expo-print';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../src/components/Screen.jsx';
import { Alert, Body, Button, Caption, Divider, EmptyState, Loading, Row, Touchable } from '../../src/components/ui.jsx';
import { SearchBar } from '../../src/components/Filters.jsx';
import { scanCardHtml } from '../../src/lib/labels.js';
import { lineFor } from '../../src/lib/productCache.js';
import { formatMoney } from '../../src/lib/format.js';
import { useAuth } from '../../src/state/auth.jsx';
import { useBook, useBookQuery } from '../../src/state/book.jsx';
import { useT } from '../../src/state/locale.jsx';
import { colors, space } from '../../src/theme.js';

const key = (r) => `${r.productId}#${r.variantId}`;

/**
 * Counter scan card: an A4 page of products with their price and barcode. A shop whose items have no barcode (loose
 * clothes, sweets) keeps it by the counter and scans the item off the card. Built from the phone's products copy, so
 * it opens offline too.
 */
export default function ScanCard() {
  const t = useT();
  const { business } = useAuth();
  const book = useBook();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState(null); // Set of keys; null: everything
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { book?.refreshCatalog(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useBookQuery((db) => db.getAllAsync('SELECT * FROM catalog WHERE sku IS NOT NULL ORDER BY name, sortOrder'), []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter((r) => !q || `${r.name} ${r.label ?? ''} ${r.sku}`.toLowerCase().includes(q));
  }, [rows, query]);
  const chosen = (rows ?? []).filter((r) => (picked ? picked.has(key(r)) : true));

  const toggle = (r) => setPicked((p) => {
    const next = new Set(p ?? (rows ?? []).map(key));
    if (next.has(key(r))) next.delete(key(r)); else next.add(key(r));
    return next;
  });

  const print = async () => {
    setPrinting(true);
    setError(null);
    try {
      await Print.printAsync({
        html: scanCardHtml({
          store: business?.name ?? '',
          title: t('Scan card: scan an item from here at the counter'),
          rows: chosen.map((r) => ({ name: r.name, size: r.label, price: formatMoney(r.price), code: r.sku })),
        }),
      });
    } catch (e) {
      if (!/cancel/i.test(String(e?.message))) setError(t('Could not print. Please try again.'));
    } finally {
      setPrinting(false);
    }
  };

  if (rows === undefined) return <Screen><Loading /></Screen>;

  return (
    <Screen
      footer={rows.length ? (
        <Button title={t('Print scan card ({n})', { n: chosen.length })} disabled={!chosen.length} loading={printing} onPress={print}
          icon={<Ionicons name="print-outline" size={18} color="#ffffff" />} />
      ) : null}
    >
      {!rows.length ? (
        <EmptyState icon="barcode-outline" title={t('No item codes yet')}
          message={t('Products get a code when they are saved. Add or edit a product, then come back.')} />
      ) : (
        <>
          <Caption style={styles.hint}>{t('For items without a barcode: print this page, keep it at the counter and scan from it.')}</Caption>
          <SearchBar value={query} onChange={setQuery} placeholder={t('Search products')} />
          <Row style={styles.bar}>
            <Caption style={{ flex: 1 }}>{t('{n} chosen', { n: chosen.length })}</Caption>
            <Touchable onPress={() => setPicked(picked && picked.size === 0 ? null : new Set())} style={styles.all}>
              <Caption style={styles.allText}>{picked && picked.size === 0 ? t('Choose all') : t('Clear')}</Caption>
            </Touchable>
          </Row>
          {error ? <Alert message={error} /> : null}
          <View>
            {shown.map((r, i) => {
              const on = picked ? picked.has(key(r)) : true;
              return (
                <View key={key(r)}>
                  {i ? <Divider /> : null}
                  <Touchable onPress={() => toggle(r)} style={styles.row} accessibilityLabel={lineFor(r).name} accessibilityState={{ checked: on }}>
                    <Ionicons name={on ? 'checkbox' : 'square-outline'} size={24} color={on ? colors.accent600 : colors.ink400} />
                    <View style={{ flex: 1 }}>
                      <Body numberOfLines={1}>{lineFor(r).name}</Body>
                      <Caption style={styles.code}>{r.sku}</Caption>
                    </View>
                    <Caption>{formatMoney(r.price)}</Caption>
                  </Touchable>
                </View>
              );
            })}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hint: { marginBottom: space.md, color: colors.ink600 },
  bar: { alignItems: 'center', marginVertical: space.sm },
  all: { paddingHorizontal: space.md, paddingVertical: space.sm },
  allText: { color: colors.accent700 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, minHeight: 56 },
  code: { color: colors.ink500, letterSpacing: 0.3 },
});
