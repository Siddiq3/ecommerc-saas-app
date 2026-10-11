import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert as NativeAlert, AppState, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { instagram, products } from '../api/endpoints.js';
import { Alert, Body, Button, Caption, Card, Heading, Pill, Row, Touchable } from './ui.jsx';
import { SectionHeader } from './domain.jsx';
import { useRefreshOnFocus } from '../lib/useAsync.js';
import { InstagramMark, RuleArt, canTurnOn, instagramError as failure, targetName } from './instagram.jsx';
import { colors, space, type } from '../theme.js';

/**
 * The Social tab's Instagram overview: the connection, what it has done, and the seller's automations. Creating one
 * and changing one each have their own screen (app/instagram/new.jsx, app/instagram/[ruleId].jsx).
 */

const COMMENT_SCOPES = ['instagram_business_basic', 'instagram_business_manage_comments'];
const MESSAGES_SCOPE = 'instagram_business_manage_messages';

const STATUS = {
  connected: { label: 'Connected', tone: 'green' },
  expired: { label: 'Access expired', tone: 'amber' },
  reauthorization_required: { label: 'Reconnect needed', tone: 'amber' },
};

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

const MiniStat = ({ label, value, icon }) => (
  <View style={styles.miniStat}>
    <Ionicons name={icon} size={15} color={colors.ink400} />
    <Text style={styles.miniValue}>{value}</Text>
    <Caption>{label}</Caption>
  </View>
);

export function InstagramPanel({ businessId, onEnabled, onConnected }) {
  const [status, setStatus] = useState({ status: 'disconnected', enabled: false });
  const [media, setMedia] = useState([]);
  const [rules, setRules] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(Boolean(businessId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    if (!businessId) { setLoading(false); return; }
    try {
      const current = await instagram.status(businessId);
      setStatus(current ?? { status: 'disconnected', enabled: false });
      onEnabled?.(Boolean(current?.enabled));
      onConnected?.(Boolean(current?.status && current.status !== 'disconnected'));
      if (current?.status === 'connected' && current.enabled) {
        const [r, p, a] = await Promise.allSettled([
          instagram.rules(businessId), products.list(businessId, { limit: 50, active: 'true' }), instagram.report(businessId),
        ]);
        // A failed list request must not look like a store with no automations.
        if (r.status === 'rejected') throw r.reason;
        const list = r.status === 'fulfilled' ? r.value?.items ?? [] : [];
        setRules(list);
        if (p.status === 'fulfilled') setCatalog(p.value?.items ?? []);
        if (a.status === 'fulfilled') setReport(a.value);
        // Post pictures only matter when a rule names a post.
        if (list.some((x) => !['ALL', 'DM'].includes(x.mediaId))) {
          const m = await instagram.media(businessId).catch(() => null);
          if (m) setMedia(m.items ?? []);
        }
      } else { setMedia([]); setRules([]); setReport(null); setCatalog([]); }
      setError('');
    } catch (e) { setError(failure(e)); }
    finally { setLoading(false); }
  }, [businessId, onEnabled, onConnected]);
  useEffect(() => { void reload(); }, [reload]);
  // Back from a new or changed automation: show it.
  useFocusEffect(useRefreshOnFocus(reload));

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

  const perform = async (fn) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await fn(); await reload(); }
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
  const missing = status.missingPermissions ?? [];
  const commentsOk = !missing.some((p) => COMMENT_SCOPES.includes(p)) && status.webhook === 'subscribed';
  const messagesOk = Boolean(status.messagesReady);
  const handledCount = report?.commentsProcessed ?? 0;
  const ready = canTurnOn(status, 'ALL');

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
          {/* ───────────── Automations ───────────── */}
          <SectionHeader title="Automations" />
          <Card style={styles.block} padded={false}>
            {rules.length === 0 ? (
              <View style={styles.empty}>
                <Body strong>No automations yet</Body>
                <Caption style={{ marginTop: 2 }}>Choose a word like LINK, and the product customers should get.</Caption>
              </View>
            ) : rules.map((rule, index) => (
              <Touchable key={rule.id} onPress={() => router.push(`/instagram/${encodeURIComponent(rule.id)}`)}
                accessibilityLabel={`Automation for ${rule.keyword}`} style={[styles.rule, index > 0 && styles.divider]}>
                <Row gap={space.md}>
                  <RuleArt target={rule.mediaId} media={media} />
                  <View style={{ flex: 1 }}>
                    <Body strong numberOfLines={1}>&quot;{rule.keyword}&quot; → {catalog.find((p) => p.productId === rule.productId)?.name ?? 'Product'}</Body>
                    <Caption numberOfLines={1}>{targetName(rule.mediaId, media)}</Caption>
                  </View>
                  <Pill label={rule.active ? 'On' : 'Off'} tone={rule.active ? 'green' : 'slate'} />
                  <Ionicons name="chevron-forward" size={18} color={colors.ink400} />
                </Row>
              </Touchable>
            ))}
          </Card>
          <Button title="New automation" style={styles.newButton} onPress={() => router.push('/instagram/new')}
            icon={<Ionicons name="add" size={20} color="#ffffff" />} />
          {!ready ? <Caption style={styles.newHint}>You can create automations now; they turn on once the checklist above is all green.</Caption> : null}

          {/* ───────────── Activity ───────────── */}
          <SectionHeader title="Activity" />
          <Card style={styles.last}>
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
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // SectionHeader brings its own top space; a card followed by one adds none.
  block: { marginBottom: 0 },
  last: { marginBottom: space.xl },
  checks: { marginTop: space.lg, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  check: { paddingVertical: space.xs },
  footnote: { marginTop: space.md },

  empty: { padding: space.lg },
  rule: { paddingHorizontal: space.lg, paddingVertical: space.md },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  newButton: { marginTop: space.md },
  newHint: { marginTop: space.sm, textAlign: 'center' },

  miniStat: { flex: 1, alignItems: 'center', gap: 3 },
  miniValue: { ...type.figure, fontSize: 20, color: colors.ink900 },
  statSplit: { width: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  activityFoot: { marginTop: space.lg, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
});
