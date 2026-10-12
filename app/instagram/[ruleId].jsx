import { useState } from 'react';
import { ActivityIndicator, Alert as NativeAlert, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen.jsx';
import { Ionicons } from '@expo/vector-icons';
import { Alert, Body, Button, Card, Caption, Row, Toggle, Touchable } from '../../src/components/ui.jsx';
import { Sheet } from '../../src/components/Sheet.jsx';
import { SectionHeader } from '../../src/components/domain.jsx';
import { ReplyPreview, RuleArt, readinessHint, readinessLabel, instagramError, targetName } from '../../src/components/instagram.jsx';
import { useToast } from '../../src/components/Toast.jsx';
import { useAuth } from '../../src/state/auth.jsx';
import { useAsync } from '../../src/lib/useAsync.js';
import { InstagramProductPicker } from '../../src/components/InstagramProductPicker.jsx';
import { useProductSearch } from '../../src/lib/useProductSearch.js';
import { usePlan } from '../../src/state/plan.jsx';
import { instagram } from '../../src/api/endpoints.js';
import { productUrl } from '../../src/lib/storefront.js';
import { formatMoney } from '../../src/lib/format.js';
import { colors, radius, space, type } from '../../src/theme.js';

/** One automation: what it sends, on or off, which product, or delete it. */
export default function AutomationDetails() {
  const router = useRouter();
  const toast = useToast();
  const { ruleId } = useLocalSearchParams();
  const { business, businessId } = useAuth();
  const { entitled } = usePlan();
  const search = useProductSearch(businessId, entitled === true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(false);

  const { data, loading, error: loadError, reload, setData } = useAsync(async () => {
    if (!businessId) return null;
    let rule;
    try { rule = await instagram.rule(businessId, ruleId); }
    catch (e) { if (e.status === 404) return { rule: null }; throw e; }
    const media = rule.media ? [rule.media] : !['ALL','DM'].includes(rule.mediaId)
      ? (await instagram.media(businessId).catch(() => null))?.items ?? [] : [];
    return { rule, media };
  }, [businessId, ruleId]);

  const update = async (change, message) => {
    setBusy(true); setError('');
    try {
      const rule = await instagram.updateRule(businessId, ruleId, change);
      setData((prev) => ({ ...prev, rule }));
      toast.success(message(rule));
    } catch (e) { setError(instagramError(e)); }
    finally { setBusy(false); }
  };
  const remove = () => NativeAlert.alert('Delete this automation?',
    `Customers who send "${data.rule.keyword}" will not get a reply.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setBusy(true); setError('');
        try { await instagram.deleteRule(businessId, ruleId); toast.success('Automation deleted'); router.back(); }
        catch (e) { setError(instagramError(e)); setBusy(false); }
      } },
    ]);

  if (loading) {
    return <Screen><View style={styles.center}><ActivityIndicator color={colors.accent600} /></View></Screen>;
  }
  if (loadError) {
    return <Screen>
      <Alert message={instagramError(loadError)} />
      <Button title="Try again" variant="secondary" onPress={reload} />
    </Screen>;
  }
  if (!data?.rule) {
    return (
      <Screen>
        <Body muted style={{ marginTop: space.lg }}>This automation no longer exists.</Body>
        <Button title="Back to Social" variant="secondary" style={{ marginTop: space.lg }} onPress={() => router.back()} />
      </Screen>
    );
  }

  const { rule, media } = data;
  const product = rule.product;
  const canOn = entitled === true && Boolean(rule.readiness?.canActivate);

  return (
    <Screen>
      <Alert message={error} />

      {/* The automation as one sentence: where, the word, the product, and whether it is on. */}
      <Card padded={false} style={styles.hero}>
        <Row gap={space.md} style={styles.heroHead}>
          <RuleArt target={rule.mediaId} media={media} size={48} />
          <View style={{ flex: 1 }}>
            <Caption>Replies on</Caption>
            <Body strong numberOfLines={2}>{targetName(rule.mediaId, media)}</Body>
          </View>
        </Row>
        <View style={styles.flow}>
          <Row gap={space.md}>
            <View style={styles.flowIcon}><Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.accent700} /></View>
            <Caption style={{ flex: 1 }}>When customers send</Caption>
            <View style={styles.keyword}><Text style={styles.keywordText}>{rule.keyword}</Text></View>
          </Row>
          <View style={styles.flowLine} />
          <Row gap={space.md}>
            <View style={styles.flowIcon}><Ionicons name="bag-handle-outline" size={18} color={colors.accent700} /></View>
            <View style={{ flex: 1 }}>
              <Caption>They get</Caption>
              <Body strong numberOfLines={1}>{product?.name ?? 'Unavailable product'}{Number.isSafeInteger(product?.price) ? ` · ${formatMoney(product.price)}` : ''}</Body>
            </View>
            {entitled === true ? <Touchable onPress={() => setPicking(true)} accessibilityLabel="Change product" disabled={busy}>
              <Row gap={2}><Body style={styles.change}>Change</Body><Ionicons name="chevron-forward" size={14} color={colors.accent700} /></Row>
            </Touchable> : null}
          </Row>
        </View>
        <View style={styles.heroToggle}>
          <Toggle value={rule.active} disabled={busy || (!rule.active && !canOn)} label={readinessLabel(rule)}
            hint={readinessHint(rule)}
            onChange={(on) => update({ active: on }, (r) => (r.active ? 'Automation is on' : 'Automation paused'))} />
        </View>
      </Card>
      {entitled === false ? <Caption style={styles.note}>Your subscription has expired. You can pause or delete this automation, or disconnect Instagram.</Caption> : null}

      <SectionHeader title="Preview" />
      <ReplyPreview product={product} word={rule.keyword} target={rule.mediaId}
        productLink={business?.slug && product ? productUrl(business.slug, product) : null} />

      <Touchable onPress={remove} disabled={busy} accessibilityLabel="Delete automation" style={styles.delete}>
        <Row gap={space.sm}>
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
          <Body style={styles.deleteText}>Delete automation</Body>
        </Row>
      </Touchable>

      <Sheet visible={picking} onClose={() => setPicking(false)} title="Product they get">
        <InstagramProductPicker search={search} selectedId={rule.productId} disabled={busy}
          onSelect={p => {
            setPicking(false);
            if (p.productId !== rule.productId && !busy) void update({ productId: p.productId }, () => `Now using ${p.name}`);
          }} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: space.xxxl, alignItems: 'center' },
  hero: { overflow: 'hidden' },
  heroHead: { padding: space.lg },
  flow: { marginHorizontal: space.lg, padding: space.md, borderRadius: radius.md, backgroundColor: colors.accent50 },
  flowIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  // Joins the two steps so they read as cause and effect.
  flowLine: { width: 2, height: space.md, marginLeft: 17, marginVertical: space.xs, backgroundColor: colors.accent200 },
  keyword: { paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surface },
  keywordText: { ...type.label, fontSize: 15, color: colors.accent700, letterSpacing: 0.4 },
  change: { ...type.label, color: colors.accent700 },
  heroToggle: { padding: space.lg, marginTop: space.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  note: { marginTop: space.sm },
  delete: { alignSelf: 'center', marginTop: space.xxl, paddingVertical: space.md, paddingHorizontal: space.lg },
  deleteText: { ...type.label, color: colors.danger },
});
