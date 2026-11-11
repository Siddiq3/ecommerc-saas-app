import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { toMajor } from '@storekit/shared';
import { bookStaffSchema, rupeesText } from '@storekit/validation';
import { Alert, Button, Caption, Field, Touchable } from './ui.jsx';
import { Sheet } from './Sheet.jsx';
import { FilterChips } from './Filters.jsx';
import { msg } from '../lib/i18n.js';
import { formatMoney } from '../lib/format.js';
import { newBookId, useBook } from '../state/book.jsx';
import { useT } from '../state/locale.jsx';
import { useAction } from '../lib/useAsync.js';
import { colors, radius, space, tones } from '../theme.js';

/** Each attendance mark: its label and colours, in the order the chips show. */
export const STATUSES = [
  { value: 'present', label: msg('Present'), tone: tones.green },
  { value: 'half', label: msg('Half day'), tone: tones.amber },
  { value: 'absent', label: msg('Absent'), tone: tones.red },
  { value: 'leave', label: msg('Leave'), tone: tones.blue },
];
export const STATUS = Object.fromEntries(STATUSES.map((s) => [s.value, s]));

const WAGE_TYPES = [{ value: 'monthly', label: msg('Monthly') }, { value: 'daily', label: msg('Daily') }];
const wageField = rupeesText('Salary');

/** `₹15,000 / month` or `₹600 / day`. */
const PER = { monthly: msg('{amount} / month'), daily: msg('{amount} / day') };
export const wageLabel = (t, staff) => t(PER[staff.wageType] ?? PER.monthly, { amount: formatMoney(staff.wage) });

/** A tappable status: filled when chosen. Tapping the chosen one clears it. */
export const StatusChip = ({ status, active, onPress }) => {
  const t = useT();
  const { label, tone } = STATUS[status];
  return (
    <Touchable
      onPress={onPress}
      haptics="select"
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={t(label)}
      style={[styles.chip, active ? { backgroundColor: tone.fg, borderColor: tone.fg } : { borderColor: colors.line }]}
    >
      <Caption numberOfLines={1} style={[styles.chipText, { color: active ? '#ffffff' : colors.ink700 }]}>{t(label)}</Caption>
    </Touchable>
  );
};

/** Add a person to the staff list, or edit one: name, number, and how they are paid. */
export const StaffSheet = ({ visible, staff, onClose, onSaved }) => {
  const t = useT();
  const { db, saveStaff } = useBook();
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [wageType, setWageType] = useState('monthly');
  const [wage, setWage] = useState('');
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!visible) return;
    setName(staff?.name ?? '');
    setMobile(staff?.mobile ?? '');
    setWageType(staff?.wageType ?? 'monthly');
    setWage(staff ? String(toMajor(staff.wage)) : '');
    setErrors({});
  }, [visible, staff]);

  const { run: save, pending, error } = useAction(async () => {
    const amount = wageField.safeParse(wage);
    if (!amount.success) { setErrors({ wage: t('Enter an amount, like 250 or 99.50') }); return; }
    const record = {
      staffId: staff?.staffId ?? newBookId(),
      name,
      ...(mobile.trim() ? { mobile } : {}),
      wageType,
      wage: amount.data,
      ...(staff?.note ? { note: staff.note } : {}),
      updatedAt: new Date().toISOString(),
    };
    const result = bookStaffSchema.safeParse(record);
    if (!result.success) { setErrors(Object.fromEntries(result.error.issues.map((i) => [i.path[0], i.message]))); return; }
    await saveStaff(result.data);
    onSaved?.(result.data);
    onClose();
  });

  return (
    <Sheet visible={visible} onClose={() => { if (!pending) onClose(); }} title={staff ? t('Edit staff') : t('Add staff')}>
      <Alert message={error ? t('Something went wrong. Try again.') : null} />
      <Field label={t('Name')} value={name} onChangeText={setName} placeholder={t('Staff name')} autoFocus={!staff} error={errors.name} maxLength={80} />
      <Field label={t('Mobile number (optional)')} value={mobile} onChangeText={setMobile} keyboardType="phone-pad" prefix="+91" maxLength={14} error={errors.mobile} />
      <Caption style={styles.label}>{t('Salary type')}</Caption>
      <FilterChips options={WAGE_TYPES} value={wageType} onChange={setWageType} style={styles.types} />
      <Field
        label={wageType === 'daily' ? t('Daily wage') : t('Monthly salary')}
        value={wage}
        onChangeText={(v) => { setWage(v); setErrors((e) => ({ ...e, wage: undefined })); }}
        keyboardType="decimal-pad"
        prefix="₹"
        error={errors.wage}
      />
      <Button title={t('Save')} loading={pending} disabled={!db} onPress={() => save().catch(() => undefined)} />
    </Sheet>
  );
};

/** Pick a status for one day, or clear it. */
export const StatusSheet = ({ visible, title, value, onPick, onClose }) => {
  const t = useT();
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <View style={styles.pickGrid}>
        {STATUSES.map((s) => (
          <StatusChip key={s.value} status={s.value} active={value === s.value} onPress={() => { onPick(s.value); onClose(); }} />
        ))}
      </View>
      <Button title={t('Not marked')} variant="ghost" disabled={!value} onPress={() => { onPick(null); onClose(); }} />
    </Sheet>
  );
};

const styles = StyleSheet.create({
  chip: {
    flex: 1, minHeight: 36, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: space.xs,
    alignItems: 'center', justifyContent: 'center',
  },
  chipText: { fontSize: 12.5 },
  label: { marginTop: space.sm },
  types: { marginBottom: space.md },
  pickGrid: { flexDirection: 'row', gap: space.sm, marginBottom: space.md },
});
