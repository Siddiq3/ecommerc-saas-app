import { useEffect, useState } from 'react';
import { Alert as RNAlert, Image, Linking, StyleSheet, View } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { updateStoreSettingsSchema } from '@storekit/validation';
import { Screen } from '../../src/components/Screen.jsx';
import { Alert, Body, Button, Caption, Card, ErrorState, Field, Heading, Row, Toggle, Touchable } from '../../src/components/ui.jsx';
import { SkeletonScreen } from '../../src/components/Skeleton.jsx';
import { StorePreview } from '../../src/components/StorePreview.jsx';
import { useToast } from '../../src/components/Toast.jsx';
import { useAuth } from '../../src/state/auth.jsx';
import { useAction, useAsync } from '../../src/lib/useAsync.js';
import { check, mergeErrors } from '../../src/lib/validation.js';
import { storefrontDraft, storefrontPatch, moveItem } from '../../src/lib/merchandising.js';
import { STORE_STYLES } from '../../src/lib/storeStyles.js';
import { storeUrl } from '../../src/lib/storefront.js';
import { pickAndSaveLogo, pickImage, uploadImage } from '../../src/lib/upload.js';
import { businesses, storeSettings } from '../../src/api/endpoints.js';
import { colors, radius, space } from '../../src/theme.js';

const SECTION_TITLES = { featured: 'Featured', new_arrivals: 'New arrivals', sale: 'On sale', best_sellers: 'Best sellers' };
const snapshot = (draft) => JSON.stringify(storefrontPatch(draft));

export default function StorefrontSettings() {
  const navigation = useNavigation();
  const router = useRouter();
  const toast = useToast();
  const { businessId, refreshUser } = useAuth();
  const { data, loading, error, reload } = useAsync(async () => {
    const [settings, business] = await Promise.all([storeSettings.get(businessId), businesses.get(businessId)]);
    return { settings, business };
  }, [businessId]);
  const [draft, setDraft] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [business, setBusiness] = useState(null);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!data || draft) return;
    const next = storefrontDraft(data.settings);
    setDraft(next); setBaseline(snapshot(next)); setBusiness(data.business);
  }, [data, draft]);

  const dirty = Boolean(draft) && snapshot(draft) !== baseline;
  const { run: save, pending: saving, error: saveError, clearError } = useAction(async (payload) => {
    const saved = storefrontDraft(await storeSettings.update(businessId, payload));
    setDraft(saved); setBaseline(snapshot(saved));
    toast.success('Storefront saved');
  });
  const { run: upload, pending: uploading, error: uploadError } = useAction(async (kind) => {
    if (kind === 'logo') {
      const saved = await pickAndSaveLogo(businessId);
      if (saved) { setBusiness(saved); await refreshUser(); toast.success('Logo saved'); }
      return;
    }
    const asset = await pickImage({ aspect: [16, 9] });
    if (!asset) return;
    const image = await uploadImage(businessId, asset, { purpose: 'banner' });
    setDraft((prev) => ({ ...prev, banners: [...prev.banners, { imageKey: image.imageKey, imageUrl: image.publicUrl || asset.uri, link: '', alt: '', sortOrder: prev.banners.length }] }));
  });
  const busy = saving || uploading;

  useEffect(() => {
    navigation.setOptions?.({ gestureEnabled: !dirty && !busy });
    if (!dirty && !busy) return undefined;
    return navigation.addListener('beforeRemove', (event) => {
      event.preventDefault();
      if (busy) return;
      RNAlert.alert('Discard your changes?', 'Your storefront changes have not been saved.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(event.data.action) },
      ]);
    });
  }, [dirty, busy, navigation]);

  if (loading && !draft) return <SkeletonScreen />;
  if (error && !draft) return <ErrorState error={error} onRetry={reload} />;
  if (!draft) return null;

  const change = (key, value) => { setDraft((prev) => ({ ...prev, [key]: value })); setErrors({}); clearError(); };
  const changeBanner = (index, patch) => change('banners', draft.banners.map((banner, i) => i === index ? { ...banner, ...patch } : banner));
  const changeSection = (index, patch) => change('sections', draft.sections.map((section, i) => i === index ? { ...section, ...patch } : section));
  const submit = () => {
    const result = check(updateStoreSettingsSchema, storefrontPatch(draft));
    setErrors(result.errors);
    if (result.ok) save(result.data).catch(() => undefined);
  };
  const fieldErrors = mergeErrors(errors, saveError);
  const selected = STORE_STYLES.find((option) => Object.entries(option.theme).every(([key, value]) => draft.theme[key] === value));

  return (
    <Screen footer={<Button title="Save storefront" loading={saving} disabled={!dirty || busy} onPress={submit} />}>
      <Caption style={styles.intro}>Make your shop your own. Changes appear on your website after you save.</Caption>
      <StorePreview name={business?.name} slug={business?.slug} logoUri={business?.logoUrl} category={business?.category} theme={draft.theme} tiles={3} />
      <Row gap={space.sm} style={styles.actions}>
        <Button title="View website" variant="secondary" size="sm" full={false} onPress={() => Linking.openURL(storeUrl(business.slug)).catch(() => toast.error('Could not open the website'))} />
        <Button title={business?.logoUrl ? 'Change logo' : 'Upload logo'} variant="secondary" size="sm" full={false} disabled={busy} onPress={() => upload('logo').catch(() => undefined)} />
      </Row>
      <Caption>Logo uploads save immediately.</Caption>

      <Heading style={styles.heading}>Store style</Heading>
      <Caption style={styles.intro}>{selected ? selected.blurb : 'Your current custom style. Choose a look to change it.'}</Caption>
      <View style={styles.styles}>
        {STORE_STYLES.map((option) => (
          <Touchable key={option.id} disabled={busy} accessibilityRole="radio" accessibilityState={{ selected: selected?.id === option.id }} accessibilityLabel={`${option.label} store style`} onPress={() => change('theme', { ...draft.theme, ...option.theme })} style={[styles.style, selected?.id === option.id && styles.selected]}>
            <View style={[styles.swatch, { backgroundColor: option.theme.primaryColor }]} />
            <Body strong>{option.label}</Body>
            <Caption>{option.theme.layout === 'list' ? 'Product list' : 'Product grid'}</Caption>
          </Touchable>
        ))}
      </View>

      <Heading style={styles.heading}>Announcement</Heading>
      <Card style={styles.card}>
        <Field label="Announcement text" placeholder="Free delivery on orders above ₹999" value={draft.announcement.text} maxLength={200} editable={!busy} error={fieldErrors['announcement.text']} onChangeText={(text) => change('announcement', { ...draft.announcement, text })} />
        <Toggle label="Show announcement" value={draft.announcement.enabled} disabled={busy} onChange={(enabled) => change('announcement', { ...draft.announcement, enabled })} />
      </Card>

      <Heading style={styles.heading}>Banners</Heading>
      <Caption style={styles.intro}>Add up to 10 photos. Wide images work best. Customers can swipe through them.</Caption>
      {draft.banners.map((banner, index) => (
        <Card key={banner.imageKey} style={styles.card}>
          {banner.imageUrl ? <Image source={{ uri: banner.imageUrl }} style={styles.banner} resizeMode="cover" accessibilityLabel={banner.alt || `Banner ${index + 1}`} /> : <Caption>Banner {index + 1}</Caption>}
          <Field label="Image description" value={banner.alt} maxLength={120} editable={!busy} error={fieldErrors[`banners.${index}.alt`]} onChangeText={(alt) => changeBanner(index, { alt })} hint="Describe the image for customers using a screen reader." />
          <Field label="Link (optional)" value={banner.link} editable={!busy} autoCapitalize="none" autoCorrect={false} placeholder="/products or https://…" error={fieldErrors[`banners.${index}.link`]} onChangeText={(link) => changeBanner(index, { link })} />
          <OrderButtons label={`banner ${index + 1}`} index={index} count={draft.banners.length} disabled={busy} onMove={(offset) => change('banners', moveItem(draft.banners, index, offset))} />
          <Button title="Remove banner" variant="secondary" size="sm" disabled={busy} onPress={() => change('banners', draft.banners.filter((_, i) => i !== index))} />
        </Card>
      ))}
      <Button title={uploading ? 'Uploading…' : 'Add banner'} variant="secondary" disabled={busy || draft.banners.length >= 10} onPress={() => upload('banner').catch(() => undefined)} />
      <Alert message={uploadError?.message} />

      <Heading style={styles.heading}>Home sections</Heading>
      <Caption style={styles.intro}>Choose what customers see first. Sections with no matching products stay hidden.</Caption>
      {draft.sections.map((section, index) => (
        <Card key={`${section.type}-${index}`} style={styles.card}>
          <Toggle label={SECTION_TITLES[section.type]} hint={section.type === 'sale' ? 'Products marked on sale or priced below MRP.' : section.type === 'featured' ? 'Products marked featured.' : section.type === 'best_sellers' ? 'Products with orders, most popular first.' : 'Products marked new, or your newest products.'} value={section.enabled} disabled={busy} onChange={(enabled) => changeSection(index, { enabled })} />
          <Field label="Section title" value={section.title} maxLength={60} editable={!busy} error={fieldErrors[`sections.${index}.title`]} onChangeText={(title) => changeSection(index, { title })} />
          <OrderButtons label={section.title} index={index} count={draft.sections.length} disabled={busy} onMove={(offset) => change('sections', moveItem(draft.sections, index, offset))} />
        </Card>
      ))}
      {Object.entries(SECTION_TITLES).filter(([type]) => !draft.sections.some((s) => s.type === type)).map(([type, title]) => <Button key={type} title={`Add ${title}`} variant="secondary" disabled={busy || draft.sections.length >= 8} onPress={() => change('sections', [...draft.sections, { type, title, enabled: true, sortOrder: draft.sections.length }])} style={styles.card} />)}

      <Heading style={styles.heading}>Coupon offers</Heading>
      <Caption style={styles.intro}>Turn on “Show on storefront” for each coupon you want to advertise. Only live offers appear.</Caption>
      <Button title="Manage coupons" variant="secondary" disabled={busy} onPress={() => router.push('/coupons')} />
      <Alert message={Object.values(fieldErrors).filter(Boolean).join('\n') || saveError?.message} />
    </Screen>
  );
}

function OrderButtons({ label, index, count, disabled, onMove }) {
  return <Row gap={space.sm} style={styles.actions}>
    <Button title="Move up" accessibilityLabel={`Move ${label} up`} variant="secondary" size="sm" full={false} disabled={disabled || index === 0} onPress={() => onMove(-1)} />
    <Button title="Move down" accessibilityLabel={`Move ${label} down`} variant="secondary" size="sm" full={false} disabled={disabled || index === count - 1} onPress={() => onMove(1)} />
  </Row>;
}

const styles = StyleSheet.create({
  heading: { marginTop: space.xl, marginBottom: space.md },
  intro: { marginBottom: space.md },
  actions: { flexWrap: 'wrap', marginVertical: space.md },
  card: { marginBottom: space.md },
  styles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  style: { width: '47%', padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, gap: space.xs },
  selected: { borderColor: colors.accent600, backgroundColor: colors.accent50 },
  swatch: { width: 26, height: 26, borderRadius: 13 },
  banner: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.md, marginBottom: space.md },
});
