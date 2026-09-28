import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from './Sheet.jsx';
import { Body, Caption, Field, Label, Touchable } from './ui.jsx';
import { canonicalState, matchStates } from '../lib/states.js';
import { colors, fonts, radius, space, type } from '../theme.js';

/**
 * The state of an address, picked from a list instead of typed — no misspellings, and one tap
 * on a phone. Looks like a Field; opens a searchable sheet of India's states and union territories.
 * A value saved before the list existed is shown as it is until another is picked.
 */
export const StateField = ({ label = 'State', value, onChange, onBlur, error, containerStyle, placeholder = 'Select state' }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = canonicalState(value);
  const results = matchStates(query);

  const close = () => {
    setOpen(false);
    setQuery('');
    onBlur?.();
  };
  const pick = (state) => {
    onChange(state);
    close();
  };

  return (
    <View style={[styles.group, containerStyle]}>
      {label ? <Label style={styles.label}>{label}</Label> : null}
      <Touchable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value || 'not selected'}. Tap to choose.`}
        style={[styles.box, error && styles.boxError]}
      >
        <Text style={[styles.value, !value && styles.placeholder]} numberOfLines={1}>{value || placeholder}</Text>
        <Ionicons name="chevron-down" size={18} color={colors.ink500} />
      </Touchable>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Sheet visible={open} onClose={close} title="Select state">
        <Field
          placeholder="Search states"
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="words"
          accessibilityLabel="Search states"
          containerStyle={styles.search}
        />
        {results.length === 0 ? <Caption style={styles.empty}>No state matches “{query}”.</Caption> : null}
        {results.map((state) => (
          <Touchable key={state} onPress={() => pick(state)} accessibilityLabel={state} style={styles.row}>
            <Body style={[styles.rowText, state === selected && styles.rowSelected]}>{state}</Body>
            {state === selected ? <Ionicons name="checkmark" size={20} color={colors.accent600} /> : null}
          </Touchable>
        ))}
      </Sheet>
    </View>
  );
};

const styles = StyleSheet.create({
  group: { marginBottom: space.xl },
  label: { marginBottom: 10, color: colors.ink700 },
  // The same box as Field, so a form reads as one set of inputs.
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 58,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    paddingHorizontal: space.lg + 2,
  },
  boxError: { borderColor: colors.danger, backgroundColor: colors.dangerTint },
  value: { flex: 1, ...type.body, fontSize: 16.5, lineHeight: 22, fontFamily: fonts.medium, color: colors.ink900 },
  placeholder: { color: colors.ink400 },
  error: { ...type.caption, color: colors.danger, marginTop: 7, marginLeft: 2 },
  search: { marginBottom: space.sm },
  empty: { paddingVertical: space.md },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  rowText: { flex: 1 },
  rowSelected: { fontFamily: fonts.semibold, color: colors.accent700 },
});
