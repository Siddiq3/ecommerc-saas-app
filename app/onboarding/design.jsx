import { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  interpolateColor, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming,
} from 'react-native-reanimated';
import { StepScreen } from '../../src/components/StepScreen.jsx';
import { StorePreview } from '../../src/components/StorePreview.jsx';
import { Body, Button, Caption } from '../../src/components/ui.jsx';
import { Press, haptic } from '../../src/components/motion.jsx';
import { useOnboarding } from '../../src/state/onboarding.jsx';
import { STORE_STYLES, categoryById, styleById } from '../../src/lib/onboarding.js';
import { colors, fonts, motion, radius, shadow, space, type } from '../../src/theme.js';

/**
 * Step 4 — what the shop looks like.
 *
 * The screen is built the other way up from a normal picker: the merchant's own storefront
 * is the subject at the top, full width and already carrying their name, their link and
 * their category's stock, and the cards below are the controls that reshape it. Tapping a
 * card is not "selecting an option", it is redecorating the shop in front of you — the
 * preview is re-keyed on every change so the products restock with a stagger and the change
 * is unmissable.
 *
 * Every style is a real `themeSchema` patch (see STORE_STYLES). The choice is saved to the
 * store's settings during the creation animation, so what is chosen here is what the
 * storefront serves — which is also why it is safe to promise it can be changed later: this
 * screen writes to the same settings the Website tab edits.
 */

export default function Design() {
  const router = useRouter();
  const { draft, update } = useOnboarding();

  const selected = styleById(draft.styleId) ?? STORE_STYLES[0];
  const category = categoryById(draft.categoryId)?.category ?? 'other';

  return (
    <StepScreen
      step={4}
      from={0.7}
      progress={0.86}
      title="Choose your store style"
      subtitle="You can change this anytime later."
      onBack={() => router.back()}
      footer={
        <Button
          title="Continue"
          size="lg"
          onPress={() => router.push('/onboarding/building')}
        />
      }
    >
      {/* The live preview. Re-mounted per style so the whole shop redraws, not just its colour. */}
      <View style={styles.stage}>
        <StorePreview
          key={selected.id}
          name={draft.business.name}
          slug={draft.business.slug}
          category={category}
          theme={selected.theme}
          tiles={6}
        />
      </View>

      <View style={styles.legend}>
        <Body strong style={styles.legendName}>{selected.label}</Body>
        <Caption style={styles.legendBlurb}>{selected.blurb}</Caption>
      </View>

      {/* Breaks the screen's gutter so the row reads as a shelf that continues off-screen. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.shelf}
        contentContainerStyle={styles.shelfContent}
        decelerationRate="fast"
        snapToInterval={CARD + space.md}
        snapToAlignment="start"
      >
        {STORE_STYLES.map((option, index) => (
          <StyleCard
            key={option.id}
            option={option}
            index={index}
            selected={option.id === selected.id}
            onPress={() => update('styleId', option.id)}
          />
        ))}
      </ScrollView>
    </StepScreen>
  );
}

const CARD = 136;

const StyleCard = ({ option, index, selected, onPress }) => {
  const enter = useSharedValue(0);
  const pick = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    enter.value = withDelay(
      240 + index * 60,
      withTiming(1, { duration: motion.duration.slow, easing: motion.easing.out }),
    );
  }, [enter, index]);

  useEffect(() => {
    pick.value = withSpring(selected ? 1 : 0, motion.spring.snap);
  }, [selected, pick]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    // Travels sideways on entry, matching the direction the shelf scrolls.
    transform: [{ translateX: (1 - enter.value) * 24 }, { translateY: pick.value * -6 }],
  }));

  const frameStyle = useAnimatedStyle(() => ({
    borderWidth: 1 + pick.value,
    borderColor: interpolateColor(pick.value, [0, 1], [colors.line, option.theme.primaryColor]),
    transform: [{ scale: 1 + pick.value * 0.015 }],
  }));

  const badgeStyle = useAnimatedStyle(() => ({
    opacity: pick.value,
    transform: [{ scale: 0.3 + pick.value * 0.7 }],
  }));

  return (
    <Animated.View style={[{ width: CARD }, cardStyle]}>
      <Press
        onPress={() => { haptic.select(); onPress(); }}
        haptics={null}
        scaleTo={0.96}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={`${option.label} store style. ${option.blurb}`}
      >
        <Animated.View style={[styles.card, frameStyle]}>
          <StyleThumb theme={option.theme} />
          <Animated.View style={[styles.badge, { backgroundColor: option.theme.primaryColor }, badgeStyle]}>
            <Ionicons name="checkmark" size={13} color="#ffffff" />
          </Animated.View>
        </Animated.View>
      </Press>
      <Body strong style={[styles.cardLabel, selected && { color: option.theme.primaryColor }]}>
        {option.label}
      </Body>
    </Animated.View>
  );
};

/**
 * The miniature storefront on a card.
 *
 * Deliberately not a scaled-down StorePreview: at this size the real one's text is unreadable
 * mush, and what has to survive the shrink is the *shape* of the layout — how round the
 * corners are, how the products are arranged, what colour the shop is. So it is drawn as
 * blocks, from the same theme values the big preview reads.
 */
const CORNERS = { none: 0, small: 3, medium: 6, large: 9 };

const StyleThumb = ({ theme }) => {
  const corner = CORNERS[theme.cornerRadius] ?? 6;
  const listed = theme.layout === 'list';

  return (
    <View style={styles.thumb}>
      <View style={styles.thumbHeader}>
        <View style={[styles.thumbMark, { backgroundColor: theme.primaryColor, borderRadius: corner }]} />
        <View style={styles.thumbLines}>
          <View style={[styles.thumbLine, { width: '70%' }]} />
          <View style={[styles.thumbLine, { width: '40%' }]} />
        </View>
      </View>

      <View style={[styles.thumbHero, { backgroundColor: `${theme.primaryColor}22`, borderRadius: corner }]} />

      <View style={[styles.thumbGrid, listed && styles.thumbList]}>
        {Array.from({ length: listed ? 3 : 4 }, (_, index) => (
          <View
            key={index}
            style={[
              listed ? styles.thumbRow : styles.thumbTile,
              { borderRadius: corner, backgroundColor: index % 2 ? colors.ink200 : `${theme.primaryColor}14` },
            ]}
          />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  stage: { marginBottom: space.lg },

  legend: { marginBottom: space.lg },
  legendName: { ...type.heading, fontFamily: fonts.display, fontSize: 19, lineHeight: 24 },
  legendBlurb: { marginTop: 2 },

  shelf: { marginHorizontal: -space.xl },
  shelfContent: { paddingHorizontal: space.xl, gap: space.md, paddingBottom: space.sm },

  card: {
    height: 150,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    overflow: 'hidden',
    padding: space.sm,
    ...shadow.subtle,
  },
  badge: {
    position: 'absolute',
    top: space.sm,
    right: space.sm,
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: { ...type.label, fontSize: 14, marginTop: space.sm, textAlign: 'center', color: colors.ink700 },

  thumb: { flex: 1, gap: 6 },
  thumbHeader: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  thumbMark: { width: 16, height: 16 },
  thumbLines: { flex: 1, gap: 3 },
  thumbLine: { height: 3, borderRadius: 2, backgroundColor: colors.ink200 },
  thumbHero: { height: 34 },
  thumbGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  thumbList: { flexDirection: 'column' },
  thumbTile: { width: '47.5%', height: 30 },
  thumbRow: { width: '100%', height: 20 },
});
