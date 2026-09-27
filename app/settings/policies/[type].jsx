import { useEffect, useState } from 'react';
import { Alert as RNAlert, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../../src/components/Screen.jsx';
import {
  Alert, Body, Button, Caption, Card, ErrorState, Field, Toggle, Touchable,
} from '../../../src/components/ui.jsx';
import { SkeletonCard } from '../../../src/components/Skeleton.jsx';
import { useToast } from '../../../src/components/Toast.jsx';
import { useAuth } from '../../../src/state/auth.jsx';
import { useAction, useAsync } from '../../../src/lib/useAsync.js';
import { POLICY_DOCUMENTS, POLICY_MAX_CHARS, documentSave } from '../../../src/lib/policies.js';
import { policies as policiesApi } from '../../../src/api/endpoints.js';
import { colors, fonts, space } from '../../../src/theme.js';

/**
 * One policy document: whether customers see it, and its text.
 *
 * "Reset to standard template" only fills the editor with StoreKit's text for this store's
 * current settings; nothing is saved until Save is pressed, and leaving asks first.
 */
export default function PolicyEditor() {
  const { type } = useLocalSearchParams();
  const navigation = useNavigation();
  const toast = useToast();
  const { businessId } = useAuth();
  const known = Object.hasOwn(POLICY_DOCUMENTS, type);

  const { data, error, loading, reload } = useAsync(
    () => (businessId && known ? policiesApi.get(businessId) : Promise.resolve(null)),
    [businessId, type],
  );

  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState(null);
  const [formError, setFormError] = useState(null);
  useEffect(() => {
    if (!data || draft) return;
    const doc = data.documents[type];
    const initial = { enabled: doc.enabled, content: doc.content ?? '' };
    setSaved(initial);
    setDraft(initial);
  }, [data, draft, type]);

  const title = data?.documents?.[type]?.title ?? POLICY_DOCUMENTS[type]?.title ?? 'Policy';
  const dirty = Boolean(saved && draft) && (saved.enabled !== draft.enabled || saved.content !== draft.content);

  const { run: save, pending: saving, error: saveError, clearError } = useAction(async () => {
    const result = documentSave(type, saved, draft);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    if (!result.patch) return;
    const next = (await policiesApi.update(businessId, result.patch)).documents[type];
    const clean = { enabled: next.enabled, content: next.content ?? '' };
    setSaved(clean);
    setDraft(clean);
    toast.success(`${title} saved`);
  });

  const { run: reset, pending: resetting } = useAction(async () => {
    const template = await policiesApi.template(businessId, type);
    setDraft((prev) => ({ ...prev, content: template.content }));
    setFormError(null);
    toast.success('Template added. Review it, then save.');
  });

  const confirmReset = () =>
    RNAlert.alert(
      'Reset to standard template?',
      'The text in the editor will be replaced with StoreKit’s template, written from your store’s current settings. Nothing is saved until you press Save.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: () => reset().catch((err) => toast.error(err?.message ?? 'Could not load the template')) },
      ],
    );

  /* Title and Save in the header. */
  useEffect(() => {
    navigation.setOptions?.({
      title,
      headerRight: () => (
        <Touchable
          onPress={saving || !dirty ? undefined : () => save().catch(() => undefined)}
          accessibilityLabel="Save"
          accessibilityState={{ disabled: saving || !dirty }}
          style={styles.headerSave}
        >
          <Body strong style={{ color: dirty && !saving ? colors.accent700 : colors.ink400 }}>{saving ? 'Saving…' : 'Save'}</Body>
        </Touchable>
      ),
    });
  }, [navigation, title, dirty, saving, save]);

  /* Leaving with unsaved edits asks first, as the store details screen does. */
  useEffect(() => {
    navigation.setOptions?.({ gestureEnabled: !dirty });
    if (!dirty) return undefined;
    return navigation.addListener('beforeRemove', (event) => {
      event.preventDefault();
      RNAlert.alert('Discard your changes?', `Your changes to the ${title} have not been saved.`, [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(event.data.action) },
      ]);
    });
  }, [dirty, navigation, title]);

  if (!known) return <ErrorState error={{ message: 'That policy does not exist.' }} />;
  if (loading && !draft) {
    return (
      <Screen>
        <SkeletonCard lines={2} />
        <View style={{ height: space.lg }} />
        <SkeletonCard lines={8} />
      </Screen>
    );
  }
  if (error && !draft) return <ErrorState error={error} onRetry={reload} />;
  if (!draft) return null;

  const change = (key) => (value) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setFormError(null);
    if (saveError) clearError();
  };
  const saveMessage = saveError
    ? saveError.status === 0
      ? 'Unable to save changes. Please check your internet connection and try again.'
      : saveError.details?.[0]?.message ?? saveError.message
    : null;

  return (
    <Screen footer={<Button title="Save" loading={saving} disabled={!dirty} onPress={() => save().catch(() => undefined)} />}>
      <Card style={styles.card}>
        <Toggle
          label="Show on storefront"
          hint={draft.enabled ? 'Linked in your store’s footer.' : 'Hidden from customers.'}
          value={draft.enabled}
          onChange={change('enabled')}
        />
      </Card>

      <Button
        title="Reset to standard template"
        variant="secondary"
        size="sm"
        loading={resetting}
        icon={<Ionicons name="refresh" size={16} color={colors.ink800} />}
        onPress={confirmReset}
      />
      <Caption style={styles.note}>
        Review and customise the text for your business. You are responsible for what your policies say.
      </Caption>

      <Field
        label="Policy text"
        value={draft.content}
        onChangeText={change('content')}
        multiline
        textAlignVertical="top"
        autoCapitalize="sentences"
        maxLength={POLICY_MAX_CHARS}
        style={styles.editor}
        error={formError}
        hint={`${draft.content.length.toLocaleString('en-IN')} / ${POLICY_MAX_CHARS.toLocaleString('en-IN')} characters · ## for a heading, - for a list, **bold**`}
      />
      <Alert message={saveMessage} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: space.lg },
  note: { marginTop: space.sm, marginBottom: space.lg },
  headerSave: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.md },
  editor: { minHeight: 320, paddingTop: space.md, paddingBottom: space.md, fontFamily: fonts.regular, fontSize: 15.5, lineHeight: 23 },
});
