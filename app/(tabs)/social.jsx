import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../../src/components/Screen.jsx';
import { Body, Button, Caption, Card, Display, Row } from '../../src/components/ui.jsx';
import { FadeIn } from '../../src/components/motion.jsx';
import { useToast } from '../../src/components/Toast.jsx';
import { useAuth } from '../../src/state/auth.jsx';
import { InstagramPanel } from '../../src/components/InstagramPanel.jsx';
import { storeUrl as storeAddress } from '../../src/lib/storefront.js';
import { colors, radius, space, tones, type } from '../../src/theme.js';

/**
 * Social: Instagram Auto DM.
 *
 * The API says whether Instagram automation is switched on for this stage. Off, the screen announces it as coming
 * soon; on, it reads as a working feature: the connection panel, how it works, and the store link for the bio.
 */

const INSTAGRAM = '#e1306c';

const FEATURES = [
  {
    icon: 'chatbubble-outline',
    tint: tones.violet,
    title: 'Auto respond to product queries',
    body: 'Share product details and your store link instantly when someone asks about a product.',
  },
  {
    icon: 'link',
    tint: tones.blue,
    title: 'Get more store visits',
    body: 'Turn Instagram conversations into clicks and real customers.',
  },
  {
    icon: 'stats-chart',
    tint: tones.green,
    title: 'Works with your existing posts',
    body: 'No extra effort — just keep posting and let us handle the rest.',
  },
];

const STEPS = [
  { icon: 'logo-instagram', title: 'Connect Instagram', body: 'Use your Instagram Business or Creator account.' },
  { icon: 'pricetag-outline', title: 'Choose a post and a product', body: 'Pick a post or Reel, the product, and a word like LINK.' },
  { icon: 'paper-plane-outline', title: 'Customers get the link', body: 'When someone comments that word, we send them the product link in a private message.' },
];

/** A customer asks under a post; the store answers in their DMs with the product link. */
const ILLUSTRATION = require('../../assets/instagram-auto-dm.png');

export default function Social() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { business, businessId } = useAuth();
  const link = business?.slug ? storeAddress(business.slug) : null;
  // Off until the API says otherwise, so the screen never promises a feature this stage does not run.
  const [live, setLive] = useState(false);

  const copyLink = async () => {
    await Clipboard.setStringAsync(link);
    toast.success('Store link copied');
  };

  return (
    <Screen contentStyle={{ paddingTop: insets.top + space.md }}>
      <Row style={styles.header}>
        <Display style={styles.title}>Instagram Auto DM</Display>
        {live ? null : (
          <View style={styles.soon}>
            <Ionicons name="sparkles" size={13} color={colors.accent700} />
            <Text style={styles.soonText}>Coming soon</Text>
          </View>
        )}
      </Row>

      <InstagramPanel businessId={businessId} onEnabled={setLive} />

      {live ? (
        <FadeIn>
          <Body strong style={styles.howTitle}>How it works</Body>
          {STEPS.map((step, index) => (
            <Row key={step.title} gap={space.lg} align="flex-start" style={styles.feature}>
              <View style={[styles.featureIcon, { backgroundColor: colors.accent50 }]}>
                <Ionicons name={step.icon} size={22} color={colors.accent700} />
              </View>
              <View style={{ flex: 1 }}>
                <Body strong>{index + 1}. {step.title}</Body>
                <Caption style={{ marginTop: 2 }}>{step.body}</Caption>
              </View>
            </Row>
          ))}
        </FadeIn>
      ) : (
      <>
      <FadeIn>
        <View style={styles.art}>
          <Image
            source={ILLUSTRATION}
            style={styles.artImage}
            resizeMode="contain"
            accessibilityLabel="A customer asks the price under your post, and gets the product link in a DM"
          />
        </View>
      </FadeIn>

      <FadeIn delay={80}>
        <Text style={styles.headline}>
          Turn Instagram questions into <Text style={{ color: colors.accent600 }}>real orders</Text>
        </Text>
        <Body muted style={styles.lead}>
          When customers ask about your products in DMs, we’ll help you share the right product link and bring them to your store.
        </Body>

        {FEATURES.map((feature) => (
          <Row key={feature.title} gap={space.lg} align="flex-start" style={styles.feature}>
            <View style={[styles.featureIcon, { backgroundColor: feature.tint.bg }]}>
              <Ionicons name={feature.icon} size={22} color={feature.tint.fg} />
            </View>
            <View style={{ flex: 1 }}>
              <Body strong>{feature.title}</Body>
              <Caption style={{ marginTop: 2 }}>{feature.body}</Caption>
            </View>
          </Row>
        ))}
      </FadeIn>

      </>
      )}

      <FadeIn delay={160}>
        {live ? null : (
        <Row gap={space.md} style={styles.launch}>
          <View style={styles.instagram}><Ionicons name="logo-instagram" size={28} color="#ffffff" /></View>
          <View style={{ flex: 1 }}>
            <Row gap={space.xs}>
              <Ionicons name="sparkles" size={13} color={colors.accent900} />
              <Body strong style={{ color: colors.accent900 }}>Launching soon</Body>
            </Row>
            <Caption style={{ color: colors.accent700 }}>Get ready to turn more views into orders.</Caption>
          </View>
        </Row>
        )}

        {link ? (
          <Card style={styles.bio}>
            <Body strong>{live ? 'Add your store to your Instagram bio' : 'While you wait: add your store to your bio'}</Body>
            <Caption style={{ marginTop: 2 }}>Put your store link in your Instagram bio so followers can shop any time.</Caption>
            <View style={styles.linkBox}>
              <Caption numberOfLines={1} selectable style={{ flex: 1 }}>{link}</Caption>
            </View>
            <Button
              title="Copy store link"
              icon={<Ionicons name="copy-outline" size={18} color="#ffffff" />}
              onPress={() => copyLink().catch(() => toast.error('Could not copy the link'))}
            />
          </Card>
        ) : null}
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { justifyContent: 'space-between', marginBottom: space.lg },
  title: { fontSize: 24, flexShrink: 1 },
  soon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    backgroundColor: colors.accent50,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 6,
  },
  soonText: { ...type.label, color: colors.accent700 },

  // The picture's own backdrop, so its edges disappear into the panel.
  art: { width: '100%', aspectRatio: 775 / 485, borderRadius: radius.lg, backgroundColor: '#fbfcfc', marginBottom: space.xl },
  // Sized by the box, not the file: an Image left to itself takes the picture's pixel size.
  artImage: { width: '100%', height: '100%' },

  headline: { ...type.display, fontSize: 30, lineHeight: 36, color: colors.ink900 },
  lead: { marginTop: space.md, marginBottom: space.xl },
  feature: { marginBottom: space.xl },
  featureIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },

  howTitle: { marginTop: space.sm, marginBottom: space.lg },
  launch: { padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.accent50, marginBottom: space.xl },
  instagram: {
    width: 52,
    height: 52,
    borderRadius: radius.sm,
    backgroundColor: INSTAGRAM,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bio: { marginBottom: space.xl },
  linkBox: {
    backgroundColor: colors.sunken,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    marginVertical: space.md,
  },
});
