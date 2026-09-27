import { useEffect, useState } from 'react';
import { Alert as RNAlert, StyleSheet, View } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../src/components/Screen.jsx';
import {
  Alert, Body, Button, Caption, Card, ErrorState, Field, Heading, Pill, Row, Touchable,
} from '../../src/components/ui.jsx';
import { SkeletonCard } from '../../src/components/Skeleton.jsx';
import { HelpButton } from '../../src/components/Help.jsx';
import { DeliveryMethodEditor } from '../../src/components/DeliveryMethodEditor.jsx';
import { useToast } from '../../src/components/Toast.jsx';
import { useAuth } from '../../src/state/auth.jsx';
import { useAction, useAsync } from '../../src/lib/useAsync.js';
import {
  MAX_DELIVERY_METHODS, blankMethod, estimateSummary, priceSummary, withArea, withMethod, withoutMethod,
} from '../../src/lib/delivery.js';
import { delivery as deliveryApi } from '../../src/api/endpoints.js';
import { colors, radius, space } from '../../src/theme.js';

/**
 * Delivery: where the store sends from, the delivery methods it offers, and where it delivers.
 *
 * Methods are edited in a sheet and saved together with "Save delivery settings" — the API
 * takes the whole document, so what is on this screen is exactly what gets saved.
 */

const titleCase = (text) => String(text ?? '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const snapshot = (draft) => JSON.stringify(draft);

export default function DeliverySettings() {
  const navigation = useNavigation();
  const router = useRouter();
  const toast = useToast();
  const { businessId } = useAuth();

  const { data, error, loading, reload } = useAsync(
    () => (businessId ? deliveryApi.get(businessId) : Promise.resolve(null)),
    [businessId],
  );

  const [draft, setDraft] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [origin, setOrigin] = useState(null);
  const [editing, setEditing] = useState(null); // { index } — index === -1 for a new method
  const [newArea, setNewArea] = useState('');
  const [areaError, setAreaError] = useState(null);

  // Filled from the server only while empty, so a reload never overwrites unsaved edits.
  useEffect(() => {
    if (!data || draft) return;
    setDraft(data.delivery);
    setBaseline(snapshot(data.delivery));
    setOrigin(data.origin);
  }, [data, draft]);

  const dirty = Boolean(draft) && snapshot(draft) !== baseline;

  const { run: save, pending: saving, error: saveError, clearError } = useAction(async () => {
    const saved = await deliveryApi.save(businessId, draft);
    setDraft(saved.delivery);
    setBaseline(snapshot(saved.delivery));
    setOrigin(saved.origin);
    toast.success('Delivery settings saved');
  });

  useEffect(() => {
    navigation.setOptions?.({ headerRight: () => <HelpButton context="delivery" /> });
  }, [navigation]);

  /* Leaving with unsaved edits asks first, as the store details screen does. */
  useEffect(() => {
    navigation.setOptions?.({ gestureEnabled: !dirty });
    if (!dirty) return undefined;
    return navigation.addListener('beforeRemove', (event) => {
      event.preventDefault();
      RNAlert.alert('Discard your changes?', 'Your delivery settings have not been saved.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(event.data.action) },
      ]);
    });
  }, [dirty, navigation]);

  if (loading && !draft) {
    return (
      <Screen>
        <SkeletonCard lines={2} />
        <View style={{ height: space.lg }} />
        <SkeletonCard lines={4} />
      </Screen>
    );
  }
  if (error && !draft) return <ErrorState error={error} onRetry={reload} />;
  if (!draft) return null;

  const change = (next) => {
    setDraft(next);
    if (saveError) clearError();
  };

  /** Applies an edited method. Making one the main method makes every other one not. */
  const applyMethod = (method) => {
    change(withMethod(draft, editing.index, method));
    setEditing(null);
  };

  const removeMethod = () => {
    change(withoutMethod(draft, editing.index));
    setEditing(null);
  };

  const addArea = () => {
    const result = withArea(draft, newArea);
    if (result.error) {
      setAreaError(result.error);
      return;
    }
    change(result.settings);
    setNewArea('');
    setAreaError(null);
  };

  const removeArea = (prefix) =>
    change({ ...draft, serviceablePincodePrefixes: draft.serviceablePincodePrefixes.filter((p) => p !== prefix) });

  const saveMessage = saveError
    ? saveError.status === 0
      ? 'Unable to save changes. Please check your internet connection and try again.'
      : [saveError.message, ...(saveError.details ?? []).map((d) => d.message)].filter(Boolean).join('\n')
    : null;

  const editingMethod = editing ? (editing.index === -1 ? blankMethod() : draft.methods[editing.index]) : null;

  return (
    <Screen footer={<Button title="Save delivery settings" loading={saving} disabled={!dirty} onPress={() => save().catch(() => undefined)} />}>
      {/* ───── Origin ───── */}
      <Card style={styles.card}>
        <Row gap={space.md} align="flex-start">
          <View style={styles.icon}><Ionicons name="location-outline" size={20} color={colors.accent700} /></View>
          <View style={{ flex: 1 }}>
            <Body strong>Sending from</Body>
            {origin?.located ? (
              <Caption>{origin.pincode} · {titleCase(origin.district)}, {titleCase(origin.state)}</Caption>
            ) : (
              <Caption style={{ color: colors.warning }}>
                {origin?.pincode ? `We could not find ${origin.pincode}. Check your pincode in Store details.` : 'Add your store’s pincode to price delivery by area.'}
              </Caption>
            )}
          </View>
          <Touchable onPress={() => router.push('/settings/store')} accessibilityLabel="Edit store address" style={styles.link}>
            <Body style={styles.linkText}>Edit</Body>
          </Touchable>
        </Row>
      </Card>

      {/* ───── Methods ───── */}
      <Heading style={styles.heading}>Delivery methods</Heading>
      <Caption style={styles.intro}>Customers choose one at checkout. The main method is picked for them until they do.</Caption>

      {draft.methods.map((method, index) => (
        <Touchable
          key={method.id ?? `new-${index}`}
          onPress={() => setEditing({ index })}
          accessibilityLabel={`Edit ${method.name}`}
          style={[styles.method, !method.active && styles.methodOff]}
        >
          <View style={styles.icon}>
            <Ionicons name={method.kind === 'pickup' ? 'storefront-outline' : 'bicycle-outline'} size={20} color={colors.accent700} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Row gap={space.sm}>
              <Body strong numberOfLines={1} style={{ flexShrink: 1 }}>{method.name}</Body>
              {method.primary ? <Pill label="Main" tone="accent" /> : null}
              {!method.active ? <Pill label="Off" tone="slate" /> : null}
            </Row>
            <Caption>{priceSummary(method)}</Caption>
            <Caption>{estimateSummary(method)}</Caption>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.ink400} />
        </Touchable>
      ))}

      {draft.methods.length < MAX_DELIVERY_METHODS ? (
        <Touchable onPress={() => setEditing({ index: -1 })} accessibilityLabel="Add delivery method" style={styles.add}>
          <Ionicons name="add-circle-outline" size={20} color={colors.accent700} />
          <Body style={styles.linkText}>Add delivery method</Body>
        </Touchable>
      ) : (
        <Caption style={styles.intro}>That is the most delivery methods a store can have ({MAX_DELIVERY_METHODS}).</Caption>
      )}

      {/* ───── Areas ───── */}
      <Heading style={styles.heading}>Where you deliver</Heading>
      <Caption style={styles.intro}>
        {draft.serviceablePincodePrefixes.length === 0
          ? 'Everywhere. Add pincodes to deliver only to those areas. Pickup is never limited.'
          : 'Only these pincodes. Use the first digits to cover an area: 5000 covers 500001–500099.'}
      </Caption>
      {draft.serviceablePincodePrefixes.length > 0 ? (
        <View style={styles.chips}>
          {draft.serviceablePincodePrefixes.map((prefix) => (
            <Touchable key={prefix} onPress={() => removeArea(prefix)} accessibilityLabel={`Remove ${prefix}`} style={styles.chip}>
              <Body style={styles.chipText}>{prefix}</Body>
              <Ionicons name="close" size={14} color={colors.ink600} />
            </Touchable>
          ))}
        </View>
      ) : null}
      <Row gap={space.sm} align="flex-start">
        <Field
          placeholder="Enter a pincode"
          value={newArea}
          onChangeText={(value) => { setNewArea(value); setAreaError(null); }}
          keyboardType="number-pad"
          maxLength={6}
          accessibilityLabel="Pincode to deliver to"
          error={areaError}
          containerStyle={{ flex: 1 }}
        />
        <Button title="Add" variant="secondary" size="sm" full={false} onPress={addArea} style={styles.addArea} />
      </Row>

      <Alert message={saveMessage} />

      <DeliveryMethodEditor
        visible={Boolean(editing)}
        method={editingMethod}
        origin={origin}
        canRemove={editing?.index !== -1 && draft.methods.length > 1}
        onDone={applyMethod}
        onRemove={removeMethod}
        onClose={() => setEditing(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: space.lg },
  heading: { marginTop: space.md },
  intro: { marginTop: space.xs, marginBottom: space.md },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.accent50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  link: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.sm },
  linkText: { color: colors.accent700, fontWeight: '600' },
  method: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    marginBottom: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    minHeight: 72,
  },
  methodOff: { opacity: 0.6 },
  add: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48, marginBottom: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    minHeight: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.sunken,
  },
  chipText: { fontSize: 14 },
  addArea: { marginTop: 9 },
});
