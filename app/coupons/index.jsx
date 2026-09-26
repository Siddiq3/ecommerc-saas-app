import { useEffect, useState } from 'react';
import { Alert as RNAlert, Platform, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { formatMoney } from '@storekit/shared';
import { createCouponSchema, rupeesText, searchQuery, updateCouponSchema, wholeNumberText } from '@storekit/validation';
import { Screen } from '../../src/components/Screen.jsx';
import {
  Alert, Body, Button, Caption, Card, Divider, EmptyState, ErrorState, Field, Loading, Pill, Row, Toggle, Touchable,
} from '../../src/components/ui.jsx';
import { SkeletonScreen } from '../../src/components/Skeleton.jsx';
import { Sheet } from '../../src/components/Sheet.jsx';
import { useAuth } from '../../src/state/auth.jsx';
import { useAction, useAsync } from '../../src/lib/useAsync.js';
import { check, mergeErrors } from '../../src/lib/validation.js';
import { coupons as couponsApi, products as productsApi } from '../../src/api/endpoints.js';
import { colors, fonts, radius, space } from '../../src/theme.js';

/**
 * Coupons.
 *
 * Scope is store-wide or a hand-picked set of products — categories-scoped coupons are a
 * real backend capability too, but nobody has asked for that picker yet, and adding it
 * "while we're in here" is exactly the kind of unrequested surface area that turns into a
 * maintenance cost with no user. Code, type and value are fixed at creation (the server
 * treats them as immutable once a code might already be shared or printed); everything
 * editable after that — limits, products, sale window, pause/resume — lives in the edit
 * sheet. Scope itself is also fixed at creation: the backend has no way to change a
 * coupon's scope after the fact, only the product list underneath it.
 */

const percentField = wholeNumberText({ min: 1, max: 90, label: 'Discount percentage' });
const fixedValueField = rupeesText('Discount amount');
const minOrderField = rupeesText('Minimum order value');
const maxDiscountField = rupeesText('Maximum discount');
const usageLimitField = wholeNumberText({ min: 0, max: 1_000_000, label: 'Total uses' });
const perCustomerField = wholeNumberText({ min: 0, max: 100, label: 'Uses per customer' });

/** Parses one text field, recording its error under `key`. Blank means "not typed". */
const parseInto = (schema, value, key, errors) => {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  errors[key] = result.error.issues[0].message;
  return undefined;
};

const startOfDay = (date) => { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; };
const endOfDay = (date) => { const d = new Date(date); d.setHours(23, 59, 59, 999); return d; };
const formatDate = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const STATE_TONE = { live: 'green', scheduled: 'blue', paused: 'slate', expired: 'red', exhausted: 'amber' };
const STATE_LABEL = { live: 'Live', scheduled: 'Scheduled', paused: 'Paused', expired: 'Expired', exhausted: 'Fully claimed' };

const summarize = (coupon) => {
  const parts = [];
  parts.push(coupon.scope === 'products' ? `${coupon.productIds?.length ?? 0} product${coupon.productIds?.length === 1 ? '' : 's'}` : 'All products');
  if (coupon.minOrderValue > 0) parts.push(`Min ${formatMoney(coupon.minOrderValue)}`);
  if (coupon.maxDiscount > 0) parts.push(`Up to ${formatMoney(coupon.maxDiscount)} off`);
  parts.push(coupon.usageLimit > 0 ? `${coupon.remainingUses} of ${coupon.usageLimit} left` : 'Unlimited uses');

  // A start date within a minute of creation is just "created now", not a scheduled sale.
  const scheduled = coupon.startAt && coupon.createdAt && new Date(coupon.startAt) - new Date(coupon.createdAt) > 60_000;
  if (scheduled && coupon.expiresAt) parts.push(`${formatDate(coupon.startAt)} – ${formatDate(coupon.expiresAt)}`);
  else if (scheduled) parts.push(`From ${formatDate(coupon.startAt)}`);
  else if (coupon.expiresAt) parts.push(`Until ${formatDate(coupon.expiresAt)}`);

  return parts.join(' · ');
};

/** A search-and-tap multi-select for scoping a coupon to specific products. */
const ProductPicker = ({ visible, onClose, businessId, selected, onToggle }) => {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [searchError, setSearchError] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      const result = searchQuery.safeParse(search);
      if (result.success) { setSearchError(null); setQuery(result.data ?? ''); }
      else setSearchError(result.error.issues[0].message);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!visible || !businessId) return;
    let cancelled = false;
    setLoading(true);
    productsApi
      .list(businessId, { q: query || undefined, limit: 100 })
      .then((res) => { if (!cancelled) setResults(res.items ?? []); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [visible, businessId, query]);

  return (
    <Sheet visible={visible} onClose={onClose} title={`Choose products${selected.length ? ` (${selected.length})` : ''}`}>
      <Field
        value={search}
        onChangeText={setSearch}
        placeholder="Search products"
        autoCapitalize="none"
        autoCorrect={false}
        error={searchError}
        prefix={<Ionicons name="search" size={17} color={colors.ink400} />}
      />
      {loading ? (
        <Loading />
      ) : results.length ? (
        results.map((product) => {
          const checked = selected.includes(product.productId);
          return (
            <Touchable key={product.productId} onPress={() => onToggle(product.productId)} style={styles.pickerRow}>
              <Ionicons
                name={checked ? 'checkbox' : 'square-outline'}
                size={22}
                color={checked ? colors.accent600 : colors.ink400}
              />
              <View style={{ flex: 1 }}>
                <Body numberOfLines={1}>{product.name}</Body>
                <Caption>{formatMoney(product.price)}</Caption>
              </View>
            </Touchable>
          );
        })
      ) : (
        <Caption style={{ textAlign: 'center', marginVertical: space.xl }}>No products found.</Caption>
      )}
      <Button title="Done" onPress={onClose} style={{ marginTop: space.lg }} />
    </Sheet>
  );
};

export default function Coupons() {
  const { businessId } = useAuth();

  const [sheet, setSheet] = useState(null);
  const [editing, setEditing] = useState(null);
  const [errors, setErrors] = useState({});

  const [code, setCode] = useState('');
  const [type, setType] = useState('percentage');
  const [value, setValue] = useState('');
  const [scope, setScope] = useState('all');
  const [productIds, setProductIds] = useState([]);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [minOrderValue, setMinOrderValue] = useState('');
  const [maxDiscount, setMaxDiscount] = useState('');
  const [usageLimit, setUsageLimit] = useState('');
  const [usageLimitPerCustomer, setUsageLimitPerCustomer] = useState('');
  const [startAt, setStartAt] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [datePickerFor, setDatePickerFor] = useState(null);
  const [active, setActive] = useState(true);

  const { data, loading, error, refreshing, onRefresh, reload } = useAsync(
    () => (businessId ? couponsApi.list(businessId) : Promise.resolve(null)),
    [businessId],
  );

  const items = data?.items ?? [];

  const resetForm = () => {
    setCode(''); setType('percentage'); setValue(''); setScope('all'); setProductIds([]); setDescription('');
    setMinOrderValue(''); setMaxDiscount(''); setUsageLimit(''); setUsageLimitPerCustomer('');
    setStartAt(null); setExpiresAt(null); setActive(true); setErrors({});
  };

  const openCreate = () => { setEditing(null); resetForm(); setSheet('form'); };

  const openEdit = (coupon) => {
    setEditing(coupon);
    setScope(coupon.scope ?? 'all');
    setProductIds(coupon.productIds ?? []);
    setDescription(coupon.description ?? '');
    setMinOrderValue(coupon.minOrderValue > 0 ? String(coupon.minOrderValue / 100) : '');
    setMaxDiscount(coupon.maxDiscount > 0 ? String(coupon.maxDiscount / 100) : '');
    setUsageLimit(coupon.usageLimit > 0 ? String(coupon.usageLimit) : '');
    setUsageLimitPerCustomer(coupon.usageLimitPerCustomer > 0 ? String(coupon.usageLimitPerCustomer) : '');
    setStartAt(coupon.startAt ? new Date(coupon.startAt) : null);
    setExpiresAt(coupon.expiresAt ? new Date(coupon.expiresAt) : null);
    setActive(coupon.active);
    setErrors({});
    setSheet('form');
  };

  const toggleProduct = (productId) =>
    setProductIds((prev) => (prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]));

  const { run: save, pending: saving, error: saveError } = useAction(async (payload) => {
    if (editing) await couponsApi.update(businessId, editing.couponId, payload);
    else await couponsApi.create(businessId, payload);
    setSheet(null);
    await reload();
  });

  const submit = () => {
    const textErrors = {};
    const shared = {};
    if (description.trim()) shared.description = description;
    if (minOrderValue.trim()) shared.minOrderValue = parseInto(minOrderField, minOrderValue, 'minOrderValue', textErrors);
    if (maxDiscount.trim()) shared.maxDiscount = parseInto(maxDiscountField, maxDiscount, 'maxDiscount', textErrors);
    if (usageLimit.trim()) shared.usageLimit = parseInto(usageLimitField, usageLimit, 'usageLimit', textErrors);
    if (usageLimitPerCustomer.trim()) {
      shared.usageLimitPerCustomer = parseInto(perCustomerField, usageLimitPerCustomer, 'usageLimitPerCustomer', textErrors);
    }
    shared.startAt = startAt ? startAt.toISOString() : undefined;
    shared.expiresAt = expiresAt ? expiresAt.toISOString() : null;

    const activeScope = editing ? (editing.scope ?? 'all') : scope;
    if (activeScope === 'products') shared.productIds = productIds;
    if (activeScope === 'products' && productIds.length === 0) {
      textErrors.productIds = 'Select at least one product';
    }

    const payload = editing
      ? { ...shared, active }
      : {
          ...shared,
          code,
          type,
          scope,
          value: parseInto(type === 'percentage' ? percentField : fixedValueField, value, 'value', textErrors),
        };

    const result = check(editing ? updateCouponSchema : createCouponSchema, payload);
    const combined = { ...result.errors, ...textErrors };
    setErrors(combined);
    if (result.ok && Object.keys(textErrors).length === 0) save(result.data).catch(() => undefined);
  };

  const confirmDelete = (coupon) =>
    RNAlert.alert(
      `Delete "${coupon.code}"?`,
      'Anyone still holding this code will no longer be able to use it.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await couponsApi.remove(businessId, coupon.couponId).catch(() => undefined);
            reload();
          },
        },
      ],
    );

  if (loading && !data) return <SkeletonScreen />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;

  const fieldErrors = mergeErrors(errors, saveError);
  const generalError = saveError && Object.keys(saveError.fieldErrors ?? {}).length === 0 ? saveError.message : null;
  const activeScope = editing ? (editing.scope ?? 'all') : scope;

  // The sheets sit beside the Screen, not inside its ScrollView: a Modal nested in a
  // pull-to-refresh scroller is a known way to get a sheet that never shows on Android.
  return (
    <>
      <Screen refreshing={refreshing} onRefresh={onRefresh} footer={<Button title="New coupon" onPress={openCreate} />}>
        <Body muted style={styles.intro}>
          Discount codes customers enter at checkout on your storefront.
        </Body>

        {items.length ? (
          <Card padded={false} style={styles.card}>
            {items.map((coupon, index) => (
              <View key={coupon.couponId}>
                {index > 0 ? <Divider /> : null}
                <Touchable onPress={() => openEdit(coupon)} accessibilityLabel={`Edit ${coupon.code}`} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Row gap={space.sm}>
                      <Body strong style={styles.code}>{coupon.code}</Body>
                      <Pill label={STATE_LABEL[coupon.state] ?? coupon.state} tone={STATE_TONE[coupon.state] ?? 'slate'} />
                    </Row>
                    <Caption style={styles.discount}>
                      {coupon.type === 'percentage' ? `${coupon.value}% off` : `${formatMoney(coupon.value)} off`}
                    </Caption>
                    <Caption>{summarize(coupon)}</Caption>
                  </View>
                  <Touchable
                    onPress={() => confirmDelete(coupon)}
                    accessibilityLabel={`Delete ${coupon.code}`}
                    style={styles.action}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </Touchable>
                </Touchable>
              </View>
            ))}
          </Card>
        ) : (
          <EmptyState
            icon="🏷️"
            title="No coupons yet"
            message="Create a discount code for customers to enter at checkout."
          />
        )}
      </Screen>

      <Sheet visible={sheet === 'form'} onClose={() => setSheet(null)} title={editing ? editing.code : 'New coupon'}>
        <Alert message={generalError} />

        {editing ? null : (
          <>
            <Field
              label="Code"
              value={code}
              onChangeText={(v) => { setCode(v.toUpperCase()); if (errors.code) setErrors((p) => ({ ...p, code: undefined })); }}
              placeholder="WELCOME10"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={24}
              error={fieldErrors.code}
            />

            <View style={styles.typeToggle}>
              {[
                { value: 'percentage', label: 'Percentage off' },
                { value: 'fixed', label: 'Amount off' },
              ].map((option) => (
                <Touchable
                  key={option.value}
                  onPress={() => { setType(option.value); setValue(''); }}
                  accessibilityLabel={option.label}
                  style={[styles.typeOption, type === option.value && styles.typeOptionActive]}
                >
                  <Body style={[styles.typeText, type === option.value && styles.typeTextActive]}>{option.label}</Body>
                </Touchable>
              ))}
            </View>

            <Field
              label={type === 'percentage' ? 'Discount percentage' : 'Discount amount'}
              value={value}
              onChangeText={(v) => { setValue(v); if (errors.value) setErrors((p) => ({ ...p, value: undefined })); }}
              placeholder={type === 'percentage' ? '10' : '100'}
              keyboardType={type === 'percentage' ? 'number-pad' : 'decimal-pad'}
              prefix={type === 'fixed' ? '₹' : undefined}
              hint={type === 'percentage' ? 'A whole number from 1 to 90' : undefined}
              error={fieldErrors.value}
            />

            <Caption style={styles.sectionLabel}>APPLIES TO</Caption>
            <View style={styles.typeToggle}>
              {[
                { value: 'all', label: 'All products' },
                { value: 'products', label: 'Specific products' },
              ].map((option) => (
                <Touchable
                  key={option.value}
                  onPress={() => setScope(option.value)}
                  accessibilityLabel={option.label}
                  style={[styles.typeOption, scope === option.value && styles.typeOptionActive]}
                >
                  <Body style={[styles.typeText, scope === option.value && styles.typeTextActive]}>{option.label}</Body>
                </Touchable>
              ))}
            </View>
          </>
        )}

        {activeScope === 'products' ? (
          <View style={styles.field}>
            <Touchable onPress={() => setProductPickerOpen(true)} style={styles.selectRow}>
              <Body style={{ flex: 1, color: productIds.length ? colors.ink900 : colors.ink400 }}>
                {productIds.length ? `${productIds.length} product${productIds.length === 1 ? '' : 's'} selected` : 'Choose products'}
              </Body>
              <Ionicons name="chevron-forward" size={18} color={colors.ink400} />
            </Touchable>
            {fieldErrors.productIds ? <Caption style={styles.errorText}>{fieldErrors.productIds}</Caption> : null}
          </View>
        ) : null}

        <Field
          label="Description"
          value={description}
          onChangeText={(v) => { setDescription(v); if (errors.description) setErrors((p) => ({ ...p, description: undefined })); }}
          placeholder="Optional — shown to you only"
          maxLength={200}
          error={fieldErrors.description}
        />

        <Row gap={space.md} align="flex-start">
          <Field
            label="Minimum order"
            value={minOrderValue}
            onChangeText={(v) => { setMinOrderValue(v); if (errors.minOrderValue) setErrors((p) => ({ ...p, minOrderValue: undefined })); }}
            placeholder="None"
            keyboardType="decimal-pad"
            prefix="₹"
            containerStyle={{ flex: 1 }}
            error={fieldErrors.minOrderValue}
          />
          <Field
            label="Maximum discount"
            value={maxDiscount}
            onChangeText={(v) => { setMaxDiscount(v); if (errors.maxDiscount) setErrors((p) => ({ ...p, maxDiscount: undefined })); }}
            placeholder="No cap"
            keyboardType="decimal-pad"
            prefix="₹"
            containerStyle={{ flex: 1 }}
            error={fieldErrors.maxDiscount}
          />
        </Row>

        <Row gap={space.md} align="flex-start">
          <Field
            label="Total uses"
            value={usageLimit}
            onChangeText={(v) => { setUsageLimit(v); if (errors.usageLimit) setErrors((p) => ({ ...p, usageLimit: undefined })); }}
            placeholder="Unlimited"
            keyboardType="number-pad"
            containerStyle={{ flex: 1 }}
            error={fieldErrors.usageLimit}
          />
          <Field
            label="Per customer"
            value={usageLimitPerCustomer}
            onChangeText={(v) => { setUsageLimitPerCustomer(v); if (errors.usageLimitPerCustomer) setErrors((p) => ({ ...p, usageLimitPerCustomer: undefined })); }}
            placeholder="Unlimited"
            keyboardType="number-pad"
            containerStyle={{ flex: 1 }}
            error={fieldErrors.usageLimitPerCustomer}
          />
        </Row>

        <Caption style={styles.sectionLabel}>SALE DATES</Caption>
        <Row gap={space.md} align="flex-start">
          <View style={{ flex: 1 }}>
            <DateRow label="Starts" value={startAt} placeholder="Immediately" onPress={() => setDatePickerFor('start')} onClear={() => setStartAt(null)} />
          </View>
          <View style={{ flex: 1 }}>
            <DateRow label="Ends" value={expiresAt} placeholder="Never" onPress={() => setDatePickerFor('end')} onClear={() => setExpiresAt(null)} />
          </View>
        </Row>
        {fieldErrors.expiresAt ? <Caption style={styles.errorText}>{fieldErrors.expiresAt}</Caption> : null}

        {editing ? (
          <Toggle
            label="Active"
            hint="Turn off to pause without deleting."
            value={active}
            onChange={setActive}
          />
        ) : null}

        <Button title={editing ? 'Save' : 'Create coupon'} loading={saving} onPress={submit} style={{ marginTop: space.lg }} />
      </Sheet>

      <ProductPicker
        visible={productPickerOpen}
        onClose={() => setProductPickerOpen(false)}
        businessId={businessId}
        selected={productIds}
        onToggle={toggleProduct}
      />

      {datePickerFor ? (
        <DateTimePicker
          value={(datePickerFor === 'start' ? startAt : expiresAt) ?? new Date()}
          mode="date"
          display="default"
          minimumDate={datePickerFor === 'end' && startAt ? startAt : undefined}
          onChange={(event, picked) => {
            const target = datePickerFor;
            if (Platform.OS === 'android') setDatePickerFor(null);
            if (event.type === 'dismissed' || !picked) return;
            if (target === 'start') setStartAt(startOfDay(picked));
            else setExpiresAt(endOfDay(picked));
          }}
        />
      ) : null}
    </>
  );
}

/** A tappable date field with a clear (×) button once a date is set. */
const DateRow = ({ label, value, placeholder, onPress, onClear }) => (
  <View style={styles.fieldGroup}>
    <Body strong style={styles.dateLabel}>{label}</Body>
    <Touchable onPress={onPress} style={styles.dateRow}>
      <Body style={{ flex: 1, color: value ? colors.ink900 : colors.ink400 }}>
        {value ? formatDate(value) : placeholder}
      </Body>
      {value ? (
        <Touchable onPress={onClear} accessibilityLabel={`Clear ${label.toLowerCase()}`} hitSlop={8}>
          <Ionicons name="close-circle" size={18} color={colors.ink400} />
        </Touchable>
      ) : null}
    </Touchable>
  </View>
);

const styles = StyleSheet.create({
  intro: { marginBottom: space.lg },
  card: { overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, paddingHorizontal: space.md, gap: space.md },
  code: { letterSpacing: 0.5 },
  discount: { marginTop: 2, color: colors.ink800, fontFamily: fonts.semibold },
  action: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

  sectionLabel: { marginBottom: space.sm, letterSpacing: 0.8 },
  field: { marginBottom: space.lg },
  errorText: { color: colors.danger, marginTop: -space.sm, marginBottom: space.md },

  typeToggle: {
    flexDirection: 'row',
    backgroundColor: colors.ink200,
    borderRadius: radius.pill,
    padding: 4,
    marginBottom: space.lg,
  },
  typeOption: { flex: 1, paddingVertical: 9, borderRadius: radius.pill, alignItems: 'center' },
  typeOptionActive: { backgroundColor: colors.surface },
  typeText: { color: colors.ink600, fontFamily: fonts.semibold, fontSize: 13 },
  typeTextActive: { color: colors.ink900 },

  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    paddingHorizontal: space.lg,
  },

  fieldGroup: { marginBottom: space.lg },
  dateLabel: { fontSize: 13, marginBottom: space.sm },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    paddingHorizontal: space.lg,
    gap: space.sm,
  },

  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    minHeight: 48,
  },
});
