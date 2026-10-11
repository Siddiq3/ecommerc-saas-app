import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert as NativeAlert, AppState, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { instagram, products } from '../api/endpoints.js';
import { Alert, Body, Button, Caption, Card, Field, Heading, Label, Pill, Row, Toggle, Touchable } from './ui.jsx';
import { SectionHeader, Thumb } from './domain.jsx';
import { formatMoney } from '../lib/format.js';
import { colors, radius, space, type } from '../theme.js';

/**
 * Instagram automation for the Social tab: the connection, what it has done, the seller's automations, and a guided
 * way to add one. Every rule answers one keyword with one product, on one post, on all posts, or in DMs.
 */

const INSTAGRAM = '#e1306c';
// Rules apply to one post or Reel, to every post (new ones included), or to direct messages.
const TARGETS = {
  ALL: { title: 'All posts and Reels', subtitle: 'Includes posts you add later', icon: 'albums-outline' },
  DM: { title: 'Direct messages', subtitle: 'When a customer sends the word in a DM', icon: 'chatbubbles-outline' },
};
const COMMENT_SCOPES = ['instagram_business_basic', 'instagram_business_manage_comments'];
const MESSAGES_SCOPE = 'instagram_business_manage_messages';
const SUGGESTED_WORDS = ['LINK', 'PRICE', 'DETAILS', 'BUY'];
const FIRST_PRODUCTS = 5;

const failure = (error) => {
  if (error?.code === 'INSTAGRAM_DISABLED') return 'Instagram connection is not enabled yet.';
  if (error?.code === 'INSTAGRAM_RECONNECT') return 'Instagram access expired. Disconnect and connect again.';
  if (error?.code === 'PLAN_LIMIT_EXCEEDED') return 'Your trial has ended. You can still pause automations or disconnect.';
  if (error?.code === 'INSTAGRAM_RULE_EXISTS') return 'You already have an automation for that word there.';
  if (error?.code === 'INSTAGRAM_PRODUCT_UNAVAILABLE') return 'That product is hidden or deleted. Choose an active product.';
  if (error?.code === 'INSTAGRAM_CONFIRMATION_INVALID') return 'This Instagram connection request has expired. Please connect again.';
  if (error?.code === 'INSTAGRAM_CONNECT_FAILED') return 'Could not connect. This Instagram account may already be connected to another store.';
  if (error?.code === 'INSTAGRAM_MEDIA_UNAVAILABLE') return 'Choose one of your recent posts or Reels.';
  if (error?.code === 'INSTAGRAM_PERMISSIONS_MISSING') return 'Instagram did not allow comment access. Disconnect, connect again and allow all permissions.';
  if (error?.code === 'INSTAGRAM_WEBHOOK_NOT_READY') return 'Comment updates are not on yet. Tap "Check connection", then try again.';
  if (error?.code === 'INSTAGRAM_MESSAGES_NOT_READY') return 'Instagram did not allow message access. Disconnect, connect again and allow messages.';
  return 'Something went wrong. Please try again.';
};

const STATUS = {
  connected: { label: 'Connected', tone: 'green' },
  expired: { label: 'Access expired', tone: 'amber' },
  reauthorization_required: { label: 'Reconnect needed', tone: 'amber' },
};

const InstagramMark = ({ size = 44 }) => (
  <View style={[styles.mark, { width: size, height: size }]}>
    <Ionicons name="logo-instagram" color="#ffffff" size={size * 0.55} />
  </View>
);

/** One line of the readiness checklist: what works, and the one thing to do when it does not. */
const Check = ({ ok, title, fix }) => (
  <Row gap={space.sm} align="flex-start" style={styles.check}>
    <Ionicons name={ok ? 'checkmark-circle' : 'alert-circle'} size={18}
      color={ok ? colors.success : colors.warning} style={{ marginTop: 2 }} />
    <View style={{ flex: 1 }}>
      <Body>{title}</Body>
      {!ok && fix ? <Caption style={{ color: colors.warning }}>{fix}</Caption> : null}
    </View>
  </Row>
);

/** A selectable row: a picture or icon, a title, and a radio mark. */
const Option = ({ chosen, title, subtitle, onPress, uri, icon, label }) => (
  <Touchable accessibilityLabel={title} accessibilityRole="radio" accessibilityState={{ selected: chosen }}
    onPress={onPress} style={[styles.option, chosen && styles.optionChosen]}>
    <Row gap={space.md}>
      {icon && !uri ? (
        <View style={[styles.optionIcon, chosen && { backgroundColor: colors.accent100 }]}>
          <Ionicons name={icon} size={20} color={chosen ? colors.accent700 : colors.ink500} />
        </View>
      ) : (
        <Thumb uri={uri} label={label} size={44} icon="image-outline" />
      )}
      <View style={{ flex: 1 }}>
        <Body strong numberOfLines={1}>{title}</Body>
        {subtitle ? <Caption numberOfLines={2}>{subtitle}</Caption> : null}
      </View>
      <Ionicons name={chosen ? 'checkmark-circle' : 'ellipse-outline'} size={22}
        color={chosen ? colors.accent600 : colors.ink200} />
    </Row>
  </Touchable>
);

/** A post or Reel as Instagram shows it: the picture first, a short caption under it. */
const PostTile = ({ post, chosen, onPress }) => (
  <Touchable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: chosen }}
    accessibilityLabel={`${post.mediaProductType === 'REELS' ? 'Reel' : 'Post'}: ${post.caption || 'no caption'}`}
    style={styles.tile} scaleTo={0.96}>
    <View style={[styles.tileImage, chosen && styles.tileChosen]}>
      {post.thumbnailUrl ? <Image source={{ uri: post.thumbnailUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        : <Ionicons name="image-outline" size={26} color={colors.ink400} />}
      {post.mediaProductType === 'REELS' ? (
        <View style={styles.tileKind}><Ionicons name="play" size={11} color="#ffffff" /></View>
      ) : null}
      {chosen ? <View style={styles.tileCheck}><Ionicons name="checkmark" size={14} color="#ffffff" /></View> : null}
    </View>
    <Caption numberOfLines={2} style={styles.tileCaption}>{post.caption || (post.mediaProductType === 'REELS' ? 'Reel' : 'Post')}</Caption>
  </Touchable>
);

const Step = ({ n, title, children }) => (
  <View style={styles.step}>
    <Row gap={space.sm} style={{ marginBottom: space.md }}>
      <View style={styles.stepNumber}><Text style={styles.stepNumberText}>{n}</Text></View>
      <Body strong style={{ flex: 1 }}>{title}</Body>
    </Row>
    {children}
  </View>
);

const MiniStat = ({ label, value, icon }) => (
  <View style={styles.miniStat}>
    <Ionicons name={icon} size={15} color={colors.ink400} />
    <Text style={styles.miniValue}>{value}</Text>
    <Caption>{label}</Caption>
  </View>
);

const replyPreview = (product, storeLink) => {
  const price = Number.isSafeInteger(product?.price) && product.price > 0 ? ` – ${formatMoney(product.price)}` : '';
  const host = String(storeLink ?? 'your store').replace(/^https?:\/\//, '');
  return { first: `${product?.name ?? 'Your product'}${price}`, second: `Shop here: ${host}/products/${product?.slug ?? '…'}` };
};

export function InstagramPanel({ businessId, onEnabled, onConnected, storeLink }) {
  const [status, setStatus] = useState({ status: 'disconnected', enabled: false });
  const [media, setMedia] = useState([]);
  const [rules, setRules] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [report, setReport] = useState(null);
  const [target, setTarget] = useState('');
  const [productId, setProductId] = useState('');
  const [keyword, setKeyword] = useState('LINK');
  const [turnOn, setTurnOn] = useState(true);
  const [allProducts, setAllProducts] = useState(false);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(Boolean(businessId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [nextCursor, setNextCursor] = useState(null);

  const reload = useCallback(async () => {
    if (!businessId) { setLoading(false); return; }
    try {
      const current = await instagram.status(businessId);
      setStatus(current ?? { status: 'disconnected', enabled: false });
      onEnabled?.(Boolean(current?.enabled));
      onConnected?.(Boolean(current?.status && current.status !== 'disconnected'));
      if (current?.status === 'connected' && current.enabled) {
        const [r, m, p, a] = await Promise.allSettled([
          instagram.rules(businessId), instagram.media(businessId),
          products.list(businessId, { limit: 50, active: 'true' }), instagram.report(businessId),
        ]);
        if (r.status === 'fulfilled') setRules(r.value?.items ?? []);
        if (m.status === 'fulfilled') { setMedia(m.value?.items ?? []); setNextCursor(m.value?.nextCursor ?? null); }
        if (p.status === 'fulfilled') setCatalog((p.value?.items ?? []).filter((x) => x.active));
        if (a.status === 'fulfilled') setReport(a.value);
      } else { setMedia([]); setRules([]); setReport(null); setCatalog([]); }
      setError('');
    } catch (e) { setError(failure(e)); }
    finally { setLoading(false); }
  }, [businessId, onEnabled, onConnected]);
  useEffect(() => { void reload(); }, [reload]);

  // Instagram login came back with a one-time code. Nothing is connected until this owner sees the account and agrees,
  // so a login link forwarded to someone else can never attach their Instagram to this store.
  const { igConfirm } = useLocalSearchParams();
  const handled = useRef(null);
  useEffect(() => {
    if (!businessId || typeof igConfirm !== 'string' || !/^[\w-]{43}$/.test(igConfirm) || handled.current === igConfirm) return;
    handled.current = igConfirm;
    router.setParams({ igConfirm: undefined });
    void (async () => {
      setBusy(true); setError('');
      try {
        const preview = await instagram.confirm(businessId, { confirmation: igConfirm, action: 'preview' });
        const accepted = await new Promise((resolve) => NativeAlert.alert('Connect this Instagram account?',
          `@${preview?.username} (${preview?.accountType === 'CREATOR' ? 'Creator' : 'Business'} account) will be connected to your store.`,
          [{ text: 'Cancel', style: 'cancel', onPress: () => resolve(false) }, { text: 'Connect', onPress: () => resolve(true) }],
          { cancelable: false }));
        await instagram.confirm(businessId, { confirmation: igConfirm, action: accepted ? 'accept' : 'decline' });
        await reload();
      } catch (e) { setError(failure(e)); }
      finally { setBusy(false); }
    })();
  }, [igConfirm, businessId, reload]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void reload(); });
    return () => subscription.remove();
  }, [reload]);

  const perform = async (fn, { refresh = true } = {}) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await fn(); if (refresh) await reload(); }
    catch (e) { setError(failure(e)); }
    finally { setBusy(false); }
  };
  const connect = () => perform(async () => {
    const started = await instagram.connect(businessId);
    if (!started?.authorizationUrl?.startsWith('https://www.instagram.com/oauth/authorize?'))
      throw new Error('Unsafe authorization URL');
    // Instagram login opens externally and returns through the registered app link with a one-time code that only
    // this signed-in owner can confirm. This is not a purchase or subscription flow.
    await Linking.openURL(started.authorizationUrl);
  });
  const disconnect = () => NativeAlert.alert('Disconnect Instagram?', 'Your automations will stop. You can connect again later.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Disconnect', style: 'destructive', onPress: () => void perform(() => instagram.disconnect(businessId)) },
  ]);
  const check = () => perform(async () => {
    const checked = await instagram.check(businessId);
    setStatus((prev) => ({ ...prev, ...checked }));
  });
  // Appends the next page in place. A full reload here would throw the new page away again.
  const loadMore = () => perform(async () => {
    if (!nextCursor) return;
    const next = await instagram.media(businessId, nextCursor);
    setMedia((prev) => [...prev, ...(next?.items ?? []).filter((item) => !prev.some((p) => p.id === item.id))]);
    setNextCursor(next?.nextCursor ?? null);
  }, { refresh: false });

  const missing = status.missingPermissions ?? [];
  const commentsOk = !missing.some((p) => COMMENT_SCOPES.includes(p)) && status.webhook === 'subscribed';
  const messagesOk = Boolean(status.messagesReady);
  const canTurnOn = (where) => Boolean(status.automationReady) && (where !== 'DM' || messagesOk);
  const productOf = (id) => catalog.find((p) => p.productId === id);
  const short = (text, max = 36) => (text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text);
  const targetName = (id) => TARGETS[id]?.title ?? short(media.find((m) => m.id === id)?.caption || 'One post or Reel');
  const word = keyword.trim().toUpperCase();
  const wordOk = /^[A-Z0-9]{1,40}$/.test(word);
  const chosenProduct = productOf(productId);

  const save = () => {
    if (!target || !productId || !wordOk) {
      setError('Choose where to reply, a product, and a word using letters or numbers.');
      return;
    }
    void perform(async () => {
      await instagram.createRule(businessId, { mediaId: target, productId, keyword: word, active: turnOn && canTurnOn(target) });
      setTarget(''); setProductId(''); setKeyword('LINK'); setAllProducts(false);
    });
  };
  const toggleRule = (rule) => perform(() => instagram.updateRule(businessId, rule.id, { active: !rule.active }));
  const changeProduct = (rule, id) => perform(async () => {
    await instagram.updateRule(businessId, rule.id, { productId: id });
    setEditing(null);
  });
  const deleteRule = (rule) => NativeAlert.alert('Delete this automation?', `Customers who send "${rule.keyword}" will not get a reply.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => void perform(() => instagram.deleteRule(businessId, rule.id)) },
  ]);

  if (loading) {
    return <Card style={styles.last}><ActivityIndicator color={colors.accent600} /></Card>;
  }

  /* ───────────── Not connected ───────────── */
  if (status.status === 'disconnected') {
    return (
      <Card style={styles.last}>
        <Row gap={space.md}>
          <InstagramMark />
          <View style={{ flex: 1 }}>
            <Heading>Connect Instagram</Heading>
            <Caption>Business and Creator accounts</Caption>
          </View>
        </Row>
        <Body muted style={{ marginTop: space.md }}>
          {status.enabled
            ? 'Reply to comments and messages with your product, price and link, automatically.'
            : 'Instagram connection is not available yet.'}
        </Body>
        <Alert message={error} />
        {status.enabled ? (
          <>
            <Button title="Connect Instagram" style={{ marginTop: space.lg }} disabled={busy} loading={busy} onPress={connect}
              icon={<Ionicons name="logo-instagram" size={18} color="#ffffff" />} />
            <Caption style={styles.footnote}>You will log in on Instagram, then confirm the account here.</Caption>
          </>
        ) : (
          <Button title="Refresh" variant="secondary" style={{ marginTop: space.lg }} onPress={reload} />
        )}
      </Card>
    );
  }

  const badge = STATUS[status.status] ?? STATUS.reauthorization_required;
  const connected = status.status === 'connected' && status.enabled;
  const handledCount = report?.commentsProcessed ?? 0;
  const productChoices = allProducts ? catalog : catalog.slice(0, FIRST_PRODUCTS);
  const preview = replyPreview(chosenProduct, storeLink);

  return (
    <View>
      <Alert message={error} />

      {/* ───────────── Connection ───────────── */}
      <Card style={connected ? styles.block : styles.last}>
        <Row gap={space.md}>
          <InstagramMark />
          <View style={{ flex: 1 }}>
            <Heading numberOfLines={1}>@{status.username}</Heading>
            <Caption>{status.accountType === 'CREATOR' ? 'Creator' : 'Business'} account</Caption>
          </View>
          <Pill label={badge.label} tone={badge.tone} />
        </Row>

        {connected ? (
          <View style={styles.checks}>
            <Check ok={commentsOk} title="Replies to comments"
              fix={missing.some((p) => COMMENT_SCOPES.includes(p))
                ? 'Comment access was not allowed. Disconnect and connect again.'
                : 'Comment updates are not on yet. Tap Check connection.'} />
            <Check ok={messagesOk} title="Replies to messages"
              fix={missing.includes(MESSAGES_SCOPE)
                ? 'Message access was not allowed. Disconnect and connect again to allow it.'
                : 'Message updates are not on yet. Tap Check connection.'} />
            <Check ok={status.storePublished !== false} title="Store is live"
              fix="Publish your store from Home. Customers only get links to a live store." />
          </View>
        ) : (
          <Body muted style={{ marginTop: space.md }}>
            {status.enabled ? 'Instagram access has stopped. Disconnect, then connect again to restart your automations.'
              : 'Instagram connection is not available right now.'}
          </Body>
        )}

        {status.expiresAt && connected ? (
          <Caption style={styles.footnote}>
            Access renews automatically · valid until {new Date(status.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </Caption>
        ) : null}
        <Row gap={space.sm} style={{ marginTop: space.lg }}>
          {connected ? (
            <View style={{ flex: 1 }}><Button title="Check connection" variant="secondary" size="sm" disabled={busy} onPress={check} /></View>
          ) : null}
          <View style={{ flex: 1 }}><Button title="Disconnect" variant="danger" size="sm" disabled={busy} onPress={disconnect} /></View>
        </Row>
      </Card>

      {connected ? (
        <>
          {/* ───────────── Activity ───────────── */}
          <SectionHeader title="Activity" />
          <Card style={styles.block}>
            <Row style={{ alignItems: 'stretch' }}>
              <MiniStat label="Replies sent" value={String(report?.repliesSent ?? 0)} icon="paper-plane-outline" />
              <View style={styles.statSplit} />
              <MiniStat label="Store visits" value={String(report?.visits ?? 0)} icon="eye-outline" />
              <View style={styles.statSplit} />
              <MiniStat label="Orders" value={String(report?.ordersPlaced ?? 0)} icon="receipt-outline" />
            </Row>
            <View style={styles.activityFoot}>
              <Caption>
                {handledCount} {handledCount === 1 ? 'comment or message' : 'comments and messages'} handled
                {report?.repliesFailed ? ` · ${report.repliesFailed} failed` : ''}
                {report?.repliesUncertain ? ` · ${report.repliesUncertain} not confirmed` : ''}
              </Caption>
              {report?.repliesUncertain ? (
                <Caption style={{ marginTop: 2 }}>Not confirmed: Instagram did not answer in time, so we did not send again.</Caption>
              ) : null}
              <Caption style={{ marginTop: 2 }}>
                {report?.partial ? 'Showing your latest 100. ' : ''}Orders are placed orders, not yet paid.
              </Caption>
            </View>
          </Card>

          {/* ───────────── Automations ───────────── */}
          <SectionHeader title="Your automations" />
          <Card style={styles.block} padded={rules.length > 0 ? false : undefined}>
            {rules.length === 0 ? (
              <Body muted>No automations yet. Create your first one below.</Body>
            ) : rules.map((rule, index) => {
              const product = productOf(rule.productId);
              const post = media.find((m) => m.id === rule.mediaId);
              return (
                <View key={rule.id} style={[styles.rule, index > 0 && styles.ruleDivider]}>
                  <Row gap={space.md} align="flex-start">
                    {TARGETS[rule.mediaId] ? (
                      <View style={styles.optionIcon}><Ionicons name={TARGETS[rule.mediaId].icon} size={20} color={colors.ink500} /></View>
                    ) : <Thumb uri={post?.thumbnailUrl} size={44} icon="image-outline" />}
                    <View style={{ flex: 1 }}>
                      <Toggle value={rule.active} disabled={busy || (!rule.active && !canTurnOn(rule.mediaId))}
                        onChange={() => toggleRule(rule)}
                        label={`"${rule.keyword}" → ${product?.name ?? 'Product'}`}
                        hint={targetName(rule.mediaId)} />
                    </View>
                  </Row>
                  <Row gap={space.lg} style={styles.ruleActions}>
                    <Touchable onPress={() => setEditing(editing === rule.id ? null : rule.id)}
                      accessibilityLabel={editing === rule.id ? 'Cancel changing product' : 'Change product'}>
                      <Row gap={space.xs}>
                        <Ionicons name={editing === rule.id ? 'close' : 'swap-horizontal-outline'} size={16} color={colors.ink600} />
                        <Label style={{ color: colors.ink600 }}>{editing === rule.id ? 'Cancel' : 'Change product'}</Label>
                      </Row>
                    </Touchable>
                    <Touchable onPress={() => deleteRule(rule)} accessibilityLabel="Delete automation">
                      <Row gap={space.xs}><Ionicons name="trash-outline" size={16} color={colors.danger} /><Label style={{ color: colors.danger }}>Delete</Label></Row>
                    </Touchable>
                  </Row>
                  {editing === rule.id ? (
                    <View style={{ marginTop: space.md }}>
                      {catalog.map((p) => (
                        <Option key={p.productId} chosen={p.productId === rule.productId} uri={p.thumbUrl} label={p.name}
                          title={p.name ?? 'Product'} subtitle={formatMoney(p.price)} onPress={() => changeProduct(rule, p.productId)} />
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </Card>

          {/* ───────────── New automation ───────────── */}
          <SectionHeader title="New automation" />
          <Card style={styles.last}>
            <Step n="1" title="Where should we reply?">
              {Object.entries(TARGETS).map(([id, t]) => (
                <Option key={id} chosen={target === id} icon={t.icon} title={t.title}
                  subtitle={id === 'DM' && !messagesOk ? 'Needs message access (see above)' : t.subtitle}
                  onPress={() => setTarget(id)} />
              ))}
              <Caption style={styles.optionGroup}>Or just one post or Reel</Caption>
              {media.length === 0 ? <Caption>No posts found on this account yet.</Caption> : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tiles}
                  style={styles.tilesScroll}>
                  {media.map((m) => <PostTile key={m.id} post={m} chosen={target === m.id} onPress={() => setTarget(m.id)} />)}
                  {nextCursor ? (
                    <Touchable onPress={loadMore} disabled={busy} accessibilityLabel="Load older posts" style={styles.tile}>
                      <View style={[styles.tileImage, styles.tileMore]}>
                        {busy ? <ActivityIndicator color={colors.ink500} /> : <Ionicons name="arrow-forward" size={22} color={colors.ink500} />}
                      </View>
                      <Caption style={styles.tileCaption}>Older posts</Caption>
                    </Touchable>
                  ) : null}
                </ScrollView>
              )}
            </Step>

            <Step n="2" title="Which product should they get?">
              {catalog.length === 0 ? <Caption>No active products. Add or show a product first.</Caption> : null}
              {productChoices.map((p) => (
                <Option key={p.productId} chosen={productId === p.productId} uri={p.thumbUrl} label={p.name}
                  title={p.name ?? 'Product'} subtitle={formatMoney(p.price)} onPress={() => setProductId(p.productId)} />
              ))}
              {!allProducts && catalog.length > FIRST_PRODUCTS ? (
                <Button title={`Show all ${catalog.length} products`} variant="ghost" size="sm" onPress={() => setAllProducts(true)} />
              ) : null}
            </Step>

            <Step n="3" title="Which word should customers send?">
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
            </Step>

            {chosenProduct ? (
              <View style={styles.previewWrap}>
                <Caption style={{ marginBottom: space.sm }}>
                  When someone {target === 'DM' ? 'messages' : 'comments'} &quot;{word || '…'}&quot;, they get:
                </Caption>
                <View style={styles.bubble}>
                  <Body strong style={{ color: colors.ink900 }}>{preview.first}</Body>
                  <Body numberOfLines={1} style={{ color: colors.accent700 }}>{preview.second}</Body>
                </View>
              </View>
            ) : null}

            <View style={{ marginTop: space.lg }}>
              <Toggle value={turnOn && canTurnOn(target || 'ALL')} disabled={!canTurnOn(target || 'ALL')}
                onChange={setTurnOn} label="Turn on now"
                hint={canTurnOn(target || 'ALL') ? 'Start replying as soon as it is saved.' : 'Fix the items above first. It will be saved as off.'} />
            </View>
            <Button title="Save automation" style={{ marginTop: space.md }} disabled={busy || !target || !productId || !wordOk}
              loading={busy} onPress={save} />
          </Card>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // SectionHeader brings its own top space; a card followed by one adds none.
  block: { marginBottom: 0 },
  last: { marginBottom: space.xl },
  mark: { borderRadius: radius.sm, backgroundColor: INSTAGRAM, alignItems: 'center', justifyContent: 'center' },
  checks: { marginTop: space.lg, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  check: { paddingVertical: space.xs },
  footnote: { marginTop: space.md },

  miniStat: { flex: 1, alignItems: 'center', gap: 3 },
  miniValue: { ...type.figure, fontSize: 20, color: colors.ink900 },
  statSplit: { width: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  activityFoot: { marginTop: space.lg, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },

  rule: { padding: space.lg },
  ruleDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  ruleActions: { marginTop: space.xs, marginLeft: 44 + space.md },

  step: { marginBottom: space.xl },
  stepNumber: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.accent50, alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { ...type.label, color: colors.accent700 },
  option: {
    padding: space.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface,
    borderRadius: radius.md, marginBottom: space.sm,
  },
  optionChosen: { borderColor: colors.accent600, backgroundColor: colors.accent50 },
  optionIcon: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.sunken, alignItems: 'center', justifyContent: 'center' },
  optionGroup: { marginTop: space.sm, marginBottom: space.sm },

  chips: { flexWrap: 'wrap', marginBottom: space.md },

  // Bleeds to the card's edges so the strip scrolls under them rather than stopping short.
  tilesScroll: { marginHorizontal: -space.lg },
  tiles: { paddingHorizontal: space.lg, gap: space.md },
  tile: { width: 104 },
  tileImage: {
    width: 104, height: 104, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.sunken,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent',
  },
  tileChosen: { borderColor: colors.accent600 },
  tileMore: { borderColor: colors.line, borderWidth: 1, borderStyle: 'dashed', backgroundColor: colors.surface },
  tileKind: {
    position: 'absolute', left: 6, bottom: 6, width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(16,16,20,0.55)', alignItems: 'center', justifyContent: 'center',
  },
  tileCheck: {
    position: 'absolute', right: 6, top: 6, width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.accent600, alignItems: 'center', justifyContent: 'center',
  },
  tileCaption: { marginTop: space.xs, color: colors.ink600 },
  chip: {
    paddingHorizontal: space.md, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1,
    borderColor: colors.line, backgroundColor: colors.surface,
  },
  chipChosen: { borderColor: colors.accent600, backgroundColor: colors.accent50 },

  previewWrap: { padding: space.md, borderRadius: radius.md, backgroundColor: colors.sunken },
  bubble: {
    alignSelf: 'flex-start', maxWidth: '100%', paddingHorizontal: space.md, paddingVertical: space.sm,
    borderRadius: radius.md, borderTopLeftRadius: radius.xs, backgroundColor: colors.surface,
  },
});
