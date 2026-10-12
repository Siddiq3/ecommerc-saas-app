import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert as NativeAlert, AppState, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { instagram } from '../api/endpoints.js';
import { Alert, Body, Button, Caption, Card, Heading, Pill, Row, Touchable } from './ui.jsx';
import { SectionHeader } from './domain.jsx';
import { useRefreshOnFocus } from '../lib/useAsync.js';
import { InstagramMark, RuleArt, readinessLabel, canTurnOn, instagramError as failure, targetName } from './instagram.jsx';
import { InstagramActivityPeriod, displayDay } from './InstagramActivityPeriod.jsx';
import { Sheet } from './Sheet.jsx';
import { CountUp } from './motion.jsx';
import { formatMoney, percentChange } from '../lib/format.js';
import { usePlan } from '../state/plan.jsx';
import { colors, fonts, radius, space, tones, type } from '../theme.js';

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

/** A tinted tile: an icon chip that names the metric by colour and shape, then the value, label and change in ink. */
const StatTile = ({ label, value, icon, tone, change }) => (
  <View style={[styles.tile, { backgroundColor: tone.bg }]}>
    <View style={styles.tileIcon}><Ionicons name={icon} size={16} color={tone.fg} /></View>
    {typeof value === 'number' ? <CountUp value={value} style={styles.tileValue} /> : <Text style={styles.tileValue}>{value}</Text>}
    <Caption style={styles.tileLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{label}</Caption>
    {change}
  </View>
);

/** One figure in a breakdown row, spelled out so it reads without the column labels above. */
const InlineStat = ({ icon, value, one, many }) => (
  <Row gap={space.xs} style={styles.inlineStat}>
    <Ionicons name={icon} size={14} color={colors.ink400} />
    <Text style={styles.inlineValue}>{value}</Text>
    <Caption>{value === 1 ? one : many}</Caption>
  </Row>
);

/** "vs previous 7 days", or nothing when the earlier days are not fully recorded and a comparison would mislead. */
const comparable = r => r?.previous && !r.previous.historyLimited;
const previousLabel = r => (r.previous.days === 1 ? 'yesterday' : `previous ${r.previous.days} days`);

/** Change against the previous period: a percentage when there is a base, the plain difference when it started at zero. */
const Change = ({ current = 0, previous = 0, money, suffix = '', style }) => {
  const diff = current - previous;
  if (!diff) return <Caption style={style}>No change{suffix}</Caption>;
  const up = diff > 0;
  const amount = previous ? `${Math.abs(percentChange(current, previous))}%` : money ? formatMoney(Math.abs(diff)) : String(Math.abs(diff));
  return <Caption style={[{ color: up ? colors.success : colors.danger }, style]} accessibilityLabel={`${up ? 'Up' : 'Down'} ${amount}${suffix}`}>
    {up ? '↑' : '↓'} {amount}{suffix}
  </Caption>;
};

/** The headline change: a tinted pill with the percentage, like "↑ 42%", then what it compares with. */
const TrendPill = ({ current = 0, previous = 0, label }) => {
  const diff = current - previous;
  const tone = diff > 0 ? tones.green : diff < 0 ? tones.red : tones.slate;
  // A percentage needs a base: up from ₹0 there is none, so the amount itself is shown.
  const amount = !diff ? 'No change' : `${diff > 0 ? '↑' : '↓'} ${previous ? `${Math.abs(percentChange(current, previous))}%` : formatMoney(Math.abs(diff))}`;
  return <Row gap={space.sm} style={styles.trend}>
    <View style={styles.trendPill}><Text style={[styles.trendText, { color: tone.fg }]}>{amount}</Text></View>
    <Caption>{label}</Caption>
  </Row>;
};

const rangeLabel = r => (r.from === r.to ? displayDay(r.from) : `${displayDay(r.from)} to ${displayDay(r.to)}`);

const TOP_MEDIA = 3;
const TOP_RULES = 3;
const MEDIA_SORTS = [['repliesSent', 'Replies'], ['visits', 'Visits'], ['ordersPlaced', 'Orders']];

/** One Reel, post or DM source in the breakdown: what it is, then its share of the totals in words. */
const MediaActivityRow = ({ activity, media }) => {
  const post = activity.media ?? media.find(x => x.id === activity.mediaId);
  const label = activity.mediaId === 'DM' ? 'Direct messages' : activity.mediaId === 'ALL' ? 'Older all-post links' : activity.mediaId === 'UNKNOWN' ? 'Unidentified source' : post?.caption || `Reel / post ${activity.mediaId}`;
  return <View style={styles.mediaCard}>
    <Row gap={space.md} align="flex-start">
      <RuleArt target={activity.mediaId} media={post ? [post] : []} size={48} />
      <View style={{ flex: 1, gap: 2 }}>
        <Body strong numberOfLines={2}>{label}</Body>
        {activity.keywords.length ? <Caption numberOfLines={1}>Keywords: {activity.keywords.join(', ')}</Caption> : null}
        {['ALL', 'UNKNOWN'].includes(activity.mediaId) ? <Caption>These older links did not record the exact Reel or post.</Caption> : null}
      </View>
    </Row>
    <View style={styles.inlineStats}>
      <InlineStat icon="paper-plane-outline" value={activity.repliesSent} one="reply" many="replies" />
      <InlineStat icon="eye-outline" value={activity.visits} one="visit" many="visits" />
      <InlineStat icon="receipt-outline" value={activity.ordersPlaced} one="order" many="orders" />
    </View>
    {activity.repliesFailed || activity.repliesUncertain ? <Caption style={[styles.mediaFoot, { color: colors.warning }]}>
      {[activity.repliesFailed ? `${activity.repliesFailed} failed` : '', activity.repliesUncertain ? `${activity.repliesUncertain} not confirmed` : ''].filter(Boolean).join(' · ')}
    </Caption> : null}
  </View>;
};

export function InstagramPanel({ businessId, onEnabled, onConnected }) {
  const [status, setStatus] = useState({ status: 'disconnected', enabled: false });
  const [media, setMedia] = useState([]);
  const [rules, setRules] = useState([]);
  const { entitled } = usePlan();
  const [nextCursor, setNextCursor] = useState(null);
  const [moreLoading, setMoreLoading] = useState(false);
  const [moreError, setMoreError] = useState('');
  const [rulesError, setRulesError] = useState('');
  const morePending = useRef(false);
  const generation = useRef(0);
  const [reportLoading, setReportLoading] = useState(true);
  const [reportError, setReportError] = useState('');
  const [report, setReport] = useState(null);
  const [allMedia, setAllMedia] = useState(false);
  const [managing, setManaging] = useState(false);
  const [about, setAbout] = useState(false);
  const [allRules, setAllRules] = useState(false);
  const [mediaSort, setMediaSort] = useState('repliesSent');
  const [activityCount, setActivityCount] = useState(10);
  const [activityPeriod, setActivityPeriod] = useState({ period: 'weekly' });
  const [loading, setLoading] = useState(Boolean(businessId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    const id = ++generation.current;
    if (!businessId) { setLoading(false); return; }
    setReportLoading(true); setReportError(''); setMoreError(''); setRulesError('');
    let activityUpdated = false;
    try {
      const current = await instagram.status(businessId);
      if (id !== generation.current) return;
      setStatus(current ?? { status: 'disconnected', enabled: false });
      onEnabled?.(Boolean(current?.enabled));
      onConnected?.(Boolean(current?.status && current.status !== 'disconnected'));
      if (current?.enabled) {
        const [r, a] = await Promise.allSettled([instagram.rules(businessId), instagram.report(businessId, activityPeriod)]);
        if (id !== generation.current) return;
        if (a.status === 'fulfilled') { setReport(a.value); setReportError(''); activityUpdated = true; }
        else setReportError('Unable to update activity.');
        if (r.status === 'rejected') throw r.reason;
        setRules(r.value?.items ?? []); setNextCursor(r.value?.nextCursor ?? null);
        const list = r.value?.items ?? [];
        const snapshots = list.map(x => x.media).filter(Boolean);
        // Existing rules predate media snapshots; retain their thumbnails when Instagram is reachable.
        if (current.status === 'connected' && list.some(x => !['ALL','DM'].includes(x.mediaId) && !x.media)) {
          const posts = await instagram.media(businessId).catch(() => null);
          if (id !== generation.current) return;
          setMedia([...snapshots, ...(posts?.items ?? [])]);
        } else setMedia(snapshots);
      } else { setMedia([]); setRules([]); setNextCursor(null); setReport(null); }
      setError('');
    } catch (e) {
      if (id === generation.current) { setError(failure(e)); setRulesError('Unable to update automations.');
        if (!activityUpdated) setReportError('Unable to update activity.'); }
    } finally { if (id === generation.current) { setLoading(false); setReportLoading(false); } }
  }, [businessId, onEnabled, onConnected, activityPeriod]);
  useEffect(() => { const counter = generation; setReport(null); setAllMedia(false); setRules([]); setNextCursor(null); return () => { counter.current++; }; }, [businessId]);
  const loadMoreRules = async () => {
    if (!nextCursor || morePending.current) return;
    const id = generation.current;
    morePending.current = true; setMoreLoading(true); setMoreError('');
    try {
      const next = await instagram.rules(businessId, { cursor: nextCursor });
      if (id !== generation.current) return;
      setRules(prev => [...prev, ...(next.items ?? []).filter(x => !prev.some(y => y.id === x.id))]);
      setMedia(prev => [...prev, ...(next.items ?? []).map(x => x.media).filter(Boolean)]);
      setNextCursor(next.nextCursor ?? null);
    } catch { if (id === generation.current) setMoreError('Could not load more automations. Please try again.'); }
    finally { morePending.current = false; setMoreLoading(false); }
  };
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
    setBusy(true); setError(''); setManaging(false);
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
  const disconnectedCard = status.status === 'disconnected' ? (
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
        {status.managementOnly ? <Caption>Your subscription has expired. New connections are unavailable.</Caption> : null}
        <Alert message={error} />
        {status.enabled ? (
          <>
            <Button title="Connect Instagram" style={{ marginTop: space.lg }} disabled={busy || entitled !== true || status.managementOnly} loading={busy} onPress={connect}
              icon={<Ionicons name="logo-instagram" size={18} color="#ffffff" />} />
            <Caption style={styles.footnote}>You will log in on Instagram, then confirm the account here.</Caption>
          </>
        ) : (
          <Button title="Refresh" variant="secondary" style={{ marginTop: space.lg }} onPress={reload} />
        )}
      </Card>
    ) : null;

  const badge = STATUS[status.status] ?? STATUS.reauthorization_required;
  const connected = status.status === 'connected' && status.enabled;
  const missing = status.missingPermissions ?? [];
  const commentsOk = !missing.some((p) => COMMENT_SCOPES.includes(p)) && status.webhook === 'subscribed';
  const messagesOk = Boolean(status.connectionMessagesReady ?? status.messagesReady);
  // All green needs no checklist: one line says so, and the checklist returns the moment something needs a fix.
  const allOk = commentsOk && messagesOk && status.storePublished !== false;
  // Healthy is a status line, not a card: the details wait behind Manage until something needs a fix.
  const healthy = connected && allOk && status.health !== 'temporarily_unavailable';
  // The server already orders by replies; re-sorting is only needed for the other keys. Stable, so ties keep that order.
  const sortedMedia = mediaSort === 'repliesSent' ? report?.byMedia ?? [] : [...(report?.byMedia ?? [])].sort((a, b) => b[mediaSort] - a[mediaSort]);
  const ready = canTurnOn(status, 'ALL');
  // Anything that needs the seller's action leads the list, so the short preview never hides a problem.
  const orderedRules = [...rules.filter(r => r.readiness?.state === 'action_needed'), ...rules.filter(r => r.readiness?.state !== 'action_needed')];
  const visibleRules = allRules ? orderedRules : orderedRules.slice(0, TOP_RULES);
  const managementOnly = entitled === false || status.managementOnly;

  const connectionDetails = <>
        <Row gap={space.md}>
          <InstagramMark />
          <View style={{ flex: 1 }}>
            <Heading numberOfLines={1}>@{status.username}</Heading>
            <Caption>{status.accountType === 'CREATOR' ? 'Creator' : 'Business'} account</Caption>
          </View>
          <Pill label={badge.label} tone={badge.tone} />
        </Row>

        {connected && allOk ? (
          <Row gap={space.sm} style={styles.checks}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Body style={{ flex: 1 }}>Replying to comments and messages. Store is live.</Body>
          </Row>
        ) : connected ? (
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
  </>;

  return (
    <View>
      <Alert message={error} />

      {status.health === 'temporarily_unavailable' ? <Alert message="Instagram is temporarily unavailable. Tap Check connection to retry." /> : null}
      {/* ───────────── Connection ───────────── */}
      {disconnectedCard ?? (healthy ? (
        <Touchable onPress={() => setManaging(true)} accessibilityLabel={`@${status.username}, connected. Manage Instagram connection`} style={styles.accountBar}>
          <Row gap={space.sm}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Body strong numberOfLines={1} style={{ flexShrink: 1 }}>@{status.username}</Body>
            <Caption style={{ flex: 1 }} numberOfLines={1}>Connected</Caption>
            <Body style={styles.manage}>Manage</Body>
            <Ionicons name="chevron-forward" size={16} color={colors.accent700} />
          </Row>
        </Touchable>
      ) : <Card style={connected ? styles.block : styles.last}>{connectionDetails}</Card>)}
      <Sheet visible={managing && healthy} onClose={() => setManaging(false)} title="Instagram connection">
        {connectionDetails}
      </Sheet>

      {status.enabled ? (
        <>
          {managementOnly ? <Caption style={styles.footnote}>Your subscription has expired. You can pause or delete automations and disconnect Instagram.</Caption> : null}
          {/* ───────────── Activity ───────────── */}
          <SectionHeader title="Results" />
          <InstagramActivityPeriod value={activityPeriod} onChange={period => {
            setReport(null); setReportError(''); setReportLoading(true); setActivityCount(10); setAllMedia(false); setActivityPeriod(period);
          }} />
          <Card style={styles.last}>
            {reportError ? <View style={styles.activityError}><Alert message={report ? 'Unable to update activity. Showing the last successful update.' : reportError} />
              <Button title="Retry activity" variant="secondary" size="sm" onPress={reload} /></View> : null}
            {report || reportLoading ? <>
            <Row style={styles.activityHead}>
              <Caption style={{ flex: 1 }} numberOfLines={1}>
                {report ? rangeLabel(report) : ''}
                {reportLoading ? `${report ? ' · ' : ''}Updating…` : report?.generatedAt ? ` · Updated ${new Date(report.generatedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}` : ''}
              </Caption>
              {report ? <Touchable onPress={() => setAbout(true)} accessibilityLabel="About these numbers" style={styles.infoButton}>
                <Ionicons name="information-circle-outline" size={20} color={colors.ink500} />
              </Touchable> : null}
            </Row>
            {report && (report.orderValue || report.previous?.orderValue) ? <View style={styles.money}>
              <Row gap={space.sm}>
                <InstagramMark size={26} />
                <Body strong style={{ color: colors.accent900 }}>Orders from Instagram</Body>
              </Row>
              <CountUp value={report.orderValue} format={formatMoney} step={100} style={styles.moneyValue} accessibilityLabel={`${formatMoney(report.orderValue)} in orders placed`} />
              {comparable(report) ? <TrendPill current={report.orderValue} previous={report.previous.orderValue} label={`vs ${previousLabel(report)}`} />
                : report.previous ? <Caption style={styles.trendWait}>No earlier data to compare yet</Caption> : null}
              <Row gap={space.sm} style={styles.delivered}>
                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                <Body strong>{formatMoney(report.deliveredValue ?? 0)} delivered</Body>
                <Caption style={{ flex: 1, textAlign: 'right' }}>{report.deliveredOrders ?? 0} of {report.ordersPlaced ?? 0} {report.ordersPlaced === 1 ? 'order' : 'orders'}</Caption>
              </Row>
              {report.orderValueComplete === false ? <Caption style={{ marginTop: space.xs }}>Some older orders could not be valued.</Caption> : null}
            </View> : null}
            <Row gap={space.sm} align="stretch" style={reportLoading && { opacity: 0.4 }}>
              <StatTile label="Replies sent" value={report ? report.repliesSent ?? 0 : '-'} icon="paper-plane" tone={tones.violet}
                change={comparable(report) ? <Change current={report.repliesSent} previous={report.previous.repliesSent} /> : null} />
              <StatTile label="Tracked visits" value={report ? report.visits ?? 0 : '-'} icon="eye" tone={tones.blue}
                change={comparable(report) ? <Change current={report.visits} previous={report.previous.visits} /> : null} />
              <StatTile label="Orders placed" value={report ? report.ordersPlaced ?? 0 : '-'} icon="receipt" tone={tones.green}
                change={comparable(report) ? <Change current={report.ordersPlaced} previous={report.previous.ordersPlaced} /> : null} />
            </Row>
            {comparable(report) && !(report.orderValue || report.previous?.orderValue) ? <Caption style={styles.changeNote}>Changes compare with the {previousLabel(report)}.</Caption> : null}
            {report?.repliesFailed || report?.repliesUncertain ? <Row gap={space.sm} style={styles.problems}>
              <Ionicons name="alert-circle" size={18} color={colors.warning} />
              <Body style={{ flex: 1, color: colors.warning }}>
                {[report.repliesFailed ? `${report.repliesFailed} ${report.repliesFailed === 1 ? 'reply' : 'replies'} failed` : '',
                  report.repliesUncertain ? `${report.repliesUncertain} not confirmed` : ''].filter(Boolean).join(' · ')}
              </Body>
            </Row> : null}
            {report?.byMedia ? <View style={styles.breakdown}>
              <Row style={{ marginBottom: space.md }}>
                <Body strong style={{ flex: 1 }}>Top Reels and posts</Body>
                {report.byMedia.length > TOP_MEDIA ? <Touchable accessibilityLabel={`See all ${report.byMedia.length} Reels, posts and messages`}
                  style={styles.seeAllInline} onPress={() => { setActivityCount(10); setAllMedia(true); }}>
                  <Body style={styles.seeAllText}>See all {report.byMedia.length}</Body>
                  <Ionicons name="chevron-forward" size={16} color={colors.accent700} />
                </Touchable> : null}
              </Row>
              {report.byMedia.length === 0 ? <Caption>No Reel or post activity yet.</Caption> : null}
              <View style={{ gap: space.sm }}>
                {report.byMedia.slice(0, TOP_MEDIA).map(activity => <MediaActivityRow key={activity.mediaId} activity={activity} media={media} />)}
              </View>
            </View> : null}
            {report ? <Sheet visible={about} onClose={() => setAbout(false)} title="About these numbers">
              <View style={{ gap: space.md }}>
                {[
                  ['receipt-outline', 'Order value is what orders were worth when placed, not payments received.'],
                  ['checkmark-circle-outline', 'Delivered counts only orders now marked delivered.'],
                  ['eye-outline', 'Visits are store visits from reply links, not Reel views.'],
                  ['time-outline', 'Dates are in India time.'],
                  ...(report.repliesUncertain ? [['help-circle-outline', 'Not confirmed: Instagram did not answer in time, so we did not send again.']] : []),
                  ...(report.historyLimited ? [['hourglass-outline', `Daily summaries started ${new Date(report.historyStartedAt).toLocaleDateString('en-IN')}. Earlier dates include only records still available.`]] : []),
                ].map(([icon, text]) => <Row key={icon} gap={space.md} align="flex-start">
                  <Ionicons name={icon} size={18} color={colors.ink500} style={{ marginTop: 2 }} />
                  <Body style={{ flex: 1 }}>{text}</Body>
                </Row>)}
              </View>
            </Sheet> : null}
            </> : !reportError ? <Caption>Activity is unavailable.</Caption> : null}
          </Card>
          {report?.byMedia ? <>
            <Sheet visible={allMedia} onClose={() => setAllMedia(false)} title="Reels and posts">
              <Caption style={styles.breakdownIntro}>{rangeLabel(report)} · {report.byMedia.length} Reels, posts and messages</Caption>
              <View style={styles.segmented} accessibilityRole="radiogroup" accessibilityLabel="Sort by">
                {MEDIA_SORTS.map(([key, title]) => <Touchable key={key} haptics="select" accessibilityRole="radio" accessibilityLabel={`Most ${title.toLowerCase()}`}
                  accessibilityState={{ checked: mediaSort === key }} style={[styles.segment, mediaSort === key && styles.segmentActive]}
                  onPress={() => { setMediaSort(key); setActivityCount(10); }}>
                  <Body style={[styles.segmentText, mediaSort === key && styles.segmentTextActive]} numberOfLines={1}>Most {title.toLowerCase()}</Body>
                </Touchable>)}
              </View>
              <View style={{ gap: space.sm }}>{sortedMedia.slice(0, activityCount).map(activity => <MediaActivityRow key={activity.mediaId} activity={activity} media={media} />)}</View>
              {sortedMedia.length > activityCount ? <Button title="Show more" variant="secondary" style={{ marginTop: space.md }} onPress={() => setActivityCount(n => n + 10)} /> : null}
            </Sheet>
          </> : null}
          {/* ───────────── Automations ───────────── */}
          <SectionHeader title="Automations" action={!managementOnly && rules.length ? '+ New' : null} onAction={() => router.push('/instagram/new')} />
          <Card style={rules.length && !nextCursor ? styles.last : styles.block} padded={false}>
            {rules.length === 0 && rulesError ? <View style={styles.empty}><Alert message={rulesError} />
              <Button title="Retry automations" variant="secondary" onPress={reload} /></View> : rules.length === 0 ? (
              <View style={styles.empty}>
                <Body strong>No automations yet</Body>
                <Caption style={{ marginTop: 2 }}>{managementOnly ? 'New automations require an active subscription.' : 'Choose a word like LINK, and the product customers should get.'}</Caption>
              </View>
            ) : visibleRules.map((rule, index) => (
              <Touchable key={rule.id} onPress={() => router.push(`/instagram/${encodeURIComponent(rule.id)}`)}
                accessibilityLabel={`Automation for ${rule.keyword}`} style={[styles.rule, index > 0 && styles.divider]}>
                <Row gap={space.md}>
                  <RuleArt target={rule.mediaId} media={media} />
                  <View style={{ flex: 1 }}>
                    <Body strong numberOfLines={1}>&quot;{rule.keyword}&quot; → {rule.product?.name ?? 'Unavailable product'}</Body>
                    <Caption numberOfLines={1}>{targetName(rule.mediaId, media)}</Caption>
                    <View style={{ alignSelf: 'flex-start', marginTop: space.xs }}><Pill label={readinessLabel(rule)} tone={rule.readiness?.state === 'ready' ? 'green' : rule.readiness?.state === 'paused' ? 'slate' : 'amber'} /></View>
                    {rule.readiness?.state === 'action_needed' ? <Caption>{rule.readiness.reasons[0]?.message}</Caption> : null}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.ink400} />
                </Row>
              </Touchable>
            ))}
            {!allRules && orderedRules.length > TOP_RULES ? <Touchable accessibilityLabel={`Show all ${orderedRules.length}${nextCursor ? ' or more' : ''} automations`}
              style={[styles.seeAll, styles.divider]} onPress={() => setAllRules(true)}>
              <Body style={styles.seeAllText}>Show all {orderedRules.length}{nextCursor ? '+' : ''}</Body>
              <Ionicons name="chevron-down" size={16} color={colors.accent700} />
            </Touchable> : null}
            {allRules && orderedRules.length > TOP_RULES ? <Touchable accessibilityLabel="Show fewer automations"
              style={[styles.seeAll, styles.divider]} onPress={() => setAllRules(false)}>
              <Body style={styles.seeAllText}>Show less</Body>
              <Ionicons name="chevron-up" size={16} color={colors.accent700} />
            </Touchable> : null}
          </Card>
          <Alert message={moreError} />
          {allRules && nextCursor ? <Button title={moreError ? 'Retry automations' : 'Show more automations'} variant="secondary" loading={moreLoading} onPress={loadMoreRules} /> : null}
          {!managementOnly && !rules.length ? <Button title="New automation" style={styles.newButton} onPress={() => router.push('/instagram/new')}
            icon={<Ionicons name="add" size={20} color="#ffffff" />} /> : null}
          {!ready && !managementOnly ? <Caption style={styles.newHint}>You can create automations now; they turn on once the checklist above is all green.</Caption> : null}
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

  tile: { flex: 1, borderRadius: radius.md, padding: space.md, gap: 2 },
  tileIcon: { width: 30, height: 30, borderRadius: radius.pill, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  // Standalone figures read better with proportional digits; tabular is for columns.
  tileValue: { ...type.figure, fontSize: 26, lineHeight: 32, fontVariant: [], color: colors.ink900 },
  tileLabel: { color: colors.ink600 },
  activityHead: { marginBottom: space.lg },
  activityError: { gap: space.sm, marginBottom: space.md },
  problems: { marginTop: space.md },
  infoButton: { padding: space.xs, margin: -space.xs },
  seeAllInline: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 32 },
  money: { backgroundColor: colors.accent50, borderRadius: radius.md, padding: space.lg, marginBottom: space.sm },
  moneyValue: { ...type.figure, fontSize: 48, lineHeight: 56, letterSpacing: -1.6, fontVariant: [], color: colors.ink900, marginTop: space.sm },
  delivered: { marginTop: space.lg, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.accent200 },
  trend: { marginTop: space.xs },
  // White on the tinted hero panel, so the change reads as its own object; the colour is in the text.
  trendPill: { borderRadius: radius.pill, paddingHorizontal: space.sm + 2, paddingVertical: 3, backgroundColor: colors.surface },
  trendText: { fontFamily: fonts.semibold, fontSize: 13.5, fontVariant: ['tabular-nums'] },
  trendWait: { marginTop: space.xs },
  changeNote: { marginTop: space.md, textAlign: 'center' },
  breakdown: { marginTop: space.lg, paddingTop: space.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  breakdownIntro: { marginBottom: space.md },
  mediaRow: { padding: space.lg },
  mediaCard: { backgroundColor: colors.canvas, borderRadius: radius.md, padding: space.md },
  inlineStats: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  inlineStat: { backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: space.sm + 2, paddingVertical: space.xs },
  inlineValue: { ...type.figure, fontSize: 14, lineHeight: 18, letterSpacing: 0, color: colors.ink900 },
  mediaFoot: { marginTop: space.sm },
  accountBar: { paddingVertical: space.sm, minHeight: 44, justifyContent: 'center' },
  manage: { ...type.label, color: colors.accent700 },
  seeAll: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, minHeight: 52 },
  seeAllText: { color: colors.accent700, fontFamily: fonts.semibold },
  segmented: { flexDirection: 'row', backgroundColor: colors.sunken, borderRadius: radius.pill, padding: 4, gap: 2, marginBottom: space.md },
  segment: { flex: 1, minHeight: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xs },
  segmentActive: { backgroundColor: colors.surface, shadowColor: colors.ink900, shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segmentText: { color: colors.ink600, fontFamily: fonts.semibold, fontSize: 13 },
  segmentTextActive: { color: colors.ink900 },
});
