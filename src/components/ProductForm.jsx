import { useState } from 'react';
import { Alert as RNAlert, Image, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatMoney, toMajor } from '@storekit/shared';
import { createProductSchema, rupeesText, updateProductSchema, wholeNumberText } from '@storekit/validation';
import {
  Alert, Body, Button, Caption, Card, Field, Heading, Row, Toggle, Touchable,
} from './ui.jsx';
import { Sheet } from './Sheet.jsx';
import { VariantEditor, optionsFromVariants, parseValues } from './VariantEditor.jsx';
import { FadeIn } from './motion.jsx';
import { pickImage, takePhoto, uploadImage } from '../lib/upload.js';
import { check, mergeErrors } from '../lib/validation.js';
import { colors, radius, shadow, space, type } from '../theme.js';

/**
 * The product form, shared by create and edit.
 *
 * Structured as a guided creation flow, not a database form: a live product card sits at
 * the top and updates as the merchant types, so they are always looking at what a customer
 * will see rather than a column of inputs. The fields underneath are grouped into the four
 * decisions a merchant actually makes — what it is, what it costs, how many there are, and
 * whether it is visible — each with its own heading.
 *
 * Every field is validated with the schema the API enforces, and nothing is rewritten to
 * make it pass: "1,299" in the price field is shown back with an explanation, not silently
 * turned into 1299; "abc" in stock is an error, not a stock level of zero.
 *
 * Prices are typed in rupees and converted to integer paise by `rupeesText`, which uses
 * string arithmetic — so 4.35 is 435 paise, not the 434 that `Math.round(4.35 * 100)`
 * gives. Everything below this form is integer paise.
 */

const priceField = rupeesText('Price');
const mrpField = rupeesText('MRP');
const stockField = wholeNumberText({ label: 'Stock' });
const thresholdField = wholeNumberText({ label: 'Warning level', max: 10_000 });

/** Parses a rupee string to paise for the live preview, or null if not yet valid. */
const previewPaise = (text) => {
  const result = rupeesText().safeParse(text);
  return result.success ? result.data : null;
};

/** A section heading with an optional caption, so each group reads as a deliberate step. */
const FormSection = ({ title, hint, children, delay = 0 }) => (
  <FadeIn delay={delay} style={styles.section}>
    <Heading style={styles.sectionTitle}>{title}</Heading>
    {hint ? <Caption style={styles.sectionHint}>{hint}</Caption> : null}
    {children}
  </FadeIn>
);

/**
 * The live product card. This is the same shape a customer meets in the storefront grid,
 * so what the merchant builds and what the shopper sees are one thing.
 */
const ProductPreview = ({ name, image, price, mrp, stock, trackInventory, active }) => {
  const p = previewPaise(price);
  const m = previewPaise(mrp);
  const off = p && m && m > p ? Math.round((1 - p / m) * 100) : 0;
  const stockNum = Number.parseInt(stock, 10);
  const stockState = !trackInventory
    ? { text: 'Made to order', color: colors.ink500 }
    : Number.isNaN(stockNum) || stockNum < 0
      ? null
      : stockNum === 0
        ? { text: 'Out of stock', color: colors.danger }
        : { text: `${stockNum} in stock`, color: colors.success };

  return (
    <View style={styles.preview}>
      <View style={styles.previewImage}>
        {image ? (
          <Image source={{ uri: image }} style={styles.previewImageInner} resizeMode="cover" />
        ) : (
          <Ionicons name="image-outline" size={26} color={colors.ink400} />
        )}
        {!active ? (
          <View style={styles.previewHidden}>
            <Caption style={styles.previewHiddenText}>Hidden</Caption>
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1 }}>
        <Body strong numberOfLines={1} style={!name && styles.previewPlaceholder}>
          {name.trim() || 'Product name'}
        </Body>
        <Row gap={space.sm} style={{ marginTop: 4 }}>
          <Body style={styles.previewPrice}>{p != null ? formatMoney(p) : '₹—'}</Body>
          {off > 0 ? <Caption style={styles.previewStrike}>{formatMoney(m)}</Caption> : null}
          {off > 0 ? <Caption style={styles.previewOff}>{off}% off</Caption> : null}
        </Row>
        {stockState ? (
          <Row gap={6} style={{ marginTop: 6 }}>
            {trackInventory ? <View style={[styles.previewDot, { backgroundColor: stockState.color }]} /> : null}
            <Caption style={{ color: stockState.color }}>{stockState.text}</Caption>
          </Row>
        ) : null}
      </View>
    </View>
  );
};

/** Parses one text field, recording its error under `key`. */
const parseInto = (schema, value, key, errors) => {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  errors[key] = result.error.issues[0].message;
  return undefined;
};
export const ProductForm = ({ businessId, initial, categories = [], onSubmit, submitting, error, submitLabel }) => {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [price, setPrice] = useState(initial?.price ? String(toMajor(initial.price)) : '');
  const [mrp, setMrp] = useState(initial?.mrp ? String(toMajor(initial.mrp)) : '');
  const [sku, setSku] = useState(initial?.sku ?? '');
  const [stock, setStock] = useState(String(initial?.stock ?? 0));
  const [lowStockThreshold, setLowStockThreshold] = useState(String(initial?.lowStockThreshold ?? 5));
  const [trackInventory, setTrackInventory] = useState(initial?.trackInventory ?? true);
  const [active, setActive] = useState(initial?.active ?? true);
  const [featured, setFeatured] = useState(initial?.featured ?? false);
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? null);
  const [errors, setErrors] = useState({});
  const [images, setImages] = useState(initial?.images ?? []);

  // Options come from the product when it has them, and are reconstructed from the variants
  // themselves when it does not — a product created through the API carries the rows but
  // not necessarily the option list that produced them.
  const [hasVariants, setHasVariants] = useState((initial?.variants?.length ?? 0) > 0);
  const [variantOptions, setVariantOptions] = useState(() => {
    const saved = (initial?.variantOptions ?? []).map((option) => ({
      name: option.name,
      values: (option.values ?? []).join(', '),
    }));
    return saved.length ? saved : optionsFromVariants(initial?.variants);
  });
  const [variantRows, setVariantRows] = useState(() =>
    (initial?.variants ?? [])
      .slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((variant) => ({
        variantId: variant.variantId,
        attributes: variant.attributes ?? {},
        price: variant.price != null ? String(toMajor(variant.price)) : '',
        stock: String(variant.stock ?? 0),
        sku: variant.sku,
        active: variant.active ?? true,
        sortOrder: variant.sortOrder ?? 0,
      })));

  const [pickerOpen, setPickerOpen] = useState(false);
  const [categorySheet, setCategorySheet] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const addImage = async (source) => {
    setPickerOpen(false);
    setUploadError(null);
    try {
      const asset = source === 'camera' ? await takePhoto() : await pickImage();
      if (!asset) return;

      setUploading(true);
      const uploaded = await uploadImage(businessId, asset, { purpose: 'product', productId: initial?.productId });
      setImages((prev) => [
        ...prev,
        { imageKey: uploaded.imageKey, publicUrl: uploaded.publicUrl, sortOrder: prev.length },
      ]);
    } catch (err) {
      setUploadError(err?.message ?? 'That image could not be added.');
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (imageKey) =>
    RNAlert.alert('Remove this image?', undefined, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          setImages((prev) => prev.filter((img) => img.imageKey !== imageKey).map((img, i) => ({ ...img, sortOrder: i }))),
      },
    ]);

  const submit = () => {
    const textErrors = {};
    const payload = {
      name,
      price: parseInto(priceField, price, 'price', textErrors),
      trackInventory,
      active,
      featured,
      categoryId: categoryId ?? null,
      images: images.map(({ imageKey, sortOrder }) => ({ imageKey, sortOrder })),
    };
    // Optional fields are omitted when blank: an empty MRP means "no strike-through
    // price", which is absence, not a price of zero.
    if (description.trim()) payload.description = description;
    if (sku.trim()) payload.sku = sku;
    if (mrp.trim()) payload.mrp = parseInto(mrpField, mrp, 'mrp', textErrors);
    const usingVariants = hasVariants && variantRows.length > 0;

    if (usingVariants) {
      // The API derives the parent stock from the rows, so sending our own would be a second
      // opinion it is going to overrule anyway. `variantOptions` is sent alongside so the
      // storefront can render the pickers in the merchant's order rather than guessing.
      payload.variantOptions = variantOptions
        .filter((option) => option.name.trim() && parseValues(option.values).length)
        .map((option) => ({ name: option.name.trim(), values: parseValues(option.values) }));
      payload.variants = variantRows.map((row, index) => {
        const variant = {
          attributes: row.attributes,
          price: parseInto(priceField, String(row.price ?? ''), `variant.${index}.price`, textErrors),
          stock: parseInto(stockField, String(row.stock ?? ''), `variant.${index}.stock`, textErrors),
          active: row.active !== false,
          sortOrder: index,
        };
        // Only on rows that already exist server-side: sending an id the store never issued
        // is rejected, and omitting it on a new row is how one gets created.
        if (row.variantId) variant.variantId = row.variantId;
        if (row.sku) variant.sku = row.sku;
        return variant;
      });
    } else {
      // Explicitly empty rather than omitted: on an edit this is how a merchant who turned
      // options off gets their variants actually removed.
      payload.variantOptions = [];
      payload.variants = [];
      if (trackInventory) {
        payload.stock = parseInto(stockField, stock, 'stock', textErrors);
        payload.lowStockThreshold = parseInto(thresholdField, lowStockThreshold, 'lowStockThreshold', textErrors);
      }
    }

    // The assembled payload goes through the API's own schema, which adds the rules that
    // span fields — an MRP below the price, a duplicate variant.
    const result = check(initial ? updateProductSchema : createProductSchema, payload);
    const combined = { ...result.errors, ...textErrors };
    setErrors(combined);
    if (result.ok && Object.keys(textErrors).length === 0) onSubmit(result.data);
  };

  /** Clears one field's error when it is edited again. */
  const edit = (setter, key) => (value) => {
    setter(value);
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const fieldErrors = mergeErrors(errors, error);
  const generalError = error && Object.keys(error.fieldErrors ?? {}).length === 0 ? error.message : null;
  const selectedCategory = categories.find((c) => c.categoryId === categoryId);

  const heroImage = images[0]?.publicUrl ?? images[0]?.url ?? null;

  // Only the rows that parse; a half-typed number reads as nothing rather than as NaN.
  const variantStockTotal = variantRows.reduce((sum, row) => {
    const value = Number.parseInt(row.stock, 10);
    return sum + (Number.isNaN(value) ? 0 : value);
  }, 0);

  return (
    <>
      <Alert message={generalError} />
      <Alert message={uploadError} />

      {/* The live card — what a customer will see, updating as the merchant types. */}
      <ProductPreview
        name={name}
        image={heroImage}
        price={price}
        mrp={mrp}
        stock={stock}
        trackInventory={trackInventory}
        active={active}
      />

      <FormSection title="Photos" hint="The first photo is what customers see in your store grid.">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.images}>
          {images.map((image, index) => (
            <FadeIn key={image.imageKey} from="right" style={styles.imageWrap}>
              <Image source={{ uri: image.publicUrl ?? image.url }} style={styles.image} resizeMode="cover" />
              {index === 0 ? (
                <View style={styles.coverBadge}>
                  <Caption style={styles.coverText}>Cover</Caption>
                </View>
              ) : null}
              <Touchable
                onPress={() => removeImage(image.imageKey)}
                accessibilityLabel="Remove image"
                style={styles.imageRemove}
              >
                <Ionicons name="close" size={14} color="#ffffff" />
              </Touchable>
            </FadeIn>
          ))}
          <Touchable
            onPress={() => setPickerOpen(true)}
            disabled={uploading || images.length >= 12}
            accessibilityLabel="Add photo"
            style={styles.addImage}
          >
            <Ionicons name={uploading ? 'cloud-upload-outline' : 'add'} size={24} color={colors.accent600} />
            <Caption style={{ color: colors.accent700 }}>{uploading ? 'Uploading…' : 'Add'}</Caption>
          </Touchable>
        </ScrollView>
      </FormSection>

      <FormSection title="Details" delay={40}>
        <Field
          label="Product name"
          value={name}
          onChangeText={edit(setName, 'name')}
          placeholder="Cotton kurta"
          autoCapitalize="sentences"
          maxLength={140}
          error={fieldErrors.name}
        />

        <Touchable onPress={() => setCategorySheet(true)} style={styles.selectRow} scaleTo={1}>
          <View style={{ flex: 1 }}>
            <Caption style={styles.selectLabel}>Category</Caption>
            <Body style={{ color: selectedCategory ? colors.ink900 : colors.ink400 }}>
              {selectedCategory?.name ?? 'No category'}
            </Body>
          </View>
          <Ionicons name="chevron-down" size={18} color={colors.ink400} />
        </Touchable>

        <Field
          label="Description"
          value={description}
          onChangeText={edit(setDescription, 'description')}
          maxLength={8000}
          placeholder="Fabric, fit, care instructions — whatever a customer would ask."
          multiline
          numberOfLines={4}
          style={styles.textarea}
          containerStyle={{ marginTop: space.lg, marginBottom: 0 }}
          error={fieldErrors.description}
        />
      </FormSection>

      <FormSection title="Price" delay={80}>
        <Row gap={space.md} align="flex-start">
          <Field
            label="Selling price"
            value={price}
            onChangeText={edit(setPrice, 'price')}
            placeholder="0"
            keyboardType="decimal-pad"
            prefix="₹"
            containerStyle={{ flex: 1, marginBottom: 0 }}
            error={fieldErrors.price}
          />
          <Field
            label="MRP"
            value={mrp}
            onChangeText={edit(setMrp, 'mrp')}
            placeholder="Optional"
            keyboardType="decimal-pad"
            prefix="₹"
            containerStyle={{ flex: 1, marginBottom: 0 }}
            hint="Struck through"
            error={fieldErrors.mrp}
          />
        </Row>
      </FormSection>

      <FormSection
        title="Options"
        hint="For products that come in sizes, colours or flavours."
        delay={110}
      >
        <Card style={styles.card}>
          <Toggle
            label="This product has options"
            hint="Each combination gets its own price and stock."
            value={hasVariants}
            onChange={(next) => {
              setHasVariants(next);
              // Turning it on with nothing defined yet opens on one empty option, so the
              // merchant lands on something to fill in rather than a bare toggle.
              if (next && variantOptions.length === 0) setVariantOptions([{ name: '', values: '' }]);
            }}
          />
        </Card>

        {hasVariants ? (
          <View style={{ marginTop: space.lg }}>
            <VariantEditor
              options={variantOptions}
              rows={variantRows}
              onChangeOptions={setVariantOptions}
              onChangeRows={setVariantRows}
              errors={fieldErrors}
              basePrice={price}
            />
          </View>
        ) : null}
      </FormSection>

      <FormSection title="Inventory" delay={120}>
        {/* With options on, stock lives on each combination and the total is the API's to
            work out — showing a second stock box here would invite a number that loses. */}
        {hasVariants && variantRows.length ? (
          <Card style={styles.card}>
            <Row gap={space.sm}>
              <Ionicons name="layers-outline" size={18} color={colors.ink500} />
              <Body muted style={{ flex: 1 }}>
                Stock is counted per option above — {variantStockTotal} in stock across{' '}
                {variantRows.length} combination{variantRows.length === 1 ? '' : 's'}.
              </Body>
            </Row>
          </Card>
        ) : (
        <Card style={styles.card}>
          <Toggle
            label="Track stock"
            hint="Turn off for made-to-order items."
            value={trackInventory}
            onChange={setTrackInventory}
          />
          {trackInventory ? (
            <Row gap={space.md} align="flex-start" style={{ marginTop: space.md }}>
              <Field
                label="In stock"
                value={stock}
                onChangeText={edit(setStock, 'stock')}
                keyboardType="number-pad"
                containerStyle={{ flex: 1, marginBottom: 0 }}
                error={fieldErrors.stock}
              />
              <Field
                label="Warn me at"
                value={lowStockThreshold}
                onChangeText={edit(setLowStockThreshold, 'lowStockThreshold')}
                keyboardType="number-pad"
                containerStyle={{ flex: 1, marginBottom: 0 }}
                error={fieldErrors.lowStockThreshold}
              />
            </Row>
          ) : null}
        </Card>
        )}

        <Field
          label="SKU"
          value={sku}
          onChangeText={edit(setSku, 'sku')}
          maxLength={64}
          placeholder="Optional — your own product code"
          autoCapitalize="characters"
          autoCorrect={false}
          containerStyle={{ marginTop: space.lg, marginBottom: 0 }}
          error={fieldErrors.sku}
        />
      </FormSection>

      <FormSection title="Visibility" delay={160}>
        <Card style={styles.card}>
          <Toggle label="Visible in store" hint="Turn off to hide without deleting." value={active} onChange={setActive} />
          <View style={styles.cardDivider} />
          <Toggle label="Feature on the home page" hint="Highlights it at the top of your storefront." value={featured} onChange={setFeatured} />
        </Card>
      </FormSection>

      <Button title={submitLabel} size="lg" loading={submitting} onPress={submit} style={{ marginTop: space.sm }} />

      <Sheet visible={pickerOpen} onClose={() => setPickerOpen(false)} title="Add a photo">
        <Touchable onPress={() => addImage('camera')} style={styles.sheetRow}>
          <Ionicons name="camera-outline" size={20} color={colors.ink700} />
          <Body strong style={{ flex: 1 }}>Take a photo</Body>
        </Touchable>
        <Touchable onPress={() => addImage('library')} style={styles.sheetRow}>
          <Ionicons name="images-outline" size={20} color={colors.ink700} />
          <Body strong style={{ flex: 1 }}>Choose from gallery</Body>
        </Touchable>
      </Sheet>

      <Sheet visible={categorySheet} onClose={() => setCategorySheet(false)} title="Category">
        <Touchable onPress={() => { setCategoryId(null); setCategorySheet(false); }} style={styles.sheetRow}>
          <Body style={{ flex: 1 }}>No category</Body>
          {categoryId === null ? <Ionicons name="checkmark" size={20} color={colors.accent600} /> : null}
        </Touchable>
        {categories.map((category) => (
          <Touchable
            key={category.categoryId}
            onPress={() => { setCategoryId(category.categoryId); setCategorySheet(false); }}
            style={styles.sheetRow}
          >
            <Body style={{ flex: 1 }}>{category.name}</Body>
            {categoryId === category.categoryId ? (
              <Ionicons name="checkmark" size={20} color={colors.accent600} />
            ) : null}
          </Touchable>
        ))}
      </Sheet>
    </>
  );
};

const styles = StyleSheet.create({
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    marginBottom: space.xl,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    ...shadow.card,
  },
  previewImage: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.sunken,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewImageInner: { width: '100%', height: '100%' },
  previewHidden: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(16,16,20,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewHiddenText: { color: '#ffffff', fontSize: 10 },
  previewPlaceholder: { color: colors.ink400 },
  previewPrice: { ...type.money, color: colors.ink900 },
  previewStrike: { textDecorationLine: 'line-through', color: colors.ink400 },
  previewOff: { color: colors.success },
  previewDot: { width: 7, height: 7, borderRadius: 4 },

  section: { marginBottom: space.xl },
  sectionTitle: { fontSize: 16, marginBottom: space.xs },
  sectionHint: { marginBottom: space.md },

  images: { gap: space.sm, paddingVertical: space.xs },
  imageWrap: { position: 'relative' },
  image: { width: 92, height: 92, borderRadius: radius.md, backgroundColor: colors.ink200 },
  coverBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(16,16,20,0.72)',
    borderRadius: radius.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  coverText: { color: '#ffffff', fontSize: 10 },
  imageRemove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(12,10,9,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addImage: {
    width: 92,
    height: 92,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.accent200,
    backgroundColor: colors.accent50,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },

  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 60,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    marginTop: space.lg,
  },
  selectLabel: { marginBottom: 2 },
  textarea: { minHeight: 96, textAlignVertical: 'top', paddingTop: space.md },
  card: {},
  cardDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginVertical: space.xs },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    minHeight: 48,
  },
});
