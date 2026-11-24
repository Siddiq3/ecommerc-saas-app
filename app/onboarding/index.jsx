import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StepScreen } from '../../src/components/StepScreen.jsx';
import { Body, Button, Caption, Touchable } from '../../src/components/ui.jsx';
import { Press, haptic } from '../../src/components/motion.jsx';
import { useAuth } from '../../src/state/auth.jsx';
import { useOnboarding } from '../../src/state/onboarding.jsx';
import { useT } from '../../src/state/locale.jsx';
import { msg } from '../../src/lib/i18n.js';
import { colors, radius, space } from '../../src/theme.js';

/**
 * Step 2 — what the app is for. The online store (a free trial, then a plan) or bills, khata and expenses only,
 * which are free and never lock. Khata only skips the store link, what-you-sell and design steps.
 */
const CHOICES = [
  {
    id: 'store',
    icon: 'storefront-outline',
    title: msg('Online store + bills & khata'),
    text: msg('Your own website to sell online, plus bills, khata and expenses. 3-day free trial.'),
  },
  {
    id: 'books',
    icon: 'book-outline',
    title: msg('Only bills, khata & expenses'),
    text: msg('No website. Bills, customer khata and expenses: free. Add a website later if you want.'),
  },
];

export default function Usage() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { draft, update } = useOnboarding();
  const t = useT();

  const next = () => router.push(draft.usage === 'books' ? '/onboarding/details' : '/onboarding/category');

  return (
    <StepScreen
      step={2}
      from={0.2}
      progress={0.3}
      title={t('How will you use StoreFlick?')}
      subtitle={t('You can change this later from Account.')}
      footer={<Button title={t('Continue')} size="lg" disabled={!draft.usage} onPress={next} />}
    >
      <View style={styles.list}>
        {CHOICES.map((c) => {
          const selected = draft.usage === c.id;
          return (
            <Press
              key={c.id}
              onPress={() => { haptic.select(); update('usage', c.id); }}
              haptics={null}
              scaleTo={0.98}
              style={[styles.card, selected && styles.cardSelected]}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${t(c.title)}. ${t(c.text)}`}
            >
              <View style={styles.icon}><Ionicons name={c.icon} size={26} color={colors.accent700} /></View>
              <View style={{ flex: 1, gap: 4 }}>
                <Body strong>{t(c.title)}</Body>
                <Caption>{t(c.text)}</Caption>
              </View>
              <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={22} color={selected ? colors.accent600 : colors.ink400} />
            </Press>
          );
        })}
      </View>

      <Touchable onPress={signOut} haptics={null} scaleTo={1} style={styles.signOut} accessibilityLabel={t('Sign out')}>
        <Caption style={styles.signOutText}>{t('Not you? Sign out')}</Caption>
      </Touchable>
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.md },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  cardSelected: { borderWidth: 2, borderColor: colors.accent600, backgroundColor: colors.accent50, padding: space.lg - 1 },
  icon: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.accent50, alignItems: 'center', justifyContent: 'center' },
  signOut: { alignSelf: 'center', marginTop: space.xl, minHeight: 44, justifyContent: 'center', paddingHorizontal: space.lg },
  signOutText: { color: colors.ink500 },
});
