import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { Body, Button, Caption, Card, Row, Touchable } from './ui.jsx';
import { colors, fonts, radius, space } from '../theme.js';

export const indiaDay = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
export const displayDay = day => new Date(day + 'T12:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

// Labels say the window itself, so no legend is needed: daily = today, weekly = last 7 days.
const PERIODS = [['daily', 'Today'], ['weekly', '7 days'], ['monthly', 'Month'], ['yearly', 'Year']];

export function InstagramActivityPeriod({ value, onChange }) {
  const [picker, setPicker] = useState(null);
  const [draft, setDraft] = useState({ from: value.from ?? indiaDay(), to: value.to ?? indiaDay() });
  const [error, setError] = useState('');
  const select = (event, date) => {
    const field = picker;
    if (Platform.OS === 'android') setPicker(null);
    if (event.type === 'dismissed' || !date) return;
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    setDraft(p => ({ ...p, [field]: day })); setError('');
  };
  const apply = () => {
    if (draft.from > draft.to || Date.parse(draft.to) - Date.parse(draft.from) > 365 * 86400000) {
      setError('Choose an end date after the start, with a range up to one year.'); return;
    }
    setPicker(null); setError(''); onChange({ period: 'custom', ...draft });
  };
  const choose = period => { setPicker(null); setError(''); onChange(period === 'custom' ? { period, ...draft } : { period }); };
  const custom = value.period === 'custom';
  return <View style={styles.wrap}>
    <View style={styles.segmented} accessibilityRole="radiogroup" accessibilityLabel="Time period">
      {PERIODS.map(([period, title]) => {
        const active = value.period === period;
        return <Touchable key={period} haptics="select" accessibilityRole="radio" accessibilityLabel={title} accessibilityState={{ checked: active }}
          style={[styles.segment, active && styles.segmentActive]} onPress={() => choose(period)}>
          <Body style={[styles.segmentText, active && styles.segmentTextActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{title}</Body>
        </Touchable>;
      })}
      <Touchable haptics="select" accessibilityRole="radio" accessibilityLabel="Custom dates" accessibilityState={{ checked: custom }}
        style={[styles.segment, styles.segmentIcon, custom && styles.segmentActive]} onPress={() => choose('custom')}>
        <Ionicons name="calendar-outline" size={17} color={custom ? colors.accent600 : colors.ink600} />
      </Touchable>
    </View>
    {custom ? <Card style={styles.custom}>
      <Row gap={space.sm}>
        {['from', 'to'].map(field => <Touchable key={field} accessibilityLabel={`${field === 'from' ? 'Start' : 'End'} date, ${displayDay(draft[field])}`}
          style={[styles.dateField, picker === field && styles.dateFieldActive]} onPress={() => setPicker(field)}>
          <Caption>{field === 'from' ? 'From' : 'To'}</Caption>
          <Body strong numberOfLines={1}>{displayDay(draft[field])}</Body>
        </Touchable>)}
      </Row>
      {picker ? <>
        <DateTimePicker value={new Date(draft[picker] + 'T12:00:00')} mode="date" display={Platform.OS === 'ios' ? 'inline' : 'default'} maximumDate={new Date()} onChange={select} accentColor={colors.accent600} />
        {Platform.OS === 'ios' ? <Button title="Done" variant="secondary" size="sm" onPress={() => setPicker(null)} /> : null}
      </> : null}
      {error ? <Caption style={styles.error}>{error}</Caption> : null}
      <Button title="Apply dates" size="sm" onPress={apply} />
    </Card> : null}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { marginBottom: space.md, gap: space.md },
  segmented: { flexDirection: 'row', backgroundColor: colors.sunken, borderRadius: radius.pill, padding: 4, gap: 2 },
  segment: { flex: 1, minHeight: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xs },
  segmentIcon: { flex: 0, width: 44 },
  segmentActive: { backgroundColor: colors.surface, shadowColor: colors.ink900, shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segmentText: { color: colors.ink600, fontFamily: fonts.semibold, fontSize: 13 },
  segmentTextActive: { color: colors.ink900 },
  custom: { gap: space.md },
  dateField: { flex: 1, minHeight: 56, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.sm, backgroundColor: colors.sunken, borderWidth: 1, borderColor: 'transparent' },
  dateFieldActive: { borderColor: colors.accent600, backgroundColor: colors.accent50 },
  error: { color: colors.danger },
});
