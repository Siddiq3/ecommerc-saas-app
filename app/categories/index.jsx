import { useState } from 'react';
import { Alert as RNAlert, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createCategorySchema } from '@storekit/validation';
import { Screen } from '../../src/components/Screen.jsx';
import {
  Alert, Body, Button, Caption, Card, Divider, EmptyState, ErrorState, Field, Pill, Row, Touchable,
} from '../../src/components/ui.jsx';
import { SkeletonScreen } from '../../src/components/Skeleton.jsx';
import { Sheet } from '../../src/components/Sheet.jsx';
import { useAuth } from '../../src/state/auth.jsx';
import { useAction, useAsync } from '../../src/lib/useAsync.js';
import { check, mergeErrors } from '../../src/lib/validation.js';
import { categories as categoriesApi } from '../../src/api/endpoints.js';
import { colors, space } from '../../src/theme.js';

/**
 * Categories.
 *
 * Reordering is by arrows rather than drag-and-drop: a drag list is a gesture-handler
 * dependency and a fiddly target on a phone, for a list most stores will reorder twice.
 */
export default function Categories() {
  const { businessId } = useAuth();

  const [sheet, setSheet] = useState(null);
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [errors, setErrors] = useState({});

  const { data, loading, error, refreshing, onRefresh, reload, setData } = useAsync(
    () => (businessId ? categoriesApi.list(businessId) : Promise.resolve(null)),
    [businessId],
  );

  const items = data?.items ?? [];

  const { run: save, pending: saving, error: saveError } = useAction(async (data) => {
    if (editingId) await categoriesApi.update(businessId, editingId, data);
    else await categoriesApi.create(businessId, data);
    setSheet(null);
    setName('');
    setEditingId(null);
    setErrors({});
    await reload();
  });

  const submit = () => {
    // Only the name is editable here; the rest of the schema keeps its defaults.
    const result = check(createCategorySchema.pick({ name: true }), { name });
    setErrors(result.errors);
    if (result.ok) save(result.data).catch(() => undefined);
  };

  const { run: move } = useAction(async (categoryId, direction) => {
    const index = items.findIndex((c) => c.categoryId === categoryId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= items.length) return;

    const reordered = [...items];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

    // Optimistic: the list settles instantly and the server confirms behind it. A failed
    // reorder is cosmetic, and the next load corrects it.
    setData({ ...data, items: reordered });
    await categoriesApi
      .reorder(businessId, reordered.map((c, i) => ({ categoryId: c.categoryId, sortOrder: i })))
      .catch(() => reload());
  });

  const confirmDelete = (category) =>
    RNAlert.alert(
      `Delete "${category.name}"?`,
      'Products in it are kept, but they lose their category.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await categoriesApi.remove(businessId, category.categoryId).catch(() => undefined);
            reload();
          },
        },
      ],
    );

  if (loading && !data) return <SkeletonScreen />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;

  // The sheet sits beside the Screen, not inside its ScrollView: a Modal nested in a
  // pull-to-refresh scroller is a known way to get a sheet that never shows on Android.
  return (
    <>
      <Screen
        refreshing={refreshing}
        onRefresh={onRefresh}
        footer={
          <Button
            title="New category"
            onPress={() => { setEditingId(null); setName(''); setSheet('form'); }}
          />
        }
      >
        <Body muted style={styles.intro}>
          Categories group your products on your storefront. Customers see them in this order.
        </Body>

        {items.length ? (
          <Card padded={false} style={styles.card}>
            {items.map((category, index) => (
              <View key={category.categoryId}>
                {index > 0 ? <Divider /> : null}
                <Row style={styles.row}>
                  <View style={styles.arrows}>
                    <Touchable
                      onPress={() => move(category.categoryId, -1)}
                      disabled={index === 0}
                      accessibilityLabel="Move up"
                      style={styles.arrow}
                    >
                      <Ionicons name="chevron-up" size={16} color={index === 0 ? colors.ink200 : colors.ink600} />
                    </Touchable>
                    <Touchable
                      onPress={() => move(category.categoryId, 1)}
                      disabled={index === items.length - 1}
                      accessibilityLabel="Move down"
                      style={styles.arrow}
                    >
                      <Ionicons
                        name="chevron-down"
                        size={16}
                        color={index === items.length - 1 ? colors.ink200 : colors.ink600}
                      />
                    </Touchable>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Body strong>{category.name}</Body>
                    <Caption>{category.productCount ?? 0} product{category.productCount === 1 ? '' : 's'}</Caption>
                  </View>

                  {!category.active ? <Pill label="Hidden" tone="slate" /> : null}

                  <Touchable
                    onPress={() => { setEditingId(category.categoryId); setName(category.name); setSheet('form'); }}
                    accessibilityLabel={`Rename ${category.name}`}
                    style={styles.action}
                  >
                    <Ionicons name="pencil-outline" size={18} color={colors.ink600} />
                  </Touchable>
                  <Touchable
                    onPress={() => confirmDelete(category)}
                    accessibilityLabel={`Delete ${category.name}`}
                    style={styles.action}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </Touchable>
                </Row>
              </View>
            ))}
          </Card>
        ) : (
          <EmptyState
            icon="📁"
            title="No categories yet"
            message="Group your products so customers can find what they came for."
          />
        )}
      </Screen>

      <Sheet
        visible={sheet === 'form'}
        onClose={() => setSheet(null)}
        title={editingId ? 'Rename category' : 'New category'}
      >
        <Alert message={saveError && Object.keys(saveError.fieldErrors ?? {}).length === 0 ? saveError.message : null} />
        <Field
          label="Name"
          value={name}
          onChangeText={(v) => { setName(v); if (errors.name) setErrors({}); }}
          placeholder="Sarees"
          autoCapitalize="words"
          autoFocus
          maxLength={60}
          error={mergeErrors(errors, saveError).name}
        />
        <Button
          title={editingId ? 'Save' : 'Create category'}
          loading={saving}
          onPress={submit}
        />
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  intro: { marginBottom: space.lg },
  card: { overflow: 'hidden' },
  row: { paddingVertical: space.md, paddingHorizontal: space.md, gap: space.md },
  arrows: { gap: 2 },
  arrow: { width: 28, height: 22, alignItems: 'center', justifyContent: 'center' },
  action: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
