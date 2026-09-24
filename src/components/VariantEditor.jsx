import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Body, Caption, Card, Field, Row, Touchable } from './ui.jsx';
import { FadeIn } from './motion.jsx';
import { colors, fonts, radius, space, type } from '../theme.js';
import {
  MAX_OPTIONS, MAX_VARIANTS, buildRows, comboLabel, fingerprint, optionsFromVariants, parseValues,
  usable,
} from '../lib/variants.js';

export { MAX_VARIANTS, buildRows, comboLabel, fingerprint, optionsFromVariants, parseValues };

/**
 * Options and their variants — one size-and-colour grid, built from the merchant's own words.
 *
 * A shop owner does not think "I need twelve variant rows". They think "this kurta comes in
 * S, M and L, in red and blue". So the merchant describes the *options*, and the rows are
 * generated from them: every combination, priced at the product's price until they say
 * otherwise. Typing twelve rows by hand on a phone is what stops people using variants at
 * all.
 *
 * The regeneration is the part that has to be careful. A row is matched to its previous
 * self by the combination it represents, not by its position — so adding "XL" to the end of
 * the sizes, or reordering the colours, leaves every existing row's price, stock and
 * `variantId` exactly where they were. Losing a `variantId` would orphan the row server-side
 * and silently reset its stock, which is the kind of bug a merchant discovers by overselling.
 */

export const VariantEditor = ({ options, rows, onChangeOptions, onChangeRows, errors = {}, basePrice }) => {
  const overflowed = usable(options).length > 0 && rows.length >= MAX_VARIANTS;

  const setOption = (index, patch) => {
    const next = options.map((option, i) => (i === index ? { ...option, ...patch } : option));
    onChangeOptions(next);
    onChangeRows(buildRows(next, rows, basePrice));
  };

  const addOption = () => {
    const next = [...options, { name: '', values: '' }];
    onChangeOptions(next);
  };

  const removeOption = (index) => {
    const next = options.filter((_, i) => i !== index);
    onChangeOptions(next);
    onChangeRows(buildRows(next, rows, basePrice));
  };

  const setRow = (index, patch) =>
    onChangeRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <View>
      {options.map((option, index) => (
        <FadeIn key={index} style={styles.option}>
          <Row style={styles.optionHead}>
            <Caption style={styles.optionIndex}>Option {index + 1}</Caption>
            <View style={{ flex: 1 }} />
            <Touchable
              onPress={() => removeOption(index)}
              accessibilityLabel={`Remove option ${index + 1}`}
              hitSlop={10}
              scaleTo={1}
            >
              <Ionicons name="close-circle" size={20} color={colors.ink400} />
            </Touchable>
          </Row>

          <Row gap={space.md} align="flex-start">
            <Field
              label="Name"
              value={option.name}
              onChangeText={(value) => setOption(index, { name: value })}
              placeholder="Size"
              autoCapitalize="words"
              maxLength={40}
              containerStyle={{ flex: 1, marginBottom: 0 }}
            />
            <Field
              label="Values"
              value={option.values}
              onChangeText={(value) => setOption(index, { values: value })}
              placeholder="S, M, L"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={400}
              containerStyle={{ flex: 1.4, marginBottom: 0 }}
              hint="Separate with commas"
            />
          </Row>

          {/* What the commas actually produced, so a stray comma is visible before it
              becomes a variant called "". */}
          {parseValues(option.values).length ? (
            <Row gap={6} style={styles.chips}>
              {parseValues(option.values).map((value) => (
                <View key={value} style={styles.chip}>
                  <Caption style={styles.chipText}>{value}</Caption>
                </View>
              ))}
            </Row>
          ) : null}
        </FadeIn>
      ))}

      {options.length < MAX_OPTIONS ? (
        <Touchable onPress={addOption} style={styles.addOption} accessibilityLabel="Add an option">
          <Ionicons name="add" size={18} color={colors.accent700} />
          <Body strong style={styles.addOptionText}>
            {options.length ? 'Add another option' : 'Add an option'}
          </Body>
        </Touchable>
      ) : (
        <Caption style={styles.limitNote}>That is the most options a product can have.</Caption>
      )}

      {rows.length ? (
        <Card style={styles.rows} padded={false}>
          <Row style={styles.rowsHead}>
            <Body strong style={{ flex: 1 }}>{rows.length} combination{rows.length === 1 ? '' : 's'}</Body>
            <Caption>Price · Stock</Caption>
          </Row>

          {rows.map((row, index) => (
            <Fragment key={fingerprint(row.attributes)}>
              <View style={styles.divider} />
              <View style={styles.row}>
                <Body strong style={styles.rowLabel} numberOfLines={1}>{comboLabel(row.attributes)}</Body>
                <Row gap={space.sm} align="flex-start">
                  <Field
                    accessibilityLabel={`Price for ${comboLabel(row.attributes)}`}
                    value={String(row.price ?? '')}
                    onChangeText={(value) => setRow(index, { price: value })}
                    placeholder="0"
                    keyboardType="decimal-pad"
                    prefix="₹"
                    containerStyle={{ flex: 1.3, marginBottom: 0 }}
                    error={errors[`variant.${index}.price`]}
                  />
                  <Field
                    accessibilityLabel={`Stock for ${comboLabel(row.attributes)}`}
                    value={String(row.stock ?? '')}
                    onChangeText={(value) => setRow(index, { stock: value })}
                    placeholder="0"
                    keyboardType="number-pad"
                    containerStyle={{ flex: 1, marginBottom: 0 }}
                    error={errors[`variant.${index}.stock`]}
                  />
                </Row>
              </View>
            </Fragment>
          ))}
        </Card>
      ) : null}

      {overflowed ? (
        <Caption style={styles.limitNote}>
          Only the first {MAX_VARIANTS} combinations are kept. Remove a few values to stay under the limit.
        </Caption>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  option: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: space.lg,
    marginBottom: space.md,
  },
  optionHead: { marginBottom: space.sm },
  optionIndex: { ...type.overline, textTransform: 'uppercase', color: colors.ink500 },

  chips: { flexWrap: 'wrap', marginTop: space.md },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.accent50,
  },
  chipText: { color: colors.accent700, fontFamily: fonts.semibold },

  addOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.accent200,
    backgroundColor: colors.accent50,
  },
  addOptionText: { color: colors.accent700 },

  rows: { marginTop: space.lg },
  rowsHead: { paddingHorizontal: space.lg, paddingVertical: space.md },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  row: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.sm },
  rowLabel: { ...type.bodyStrong },

  limitNote: { marginTop: space.md, color: colors.ink500 },
});
