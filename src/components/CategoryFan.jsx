import { StyleSheet, View } from 'react-native';
import { Body } from './ui.jsx';
import { colors, fonts, panelTints, radius, shadow, space } from '../theme.js';

/**
 * A fanned row of tilted category cards, each tagged with a coloured "bubble" — the
 * native equivalent of the storefront-preview hero xpress.site opens with. Built from
 * real StoreKit categories (BUSINESS_CATEGORIES in @storekit/shared) rather than
 * fabricated store names, so it is a preview of what this app actually does, not a
 * borrowed screenshot.
 *
 * Flat pastel tints rather than gradients or photography: there is no product imagery to
 * show before a merchant has added anything, and a flat tinted card commits to nothing
 * it cannot deliver on day one.
 */
const CARDS = [
  { category: 'fashion', emoji: '👗', label: 'Fashion', tint: panelTints.lilac, rotate: -10, y: 10 },
  { category: 'jewellery', emoji: '💍', label: 'Jewellery', tint: panelTints.peach, rotate: -4, y: -4 },
  { category: 'home', emoji: '🏠', label: 'Home', tint: panelTints.mint, rotate: 3, y: 0 },
  { category: 'beauty', emoji: '💄', label: 'Beauty', tint: panelTints.rose, rotate: 9, y: 8 },
];

const Bubble = ({ label, emoji }) => (
  <View style={styles.bubble}>
    <Body style={styles.bubbleText} numberOfLines={1}>
      {label} <Body style={styles.bubbleEmoji}>{emoji}</Body>
    </Body>
    <View style={styles.bubbleTail} />
  </View>
);

export function CategoryFan() {
  return (
    <View style={styles.row} accessibilityLabel="Example shops built with StoreKit — fashion, jewellery, home, beauty">
      {CARDS.map((card, index) => (
        <View
          key={card.category}
          style={[
            styles.cardWrap,
            {
              transform: [{ rotate: `${card.rotate}deg` }, { translateY: card.y }],
              zIndex: index === 2 ? 5 : 4 - Math.abs(index - 2),
              marginLeft: index === 0 ? 0 : -space.xl,
            },
          ]}
        >
          <Bubble label={card.label} emoji={card.emoji} />
          <View style={[styles.card, { backgroundColor: card.tint }]}>
            <Body style={styles.cardEmoji}>{card.emoji}</Body>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingTop: space.xl,
    paddingBottom: space.md,
  },
  cardWrap: { alignItems: 'center' },
  card: {
    width: 76,
    height: 92,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(16,16,20,0.06)',
    ...shadow.card,
  },
  cardEmoji: { fontSize: 30 },

  bubble: {
    position: 'absolute',
    top: -18,
    left: -6,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.ink900,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 5,
    ...shadow.card,
  },
  bubbleText: { fontSize: 11, fontFamily: fonts.bold, color: '#ffffff' },
  bubbleEmoji: { fontSize: 11 },
  bubbleTail: {
    position: 'absolute',
    bottom: -4,
    left: 10,
    width: 8,
    height: 8,
    backgroundColor: colors.ink900,
    transform: [{ rotate: '45deg' }],
    borderRadius: 2,
  },
});
