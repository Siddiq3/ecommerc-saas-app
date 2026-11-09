import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../src/components/Screen.jsx';
import { Body, Button, Caption, Card, Divider, EmptyState, Figure, Touchable } from '../../src/components/ui.jsx';
import { SearchBar } from '../../src/components/Filters.jsx';
import { DueAmount, PartyPicker, SyncBadge } from '../../src/components/book.jsx';
import { msg } from '../../src/lib/i18n.js';
import { readParties } from '../../src/lib/bookQueries.js';
import { formatMoney } from '../../src/lib/format.js';
import { useBookQuery } from '../../src/state/book.jsx';
import { useT } from '../../src/state/locale.jsx';
import { colors, space } from '../../src/theme.js';

/** The khata: everyone who owes the shop, largest dues first, and the total to collect. */
export default function Khata() {
  const t = useT();
  const router = useRouter();
  const parties = useBookQuery((db) => readParties(db));
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);

  const owing = (parties ?? []).filter((p) => p.balance > 0);
  const totalDue = owing.reduce((sum, p) => sum + p.balance, 0);
  const needle = search.trim().toLowerCase();
  const shown = (parties ?? []).filter((p) => !needle || p.name.toLowerCase().includes(needle) || (p.mobile ?? '').includes(needle));

  return (
    <Screen
      footer={<Button title={t('Add customer')} icon={<Ionicons name="person-add" size={18} color="#ffffff" />} onPress={() => setAdding(true)} />}
    >
      <Card style={styles.total}>
        <Caption>{t('To collect')}</Caption>
        <Figure style={styles.totalFigure}>{formatMoney(totalDue)}</Figure>
        <Caption>{t('{n} customers owe you', { n: owing.length })}</Caption>
      </Card>
      <SyncBadge />

      {parties && !parties.length ? (
        <EmptyState
          icon="📒"
          title={t('No customers in your khata yet')}
          message={t('Add a customer, or choose Credit when you write a bill. Their dues add up here.')}
        />
      ) : (
        <>
          {(parties?.length ?? 0) > 6 ? <SearchBar value={search} onChange={setSearch} placeholder={msg('Search customers')} /> : null}
          <Card padded={false}>
            {shown.map((p, i) => (
              <View key={p.partyId}>
                {i ? <Divider /> : null}
                <Touchable onPress={() => router.push(`/khata/${p.partyId}`)} style={styles.row} accessibilityLabel={p.name}>
                  <View style={{ flex: 1 }}>
                    <Body strong numberOfLines={1}>{p.name}</Body>
                    {p.mobile ? <Caption>+91 {p.mobile}</Caption> : null}
                  </View>
                  <DueAmount balance={p.balance} />
                  <Ionicons name="chevron-forward" size={17} color={colors.ink400} />
                </Touchable>
              </View>
            ))}
          </Card>
        </>
      )}

      <PartyPicker addOnly visible={adding} onClose={() => setAdding(false)} onPick={(p) => router.push(`/khata/${p.partyId}`)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  total: { alignItems: 'center', gap: 2 },
  totalFigure: { fontSize: 32, color: colors.danger },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 56 },
});
