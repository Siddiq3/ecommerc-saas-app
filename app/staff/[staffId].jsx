import { useEffect, useState } from 'react';
import { Alert as RNAlert, Linking, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../src/components/Screen.jsx';
import { Body, Button, Caption, Card, Figure, Heading, Row, Touchable } from '../../src/components/ui.jsx';
import { STATUS, STATUSES, StaffSheet, StatusSheet, wageLabel } from '../../src/components/staff.jsx';
import { dayKey, daysInMonth, monthOf, shiftMonth } from '../../src/lib/book.js';
import { readStaffMonth } from '../../src/lib/bookQueries.js';
import { formatDate, formatMoney } from '../../src/lib/format.js';
import { useBook, useBookQuery } from '../../src/state/book.jsx';
import { useT } from '../../src/state/locale.jsx';
import { colors, radius, space } from '../../src/theme.js';

// A known Sunday-to-Saturday week, for the calendar's day initials in the app's language.
const WEEK = ['2023-12-31', '2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05', '2024-01-06'];

/**
 * One person's month: what they are owed so far, a calendar of their attendance (tap a day
 * to change it), and a one-tap way to record paying them in the bill book.
 */
export default function StaffMember() {
  const t = useT();
  const router = useRouter();
  const navigation = useNavigation();
  const { staffId } = useLocalSearchParams();
  const { saveStaff, markAttendance } = useBook();
  const today = dayKey();
  const [month, setMonth] = useState(monthOf(today));
  const [editing, setEditing] = useState(false);
  const [day, setDay] = useState(null);
  const data = useBookQuery((db) => readStaffMonth(db, String(staffId), month), [staffId, month]);

  useEffect(() => {
    if (data?.staff) navigation.setOptions?.({ title: data.staff.name });
  }, [data?.staff, navigation]);

  if (!data) return <Screen />;
  const { staff, marks, counts, worked, pay } = data;
  const monthName = formatDate(`${month}-01T00:00:00`, undefined, { month: 'long', year: 'numeric' });

  const [y, m] = month.split('-').map(Number);
  const lead = new Date(y, m - 1, 1).getDay();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth(month) }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];

  const paySalary = () => router.push({
    pathname: '/book/entry',
    params: {
      kind: 'expense',
      category: 'salary',
      amount: (pay / 100).toFixed(2).replace(/\.00$/, ''),
      note: t('Salary for {name}, {month}', { name: staff.name, month: monthName }).slice(0, 200),
    },
  });

  const remove = () => RNAlert.alert(t('Remove staff'), t('Remove {name} from your staff?', { name: staff.name }), [
    { text: t('Cancel'), style: 'cancel' },
    {
      text: t('Remove'),
      style: 'destructive',
      onPress: () => saveStaff({ ...staff, deleted: true, updatedAt: new Date().toISOString() }).then(() => router.back()).catch(() => undefined),
    },
  ]);

  return (
    <Screen footer={<Button title={t('Pay salary')} icon={<Ionicons name="cash-outline" size={18} color="#ffffff" />} disabled={pay <= 0} onPress={paySalary} />}>
      <Card style={styles.head}>
        <Caption>{t('Salary this month')}</Caption>
        <Figure style={styles.pay}>{formatMoney(pay)}</Figure>
        <Caption style={styles.rule}>
          {staff.wageType === 'daily'
            ? t('Paid only for days worked: a full day for present, half for a half day.')
            : t('Absent days and half days are cut from the salary. Leave and unmarked days are paid.')}
        </Caption>
        <Caption>{wageLabel(t, staff)}{staff.mobile ? ` · +91 ${staff.mobile}` : ''}</Caption>
        <Row gap={space.lg} style={styles.links}>
          <Touchable onPress={() => setEditing(true)} style={styles.link}>
            <Ionicons name="create-outline" size={16} color={colors.accent700} />
            <Caption style={{ color: colors.accent700 }}>{t('Edit staff')}</Caption>
          </Touchable>
          {staff.mobile ? (
            <Touchable onPress={() => Linking.openURL(`tel:+91${staff.mobile}`).catch(() => undefined)} style={styles.link}>
              <Ionicons name="call-outline" size={16} color={colors.accent700} />
              <Caption style={{ color: colors.accent700 }}>{t('Call')}</Caption>
            </Touchable>
          ) : null}
        </Row>
      </Card>

      <Row style={styles.monthRow}>
        <Touchable onPress={() => setMonth(shiftMonth(month, -1))} accessibilityLabel={t('Previous month')} style={styles.arrow}>
          <Ionicons name="chevron-back" size={22} color={colors.ink700} />
        </Touchable>
        <Heading style={styles.monthLabel}>{monthName}</Heading>
        <Touchable
          onPress={() => month < monthOf(today) && setMonth(shiftMonth(month, 1))}
          disabled={month >= monthOf(today)}
          accessibilityLabel={t('Next month')}
          style={[styles.arrow, month >= monthOf(today) && { opacity: 0.3 }]}
        >
          <Ionicons name="chevron-forward" size={22} color={colors.ink700} />
        </Touchable>
      </Row>

      <Card style={styles.counts}>
        {STATUSES.map((s) => (
          <View key={s.value} style={styles.count}>
            <Heading style={{ color: s.tone.fg }}>{counts[s.value]}</Heading>
            <Caption numberOfLines={1}>{t(s.label)}</Caption>
          </View>
        ))}
        <View style={styles.count}>
          <Heading>{worked}</Heading>
          <Caption numberOfLines={1}>{t('Days worked')}</Caption>
        </View>
      </Card>

      <Card>
        <View style={styles.grid}>
          {WEEK.map((d) => (
            <Caption key={d} style={styles.weekday}>{formatDate(`${d}T00:00:00`, undefined, { weekday: 'narrow' })}</Caption>
          ))}
          {cells.map((date, i) => {
            if (!date) return <View key={`blank-${i}`} style={styles.cell} />;
            const status = marks[date];
            const tone = status ? STATUS[status].tone : null;
            const future = date > today;
            return (
              <Touchable
                key={date}
                onPress={() => setDay(date)}
                disabled={future}
                haptics="select"
                accessibilityLabel={`${formatDate(`${date}T00:00:00`, undefined, { day: 'numeric', month: 'long' })}, ${status ? t(STATUS[status].label) : t('Not marked')}`}
                style={styles.cell}
              >
                <View style={[styles.dot, tone && { backgroundColor: tone.fg }, date === today && !tone && styles.today, future && { opacity: 0.35 }]}>
                  <Body style={[styles.dayNum, tone && { color: '#ffffff' }]}>{Number(date.slice(8))}</Body>
                </View>
              </Touchable>
            );
          })}
        </View>
        <Caption style={styles.hint}>{t('Tap a day to change attendance.')}</Caption>
      </Card>

      <Button title={t('Remove staff')} variant="ghost" style={{ marginTop: space.lg }} onPress={remove} />

      <StatusSheet
        visible={Boolean(day)}
        title={day ? formatDate(`${day}T00:00:00`, undefined, { weekday: 'long', day: 'numeric', month: 'long' }) : ''}
        value={day ? marks[day] ?? null : null}
        onPick={(status) => markAttendance(staff.staffId, day, status).catch(() => undefined)}
        onClose={() => setDay(null)}
      />
      <StaffSheet visible={editing} staff={staff} onClose={() => setEditing(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', gap: 4 },
  pay: { fontSize: 32 },
  rule: { textAlign: 'center', marginVertical: space.xs },
  links: { marginTop: space.sm },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  monthRow: { justifyContent: 'space-between', marginTop: space.md },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { flex: 1, textAlign: 'center' },
  counts: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: space.md },
  count: { flex: 1, alignItems: 'center', gap: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', marginBottom: space.xs },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  today: { borderWidth: 1.5, borderColor: colors.accent600 },
  dayNum: { fontSize: 14 },
  hint: { textAlign: 'center', marginTop: space.sm },
});
