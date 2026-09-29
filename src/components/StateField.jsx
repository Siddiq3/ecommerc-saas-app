import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from './Sheet.jsx';
import { Body, Caption, Field, SelectField, Touchable } from './ui.jsx';
import { canonicalState, matchStates } from '../lib/states.js';
import { colors, fonts, space } from '../theme.js';

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
      <SelectField label={label} value={value} placeholder={placeholder} onPress={() => setOpen(true)} error={error} containerStyle={styles.flush} />

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
  // The field brings its own spacing; this wrapper only anchors the sheet.
  flush: { marginBottom: 0 },
  search: { marginBottom: space.sm },
  empty: { paddingVertical: space.md },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  rowText: { flex: 1 },
  rowSelected: { fontFamily: fonts.semibold, color: colors.accent700 },
});
