import { useEffect, useState } from 'react';
import { Alert as RNAlert, Image, Linking, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { updateStoreSettingsSchema } from '@storekit/validation';
import { Screen } from '../../src/components/Screen.jsx';
import { Sheet } from '../../src/components/Sheet.jsx';
import { InstagramProductPicker } from '../../src/components/InstagramProductPicker.jsx';
import { Alert, Body, Button, Caption, Card, ErrorState, Field, Heading, Row, Toggle, Touchable } from '../../src/components/ui.jsx';
import { SkeletonScreen } from '../../src/components/Skeleton.jsx';
import { StorePreview } from '../../src/components/StorePreview.jsx';
import { useToast } from '../../src/components/Toast.jsx';
import { useAuth } from '../../src/state/auth.jsx';
import { useAction, useAsync } from '../../src/lib/useAsync.js';
import { useProductSearch } from '../../src/lib/useProductSearch.js';
import { check, mergeErrors } from '../../src/lib/validation.js';
import { formatMoney } from '../../src/lib/format.js';
import {
  announcementIdeas, categoryLink, linkLabel, moveItem, productLink, readableOn, storefrontDraft, storefrontPatch,
} from '../../src/lib/merchandising.js';
import { STORE_STYLES } from '../../src/lib/storeStyles.js';
import { storeUrl } from '../../src/lib/storefront.js';
import { pickAndSaveLogo, pickImage, uploadImage } from '../../src/lib/upload.js';
import { businesses, categories as categoriesApi, coupons as couponsApi, storeSettings } from '../../src/api/endpoints.js';
import { colors, fonts, radius, space } from '../../src/theme.js';

/** Each home row, named and explained the way an owner thinks about it. */
const SECTIONS = {
  featured: { name: 'Featured products', hint: 'Products you marked "Featured".' },
  new_arrivals: { name: 'New arrivals', hint: 'Products marked "New", or your newest ones.' },
  sale: { name: 'On sale', hint: 'Products marked "On sale" or priced below MRP.' },
  best_sellers: { name: 'Best sellers', hint: 'Products customers order most.' },
};
const snapshot = (draft) => JSON.stringify(storefrontPatch(draft));

export default function StorefrontSettings() {
  const navigation = useNavigation();
  const router = useRouter();
  const toast = useToast();
  const { businessId, refreshUser } = useAuth();
  const { data, loading, error, reload } = useAsync(async () => {
    const [settings, business, cats, offers] = await Promise.all([
      storeSettings.get(businessId),
      businesses.get(businessId),
      categoriesApi.list(businessId).then((r) => r.items ?? r).catch(() => []),
      couponsApi.list(businessId).then((r) => r.items ?? r).catch(() => []),
    ]);
    return { settings, business, categories: cats, coupons: offers };
  }, [businessId]);
  const [draft, setDraft] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [business, setBusiness] = useState(null);
  const [errors, setErrors] = useState({});
  const [linking, setLinking] = useState(null); // index of the banner whose link is being chosen
  const [renaming, setRenaming] = useState(null); // section type whose title is being edited

  useEffect(() => {
    if (!data || draft) return;
    const next = storefrontDraft(data.settings);
    setDraft(next); setBaseline(snapshot(next)); setBusiness(data.business);
  }, [data, draft]);

  const dirty = Boolean(draft) && snapshot(draft) !== baseline;
  const { run: save, pending: saving, error: saveError, clearError } = useAction(async (payload) => {
    const saved = storefrontDraft(await storeSettings.update(businessId, payload));
    setDraft(saved); setBaseline(snapshot(saved));
    toast.success('Saved. Your website is updated.');
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
    setDraft((prev) => ({ ...prev, banners: [...prev.banners, { imageKey: image.imageKey, imageUrl: image.publicUrl || asset.uri, link: '/products', alt: 'Shop all products', sortOrder: prev.banners.length }] }));
  });
  const busy = saving || uploading;

  useEffect(() => {
    navigation.setOptions?.({ gestureEnabled: !dirty && !busy });
    if (!dirty && !busy) return undefined;
    return navigation.addListener('beforeRemove', (event) => {
      event.preventDefault();
      if (busy) return;
      RNAlert.alert('Leave without saving?', 'Your website changes have not been saved.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => navigation.dispatch(event.data.action) },
      ]);
    });
  }, [dirty, busy, navigation]);

  if (loading && !draft) return <SkeletonScreen />;
  if (error && !draft) return <ErrorState error={error} onRetry={reload} />;
  if (!draft) return null;

  const cats = data?.categories ?? [];
  const liveOffers = (data?.coupons ?? []).filter((c) => c.showOnStorefront && c.active !== false);
  const ideas = announcementIdeas(data?.settings, data?.coupons, formatMoney);

  const change = (key, value) => { setDraft((prev) => ({ ...prev, [key]: value })); setErrors({}); clearError(); };
  const changeBanner = (index, patch) => change('banners', draft.banners.map((banner, i) => (i === index ? { ...banner, ...patch } : banner)));
  const changeSection = (index, patch) => change('sections', draft.sections.map((section, i) => (i === index ? { ...section, ...patch } : section)));
  const setAnnouncement = (patch) => change('announcement', { ...draft.announcement, ...patch });
  const submit = () => {
    const result = check(updateStoreSettingsSchema, storefrontPatch(draft));
    setErrors(result.errors);
    if (result.ok) save(result.data).catch(() => undefined);
  };
  const fieldErrors = mergeErrors(errors, saveError);
  const selected = STORE_STYLES.find((option) => Object.entries(option.theme).every(([key, value]) => draft.theme[key] === value));

  // What a good website has, so an owner knows what is left to do.
  const checklist = [
    { label: 'Add your logo', done: Boolean(business?.logoUrl) },
    { label: 'Write a top message', done: Boolean(draft.announcement.enabled && draft.announcement.text) },
    { label: 'Add a banner photo', done: draft.banners.length > 0 },
    { label: 'Show an offer', done: liveOffers.length > 0 },
  ];
  const doneCount = checklist.filter((item) => item.done).length;

  return (
    <Screen footer={<Button title={dirty ? 'Save changes' : 'All changes saved'} loading={saving} disabled={!dirty || busy} onPress={submit} />}>
      <Card style={styles.checklist}>
        <View style={styles.checkHead}>
          <Heading>Make your website stand out</Heading>
          <Caption>{doneCount === checklist.length ? 'All done. Your website looks complete.' : `${doneCount} of ${checklist.length} done. Each takes about a minute.`}</Caption>
        </View>
        <View style={styles.progress}><View style={[styles.progressFill, { width: `${(doneCount / checklist.length) * 100}%` }]} /></View>
        {checklist.map((item) => (
          <Row key={item.label} gap={space.sm} style={styles.checkRow}>
            <Ionicons name={item.done ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={item.done ? colors.success : colors.ink400} />
            <Body style={[{ flex: 1 }, item.done && styles.checkDone]}>{item.label}</Body>
            {item.done ? <Caption style={{ color: colors.success }}>Done</Caption> : null}
          </Row>
        ))}
        <Button title="View my website" variant="secondary" style={styles.gap} icon={<Ionicons name="open-outline" size={18} color={colors.ink900} />}
          onPress={() => Linking.openURL(storeUrl(business.slug)).catch(() => toast.error('Could not open the website'))} />
      </Card>

      {/* Logo and look */}
      <Step icon="color-palette-outline" title="Logo and colours" help="Shown at the top of every page." />
      <StorePreview name={business?.name} slug={business?.slug} logoUri={business?.logoUrl} category={business?.category} theme={draft.theme} tiles={3} />
      <Button title={business?.logoUrl ? 'Change logo' : 'Upload logo'} variant="secondary" disabled={busy} style={styles.gap}
        icon={<Ionicons name="image-outline" size={18} color={colors.ink900} />} onPress={() => upload('logo').catch(() => undefined)} />
      <Caption style={styles.gapSm}>A square logo works best. It saves straight away.</Caption>
      <Body strong style={styles.subhead}>Pick a colour style</Body>
      <View style={styles.styles}>
        {STORE_STYLES.map((option) => (
          <Touchable key={option.id} disabled={busy} accessibilityRole="radio" accessibilityState={{ selected: selected?.id === option.id }} accessibilityLabel={`${option.label} style`} onPress={() => change('theme', { ...draft.theme, ...option.theme })} style={[styles.style, selected?.id === option.id && styles.selected]}>
            <View style={[styles.swatch, { backgroundColor: option.theme.primaryColor }]}>
              {selected?.id === option.id ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
            </View>
            <Body strong>{option.label}</Body>
          </Touchable>
        ))}
      </View>

      {/* Top message */}
      <Step icon="megaphone-outline" title="Top message" help="One short line in a coloured strip above your website. Tap an idea or write your own." />
      <View style={[styles.announcePreview, { backgroundColor: draft.theme.primaryColor }]}>
        <Text style={[styles.announceText, { color: readableOn(draft.theme.primaryColor) }]} numberOfLines={3}>{draft.announcement.text || 'Your message appears here'}</Text>
      </View>
      <View style={styles.chips}>
        {ideas.map((idea) => (
          <Touchable key={idea} disabled={busy} onPress={() => setAnnouncement({ text: idea, enabled: true })} accessibilityLabel={`Use: ${idea}`}
            accessibilityState={{ selected: draft.announcement.text === idea }} style={styles.chipHit}>
            <View style={[styles.chip, draft.announcement.text === idea && styles.chipOn]}>
              <Text style={[styles.chipText, draft.announcement.text === idea && styles.chipTextOn]}>{idea}</Text>
            </View>
          </Touchable>
        ))}
      </View>
      <Field label="Or write your own" placeholder="e.g. Diwali sale: 20% off all sarees" value={draft.announcement.text} maxLength={200} editable={!busy} multiline blurOnSubmit
        error={fieldErrors['announcement.text']} hint={`${draft.announcement.text.length}/200`}
        onChangeText={(text) => setAnnouncement({ text, enabled: text.trim() ? true : draft.announcement.enabled })} />
      <Toggle label="Show this message on my website" value={draft.announcement.enabled} disabled={busy} onChange={(enabled) => setAnnouncement({ enabled })} />

      {/* Banners */}
      <Step icon="images-outline" title="Banner photos" help="Big photos at the top of your home page. They slide one after another." />
      <Card style={styles.tip}>
        <Row gap={space.sm} align="flex-start">
          <Ionicons name="bulb-outline" size={18} color={colors.accent700} />
          <Caption style={{ flex: 1, color: colors.ink700 }}>Use a wide photo, like a phone held sideways. Your best product or a sale poster works well.</Caption>
        </Row>
      </Card>
      {draft.banners.length === 0 ? (
        <View style={styles.bannerPlaceholder}>
          <Ionicons name="images-outline" size={28} color={colors.ink400} />
          <Body strong>No banner yet</Body>
          <Caption style={{ textAlign: 'center' }}>Until you add one, your home page shows your shop name and a few product photos.</Caption>
        </View>
      ) : null}
      {draft.banners.map((banner, index) => (
        <Card key={banner.imageKey} style={styles.banner} padded={false}>
          {banner.imageUrl
            ? <Image source={{ uri: banner.imageUrl }} style={styles.bannerImage} resizeMode="cover" accessibilityLabel={banner.alt || `Banner ${index + 1}`} />
            : <View style={[styles.bannerImage, styles.bannerEmpty]}><Caption>Banner {index + 1}</Caption></View>}
          <View style={styles.bannerBody}>
            <Caption>When a customer taps it, open</Caption>
            <Touchable onPress={() => setLinking(index)} disabled={busy} style={styles.linkRow} accessibilityLabel={`Change where banner ${index + 1} opens. Now: ${linkLabel(banner.link, cats)}`}>
              <Ionicons name="link-outline" size={18} color={colors.accent700} />
              <Body strong style={{ flex: 1 }} numberOfLines={1}>{linkLabel(banner.link, cats)}</Body>
              <Text style={styles.linkChange}>Change</Text>
            </Touchable>
            {fieldErrors[`banners.${index}.link`] ? <Caption style={{ color: colors.danger }}>{fieldErrors[`banners.${index}.link`]}</Caption> : null}
            <Row gap={space.sm} style={styles.bannerActions}>
              <IconButton icon="arrow-up" label={`Move banner ${index + 1} up`} disabled={busy || index === 0} onPress={() => change('banners', moveItem(draft.banners, index, -1))} />
              <IconButton icon="arrow-down" label={`Move banner ${index + 1} down`} disabled={busy || index === draft.banners.length - 1} onPress={() => change('banners', moveItem(draft.banners, index, 1))} />
              <View style={{ flex: 1 }} />
              <IconButton icon="trash-outline" label={`Remove banner ${index + 1}`} tone="danger" disabled={busy} onPress={() => change('banners', draft.banners.filter((_, i) => i !== index))} />
            </Row>
          </View>
        </Card>
      ))}
      <Button title={uploading ? 'Uploading…' : draft.banners.length ? 'Add another banner' : 'Add a banner photo'} variant="secondary" disabled={busy || draft.banners.length >= 10}
        icon={<Ionicons name="add" size={18} color={colors.ink900} />} onPress={() => upload('banner').catch(() => undefined)} />
      {draft.banners.length >= 10 ? <Caption style={styles.gapSm}>You can show up to 10 banners.</Caption> : null}
      <Alert message={uploadError?.message} />

      {/* Home page rows */}
      <Step icon="grid-outline" title="Product rows on your home page" help="Turn rows on or off. Rows with no matching products stay hidden." />
      <Card padded={false}>
        {draft.sections.map((section, index) => (
          <View key={section.type} style={[styles.section, index > 0 && styles.sectionLine]}>
            <Toggle label={section.title || SECTIONS[section.type]?.name} hint={SECTIONS[section.type]?.hint} value={section.enabled} disabled={busy} onChange={(enabled) => changeSection(index, { enabled })} />
            {renaming === section.type ? (
              <Field label="Row title on website" value={section.title} maxLength={60} editable={!busy} autoFocus error={fieldErrors[`sections.${index}.title`]}
                onChangeText={(title) => changeSection(index, { title })} onBlur={() => setRenaming(null)} />
            ) : null}
            <Row gap={space.sm}>
              <Touchable onPress={() => setRenaming(renaming === section.type ? null : section.type)} disabled={busy} style={styles.textAction} accessibilityLabel={`Rename ${section.title}`}>
                <Text style={styles.linkChange}>{renaming === section.type ? 'Done' : 'Rename'}</Text>
              </Touchable>
              <View style={{ flex: 1 }} />
              <IconButton icon="arrow-up" label={`Move ${section.title} up`} disabled={busy || index === 0} onPress={() => change('sections', moveItem(draft.sections, index, -1))} />
              <IconButton icon="arrow-down" label={`Move ${section.title} down`} disabled={busy || index === draft.sections.length - 1} onPress={() => change('sections', moveItem(draft.sections, index, 1))} />
            </Row>
          </View>
        ))}
      </Card>
      {Object.entries(SECTIONS).filter(([type]) => !draft.sections.some((s) => s.type === type)).map(([type, info]) => (
        <Button key={type} title={`Add "${info.name}" row`} variant="ghost" disabled={busy || draft.sections.length >= 8} onPress={() => change('sections', [...draft.sections, { type, title: info.name, enabled: true, sortOrder: draft.sections.length }])} />
      ))}

      {/* Offers */}
      <Step icon="pricetag-outline" title="Offers on your website" help="Discount codes customers can copy on your home page." />
      <Card>
        <Body strong>{liveOffers.length ? `${liveOffers.length} ${liveOffers.length === 1 ? 'offer is' : 'offers are'} showing` : 'No offers showing yet'}</Body>
        <Caption style={styles.gapSm}>{liveOffers.length ? liveOffers.map((c) => c.code).join(', ') : 'Create a coupon and turn on "Show on storefront".'}</Caption>
        <Button title={liveOffers.length ? 'Manage offers' : 'Create an offer'} variant="secondary" disabled={busy} style={styles.gap} onPress={() => router.push('/coupons')} />
      </Card>

      <Alert message={Object.values(fieldErrors).filter(Boolean).join('\n') || saveError?.message} />

      <LinkSheet
        visible={linking !== null}
        businessId={businessId}
        categories={cats}
        current={linking !== null ? draft.banners[linking]?.link : ''}
        onClose={() => setLinking(null)}
        onPick={(link, name) => {
          const banner = draft.banners[linking];
          changeBanner(linking, { link, alt: name ? `Shop ${name}` : banner.alt });
          setLinking(null);
        }}
      />
    </Screen>
  );
}

/** A section: an icon for what it is, a title, and one line on what it is for. Owners can do these in any order. */
function Step({ icon, title, help }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepIcon}><Ionicons name={icon} size={18} color={colors.accent700} /></View>
      <View style={{ flex: 1 }}>
        <Heading>{title}</Heading>
        <Caption>{help}</Caption>
      </View>
    </View>
  );
}

function IconButton({ icon, label, onPress, disabled, tone }) {
  return (
    <Touchable onPress={onPress} disabled={disabled} accessibilityLabel={label} style={[styles.iconButton, disabled && { opacity: 0.35 }]}>
      <Ionicons name={icon} size={18} color={tone === 'danger' ? colors.danger : colors.ink700} />
    </Touchable>
  );
}

function LinkOption({ icon, title, subtitle, value, name, onPress, current, onPick }) {
  const chosen = value !== undefined && current === value;
  return (
    <Touchable onPress={onPress ?? (() => onPick(value, name))} style={[styles.option, chosen && styles.optionOn]} accessibilityLabel={title} accessibilityState={{ selected: chosen }}>
      <Ionicons name={icon} size={20} color={colors.accent700} />
      <View style={{ flex: 1 }}>
        <Body strong>{title}</Body>
        {subtitle ? <Caption>{subtitle}</Caption> : null}
      </View>
      <Ionicons name={chosen ? 'checkmark' : 'chevron-forward'} size={chosen ? 20 : 18} color={chosen ? colors.accent700 : colors.ink400} />
    </Touchable>
  );
}

/** Choose where a banner opens: nothing, all products, a category, a product, or a website, without typing a path. */
function LinkSheet({ visible, businessId, categories, current, onClose, onPick }) {
  const [mode, setMode] = useState('menu');
  const [web, setWeb] = useState('');
  const search = useProductSearch(businessId, visible && mode === 'product');
  useEffect(() => { if (visible) { setMode('menu'); setWeb(current?.startsWith('https://') ? current : ''); } }, [visible, current]);
  const validWeb = /^https:\/\/[^\s/]+\.[^\s]+$/.test(web.trim());


  return (
    <Sheet visible={visible} onClose={onClose} title={mode === 'product' ? 'Pick a product' : mode === 'web' ? 'Website link' : 'When tapped, open…'}>
      {mode === 'menu' ? (
        <>
          <LinkOption current={current} onPick={onPick} icon="grid-outline" title="All products" subtitle="Your full catalogue" value="/products" name="all products" />
          {categories.filter((c) => !c.parentId).map((c) => <LinkOption current={current} onPick={onPick} key={c.categoryId} icon="pricetags-outline" title={c.name} subtitle="Category" value={categoryLink(c)} name={c.name} />)}
          <LinkOption current={current} onPick={onPick} icon="shirt-outline" title="One product" subtitle="Search and pick" onPress={() => setMode('product')} />
          <LinkOption current={current} onPick={onPick} icon="globe-outline" title="Another website" subtitle="Instagram, YouTube or any https link" onPress={() => setMode('web')} />
          <LinkOption current={current} onPick={onPick} icon="image-outline" title="Nothing" subtitle="Just show the picture" value="" name="" />
        </>
      ) : null}
      {mode === 'product' ? (
        <>
          <InstagramProductPicker search={search} selectedId={null} onSelect={(p) => onPick(productLink(p), p.name)} />
          <Button title="Back" variant="ghost" onPress={() => setMode('menu')} />
        </>
      ) : null}
      {mode === 'web' ? (
        <>
          <Field label="Link" placeholder="https://instagram.com/yourshop" value={web} onChangeText={setWeb} autoCapitalize="none" autoCorrect={false} keyboardType="url"
            error={web && !validWeb ? 'Start with https:// and include the full address' : undefined} />
          <Button title="Use this link" disabled={!validWeb} onPress={() => onPick(web.trim(), '')} />
          <Button title="Back" variant="ghost" onPress={() => setMode('menu')} />
        </>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  checklist: { marginBottom: space.md },
  checkHead: { marginBottom: space.md, gap: space.xs },
  progress: { height: 6, borderRadius: radius.pill, backgroundColor: colors.sunken, overflow: 'hidden', marginBottom: space.md },
  progressFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.success },
  checkRow: { paddingVertical: 4 },
  checkDone: { color: colors.ink500 },
  step: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start', marginTop: space.xxl, marginBottom: space.md },
  stepIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent50, alignItems: 'center', justifyContent: 'center' },
  subhead: { marginTop: space.lg, marginBottom: space.sm },
  gap: { marginTop: space.md },
  gapSm: { marginTop: space.xs },
  styles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  style: { flexGrow: 1, flexBasis: '46%', flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  selected: { borderColor: colors.accent600, backgroundColor: colors.accent50 },
  swatch: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  announcePreview: { borderRadius: radius.sm, paddingVertical: space.sm, paddingHorizontal: space.md, marginBottom: space.md },
  announceText: { fontFamily: fonts.semibold, fontSize: 13, textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.sm, marginBottom: space.sm },
  // The visible chip stays compact; the touch area around it is 48dp tall.
  chipHit: { minHeight: 48, justifyContent: 'center' },
  chip: { paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.surface },
  chipOn: { borderColor: colors.accent600, backgroundColor: colors.accent50 },
  chipText: { fontFamily: fonts.medium, fontSize: 13.5, color: colors.ink700 },
  chipTextOn: { color: colors.accent700, fontFamily: fonts.semibold },
  tip: { backgroundColor: colors.accent50, borderColor: colors.accent100, marginBottom: space.md },
  banner: { marginBottom: space.md, overflow: 'hidden' },
  bannerImage: { width: '100%', aspectRatio: 16 / 9, backgroundColor: colors.sunken },
  bannerEmpty: { alignItems: 'center', justifyContent: 'center' },
  bannerPlaceholder: { alignItems: 'center', gap: space.xs, padding: space.xl, marginBottom: space.md, borderRadius: radius.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.lineStrong, backgroundColor: colors.surface },
  bannerBody: { padding: space.md, gap: space.xs },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48, paddingHorizontal: space.md, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.canvas },
  linkChange: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.accent700 },
  bannerActions: { marginTop: space.sm },
  iconButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas },
  section: { padding: space.md, gap: space.xs },
  sectionLine: { borderTopWidth: 1, borderTopColor: colors.line },
  textAction: { minHeight: 48, justifyContent: 'center', paddingRight: space.md },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56, paddingHorizontal: space.md, borderRadius: radius.sm },
  optionOn: { backgroundColor: colors.accent50 },
});
