import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from './Sheet.jsx';
import {
  Alert, Body, Button, Caption, Field, Row, Toggle, Touchable,
} from './ui.jsx';
import { fromForm, toForm } from '../lib/delivery.js';
import { colors, fonts, radius, space } from '../theme.js';

/**
 * Edits one delivery method, in a sheet over the Delivery screen. Nothing is saved here: "Done"
 * hands the method back to the screen, which saves all of them together.
 */

const Segmented = ({ options, value, onChange }) => (
  <View style={styles.segmented}>
    {options.map((option) => {
      const active = option.value === value;
      return (
        <Touchable
          key={option.value}
          onPress={() => onChange(option.value)}
          haptics="select"
          accessibilityRole="radio"
          accessibilityState={{ checked: active }}
          accessibilityLabel={option.label}
          style={[styles.segment, active && styles.segmentActive]}
        >
          <Body style={[styles.segmentText, active && styles.segmentTextActive]} numberOfLines={1}>{option.label}</Body>
        </Touchable>
      );
    })}
  </View>
);

const Section = ({ title, hint, children }) => (
  <View style={styles.section}>
    <Caption style={styles.sectionTitle}>{title.toUpperCase()}</Caption>
    {hint ? <Caption style={styles.sectionHint}>{hint}</Caption> : null}
    {children}
  </View>
);

export const DeliveryMethodEditor = ({ visible, method, origin, canRemove, onDone, onRemove, onClose }) => {
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (visible && method) {
      setForm(toForm(method));
      setErrors({});
    }
  }, [visible, method]);

  if (!form) return null;

  const set = (key) => (value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };
  const setRule = (index, key) => (value) => {
    setForm((prev) => ({ ...prev, pincodeRules: prev.pincodeRules.map((r, i) => (i === index ? { ...r, [key]: value } : r)) }));
    if (errors[`rule.${index}`]) setErrors((prev) => ({ ...prev, [`rule.${index}`]: undefined }));
  };
  const addRule = () => setForm((prev) => ({ ...prev, pincodeRules: [...prev.pincodeRules, { pincodePrefix: '', fee: '' }] }));
  const removeRule = (index) => setForm((prev) => ({ ...prev, pincodeRules: prev.pincodeRules.filter((_, i) => i !== index) }));

  const done = () => {
    const result = fromForm(form);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    onDone(result.method);
  };

  const delivery = form.kind === 'delivery';
  const paid = delivery && form.pricingType !== 'free';

  return (
    <Sheet visible={visible} onClose={onClose} title={method?.id || method?.name ? 'Edit delivery method' : 'New delivery method'}>
      <Field label="Name" placeholder="Enter a name, like Express delivery" value={form.name} onChangeText={set('name')} maxLength={40} error={errors.name} />
      <Field
        label="Description (optional)"
        placeholder="Enter a short note for customers"
        value={form.description}
        onChangeText={set('description')}
        maxLength={120}
        error={errors.description}
      />

      <Section title="Type">
        <Segmented
          options={[{ value: 'delivery', label: 'Delivery' }, { value: 'pickup', label: 'Pickup from store' }]}
          value={form.kind}
          onChange={set('kind')}
        />
        {!delivery ? <Caption style={styles.note}>Customers collect their order. Pickup is always free.</Caption> : null}
      </Section>

      {delivery ? (
        <Section title="Price">
          <Segmented
            options={[{ value: 'free', label: 'Free' }, { value: 'flat', label: 'Flat fee' }, { value: 'tiered', label: 'By area' }]}
            value={form.pricingType}
            onChange={set('pricingType')}
          />
          {errors.pricingType ? <Caption style={styles.error}>{errors.pricingType}</Caption> : null}

          {form.pricingType === 'flat' ? (
            <Field label="Delivery charge" placeholder="Enter amount" prefix="₹" keyboardType="decimal-pad" value={form.flatFee} onChangeText={set('flatFee')} error={errors.flatFee} containerStyle={styles.topGap} />
          ) : null}

          {form.pricingType === 'tiered' ? (
            <View style={styles.topGap}>
              <Caption style={styles.note}>
                {origin?.located
                  ? `Measured from your store’s pincode ${origin.pincode} (${titleCase(origin.district)}, ${titleCase(origin.state)}).`
                  : 'Pricing by area is measured from your store’s pincode. Add it in Store details first.'}
              </Caption>
              <Field label="Same district" placeholder="Enter amount" prefix="₹" keyboardType="decimal-pad" value={form.district} onChangeText={set('district')} error={errors.district} />
              <Field label="Same state" placeholder="Enter amount" prefix="₹" keyboardType="decimal-pad" value={form.state} onChangeText={set('state')} error={errors.state} />
              <Field
                label="Rest of India"
                placeholder="Enter amount"
                prefix="₹"
                keyboardType="decimal-pad"
                value={form.national}
                onChangeText={set('national')}
                hint="Also used when a customer’s pincode cannot be found in India Post’s directory."
                error={errors.national}
              />
            </View>
          ) : null}

          {paid ? (
            <>
              <Toggle label="Free above an order value" hint="Orders of this value or more deliver free." value={form.freeAboveOn} onChange={set('freeAboveOn')} />
              {form.freeAboveOn ? (
                <Field label="Free delivery on orders of" placeholder="Enter order value" prefix="₹" keyboardType="decimal-pad" value={form.freeAbove} onChangeText={set('freeAbove')} error={errors.freeAbove} />
              ) : null}
            </>
          ) : null}
        </Section>
      ) : null}

      {delivery ? (
        <Section title="Pincode prices" hint="A different price for specific pincodes. Use the first digits to cover an area: 5000 covers 500001–500099.">
          {form.pincodeRules.map((rule, index) => (
            // Rows have no id until saved; their order is stable while editing.
            <View key={index}>
              <Row gap={space.sm} align="flex-start">
                <Field
                  placeholder="Pincode"
                  value={rule.pincodePrefix}
                  onChangeText={setRule(index, 'pincodePrefix')}
                  keyboardType="number-pad"
                  maxLength={6}
                  accessibilityLabel={`Pincode for price ${index + 1}`}
                  containerStyle={styles.ruleField}
                />
                <Field
                  placeholder="Price"
                  prefix="₹"
                  value={rule.fee}
                  onChangeText={setRule(index, 'fee')}
                  keyboardType="decimal-pad"
                  accessibilityLabel={`Price ${index + 1}`}
                  containerStyle={styles.ruleField}
                />
                <Touchable onPress={() => removeRule(index)} accessibilityLabel={`Remove pincode price ${index + 1}`} style={styles.removeRule}>
                  <Ionicons name="trash-outline" size={20} color={colors.danger} />
                </Touchable>
              </Row>
              {errors[`rule.${index}`] ? <Caption style={styles.error}>{errors[`rule.${index}`]}</Caption> : null}
            </View>
          ))}
          {errors.pincodeRules ? <Caption style={styles.error}>{errors.pincodeRules}</Caption> : null}
          <Touchable onPress={addRule} accessibilityLabel="Add a pincode price" style={styles.addRow}>
            <Ionicons name="add-circle-outline" size={20} color={colors.accent700} />
            <Body style={styles.addText}>Add a pincode price</Body>
          </Touchable>
        </Section>
      ) : null}

      <Section title={delivery ? 'Delivery time' : 'Ready for pickup'}>
        <Segmented
          options={[{ value: 'same_day', label: 'Same day' }, { value: 'next_day', label: 'Next day' }, { value: 'days', label: 'Days' }]}
          value={form.estimateType}
          onChange={set('estimateType')}
        />
        {form.estimateType === 'days' ? (
          <Row gap={space.md} align="flex-start" style={styles.topGap}>
            <Field label="From" placeholder="Min days" keyboardType="number-pad" maxLength={2} value={form.minDays} onChangeText={set('minDays')} error={errors.minDays} containerStyle={{ flex: 1 }} />
            <Field label="To" placeholder="Max days" keyboardType="number-pad" maxLength={2} value={form.maxDays} onChangeText={set('maxDays')} error={errors.maxDays} containerStyle={{ flex: 1 }} />
          </Row>
        ) : null}
        <Toggle label="Show the estimate to customers" hint="Customers see the expected dates at checkout." value={form.showEstimate} onChange={set('showEstimate')} />
      </Section>

      <Section title="Availability">
        <Toggle
          label="Main method"
          hint="Chosen for customers until they pick another. There is always exactly one."
          value={form.primary}
          onChange={(value) => setForm((prev) => ({ ...prev, primary: value, active: value ? true : prev.active }))}
          disabled={method?.primary}
        />
        <Toggle
          label="Offer to customers"
          hint={form.primary ? 'The main method is always offered.' : 'Turn off to hide it without deleting it.'}
          value={form.active}
          onChange={set('active')}
          disabled={form.primary}
        />
      </Section>

      <Alert message={errors._ ?? null} />
      <Button title="Done" onPress={done} style={styles.topGap} />
      {canRemove && !method?.primary ? (
        <Button title="Remove this method" variant="ghost" onPress={onRemove} style={styles.topGap} />
      ) : null}
    </Sheet>
  );
};

const titleCase = (text) => String(text ?? '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

const styles = StyleSheet.create({
  section: { marginTop: space.lg },
  sectionTitle: { letterSpacing: 0.8, color: colors.ink500, marginBottom: space.sm },
  sectionHint: { marginBottom: space.sm },
  note: { marginTop: space.sm, marginBottom: space.md },
  error: { color: colors.danger, marginTop: space.xs },
  topGap: { marginTop: space.md },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.sunken,
    borderRadius: radius.pill,
    padding: 4,
    gap: 4,
  },
  segment: { flex: 1, paddingVertical: 9, borderRadius: radius.pill, alignItems: 'center', minHeight: 40, justifyContent: 'center' },
  segmentActive: { backgroundColor: colors.surface },
  segmentText: { color: colors.ink600, fontFamily: fonts.semibold, fontSize: 13 },
  segmentTextActive: { color: colors.ink900 },
  ruleField: { flex: 1, marginBottom: space.sm },
  removeRule: { width: 44, height: 58, alignItems: 'center', justifyContent: 'center' },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
  addText: { color: colors.accent700, fontFamily: fonts.semibold },
});
