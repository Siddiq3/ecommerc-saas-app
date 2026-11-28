import { useState } from 'react';
import { Alert as RNAlert, Linking, Platform, Share, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { bookPartySchema } from '@storeflick/validation';
import { Screen } from '../../src/components/Screen.jsx';
import { Alert, Body, Button, Caption, Field, Loading, Touchable, canShrink } from '../../src/components/ui.jsx';
import { Sheet } from '../../src/components/Sheet.jsx';
import { useToast } from '../../src/components/Toast.jsx';
import {
  Avatar, GaveGotButtons, KhataStatusBar, MODE_LABELS, ageText, entryLabel, isSupplier, khataBar, partyRecord, reminderText,
  remindOnWhatsApp, useKhataBar, useShop,
} from '../../src/components/book.jsx';
import { dayKey, entryTime, ledgerSide } from '../../src/lib/book.js';
import { scheduleDueReminder } from '../../src/lib/dueReminders.js';
import { WEB_URL } from '../../src/lib/help.js';
import { itemsSummary } from '../../src/components/BillItems.jsx';
import { readParty } from '../../src/lib/bookQueries.js';
import { khataHtml } from '../../src/lib/bookPrint.js';
import { formatDate, formatMoney } from '../../src/lib/format.js';
import { useAuth } from '../../src/state/auth.jsx';
import { newShareToken, useBook, useBookQuery } from '../../src/state/book.jsx';
import { useT } from '../../src/state/locale.jsx';
import { useAction } from '../../src/lib/useAsync.js';
import { colors, fonts, radius, shadow, space, tones, type } from '../../src/theme.js';

const toDate = (day) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d); };

/**
 * One customer's khata: what they owe, every credit bill and payment, and a reminder that
 * is one tap away: a call, or WhatsApp with the amount already written.
 */
export default function KhataParty() {
  const t = useT();
  const router = useRouter();
  const navigation = useNavigation();
  const { partyId } = useLocalSearchParams();
  const { business } = useAuth();
  const shop = useShop();
  const { saveParty } = useBook();
  const party = useBookQuery((db) => readParty(db, String(partyId)), [partyId]);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [errors, setErrors] = useState({});
  const [sharing, setSharing] = useState(false);
  const [pickingDate, setPickingDate] = useState(false);
  const toast = useToast();

  // The khata bar: the party's initials and name (tap for their settings), and a call button.
  useKhataBar(navigation, {
    headerTitle: () => (party ? (
      <Touchable
        onPress={() => { setName(party.name); setMobile(party.mobile ?? ''); setErrors({}); setEditing(true); }}
        style={styles.barTitle}
        accessibilityRole="button"
        accessibilityLabel={`${party.name}, ${t('View settings')}`}
      >
        <Avatar name={party.name} size={36} onBar />
        <View style={{ flexShrink: 1 }}>
          <Text style={styles.barName} numberOfLines={1}>{party.name}</Text>
          <Text style={styles.barSub} numberOfLines={1}>{t('View settings')}</Text>
        </View>
      </Touchable>
    ) : null),
    headerRight: () => (party?.mobile ? (
      <Touchable onPress={() => Linking.openURL(`tel:+91${party.mobile}`).catch(() => undefined)} style={styles.barIcon}
        accessibilityRole="button" accessibilityLabel={t('Call')}>
        <Ionicons name="call" size={22} color="#ffffff" />
      </Touchable>
    ) : null),
  }, [party?.name, party?.mobile, t]);

  const { run: saveEdit, pending: saving, error: saveError } = useAction(async () => {
    const result = bookPartySchema.safeParse(partyRecord(party, { name, mobile: mobile.trim() || undefined }));
    if (!result.success) { setErrors(Object.fromEntries(result.error.issues.map((i) => [i.path[0], i.message]))); return; }
    await saveParty(result.data);
    setEditing(false);
  });

  if (!party) return <Screen><Loading /></Screen>;
  const supplier = isSupplier(party);

  const open = (params) => router.push({ pathname: '/book/entry', params: { partyId: party.partyId, partyName: party.name, simple: '1', ...params } });

  const reminder = () => reminderText(t, party, shop.name ?? business?.name, shop.upi);
  const remind = () => remindOnWhatsApp(t, party, shop.name ?? business?.name, shop.upi);

  // iOS wants `&body=`, Android `?body=`.
  const sms = () => Linking.openURL(`sms:+91${party.mobile}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(reminder())}`)
    .catch(() => undefined);

  const report = async () => {
    setSharing(true);
    try {
      const { uri } = await Print.printToFileAsync({ html: khataHtml({ store: business?.name ?? '', party, entries: party.entries }) });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: party.name, UTI: 'com.adobe.pdf' });
    } catch {
      toast.error(t('Something went wrong. Try again.'));
    } finally {
      setSharing(false);
    }
  };

  const update = async (changes) => {
    const result = bookPartySchema.safeParse(partyRecord(party, changes));
    if (!result.success) { toast.error(t('Something went wrong. Try again.')); return null; }
    await saveParty(result.data);
    return result.data;
  };

  const setDueDate = async (day) => {
    const saved = await update({ dueDate: day ?? undefined });
    if (!saved) return;
    const on = await scheduleDueReminder(saved, {
      title: t('Payment due today'),
      body: supplier ? t('Pay {name} today.', { name: party.name }) : t('{name} should pay today. Open the khata to send a reminder.', { name: party.name }),
    }).catch(() => false);
    if (day) toast.success(on ? t('We will remind you at 9 am on the due date.') : t('Due date saved.'));
  };

  const shareLink = async () => {
    const token = party.shareToken ?? (await update({ shareToken: newShareToken() }))?.shareToken;
    if (!token) return;
    const link = `${WEB_URL}/k/${token}`;
    const message = t('Namaste {name}, see your account with {store} here: {link}', { name: party.name, store: business?.name ?? '', link });
    Share.share({ message }).catch(() => undefined);
  };

  const turnOffLink = () => RNAlert.alert(t('Turn off the ledger link?'), t('Anyone with the old link will no longer see this account.'), [
    { text: t('Keep'), style: 'cancel' },
    { text: t('Turn off'), style: 'destructive', onPress: () => update({ shareToken: undefined }).then(() => setEditing(false)) },
  ]);

  const removeParty = () => RNAlert.alert(
    supplier ? t('Delete this supplier?') : t('Delete this customer?'),
    party.balance ? t('Their balance of {amount} leaves the khata. Bills and payments stay in the day book.', { amount: formatMoney(Math.abs(party.balance)) })
      : t('Bills and payments stay in the day book.'),
    [
      { text: t('Keep'), style: 'cancel' },
      {
        text: t('Delete'),
        style: 'destructive',
        onPress: async () => {
          const saved = await update({ deleted: true });
          if (!saved) return;
          await scheduleDueReminder(saved, {}).catch(() => undefined);
          setEditing(false);
          router.back();
        },
      },
    ],
  );

  const overdue = party.dueDate && party.balance > 0 && party.dueDate < dayKey();
  // What the balance means for the shop: a customer's balance is money it will get, a supplier's
  // money it will give. Red is "will get", green "will give", as on the khata list.
  const getsBack = supplier ? party.balance < 0 : party.balance > 0;
  const balanceLabel = !party.balance ? t('Settled') : getsBack ? t('You will get') : t('You will give');

  // The khata's shortcuts, icon over a short word, as one row under the bar.
  const actions = [
    { key: 'pdf', title: t('Report'), icon: 'document-text-outline', onPress: report, disabled: !party.entries.length || sharing },
    !supplier && { key: 'wa', title: t('Reminder'), icon: 'logo-whatsapp', onPress: remind, disabled: !party.mobile || party.balance <= 0 },
    !supplier && { key: 'sms', title: t('SMS'), icon: 'chatbox-ellipses-outline', onPress: sms, disabled: !party.mobile || party.balance <= 0 },
    !supplier && { key: 'link', title: t('Link'), icon: 'link-outline', onPress: () => shareLink().catch(() => undefined) },
  ].filter(Boolean);

  const dateText = (d) => formatDate(`${d}T00:00:00`, undefined, { day: 'numeric', month: 'short', year: '2-digit' });
  const timeText = (e) => {
    const at = entryTime(e.entryId);
    return at ? formatDate(at.toISOString(), undefined, { hour: 'numeric', minute: '2-digit' }) : null;
  };
  // Entries arrive newest first; a date line opens each day, as in a paper khata.
  const groups = party.entries.reduce((list, e) => {
    if (list.at(-1)?.date !== e.date) list.push({ date: e.date, entries: [] });
    list.at(-1).entries.push(e);
    return list;
  }, []);

  return (
    <View style={styles.flex}>
      <KhataStatusBar />
      <Screen
        padded={false}
        footer={(
          <GaveGotButtons
            onGave={() => open(supplier ? { kind: 'expense', category: 'dealer', partyType: 'supplier' } : { kind: 'sale', mode: 'credit' })}
            onGot={() => open(supplier ? { kind: 'due', partyType: 'supplier' } : { kind: 'collection' })}
            gaveLabel={supplier ? t('Paid supplier') : t('Gave on credit')}
            gotLabel={supplier ? t('Got goods on credit') : t('Got payment')}
          />
        )}
      >
        <View style={styles.actionBar}>
          {actions.map((a) => (
            <Touchable key={a.key} onPress={a.onPress} disabled={a.disabled} style={[styles.action, a.disabled && { opacity: 0.4 }]}
              accessibilityRole="button" accessibilityLabel={a.title} accessibilityState={{ disabled: Boolean(a.disabled) }}>
              <Ionicons name={a.icon} size={24} color={khataBar} />
              <Text style={styles.actionText} numberOfLines={1} adjustsFontSizeToFit={canShrink(a.title)} minimumFontScale={0.8}>{a.title}</Text>
            </Touchable>
          ))}
        </View>

        <View style={styles.balanceCard}>
          <View style={{ flex: 1 }} accessible accessibilityLabel={`${balanceLabel} ${formatMoney(Math.abs(party.balance))}`}>
            <Caption style={{ color: colors.ink600 }}>{balanceLabel}</Caption>
            <Text style={[styles.balanceFigure, { color: !party.balance ? colors.ink700 : getsBack ? colors.danger : colors.success }]}
              numberOfLines={1} adjustsFontSizeToFit>
              {formatMoney(Math.abs(party.balance))}
            </Text>
          </View>
          {party.balance > 0 && !supplier ? (
            <Touchable onPress={() => setPickingDate(true)} style={[styles.datePill, overdue && styles.datePillLate]} accessibilityRole="button">
              <Ionicons name="calendar-outline" size={16} color={overdue ? colors.danger : khataBar} />
              <Text style={[styles.datePillText, overdue && { color: colors.danger }]} numberOfLines={2}>
                {party.dueDate
                  ? t(overdue ? 'Overdue since {date}' : 'Due on {date}', { date: formatDate(`${party.dueDate}T00:00:00`, undefined, { day: 'numeric', month: 'short' }) })
                  : t('Set date')}
              </Text>
            </Touchable>
          ) : null}
        </View>

        {party.entries.length ? (
          <>
            <View style={styles.columns}>
              <Text style={[styles.colHead, { flex: 1, paddingLeft: space.md }]} numberOfLines={1}>{t('Entries').toUpperCase()}</Text>
              <Text style={[styles.colHead, styles.col, { color: colors.danger }]} numberOfLines={1} adjustsFontSizeToFit={canShrink(t('You gave'))} minimumFontScale={0.7}>
                {t('You gave').toUpperCase()}
              </Text>
              <Text style={[styles.colHead, styles.col, { color: colors.success }]} numberOfLines={1} adjustsFontSizeToFit={canShrink(t('You got'))} minimumFontScale={0.7}>
                {t('You got').toUpperCase()}
              </Text>
            </View>
            {groups.map((g) => (
              <View key={g.date}>
                <Text style={styles.dayLine}>{dateText(g.date)} • {ageText(t, g.date)}</Text>
                {g.entries.map((e) => {
                  const side = ledgerSide(e, party.partyType);
                  const owed = side === 'gave';
                  const paid = side === 'got';
                  const bought = itemsSummary(t, e.items, 3);
                  const kindLine = [entryLabel(t, e, supplier), e.mode && e.mode !== 'credit' ? t(MODE_LABELS[e.mode]) : null].filter(Boolean).join(' · ');
                  return (
                    <Touchable
                      key={e.entryId}
                      onPress={() => router.push({ pathname: '/book/detail', params: { entryId: e.entryId } })}
                      style={styles.entry}
                      accessibilityLabel={[
                        kindLine, dateText(e.date), timeText(e),
                        `${owed ? t('You gave') : paid ? t('You got') : ''} ${formatMoney(e.amount)}`,
                        t('Bal. {amount}', { amount: formatMoney(Math.abs(e.balanceAfter)) }), e.note,
                      ].filter(Boolean).join(', ')}
                    >
                      <View style={styles.entryMain}>
                        <Text style={styles.entryWhen} numberOfLines={1}>
                          {[dateText(e.date), timeText(e)].filter(Boolean).join(' • ')}
                        </Text>
                        <BalanceChip amount={e.balanceAfter} tone={(e.balanceAfter > 0) !== supplier ? 'red' : 'green'} />
                        <Caption numberOfLines={1} style={styles.entryKind}>{kindLine}</Caption>
                        {e.note ? <Body numberOfLines={2} style={styles.entryNote}>{e.note}</Body> : null}
                        {bought ? <Caption numberOfLines={2} style={styles.entryNote}>{bought}</Caption> : null}
                      </View>
                      <View style={[styles.col, styles.cell, owed && { backgroundColor: tones.red.bg }]}>
                        {owed ? <Text style={[styles.cellAmount, { color: colors.danger }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{formatMoney(e.amount)}</Text> : null}
                      </View>
                      <View style={[styles.col, styles.cell, paid && { backgroundColor: tones.green.bg }]}>
                        {paid ? <Text style={[styles.cellAmount, { color: colors.success }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{formatMoney(e.amount)}</Text> : null}
                      </View>
                    </Touchable>
                  );
                })}
              </View>
            ))}
          </>
        ) : (
          <View style={styles.empty}>
            <View style={styles.privateNote}>
              <Ionicons name="lock-closed" size={16} color={colors.success} />
              <Caption style={{ flex: 1, color: colors.ink600 }}>{t('Only you can see these entries.')}</Caption>
            </View>
            <View style={{ flex: 1 }} />
            {!supplier ? (
              <Button title={t('Add old dues from your paper khata')} variant="ghost" onPress={() => open({ kind: 'due' })} />
            ) : null}
            <Caption style={styles.startText}>{t('Start adding transactions with {name}', { name: party.name })}</Caption>
            <Ionicons name="arrow-down" size={22} color={khataBar} style={{ alignSelf: 'center' }} />
          </View>
        )}

      <Sheet visible={editing} onClose={() => { if (!saving) setEditing(false); }} title={supplier ? t('Edit supplier') : t('Edit customer')}>
        <Alert message={saveError ? t('Something went wrong. Try again.') : null} />
        <Field label={t('Name')} value={name} onChangeText={setName} error={errors.name} maxLength={80} />
        <Field label={t('Mobile number (optional)')} value={mobile} onChangeText={setMobile} keyboardType="phone-pad" prefix="+91" maxLength={14} error={errors.mobile} />
        <Button title={t('Save')} loading={saving} onPress={() => saveEdit().catch(() => undefined)} />
        {party.dueDate ? <Button title={t('Clear due date')} variant="ghost" disabled={saving} onPress={() => { setDueDate(null); setEditing(false); }} /> : null}
        {party.shareToken ? <Button title={t('Turn off ledger link')} variant="ghost" disabled={saving} onPress={turnOffLink} /> : null}
        <Button title={supplier ? t('Delete supplier') : t('Delete customer')} variant="ghost" disabled={saving} onPress={removeParty}
          icon={<Ionicons name="trash-outline" size={16} color={colors.danger} />} />
      </Sheet>

      <Sheet visible={pickingDate && Platform.OS === 'ios'} onClose={() => setPickingDate(false)} title={t('Due date')}>
        <DateTimePicker value={party.dueDate ? toDate(party.dueDate) : new Date()} mode="date" display="inline" themeVariant="light"
          accentColor={colors.accent600} onChange={(event, picked) => { if (picked) setDueDate(dayKey(picked)); setPickingDate(false); }} />
        {party.dueDate ? <Button title={t('Clear due date')} variant="ghost" onPress={() => { setDueDate(null); setPickingDate(false); }} /> : null}
      </Sheet>
      {pickingDate && Platform.OS === 'android' ? (
        <DateTimePicker value={party.dueDate ? toDate(party.dueDate) : new Date()} mode="date" display="default"
          onChange={(event, picked) => { setPickingDate(false); if (event.type === 'set' && picked) setDueDate(dayKey(picked)); }} />
      ) : null}
      </Screen>
    </View>
  );
}

/** "Bal. ₹1,00,000" under an entry: shrinks to fit a narrow column instead of cutting the figure. */
const BalanceChip = ({ amount, tone }) => {
  const t = useT();
  const text = t('Bal. {amount}', { amount: formatMoney(Math.abs(amount)) });
  // Android would drop the amount itself from a shrunk Indian-script label (canShrink): those wrap instead.
  const shrink = canShrink(text);
  return (
    <View style={[styles.bal, { backgroundColor: tones[tone].bg }]}>
      <Text style={[styles.balText, { color: tones[tone].fg }]} numberOfLines={shrink ? 1 : 2} adjustsFontSizeToFit={shrink} minimumFontScale={0.7}>
        {text}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.canvas },
  barTitle: { flexDirection: 'row', alignItems: 'center', gap: space.sm, maxWidth: 260, minHeight: 44 },
  barName: { ...type.label, fontFamily: fonts.semibold, fontSize: 16, color: '#ffffff' },
  barSub: { ...type.caption, color: '#ffffff', opacity: 0.85 },
  barIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  actionBar: {
    flexDirection: 'row', backgroundColor: colors.surface, paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line,
  },
  action: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: space.sm, minHeight: 56 },
  actionText: { ...type.caption, color: colors.ink700 },
  balanceCard: {
    flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.surface,
    marginHorizontal: space.lg, marginTop: space.md, borderRadius: radius.sm, paddingHorizontal: space.lg, paddingVertical: space.md,
    ...shadow.subtle,
  },
  balanceFigure: { ...type.money, fontFamily: fonts.bold, fontSize: 22 },
  datePill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '50%', minHeight: 44,
    paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: colors.accent50,
  },
  datePillLate: { backgroundColor: tones.red.bg },
  datePillText: { ...type.caption, fontFamily: fonts.semibold, color: khataBar, flexShrink: 1 },
  // Same width as the entry cards below, so each heading sits over its column.
  columns: { flexDirection: 'row', alignItems: 'center', marginHorizontal: space.lg, marginTop: space.lg, marginBottom: space.xs },
  colHead: { ...type.caption, fontFamily: fonts.semibold, letterSpacing: 0.6, color: colors.ink500, paddingHorizontal: space.sm },
  // A share of the width, so a 320dp phone at large text still leaves the entry readable.
  col: { width: '29%', textAlign: 'right' },
  dayLine: { ...type.caption, color: colors.ink500, textAlign: 'center', marginTop: space.md, marginBottom: space.sm },
  entry: {
    flexDirection: 'row', alignItems: 'stretch', backgroundColor: colors.surface, borderRadius: radius.xs,
    marginHorizontal: space.lg, marginBottom: space.sm, minHeight: 72, overflow: 'hidden', ...shadow.subtle,
  },
  entryMain: { flex: 1, gap: 4, paddingLeft: space.md, paddingRight: space.sm, paddingVertical: space.md },
  entryWhen: { ...type.label, fontFamily: fonts.medium, color: colors.ink800 },
  entryKind: { color: colors.ink500 },
  entryNote: { color: colors.ink700 },
  cell: { alignSelf: 'stretch', alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: space.sm },
  cellAmount: { ...type.money, fontFamily: fonts.bold, fontSize: 16 },
  bal: { alignSelf: 'flex-start', maxWidth: '100%', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  balText: { ...type.caption, fontFamily: fonts.semibold },
  empty: { minHeight: 360, paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.sm },
  privateNote: { flexDirection: 'row', alignItems: 'center', gap: space.sm, justifyContent: 'center' },
  startText: { textAlign: 'center', color: colors.ink600, marginTop: space.lg },
});
