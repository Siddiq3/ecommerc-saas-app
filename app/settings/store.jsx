import { useEffect, useState } from 'react';
import { Image, Alert as RNAlert, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from 'expo-router';
import { paymentSettingsSchema, updateBusinessSchema, upiId as upiIdSchema } from '@storekit/validation';
import { Screen } from '../../src/components/Screen.jsx';
import {
  Alert, Body, Button, Caption, Card, ErrorState, Field, Heading, Row, StatusDot, Toggle,
} from '../../src/components/ui.jsx';
import { SkeletonCard } from '../../src/components/Skeleton.jsx';
import { HelpButton } from '../../src/components/Help.jsx';
import { useToast } from '../../src/components/Toast.jsx';
import { useAuth } from '../../src/state/auth.jsx';
import { useAction, useAsync } from '../../src/lib/useAsync.js';
import { check, mergeErrors } from '../../src/lib/validation.js';
import { pickAndSaveLogo } from '../../src/lib/upload.js';
import { StateField } from '../../src/components/StateField.jsx';
import { businesses as businessesApi, storeSettings } from '../../src/api/endpoints.js';
import { colors, radius, space } from '../../src/theme.js';

/**
 * Store details and payments, after onboarding.
 *
 * The logo saves on its own the moment one is chosen (PATCH /businesses/:id { logoKey }), so it
 * never mixes with unsaved edits below.
 *
 * Two existing endpoints, each sent only what changed:
 *   PATCH /businesses/:id           name, description, contact (contact is replaced whole)
 *   PATCH /businesses/:id/settings  payments (validated as a whole object, defaults filled)
 *
 * The API validates `payments` as a whole object and fills schema defaults into any field
 * that is missing, which would silently switch a setting the merchant never touched. So every
 * field that has a default is always sent, carrying its saved value; fields without one (the
 * QR image) are left out and the API's one-level merge keeps them as they are. Only what the
 * storefront checkout needs is editable here: UPI on/off, the UPI ID, the name shown beside
 * it, and cash on delivery.
 */

const BUSINESS_KEYS = ['name', 'description', 'phone', 'whatsapp', 'email', 'addressLine', 'city', 'state', 'pincode'];
const PAYMENT_KEYS = ['upiEnabled', 'upiId', 'upiPayeeName', 'codEnabled'];

/** Payment fields with a schema default that this screen does not edit: sent back as saved. */
const KEPT_PAYMENT_KEYS = ['codMaxOrderValue', 'upiRequireUtr', 'upiAllowScreenshot', 'upiPendingExpiryMinutes'];

const toForm = (business, settings) => ({
  name: business?.name ?? '',
  description: business?.description ?? '',
  phone: business?.contact?.phone ?? '',
  whatsapp: business?.contact?.whatsapp ?? '',
  email: business?.contact?.email ?? '',
  addressLine: business?.contact?.addressLine ?? '',
  city: business?.contact?.city ?? '',
  state: business?.contact?.state ?? '',
  pincode: business?.contact?.pincode ?? '',
  upiEnabled: Boolean(settings?.payments?.upiEnabled),
  upiId: settings?.payments?.upiId ?? '',
  upiPayeeName: settings?.payments?.upiPayeeName ?? '',
  codEnabled: settings?.payments?.codEnabled ?? true,
});

const changed = (a, b, keys) => keys.some((key) => a[key] !== b[key]);

const OFFLINE_SAVE = 'Unable to save changes. Please check your internet connection and try again.';
const messageFor = (error, offline) => (error?.status === 0 ? offline : error?.message);

export default function StoreSettings() {
  const navigation = useNavigation();
  const toast = useToast();
  const { businessId, refreshUser } = useAuth();

  const { data, error, loading, reload, setData } = useAsync(
    async () => {
      if (!businessId) return null;
      const [business, settings] = await Promise.all([businessesApi.get(businessId), storeSettings.get(businessId)]);
      return { business, settings };
    },
    [businessId],
  );

  const [form, setForm] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [errors, setErrors] = useState({});

  /*
   * Fill the form from the server only while it is empty (first load, or a retry after a
   * failed load). Saves set the form themselves, so a later data change can never overwrite
   * edits that have not been saved yet.
   */
  useEffect(() => {
    if (!data || form) return;
    const next = toForm(data.business, data.settings);
    setForm(next);
    setBaseline(next);
  }, [data, form]);

  const dirty = Boolean(form && baseline) && (changed(form, baseline, BUSINESS_KEYS) || changed(form, baseline, PAYMENT_KEYS));

  const { run: save, pending: saving, error: saveError, clearError } = useAction(async ({ businessInput, paymentsInput }) => {
    let { business, settings } = data;
    if (businessInput) {
      business = { ...business, ...(await businessesApi.update(businessId, businessInput)) };
      // Saved even if the payments call below fails: only what is still unsaved stays "changed".
      setData({ business, settings });
      setBaseline((prev) => ({ ...prev, ...pickKeys(toForm(business, settings), BUSINESS_KEYS) }));
    }
    if (paymentsInput) {
      settings = await storeSettings.update(businessId, { payments: paymentsInput });
      setData({ business, settings });
    }
    // The saved, normalised values (a lower-cased UPI ID, a mobile without +91) become the form.
    const next = toForm(business, settings);
    setForm(next);
    setBaseline(next);
    // The name and status shown on Home and Account come from the session; refresh it.
    await refreshUser();
    toast.success('Changes saved');
  });

  const { run: setPublished, pending: publishing, error: publishError, clearError: clearPublishError } = useAction(async (publish) => {
    const updated = publish ? await businessesApi.publish(businessId) : await businessesApi.unpublish(businessId);
    setData((prev) => ({ ...prev, business: { ...prev.business, ...updated } }));
    await refreshUser();
    toast.success(publish ? 'Your store is live' : 'Your store is offline');
  });

  /** Picks, uploads and saves a new logo — or, with `remove`, takes it off the store. */
  const { run: changeLogo, pending: logoSaving, error: logoError } = useAction(async (remove) => {
    const updated = remove ? await businessesApi.update(businessId, { logoKey: null }) : await pickAndSaveLogo(businessId);
    if (!updated) return;
    // Set explicitly: a removed logo is absent from the response, and must not survive the merge.
    setData((prev) => ({ ...prev, business: { ...prev.business, ...updated, logoKey: updated.logoKey, logoUrl: updated.logoUrl } }));
    // Home's setup card reads the logo from the session.
    await refreshUser();
    toast.success(remove ? 'Logo removed' : 'Logo saved');
  });

  useEffect(() => {
    navigation.setOptions?.({ headerRight: () => <HelpButton context="store" /> });
  }, [navigation]);

  /* Leaving with unsaved edits asks first. On iOS the swipe-back gesture is paused meanwhile. */
  useEffect(() => {
    navigation.setOptions?.({ gestureEnabled: !dirty });
    if (!dirty) return undefined;
    return navigation.addListener('beforeRemove', (event) => {
      event.preventDefault();
      RNAlert.alert('Discard your changes?', 'Your store details have not been saved.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(event.data.action) },
      ]);
    });
  }, [dirty, navigation]);

  if (loading && !form) {
    return (
      <Screen>
        <SkeletonCard lines={2} />
        <View style={{ height: space.lg }} />
        <SkeletonCard lines={4} />
        <View style={{ height: space.lg }} />
        <SkeletonCard lines={3} />
      </Screen>
    );
  }
  if (error && !form) return <ErrorState error={error} onRetry={reload} />;
  if (!form) return null;

  const set = (key) => (value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    const path = PAYMENT_KEYS.includes(key) ? `payments.${key}` : BUSINESS_PATHS[key];
    if (errors[path]) setErrors((prev) => ({ ...prev, [path]: undefined }));
    if (saveError) clearError();
  };

  const submit = () => {
    const businessDirty = changed(form, baseline, BUSINESS_KEYS);
    const paymentsDirty = changed(form, baseline, PAYMENT_KEYS);

    const contact = {
      email: form.email,
      addressLine: form.addressLine,
      city: form.city,
      state: form.state,
      pincode: form.pincode,
    };
    // `contact` is replaced whole, and a blank mobile is not a valid mobile: leaving it out is
    // how a number is cleared.
    if (form.phone.trim()) contact.phone = form.phone;
    if (form.whatsapp.trim()) contact.whatsapp = form.whatsapp;
    const business = check(updateBusinessSchema, { name: form.name, description: form.description, contact });

    const payments = check(paymentSettingsSchema, {
      ...pickKeys(data.settings?.payments ?? {}, KEPT_PAYMENT_KEYS),
      codEnabled: form.codEnabled,
      upiEnabled: form.upiEnabled,
      // With UPI off the ID field is hidden, so a half-typed ID there must not block the save:
      // the saved one is kept instead.
      upiId: form.upiEnabled || upiIdSchema.safeParse(form.upiId).success || !form.upiId.trim()
        ? form.upiId
        : data.settings?.payments?.upiId ?? '',
      // Blank means "use the store's name", which is also the backend's own default.
      upiPayeeName: form.upiPayeeName.trim() || form.name.trim(),
    });
    const paymentErrors = Object.fromEntries(Object.entries(payments.errors).map(([k, v]) => [`payments.${k}`, v]));

    setErrors({ ...(businessDirty ? business.errors : {}), ...(paymentsDirty ? paymentErrors : {}) });
    if ((businessDirty && !business.ok) || (paymentsDirty && !payments.ok)) return;

    save({
      businessInput: businessDirty ? business.data : null,
      paymentsInput: paymentsDirty ? payments.data : null,
    }).catch(() => undefined);
  };

  const fieldErrors = mergeErrors(errors, saveError);
  const generalError = saveError && Object.keys(saveError.fieldErrors ?? {}).length === 0 ? messageFor(saveError, OFFLINE_SAVE) : null;
  const hasFieldErrors = Object.values(fieldErrors).some(Boolean);

  const status = data.business?.status;
  const isLive = status === 'active';
  const publishMessage = publishError
    ? publishError.status === 0
      ? 'Unable to change your store status. Please check your internet connection and try again.'
      : publishError.details?.length
        ? `${publishError.message}:\n${publishError.details.map((d) => `• ${d.message}`).join('\n')}`
        : publishError.message
    : null;

  const confirmUnpublish = () =>
    RNAlert.alert(
      'Take your store offline?',
      'Customers will not be able to open your store or place orders until you publish it again. Nothing is deleted.',
      [
        { text: 'Keep it live', style: 'cancel' },
        {
          text: 'Take offline',
          style: 'destructive',
          onPress: () => { clearPublishError(); setPublished(false).catch(() => undefined); },
        },
      ],
    );

  return (
    <Screen
      footer={<Button title="Save changes" loading={saving} disabled={!dirty} onPress={submit} />}
    >
      {/* ───── Status ───── */}
      <Card style={styles.card}>
        <Row>
          <StatusDot live={isLive} size={9} />
          <Body strong style={{ flex: 1 }}>{isLive ? 'Your store is live' : 'Not published'}</Body>
        </Row>
        <Caption style={styles.statusHint}>
          {isLive
            ? 'Customers can open your store and place orders.'
            : 'Customers cannot see your store yet. Publish it when your details and payments are ready.'}
        </Caption>
        <Alert message={publishMessage} />
        {status === 'active' || status === 'draft' ? (
          <Button
            title={isLive ? 'Take store offline' : 'Publish store'}
            variant={isLive ? 'secondary' : 'primary'}
            size="sm"
            loading={publishing}
            disabled={dirty}
            onPress={isLive ? confirmUnpublish : () => { clearPublishError(); setPublished(true).catch(() => undefined); }}
          />
        ) : null}
        {dirty && (status === 'active' || status === 'draft') ? (
          <Caption style={styles.statusHint}>Save your changes first.</Caption>
        ) : null}
      </Card>

      {/* ───── Store details ───── */}
      <Heading style={styles.section}>Store details</Heading>
      <Card style={styles.card}>
        <Row gap={space.lg}>
          <View style={styles.logoBox}>
            {data.business?.logoUrl ? (
              <Image source={{ uri: data.business.logoUrl }} style={styles.logo} resizeMode="contain" accessibilityLabel="Your store logo" />
            ) : (
              <Ionicons name="storefront-outline" size={28} color={colors.ink400} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Body strong>Store logo</Body>
            <Caption>
              {data.business?.logoUrl
                ? 'Shown at the top of your store.'
                : 'Your store shows its name until you add one. A logo on a clear background looks best.'}
            </Caption>
          </View>
        </Row>
        <Alert message={logoError ? messageFor(logoError, 'Unable to save the logo. Please check your internet connection and try again.') : null} />
        <Row gap={space.sm}>
          <Button
            title={data.business?.logoUrl ? 'Change logo' : 'Upload logo'}
            variant="secondary"
            size="sm"
            full={false}
            loading={logoSaving}
            icon={<Ionicons name="image-outline" size={16} color={colors.ink800} />}
            onPress={() => changeLogo(false).catch(() => undefined)}
            style={{ flex: 1 }}
          />
          {data.business?.logoUrl ? (
            <Button
              title="Remove"
              variant="ghost"
              size="sm"
              full={false}
              disabled={logoSaving}
              onPress={() => changeLogo(true).catch(() => undefined)}
            />
          ) : null}
        </Row>
      </Card>
      <Field
        label="Store name"
        placeholder="Enter your store name"
        value={form.name}
        onChangeText={set('name')}
        autoCapitalize="words"
        maxLength={80}
        error={fieldErrors.name}
      />
      <Field
        label="Description (optional)"
        value={form.description}
        onChangeText={set('description')}
        placeholder="Enter a short description of what you sell"
        multiline
        maxLength={500}
        error={fieldErrors.description}
      />

      <Heading style={styles.section}>Contact</Heading>
      <Field
        label="Mobile number"
        placeholder="Enter your mobile number"
        value={form.phone}
        onChangeText={set('phone')}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        prefix="+91"
        maxLength={17}
        hint="Customers see this on your store. Needed to publish."
        error={fieldErrors['contact.phone']}
      />
      <Field
        label="WhatsApp number (optional)"
        placeholder="Enter your WhatsApp number"
        value={form.whatsapp}
        onChangeText={set('whatsapp')}
        keyboardType="phone-pad"
        prefix="+91"
        maxLength={17}
        error={fieldErrors['contact.whatsapp']}
      />
      <Field
        label="Email (optional)"
        placeholder="Enter your email address"
        value={form.email}
        onChangeText={set('email')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        maxLength={254}
        error={fieldErrors['contact.email']}
      />

      <Heading style={styles.section}>Address</Heading>
      <Field
        label="Shop address (optional)"
        placeholder="Enter your shop address"
        value={form.addressLine}
        onChangeText={set('addressLine')}
        autoComplete="street-address"
        textContentType="streetAddressLine1"
        maxLength={200}
        error={fieldErrors['contact.addressLine']}
      />
      <Row gap={space.md} align="flex-start">
        <Field
          label="City"
        placeholder="Enter city"
          value={form.city}
          onChangeText={set('city')}
          autoCapitalize="words"
          textContentType="addressCity"
          maxLength={60}
          containerStyle={styles.half}
          error={fieldErrors['contact.city']}
        />
        <StateField
          value={form.state}
          onChange={set('state')}
          containerStyle={styles.half}
          error={fieldErrors['contact.state']}
        />
      </Row>
      <Field
        label="Pincode"
        placeholder="Enter pincode"
        value={form.pincode}
        onChangeText={set('pincode')}
        keyboardType="number-pad"
        textContentType="postalCode"
        maxLength={6}
        error={fieldErrors['contact.pincode']}
      />

      {/* ───── Payments ───── */}
      <Heading style={styles.section}>Payments</Heading>
      <Caption style={styles.sectionHint}>How customers can pay at checkout. Keep at least one switched on.</Caption>
      <Card style={styles.card}>
        <Toggle
          label="UPI payments"
          hint="Customers pay to your UPI ID, then send you the reference to check."
          value={form.upiEnabled}
          onChange={set('upiEnabled')}
        />
        {form.upiEnabled ? (
          <View style={styles.upiFields}>
            <Field
              label="UPI ID"
              value={form.upiId}
              onChangeText={set('upiId')}
              placeholder="Enter your UPI ID"
              // The email keyboard has "@" and "." on its first layer, which every UPI ID needs.
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={128}
              error={fieldErrors['payments.upiId']}
            />
            <Field
              label="Name shown to customers (optional)"
              value={form.upiPayeeName}
              onChangeText={set('upiPayeeName')}
              placeholder="Enter the name customers should see"
              autoCapitalize="words"
              maxLength={80}
              hint="Appears next to your UPI ID. Leave blank to use your store name."
              error={fieldErrors['payments.upiPayeeName']}
            />
          </View>
        ) : null}
      </Card>
      <Card style={styles.card}>
        <Toggle
          label="Cash on delivery"
          hint="Customers pay when the order arrives."
          value={form.codEnabled}
          onChange={set('codEnabled')}
        />
      </Card>
      {fieldErrors['payments.codEnabled'] ? (
        <Caption style={styles.errorText}>{fieldErrors['payments.codEnabled']}</Caption>
      ) : null}

      {/* Next to the Save button: a failed save or a field above that needs fixing. */}
      <Alert message={generalError} />
      {!generalError && hasFieldErrors ? (
        <Caption style={styles.errorText}>Check the highlighted fields above.</Caption>
      ) : null}
    </Screen>
  );
}

/** Where each business field's error lands, matching the API's error paths. */
const BUSINESS_PATHS = {
  name: 'name',
  description: 'description',
  phone: 'contact.phone',
  whatsapp: 'contact.whatsapp',
  email: 'contact.email',
  addressLine: 'contact.addressLine',
  city: 'contact.city',
  state: 'contact.state',
  pincode: 'contact.pincode',
};

const pickKeys = (source, keys) =>
  Object.fromEntries(keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));

const styles = StyleSheet.create({
  card: { marginBottom: space.md, gap: space.sm },
  statusHint: { color: colors.ink600 },
  section: { marginTop: space.lg, marginBottom: space.md },
  sectionHint: { marginTop: -space.sm, marginBottom: space.md },
  upiFields: { marginTop: space.md },
  half: { flex: 1 },
  logoBox: {
    width: 72,
    height: 72,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logo: { width: 64, height: 64 },
  errorText: { color: colors.danger, textAlign: 'center', marginBottom: space.md },
});
