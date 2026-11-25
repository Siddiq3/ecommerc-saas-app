import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../src/components/Screen.jsx';
import { Body, Button, Caption, Card, Divider, Heading, Pill, Row, Touchable } from '../../src/components/ui.jsx';
import { CATEGORY_LABELS, KIND_LABELS, MODE_LABELS, MoneyLine, SectionTitle, SyncBadge } from '../../src/components/book.jsx';
import { itemsSummary } from '../../src/components/BillItems.jsx';
import { dayKey, shiftDay } from '../../src/lib/book.js';
import { readDay } from '../../src/lib/bookQueries.js';
import { formatDate, formatMoney } from '../../src/lib/format.js';
import { useBookQuery } from '../../src/state/book.jsx';
import { useT } from '../../src/state/locale.jsx';
import { colors, space, type } from '../../src/theme.js';

/**
 * The day book: one page per day, like the paper one. Yesterday's closing opens the day,
 * bills and payments add to it, expenses come off, and the closing carries to tomorrow.
 */
export default function DayBook() {
  const t = useT();
  const router = useRouter();
  const params = useLocalSearchParams();
  const today = dayKey();
  const [date, setDate] = useState(String(params.date ?? today));
  const day = useBookQuery((db) => readDay(db, date), [date]);
  const navigation = useNavigation();
  // Search the whole book from the day book's bar.
  useEffect(() => {
    navigation.setOptions?.({
      headerRight: () => (
        <Touchable onPress={() => router.push('/book/search')} style={styles.headerIcon} accessibilityRole="button" accessibilityLabel={t('Search bills and entries')}>
          <Ionicons name="search" size={22} color={colors.ink900} />
        </Touchable>
      ),
    });
  }, [navigation, router, t]);

  const label = date === today ? t('Today') : date === shiftDay(today, -1) ? t('Yesterday')
    : formatDate(`${date}T00:00:00`, undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  const open = (path) => router.push({ pathname: path.pathname, params: { date, ...path.params } });
  const bills = day?.entries.filter((e) => e.kind === 'sale') ?? [];
  const expenses = day?.entries.filter((e) => e.kind === 'expense') ?? [];
  const payments = day?.entries.filter((e) => e.kind === 'collection' || e.kind === 'opening') ?? [];
  const purchases = day?.entries.filter((e) => e.kind === 'purchase') ?? [];
  const returns = day?.entries.filter((e) => e.kind === 'salesReturn' || e.kind === 'purchaseReturn') ?? [];
  const fresh = day && !day.entries.length && day.openingBalance === 0;

  return (
    <Screen
      footer={(
        <Row gap={space.sm}>
          <Button title={t('Expense')} variant="secondary" full={false} style={{ flex: 1 }}
            icon={<Ionicons name="remove" size={18} color={colors.ink900} />}
            onPress={() => open({ pathname: '/book/entry', params: { kind: 'expense' } })} />
          <Button title={t('Bill')} full={false} style={{ flex: 1 }}
            icon={<Ionicons name="add" size={20} color="#ffffff" />}
            onPress={() => open({ pathname: '/book/entry', params: { kind: 'sale' } })} />
        </Row>
      )}
    >
      <Row style={styles.dateRow}>
        <Touchable onPress={() => setDate(shiftDay(date, -1))} accessibilityLabel={t('Previous day')} style={styles.arrow}>
          <Ionicons name="chevron-back" size={22} color={colors.ink700} />
        </Touchable>
        <Heading style={styles.dateLabel}>{label}</Heading>
        <Touchable
          onPress={() => date < today && setDate(shiftDay(date, 1))}
          disabled={date >= today}
          accessibilityLabel={t('Next day')}
          style={[styles.arrow, date >= today && { opacity: 0.3 }]}
        >
          <Ionicons name="chevron-forward" size={22} color={colors.ink700} />
        </Touchable>
      </Row>
      <SyncBadge />

      {fresh && date === today ? (
        <Card style={styles.startCard}>
          <Body strong>{t('Starting your book?')}</Body>
          <Caption>{t('Enter the cash you have in hand now. Every day after this carries forward on its own.')}</Caption>
          <Button title={t('Enter starting cash')} variant="secondary" size="sm" style={{ marginTop: space.md }}
            onPress={() => open({ pathname: '/book/entry', params: { kind: 'opening' } })} />
        </Card>
      ) : null}

      <Card style={styles.summary}>
        <MoneyLine label={t('Opening balance')} amount={day?.openingBalance ?? 0} hint={t('Carried from the day before')} />
        <Divider style={styles.divider} />
        <MoneyLine
          label={t('Sales received')}
          sign="+ "
          amount={(day?.sales.cash ?? 0) + (day?.sales.upi ?? 0)}
          hint={t('Cash {cash} · UPI {upi}', { cash: formatMoney(day?.sales.cash ?? 0), upi: formatMoney(day?.sales.upi ?? 0) })}
        />
        {day?.collections ? <MoneyLine label={t('Dues collected')} sign="+ " amount={day.collections} /> : null}
        {day?.opening ? <MoneyLine label={t('Starting cash')} sign="+ " amount={day.opening} /> : null}
        <MoneyLine label={t('Expenses')} sign="− " amount={day?.expenses ?? 0} />
        {day?.purchases.paid ? <MoneyLine label={t('Purchases paid')} sign="− " amount={day.purchases.paid} /> : null}
        {day?.salesReturns.paid ? <MoneyLine label={t('Refunds to customers')} sign="− " amount={day.salesReturns.paid} /> : null}
        {day?.purchaseReturns.paid ? <MoneyLine label={t('Refunds from suppliers')} sign="+ " amount={day.purchaseReturns.paid} /> : null}
        <Divider style={styles.divider} />
        <MoneyLine label={t('Closing balance')} amount={day?.closingBalance ?? 0} strong hint={t('Carries to the next day')} />
        {day?.sales.credit ? (
          <Caption style={styles.creditNote}>
            {t('{amount} sold on credit today is in the khata, not in hand.', { amount: formatMoney(day.sales.credit) })}
          </Caption>
        ) : null}
      </Card>

      <Touchable onPress={() => router.push('/khata')} style={styles.khataLink}>
        <Ionicons name="people-outline" size={18} color={colors.accent700} />
        <Body strong style={{ color: colors.accent700, flex: 1 }}>{t('Khata: who owes you')}</Body>
        <Ionicons name="chevron-forward" size={18} color={colors.accent700} />
      </Touchable>
      <Touchable onPress={() => router.push('/staff')} style={[styles.khataLink, { paddingTop: 0 }]}>
        <Ionicons name="calendar-outline" size={18} color={colors.accent700} />
        <Body strong style={{ color: colors.accent700, flex: 1 }}>{t('Staff attendance')}</Body>
        <Ionicons name="chevron-forward" size={18} color={colors.accent700} />
      </Touchable>
      <Touchable onPress={() => router.push('/book/report')} style={[styles.khataLink, { paddingTop: 0 }]}>
        <Ionicons name="bar-chart-outline" size={18} color={colors.accent700} />
        <Body strong style={{ color: colors.accent700, flex: 1 }}>{t('Reports and export')}</Body>
        <Ionicons name="chevron-forward" size={18} color={colors.accent700} />
      </Touchable>

      <SectionTitle title={t('Bills ({n})', { n: bills.length })} total={day?.sales.total} />
      {bills.length ? (
        <Card padded={false}>
          {bills.map((e, i) => {
            const bought = itemsSummary(t, e.items);
            return (
              <EntryRow key={e.entryId} index={i + 1} entry={e} onPress={() => open({ pathname: '/book/detail', params: { entryId: e.entryId } })}
                title={e.partyName ?? bought ?? e.note ?? t('Bill #{n}', { n: i + 1 })}
                detail={e.partyName ? (bought ?? e.note) : bought ? e.note : null}
                pill={t(MODE_LABELS[e.mode])} tone={e.mode === 'credit' ? 'amber' : 'slate'} first={i === 0} />
            );
          })}
        </Card>
      ) : <Caption>{t('No bills yet on this day.')}</Caption>}

      {payments.length ? (
        <>
          <SectionTitle title={t('Money received')} total={day?.collections + (day?.opening ?? 0)} />
          <Card padded={false}>
            {payments.map((e, i) => (
              <EntryRow key={e.entryId} entry={e} first={i === 0}
                onPress={() => open({ pathname: '/book/detail', params: { entryId: e.entryId } })}
                title={e.kind === 'opening' ? t('Starting cash') : e.partyName ?? t('Payment received')}
                detail={e.note} pill={e.mode ? t(MODE_LABELS[e.mode]) : null} tone="green" />
            ))}
          </Card>
        </>
      ) : null}

      {purchases.length ? (
        <>
          <SectionTitle title={t('Purchases ({n})', { n: purchases.length })} total={day?.purchases.total} />
          <Card padded={false}>
            {purchases.map((e, i) => (
              <EntryRow key={e.entryId} entry={e} first={i === 0} negative
                onPress={() => open({ pathname: '/book/detail', params: { entryId: e.entryId } })}
                title={e.partyName ?? itemsSummary(t, e.items) ?? t('Purchase')}
                detail={[e.partyName ? itemsSummary(t, e.items) : null, e.billNo].filter(Boolean).join(' · ') || e.note}
                pill={t(MODE_LABELS[e.mode])} tone={e.mode === 'credit' ? 'amber' : 'slate'} />
            ))}
          </Card>
        </>
      ) : null}

      {returns.length ? (
        <>
          <SectionTitle title={t('Returns ({n})', { n: returns.length })} />
          <Card padded={false}>
            {returns.map((e, i) => (
              <EntryRow key={e.entryId} entry={e} first={i === 0} negative={e.kind === 'salesReturn'}
                onPress={() => open({ pathname: '/book/detail', params: { entryId: e.entryId } })}
                title={e.partyName ?? t(KIND_LABELS[e.kind])}
                detail={[t(KIND_LABELS[e.kind]), itemsSummary(t, e.items)].filter(Boolean).join(' · ')}
                pill={t(MODE_LABELS[e.mode])} tone={e.mode === 'credit' ? 'amber' : 'slate'} />
            ))}
          </Card>
        </>
      ) : null}

      <SectionTitle title={t('Expenses ({n})', { n: expenses.length })} total={day?.expenses} />
      {expenses.length ? (
        <Card padded={false}>
          {expenses.map((e, i) => (
            <EntryRow key={e.entryId} entry={e} first={i === 0} negative
              onPress={() => open({ pathname: '/book/detail', params: { entryId: e.entryId } })}
              title={e.partyName ?? e.label ?? t(CATEGORY_LABELS[e.category])} detail={e.partyName ? [t(CATEGORY_LABELS[e.category]), e.note].filter(Boolean).join(' · ') : e.note} pill={t(MODE_LABELS[e.mode])} tone="slate" />
          ))}
        </Card>
      ) : <Caption>{t('No expenses on this day.')}</Caption>}
    </Screen>
  );
}

/**
 * One entry in a day's list. The amount and how it was paid stack on the right, so the name
 * keeps the width: side by side, a 320dp phone at large text cut every name to three letters.
 */
const EntryRow = ({ entry, index, title, detail, pill, tone, negative, first, onPress }) => (
  <>
    {first ? null : <Divider />}
    <Touchable
      onPress={onPress}
      style={styles.entryRow}
      accessibilityLabel={[title, detail, pill, `${negative ? '− ' : ''}${formatMoney(entry.amount)}`].filter(Boolean).join(', ')}
    >
      {index ? <Caption style={styles.index}>#{index}</Caption> : null}
      <View style={{ flex: 1 }}>
        <Body numberOfLines={2}>{title}</Body>
        {detail ? <Caption numberOfLines={2}>{detail}</Caption> : null}
      </View>
      <View style={styles.entryRight}>
        <Body style={[type.money, negative && { color: colors.danger }]} numberOfLines={1}>{negative ? '− ' : ''}{formatMoney(entry.amount)}</Body>
        {pill ? <Pill label={pill} tone={tone} /> : null}
      </View>
    </Touchable>
  </>
);

const styles = StyleSheet.create({
  dateRow: { justifyContent: 'space-between' },
  headerIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dateLabel: { flex: 1, textAlign: 'center' },
  startCard: { marginTop: space.md, borderColor: colors.accent200, backgroundColor: colors.accent50 },
  summary: { marginTop: space.md },
  divider: { marginVertical: space.xs },
  creditNote: { marginTop: space.sm, color: colors.warning },
  khataLink: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.lg },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 56 },
  entryRight: { alignItems: 'flex-end', gap: 4, maxWidth: '50%' },
  index: { width: 28, color: colors.ink400 },
});
