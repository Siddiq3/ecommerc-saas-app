import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../src/components/Screen.jsx';
import { Alert, Body, Button, Caption, Field, Heading, Label, Row, Toggle, Touchable } from '../../src/components/ui.jsx';
import {
  Option, PostTile, ProductOption, ReplyPreview, SUGGESTED_WORDS, TARGETS, canTurnOn, instagramError, targetName,
} from '../../src/components/instagram.jsx';
import { useToast } from '../../src/components/Toast.jsx';
import { useAuth } from '../../src/state/auth.jsx';
import { useAction, useAsync } from '../../src/lib/useAsync.js';
import { instagram, products } from '../../src/api/endpoints.js';
import { productUrl } from '../../src/lib/storefront.js';
import { formatMoney } from '../../src/lib/format.js';
import { colors, radius, space } from '../../src/theme.js';

/**
 * New automation, one question per step: where to reply, which product, which word, then a review showing the exact
 * message customers will get. Back and Next stay pinned at the bottom.
 */

const STEPS = ['Where should we reply?', 'Which product should they get?', 'Which word should customers send?', 'Check and save'];
const COLUMNS = 3;

export default function NewAutomation() {
  const router = useRouter();
  const toast = useToast();
  const { business, businessId } = useAuth();
  const { width } = useWindowDimensions();
  const [step, setStep] = useState(0);
  const [target, setTarget] = useState('');
  const [productId, setProductId] = useState('');
  const [keyword, setKeyword] = useState('LINK');
  const [turnOn, setTurnOn] = useState(true);
  const [error, setError] = useState('');
  const [olderPosts, setOlderPosts] = useState({ items: [], cursor: undefined, loading: false });

  const { data, loading, error: loadError, reload } = useAsync(async () => {
    if (!businessId) return null;
    const [status, media, catalog] = await Promise.all([
      instagram.status(businessId),
      instagram.media(businessId).catch((error) => ({ items: [], nextCursor: null, error })),
      products.list(businessId, { limit: 50, active: 'true' }),
    ]);
    return { status, media: media.items ?? [], mediaError: media.error, nextCursor: media.nextCursor ?? null, catalog: (catalog.items ?? []).filter((p) => p.active) };
  }, [businessId]);

  const status = data?.status;
  const media = [...(data?.media ?? []), ...olderPosts.items];
  const cursor = olderPosts.cursor === undefined ? data?.nextCursor : olderPosts.cursor;
  const catalog = data?.catalog ?? [];
  const product = catalog.find((p) => p.productId === productId);
  const word = keyword.trim().toUpperCase();
  const wordOk = /^[A-Z0-9]{1,40}$/.test(word);
  const canOn = canTurnOn(status, target);
  const valid = [Boolean(target), Boolean(productId), wordOk, true];
  // Three tiles across the screen, with the page's own side padding and two gaps between them.
  const tile = Math.floor((width - space.lg * 2 - space.sm * (COLUMNS - 1)) / COLUMNS);

  const loadOlder = async () => {
    if (!cursor || olderPosts.loading) return;
    setOlderPosts((prev) => ({ ...prev, loading: true }));
    try {
      const next = await instagram.media(businessId, cursor);
      setOlderPosts((prev) => ({ items: [...prev.items, ...(next?.items ?? [])], cursor: next?.nextCursor ?? null, loading: false }));
    } catch (e) {
      setOlderPosts((prev) => ({ ...prev, loading: false }));
      setError(instagramError(e));
    }
  };

  const { run: save, pending: saving, error: saveError } = useAction(async () => {
      setError('');
      await instagram.createRule(businessId, { mediaId: target, productId, keyword: word, active: turnOn && canOn });
      toast.success(turnOn && canOn ? 'Automation is on' : 'Automation saved');
      router.back();
  });

  const footer = (
    <Row gap={space.sm}>
      {step > 0 ? (
        <View style={{ flex: 1 }}><Button title="Back" variant="secondary" disabled={saving} onPress={() => setStep(step - 1)} /></View>
      ) : null}
      <View style={{ flex: 2 }}>
        {step < STEPS.length - 1 ? (
          <Button title="Next" disabled={!valid[step]} onPress={() => { setError(''); setStep(step + 1); }} />
        ) : (
          <Button title="Save automation" loading={saving} disabled={saving || !valid.every(Boolean)} onPress={() => save().catch(() => undefined)} />
        )}
      </View>
    </Row>
  );

  if (loading) {
    return <Screen><View style={styles.center}><ActivityIndicator color={colors.accent600} /></View></Screen>;
  }
  if (loadError || !data) {
    return <Screen>
      <Alert message={loadError ? instagramError(loadError) : 'Your store could not be loaded.'} />
      <Button title="Try again" variant="secondary" onPress={reload} />
    </Screen>;
  }

  return (
    <Screen footer={footer}>
      <Caption>Step {step + 1} of {STEPS.length}</Caption>
      <Row gap={space.xs} style={styles.progress}>
        {STEPS.map((s, i) => <View key={s} style={[styles.progressBar, i <= step && styles.progressDone]} />)}
      </Row>
      <Heading style={styles.question}>{STEPS[step]}</Heading>
      <Alert message={error || (saveError ? instagramError(saveError) : '')} />

      {step === 0 ? (
        <>
          {Object.entries(TARGETS).map(([id, t]) => (
            <Option key={id} chosen={target === id} icon={t.icon} title={t.title}
              subtitle={id === 'DM' && !status?.messagesReady ? 'Needs message access. It will be saved as off.' : t.subtitle}
              onPress={() => setTarget(id)} />
          ))}
          <Label style={styles.group}>Or just one post or Reel</Label>
          {data.mediaError ? <>
            <Alert message="Could not load your posts or Reels. You can still choose all posts or direct messages." />
            <Button title="Retry posts" variant="secondary" size="sm" onPress={reload} />
          </> : media.length === 0 ? <Caption>No posts found on this account yet.</Caption> : (
            <View style={styles.grid}>
              {media.map((m) => <PostTile key={m.id} post={m} size={tile} chosen={target === m.id} onPress={() => setTarget(m.id)} />)}
            </View>
          )}
          {cursor ? (
            <Button title="Show older posts" variant="ghost" size="sm" loading={olderPosts.loading} onPress={loadOlder} />
          ) : null}
        </>
      ) : null}

      {step === 1 ? (
        catalog.length === 0 ? (
          <Body muted>No active products. Add a product first, then come back.</Body>
        ) : catalog.map((p) => (
          <ProductOption key={p.productId} product={p} chosen={productId === p.productId} onPress={() => setProductId(p.productId)} />
        ))
      ) : null}

      {step === 2 ? (
        <>
          <Caption style={{ marginBottom: space.md }}>Tap a suggestion or type your own word.</Caption>
          <Row gap={space.sm} style={styles.chips}>
            {SUGGESTED_WORDS.map((w) => (
              <Touchable key={w} onPress={() => setKeyword(w)} accessibilityLabel={`Use ${w}`}
                style={[styles.chip, word === w && styles.chipChosen]}>
                <Label style={{ color: word === w ? colors.accent700 : colors.ink700 }}>{w}</Label>
              </Touchable>
            ))}
          </Row>
          <Field value={keyword} onChangeText={setKeyword} autoCapitalize="characters" autoCorrect={false}
            maxLength={40} placeholder="LINK" accessibilityLabel="Keyword"
            error={keyword && !wordOk ? 'Use one word: letters and numbers only.' : undefined}
            hint="Capital or small letters both work. Punctuation is ignored." />
        </>
      ) : null}

      {step === 3 ? (
        <>
          <View style={styles.summary}>
            <SummaryRow label="Where" value={targetName(target, media)} onChange={() => setStep(0)} />
            <SummaryRow label="Product" value={product ? `${product.name} · ${formatMoney(product.price)}` : '—'} onChange={() => setStep(1)} />
            <SummaryRow label="Word" value={`"${word}"`} onChange={() => setStep(2)} last />
          </View>
          <ReplyPreview product={product} word={word} target={target}
            productLink={business?.slug && product ? productUrl(business.slug, product) : null} />
          <View style={{ marginTop: space.lg }}>
            <Toggle value={turnOn && canOn} disabled={!canOn} onChange={setTurnOn} label="Turn on now"
              hint={canOn ? 'Start replying as soon as it is saved.' : 'Not ready yet (see the checklist on the Social tab). It will be saved as off.'} />
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const SummaryRow = ({ label, value, onChange, last }) => (
  <Row style={[styles.summaryRow, !last && styles.summaryDivider]}>
    <Caption style={styles.summaryLabel}>{label}</Caption>
    <Body strong numberOfLines={1} style={{ flex: 1 }}>{value}</Body>
    <Touchable onPress={onChange} accessibilityLabel={`Change ${label.toLowerCase()}`}>
      <Row gap={2}><Label style={{ color: colors.accent700 }}>Change</Label><Ionicons name="chevron-forward" size={14} color={colors.accent700} /></Row>
    </Touchable>
  </Row>
);

const styles = StyleSheet.create({
  center: { paddingVertical: space.xxxl, alignItems: 'center' },
  progress: { marginTop: space.sm },
  progressBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.ink200 },
  progressDone: { backgroundColor: colors.accent600 },
  question: { marginTop: space.lg, marginBottom: space.lg },
  group: { marginTop: space.md, marginBottom: space.md, color: colors.ink600 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, rowGap: space.md },
  chips: { flexWrap: 'wrap', marginBottom: space.md },
  chip: {
    paddingHorizontal: space.md, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1,
    borderColor: colors.line, backgroundColor: colors.surface,
  },
  chipChosen: { borderColor: colors.accent600, backgroundColor: colors.accent50 },
  summary: { backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: space.lg, marginBottom: space.lg },
  summaryRow: { paddingVertical: space.md },
  summaryDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  summaryLabel: { width: 72 },
});
