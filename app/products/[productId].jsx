import { useState, useEffect } from 'react';
import { Alert as RNAlert, BackHandler, Image, Platform, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { formatMoney, discountPercent } from '@storekit/shared';
import { updateStockSchema, wholeNumberText } from '@storekit/validation';
import { Screen } from '../../src/components/Screen.jsx';
import {
  Alert, Body, Button, Caption, Card, Divider, ErrorState, Field, Figure, Heading, Pill, Row, Touchable,
} from '../../src/components/ui.jsx';
import { Thumb } from '../../src/components/domain.jsx';
import { Sheet } from '../../src/components/Sheet.jsx';
import { SkeletonCard } from '../../src/components/Skeleton.jsx';
import { ProductForm } from '../../src/components/ProductForm.jsx';
import { useToast } from '../../src/components/Toast.jsx';
import { useAuth } from '../../src/state/auth.jsx';
import { useT } from '../../src/state/locale.jsx';
import { useAction, useAsync } from '../../src/lib/useAsync.js';
import { categories as categoriesApi, products as productsApi } from '../../src/api/endpoints.js';
import { colors, radius, space, type } from '../../src/theme.js';

/**
 * Product detail, with editing in place.
 *
 * Stock gets its own quick action rather than living only in the edit form: "two more
 * arrived" is the single most common change a merchant makes, and it should not cost them
 * a full form and a save.
 */
export default function ProductDetail() {
  const { productId } = useLocalSearchParams();
  const router = useRouter();
  const navigation = useNavigation();
  const toast = useToast();
  const { businessId } = useAuth();
  const t = useT();

  const [editing, setEditing] = useState(false);
  const [stockSheet, setStockSheet] = useState(false);
  const [stockValue, setStockValue] = useState('');
  const [stockError, setStockError] = useState(null);
  const [stockMode, setStockMode] = useState('set');

  const { data: product, error, loading, refreshing, onRefresh, reload, setData } = useAsync(
    () => (businessId && productId ? productsApi.get(businessId, String(productId)) : Promise.resolve(null)),
    [businessId, productId],
  );

  const { data: categories } = useAsync(
    () => (businessId ? categoriesApi.list(businessId) : Promise.resolve(null)),
    [businessId],
  );

  const { run: save, pending: saving, error: saveError } = useAction(async (input) => {
    const updated = await productsApi.update(businessId, String(productId), input);
    setData(updated);
    setEditing(false);
    toast.success(t('Changes saved'));
  });

  const { run: adjustStock, pending: adjusting, error: adjustError, clearError: clearAdjustError } = useAction(async (payload) => {
    const updated = await productsApi.setStock(businessId, String(productId), payload);
    setData((prev) => ({ ...prev, stock: updated.stock ?? prev.stock }));
    setStockSheet(false);
    setStockValue('');
    toast.success(t('Stock updated'));
  });

  /**
   * "Add or remove" takes a signed delta; "set to" takes an absolute count. Neither
   * accepts anything but digits — a typo is shown back rather than read as zero.
   */
  const submitStock = () => {
    const parsed = wholeNumberText({
      label: stockMode === 'adjust' ? 'Change' : 'Stock',
      signed: stockMode === 'adjust',
      min: stockMode === 'adjust' ? -1_000_000 : 0,
    }).safeParse(stockValue);

    if (!parsed.success) {
      setStockError(parsed.error.issues[0].message);
      return;
    }

    const result = updateStockSchema.safeParse({
      operation: stockMode,
      value: parsed.data,
      reason: stockMode === 'adjust' ? 'restock' : 'correction',
    });

    if (!result.success) {
      setStockError(result.error.issues[0].message);
      return;
    }

    setStockError(null);
    adjustStock(result.data).catch(() => undefined);
  };

  const { run: toggleVisibility, pending: toggling } = useAction(async () => {
    const updated = await productsApi.update(businessId, String(productId), { active: !product.active });
    setData(updated);
    toast.success(updated.active ? t('Product is live') : t('Product hidden'));
  });

  // Reports success only once the API has actually deleted it: a failed request (offline, a
  // server error) says so and leaves the merchant on the product, which still exists.
  const { run: removeProduct, pending: removing } = useAction(async () => {
    await productsApi.remove(businessId, String(productId));
    toast.info(t('Product deleted'));
    router.back();
  });

  const confirmDelete = () =>
    RNAlert.alert(
      t('Delete this product?'),
      t('It will be removed from your store. Past orders keep their record of it.'),
      [
        { text: t('Keep'), style: 'cancel' },
        {
          text: t('Delete'),
          style: 'destructive',
          onPress: () =>
            removeProduct().catch((err) => toast.error(err?.message ?? t('Could not delete this product. Please try again.'))),
        },
      ],
    );

  const openStockSheet = () => {
    clearAdjustError();
    setStockError(null);
    setStockSheet(true);
  };

  // Editing is a mode of this screen, not a screen of its own, so Android's back button
  // would otherwise leave the product and throw the edits away. Back ends the edit instead.
  useEffect(() => {
    if (!editing) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setEditing(false);
      return true;
    });
    return () => sub.remove();
  }, [editing]);

  useEffect(() => {
    if (product) navigation.setOptions?.({ title: editing ? t('Edit product') : product.name });
  }, [product, editing, navigation, t]);

  if (loading && !product) {
    return (
      <Screen>
        <View style={styles.heroSkeleton} />
        <SkeletonCard lines={2} />
      </Screen>
    );
  }
  if (error && !product) return <ErrorState error={error} onRetry={reload} />;
  if (!product) return null;

  if (editing) {
    return (
      <Screen>
        <ProductForm
          businessId={businessId}
          initial={product}
          categories={categories?.items ?? []}
          submitting={saving}
          error={saveError}
          submitLabel={t('Save changes')}
          onSubmit={(input) => save(input).catch(() => undefined)}
        />
        <Button title={t('Cancel')} variant="ghost" onPress={() => setEditing(false)} />
      </Screen>
    );
  }

  const discount = discountPercent(product.price, product.mrp);
  const stockTone = product.stock === 0 ? 'red' : product.stock <= (product.lowStockThreshold ?? 5) ? 'amber' : 'green';

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={onRefresh}
      footer={
        <Row gap={space.sm}>
          <Button
            title={product.active ? t('Hide') : t('Make live')}
            variant="secondary"
            full={false}
            style={{ flex: 1 }}
            loading={toggling}
            onPress={() => toggleVisibility().catch((err) => toast.error(err?.message ?? t('Could not update this product. Please try again.')))}
          />
          <Button title={t('Edit')} full={false} style={{ flex: 1.4 }} onPress={() => setEditing(true)} />
        </Row>
      }
    >
      {/* A full-bleed hero image, with the rest of the gallery as a thumbnail strip beneath.
          A product a customer will judge on its photo deserves better than an 78px chip. */}
      <View style={styles.hero}>
        {product.images?.length ? (
          <Image source={{ uri: product.images[0].url ?? product.images[0].publicUrl }} style={styles.heroImage} resizeMode="cover" />
        ) : (
          <View style={styles.heroEmpty}>
            <Ionicons name="image-outline" size={40} color={colors.ink400} />
          </View>
        )}
        {!product.active ? (
          <View style={styles.heroHidden}>
            <Pill label={t('Hidden from store')} tone="slate" />
          </View>
        ) : null}
      </View>

      {product.images?.length > 1 ? (
        <Row gap={space.sm} style={styles.thumbs}>
          {product.images.slice(1, 5).map((image) => (
            <Thumb key={image.imageKey} uri={image.url ?? image.publicUrl} size={56} />
          ))}
        </Row>
      ) : null}

      <Heading style={styles.name}>{product.name}</Heading>
      <Row gap={space.sm} style={styles.priceRow} align="baseline">
        <Body style={styles.price}>{formatMoney(product.price)}</Body>
        {discount > 0 ? (
          <>
            <Caption style={styles.strike}>{formatMoney(product.mrp)}</Caption>
            <Pill label={t('{n}% off', { n: discount })} tone="green" />
          </>
        ) : null}
      </Row>

      <Row gap={space.sm} style={styles.pills}>
        <Pill label={product.active ? t('Live') : t('Hidden')} tone={product.active ? 'green' : 'slate'} />
        {product.featured ? <Pill label={t('Featured')} tone="accent" /> : null}
        {product.categoryName ? <Pill label={product.categoryName} tone="slate" /> : null}
      </Row>

      {/* Stock and orders as two mini-stats — the two numbers a merchant checks most. */}
      <Card style={styles.statsCard} padded={false}>
        <View style={styles.statCell}>
          <Row style={{ justifyContent: 'space-between' }} align="flex-start">
            <Caption>{t('In stock')}</Caption>
            {product.trackInventory ? (
              <View style={[styles.stockDot, { backgroundColor: stockTone === 'red' ? colors.danger : stockTone === 'amber' ? colors.warning : colors.success }]} />
            ) : null}
          </Row>
          <Figure style={styles.statValue}>{product.trackInventory ? product.stock : '∞'}</Figure>
          {/* With options, this total is the sum the API keeps of the variant rows — setting
              it here would be overwritten on the next recount, so the merchant is sent to
              the place the number actually comes from. */}
          {product.hasVariants ? (
            <Touchable onPress={() => setEditing(true)} haptics="tap" style={styles.updateLink}>
              <Ionicons name="layers-outline" size={14} color={colors.accent700} />
              <Caption style={styles.updateLinkText}>{t('Per option')}</Caption>
            </Touchable>
          ) : product.trackInventory ? (
            <Touchable onPress={openStockSheet} haptics="tap" style={styles.updateLink}>
              <Ionicons name="add-circle-outline" size={14} color={colors.accent700} />
              <Caption style={styles.updateLinkText}>{t('Update')}</Caption>
            </Touchable>
          ) : <Caption>{t('Not tracked')}</Caption>}
        </View>
        <View style={styles.statSplit} />
        <View style={styles.statCell}>
          <Caption>{t('Orders')}</Caption>
          <Figure style={styles.statValue}>{product.orderCount ?? 0}</Figure>
          <Caption>{t('all time')}</Caption>
        </View>
      </Card>

      {product.description ? (
        <Card style={styles.card}>
          <Body strong>{t('Description')}</Body>
          <Divider style={styles.innerDivider} />
          <Body muted>{product.description}</Body>
        </Card>
      ) : null}

      {product.variants?.length ? (
        <Card style={styles.card} padded={false}>
          <View style={styles.cardHead}><Body strong>{t('Options')}</Body></View>
          {product.variants.map((variant, index) => (
            <View key={variant.variantId}>
              {index > 0 ? <Divider /> : null}
              <Row style={styles.variantRow}>
                <Body style={{ flex: 1 }}>
                  {Object.values(variant.attributes ?? {}).join(' · ')}
                </Body>
                <Body style={type.money}>{formatMoney(variant.price)}</Body>
                <Caption>{t('{n} left', { n: variant.stock })}</Caption>
              </Row>
            </View>
          ))}
        </Card>
      ) : null}

      {product.sku ? (
        <Card style={styles.card}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Caption>SKU</Caption>
            <Body selectable style={type.money}>{product.sku}</Body>
          </Row>
        </Card>
      ) : null}

      <Touchable onPress={confirmDelete} disabled={removing} style={styles.deleteRow} accessibilityLabel={t('Delete product')}>
        <Ionicons name="trash-outline" size={18} color={colors.danger} />
        <Body style={{ color: colors.danger }}>{removing ? t('Deleting…') : t('Delete this product')}</Body>
      </Touchable>

      <Sheet visible={stockSheet} onClose={() => setStockSheet(false)} title={t('Update stock')}>
        <Alert message={adjustError?.message} />
        <Row gap={space.sm} style={styles.modeRow}>
          {[
            { value: 'set', label: t('Set to') },
            { value: 'adjust', label: t('Add or remove') },
          ].map((mode) => (
            <Touchable
              key={mode.value}
              onPress={() => { setStockMode(mode.value); setStockError(null); }}
              style={[styles.mode, stockMode === mode.value && styles.modeActive]}
            >
              <Body style={[type.label, stockMode === mode.value && { color: '#ffffff' }]}>{mode.label}</Body>
            </Touchable>
          ))}
        </Row>
        <Field
          label={stockMode === 'set' ? t('New stock count') : t('Change by')}
          value={stockValue}
          onChangeText={(v) => { setStockValue(v); setStockError(null); }}
          // 'numbers-and-punctuation' is iOS only; Android's 'numeric' pad is the one with a minus key.
          keyboardType={stockMode === 'adjust' ? Platform.select({ ios: 'numbers-and-punctuation', default: 'numeric' }) : 'number-pad'}
          placeholder={stockMode === 'adjust' ? t('Enter amount (use − to remove)') : t('Enter new stock count')}
          autoFocus
          maxLength={8}
          error={stockError}
          hint={stockMode === 'adjust' ? t('Applied to the current count, so two devices cannot overwrite each other.') : undefined}
        />
        <Button
          title={t('Update stock')}
          loading={adjusting}
          onPress={submitStock}
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    height: 280,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.sunken,
    marginBottom: space.md,
  },
  heroImage: { width: '100%', height: '100%' },
  heroEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heroHidden: { position: 'absolute', top: space.md, left: space.md },
  heroSkeleton: { height: 280, borderRadius: radius.lg, backgroundColor: colors.ink200, marginBottom: space.lg },
  thumbs: { marginBottom: space.lg },

  name: { fontSize: 21 },
  priceRow: { marginTop: space.sm },
  price: { ...type.figure, fontSize: 26, color: colors.ink900 },
  strike: { textDecorationLine: 'line-through', color: colors.ink400 },
  pills: { marginTop: space.md, flexWrap: 'wrap' },

  statsCard: { marginTop: space.lg, flexDirection: 'row' },
  statCell: { flex: 1, padding: space.lg, gap: 4 },
  statValue: { fontSize: 26, marginTop: 2 },
  statSplit: { width: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  stockDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  updateLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  updateLinkText: { color: colors.accent700 },

  card: { marginTop: space.lg },
  cardHead: { padding: space.lg, paddingBottom: space.md },
  innerDivider: { marginVertical: space.md },
  variantRow: { padding: space.lg, gap: space.md },

  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingVertical: space.xl,
    marginTop: space.lg,
  },

  modeRow: { marginBottom: space.lg },
  mode: {
    flex: 1,
    paddingVertical: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  modeActive: { backgroundColor: colors.ink900, borderColor: colors.ink900 },
});
