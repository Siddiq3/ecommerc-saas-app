import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../src/components/Screen.jsx';
import { Body, Button, Caption, Card, Divider, EmptyState, Heading, Row, Touchable } from '../../src/components/ui.jsx';
import { SyncBadge } from '../../src/components/book.jsx';
import { STATUSES, StaffSheet, StatusChip, wageLabel } from '../../src/components/staff.jsx';
import { dayKey, shiftDay } from '../../src/lib/book.js';
import { readRegister } from '../../src/lib/bookQueries.js';
import { formatDate } from '../../src/lib/format.js';
import { useBook, useBookQuery } from '../../src/state/book.jsx';
import { useT } from '../../src/state/locale.jsx';
import { colors, space } from '../../src/theme.js';

/**
 * The attendance register: one page per day, like the paper one. Every person on the staff
 * list with a tap to mark them present, half day, absent or on leave.
 */
export default function StaffRegister() {
  const t = useT();
  const router = useRouter();
  const today = dayKey();
  const [date, setDate] = useState(today);
  const [adding, setAdding] = useState(false);
  const { markAttendance } = useBook();
  const register = useBookQuery((db) => readRegister(db, date), [date]);

  const label = date === today ? t('Today') : date === shiftDay(today, -1) ? t('Yesterday')
    : formatDate(`${date}T00:00:00`, undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  const count = (status) => (register ?? []).filter((s) => s.status === status).length;
  const unmarked = (register ?? []).filter((s) => !s.status);
  const markAll = async () => { for (const s of unmarked) await markAttendance(s.staffId, date, 'present'); };

  return (
    <Screen
      footer={<Button title={t('Add staff')} icon={<Ionicons name="person-add" size={18} color="#ffffff" />} onPress={() => setAdding(true)} />}
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

      {register && !register.length ? (
        <EmptyState
          icon="🧑‍🔧"
          title={t('No staff added yet')}
          message={t('Add the people who work at your shop. Mark attendance each day and see their salary for the month.')}
        />
      ) : (
        <>
          <Card style={styles.counts}>
            {STATUSES.map((s) => (
              <View key={s.value} style={styles.count}>
                <Heading style={{ color: s.tone.fg }}>{count(s.value)}</Heading>
                <Caption numberOfLines={1}>{t(s.label)}</Caption>
              </View>
            ))}
            <View style={styles.count}>
              <Heading style={{ color: colors.ink400 }}>{unmarked.length}</Heading>
              <Caption numberOfLines={1}>{t('Not marked')}</Caption>
            </View>
          </Card>

          {unmarked.length ? (
            <Button title={t('Mark all present')} variant="secondary" size="sm" style={styles.markAll}
              icon={<Ionicons name="checkmark-done" size={16} color={colors.ink900} />}
              onPress={() => markAll().catch(() => undefined)} />
          ) : null}

          <Card padded={false}>
            {(register ?? []).map((s, i) => (
              <View key={s.staffId}>
                {i ? <Divider /> : null}
                <View style={styles.person}>
                  <Touchable onPress={() => router.push(`/staff/${s.staffId}`)} style={styles.name} accessibilityLabel={s.name}>
                    <View style={{ flex: 1 }}>
                      <Body strong numberOfLines={1}>{s.name}</Body>
                      <Caption>{wageLabel(t, s)}</Caption>
                    </View>
                    <Ionicons name="chevron-forward" size={17} color={colors.ink400} />
                  </Touchable>
                  <Row gap={space.xs}>
                    {STATUSES.map((st) => (
                      <StatusChip
                        key={st.value}
                        status={st.value}
                        active={s.status === st.value}
                        onPress={() => markAttendance(s.staffId, date, s.status === st.value ? null : st.value).catch(() => undefined)}
                      />
                    ))}
                  </Row>
                </View>
              </View>
            ))}
          </Card>
        </>
      )}

      <StaffSheet visible={adding} onClose={() => setAdding(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  dateRow: { justifyContent: 'space-between' },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dateLabel: { flex: 1, textAlign: 'center' },
  counts: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.md, marginBottom: space.md },
  count: { flex: 1, alignItems: 'center', gap: 2 },
  markAll: { marginBottom: space.md },
  person: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.sm },
  name: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
