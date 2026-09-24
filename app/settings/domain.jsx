import { useState } from 'react';
import { Alert as RNAlert, StyleSheet, View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { normalizeHostname } from '@storekit/shared';
import { Screen } from '../../src/components/Screen.jsx';
import {
  Alert, Body, Button, Caption, Card, Divider, EmptyState, ErrorState, Field, Heading, Pill, Row, Touchable,
} from '../../src/components/ui.jsx';
import { SkeletonScreen } from '../../src/components/Skeleton.jsx';
import { useToast } from '../../src/components/Toast.jsx';
import { useAuth } from '../../src/state/auth.jsx';
import { useAsync, useRefreshOnFocus } from '../../src/lib/useAsync.js';
import { domains as domainsApi } from '../../src/api/endpoints.js';
import { formatDate, relativeTime } from '../../src/lib/format.js';
import { colors, space } from '../../src/theme.js';

/**
 * Custom domain: connect a domain the merchant owns, so the store answers on it as well as on
 * its StoreKit address.
 *
 * The app only presents and asks. Whether the plan allows a domain, whether the name is really
 * theirs (the DNS check) and whether it can serve are all decided by the server, and every state
 * on this screen is read from its answer: the plan and quota, each domain's status, and the
 * reason the last check did not pass.
 *
 * Domains must be subdomains (`www.shop.com`, `store.shop.com`). A root domain is refused by the
 * server with advice, which this screen turns into tappable suggestions.
 *
 * A plan includes one custom domain or none, so there is never a list to manage: at most one card.
 */

const STATUS = {
  pending: { label: 'Waiting for DNS', tone: 'amber' },
  active: { label: 'Active', tone: 'green' },
  disabled: { label: 'Off', tone: 'slate' },
};

/** What the last check found, in words a merchant can act on. Keyed by the server's stable reason. */
const CHECK_MESSAGES = {
  ownership_record_missing:
    'We could not find the TXT record yet. DNS changes can take a few minutes to spread — check again shortly.',
  ownership_record_mismatch: 'A TXT record is there, but its value is different. Copy it again exactly as shown.',
  routing_record_missing: 'The TXT record is confirmed. Now add the CNAME record so visitors reach your store.',
  certificate_pending: 'Almost there. The secure certificate is being issued, which usually takes a few minutes.',
  dns_unavailable: 'We could not reach DNS just now. Try again in a moment.',
  hostname_taken: 'This domain is already connected to another store.',
  plan_required: 'Your plan no longer includes a custom domain.',
  quota_reached: 'Another custom domain is already active on your plan. Remove it to connect this one.',
  check_error: 'Something went wrong while checking. We will try again automatically.',
};

const RECORD_PURPOSE = {
  ownership: 'Proves the domain is yours',
  routing: 'Sends visitors to your store',
};

const confirm = (title, message, actionLabel, onConfirm) =>
  RNAlert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: actionLabel, style: 'destructive', onPress: onConfirm },
  ]);

/**
 * "Verified 3 minutes ago". A phone's clock can be a few seconds off the server's, which would make
 * a moment ago read as "in 2 seconds"; anything not yet in the past is "just now".
 */
const verifiedText = (iso) => {
  if (!iso) return 'Verified.';
  return Date.parse(iso) >= Date.now() ? 'Verified just now.' : `Verified ${relativeTime(iso)}.`;
};

/* ───────────── One DNS record, copyable ───────────── */

const CopyLine = ({ label, value, onCopy }) => (
  <Touchable onPress={() => onCopy(value)} accessibilityLabel={`Copy ${label}`} style={styles.copyLine}>
    <View style={{ flex: 1 }}>
      <Caption>{label}</Caption>
      <Body selectable style={styles.mono}>{value}</Body>
    </View>
    <Ionicons name="copy-outline" size={18} color={colors.accent700} />
  </Touchable>
);

const DnsRecord = ({ record, onCopy }) => (
  <View style={styles.record}>
    <Row gap={space.sm}>
      <Pill label={record.type} tone="indigo" />
      <Caption style={{ flex: 1 }}>{RECORD_PURPOSE[record.purpose] ?? ''}</Caption>
    </Row>
    <CopyLine label="Name" value={record.name} onCopy={onCopy} />
    <CopyLine label="Value" value={record.value} onCopy={onCopy} />
  </View>
);

/* ───────────── One connected (or connecting) domain ───────────── */

const DomainCard = ({ domain, businessId, onChanged, serving }) => {
  const toast = useToast();
  const [showRecords, setShowRecords] = useState(domain.status !== 'active');
  const [busy, setBusy] = useState(null);
  const [failure, setFailure] = useState(null);

  // A domain the store keeps but its plan no longer serves is still "active" in the server's records,
  // and says so nowhere useful to a merchant: what matters to them is that it is not serving.
  const paused = domain.status === 'active' && !serving;
  const status = paused ? { label: 'Not serving', tone: 'slate' } : (STATUS[domain.status] ?? STATUS.pending);
  const reason = domain.lastCheck?.ok === false ? CHECK_MESSAGES[domain.lastCheck.reason] : null;

  const copy = async (value) => {
    await Clipboard.setStringAsync(value);
    toast.success('Copied');
  };

  /** One action at a time; the server's answer is what the screen then shows. */
  const act = async (name, work, onSuccess) => {
    setBusy(name);
    setFailure(null);
    try {
      const result = await work();
      await onChanged();
      onSuccess?.(result);
    } catch (error) {
      setFailure(error?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const verify = () =>
    act('verify', () => domainsApi.verify(businessId, domain.domainId), (result) => {
      if (result?.claim?.status === 'active' || result?.status === 'active') toast.success('Domain connected');
    });

  const update = (name, input, message) =>
    act(name, () => domainsApi.update(businessId, domain.domainId, input), () => toast.success(message));

  const remove = () =>
    confirm(
      `Remove ${domain.hostname}?`,
      'Your store stops answering on this domain. You can add it again later.',
      'Remove',
      () => act('remove', () => domainsApi.remove(businessId, domain.domainId), () => toast.success('Domain removed')),
    );

  const turnOff = () =>
    confirm(
      `Turn off ${domain.hostname}?`,
      'Your store stops answering on it, but the domain stays yours and you can turn it back on.',
      'Turn off',
      () => update('off', { enabled: false }, 'Domain turned off'),
    );

  return (
    <Card style={styles.card}>
      <Row style={{ justifyContent: 'space-between' }} gap={space.md}>
        <Body strong style={{ flex: 1 }} numberOfLines={1}>{domain.hostname}</Body>
        <Row gap={space.xs}>
          {domain.isPrimary ? <Pill label="Primary" tone="accent" /> : null}
          <Pill label={status.label} tone={status.tone} />
        </Row>
      </Row>

      {domain.status === 'active' ? (
        <Caption style={styles.line}>
          {verifiedText(domain.verifiedAt)}
          {domain.isPrimary ? ' Your StoreKit address sends visitors here.' : ''}
        </Caption>
      ) : null}

      {domain.status === 'pending' && domain.expiresAt ? (
        <Caption style={styles.line}>
          Not verified yet. If it stays unverified it is removed on {formatDate(domain.expiresAt, undefined, { dateStyle: 'medium' })}.
        </Caption>
      ) : null}

      {domain.status === 'disabled' ? (
        <Caption style={styles.line}>
          {domain.disabledReason === 'reverify_failed'
            ? 'We could no longer confirm the DNS records, so this domain stopped serving. Put the records back, then check again.'
            : 'Turned off. Your store does not answer on this domain.'}
        </Caption>
      ) : null}

      {reason ? (
        <Row gap={space.sm} align="flex-start" style={styles.reason}>
          <Ionicons name="information-circle-outline" size={17} color={colors.warning} />
          <Body style={{ flex: 1 }}>{reason}</Body>
        </Row>
      ) : null}

      {domain.status !== 'active' || showRecords ? (
        <>
          <Divider style={styles.divider} />
          <Body strong>Add these at your domain provider</Body>
          <Caption style={styles.line}>Both records are needed. Tap any value to copy it.</Caption>
          {domain.dns?.records?.map((record) => (
            <DnsRecord key={`${record.type}-${record.name}`} record={record} onCopy={copy} />
          ))}
        </>
      ) : (
        <Touchable onPress={() => setShowRecords(true)} accessibilityLabel="Show DNS records" style={styles.toggle}>
          <Caption style={{ color: colors.accent700 }}>Show DNS records</Caption>
        </Touchable>
      )}

      <Alert message={failure} />

      <View style={styles.actions}>
        {domain.status === 'pending' || domain.disabledReason === 'reverify_failed' ? (
          <Button title={domain.status === 'pending' ? 'Check now' : 'Check again'} loading={busy === 'verify'} disabled={Boolean(busy)} onPress={verify} />
        ) : null}

        {domain.status === 'active' && !domain.isPrimary && serving ? (
          <Button
            title="Make primary"
            variant="secondary"
            loading={busy === 'primary'}
            disabled={Boolean(busy)}
            onPress={() => update('primary', { isPrimary: true }, 'Primary domain set')}
          />
        ) : null}

        {domain.status === 'active' ? (
          <Button title="Turn off" variant="secondary" loading={busy === 'off'} disabled={Boolean(busy)} onPress={turnOff} />
        ) : null}

        {domain.status === 'disabled' && domain.disabledReason !== 'reverify_failed' ? (
          <Button title="Turn on" loading={busy === 'on'} disabled={Boolean(busy)} onPress={() => update('on', { enabled: true }, 'Domain turned on')} />
        ) : null}

        <Button title="Remove" variant="danger" loading={busy === 'remove'} disabled={Boolean(busy)} onPress={remove} />
      </View>
    </Card>
  );
};

/* ───────────── Adding one ───────────── */

const AddDomain = ({ businessId, capability, onAdded }) => {
  const toast = useToast();
  const [value, setValue] = useState('');
  const [error, setError] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [pending, setPending] = useState(false);

  if (capability.remaining === 0) {
    return (
      <Card style={styles.card}>
        <Body muted>Your plan&apos;s custom domain is already in use. Remove it to connect a different one.</Body>
      </Card>
    );
  }

  const submit = async () => {
    setError(null);
    setSuggestions([]);

    // The same rules the server applies to the shape of a domain, so the merchant is told at
    // once. Whether it is a root domain, or one of ours, only the server can say.
    const checked = normalizeHostname(value);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }

    setPending(true);
    try {
      await domainsApi.add(businessId, checked.hostname);
      setValue('');
      toast.success('Domain added. Now add the DNS records.');
      await onAdded();
    } catch (failure) {
      const detail = failure?.details?.[0];
      setError(detail?.message ?? failure?.message ?? 'Something went wrong. Please try again.');
      setSuggestions(detail?.suggestions ?? []);
    } finally {
      setPending(false);
    }
  };

  return (
    <Card style={styles.card}>
      <Heading>Connect a domain</Heading>
      <Caption style={styles.line}>
        Use a domain you own, like www.yourshop.com or shop.yourshop.com. A root domain such as yourshop.com is not supported yet.
      </Caption>

      <Field
        label="Domain"
        value={value}
        onChangeText={(text) => { setValue(text); setError(null); setSuggestions([]); }}
        placeholder="www.yourshop.com"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="done"
        onSubmitEditing={submit}
        maxLength={253}
        error={error}
        containerStyle={{ marginTop: space.md }}
      />

      {suggestions.length ? (
        <Row gap={space.sm} style={styles.suggestions}>
          {suggestions.map((suggestion) => (
            <Touchable
              key={suggestion}
              onPress={() => { setValue(suggestion); setError(null); setSuggestions([]); }}
              accessibilityLabel={`Use ${suggestion}`}
              style={styles.suggestion}
            >
              <Caption style={{ color: colors.accent700 }}>{suggestion}</Caption>
            </Touchable>
          ))}
        </Row>
      ) : null}

      <Button title="Add domain" loading={pending} disabled={!value.trim()} onPress={submit} style={{ marginTop: space.lg }} />
    </Card>
  );
};

/* ───────────── The screen ───────────── */

export default function CustomDomain() {
  const router = useRouter();
  const { businessId } = useAuth();

  const { data, error, loading, reload, refreshing, onRefresh } = useAsync(
    () => (businessId ? domainsApi.list(businessId) : Promise.resolve(null)),
    [businessId],
  );
  // Coming back from the browser (or another screen) after editing DNS should show the new state.
  useFocusEffect(useRefreshOnFocus(reload));

  if (loading && !data) return <SkeletonScreen />;

  if (error && !data) {
    // The server answers 404 when custom domains are not switched on at all. That is not a fault.
    if (error.status === 404) {
      return (
        <Screen>
          <EmptyState
            icon="🌐"
            title="Custom domains are coming soon"
            message="Your store works on its StoreKit address, and we will let you know when you can connect your own domain."
          />
        </Screen>
      );
    }
    return <ErrorState error={error} onRetry={reload} />;
  }

  const items = data?.items ?? [];
  const storekit = items.find((item) => item.type === 'storekit');
  const custom = items.filter((item) => item.type === 'custom');
  const capability = data?.capability ?? {};

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      {storekit ? (
        <Card style={styles.card}>
          <Row style={{ justifyContent: 'space-between' }} gap={space.md}>
            <View style={{ flex: 1 }}>
              <Caption>Your StoreKit address</Caption>
              <Body strong numberOfLines={1}>{storekit.hostname}</Body>
            </View>
            {storekit.isPrimary ? <Pill label="Primary" tone="accent" /> : null}
          </Row>
          <Caption style={styles.line}>Always works, whatever else you connect.</Caption>
        </Card>
      ) : null}

      {!capability.enabled && capability.message ? (
        <Card style={styles.card}>
          <Row gap={space.sm} align="flex-start">
            <Ionicons name="information-circle-outline" size={18} color={colors.warning} />
            <Body style={{ flex: 1 }}>{capability.message}</Body>
          </Row>
        </Card>
      ) : null}

      {!capability.enabled ? (
        <Card style={styles.card}>
          <Heading>Use your own domain</Heading>
          <Body muted style={styles.line}>
            Custom domains are part of the Business and Pro plans. Choose one to connect yours.
          </Body>
          <Button title="View plans" onPress={() => router.push('/paywall')} style={{ marginTop: space.lg }} />
        </Card>
      ) : null}

      {custom.map((domain) => (
        <DomainCard key={domain.domainId} domain={domain} businessId={businessId} onChanged={reload} serving={Boolean(capability.enabled)} />
      ))}

      {capability.enabled ? (
        <AddDomain businessId={businessId} capability={capability} onAdded={reload} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: space.lg },
  line: { marginTop: space.xs },
  divider: { marginVertical: space.md },
  reason: { marginTop: space.md },
  record: { marginTop: space.md, gap: space.sm },
  copyLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.canvas,
    borderRadius: 10,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  mono: { fontFamily: 'monospace', fontSize: 13 },
  toggle: { marginTop: space.md, alignSelf: 'flex-start' },
  actions: { marginTop: space.lg, gap: space.sm },
  suggestions: { flexWrap: 'wrap', marginTop: space.sm },
  suggestion: {
    borderWidth: 1,
    borderColor: colors.accent200 ?? colors.line,
    borderRadius: 999,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
});
