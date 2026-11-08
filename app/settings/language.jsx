import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../src/components/Screen.jsx';
import { Body, Caption, Card, Divider, Touchable } from '../../src/components/ui.jsx';
import { useLocale } from '../../src/state/locale.jsx';
import { LANGUAGES } from '../../src/lib/i18n.js';
import { colors, radius, space } from '../../src/theme.js';

export default function LanguageSettings() {
  const { locale, setLocale, t } = useLocale();

  return (
    <Screen>
      <Card padded={false} style={styles.card}>
        {LANGUAGES.map((lang, i) => (
          <View key={lang.code}>
            {i ? <Divider /> : null}
            <Touchable
              onPress={() => setLocale(lang.code)}
              style={styles.row}
              accessibilityRole="radio"
              accessibilityState={{ checked: lang.code === locale }}
              accessibilityLabel={lang.code === 'en' ? lang.name : `${lang.name}, ${lang.english}`}
            >
              <View style={styles.text}>
                <Body strong={lang.code === locale}>{lang.name}</Body>
                {lang.code === 'en' ? null : <Caption>{lang.english}</Caption>}
              </View>
              {lang.code === locale ? <Ionicons name="checkmark" size={20} color={colors.accent600} /> : null}
            </Touchable>
          </View>
        ))}
      </Card>
      {locale === 'en' ? null : (
        <Caption style={styles.note}>{t('Some screens are still in English while we finish translating.')}</Caption>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden', borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 54 },
  text: { flex: 1, gap: 2 },
  note: { marginTop: space.lg, textAlign: 'center' },
});
