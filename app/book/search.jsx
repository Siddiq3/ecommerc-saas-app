import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen.jsx';
import { Body, Caption, Card, Divider, EmptyState, Touchable } from '../../src/components/ui.jsx';
import { SearchBar } from '../../src/components/Filters.jsx';
import { CATEGORY_LABELS, KIND_LABELS, MODE_LABELS, entryLabel } from '../../src/components/book.jsx';
import { itemsSummary } from '../../src/components/BillItems.jsx';
import { msg } from '../../src/lib/i18n.js';
import { searchEntries } from '../../src/lib/bookQueries.js';
import { formatDate, formatMoney } from '../../src/lib/format.js';
import { useBook } from '../../src/state/book.jsx';
import { useT } from '../../src/state/locale.jsx';
import { colors, space, type } from '../../src/theme.js';

/**
 * Search the whole book, every day at once: a customer's or supplier's name, a bill number,
 * an item, a note, an expense name, or an amount ("250"). Works offline: it reads the phone's
 * own copy.
 */
export default function BookSearch() {
  const t = useT();
  const router = useRouter();
  const { db, version } = useBook();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);

  useEffect(() => {
    if (!db) return undefined;
    let live = true;
    // A short pause so a search runs once the shopkeeper stops typing, not on every letter.
    const timer = setTimeout(() => {
      searchEntries(db, query).then((rows) => { if (live) setResults(query.trim() ? rows : null); }).catch(() => undefined);
    }, 200);
    return () => { live = false; clearTimeout(timer); };
  }, [db, query, version]);

  const titleOf = (e) => e.partyName
    ?? (e.kind === 'expense' ? e.label ?? t(CATEGORY_LABELS[e.category] ?? 'Other') : null)
    ?? itemsSummary(t, e.items)
    ?? e.note
    ?? t(KIND_LABELS[e.kind]);

  return (
    <Screen>
      <SearchBar value={query} onChange={setQuery} placeholder={msg('Name, bill number, item or amount')} autoFocus />
      {!results ? (
        <Caption style={styles.hint}>{t('Search every bill, payment and expense by name, bill number, item, note or amount.')}</Caption>
      ) : !results.length ? (
        <EmptyState icon="🔎" title={t('Nothing found for “{query}”', { query: query.trim() })} message={t('Try a shorter word, or the amount without ₹.')} />
      ) : (
        <>
          <Caption style={styles.count}>{t(results.length === 1 ? '{n} entry' : '{n} entries', { n: results.length })}</Caption>
          <Card padded={false}>
            {results.map((e, i) => {
              const out = e.kind === 'expense';
              const detail = [
                formatDate(`${e.date}T00:00:00`, undefined, { day: 'numeric', month: 'short', year: 'numeric' }),
                e.partyName ? entryLabel(t, e, e.partyType === 'supplier') : null,
                e.billNo ? t('Bill no {no}', { no: e.billNo }) : null,
                e.mode ? t(MODE_LABELS[e.mode]) : null,
              ].filter(Boolean).join(' · ');
              return (
                <View key={e.entryId}>
                  {i ? <Divider /> : null}
                  <Touchable onPress={() => router.push({ pathname: '/book/entry', params: { entryId: e.entryId } })} style={styles.row}
                    accessibilityLabel={`${titleOf(e)}, ${detail}, ${out ? '− ' : ''}${formatMoney(e.amount)}`}>
                    <View style={{ flex: 1 }}>
                      <Body numberOfLines={2}>{titleOf(e)}</Body>
                      <Caption numberOfLines={2}>{detail}</Caption>
                      {e.note && e.note !== titleOf(e) ? <Caption numberOfLines={1} style={{ color: colors.ink700 }}>{e.note}</Caption> : null}
                    </View>
                    <Body style={[type.money, out && { color: colors.danger }]} numberOfLines={1}>{out ? '− ' : ''}{formatMoney(e.amount)}</Body>
                  </Touchable>
                </View>
              );
            })}
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hint: { marginTop: space.md, color: colors.ink600 },
  count: { marginTop: space.md, marginBottom: space.sm, color: colors.ink600 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 60 },
});
