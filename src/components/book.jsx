import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { bookPartySchema } from '@storekit/validation';
import { Alert, Body, Button, Caption, Card, Field, Row, Touchable } from './ui.jsx';
import { Sheet } from './Sheet.jsx';
import { SearchBar } from './Filters.jsx';
import { msg } from '../lib/i18n.js';
import { formatMoney } from '../lib/format.js';
import { readDay, readParties } from '../lib/bookQueries.js';
import { dayKey } from '../lib/book.js';
import { newBookId, useBook, useBookQuery } from '../state/book.jsx';
import { useT } from '../state/locale.jsx';
import { useAction } from '../lib/useAsync.js';
import { colors, space, type } from '../theme.js';

export const KIND_LABELS = {
  sale: msg('Bill'),
  expense: msg('Expense'),
  collection: msg('Payment received'),
  opening: msg('Starting cash'),
  due: msg('Old dues'),
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

/** One line of a money summary: a label, and an amount signed the way the book reads it. */
export const MoneyLine = ({ label, amount, sign = '', strong, hint }) => (
  <View style={styles.line}>
    <View style={{ flex: 1 }}>
      <Body strong={strong}>{label}</Body>
      {hint ? <Caption>{hint}</Caption> : null}
    </View>
    <Body strong={strong} style={[type.money, strong && styles.strongMoney]}>{sign}{formatMoney(amount)}</Body>
  </View>
);

/**
 * Picks a khata customer, or adds one on the spot: a credit sale usually happens with the
 * customer standing at the counter, not after a trip to another screen.
 */
export const PartyPicker = ({ visible, onClose, onPick, addOnly = false }) => {
  const t = useT();
  const { db, saveParty } = useBook();
  const parties = useBookQuery((db) => readParties(db)) ?? [];
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [errors, setErrors] = useState({});
  useEffect(() => { if (visible) setAdding(addOnly); }, [visible, addOnly]);

  const needle = search.trim().toLowerCase();
  const shown = needle
    ? parties.filter((p) => p.name.toLowerCase().includes(needle) || (p.mobile ?? '').includes(needle))
    : parties;

  const close = () => { setAdding(false); setSearch(''); setErrors({}); onClose(); };

  const { run: add, pending: addingParty, error: addError } = useAction(async () => {
    const party = { partyId: newBookId(), name, ...(mobile.trim() ? { mobile } : {}), updatedAt: new Date().toISOString() };
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

  return (
    <Sheet visible={visible} onClose={() => { if (!addingParty) close(); }} title={adding ? t('New customer') : t('Choose customer')}>
      <Alert message={addError ? t('Something went wrong. Try again.') : null} />
      {adding ? (
        <>
          <Field label={t('Name')} value={name} onChangeText={setName} placeholder={t('Customer name')} autoFocus error={errors.name} maxLength={80} />
          <Field
            label={t('Mobile number (optional)')}
            value={mobile}
            onChangeText={setMobile}
            placeholder={t('For call and WhatsApp reminders')}
            keyboardType="phone-pad"
            prefix="+91"
            maxLength={14}
            error={errors.mobile}
          />
          <Button title={t('Add customer')} loading={addingParty} disabled={!db} onPress={() => add().catch(() => undefined)} />
          {addOnly ? null : <Button title={t('Back')} variant="ghost" disabled={addingParty} onPress={() => setAdding(false)} />}
        </>
      ) : (
        <>
          <Touchable onPress={() => setAdding(true)} style={styles.addRow}>
            <Ionicons name="person-add-outline" size={20} color={colors.accent700} />
            <Body strong style={{ color: colors.accent700 }}>{t('Add new customer')}</Body>
          </Touchable>
          {parties.length > 6 ? <SearchBar value={search} onChange={setSearch} placeholder={msg('Search customers')} /> : null}
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

export const DueAmount = ({ balance, style }) => {
  const t = useT();
  if (balance > 0) return <Body strong style={[type.money, { color: colors.danger }, style]}>{formatMoney(balance)}</Body>;
  if (balance < 0) return <Caption style={[{ color: colors.success }, style]}>{t('Advance {amount}', { amount: formatMoney(-balance) })}</Caption>;
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
  line: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 6 },
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
      <Row gap={space.sm} style={{ marginTop: space.md }}>
        <Button title={t('Khata')} variant="secondary" size="sm" full={false} style={{ flex: 1 }} onPress={onKhata}
          icon={<Ionicons name="people-outline" size={16} color={colors.ink900} />} />
        {onStaff ? (
          <Button title={t('Staff')} variant="secondary" size="sm" full={false} style={{ flex: 1 }} onPress={onStaff}
            icon={<Ionicons name="calendar-outline" size={16} color={colors.ink900} />} />
        ) : null}
        <Button title={t('Add bill')} size="sm" full={false} style={{ flex: 1 }} onPress={onBill}
          icon={<Ionicons name="add" size={18} color="#ffffff" />} />
      </Row>
    </Card>
  );
};

const readDayLite = async (db) => {
  const day = await readDay(db, dayKey());
  return { sales: day.sales.total, closing: day.closingBalance };
};

const cardStyles = StyleSheet.create({
  card: { marginBottom: space.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent50, alignItems: 'center', justifyContent: 'center' },
});
