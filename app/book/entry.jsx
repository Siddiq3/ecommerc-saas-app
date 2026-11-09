import { useEffect, useState } from 'react';
import { Alert as RNAlert, StyleSheet } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { toMajor } from '@storekit/shared';
import { bookEntrySchema, rupeesText } from '@storekit/validation';
import { Screen } from '../../src/components/Screen.jsx';
import { Alert, Body, Button, Caption, Field, SelectField, Touchable } from '../../src/components/ui.jsx';
import { FilterChips } from '../../src/components/Filters.jsx';
import { CATEGORY_LABELS, KIND_LABELS, MODE_LABELS, PartyPicker } from '../../src/components/book.jsx';
import { dayKey } from '../../src/lib/book.js';
import { msg } from '../../src/lib/i18n.js';
import { readEntry } from '../../src/lib/bookQueries.js';
import { formatDate } from '../../src/lib/format.js';
import { newBookId, useBook } from '../../src/state/book.jsx';
import { useToast } from '../../src/components/Toast.jsx';
import { useT } from '../../src/state/locale.jsx';
import { useAction } from '../../src/lib/useAsync.js';
import { colors, space, type } from '../../src/theme.js';

const amountField = rupeesText('Amount');
const chips = (labels, keys) => keys.map((value) => ({ value, label: labels[value] }));
const TITLES = {
  sale: msg('New bill'), expense: msg('New expense'), collection: msg('Payment received'),
  opening: msg('Starting cash'), due: msg('Old dues'),
};

/**
 * One entry: a bill, an expense, a payment received, starting cash or old dues. The amount
 * comes first and is focused, because it is the one thing every entry needs.
 */
export default function BookEntry() {
  const t = useT();
  const router = useRouter();
  const navigation = useNavigation();
  const toast = useToast();
  const params = useLocalSearchParams();
  const { db, saveEntry, deleteEntry } = useBook();

  const [existing, setExisting] = useState(null);
  const [kind, setKind] = useState(String(params.kind ?? 'sale'));
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState(params.mode ? String(params.mode) : 'cash');
  const [category, setCategory] = useState(null);
  const [party, setParty] = useState(params.partyId ? { partyId: String(params.partyId), name: String(params.partyName ?? '') } : null);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(String(params.date ?? dayKey()));
  const [picking, setPicking] = useState(false);
  const [errors, setErrors] = useState({});

  // Editing: load the entry and its customer's name.
  useEffect(() => {
    if (!db || !params.entryId) return;
    readEntry(db, String(params.entryId)).then(async (e) => {
      if (!e) return;
      setExisting(e);
      setKind(e.kind);
      setAmount(String(toMajor(e.amount)));
      setMode(e.mode ?? 'cash');
      setCategory(e.category);
      setNote(e.note ?? '');
      setDate(e.date);
      if (e.partyId) {
        const p = await db.getFirstAsync('SELECT partyId, name FROM parties WHERE partyId = ?', [e.partyId]);
        setParty(p ?? { partyId: e.partyId, name: '' });
      }
    });
  }, [db, params.entryId]);

  useEffect(() => {
    navigation.setOptions?.({ title: existing ? t('Edit {kind}', { kind: t(KIND_LABELS[kind]).toLowerCase() }) : t(TITLES[kind] ?? 'New bill') });
  }, [navigation, existing, kind, t]);

  const modes = kind === 'sale' ? ['cash', 'upi', 'credit'] : ['cash', 'upi'];
  const hasMode = kind === 'sale' || kind === 'expense' || kind === 'collection';
  const needsParty = kind === 'collection' || kind === 'due' || (kind === 'sale' && mode === 'credit');
  const showParty = needsParty || kind === 'sale';

  const { run: save, pending: saving, error: saveError } = useAction(async () => {
    const parsed = amountField.safeParse(amount);
    if (!parsed.success) { setErrors({ amount: t('Enter an amount, like 250 or 99.50') }); return; }
    const entry = {
      entryId: existing?.entryId ?? newBookId(),
      kind,
      date,
      amount: parsed.data,
      ...(hasMode ? { mode: modes.includes(mode) ? mode : 'cash' } : {}),
      ...(showParty && party ? { partyId: party.partyId } : {}),
      ...(kind === 'expense' && category ? { category } : {}),
      ...(note.trim() ? { note } : {}),
      updatedAt: new Date().toISOString(),
    };
    const result = bookEntrySchema.safeParse(entry);
    if (!result.success) {
      const next = Object.fromEntries(result.error.issues.map((i) => [i.path[0], i.message]));
      setErrors({
        ...next,
        ...(next.partyId ? { partyId: t('Choose the customer') } : {}),
        ...(next.category ? { category: t('Choose what the expense was for') } : {}),
        ...(next.amount ? { amount: t('Enter an amount, like 250 or 99.50') } : {}),
      });
      return;
    }
    await saveEntry(result.data);
    toast.success(existing ? t('Saved') : t('{kind} added', { kind: t(KIND_LABELS[kind]) }));
    router.back();
  });

  const { run: deleteSaved, pending: deleting, error: deleteError } = useAction(async () => {
    await deleteEntry(existing);
    router.back();
  });

  const remove = () => RNAlert.alert(t('Delete this entry?'), t('It is removed from the book and the khata on every phone.'), [
    { text: t('Keep'), style: 'cancel' },
    { text: t('Delete'), style: 'destructive', onPress: () => deleteSaved().catch(() => undefined) },
  ]);

  return (
    <Screen footer={<Button title={existing ? t('Save changes') : t('Save')} size="lg" loading={saving} disabled={!db || deleting || (Boolean(params.entryId) && !existing)} onPress={() => save().catch(() => undefined)} />}>
      <Alert message={saveError || deleteError ? t('Something went wrong. Try again.') : null} />
      {!existing && ['sale', 'expense', 'collection'].includes(kind) ? (
        <FilterChips
          options={chips(KIND_LABELS, ['sale', 'expense', 'collection'])}
          value={kind}
          onChange={(k) => { setKind(k); setErrors({}); if (k !== 'sale' && mode === 'credit') setMode('cash'); }}
          style={styles.kinds}
        />
      ) : null}

      <Field
        label={t('Amount')}
        value={amount}
        onChangeText={(v) => { setAmount(v); setErrors((e) => ({ ...e, amount: undefined })); }}
        placeholder="0"
        keyboardType="decimal-pad"
        prefix="₹"
        autoFocus={!params.entryId}
        style={styles.amount}
        error={errors.amount}
      />

      {hasMode ? (
        <>
          <Caption style={styles.label}>{kind === 'expense' ? t('Paid by') : t('Paid by customer')}</Caption>
          <FilterChips options={chips(MODE_LABELS, modes)} value={mode} onChange={setMode} style={styles.chips} />
          {kind === 'sale' && mode === 'credit' ? (
            <Caption style={styles.creditHint}>{t('Goes into the customer’s khata. Not counted as cash today.')}</Caption>
          ) : null}
        </>
      ) : null}

      {kind === 'expense' ? (
        <>
          <Caption style={[styles.label, errors.category && { color: colors.danger }]}>{errors.category ?? t('What for')}</Caption>
          <FilterChips options={chips(CATEGORY_LABELS, Object.keys(CATEGORY_LABELS))} value={category} onChange={setCategory} style={styles.chips} />
        </>
      ) : null}

      {showParty ? (
        <SelectField
          label={needsParty ? t('Customer') : t('Customer (optional)')}
          value={party?.name}
          placeholder={t('Choose customer')}
          onPress={() => setPicking(true)}
          error={errors.partyId}
        />
      ) : null}

      <Field label={t('Note (optional)')} value={note} onChangeText={setNote} placeholder={t('Items, bill number, anything')} maxLength={200} />

      <Caption>{t('For {date}', { date: formatDate(`${date}T00:00:00`, undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) })}</Caption>

      {existing ? (
        <Touchable onPress={remove} disabled={saving || deleting} style={styles.delete}>
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
          <Body style={{ color: colors.danger }}>{t('Delete this entry')}</Body>
        </Touchable>
      ) : null}

      <PartyPicker visible={picking} onClose={() => setPicking(false)} onPick={(p) => { setParty(p); setErrors((e) => ({ ...e, partyId: undefined })); }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  kinds: { marginBottom: space.md },
  amount: { ...type.figure, fontSize: 28 },
  label: { marginBottom: space.xs, color: colors.ink600 },
  chips: { marginBottom: space.md },
  creditHint: { color: colors.warning, marginTop: -space.sm, marginBottom: space.md },
  delete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingVertical: space.xl },
});
