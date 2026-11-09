import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../src/components/Screen.jsx';
import { Body, Button, Caption, Card, Divider, Heading, Pill, Row, Touchable } from '../../src/components/ui.jsx';
import { CATEGORY_LABELS, MODE_LABELS, MoneyLine, SectionTitle, SyncBadge } from '../../src/components/book.jsx';
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

  const label = date === today ? t('Today') : date === shiftDay(today, -1) ? t('Yesterday')
    : formatDate(`${date}T00:00:00`, undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  const open = (path) => router.push({ pathname: path.pathname, params: { date, ...path.params } });
  const bills = day?.entries.filter((e) => e.kind === 'sale') ?? [];
  const expenses = day?.entries.filter((e) => e.kind === 'expense') ?? [];
  const payments = day?.entries.filter((e) => e.kind === 'collection' || e.kind === 'opening') ?? [];
  const fresh = day && !day.entries.length && day.openingBalance === 0;

  return (
    <Screen
      footer={(
        <Row gap={space.sm}>
          <Button title={t('Expense')} variant="secondary" full={false} style={{ flex: 1 }}
            icon={<Ionicons name="remove" size={18} color={colors.ink900} />}
            onPress={() => open({ pathname: '/book/entry', params: { kind: 'expense' } })} />
          <Button title={t('Bill')} full={false} style={{ flex: 1.4 }}
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

      <SectionTitle title={t('Bills ({n})', { n: bills.length })} total={day?.sales.total} />
      {bills.length ? (
        <Card padded={false}>
          {bills.map((e, i) => (
            <EntryRow key={e.entryId} index={i + 1} entry={e} onPress={() => open({ pathname: '/book/entry', params: { entryId: e.entryId } })}
              title={e.partyName ?? e.note ?? t('Bill #{n}', { n: i + 1 })}
              detail={e.partyName && e.note ? e.note : null}
              pill={t(MODE_LABELS[e.mode])} tone={e.mode === 'credit' ? 'amber' : 'slate'} first={i === 0} />
          ))}
        </Card>
      ) : <Caption>{t('No bills yet on this day.')}</Caption>}

      {payments.length ? (
        <>
          <SectionTitle title={t('Money received')} total={day?.collections + (day?.opening ?? 0)} />
          <Card padded={false}>
            {payments.map((e, i) => (
              <EntryRow key={e.entryId} entry={e} first={i === 0}
                onPress={() => open({ pathname: '/book/entry', params: { entryId: e.entryId } })}
                title={e.kind === 'opening' ? t('Starting cash') : e.partyName ?? t('Payment received')}
                detail={e.note} pill={e.mode ? t(MODE_LABELS[e.mode]) : null} tone="green" />
            ))}
          </Card>
        </>
      ) : null}

      <SectionTitle title={t('Expenses ({n})', { n: expenses.length })} total={day?.expenses} />
      {expenses.length ? (
        <Card padded={false}>
          {expenses.map((e, i) => (
            <EntryRow key={e.entryId} entry={e} first={i === 0} negative
              onPress={() => open({ pathname: '/book/entry', params: { entryId: e.entryId } })}
              title={t(CATEGORY_LABELS[e.category])} detail={e.note} pill={t(MODE_LABELS[e.mode])} tone="slate" />
          ))}
        </Card>
      ) : <Caption>{t('No expenses on this day.')}</Caption>}
    </Screen>
  );
}

const EntryRow = ({ entry, index, title, detail, pill, tone, negative, first, onPress }) => (
  <>
    {first ? null : <Divider />}
    <Touchable onPress={onPress} style={styles.entryRow} accessibilityLabel={`${title} ${formatMoney(entry.amount)}`}>
      {index ? <Caption style={styles.index}>#{index}</Caption> : null}
      <View style={{ flex: 1 }}>
        <Body numberOfLines={1}>{title}</Body>
        {detail ? <Caption numberOfLines={1}>{detail}</Caption> : null}
      </View>
      {pill ? <Pill label={pill} tone={tone} /> : null}
      <Body style={[type.money, negative && { color: colors.danger }]}>{negative ? '− ' : ''}{formatMoney(entry.amount)}</Body>
    </Touchable>
  </>
);

const styles = StyleSheet.create({
  dateRow: { justifyContent: 'space-between' },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dateLabel: { flex: 1, textAlign: 'center' },
  startCard: { marginTop: space.md, borderColor: colors.accent200, backgroundColor: colors.accent50 },
  summary: { marginTop: space.md },
  divider: { marginVertical: space.xs },
  creditNote: { marginTop: space.sm, color: colors.warning },
  khataLink: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.lg },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 52 },
  index: { width: 28, color: colors.ink400 },
});
