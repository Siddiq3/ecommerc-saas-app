import { Linking, Platform, Share, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../src/components/Screen.jsx';
import { Body, Button, Caption, Card, Figure, Loading, Row } from '../../src/components/ui.jsx';
import { GaveGotButtons, entryLabel, isSupplier, useBillPrinting } from '../../src/components/book.jsx';
import { readEntry, readPaidWithBill, readParty } from '../../src/lib/bookQueries.js';
import { ledgerSide } from '../../src/lib/book.js';
import { formatDate, formatMoney } from '../../src/lib/format.js';
import { useAuth } from '../../src/state/auth.jsx';
import { useBookQuery } from '../../src/state/book.jsx';
import { useT } from '../../src/state/locale.jsx';
import { colors, space } from '../../src/theme.js';

const readSaved = async (db, entryId) => {
  const entry = await readEntry(db, entryId);
  if (!entry) return null;
  const party = entry.partyId ? await readParty(db, entry.partyId) : null;
  return { party, entry: party?.entries.find((e) => e.entryId === entryId) ?? entry, paid: await readPaidWithBill(db, entry) };
};

/**
 * After a khata entry is written: the amount, the balance it leaves, a message ready to share
 * or SMS to the party, and one tap to add the next entry for them.
 */
export default function EntrySaved() {
  const t = useT();
  const router = useRouter();
  const { entryId } = useLocalSearchParams();
  const { business } = useAuth();
  const printing = useBillPrinting();
  const saved = useBookQuery((db) => readSaved(db, String(entryId)), [entryId]);

  if (!saved) return <Screen footer={<Button title={t('Done')} onPress={() => router.back()} />}><Loading /></Screen>;
  const { party, entry } = saved;

  const shareBill = () => printing.shareBill(entry, party?.name);
  const printReceipt = () => printing.printReceipt(entry, party?.name);


  // A bill with no customer: the amount, its PDF, and the next bill.
  if (!party) {
    return (
      <Screen footer={<Button title={t('Done')} size="lg" onPress={() => router.back()} />}>
        <View style={styles.hero}>
          <Ionicons name="checkmark-circle" size={64} color="#ffffff" />
          <Body strong style={styles.heroText}>{t('Transaction saved')}</Body>
          <Figure style={styles.heroAmount}>{formatMoney(entry.amount)}</Figure>
          {entry.billNo ? <Caption style={styles.heroText}>{t('Bill no {no}', { no: entry.billNo })}</Caption> : null}
        </View>
        <Row gap={space.sm} style={{ marginTop: space.lg }}>
          <Button title={t('Share bill')} variant="secondary" full={false} style={{ flex: 1 }} loading={printing.busy === 'share'}
            icon={<Ionicons name="document-text-outline" size={18} color={colors.ink900} />} onPress={shareBill} />
          <Button title={t('Print receipt')} variant="secondary" full={false} style={{ flex: 1 }} loading={printing.busy === 'print'}
            icon={<Ionicons name="print-outline" size={18} color={colors.ink900} />} onPress={printReceipt} />
        </Row>
        <Button title={t('New bill')} variant="ghost" onPress={() => router.replace({ pathname: '/book/entry', params: { kind: 'sale', date: entry.date } })} />
      </Screen>
    );
  }
  const supplier = isSupplier(party);
  const side = ledgerSide(entry, party.partyType);
  // The party's balance now, after anything saved with this entry (a part payment on a credit bill).
  const balance = party.balance;
  const vars = {
    store: business?.name ?? '',
    amount: formatMoney(entry.amount),
    date: formatDate(`${entry.date}T00:00:00`, undefined, { day: 'numeric', month: 'short', year: 'numeric' }),
    balance: balance < 0 ? t('Advance {amount}', { amount: formatMoney(-balance) }) : formatMoney(balance),
  };
  const rawMessage = supplier
    ? side === 'gave'
      ? t('{store}: paid {amount} on {date}. Balance: {balance}.', vars)
      : t('{store}: goods worth {amount} received on {date}. Balance: {balance}.', vars)
    : side === 'got'
      ? t('{store}: payment of {amount} received on {date}. Thank you! Balance due: {balance}.', vars)
      : t('{store}: {amount} added to your khata on {date}. Balance due: {balance}.', vars);

  // Every message starts "{store}: "; with no shop name loaded (offline, first start) drop the prefix.
  const message = rawMessage.replace(/^:\s*/, '');

  const share = () => Share.share({ message }).catch(() => undefined);
  // iOS wants `&body=`, Android `?body=`.
  const sms = () => Linking.openURL(`sms:+91${party.mobile}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(message)}`)
    .catch(() => undefined);
  const another = (params) => router.replace({
    pathname: '/book/entry',
    params: { partyId: party.partyId, partyName: party.name, simple: '1', ...(supplier ? { partyType: 'supplier' } : {}), ...params },
  });

  return (
    <Screen footer={<Button title={t('Done')} size="lg" onPress={() => router.back()} />}>
      <View style={styles.hero}>
        <Ionicons name="checkmark-circle" size={64} color="#ffffff" />
        <Body strong style={styles.heroText}>{t('Transaction saved')}</Body>
        <Figure style={styles.heroAmount}>{formatMoney(entry.amount)}</Figure>
        <Caption style={styles.heroText}>{entryLabel(t, entry, supplier)} · {party.name}</Caption>
      </View>

      <Card style={styles.message}>
        <Caption style={styles.label}>{t('Message for {name}', { name: party.name })}</Caption>
        <Body>{message}</Body>
        <Row gap={space.sm} style={{ marginTop: space.md }}>
          {party.mobile && !supplier ? (
            <Button title={t('SMS')} variant="secondary" size="sm" full={false} style={{ flex: 1 }}
              icon={<Ionicons name="chatbox-ellipses-outline" size={16} color={colors.ink900} />} onPress={sms} />
          ) : null}
          <Button title={t('Share')} variant="secondary" size="sm" full={false} style={{ flex: 1 }}
            icon={<Ionicons name="share-social-outline" size={16} color={colors.ink900} />} onPress={share} />
        </Row>
        {['sale', 'purchase', 'salesReturn', 'purchaseReturn'].includes(entry.kind) ? (
          <Row gap={space.sm}>
            <Button title={t('Share bill')} variant="ghost" size="sm" full={false} style={{ flex: 1 }} loading={printing.busy === 'share'}
              icon={<Ionicons name="document-text-outline" size={16} color={colors.accent700} />} onPress={shareBill} />
            <Button title={t('Print receipt')} variant="ghost" size="sm" full={false} style={{ flex: 1 }} loading={printing.busy === 'print'}
              icon={<Ionicons name="print-outline" size={16} color={colors.accent700} />} onPress={printReceipt} />
          </Row>
        ) : null}
      </Card>

      <Caption style={styles.anotherLabel}>{t('Add another transaction for {name}', { name: party.name })}</Caption>
      <Row gap={space.sm}>
        <View style={{ flex: 1 }}>
          <GaveGotButtons
            onGave={() => another(supplier ? { kind: 'expense', category: 'dealer' } : { kind: 'sale', mode: 'credit' })}
            onGot={() => another(supplier ? { kind: 'due' } : { kind: 'collection' })}
            gaveLabel={supplier ? t('Paid supplier') : t('Gave on credit')}
            gotLabel={supplier ? t('Got goods on credit') : t('Got payment')}
          />
        </View>
      </Row>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: space.xs, backgroundColor: colors.success, borderRadius: 16, paddingVertical: space.xl * 1.5, paddingHorizontal: space.lg },
  heroText: { color: '#ffffff', textAlign: 'center' },
  heroAmount: { color: '#ffffff', fontSize: 36 },
  message: { marginTop: space.lg },
  label: { color: colors.ink500, marginBottom: space.xs },
  anotherLabel: { textAlign: 'center', marginTop: space.xl, marginBottom: space.sm, color: colors.ink600 },
});
