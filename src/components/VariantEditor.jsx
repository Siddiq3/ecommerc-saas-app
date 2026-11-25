import { Fragment, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Body, Caption, Card, Field, Label, Row, Touchable } from './ui.jsx';
import { FadeIn } from './motion.jsx';
import { colors, fonts, radius, space, type } from '../theme.js';
import { useT } from '../state/locale.jsx';
import {
  MAX_OPTIONS, MAX_VARIANTS, OPTION_PRESETS, buildRows, comboLabel, fingerprint, optionsFromVariants, parseValues,
  presetsFor, usable, withoutValue,
} from '../lib/variants.js';
import { useAuth } from '../state/auth.jsx';

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

/**
 * One option: its name, its values as chips, and a box to add more. Values are still stored as "S, M, L" (what the
 * form saves); the chips are the one place they are shown, so nobody has to think about commas.
 */
const OptionCard = ({ option, index, presets, onChange, onRemove }) => {
  const t = useT();
  const [draft, setDraft] = useState('');
  const [showAll, setShowAll] = useState(false);
  const values = parseValues(option.values);
  const blank = !option.name.trim() && !values.length;

  const add = (text) => {
    const fresh = parseValues(text).filter((v) => !values.includes(v));
    if (fresh.length) onChange({ values: [...values, ...fresh].join(', ') });
    setDraft('');
  };
  // A comma (or a pasted "S, M, L") finishes the values typed so far, like the keyboard's Done.
  const onType = (text) => (text.includes(',') ? add(text) : setDraft(text));

  return (
    <FadeIn style={styles.option}>
      <Row style={styles.optionHead}>
        <Body strong numberOfLines={1} style={styles.optionTitle}>
          {option.name.trim() || t('Option {n}', { n: index + 1 })}
        </Body>
        <Touchable onPress={onRemove} accessibilityLabel={t('Remove option {n}', { n: index + 1 })} hitSlop={10}
          scaleTo={0.92} style={styles.remove}>
          <Ionicons name="trash-outline" size={18} color={colors.ink500} />
        </Touchable>
      </Row>

      {/* An empty option offers the common lists for this shop, so "shirt" is one tap instead of typing S, M, L... */}
      {blank ? (
        <View style={styles.presets}>
          <Label style={styles.presetsLabel}>{t('Quick pick')}</Label>
          <Row gap={space.sm} style={styles.wrap}>
            {(showAll ? [...presets.first, ...presets.rest] : presets.first).map((id) => (
              <Touchable key={id} onPress={() => onChange({ name: OPTION_PRESETS[id].name, values: OPTION_PRESETS[id].values })}
                style={styles.preset} accessibilityLabel={t(OPTION_PRESETS[id].label)} scaleTo={0.96}>
                <Caption style={styles.presetText}>{t(OPTION_PRESETS[id].label)}</Caption>
              </Touchable>
            ))}
            {showAll ? null : (
              <Touchable onPress={() => setShowAll(true)} style={[styles.preset, styles.presetMore]} accessibilityLabel={t('More')}
                scaleTo={0.96}>
                <Caption style={styles.presetMoreText}>{t('More')}</Caption>
                <Ionicons name="chevron-down" size={14} color={colors.accent700} />
              </Touchable>
            )}
          </Row>
        </View>
      ) : null}

      <Field latin voice={false}
        label={t('Name')}
        value={option.name}
        onChangeText={(value) => onChange({ name: value })}
        placeholder={t('Size, Colour')}
        autoCapitalize="words"
        maxLength={40}
        containerStyle={styles.nameField}
      />

      <Label style={styles.valuesLabel}>{t('Values')}</Label>
      {values.length ? (
        <>
          <Row gap={space.sm} style={styles.wrap}>
            {values.map((value) => (
              <Touchable key={value} onPress={() => onChange({ values: withoutValue(option.values, value) })}
                style={styles.chip} accessibilityLabel={t('Remove {value}', { value })} scaleTo={0.94}>
                <Caption style={styles.chipText}>{value}</Caption>
                <Ionicons name="close" size={15} color={colors.accent700} />
              </Touchable>
            ))}
          </Row>
          <Caption style={styles.chipHint}>{t('Tap a value to remove it')}</Caption>
        </>
      ) : null}
      <Field latin voice={false}
        accessibilityLabel={t('Values')}
        value={draft}
        onChangeText={onType}
        onSubmitEditing={() => add(draft)}
        submitBehavior="submit"
        returnKeyType="done"
        placeholder={values.length ? t('Type one more') : t('Red, Blue, Green')}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={400}
        containerStyle={styles.draftField}
        right={(
          <Touchable onPress={() => add(draft)} disabled={!draft.trim()} accessibilityLabel={t('Add')} scaleTo={0.94}
            style={[styles.addValue, !draft.trim() && styles.addValueOff]}>
            <Ionicons name="add" size={18} color={draft.trim() ? '#ffffff' : colors.ink400} />
            <Caption style={[styles.addValueText, !draft.trim() && { color: colors.ink400 }]}>{t('Add')}</Caption>
          </Touchable>
        )}
      />
    </FadeIn>
  );
};

export const VariantEditor = ({ options, rows, onChangeOptions, onChangeRows, errors = {}, basePrice }) => {
  const { fontScale } = useWindowDimensions();
  const t = useT();
  const { business } = useAuth();
  const presets = presetsFor(business?.category);
  const overflowed = usable(options).length > 0 && rows.length >= MAX_VARIANTS;

  const setOption = (index, patch) => {
    const next = options.map((option, i) => (i === index ? { ...option, ...patch } : option));
    onChangeOptions(next);
    onChangeRows(buildRows(next, rows, basePrice));
  };

  const addOption = () => onChangeOptions([...options, { name: '', values: '' }]);

  const removeOption = (index) => {
    const next = options.filter((_, i) => i !== index);
    onChangeOptions(next);
    onChangeRows(buildRows(next, rows, basePrice));
  };

  const setRow = (index, patch) =>
    onChangeRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  // Price and stock sit beside each combination's name; at large text they drop below it instead of squeezing.
  const priceBasis = 116 * fontScale;
  const stockBasis = 84 * fontScale;

  return (
    <View>
      {options.map((option, index) => (
        <OptionCard key={index} option={option} index={index} presets={presets}
          onChange={(patch) => setOption(index, patch)} onRemove={() => removeOption(index)} />
      ))}

      {options.length < MAX_OPTIONS ? (
        <Touchable onPress={addOption} style={styles.addOption} accessibilityLabel={t('Add an option')}>
          <Ionicons name="add" size={18} color={colors.accent700} />
          <Body strong style={styles.addOptionText}>
            {options.length ? t('Add another option') : t('Add an option')}
          </Body>
        </Touchable>
      ) : (
        <Caption style={styles.limitNote}>{t('That is the most options a product can have.')}</Caption>
      )}

      {rows.length ? (
        <Card style={styles.rows} padded={false}>
          <View style={styles.rowsHead}>
            <Body strong>{t(rows.length === 1 ? '{n} combination' : '{n} combinations', { n: rows.length })}</Body>
            <Row gap={space.sm} style={styles.columns}>
              <View style={{ flexGrow: 1 }} />
              <Caption style={[styles.columnLabel, { width: priceBasis }]}>{t('Price')}</Caption>
              <Caption style={[styles.columnLabel, { width: stockBasis }]}>{t('Stock')}</Caption>
            </Row>
          </View>

          {rows.map((row, index) => (
            <Fragment key={fingerprint(row.attributes)}>
              <View style={styles.divider} />
              <Row gap={space.sm} align="flex-start" style={styles.row}>
                <Body strong style={[styles.rowLabel, { flexBasis: 96 * fontScale }]} numberOfLines={2}>
                  {comboLabel(row.attributes)}
                </Body>
                <Field voice={false}
                  accessibilityLabel={t('Price for {option}', { option: comboLabel(row.attributes) })}
                  value={String(row.price ?? '')}
                  onChangeText={(value) => setRow(index, { price: value })}
                  placeholder="0"
                  keyboardType="decimal-pad"
                  prefix="₹"
                  containerStyle={[styles.cell, { flexBasis: priceBasis }]}
                  error={errors[`variant.${index}.price`]}
                />
                <Field voice={false}
                  accessibilityLabel={t('Stock for {option}', { option: comboLabel(row.attributes) })}
                  value={String(row.stock ?? '')}
                  onChangeText={(value) => setRow(index, { stock: value })}
                  placeholder="0"
                  keyboardType="number-pad"
                  containerStyle={[styles.cell, { flexBasis: stockBasis }]}
                  error={errors[`variant.${index}.stock`]}
                />
              </Row>
            </Fragment>
          ))}
        </Card>
      ) : null}

      {overflowed ? (
        <Caption style={styles.limitNote}>
          {t('Only the first {n} combinations are kept. Remove a few values to stay under the limit.', { n: MAX_VARIANTS })}
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
  optionHead: { marginBottom: space.md, alignItems: 'center' },
  optionTitle: { ...type.heading, flex: 1 },
  remove: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.sunken,
  },

  wrap: { flexWrap: 'wrap', rowGap: space.sm },

  presets: {
    marginBottom: space.lg,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.canvas,
  },
  presetsLabel: { marginBottom: space.sm, color: colors.ink700 },
  preset: {
    paddingHorizontal: space.md + 2,
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  presetText: { color: colors.ink800, fontFamily: fonts.semibold },
  presetMore: { flexDirection: 'row', alignItems: 'center', gap: 4, borderColor: colors.accent200, backgroundColor: colors.accent50 },
  presetMoreText: { color: colors.accent700, fontFamily: fonts.semibold },

  nameField: { marginBottom: space.lg },
  valuesLabel: { marginBottom: 10, color: colors.ink700 },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: space.md + 2,
    paddingRight: space.md,
    minHeight: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.accent50,
    borderWidth: 1,
    borderColor: colors.accent200,
  },
  chipText: { color: colors.accent700, fontFamily: fonts.semibold, fontSize: 14 },
  chipHint: { marginTop: space.sm, marginBottom: space.md, color: colors.ink500 },

  draftField: { marginBottom: 0 },
  addValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingLeft: space.sm,
    paddingRight: space.md,
    minHeight: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.accent600,
  },
  addValueOff: { backgroundColor: colors.sunken },
  addValueText: { color: '#ffffff', fontFamily: fonts.semibold },

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
  rowsHead: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm },
  columns: { marginTop: space.xs },
  columnLabel: { color: colors.ink500, paddingLeft: 2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  row: { paddingHorizontal: space.lg, paddingVertical: space.md, flexWrap: 'wrap', rowGap: space.sm },
  rowLabel: { ...type.bodyStrong, flexGrow: 1, flexShrink: 1, alignSelf: 'center' },
  cell: { marginBottom: 0, flexGrow: 0 },

  limitNote: { marginTop: space.md, color: colors.ink500 },
});
