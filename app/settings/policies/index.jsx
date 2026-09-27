import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../../src/components/Screen.jsx';
import {
  Alert, Body, Button, Caption, Card, ErrorState, Field, Heading, Pill, Toggle, Touchable,
} from '../../../src/components/ui.jsx';
import { SkeletonCard } from '../../../src/components/Skeleton.jsx';
import { useToast } from '../../../src/components/Toast.jsx';
import { useAuth } from '../../../src/state/auth.jsx';
import { useAction, useAsync, useRefreshOnFocus } from '../../../src/lib/useAsync.js';
import {
  RETURN_WINDOW_MAX_DAYS, documentRows, tradeFromForm, tradePreview, tradeToForm,
} from '../../../src/lib/policies.js';
import { policies as policiesApi } from '../../../src/api/endpoints.js';
import { colors, space } from '../../../src/theme.js';

/**
 * Store Policies: the return rule customers see, and the four policy documents.
 *
 * The return rule is saved with its own button. A document's visibility switch saves at once;
 * its text is edited on the next screen.
 */
export default function StorePolicies() {
  const router = useRouter();
  const toast = useToast();
  const { businessId } = useAuth();

  const { data, error, loading, reload, setData } = useAsync(
    () => (businessId ? policiesApi.get(businessId) : Promise.resolve(null)),
    [businessId],
  );
  // Back from the editor: show what it saved.
  useFocusEffect(useRefreshOnFocus(reload));

  const [trade, setTrade] = useState(null);
  const [tradeError, setTradeError] = useState(null);
  useEffect(() => {
    if (data && !trade) setTrade(tradeToForm(data.trade));
  }, [data, trade]);

  const tradeDirty = Boolean(data && trade) && JSON.stringify(trade) !== JSON.stringify(tradeToForm(data.trade));

  const { run: saveTrade, pending: savingTrade, error: saveError, clearError } = useAction(async () => {
    const result = tradeFromForm(trade);
    if (!result.ok) {
      setTradeError(result.error);
      return;
    }
    const saved = await policiesApi.update(businessId, result.patch);
    setData(saved);
    setTrade(tradeToForm(saved.trade));
    toast.success('Return policy saved');
  });

  const { run: setVisible, pending: switching } = useAction(async (type, enabled) => {
    const saved = await policiesApi.update(businessId, { documents: { [type]: { enabled } } });
    setData(saved);
    toast.success(enabled ? 'Shown on your store' : 'Hidden from your store');
  });

  if (loading && !data) {
    return (
      <Screen>
        <SkeletonCard lines={3} />
        <View style={{ height: space.lg }} />
        <SkeletonCard lines={4} />
      </Screen>
    );
  }
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data || !trade) return null;

  const changeTrade = (key) => (value) => {
    setTrade((prev) => ({ ...prev, [key]: value }));
    setTradeError(null);
    if (saveError) clearError();
  };
  const preview = tradePreview(trade);

  return (
    <Screen>
      {/* ───── Product returns ───── */}
      <Heading style={styles.heading}>Product Returns</Heading>
      <Caption style={styles.intro}>Set the return rule shown to customers.</Caption>
      <Card style={styles.card}>
        <Toggle
          label="Product returns"
          hint={trade.returnsAllowed ? 'Customers can ask to return an item.' : 'Customers cannot return items.'}
          value={trade.returnsAllowed}
          onChange={changeTrade('returnsAllowed')}
        />
        {trade.returnsAllowed ? (
          <Field
            label="Return window (days)"
            placeholder="Enter days, like 7"
            value={trade.returnWindowDays}
            onChangeText={changeTrade('returnWindowDays')}
            keyboardType="number-pad"
            maxLength={3}
            hint={`Between 1 and ${RETURN_WINDOW_MAX_DAYS} days after delivery.`}
            error={tradeError}
            containerStyle={styles.days}
          />
        ) : null}
        {preview ? (
          <View style={styles.preview}>
            <Ionicons name="eye-outline" size={16} color={colors.ink600} />
            <Caption style={{ flex: 1 }}>Customers will see: <Body strong>{preview}</Body></Caption>
          </View>
        ) : null}
        <Alert message={saveError ? (saveError.status === 0 ? 'Unable to save. Please check your internet connection and try again.' : saveError.message) : null} />
        <Button
          title="Save return policy"
          size="sm"
          loading={savingTrade}
          disabled={!tradeDirty}
          onPress={() => saveTrade().catch(() => undefined)}
        />
      </Card>

      {/* ───── Documents ───── */}
      <Heading style={styles.heading}>Policy Documents</Heading>
      <Caption style={styles.intro}>
        Shown in your store’s footer. Each starts from a StoreKit template: review and customise it for your business.
      </Caption>
      {documentRows(data.documents).map((row) => (
        <Card key={row.type} style={styles.docCard}>
          <Toggle
            label={row.title}
            hint={row.enabled ? 'Shown on your store' : 'Hidden from customers'}
            value={row.enabled}
            disabled={switching}
            onChange={(enabled) => setVisible(row.type, enabled).catch((err) => toast.error(err?.details?.[0]?.message ?? err?.message ?? 'Could not save'))}
          />
          <Touchable
            onPress={() => router.push(`/settings/policies/${row.type}`)}
            accessibilityLabel={`Edit ${row.title}`}
            style={styles.editRow}
          >
            <Pill label={row.enabled ? 'Active' : 'Hidden'} tone={row.enabled ? 'green' : 'slate'} />
            <Body strong style={styles.editText}>Edit policy</Body>
            <Ionicons name="chevron-forward" size={18} color={colors.accent700} />
          </Touchable>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { marginTop: space.md },
  intro: { marginTop: space.xs, marginBottom: space.md },
  card: { marginBottom: space.lg, gap: space.sm },
  days: { marginTop: space.md, marginBottom: space.sm },
  preview: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs },
  docCard: { marginBottom: space.md, gap: space.xs },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
  editText: { flex: 1, textAlign: 'right', color: colors.accent700 },
});
