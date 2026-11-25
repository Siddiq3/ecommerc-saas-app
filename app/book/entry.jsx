import { useEffect, useState } from 'react';
import { Alert as RNAlert, Image, Platform, StyleSheet, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { toMajor } from '@storeflick/shared';
import { BOOK_GST_RATES, bookEntrySchema, itemsTotal, rupeesText } from '@storeflick/validation';
import { Screen } from '../../src/components/Screen.jsx';
import { Alert, Body, Button, Caption, Field, Row, SelectField, Toggle, Touchable } from '../../src/components/ui.jsx';
import { FilterChips } from '../../src/components/Filters.jsx';
import {
  CATEGORY_LABELS, GroupLabel, KIND_LABELS, KhataStatusBar, MODE_LABELS, PartyPicker, entryLabel, isSupplier, useBillPrinting, useShop,
} from '../../src/components/book.jsx';
import { ItemList, ItemSheet } from '../../src/components/BillItems.jsx';
import { Scanner } from '../../src/components/Scanner.jsx';
import { addOrIncrement } from '../../src/lib/productCache.js';
import { Sheet } from '../../src/components/Sheet.jsx';
import { dayKey, ledgerSide } from '../../src/lib/book.js';
import { msg } from '../../src/lib/i18n.js';
import { nextBillNumber, readEntry, readExpenseLabels, readReceipt } from '../../src/lib/bookQueries.js';
import { formatDate, formatMoney } from '../../src/lib/format.js';
import { pickImage, takePhoto } from '../../src/lib/upload.js';
import { newBookId, useBook, useBookQuery } from '../../src/state/book.jsx';
import { useToast } from '../../src/components/Toast.jsx';
import { useT } from '../../src/state/locale.jsx';
import { useAction } from '../../src/lib/useAsync.js';
import { colors, space, type } from '../../src/theme.js';

const amountField = rupeesText('Amount');
const chips = (labels, keys) => keys.map((value) => ({ value, label: labels[value] }));
const GOODS = ['sale', 'purchase', 'salesReturn', 'purchaseReturn'];
const RETURNS = ['salesReturn', 'purchaseReturn'];
/** The kinds offered at the top of a new entry; "Return" opens its own choice of which way. */
const KIND_CHOICES = [
  { value: 'sale', label: msg('Bill') }, { value: 'purchase', label: msg('Purchase') },
  { value: 'expense', label: msg('Expense') }, { value: 'collection', label: msg('Payment received') },
  { value: 'return', label: msg('Return') },
];
const RETURN_CHOICES = [{ value: 'salesReturn', label: msg('From customer') }, { value: 'purchaseReturn', label: msg('To supplier') }];
/** What credit means for each goods entry, said where the choice is made. */
const CREDIT_HINTS = {
  sale: msg('Goes into the customer’s khata. Not counted as cash today.'),
  purchase: msg('Added to what you owe the supplier. Not paid from cash today.'),
  salesReturn: msg('Taken off what the customer owes. No cash given back.'),
  purchaseReturn: msg('Taken off what you owe the supplier. No cash comes back.'),
};
const TITLES = {
  sale: msg('New bill'), expense: msg('New expense'), collection: msg('Payment received'),
  opening: msg('Starting cash'), due: msg('Old dues'),
  purchase: msg('New purchase'), salesReturn: msg('Sales return'), purchaseReturn: msg('Return to supplier'),
};
const toDate = (day) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d); };
const GST_CHIPS = BOOK_GST_RATES.filter(Boolean).map((r) => ({ value: r, label: `${r}%` }));

/**
 * One entry: a bill, an expense, a payment received, starting cash or old dues. The amount
 * comes first and is focused, because it is the one thing every entry needs.
 */
export default function BookEntry() {
  const t = useT();
  const router = useRouter();
  const navigation = useNavigation();
  const toast = useToast();
  const params = useLocalSearchParams();
  const { db, saveEntry, deleteEntry, saveReceipt, saveRepeat } = useBook();
  const labels = useBookQuery((db) => readExpenseLabels(db)) ?? [];

  const [existing, setExisting] = useState(null);
  const [kind, setKind] = useState(String(params.kind ?? 'sale'));
  // From the khata: just the amount, a note and the date. "Add items or GST" opens the full bill.
  const [simple, setSimple] = useState(params.simple === '1' && !params.entryId);
  // A new entry can arrive pre-filled, e.g. a salary from staff attendance.
  const [amount, setAmount] = useState(params.amount ? String(params.amount) : '');
  const [mode, setMode] = useState(params.mode ? String(params.mode) : 'cash');
  const [category, setCategory] = useState(params.category ? String(params.category) : null);
  const [party, setParty] = useState(params.partyId
    ? { partyId: String(params.partyId), name: String(params.partyName ?? ''), partyType: params.partyType ? String(params.partyType) : null }
    : null);
  const [note, setNote] = useState(params.note ? String(params.note) : '');
  const [date, setDate] = useState(String(params.date ?? dayKey()));
  const [picking, setPicking] = useState(false);
  const [items, setItems] = useState([]);
  const [itemIndex, setItemIndex] = useState(null); // null: closed, -1: new line, n: editing line n
  const [scanning, setScanning] = useState(false);
  const [discount, setDiscount] = useState('');
  const [gstRate, setGstRate] = useState(null);
  const [label, setLabel] = useState('');
  const [paidNow, setPaidNow] = useState('');
  const [paidMode, setPaidMode] = useState('cash');
  const [receipt, setReceipt] = useState(null); // { uri, picked }
  const [repeat, setRepeat] = useState(false);
  const [pickingDate, setPickingDate] = useState(false);
  const today = dayKey();
  const longDate = (d) => formatDate(`${d}T00:00:00`, undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const [errors, setErrors] = useState({});
  const [supplierBillNo, setSupplierBillNo] = useState('');
  // Fixed for the life of the form: if a save fails after writing, trying again updates the
  // same records instead of adding the bill (or its part payment) a second time.
  const [ids] = useState(() => ({ entry: newBookId(), payment: newBookId() }));

  // Editing: load the entry, its party and its receipt photo.
  useEffect(() => {
    if (!db || !params.entryId) return;
    readEntry(db, String(params.entryId)).then(async (e) => {
      if (!e) return;
      setExisting(e);
      setKind(e.kind);
      setAmount(String(toMajor(e.amount)));
      setMode(e.mode ?? 'cash');
      setCategory(e.category);
      setItems(Array.isArray(e.items) ? e.items : []);
      setDiscount(e.discount ? String(toMajor(e.discount)) : '');
      setSupplierBillNo(e.kind !== 'sale' && e.billNo ? e.billNo : '');
      setGstRate(e.gstRate ?? null);
      setLabel(e.label ?? '');
      setNote(e.note ?? '');
      setDate(e.date);
      const uri = await readReceipt(db, e.entryId);
      if (uri) setReceipt({ uri, picked: false });
      if (e.partyId) {
        const p = await db.getFirstAsync('SELECT partyId, name, partyType FROM parties WHERE partyId = ?', [e.partyId]);
        setParty(p ?? { partyId: e.partyId, name: '' });
      }
    });
  }, [db, params.entryId]);

  const supplier = isSupplier(party);
  // Which khata column this entry lands in, for the colour of the simple form.
  const khataSide = party ? ledgerSide({ kind, mode }, party.partyType) : null;
  const sideColor = khataSide === 'gave' ? colors.danger : colors.success;
  useEffect(() => {
    // From the khata: a red "You gave ₹ to …" or green "You got ₹ from …" bar, like the button tapped.
    if (simple && khataSide) {
      navigation.setOptions?.({
        title: khataSide === 'gave' ? t('You gave ₹ to {name}', { name: party?.name ?? '' }) : t('You got ₹ from {name}', { name: party?.name ?? '' }),
        headerStyle: { backgroundColor: sideColor },
        headerTintColor: '#ffffff',
        headerTitleStyle: { ...type.heading, color: '#ffffff' },
      });
      return;
    }
    const title = supplier && (kind === 'expense' || kind === 'due') ? entryLabel(t, { kind }, true) : null;
    navigation.setOptions?.({ title: title ?? (existing ? t('Edit {kind}', { kind: t(KIND_LABELS[kind]).toLowerCase() }) : t(TITLES[kind] ?? 'New bill')) });
  }, [navigation, existing, kind, supplier, simple, t]); // eslint-disable-line react-hooks/exhaustive-deps

  const goods = GOODS.includes(kind);
  const modes = goods ? ['cash', 'upi', 'credit'] : ['cash', 'upi'];
  const hasMode = goods || kind === 'expense' || kind === 'collection';
  const needsParty = kind === 'collection' || kind === 'due' || (goods && mode === 'credit');
  // An expense can name the supplier it paid; every other entry with a party names a customer.
  const showParty = needsParty || goods || kind === 'expense';
  const pickType = ['expense', 'purchase', 'purchaseReturn'].includes(kind) || (kind === 'due' && supplier) ? 'supplier' : 'customer';
  const itemized = goods && items.length > 0;
  const discountPaise = itemized && discount.trim() ? rupeesText('Discount').safeParse(discount) : null;
  const billTotal = itemsTotal(items) - (discountPaise?.success ? discountPaise.data : 0);
  const splitPay = !existing && !simple && kind === 'sale' && mode === 'credit';
  // Switching kind keeps what still makes sense: no credit outside goods, and a customer is
  // dropped when the new kind deals with a supplier (and the other way round).
  const changeKind = (k) => {
    setKind(k);
    setErrors({});
    if (!GOODS.includes(k) && mode === 'credit') setMode('cash');
    const wantsSupplier = ['expense', 'purchase', 'purchaseReturn'].includes(k);
    if (party && isSupplier(party) !== wantsSupplier) setParty(null);
  };

  // Scan and item-code billing change the list directly: a new line, or one more of a product already on the bill.
  const changeItems = (update) => {
    setItems(update);
    setErrors((e) => ({ ...e, amount: undefined, items: undefined }));
  };
  const quickAdd = (line) => changeItems((list) => addOrIncrement(list, line));

  const saveItem = (line) => {
    setItems((list) => (itemIndex >= 0 ? list.map((it, i) => (i === itemIndex ? line : it)) : [...list, line]));
    setErrors((e) => ({ ...e, amount: undefined, items: undefined }));
  };

  const { run: save, pending: saving, error: saveError } = useAction(async () => {
    if (discountPaise && !discountPaise.success) { setErrors({ discount: t('Enter an amount, like 250 or 99.50') }); return; }
    const parsed = itemized ? { success: true, data: billTotal } : amountField.safeParse(amount);
    if (!parsed.success) { setErrors({ amount: t('Enter an amount, like 250 or 99.50') }); return; }
    const paid = splitPay && paidNow.trim() ? amountField.safeParse(paidNow) : null;
    if (paid && (!paid.success || paid.data >= parsed.data)) {
      setErrors({ paidNow: t('Paid now must be less than the bill. If it is all paid, choose Cash or UPI.') });
      return;
    }
    const entry = {
      entryId: existing?.entryId ?? ids.entry,
      kind,
      date,
      amount: parsed.data,
      ...(itemized ? { items } : {}),
      ...(itemized && discountPaise?.data ? { discount: discountPaise.data } : {}),
      ...(kind === 'sale' ? { billNo: existing?.billNo ?? await nextBillNumber(db, date) } : {}),
      ...(kind !== 'sale' && goods && supplierBillNo.trim() ? { billNo: supplierBillNo.trim() } : {}),
      ...(goods && gstRate ? { gstRate } : {}),
      ...(hasMode ? { mode: modes.includes(mode) ? mode : 'cash' } : {}),
      ...(showParty && party ? { partyId: party.partyId } : {}),
      ...(kind === 'expense' && category ? { category } : {}),
      ...(kind === 'expense' && category === 'other' && label.trim() ? { label } : {}),
      ...(note.trim() ? { note } : {}),
      updatedAt: new Date().toISOString(),
    };
    const result = bookEntrySchema.safeParse(entry);
    if (!result.success) {
      const next = Object.fromEntries(result.error.issues.map((i) => [i.path[0], i.message]));
      setErrors({
        ...next,
        ...(next.partyId ? { partyId: pickType === 'supplier' ? t('Choose the supplier') : t('Choose the customer') } : {}),
        ...(next.category ? { category: t('Choose what the expense was for') } : {}),
        ...(next.amount ? { amount: itemized ? t('The items add up to ₹0. Check the prices.') : t('Enter an amount, like 250 or 99.50') } : {}),
        ...(next.items ? { items: t('Check the items on this bill') } : {}),
      });
      return;
    }
    await saveEntry(result.data);
    // Part paid at the counter: the bill goes on credit in full, and what was paid comes off at once.
    if (paid) {
      await saveEntry({
        entryId: ids.payment, kind: 'collection', date, amount: paid.data, mode: paidMode, partyId: party.partyId,
        note: `Bill ${result.data.billNo}`, updatedAt: new Date().toISOString(), deleted: false,
      });
    }
    if (receipt?.picked) await saveReceipt(result.data.entryId, receipt.uri).catch(() => toast.error(t('The photo could not be saved.')));
    if (repeat && !existing && kind === 'expense') await saveRepeat(newBookId(), result.data, Number(date.slice(8)), date.slice(0, 7));
    if (!existing && (result.data.partyId || goods)) {
      router.replace({ pathname: '/book/saved', params: { entryId: result.data.entryId } });
      return;
    }
    toast.success(existing ? t('Saved') : t('{kind} added', { kind: t(KIND_LABELS[kind]) }));
    router.back();
  });

  const { run: deleteSaved, pending: deleting, error: deleteError } = useAction(async () => {
    await deleteEntry(existing);
    router.back();
  });

  const remove = () => RNAlert.alert(t('Delete this entry?'), t('It is removed from the book and the khata on every phone.'), [
    { text: t('Keep'), style: 'cancel' },
    { text: t('Delete'), style: 'destructive', onPress: () => deleteSaved().catch(() => undefined) },
  ]);

  const attach = async (from) => {
    try {
      const asset = from === 'camera' ? await takePhoto({ allowsEditing: false }) : await pickImage({ aspect: null, allowsEditing: false });
      if (asset) setReceipt({ uri: asset.uri, picked: true });
    } catch {
      toast.error(t('Allow camera or photos for StoreFlick in your phone settings.'));
    }
  };

  // One button, then the camera or the gallery: two buttons side by side shrank their labels
  // to different sizes on a small phone.
  const choosePhoto = () => RNAlert.alert(t('Add receipt photo'), undefined, [
    { text: t('Take photo'), onPress: () => attach('camera') },
    { text: t('Choose photo'), onPress: () => attach('library') },
    { text: t('Cancel'), style: 'cancel' },
  ]);

  const printing = useBillPrinting();
  const shop = useShop();


  return (
    <Screen footer={(
      <Button title={existing ? t('Save changes') : t('Save')} size="lg" loading={saving} disabled={!db || deleting || (Boolean(params.entryId) && !existing)}
        style={simple && khataSide ? { backgroundColor: sideColor } : null} onPress={() => save().catch(() => undefined)} />
    )}>
      {simple && khataSide ? <KhataStatusBar /> : null}
      <Alert message={saveError || deleteError ? t('Something went wrong. Try again.') : null} />
      {!existing && !simple && !params.partyType && [...GOODS, 'expense', 'collection'].includes(kind) ? (
        <>
          <FilterChips
            options={KIND_CHOICES.map((o) => ({ ...o, label: t(o.label) }))}
            value={RETURNS.includes(kind) ? 'return' : kind}
            onChange={(k) => changeKind(k === 'return' ? 'salesReturn' : k)}
            style={styles.kinds}
          />
          {RETURNS.includes(kind) ? (
            <FilterChips options={RETURN_CHOICES.map((o) => ({ ...o, label: t(o.label) }))} value={kind} onChange={changeKind} style={styles.kinds} />
          ) : null}
        </>
      ) : null}

      {itemized ? (
        <View style={styles.totalBox}>
          <Caption style={errors.amount ? { color: colors.danger } : null}>{errors.amount ?? t('Bill total (adds up from the items)')}</Caption>
          <Body style={styles.totalFigure}>{formatMoney(billTotal)}</Body>
        </View>
      ) : (
        <Field
          label={t('Amount')}
          value={amount}
          onChangeText={(v) => { setAmount(v); setErrors((e) => ({ ...e, amount: undefined })); }}
          placeholder="0"
          keyboardType="decimal-pad"
          prefix="₹"
          autoFocus={!params.entryId}
          style={styles.amount}
          error={errors.amount}
        />
      )}

      {kind === 'sale' && simple ? (
        <Button title={t('Add items or GST')} variant="ghost" size="sm" full={false} onPress={() => setSimple(false)}
          icon={<Ionicons name="add-circle-outline" size={16} color={colors.accent700} />} />
      ) : null}

      {goods && !simple ? (
        <>
          <Button title={t('Scan')} variant="secondary" style={styles.scan} onPress={() => setScanning(true)}
            icon={<Ionicons name="barcode-outline" size={22} color={colors.ink900} />} />
          <ItemList
            items={items}
            error={errors.items}
            onAdd={() => setItemIndex(-1)}
            onEdit={(i) => setItemIndex(i)}
            onRemove={(i) => setItems((list) => list.filter((_, n) => n !== i))}
          />
          {itemized ? (
            <Field label={t('Discount (optional)')} value={discount} onChangeText={(v) => { setDiscount(v); setErrors((e) => ({ ...e, discount: undefined })); }}
              placeholder="0" keyboardType="decimal-pad" prefix="₹" error={errors.discount} />
          ) : null}
          {/* GST only for a GST-registered shop (a GSTIN in Store settings): an unregistered shop
              may not charge it. An older entry that already has a rate keeps showing it. */}
          {shop.gstin || gstRate ? (
            <>
              <GroupLabel>{t('GST in the price (optional)')}</GroupLabel>
              <FilterChips options={GST_CHIPS} value={gstRate} onChange={(r) => setGstRate(r === gstRate ? null : r)} style={styles.chips} />
            </>
          ) : null}
        </>
      ) : null}

      {hasMode && !(simple && kind === 'sale') ? (
        <>
          <GroupLabel>{kind === 'sale' || kind === 'collection' ? t('Paid by customer') : t('Paid by')}</GroupLabel>
          <FilterChips options={chips(MODE_LABELS, modes)} value={mode} onChange={setMode} style={styles.chips} />
          {goods && mode === 'credit' ? <Caption style={styles.creditHint}>{t(CREDIT_HINTS[kind])}</Caption> : null}
        </>
      ) : null}

      {splitPay ? (
        <>
          <Field label={t('Paid now (optional)')} value={paidNow} onChangeText={(v) => { setPaidNow(v); setErrors((e) => ({ ...e, paidNow: undefined })); }}
            placeholder="0" keyboardType="decimal-pad" prefix="₹" error={errors.paidNow} />
          {paidNow.trim() ? (
            <FilterChips options={chips(MODE_LABELS, ['cash', 'upi'])} value={paidMode} onChange={setPaidMode} style={styles.chips} />
          ) : null}
        </>
      ) : null}

      {kind === 'expense' && !simple ? (
        <>
          <GroupLabel error={Boolean(errors.category)}>{errors.category ?? t('What for')}</GroupLabel>
          <FilterChips options={chips(CATEGORY_LABELS, Object.keys(CATEGORY_LABELS))} value={category} onChange={setCategory} style={styles.chips} />
          {category === 'other' ? (
            <>
              <Field label={t('Expense name (optional)')} value={label} onChangeText={setLabel} placeholder={t('Like Tea, Petrol, Repairs')} maxLength={30} error={errors.label} />
              {labels.length ? (
                <FilterChips options={labels.map((l) => ({ value: l, label: l }))} value={label} onChange={setLabel} style={styles.chips} />
              ) : null}
            </>
          ) : null}
        </>
      ) : null}

      {showParty && !simple ? (
        <SelectField
          label={pickType === 'supplier' ? (needsParty ? t('Supplier') : t('Supplier (optional)')) : needsParty ? t('Customer') : t('Customer (optional)')}
          value={party?.name}
          placeholder={pickType === 'supplier' ? t('Choose supplier') : t('Choose customer')}
          onPress={() => setPicking(true)}
          error={errors.partyId}
        />
      ) : null}

      <Field label={t('Note (optional)')} value={note} onChangeText={setNote} maxLength={200} />

      {/* Entries can be written up later (yesterday's bills, last week's payment), never ahead:
          a future-dated entry would change cash in hand on a day that has not happened. */}
      <SelectField
        label={t('Date')}
        value={date === today ? `${t('Today')} · ${longDate(date)}` : longDate(date)}
        onPress={() => setPickingDate(true)}
      />

      {goods && kind !== 'sale' && !simple ? (
        <Field label={kind === 'purchase' ? t('Supplier’s bill number (optional)') : t('Reference number (optional)')} value={supplierBillNo}
          onChangeText={setSupplierBillNo} maxLength={20} autoCapitalize="characters" />
      ) : null}

      {!simple && (kind === 'expense' || goods) ? (
        <View style={styles.receipt}>
          <GroupLabel>{t('Receipt photo (kept on this phone)')}</GroupLabel>
          {receipt ? (
            <Row gap={space.md}>
              <Image source={{ uri: receipt.uri }} style={styles.thumb} accessibilityLabel={t('Receipt photo (kept on this phone)')} />
              <View style={{ flex: 1 }}>
                <Button title={t('Change photo')} variant="ghost" size="sm" full={false} onPress={choosePhoto} />
              </View>
            </Row>
          ) : (
            <Button title={t('Add receipt photo')} variant="secondary" size="sm" onPress={choosePhoto}
              icon={<Ionicons name="camera-outline" size={16} color={colors.ink900} />} />
          )}
        </View>
      ) : null}

      {kind === 'expense' && !existing && !simple ? (
        <Toggle label={t('Repeat every month')} hint={t('Adds this expense on day {day} of every month, on this phone.', { day: Number(date.slice(8)) })}
          value={repeat} onChange={setRepeat} />
      ) : null}

      {existing?.billNo ? <Caption>{t('Bill no {no}', { no: existing.billNo })}</Caption> : null}

      {GOODS.includes(existing?.kind) ? (
        <Row gap={space.sm} style={{ marginTop: space.lg }}>
          <Button title={t('Share bill')} variant="secondary" full={false} style={{ flex: 1 }} loading={printing.busy === 'share'}
            icon={<Ionicons name="share-social-outline" size={18} color={colors.ink900} />} onPress={() => printing.shareBill(existing, party?.name)} />
          <Button title={t('Print receipt')} variant="secondary" full={false} style={{ flex: 1 }} loading={printing.busy === 'print'}
            icon={<Ionicons name="print-outline" size={18} color={colors.ink900} />} onPress={() => printing.printReceipt(existing, party?.name)} />
        </Row>
      ) : null}

      {existing ? (
        <Touchable onPress={remove} disabled={saving || deleting} style={styles.delete}>
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
          <Body style={{ color: colors.danger }}>{t('Delete this entry')}</Body>
        </Touchable>
      ) : null}

      <ItemSheet
        visible={itemIndex !== null}
        item={itemIndex >= 0 ? items[itemIndex] : null}
        onClose={() => setItemIndex(null)}
        onSave={saveItem}
        onQuickAdd={quickAdd}
        onScan={() => { setItemIndex(null); setScanning(true); }}
      />
      <Scanner
        visible={scanning}
        items={items}
        onItems={changeItems}
        onClose={() => setScanning(false)}
        onTypeItem={() => { setScanning(false); setItemIndex(-1); }}
        onNewProduct={(sku) => { setScanning(false); router.push({ pathname: '/products/new', params: { sku } }); }}
      />
      <Sheet visible={pickingDate && Platform.OS === 'ios'} onClose={() => setPickingDate(false)} title={t('Date')}>
        <DateTimePicker value={toDate(date)} mode="date" display="inline" themeVariant="light" maximumDate={new Date()}
          accentColor={colors.accent600} onChange={(event, picked) => { if (picked) setDate(dayKey(picked)); setPickingDate(false); }} />
      </Sheet>
      {pickingDate && Platform.OS === 'android' ? (
        <DateTimePicker value={toDate(date)} mode="date" display="default" maximumDate={new Date()}
          onChange={(event, picked) => { setPickingDate(false); if (event.type === 'set' && picked) setDate(dayKey(picked)); }} />
      ) : null}
      <PartyPicker type={pickType} visible={picking} onClose={() => setPicking(false)} onPick={(p) => { setParty(p); setErrors((e) => ({ ...e, partyId: undefined })); }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  kinds: { marginBottom: space.md },
  amount: { ...type.figure, fontSize: 28, lineHeight: 36 },
  totalBox: { marginBottom: space.md, gap: 2 },
  totalFigure: { ...type.figure, fontSize: 28 },
  chips: { marginBottom: space.md },
  creditHint: { color: colors.warning, marginTop: -space.sm, marginBottom: space.md },
  receipt: { marginBottom: space.md },
  thumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: colors.line },
  scan: { marginBottom: space.md },
  delete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingVertical: space.xl },
});
