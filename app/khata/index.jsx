import { useState } from 'react';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { bookPartySchema } from '@storeflick/validation';
import { Screen } from '../../src/components/Screen.jsx';
import { Sheet } from '../../src/components/Sheet.jsx';
import { Body, Button, Caption, Card, Divider, EmptyState, Loading, Touchable } from '../../src/components/ui.jsx';
import { FilterChips, SearchBar } from '../../src/components/Filters.jsx';
import {
  Avatar, KhataStatusBar, PartyPicker, SyncBadge, ageText, isSupplier, khataBar, partyRecord, remindOnWhatsApp, useKhataBar, useShop, useWeeklyNudge,
} from '../../src/components/book.jsx';
import { msg } from '../../src/lib/i18n.js';
import { readDeletedParties, readParties } from '../../src/lib/bookQueries.js';
import { formatDate, formatMoney } from '../../src/lib/format.js';
import { dayKey } from '../../src/lib/book.js';
import { useBook, useBookQuery } from '../../src/state/book.jsx';
import { useAuth } from '../../src/state/auth.jsx';
import { useToast } from '../../src/components/Toast.jsx';
import { khataListHtml } from '../../src/lib/bookPrint.js';
import { useT } from '../../src/state/locale.jsx';
import { HelpButton } from '../../src/components/Help.jsx';
import { colors, fonts, radius, shadow, space, tones, type } from '../../src/theme.js';

const TABS = [{ value: 'customer', label: msg('Customers') }, { value: 'supplier', label: msg('Suppliers') }];
const SORTS = [
  { value: 'due', label: msg('Highest due') },
  { value: 'recent', label: msg('Recent') },
  { value: 'oldest', label: msg('Oldest') },
  { value: 'dueDate', label: msg('Due date') },
  { value: 'name', label: msg('A–Z') },
];
/** Parties with no entry, or no due date, go last whichever way the list is sorted. */
const SORTERS = {
  due: (a, b) => b.balance - a.balance,
  recent: (a, b) => (b.lastDate ?? '').localeCompare(a.lastDate ?? ''),
  oldest: (a, b) => (a.lastDate ?? '9').localeCompare(b.lastDate ?? '9'),
  dueDate: (a, b) => (a.dueDate ?? '9').localeCompare(b.dueDate ?? '9'),
  name: (a, b) => a.name.localeCompare(b.name),
};

/**
 * The khata: customers and suppliers under the shop's bar, what the shop will give and will
 * get, then everyone with their balance, newest dues first. Green is what the shop will give,
 * red what it will get, as on every khata screen.
 */
export default function Khata() {
  const t = useT();
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { business } = useAuth();
  const shop = useShop();
  const toast = useToast();
  const { saveParty } = useBook();
  const all = useBookQuery((db) => readParties(db));
  const [tab, setTab] = useState(params.tab === 'supplier' ? 'supplier' : 'customer');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [sort, setSort] = useState('due');
  const [printing, setPrinting] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const deleted = (useBookQuery((db) => readDeletedParties(db)) ?? []).filter((p) => isSupplier(p) === (tab === 'supplier'));
  useKhataBar(navigation, { title: t('Khata'), headerRight: () => <HelpButton context="khata" /> }, [t]);
  useWeeklyNudge();
  // "Remind all": everyone who owes and has a number, largest dues first. Opened from the
  // Monday notification too. Each send opens WhatsApp with the message ready; ticked once sent.
  const [reminding, setReminding] = useState(params.remind === '1');
  const [sent, setSent] = useState(() => new Set());
  const toRemind = (all ?? []).filter((p) => !isSupplier(p) && p.balance > 0 && p.mobile).sort((a, b) => b.balance - a.balance);
  const nextUp = toRemind.find((p) => !sent.has(p.partyId));
  const send = async (p) => { if (await remindOnWhatsApp(t, p, shop.name ?? business?.name, shop.upi)) setSent((s) => new Set(s).add(p.partyId)); };

  const supplier = tab === 'supplier';
  const parties = all?.filter((p) => isSupplier(p) === supplier);
  const owed = (parties ?? []).reduce((sum, p) => sum + Math.max(0, p.balance), 0);
  const advance = (parties ?? []).reduce((sum, p) => sum + Math.max(0, -p.balance), 0);
  // A customer's balance is money the shop will get; a supplier's is money it will give.
  const willGive = supplier ? owed : advance;
  const willGet = supplier ? advance : owed;
  const today = dayKey();
  const needle = search.trim().toLowerCase();
  const shown = (parties ?? [])
    .filter((p) => !needle || p.name.toLowerCase().includes(needle) || (p.mobile ?? '').includes(needle))
    .sort((a, b) => SORTERS[sort](a, b) || a.name.localeCompare(b.name));
  const dueLine = (p) => {
    if (!p.dueDate || p.balance <= 0) return null;
    const date = formatDate(`${p.dueDate}T00:00:00`, undefined, { day: 'numeric', month: 'short' });
    return p.dueDate < today ? t('Overdue since {date}', { date }) : t('Due on {date}', { date });
  };
  const balanceText = (p) => (p.balance > 0 ? formatMoney(p.balance)
    : p.balance < 0 ? t('Advance {amount}', { amount: formatMoney(-p.balance) }) : t('Settled'));

  const restore = async (p) => {
    const result = bookPartySchema.safeParse(partyRecord(p, { deleted: false }));
    if (!result.success) { toast.error(t('Something went wrong. Try again.')); return; }
    await saveParty(result.data);
    toast.success(t('{name} is back in your khata', { name: p.name }));
  };

  const report = async () => {
    setPrinting(true);
    try {
      const { uri } = await Print.printToFileAsync({ html: khataListHtml({ store: business?.name ?? '', supplier, parties: shown }) });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: t('PDF report'), UTI: 'com.adobe.pdf' });
    } catch {
      toast.error(t('Something went wrong. Try again.'));
    } finally {
      setPrinting(false);
    }
  };

  return (
    <View style={styles.flex}>
      <KhataStatusBar />
      <Screen padded={false} contentStyle={{ paddingBottom: 96 + insets.bottom }}>
        <View style={styles.band}>
          <View style={styles.tabs} accessibilityRole="tablist">
            {TABS.map((o) => {
              const on = tab === o.value;
              return (
                <Touchable key={o.value} onPress={() => { setTab(o.value); setSearch(''); }} style={styles.tab}
                  accessibilityRole="tab" accessibilityState={{ selected: on }}>
                  <Text style={[styles.tabText, !on && styles.tabTextOff]}>{t(o.label).toUpperCase()}</Text>
                  <View style={[styles.tabLine, on && styles.tabLineOn]} />
                </Touchable>
              );
            })}
          </View>
        </View>

        <Card padded={false} style={styles.summary}>
          <View style={styles.totals}>
            <View style={styles.total} accessible accessibilityLabel={`${t('You will give')} ${formatMoney(willGive)}`}>
              <Caption style={styles.totalLabel}>{t('You will give')}</Caption>
              <Text style={[styles.totalFigure, { color: colors.success }]} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(willGive)}</Text>
            </View>
            <View style={styles.totalRule} />
            <View style={styles.total} accessible accessibilityLabel={`${t('You will get')} ${formatMoney(willGet)}`}>
              <Caption style={styles.totalLabel}>{t('You will get')}</Caption>
              <Text style={[styles.totalFigure, { color: colors.danger }]} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(willGet)}</Text>
            </View>
          </View>
          <View style={styles.cardActions}>
            <Touchable onPress={report} disabled={!parties?.length || printing} style={styles.reportRow} accessibilityRole="button">
              <Ionicons name="document-text-outline" size={18} color={khataBar} />
              <Body strong style={styles.reportText} numberOfLines={1}>{printing ? t('Preparing…') : t('View reports')}</Body>
            </Touchable>
            {!supplier && toRemind.length ? (
              <Touchable onPress={() => setReminding(true)} style={[styles.reportRow, styles.cardActionRule]} accessibilityRole="button">
                <Ionicons name="logo-whatsapp" size={18} color={khataBar} />
                <Body strong style={styles.reportText} numberOfLines={1}>{t('Remind all ({n})', { n: toRemind.length })}</Body>
              </Touchable>
            ) : null}
          </View>
        </Card>

        <View style={styles.section}>
          <SyncBadge />
          {(parties?.length ?? 0) > 3 ? (
            <SearchBar value={search} onChange={setSearch} placeholder={supplier ? msg('Search suppliers') : msg('Search customers')} />
          ) : null}
          {(parties?.length ?? 0) > 1 ? (
            <FilterChips options={SORTS.map((o) => ({ ...o, label: t(o.label) }))} value={sort} onChange={setSort} style={styles.sorts} />
          ) : null}
        </View>

        {!parties ? <Loading /> : !parties.length ? (
          <View style={styles.section}>
            <EmptyState
              icon={supplier ? '🚚' : '📒'}
              title={supplier ? t('No suppliers in your khata yet') : t('No customers in your khata yet')}
              message={supplier
                ? t('Add the dealers and wholesalers you buy from. Note goods taken on credit and what you pay them.')
                : t('Add a customer, or choose Credit when you write a bill. Their dues add up here.')}
            />
          </View>
        ) : (
          <View style={styles.list}>
            {shown.map((p, i) => {
              const gets = supplier ? p.balance < 0 : p.balance > 0;
              const gives = supplier ? p.balance > 0 : p.balance < 0;
              const canRemind = !supplier && p.balance > 0 && Boolean(p.mobile);
              return (
                <View key={p.partyId}>
                  {i ? <Divider style={styles.rowRule} /> : null}
                  <Touchable
                    onPress={() => router.push(`/khata/${p.partyId}`)}
                    style={styles.row}
                    accessibilityLabel={[p.name, ageText(t, p.lastDate), balanceText(p), dueLine(p)].filter(Boolean).join(', ')}
                  >
                    <View style={styles.rowMain}>
                      <Avatar name={p.name} />
                      <View style={{ flex: 1 }}>
                        <Body numberOfLines={2} style={styles.name}>{p.name}</Body>
                        <Caption numberOfLines={1}>{ageText(t, p.lastDate) ?? (p.mobile ? `+91 ${p.mobile}` : t('No entries yet'))}</Caption>
                        {dueLine(p) ? <Caption style={{ color: p.dueDate < today ? colors.danger : colors.warning }}>{dueLine(p)}</Caption> : null}
                      </View>
                    </View>
                    <View style={[styles.amountCell, gets && { backgroundColor: tones.red.bg }, gives && { backgroundColor: tones.green.bg }]}>
                      {p.balance ? (
                        <Text style={[styles.amount, { color: gets ? colors.danger : colors.success }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                          {formatMoney(Math.abs(p.balance))}
                        </Text>
                      ) : <Caption>{t('Settled')}</Caption>}
                      {gives && !supplier ? <Caption style={{ color: colors.success }}>{t('Advance')}</Caption> : null}
                      {canRemind ? (
                        <Touchable onPress={() => remindOnWhatsApp(t, p, shop.name ?? business?.name, shop.upi)} hitSlop={8} accessibilityRole="button"
                          accessibilityLabel={t('Remind {name} on WhatsApp', { name: p.name })} style={styles.remind}>
                          <Text style={styles.remindText}>{t('Remind').toUpperCase()}</Text>
                          <Ionicons name="chevron-forward" size={12} color={khataBar} />
                        </Touchable>
                      ) : null}
                    </View>
                  </Touchable>
                </View>
              );
            })}
          </View>
        )}

        {deleted.length ? (
          <View style={styles.section}>
            <Touchable onPress={() => setShowDeleted((v) => !v)} style={styles.deletedToggle}>
              <Caption style={{ color: colors.ink600 }}>{t('Recently deleted ({n})', { n: deleted.length })}</Caption>
              <Ionicons name={showDeleted ? 'chevron-up' : 'chevron-down'} size={16} color={colors.ink500} />
            </Touchable>
            {showDeleted ? (
              <Card padded={false}>
                {deleted.map((p, i) => (
                  <View key={p.partyId}>
                    {i ? <Divider /> : null}
                    <View style={styles.deletedRow}>
                      <Body style={{ flex: 1, color: colors.ink600 }} numberOfLines={1}>{p.name}</Body>
                      <Button title={t('Restore')} variant="ghost" size="sm" full={false} onPress={() => restore(p)} />
                    </View>
                  </View>
                ))}
              </Card>
            ) : null}
          </View>
        ) : null}

        <Sheet visible={reminding} onClose={() => setReminding(false)} title={t('Send reminders')}>
          {toRemind.length ? (
            <>
              <Caption style={styles.remindHint}>{t('Each one opens WhatsApp with the amount written. Send it, then come back for the next.')}</Caption>
              {nextUp ? (
                <Button title={t('Send to {name}', { name: nextUp.name.split(' ')[0] })} onPress={() => send(nextUp)}
                  icon={<Ionicons name="logo-whatsapp" size={18} color="#ffffff" />} />
              ) : <Caption style={[styles.remindHint, { color: colors.success }]}>{t('All reminders sent.')}</Caption>}
              {toRemind.map((p) => {
                const done = sent.has(p.partyId);
                return (
                  <View key={p.partyId} style={styles.remindRow}>
                    <Avatar name={p.name} size={36} />
                    <View style={{ flex: 1 }}>
                      <Body numberOfLines={1}>{p.name}</Body>
                      <Caption style={{ color: colors.danger }}>{formatMoney(p.balance)}</Caption>
                    </View>
                    <Button title={done ? t('Sent') : t('Send')} variant={done ? 'ghost' : 'secondary'} size="sm" full={false}
                      icon={done ? <Ionicons name="checkmark" size={16} color={colors.success} /> : null} onPress={() => send(p)} />
                  </View>
                );
              })}
            </>
          ) : <Caption>{t('Nobody owes you anything right now.')}</Caption>}
        </Sheet>

        <PartyPicker addOnly type={tab} visible={adding} onClose={() => setAdding(false)} onPick={(p) => router.push(`/khata/${p.partyId}`)} />
      </Screen>

      {/* One primary action, floating where the thumb rests. */}
      <Touchable onPress={() => setAdding(true)} style={[styles.fab, { bottom: insets.bottom + space.lg }]} accessibilityRole="button"
        accessibilityLabel={supplier ? t('Add supplier') : t('Add customer')}>
        <Ionicons name="person-add" size={20} color="#ffffff" />
        <Text style={styles.fabText} numberOfLines={1}>{(supplier ? t('Add supplier') : t('Add customer')).toUpperCase()}</Text>
      </Touchable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.canvas },
  band: { backgroundColor: khataBar, paddingBottom: 44 },
  tabs: { flexDirection: 'row', paddingHorizontal: space.lg },
  tab: { marginRight: space.xl, paddingTop: space.sm, minHeight: 44, justifyContent: 'flex-end' },
  tabText: { ...type.label, color: '#ffffff', letterSpacing: 0.6, paddingBottom: space.sm },
  tabTextOff: { opacity: 0.72 },
  tabLine: { height: 3, borderRadius: 2, backgroundColor: 'transparent' },
  tabLineOn: { backgroundColor: '#ffffff' },
  summary: { marginHorizontal: space.lg, marginTop: -36, overflow: 'hidden' },
  totals: { flexDirection: 'row', alignItems: 'stretch' },
  total: { flex: 1, alignItems: 'center', paddingVertical: space.md, paddingHorizontal: space.sm, gap: 2 },
  totalLabel: { color: colors.ink600 },
  totalFigure: { ...type.money, fontFamily: fonts.bold, fontSize: 20 },
  totalRule: { width: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginVertical: space.md },
  cardActions: { flexDirection: 'row', backgroundColor: colors.accent50, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  reportRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, minHeight: 44, paddingHorizontal: space.sm },
  cardActionRule: { borderLeftWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  remindHint: { color: colors.ink600, marginBottom: space.md },
  remindRow: {
    flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, minHeight: 56,
    borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line,
  },
  reportText: { color: khataBar },
  section: { paddingHorizontal: space.lg, paddingTop: space.md },
  sorts: { marginTop: space.sm },
  list: { backgroundColor: colors.surface, marginTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  rowRule: { marginLeft: space.lg + 40 + space.md },
  row: { flexDirection: 'row', alignItems: 'stretch', minHeight: 68 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingLeft: space.lg, paddingRight: space.sm, paddingVertical: space.md },
  name: { fontFamily: fonts.semibold },
  amountCell: { width: 124, maxWidth: '38%', alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: space.md, gap: 2 },
  amount: { ...type.money, fontFamily: fonts.bold, fontSize: 16 },
  remind: { flexDirection: 'row', alignItems: 'center', gap: 1, minHeight: 28 },
  remindText: { ...type.caption, fontFamily: fonts.semibold, color: khataBar, letterSpacing: 0.4 },
  deletedToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: space.lg },
  deletedRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm, minHeight: 52 },
  fab: {
    position: 'absolute', right: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.sm,
    backgroundColor: colors.accent600, borderRadius: radius.pill, paddingHorizontal: space.xl, minHeight: 52, maxWidth: '80%',
    ...shadow.lift,
  },
  fabText: { ...type.label, fontFamily: fonts.bold, color: '#ffffff', letterSpacing: 0.6 },
});
