import { ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Body, Caption, Field, Touchable } from './ui.jsx';
import { colors, radius, space, type } from '../theme.js';

/**
 * A horizontal row of single-select chips.
 *
 * A chip may carry a `count` (rendered as a small counter inside it) and a `tone` that
 * dot-colours it when it is a status filter — so "Low 2" reads at a glance as a warning
 * rather than just another tab. The selected chip goes solid ink, the rest stay quiet.
 */
const TONE_DOT = {
  warning: colors.warning,
  danger: colors.danger,
  success: colors.success,
};

export const FilterChips = ({ options, value, onChange, style }) => (
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    contentContainerStyle={styles.chips}
    style={[styles.scroll, style]}
  >
    {options.map((option) => {
      const active = option.value === value;
      const dot = !active && TONE_DOT[option.tone] && option.count > 0 ? TONE_DOT[option.tone] : null;
      return (
        <Touchable
          key={option.value}
          onPress={() => onChange(option.value)}
          haptics="select"
          accessibilityLabel={option.label}
          accessibilityState={{ selected: active }}
          style={[styles.chip, active && styles.chipActive]}
        >
          {dot ? <View style={[styles.dot, { backgroundColor: dot }]} /> : null}
          <Body style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Body>
          {option.count != null ? (
            <View style={[styles.counter, active && styles.counterActive]}>
              <Caption style={[styles.counterText, active && styles.counterTextActive]}>{option.count}</Caption>
            </View>
          ) : null}
        </Touchable>
      );
    })}
  </ScrollView>
);

export const SearchBar = ({ value, onChange, placeholder = 'Search', error }) => (
  <View style={styles.search}>
    <Field
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      autoCapitalize="none"
      autoCorrect={false}
      returnKeyType="search"
      clearButtonMode="while-editing"
      containerStyle={styles.searchField}
      error={error}
      prefix={<Ionicons name="search" size={17} color={colors.ink400} />}
      right={
        value ? (
          <Touchable onPress={() => onChange('')} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={colors.ink400} />
          </Touchable>
        ) : null
      }
    />
  </View>
);

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, marginHorizontal: -space.lg },
  chips: { gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.lg,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipActive: { backgroundColor: colors.ink900, borderColor: colors.ink900 },
  chipText: { ...type.label, color: colors.ink700 },
  chipTextActive: { color: '#ffffff' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  counter: {
    minWidth: 18,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.ink200,
    alignItems: 'center',
  },
  counterActive: { backgroundColor: 'rgba(255,255,255,0.24)' },
  counterText: { fontSize: 11, color: colors.ink600 },
  counterTextActive: { color: '#ffffff' },

  search: { paddingTop: space.sm },
  searchField: { marginBottom: space.sm },
});
