import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as Print from 'expo-print';
import { Ionicons } from '@expo/vector-icons';
import { Alert, Body, Button, Caption, Field, Row, Touchable } from './ui.jsx';
import { FilterChips } from './Filters.jsx';
import { Sheet } from './Sheet.jsx';
import { labelsHtml } from '../lib/labels.js';
import { sizeLabel } from '../lib/productCache.js';
import { formatMoney } from '../lib/format.js';
import { msg } from '../lib/i18n.js';
import { useAuth } from '../state/auth.jsx';
import { useT } from '../state/locale.jsx';
import { colors, space } from '../theme.js';

const LAYOUT_CHIPS = [
  { value: 'a4-65', label: msg('A4 sheet (65 labels)') },
  { value: 'thermal-50x25', label: msg('Label printer (50×25 mm)') },
];

/** What can carry a label: the sizes of a product sold in sizes, or the product itself. Only things with a code. */
const printable = (product) => {
  const sizes = product?.variants ?? [];
  if (sizes.length) {
    return sizes.map((v) => ({ id: v.variantId, size: sizeLabel(v.attributes), price: v.price || product.price, code: v.sku }));
  }
  return [{ id: product?.productId, size: '', price: product?.price, code: product?.sku }];
};

/**
 * Print barcode labels for one product: pick the sizes and how many of each, and a layout (an A4 sticker sheet or a
 * thermal label printer). Opens the phone's print dialog, which also saves a PDF.
 */
export const LabelSheet = ({ visible, product, onClose }) => {
  const t = useT();
  const { business } = useAuth();
  const [chosen, setChosen] = useState({}); // id → copies text
  const [layout, setLayout] = useState('a4-65');
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState(null);
  const rows = product ? printable(product) : [];
  const withCode = rows.filter((r) => r.code);

  useEffect(() => {
    if (visible) { setChosen(Object.fromEntries(withCode.map((r) => [r.id, '1']))); setError(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, product?.productId]);

  const labels = withCode
    .filter((r) => chosen[r.id] !== undefined)
    .map((r) => ({ name: product.name, size: r.size, price: formatMoney(r.price), code: r.code, copies: Number(chosen[r.id]) || 0 }))
    .filter((l) => l.copies > 0);
  const total = labels.reduce((n, l) => n + l.copies, 0);

  const print = async () => {
    setPrinting(true);
    setError(null);
    try {
      await Print.printAsync({ html: labelsHtml({ store: business?.name ?? '', labels, layout }) });
    } catch (e) {
      if (!/cancel/i.test(String(e?.message))) setError(t('Could not print. Please try again.'));
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={t('Print labels')}>
      {!withCode.length ? (
        <Alert message={t('This product has no item code yet. Edit and save it to make one.')} />
      ) : (
        <>
          <Caption style={styles.hint}>{t('Choose what to label and how many of each.')}</Caption>
          {withCode.map((r) => {
            const on = chosen[r.id] !== undefined;
            return (
              <Row key={r.id} gap={space.sm} style={styles.row}>
                <Touchable onPress={() => setChosen((c) => {
                  const next = { ...c };
                  if (on) delete next[r.id]; else next[r.id] = '1';
                  return next;
                })} style={styles.check} accessibilityLabel={r.size || product.name} accessibilityState={{ checked: on }}>
                  <Ionicons name={on ? 'checkbox' : 'square-outline'} size={24} color={on ? colors.accent600 : colors.ink400} />
                  <View style={{ flex: 1 }}>
                    <Body numberOfLines={1}>{r.size || product.name}</Body>
                    <Caption style={styles.code}>{r.code}</Caption>
                  </View>
                </Touchable>
                <Field voice={false} accessibilityLabel={t('Copies of {name}', { name: r.size || product.name })}
                  value={chosen[r.id] ?? ''} editable={on} keyboardType="number-pad" maxLength={3}
                  onChangeText={(v) => setChosen((c) => ({ ...c, [r.id]: v.replace(/\D/g, '') }))}
                  containerStyle={styles.copies} />
              </Row>
            );
          })}
          <Caption style={styles.layoutLabel}>{t('Paper')}</Caption>
          <FilterChips options={LAYOUT_CHIPS} value={layout} onChange={setLayout} style={{ marginBottom: space.md }} />
          {error ? <Alert message={error} /> : null}
          <Button title={total === 1 ? t('Print 1 label') : t('Print {n} labels', { n: total })} disabled={!total}
            loading={printing} onPress={print} icon={<Ionicons name="print-outline" size={18} color="#ffffff" />} />
        </>
      )}
    </Sheet>
  );
};

const styles = StyleSheet.create({
  hint: { marginBottom: space.sm, color: colors.ink600 },
  row: { alignItems: 'center', paddingVertical: space.xs },
  check: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 },
  code: { color: colors.ink500, letterSpacing: 0.3 },
  copies: { width: 84, marginBottom: 0 },
  layoutLabel: { marginTop: space.md, marginBottom: space.xs },
});
