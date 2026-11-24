import { useCallback, useEffect, useState } from 'react';
import { Alert as RNAlert, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { setStatusBarStyle } from 'expo-status-bar';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import { bookPartySchema } from '@storeflick/validation';
import { Alert, Body, Button, Caption, Card, Field, Label, Row, Touchable } from './ui.jsx';
import { Sheet } from './Sheet.jsx';
import { SearchBar } from './Filters.jsx';
import { msg } from '../lib/i18n.js';
import { formatMoney, initials } from '../lib/format.js';
import { readDay, readPaidWithBill, readParties } from '../lib/bookQueries.js';
import { billHeader, billHtml, dueOnBill, receiptHtml, upiLink } from '../lib/bookPrint.js';
import { qrSvg } from '../lib/qr.js';
import { useToast } from './Toast.jsx';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { contactMobile, dayAge, dayKey } from '../lib/book.js';
import { scheduleWeeklySummary } from '../lib/dueReminders.js';
import { newBookId, useBook, useBookQuery } from '../state/book.jsx';
import { useAuth } from '../state/auth.jsx';
import { businesses as businessesApi, storeSettings } from '../api/endpoints.js';
import { useT } from '../state/locale.jsx';
import { useAction } from '../lib/useAsync.js';
import { colors, fonts, radius, space, type } from '../theme.js';

export const KIND_LABELS = {
  sale: msg('Bill'),
  expense: msg('Expense'),
  collection: msg('Payment received'),
  opening: msg('Starting cash'),
  due: msg('Old dues'),
  purchase: msg('Purchase'),
  salesReturn: msg('Sales return'),
  purchaseReturn: msg('Return to supplier'),
};
export const MODE_LABELS = { cash: msg('Cash'), upi: msg('UPI'), credit: msg('Credit') };
export const CATEGORY_LABELS = {
  chit: msg('Chit'),
  dealer: msg('Dealer payment'),
  rent: msg('Rent'),
  salary: msg('Salary'),
  bills: msg('Bills (power, phone)'),
  other: msg('Other'),
};

/** Where the book's data stands: the merchant should never wonder whether a bill was kept. */
export const SyncBadge = () => {
  const t = useT();
  const { db, sync, syncNow } = useBook();
  if (!db && sync.state === 'error') return <Alert message={t('Something went wrong. Try again.')} />;
  const { icon, color, text } = sync.state === 'syncing'
    ? { icon: 'sync-outline', color: colors.ink500, text: t('Syncing…') }
    : sync.pending > 0 || sync.state === 'offline' || sync.state === 'error'
      ? { icon: 'phone-portrait-outline', color: colors.warning, text: t('Saved on this phone. Will sync when online.') }
      : { icon: 'cloud-done-outline', color: colors.success, text: t('All saved and backed up') };
  return (
    <Touchable onPress={syncNow} style={styles.badge} accessibilityLabel={text} haptics={null}>
      <Ionicons name={icon} size={15} color={color} />
      <Caption style={{ color, flex: 1 }}>{text}</Caption>
    </Touchable>
  );
};

/**
 * One line of a money summary: a label, and an amount signed the way the book reads it. The
 * hint runs under the whole line, not beside the amount: on a 320dp phone at a large font a
 * hint squeezed next to a lakh figure wrapped to six lines. A negative amount is shown in red
 * (cash in hand below zero means an entry is missing).
 */
export const MoneyLine = ({ label, amount, sign = '', strong, hint }) => (
  <View style={styles.line}>
    <View style={styles.lineRow}>
      <Body strong={strong} style={{ flex: 1 }}>{label}</Body>
      <Body strong={strong} style={[type.money, strong && styles.strongMoney, amount < 0 && { color: colors.danger }]}>
        {sign}{formatMoney(amount)}
      </Body>
    </View>
    {hint ? <Caption>{hint}</Caption> : null}
  </View>
);

/** The label above a group of choices in a form, matching the label above a text field. */
export const GroupLabel = ({ children, error }) => (
  <Label style={[styles.groupLabel, error && { color: colors.danger }]}>{children}</Label>
);

/** What a khata entry is called, from the party's side of the counter. */
export const entryLabel = (t, entry, supplier) => {
  if (supplier) return entry.kind === 'expense' ? t('Paid supplier') : entry.kind === 'due' ? t('Goods on credit') : t(KIND_LABELS[entry.kind]);
  return entry.kind === 'sale' && entry.mode === 'credit' ? t('Credit bill') : t(KIND_LABELS[entry.kind]);
};

/**
 * The store as a bill prints it: name, address, phone and GSTIN from the full store record.
 * Until that loads, or with no internet, the signed-in summary (the name) is used,
 * so a bill can always be made; a shop that never set up its store just prints its name.
 */
export const useShop = () => {
  const { business, businessId } = useAuth();
  const { db } = useBook();
  const [full, setFull] = useState(null);
  useEffect(() => {
    if (!businessId || !db) return undefined;
    let live = true;
    // Last known details first (kept in the book), so a bill made offline still has them.
    db.getFirstAsync("SELECT value FROM meta WHERE key = 'shop'")
      .then((row) => { if (live && row?.value) setFull((now) => now ?? JSON.parse(row.value)); })
      .catch(() => undefined);
    Promise.all([businessesApi.get(businessId), storeSettings.get(businessId).catch(() => null)])
      .then(([b, settings]) => {
        const pay = settings?.payments ?? {};
        const shop = { ...b, upi: pay.upiId ? { id: pay.upiId, name: pay.upiPayeeName || b.name } : null };
        if (live) setFull(shop);
        return db.runAsync("INSERT OR REPLACE INTO meta (key, value) VALUES ('shop', ?)", [JSON.stringify(shop)]);
      })
      .catch(() => undefined);
    return () => { live = false; };
  }, [businessId, db]);
  return full ?? business ?? {};
};

const PARTY_FIELDS = ['partyId', 'name', 'mobile', 'partyType', 'dueDate', 'shareToken', 'note'];
/** The party as the sync wants it, with `changes` applied; a change to undefined clears a field. */
export const partyRecord = (party, changes = {}) => {
  const next = { ...Object.fromEntries(PARTY_FIELDS.map((k) => [k, party[k] ?? undefined])), ...changes };
  return { ...Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined && v !== '')), updatedAt: new Date().toISOString() };
};
/** Parties made before suppliers existed have no type: they are customers. */
export const isSupplier = (party) => party?.partyType === 'supplier';

/**
 * Picks a khata customer (or supplier), or adds one on the spot: a credit sale usually
 * happens with the customer standing at the counter, not after a trip to another screen.
 */
export const PartyPicker = ({ visible, onClose, onPick, addOnly = false, type = 'customer' }) => {
  const t = useT();
  const { db, saveParty } = useBook();
  const supplier = type === 'supplier';
  const parties = (useBookQuery((db) => readParties(db)) ?? []).filter((p) => isSupplier(p) === supplier);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [errors, setErrors] = useState({});
  // One id per opening of the sheet, so a retried save cannot add the same person twice.
  const [partyId, setPartyId] = useState(newBookId);
  useEffect(() => { if (visible) { setAdding(addOnly); setPartyId(newBookId()); } }, [visible, addOnly]);

  const needle = search.trim().toLowerCase();
  const shown = needle
    ? parties.filter((p) => p.name.toLowerCase().includes(needle) || (p.mobile ?? '').includes(needle))
    : parties;

  const close = () => { setAdding(false); setSearch(''); setErrors({}); onClose(); };

  const { run: add, pending: addingParty, error: addError } = useAction(async () => {
    const party = { partyId, name, ...(mobile.trim() ? { mobile } : {}), partyType: type, updatedAt: new Date().toISOString() };
    const result = bookPartySchema.safeParse(party);
    if (!result.success) {
      setErrors(Object.fromEntries(result.error.issues.map((i) => [i.path[0], i.message])));
      return;
    }
    await saveParty(result.data);
    setName(''); setMobile('');
    onPick(result.data);
    close();
  });

  // iOS shows its own picker with no permission; Android reads the picked contact, which needs it.
  const fromContacts = async () => {
    try {
      if (Platform.OS === 'android' && !(await Contacts.requestPermissionsAsync()).granted) {
        RNAlert.alert(t('Contacts not allowed'), t('Allow contacts for StoreFlick in your phone settings, or type the name and number.'));
        return;
      }
      const contact = await Contacts.presentContactPickerAsync();
      if (!contact) return;
      const picked = contact.name ?? [contact.firstName, contact.lastName].filter(Boolean).join(' ');
      const phone = contact.phoneNumbers?.find((p) => p.isPrimary)?.number ?? contact.phoneNumbers?.[0]?.number;
      if (picked) setName(picked.slice(0, 80));
      setMobile(phone ? contactMobile(phone) : '');
      setErrors({});
    } catch {
      RNAlert.alert(t('Contacts not available'), t('Type the name and number instead.'));
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={() => { if (!addingParty) close(); }}
      title={adding ? (supplier ? t('New supplier') : t('New customer')) : (supplier ? t('Choose supplier') : t('Choose customer'))}
    >
      <Alert message={addError ? t('Something went wrong. Try again.') : null} />
      {adding ? (
        <>
          <Touchable onPress={fromContacts} style={styles.addRow} accessibilityLabel={t('Add from contacts')}>
            <Ionicons name="people-circle-outline" size={22} color={colors.accent700} />
            <Body strong style={{ color: colors.accent700 }}>{t('Add from contacts')}</Body>
          </Touchable>
          <Field label={t('Name')} value={name} onChangeText={setName} placeholder={supplier ? t('Supplier name') : t('Customer name')} autoFocus error={errors.name} maxLength={80} />
          <Field
            label={t('Mobile number (optional)')}
            value={mobile}
            onChangeText={setMobile}
            keyboardType="phone-pad"
            prefix="+91"
            maxLength={14}
            error={errors.mobile}
          />
          <Button title={supplier ? t('Add supplier') : t('Add customer')} loading={addingParty} disabled={!db} onPress={() => add().catch(() => undefined)} />
          {addOnly ? null : <Button title={t('Back')} variant="ghost" disabled={addingParty} onPress={() => setAdding(false)} />}
        </>
      ) : (
        <>
          <Touchable onPress={() => setAdding(true)} style={styles.addRow}>
            <Ionicons name="person-add-outline" size={20} color={colors.accent700} />
            <Body strong style={{ color: colors.accent700 }}>{supplier ? t('Add new supplier') : t('Add new customer')}</Body>
          </Touchable>
          {parties.length > 6 ? <SearchBar value={search} onChange={setSearch} placeholder={supplier ? msg('Search suppliers') : msg('Search customers')} /> : null}
          {shown.map((p) => (
            <Touchable key={p.partyId} onPress={() => { onPick(p); close(); }} style={styles.pickRow}>
              <View style={{ flex: 1 }}>
                <Body strong>{p.name}</Body>
                {p.mobile ? <Caption>+91 {p.mobile}</Caption> : null}
              </View>
              {p.balance > 0 ? <Caption style={{ color: colors.danger }}>{t('Due {amount}', { amount: formatMoney(p.balance) })}</Caption> : null}
            </Touchable>
          ))}
        </>
      )}
    </Sheet>
  );
};

/** Red is money coming to the shop, green is money it pays out, as in Khatabook. */
export const DueAmount = ({ balance, style, supplier = false }) => {
  const t = useT();
  if (balance > 0) return <Body strong style={[type.money, { color: supplier ? colors.success : colors.danger }, style]}>{formatMoney(balance)}</Body>;
  if (balance < 0) return <Caption style={[{ color: supplier ? colors.danger : colors.success }, style]}>{t('Advance {amount}', { amount: formatMoney(-balance) })}</Caption>;
  return <Caption style={style}>{t('Settled')}</Caption>;
};

export const SectionTitle = ({ title, total }) => (
  <Row style={styles.sectionTitle}>
    <Caption style={styles.sectionText}>{title.toUpperCase()}</Caption>
    {total != null ? <Caption style={styles.sectionText}>{formatMoney(total)}</Caption> : null}
  </Row>
);

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: space.sm },
  line: { paddingVertical: 6, gap: 2 },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  groupLabel: { marginBottom: 10, color: colors.ink700 },
  strongMoney: { fontSize: 20 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, minHeight: 48 },
  pickRow: {
    flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, minHeight: 52,
    borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line,
  },
  sectionTitle: { justifyContent: 'space-between', marginTop: space.xl, marginBottom: space.sm },
  sectionText: { letterSpacing: 0.8, color: colors.ink500 },
});

/**
 * The Home screen's way into the book: today's sales and balance, what is owed, and the
 * one action a shopkeeper takes most often, adding a bill.
 */
export const BookCard = ({ onOpen, onBill, onKhata, onStaff }) => {
  const t = useT();
  useWeeklyNudge();
  const day = useBookQuery((db) => readDayLite(db));
  return (
    <Card style={cardStyles.card}>
      <Touchable onPress={onOpen} style={cardStyles.head} accessibilityLabel={t('Bill book')}>
        <View style={cardStyles.icon}><Ionicons name="book-outline" size={20} color={colors.accent700} /></View>
        <View style={{ flex: 1 }}>
          <Body strong>{t('Bill book')}</Body>
          <Caption>{t('Today: sales {sales} · in hand {balance}', {
            sales: formatMoney(day?.sales ?? 0), balance: formatMoney(day?.closing ?? 0),
          })}</Caption>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.ink400} />
      </Touchable>
      {/* Two rows, not three buttons abreast: at 320dp with large text three labels shrank unreadably. */}
      <Row gap={space.sm} style={{ marginTop: space.md }}>
        <Button title={t('Khata')} variant="secondary" size="sm" full={false} style={{ flex: 1 }} onPress={onKhata}
          icon={<Ionicons name="people-outline" size={16} color={colors.ink900} />} />
        {onStaff ? (
          <Button title={t('Staff')} variant="secondary" size="sm" full={false} style={{ flex: 1 }} onPress={onStaff}
            icon={<Ionicons name="calendar-outline" size={16} color={colors.ink900} />} />
        ) : null}
      </Row>
      <Button title={t('Add bill')} size="sm" style={{ marginTop: space.sm }} onPress={onBill}
        icon={<Ionicons name="add" size={18} color="#ffffff" />} />
    </Card>
  );
};

const readDayLite = async (db) => {
  const day = await readDay(db, dayKey());
  return { sales: day.sales.total, closing: day.closingBalance };
};

const cardStyles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.semibold, letterSpacing: 0.3 },
  gaveGot: { flex: 1, borderRadius: radius.sm, minHeight: 52 },
  card: { marginBottom: space.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent50, alignItems: 'center', justifyContent: 'center' },
});

/* ───────────── Khata look ─────────────
 * The khata screens follow the layout shopkeepers already know from paper-khata apps: a solid
 * bar with the party, a ledger of separate entry cards in "You gave / You got" columns, and
 * two solid buttons at the foot. The bar is the brand's deep orange (accent700): white text on
 * the brighter accent600 fails contrast at caption size. Red and green carry the same meaning
 * everywhere: red is money or goods that went out, green is what came in.
 */
export const khataBar = colors.accent700;

/** Initials in a circle: on the bar it is white on orange, in lists grey on white. */
export const Avatar = ({ name, size = 40, onBar = false }) => (
  <View
    style={[cardStyles.avatar, { width: size, height: size, borderRadius: size / 2 },
      onBar ? { backgroundColor: '#ffffff' } : { backgroundColor: colors.sunken }]}
    accessible={false}
  >
    <Text style={[cardStyles.avatarText, { fontSize: size * 0.38, color: onBar ? khataBar : colors.ink700 }]}>{initials(name)}</Text>
  </View>
);

/** "Today", "Yesterday", "3 days ago", "2 weeks ago", "4 months ago" for a YYYY-MM-DD day. */
export const ageText = (t, day) => {
  if (!day) return null;
  const { unit, n } = dayAge(day);
  if (unit === 'today') return t('Today');
  if (unit === 'yesterday') return t('Yesterday');
  if (unit === 'days') return t('{n} days ago', { n });
  if (unit === 'weeks') return n === 1 ? t('1 week ago') : t('{n} weeks ago', { n });
  return n === 1 ? t('1 month ago') : t('{n} months ago', { n });
};

/**
 * Puts a screen under the khata bar: solid orange, white title and icons, light status bar.
 * `title` may be a string or an element (the party's avatar and name).
 */
export const useKhataBar = (navigation, { title, headerTitle, headerRight } = {}, deps = []) => {
  useEffect(() => {
    navigation.setOptions?.({
      headerStyle: { backgroundColor: khataBar },
      headerTintColor: '#ffffff',
      headerTitleStyle: { ...type.heading, color: '#ffffff' },
      ...(title !== undefined ? { title } : {}),
      ...(headerTitle ? { headerTitle } : {}),
      ...(headerRight ? { headerRight } : {}),
    });
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
};

/**
 * Light status-bar icons while a khata-bar screen is in front, dark again when it is not.
 * Set on focus rather than by mounting a <StatusBar>: a mounted one keeps winning while a
 * light-headed screen (Transaction saved, an edit form) is pushed over it.
 */
export const KhataStatusBar = () => {
  useFocusEffect(useCallback(() => {
    setStatusBarStyle('light');
    return () => setStatusBarStyle('dark');
  }, []));
  return null;
};

/**
 * The two actions at the foot of a khata: solid red "YOU GAVE ₹" and solid green "YOU GOT ₹".
 * `gaveLabel`/`gotLabel` tell a screen reader what each actually records.
 */
export const GaveGotButtons = ({ onGave, onGot, gaveLabel, gotLabel }) => {
  const t = useT();
  return (
    <Row gap={space.sm}>
      <Button title={`${t('You gave').toUpperCase()} ₹`} full={false} onPress={onGave} accessibilityLabel={gaveLabel}
        style={[cardStyles.gaveGot, { backgroundColor: colors.danger }]} />
      <Button title={`${t('You got').toUpperCase()} ₹`} full={false} onPress={onGot} accessibilityLabel={gotLabel}
        style={[cardStyles.gaveGot, { backgroundColor: colors.success }]} />
    </Row>
  );
};

/** The reminder a customer gets on WhatsApp or SMS, with what they owe and the shop's name. */
export const reminderText = (t, party, store, upi) => [
  t('Namaste {name}, {amount} is pending at {store}. Please pay when you can. Thank you!', {
    name: party.name, amount: formatMoney(party.balance), store: store ?? '',
  }),
  upi?.id ? t('Pay by UPI: {id}', { id: upi.id }) : null,
].filter(Boolean).join('\n');

/** Opens WhatsApp with the reminder written; resolves true once WhatsApp opened. */
export const remindOnWhatsApp = (t, party, store, upi) =>
  Linking.openURL(`https://wa.me/91${party.mobile}?text=${encodeURIComponent(reminderText(t, party, store, upi))}`)
    .then(() => true)
    .catch(() => {
      RNAlert.alert(t('WhatsApp not available'), t('Could not open WhatsApp on this device.'));
      return false;
    });

/**
 * Keeps the Monday nudge ("3 customers owe you ₹1,240") current: rescheduled with fresh figures
 * whenever a screen showing the book is open, removed when nobody owes anything.
 */
export const useWeeklyNudge = () => {
  const t = useT();
  const parties = useBookQuery((db) => readParties(db));
  const owing = (parties ?? []).filter((p) => !isSupplier(p) && p.balance > 0);
  const total = owing.reduce((sum, p) => sum + p.balance, 0);
  useEffect(() => {
    if (!parties) return;
    scheduleWeeklySummary({
      count: owing.length,
      title: t('Payments to collect'),
      body: t(owing.length === 1 ? '{n} customer owes you {amount}. Tap to send a reminder.' : '{n} customers owe you {amount}. Tap to send reminders.',
        { n: owing.length, amount: formatMoney(total) }),
    }).catch(() => undefined);
  }, [Boolean(parties), owing.length, total, t]); // eslint-disable-line react-hooks/exhaustive-deps
};

/**
 * Sharing a bill as a PDF and printing it as a till receipt, both with a UPI QR for whatever is
 * still to pay (when the shop has a UPI ID). A receipt goes through Android's print system: a
 * Bluetooth thermal printer appears there through its print-service app (RawBT or the maker's).
 */
export const useBillPrinting = () => {
  const t = useT();
  const toast = useToast();
  const shop = useShop();
  const { db } = useBook();
  const [busy, setBusy] = useState(null);

  const prepare = async (entry) => {
    const paid = await readPaidWithBill(db, entry);
    const upi = billHeader(shop).upi;
    const due = dueOnBill(entry, paid);
    const qr = upi && due ? await qrSvg(upiLink(upi, due, entry.billNo ? `Bill ${entry.billNo}` : undefined)) : null;
    return { paid, qr };
  };

  const run = async (what, task) => {
    setBusy(what);
    try { await task(); } catch { toast.error(t('Something went wrong. Try again.')); } finally { setBusy(null); }
  };

  const shareBill = (entry, partyName) => run('share', async () => {
    const { paid, qr } = await prepare(entry);
    const { uri } = await Print.printToFileAsync({ html: billHtml({ store: shop, entry, partyName, paid, qr }) });
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: t('Share bill'), UTI: 'com.adobe.pdf' });
  });

  const printReceipt = (entry, partyName) => RNAlert.alert(t('Print receipt'), t('Choose the paper width of your receipt printer.'), [
    ...[58, 80].map((width) => ({
      text: t('{n} mm paper', { n: width }),
      onPress: () => run('print', async () => {
        const { paid, qr } = await prepare(entry);
        await Print.printAsync({ html: receiptHtml({ store: shop, entry, partyName, paid, qr, width }) });
      }),
    })),
    { text: t('Cancel'), style: 'cancel' },
  ]);

  return { shareBill, printReceipt, busy };
};
