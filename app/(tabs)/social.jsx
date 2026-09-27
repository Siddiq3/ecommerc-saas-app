import { StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../../src/components/Screen.jsx';
import { Body, Button, Caption, Card, Display, Heading, Pill } from '../../src/components/ui.jsx';
import { FadeIn } from '../../src/components/motion.jsx';
import { useToast } from '../../src/components/Toast.jsx';
import { useAuth } from '../../src/state/auth.jsx';
import { storeUrl as storeAddress } from '../../src/lib/storefront.js';
import { colors, radius, space } from '../../src/theme.js';

/**
 * Social: Instagram selling, announced before it exists.
 *
 * Nothing here connects to Instagram. The screen says what is coming, and offers the one
 * thing that already works today — putting the store link in the Instagram bio.
 */

const STEPS = [
  {
    icon: 'pricetags-outline',
    title: 'Pick products for a post',
    body: 'Choose items from your catalogue when you share a post or reel.',
  },
  {
    icon: 'chatbubble-ellipses-outline',
    title: 'Answer “price?” for you',
    body: 'Followers who ask about a product get its link, so you don’t have to reply to each one.',
  },
  {
    icon: 'stats-chart-outline',
    title: 'Learn what sells',
    body: 'See which posts bring people to your store — and which ones turn into orders.',
  },
];

export default function Social() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { business } = useAuth();
  const link = business?.slug ? storeAddress(business.slug) : null;

  const copyLink = async () => {
    await Clipboard.setStringAsync(link);
    toast.success('Store link copied');
  };

  return (
    <Screen contentStyle={{ paddingTop: insets.top + space.md }}>
      <Display style={styles.title}>Social</Display>

      <FadeIn>
        <Card style={styles.hero}>
          <View style={styles.connect}>
            <View style={[styles.node, styles.nodeInstagram]}>
              <Ionicons name="logo-instagram" size={28} color="#ffffff" />
            </View>
            <View style={styles.dots}>
              {[0, 1, 2].map((i) => <View key={i} style={styles.dot} />)}
              <View style={styles.linkBadge}>
                <Ionicons name="link" size={14} color={colors.accent700} />
              </View>
              {[0, 1, 2].map((i) => <View key={`b${i}`} style={styles.dot} />)}
            </View>
            <View style={[styles.node, styles.nodeStore]}>
              <Ionicons name="storefront" size={26} color={colors.accent700} />
            </View>
          </View>

          <Pill label="Coming soon" tone="accent" style={styles.soon} />
          <Heading style={styles.heroTitle}>Sell straight from your Instagram</Heading>
          <Body muted style={styles.heroBody}>
            Link your Instagram to StoreKit and let your posts do the selling.
          </Body>
        </Card>
      </FadeIn>

      <FadeIn delay={80}>
        <Caption style={styles.section}>HOW IT WILL WORK</Caption>
        <Card style={styles.steps}>
          {STEPS.map((step, i) => (
            <View key={step.title} style={styles.step}>
              <View style={styles.rail}>
                <View style={styles.stepIcon}>
                  <Ionicons name={step.icon} size={18} color={colors.accent700} />
                </View>
                {i < STEPS.length - 1 ? <View style={styles.railLine} /> : null}
              </View>
              <View style={styles.stepText}>
                <Body strong>{step.title}</Body>
                <Caption style={styles.stepBody}>{step.body}</Caption>
              </View>
            </View>
          ))}
        </Card>
      </FadeIn>

      {link ? (
        <FadeIn delay={160}>
          <Caption style={styles.section}>WHILE YOU WAIT</Caption>
          <Card>
            <Body strong>Add your store to your bio</Body>
            <Caption style={styles.stepBody}>
              Put your store link in your Instagram bio so followers can shop any time.
            </Caption>
            <View style={styles.linkBox}>
              <Caption numberOfLines={1} selectable style={{ flex: 1 }}>{link}</Caption>
            </View>
            <Button
              title="Copy store link"
              icon={<Ionicons name="copy-outline" size={18} color="#ffffff" />}
              onPress={() => copyLink().catch(() => toast.error('Could not copy the link'))}
            />
          </Card>
        </FadeIn>
      ) : null}
    </Screen>
  );
}

const NODE = 56;

const styles = StyleSheet.create({
  title: { fontSize: 28, marginBottom: space.lg },

  hero: { alignItems: 'center', paddingVertical: space.xl, marginBottom: space.xl },
  connect: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xl },
  node: { width: NODE, height: NODE, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  nodeInstagram: { backgroundColor: colors.accent600 },
  nodeStore: { backgroundColor: colors.accent50, borderWidth: 1.5, borderColor: colors.accent200 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.accent200 },
  linkBadge: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accent200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soon: { alignSelf: 'center', marginBottom: space.sm },
  heroTitle: { textAlign: 'center', fontSize: 21 },
  heroBody: { textAlign: 'center', marginTop: space.xs, maxWidth: 300 },

  section: { marginBottom: space.sm, letterSpacing: 0.8, color: colors.ink500 },
  steps: { marginBottom: space.xl },
  step: { flexDirection: 'row', gap: space.md },
  rail: { alignItems: 'center' },
  stepIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.accent50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  railLine: { width: 2, flex: 1, minHeight: space.md, backgroundColor: colors.line, marginVertical: space.xs },
  stepText: { flex: 1, paddingBottom: space.lg, paddingTop: space.xs },
  stepBody: { marginTop: 2 },
  linkBox: {
    backgroundColor: colors.sunken,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    marginVertical: space.md,
  },
});
