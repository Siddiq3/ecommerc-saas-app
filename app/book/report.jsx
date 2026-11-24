import { useState } from 'react';
import { Alert as RNAlert, Platform, StyleSheet, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { cacheDirectory, writeAsStringAsync } from 'expo-file-system/legacy';
import { Screen } from '../../src/components/Screen.jsx';
import { Body, Button, Caption, Card, Divider, Heading, Loading, Row, SelectField, Touchable } from '../../src/components/ui.jsx';
import { Sheet } from '../../src/components/Sheet.jsx';
import { FilterChips } from '../../src/components/Filters.jsx';
import { CATEGORY_LABELS, MoneyLine, SectionTitle } from '../../src/components/book.jsx';
import { dayKey, daysInMonth, monthOf, shiftDay, shiftMonth } from '../../src/lib/book.js';
import { cashBookCsv, cashBookHtml } from '../../src/lib/bookPrint.js';
import { readRange, readRepeats } from '../../src/lib/bookQueries.js';
import { msg } from '../../src/lib/i18n.js';
import { formatDate, formatMoney } from '../../src/lib/format.js';
import { useAuth } from '../../src/state/auth.jsx';
import { useBook, useBookQuery } from '../../src/state/book.jsx';
import { useToast } from '../../src/components/Toast.jsx';
import { useT } from '../../src/state/locale.jsx';
import { colors, space } from '../../src/theme.js';

const PERIODS = [{ value: 'week', label: msg('Week') }, { value: 'month', label: msg('Month') }, { value: 'custom', label: msg('Custom') }];
const toDate = (day) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d); };

/** Monday of the week `day` falls in. */
const weekStart = (day) => {
  const [y, m, d] = day.split('-').map(Number);
  return shiftDay(day, -((new Date(y, m - 1, d).getDay() + 6) % 7));
};
const rangeOf = (period, anchor) => (period === 'week'
  ? { from: weekStart(anchor), to: shiftDay(weekStart(anchor), 6) }
  : { from: `${monthOf(anchor)}-01`, to: `${monthOf(anchor)}-${String(daysInMonth(monthOf(anchor))).padStart(2, '0')}` });

/**
 * Reports: a week or a month of the book in one place, what came in and went out, sales less
 * expenses, and the cash book as a PDF or a spreadsheet (CSV) for the accountant.
 */
export default function BookReport() {
  const t = useT();
  const toast = useToast();
  const { business } = useAuth();
  const { stopRepeat } = useBook();
  const today = dayKey();
  const [period, setPeriod] = useState('month');
  const [anchor, setAnchor] = useState(today);
  const [busy, setBusy] = useState(null);
  // Any stretch of days, for the accountant's quarter or a festival season: from the 1st of this
  // month to today until changed. Never past today; "to" is never before "from".
  const [custom, setCustom] = useState({ from: `${monthOf(today)}-01`, to: today });
  const [picking, setPicking] = useState(null); // 'from' | 'to'
  const { from, to } = period === 'custom' ? custom : rangeOf(period, anchor);
  const pickDay = (which, day) => setCustom((c) => (which === 'from'
    ? { from: day, to: c.to < day ? day : c.to }
    : { from: c.from > day ? day : c.from, to: day }));
  const range = useBookQuery((db) => readRange(db, from, to), [from, to]);
  const repeats = useBookQuery((db) => readRepeats(db)) ?? [];

  const move = (by) => setAnchor(period === 'week' ? shiftDay(anchor, 7 * by) : `${shiftMonth(monthOf(anchor), by)}-01`);
  const short = (d) => formatDate(`${d}T00:00:00`, undefined, { day: 'numeric', month: 'short' });
  const longDay = (d) => formatDate(`${d}T00:00:00`, undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const label = period === 'month'
    ? formatDate(`${from}T00:00:00`, undefined, { month: 'long', year: 'numeric' })
    : `${short(from)} – ${short(to)}`;
  const name = `cash-book-${from}-to-${to}`;

  const exportFile = async (kind) => {
    if (!range) return;
    setBusy(kind);
    try {
      if (kind === 'pdf') {
        const { uri } = await Print.printToFileAsync({ html: cashBookHtml({ store: business?.name ?? '', range }) });
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: name, UTI: 'com.adobe.pdf' });
      } else {
        const uri = `${cacheDirectory}${name}.csv`;
        // A byte-order mark so Excel reads ₹ and Indian names correctly.
        await writeAsStringAsync(uri, `﻿${cashBookCsv(range)}`);
        await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: name, UTI: 'public.comma-separated-values-text' });
      }
    } catch {
      toast.error(t('Something went wrong. Try again.'));
    } finally {
      setBusy(null);
    }
  };

  const stop = (r) => RNAlert.alert(t('Stop repeating this expense?'), t('Entries already added stay in the book.'), [
    { text: t('Keep'), style: 'cancel' },
    { text: t('Stop'), style: 'destructive', onPress: () => stopRepeat(r.templateId) },
  ]);

  const totals = range?.totals;
  return (
    <Screen
      footer={(
        <Row gap={space.sm}>
          <Button title={t('PDF')} variant="secondary" full={false} style={{ flex: 1 }} loading={busy === 'pdf'} disabled={!range}
            icon={<Ionicons name="document-text-outline" size={18} color={colors.ink900} />} onPress={() => exportFile('pdf')} />
          <Button title={t('Excel')} accessibilityLabel={t('Excel (CSV)')} variant="secondary" full={false} style={{ flex: 1 }} loading={busy === 'csv'} disabled={!range}
            icon={<Ionicons name="grid-outline" size={18} color={colors.ink900} />} onPress={() => exportFile('csv')} />
        </Row>
      )}
    >
      <FilterChips options={PERIODS.map((o) => ({ ...o, label: t(o.label) }))} value={period} onChange={(p) => { setPeriod(p); setAnchor(today); }} />
      {period === 'custom' ? (
        <Row gap={space.sm} align="flex-start" style={styles.customRow}>
          <View style={{ flex: 1 }}>
            <SelectField label={t('From')} value={longDay(custom.from)} onPress={() => setPicking('from')} />
          </View>
          <View style={{ flex: 1 }}>
            <SelectField label={t('To')} value={longDay(custom.to)} onPress={() => setPicking('to')} />
          </View>
        </Row>
      ) : (
        <Row style={styles.dateRow}>
          <Touchable onPress={() => move(-1)} accessibilityLabel={t('Previous')} style={styles.arrow}>
            <Ionicons name="chevron-back" size={22} color={colors.ink700} />
          </Touchable>
          <Heading style={styles.dateLabel}>{label}</Heading>
          <Touchable onPress={() => to < today && move(1)} disabled={to >= today} accessibilityLabel={t('Next')} style={[styles.arrow, to >= today && { opacity: 0.3 }]}>
            <Ionicons name="chevron-forward" size={22} color={colors.ink700} />
          </Touchable>
        </Row>
      )}
      <Sheet visible={Boolean(picking) && Platform.OS === 'ios'} onClose={() => setPicking(null)} title={picking === 'to' ? t('To') : t('From')}>
        {picking ? (
          <DateTimePicker value={toDate(custom[picking])} mode="date" display="inline" themeVariant="light" maximumDate={new Date()}
            accentColor={colors.accent600} onChange={(event, d) => { if (d) pickDay(picking, dayKey(d)); setPicking(null); }} />
        ) : null}
      </Sheet>
      {picking && Platform.OS === 'android' ? (
        <DateTimePicker value={toDate(custom[picking])} mode="date" display="default" maximumDate={new Date()}
          onChange={(event, d) => { const which = picking; setPicking(null); if (event.type === 'set' && d) pickDay(which, dayKey(d)); }} />
      ) : null}

      {range ? null : <Loading />}
      {range ? (
      <>
      <Card style={styles.card}>
        <MoneyLine label={t('Sales')} amount={totals?.sales.total ?? 0}
          hint={t('Cash {cash} · UPI {upi}', { cash: formatMoney(totals?.sales.cash ?? 0), upi: formatMoney(totals?.sales.upi ?? 0) })} />
        <MoneyLine label={t('Sold on credit')} amount={totals?.sales.credit ?? 0} />
        <MoneyLine label={t('Dues collected')} amount={totals?.collections ?? 0} />
        <MoneyLine label={t('Expenses')} sign="− " amount={totals?.expenses ?? 0} />
        {totals?.purchases.total ? <MoneyLine label={t('Purchases')} amount={totals.purchases.total}
          hint={t('Paid now {paid} · on credit {credit}', { paid: formatMoney(totals.purchases.paid), credit: formatMoney(totals.purchases.total - totals.purchases.paid) })} /> : null}
        {totals?.salesReturns.total ? <MoneyLine label={t('Sales returns')} sign="− " amount={totals.salesReturns.total} /> : null}
        <Divider style={styles.divider} />
        <MoneyLine label={t('Sales minus expenses')} amount={(totals?.sales.total ?? 0) - (totals?.expenses ?? 0)} strong
          hint={t('A simple profit: what you sold, less what you spent in this period.')} />
        {range?.purchases ? <MoneyLine label={t('Goods bought on credit')} amount={range.purchases} hint={t('Not counted above until you pay the supplier.')} /> : null}
      </Card>

      <Card style={styles.card}>
        <MoneyLine label={t('Opening balance')} amount={range?.opening ?? 0} />
        <MoneyLine label={t('Closing balance')} amount={range?.closing ?? 0} strong />
      </Card>
      </>
      ) : null}

      {range?.gst.rates.length ? (
        <>
          <SectionTitle title={t('GST')} />
          <Card>
            <MoneyLine label={t('GST collected on sales')} amount={range.gst.output.tax}
              hint={t('On sales worth {amount} before tax', { amount: formatMoney(range.gst.output.taxable) })} />
            <MoneyLine label={t('GST paid on purchases')} sign="− " amount={range.gst.input.tax}
              hint={t('On purchases worth {amount} before tax', { amount: formatMoney(range.gst.input.taxable) })} />
            <Divider style={styles.divider} />
            <MoneyLine label={range.gst.payable < 0 ? t('GST credit to carry forward') : t('GST to pay')} amount={Math.abs(range.gst.payable)} strong
              hint={t('Half CGST, half SGST. A summary from your book: check with your accountant before filing.')} />
            {range.gst.rates.map((r) => (
              <Caption key={r.rate} style={styles.gstRate}>
                {t('{rate}%: collected {out} · paid {in}', { rate: r.rate, out: formatMoney(r.output.tax), in: formatMoney(r.input.tax) })}
              </Caption>
            ))}
          </Card>
        </>
      ) : null}

      {range?.expensesBy.length ? (
        <>
          <SectionTitle title={t('Expenses by head')} total={totals?.expenses} />
          <Card padded={false}>
            {range.expensesBy.map((e, i) => (
              <View key={`${e.category}-${e.label}`}>
                {i ? <Divider /> : null}
                <View style={styles.row}>
                  <Body style={{ flex: 1 }}>{e.label ?? (CATEGORY_LABELS[e.category] ? t(CATEGORY_LABELS[e.category]) : t('Other'))}</Body>
                  <Body>{formatMoney(e.total)}</Body>
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {repeats.length ? (
        <>
          <SectionTitle title={t('Monthly expenses')} />
          <Card padded={false}>
            {repeats.map((r, i) => (
              <View key={r.templateId}>
                {i ? <Divider /> : null}
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Body>{r.entry.label ?? t(CATEGORY_LABELS[r.entry.category] ?? 'Other')} · {formatMoney(r.entry.amount)}</Body>
                    <Caption>{t('Every month on day {day}', { day: r.day })}</Caption>
                  </View>
                  <Button title={t('Stop')} variant="ghost" size="sm" full={false} onPress={() => stop(r)} />
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  dateRow: { justifyContent: 'space-between', marginTop: space.sm },
  customRow: { marginTop: space.md },
  gstRate: { color: colors.ink600, marginTop: 4 },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dateLabel: { flex: 1, textAlign: 'center' },
  card: { marginTop: space.md },
  divider: { marginVertical: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 52 },
});
