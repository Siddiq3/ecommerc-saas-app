import { useState } from 'react';
import { ActivityIndicator, Alert as NativeAlert, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen.jsx';
import { Alert, Body, Button, Card, Caption, Heading, Row, Toggle } from '../../src/components/ui.jsx';
import { SectionHeader } from '../../src/components/domain.jsx';
import { ProductOption, ReplyPreview, RuleArt, canTurnOn, instagramError, targetName } from '../../src/components/instagram.jsx';
import { useToast } from '../../src/components/Toast.jsx';
import { useAuth } from '../../src/state/auth.jsx';
import { useAsync } from '../../src/lib/useAsync.js';
import { instagram, products } from '../../src/api/endpoints.js';
import { productUrl } from '../../src/lib/storefront.js';
import { colors, space } from '../../src/theme.js';

/** One automation: what it sends, on or off, which product, or delete it. */
export default function AutomationDetails() {
  const router = useRouter();
  const toast = useToast();
  const { ruleId } = useLocalSearchParams();
  const { business, businessId } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const { data, loading, error: loadError, reload, setData } = useAsync(async () => {
    if (!businessId) return null;
    const [rules, status, catalog] = await Promise.all([
      instagram.rules(businessId), instagram.status(businessId), products.list(businessId, { limit: 50, active: 'true' }),
    ]);
    const rule = (rules.items ?? []).find((r) => r.id === ruleId) ?? null;
    const media = rule && !['ALL', 'DM'].includes(rule.mediaId)
      ? (await instagram.media(businessId).catch(() => null))?.items ?? [] : [];
    return { rule, status, media, catalog: (catalog.items ?? []).filter((p) => p.active) };
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

  const { rule, status, media, catalog } = data;
  const product = catalog.find((p) => p.productId === rule.productId);
  const canOn = canTurnOn(status, rule.mediaId);

  return (
    <Screen>
      <Row gap={space.md} style={{ marginBottom: space.lg }}>
        <RuleArt target={rule.mediaId} media={media} size={56} />
        <View style={{ flex: 1 }}>
          <Heading>&quot;{rule.keyword}&quot; → {product?.name ?? 'Product'}</Heading>
          <Caption numberOfLines={1}>{targetName(rule.mediaId, media)}</Caption>
        </View>
      </Row>
      <Alert message={error} />

      <Card>
        <Toggle value={rule.active} disabled={busy || (!rule.active && !canOn)} label="Automation on"
          hint={rule.active ? 'Replying to customers now.' : canOn ? 'Off. Turn on to start replying.'
            : 'Off. It can be turned on once the checklist on the Social tab is all green.'}
          onChange={(on) => update({ active: on }, (r) => (r.active ? 'Automation is on' : 'Automation paused'))} />
      </Card>

      <SectionHeader title="Message customers get" />
      <ReplyPreview product={product} word={rule.keyword} target={rule.mediaId}
        productLink={business?.slug && product ? productUrl(business.slug, product) : null} />

      <SectionHeader title="Product they get" />
      {catalog.length === 0 ? <Body muted>No active products.</Body> : catalog.map((p) => (
        <ProductOption key={p.productId} product={p} chosen={p.productId === rule.productId}
          onPress={() => (p.productId === rule.productId || busy ? undefined
            : update({ productId: p.productId }, () => `Now sending ${p.name}`))} />
      ))}

      <Button title="Delete automation" variant="danger" style={{ marginTop: space.xl }} disabled={busy} onPress={remove} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: space.xxxl, alignItems: 'center' },
});
