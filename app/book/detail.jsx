import { Alert as RNAlert, Linking, Platform, Share, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../src/components/Screen.jsx';
import { Body, Button, Caption, Card, Divider, Loading, Row, Touchable } from '../../src/components/ui.jsx';
import {
  Avatar, CATEGORY_LABELS, EntrySafety, KIND_LABELS, KhataStatusBar, entryLabel, entryMessage, isSupplier, khataBar, useBillPrinting,
  useKhataBar,
} from '../../src/components/book.jsx';
import { readEntry, readParty } from '../../src/lib/bookQueries.js';
import { entryTime, ledgerSide } from '../../src/lib/book.js';
import { formatDate, formatMoney } from '../../src/lib/format.js';
import { useAction } from '../../src/lib/useAsync.js';
import { useAuth } from '../../src/state/auth.jsx';
import { useBook, useBookQuery } from '../../src/state/book.jsx';
import { useT } from '../../src/state/locale.jsx';
import { colors, fonts, radius, space } from '../../src/theme.js';

const GOODS = ['sale', 'purchase', 'salesReturn', 'purchaseReturn'];

const readDetail = async (db, entryId) => {
  const raw = await readEntry(db, entryId);
  if (!raw) return null;
  const party = raw.partyId ? await readParty(db, raw.partyId) : null;
  return { raw, party, entry: party?.entries.find((e) => e.entryId === entryId) ?? raw };
};

/**
 * One entry, opened from the khata or the day book: who, when, how much, the party's balance after it, the message
 * for them, whether it is backed up, and Edit / Delete / Share. Editing opens the entry form.
 */
export default function EntryDetail() {
  const t = useT();
  const router = useRouter();
  const navigation = useNavigation();
  const { entryId } = useLocalSearchParams();
  const { business } = useAuth();
  const { deleteEntry } = useBook();
  const printing = useBillPrinting();
  const detail = useBookQuery((db) => readDetail(db, String(entryId)), [entryId]);
  useKhataBar(navigation, { title: t('Entry details') }, [t]);

  const { run: remove, pending: deleting } = useAction(async () => {
    await deleteEntry(detail.raw);
    router.back();
  });

  if (!detail) return <Screen><KhataStatusBar /><Loading /></Screen>;
  const { party, entry } = detail;
  const supplier = party ? isSupplier(party) : false;
  const side = party ? ledgerSide(entry, party.partyType) : entry.kind === 'expense' || entry.kind === 'purchase' ? 'gave' : 'got';
  const sideColor = side === 'gave' ? colors.danger : colors.success;
  const when = entryTime(entry.entryId);
  const title = party?.name
    ?? (entry.kind === 'expense' ? entry.label ?? t(CATEGORY_LABELS[entry.category] ?? 'Other') : t(KIND_LABELS[entry.kind]));
  const dateLine = [
    formatDate(`${entry.date}T00:00:00`, undefined, { day: 'numeric', month: 'short', year: '2-digit' }),
    when ? new Date(when).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : null,
  ].filter(Boolean).join(' • ');
  const message = party ? entryMessage(t, { entry, party, store: business?.name, balance: entry.balanceAfter ?? party.balance }) : null;
  const balanceColor = !entry.balanceAfter ? colors.ink700 : (entry.balanceAfter > 0) !== supplier ? colors.danger : colors.success;

  const share = () => {
    if (!party && GOODS.includes(entry.kind)) return printing.shareBill(entry, null);
    const text = message ?? `${title}: ${formatMoney(entry.amount)} · ${dateLine}`;
    return Share.share({ message: text }).catch(() => undefined);
  };
  const sms = () => Linking.openURL(`sms:+91${party.mobile}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(message)}`)
    .catch(() => undefined);
  const confirmDelete = () => RNAlert.alert(t('Delete this entry?'), t('It is removed from the book and the khata on every phone.'), [
    { text: t('Keep'), style: 'cancel' },
    { text: t('Delete'), style: 'destructive', onPress: () => remove().catch(() => undefined) },
  ]);

  return (
    <Screen
      padded={false}
      footer={(
        <Row gap={space.md}>
          <Button title={t('Delete')} variant="danger" full={false} style={styles.footerButton} loading={deleting}
            icon={<Ionicons name="trash-outline" size={18} color={colors.danger} />} onPress={confirmDelete} />
          <Button title={t('Share')} full={false} style={styles.footerButton} loading={Boolean(printing.busy)}
            icon={<Ionicons name="share-social" size={18} color="#ffffff" />} onPress={() => { share(); }} />
        </Row>
      )}
    >
      <KhataStatusBar />
      <View style={styles.band}>
        <Card padded={false} style={styles.card}>
          <Row gap={space.md} style={styles.head}>
            <Avatar name={title} size={52} />
            <View style={{ flex: 1 }}>
              <Body strong numberOfLines={2} style={styles.name}>{title}</Body>
              <Caption>{dateLine}</Caption>
            </View>
            <View style={styles.amountBox}>
              <Body style={[styles.amount, { color: sideColor }]} numberOfLines={1}>{formatMoney(entry.amount)}</Body>
              <Caption>{party ? entryLabel(t, entry, supplier) : t(KIND_LABELS[entry.kind])}</Caption>
            </View>
          </Row>
          {party ? (
            <>
              <Divider />
              <Row style={styles.balanceRow}>
                <Body style={{ flex: 1 }}>{t('Running balance')}</Body>
                <Body style={[styles.balance, { color: balanceColor }]}>{formatMoney(Math.abs(entry.balanceAfter ?? 0))}</Body>
              </Row>
            </>
          ) : null}
          <Divider />
          <Touchable onPress={() => router.push({ pathname: '/book/entry', params: { entryId: entry.entryId } })} style={styles.edit}
            accessibilityLabel={t('Edit entry')}>
            <Ionicons name="pencil" size={18} color={colors.accent700} />
            <Body strong style={styles.editText}>{t('Edit entry').toUpperCase()}</Body>
          </Touchable>
        </Card>
      </View>

      {message ? (
        <Card style={styles.messageCard}>
          <Row gap={space.sm} style={styles.messageHead}>
            <Ionicons name="chatbox-ellipses-outline" size={20} color={colors.ink700} />
            <Body strong style={{ flex: 1 }}>{t('Message for {name}', { name: party.name })}</Body>
            {party.mobile && !supplier ? (
              <Touchable onPress={sms} accessibilityLabel={t('SMS')} style={styles.smsButton}>
                <Caption style={styles.smsText}>{t('SMS')}</Caption>
              </Touchable>
            ) : null}
          </Row>
          <Divider style={{ marginVertical: space.md }} />
          <Body style={{ color: colors.ink600 }}>{message}</Body>
        </Card>
      ) : null}

      <View style={styles.safety}>
        <EntrySafety entryId={entry.entryId} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  band: { backgroundColor: khataBar, paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.xl },
  card: { borderRadius: radius.md, overflow: 'hidden' },
  head: { padding: space.lg, alignItems: 'center' },
  name: { fontSize: 18, lineHeight: 24 },
  amountBox: { alignItems: 'flex-end', maxWidth: '40%' },
  amount: { fontFamily: fonts.semibold, fontSize: 22, lineHeight: 28 },
  balanceRow: { paddingHorizontal: space.lg, paddingVertical: space.md, alignItems: 'center' },
  balance: { fontFamily: fonts.semibold, fontSize: 17 },
  edit: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingVertical: space.md + 2, minHeight: 48 },
  editText: { color: colors.accent700, letterSpacing: 0.5 },
  messageCard: { marginHorizontal: space.md, marginTop: space.md },
  messageHead: { alignItems: 'center' },
  smsButton: { paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill, backgroundColor: colors.accent50, minHeight: 32, justifyContent: 'center' },
  smsText: { color: colors.accent700, fontFamily: fonts.semibold },
  safety: { marginHorizontal: space.md },
  footerButton: { flex: 1 },
});
