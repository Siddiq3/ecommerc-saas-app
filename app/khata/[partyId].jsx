import { useEffect, useState } from 'react';
import { Alert as RNAlert, Linking, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { bookPartySchema } from '@storekit/validation';
import { Screen } from '../../src/components/Screen.jsx';
import { Alert, Body, Button, Caption, Card, Divider, Field, Row, Touchable } from '../../src/components/ui.jsx';
import { Sheet } from '../../src/components/Sheet.jsx';
import { DueAmount, KIND_LABELS, MODE_LABELS, SectionTitle } from '../../src/components/book.jsx';
import { readParty } from '../../src/lib/bookQueries.js';
import { formatDate, formatMoney } from '../../src/lib/format.js';
import { useAuth } from '../../src/state/auth.jsx';
import { useBook, useBookQuery } from '../../src/state/book.jsx';
import { useT } from '../../src/state/locale.jsx';
import { useAction } from '../../src/lib/useAsync.js';
import { colors, space, type } from '../../src/theme.js';

/**
 * One customer's khata: what they owe, every credit bill and payment, and a reminder that
 * is one tap away: a call, or WhatsApp with the amount already written.
 */
export default function KhataCustomer() {
  const t = useT();
  const router = useRouter();
  const navigation = useNavigation();
  const { partyId } = useLocalSearchParams();
  const { business } = useAuth();
  const { saveParty } = useBook();
  const party = useBookQuery((db) => readParty(db, String(partyId)), [partyId]);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (party) navigation.setOptions?.({ title: party.name });
  }, [party, navigation]);

  const { run: saveEdit, pending: saving, error: saveError } = useAction(async () => {
    const next = { partyId: party.partyId, name, ...(mobile.trim() ? { mobile } : {}), ...(party.note ? { note: party.note } : {}), updatedAt: new Date().toISOString() };
    const result = bookPartySchema.safeParse(next);
    if (!result.success) { setErrors(Object.fromEntries(result.error.issues.map((i) => [i.path[0], i.message]))); return; }
    await saveParty(result.data);
    setEditing(false);
  });

  if (!party) return <Screen />;

  const open = (params) => router.push({ pathname: '/book/entry', params: { partyId: party.partyId, partyName: party.name, ...params } });

  const call = () => Linking.openURL(`tel:+91${party.mobile}`).catch(() => undefined);

  const remind = () => {
    const text = t('Namaste {name}, {amount} is pending at {store}. Please pay when you can. Thank you!', {
      name: party.name, amount: formatMoney(party.balance), store: business?.name ?? '',
    });
    Linking.openURL(`https://wa.me/91${party.mobile}?text=${encodeURIComponent(text)}`).catch(() =>
      RNAlert.alert(t('WhatsApp not available'), t('Could not open WhatsApp on this device.')));
  };

  const startEdit = () => { setName(party.name); setMobile(party.mobile ?? ''); setErrors({}); setEditing(true); };

  return (
    <Screen
      footer={(
        <Row gap={space.sm}>
          <Button title={t('Gave on credit')} variant="secondary" full={false} style={{ flex: 1 }}
            onPress={() => open({ kind: 'sale', mode: 'credit' })} />
          <Button title={t('Got payment')} full={false} style={{ flex: 1 }}
            onPress={() => open({ kind: 'collection' })} />
        </Row>
      )}
    >
      <Card style={styles.head}>
        <Caption>{party.balance > 0 ? t('Owes you') : t('Balance')}</Caption>
        <DueAmount balance={party.balance} style={styles.balance} />
        {party.mobile ? <Caption>+91 {party.mobile}</Caption> : <Caption>{t('No mobile number. Add one to send reminders.')}</Caption>}
        <Touchable onPress={startEdit} style={styles.edit}>
          <Ionicons name="create-outline" size={16} color={colors.accent700} />
          <Caption style={{ color: colors.accent700 }}>{t('Edit name or number')}</Caption>
        </Touchable>
      </Card>

      {party.mobile ? (
        <Row gap={space.sm} style={styles.actions}>
          <Button title={t('Call')} variant="secondary" size="sm" full={false} style={{ flex: 1 }}
            icon={<Ionicons name="call-outline" size={16} color={colors.ink900} />} onPress={call} />
          <Button title={t('WhatsApp reminder')} variant="secondary" size="sm" full={false} style={{ flex: 1.4 }}
            icon={<Ionicons name="logo-whatsapp" size={16} color={colors.ink900} />} onPress={remind} disabled={party.balance <= 0} />
        </Row>
      ) : null}

      <SectionTitle title={t('History')} />
      {party.entries.length ? (
        <Card padded={false}>
          {party.entries.map((e, i) => {
            const owed = e.kind === 'due' || (e.kind === 'sale' && e.mode === 'credit');
            const paid = e.kind === 'collection';
            return (
              <View key={e.entryId}>
                {i ? <Divider /> : null}
                <Touchable onPress={() => router.push({ pathname: '/book/entry', params: { entryId: e.entryId } })} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Body>{e.kind === 'sale' && e.mode === 'credit' ? t('Credit bill') : t(KIND_LABELS[e.kind])}</Body>
                    <Caption numberOfLines={1}>
                      {formatDate(`${e.date}T00:00:00`, undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                      {paid && e.mode ? ` · ${t(MODE_LABELS[e.mode])}` : ''}
                      {e.note ? ` · ${e.note}` : ''}
                    </Caption>
                  </View>
                  <Body style={[type.money, { color: owed ? colors.danger : paid ? colors.success : colors.ink500 }]}>
                    {owed ? '+ ' : paid ? '− ' : ''}{formatMoney(e.amount)}
                  </Body>
                </Touchable>
              </View>
            );
          })}
        </Card>
      ) : (
        <Caption>{t('Nothing yet. Credit bills and payments for this customer show here.')}</Caption>
      )}
      {party.entries.length === 0 ? (
        <Button title={t('Add old dues from your paper khata')} variant="ghost" onPress={() => open({ kind: 'due' })} />
      ) : null}

      <Sheet visible={editing} onClose={() => { if (!saving) setEditing(false); }} title={t('Edit customer')}>
        <Alert message={saveError ? t('Something went wrong. Try again.') : null} />
        <Field label={t('Name')} value={name} onChangeText={setName} error={errors.name} maxLength={80} />
        <Field label={t('Mobile number (optional)')} value={mobile} onChangeText={setMobile} keyboardType="phone-pad" prefix="+91" maxLength={14} error={errors.mobile} />
        <Button title={t('Save')} loading={saving} onPress={() => saveEdit().catch(() => undefined)} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', gap: 4 },
  balance: { fontSize: 32 },
  edit: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: space.sm },
  actions: { marginTop: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 56 },
});
