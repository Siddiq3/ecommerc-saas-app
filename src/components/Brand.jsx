import { Image, StyleSheet, View } from 'react-native';
import { space } from '../theme.js';

const MARK = require('../../assets/brand/storeflick-mark.png');
const WORDMARK = require('../../assets/brand/storeflick-wordmark.png');

// Intrinsic aspect ratios of the two artwork files (width / height).
const MARK_RATIO = 225 / 240;
const WORD_RATIO = 720 / 113;

/**
 * The StoreFlick logo: the bag-and-bolt mark, optionally followed by the two-tone wordmark.
 * `size` is the mark's height, so existing call sites keep their proportions.
 */
export const Logo = ({ size = 32, showName = true, style }) => {
  const markH = size * 1.15;
  const wordH = size * 0.6;

  return (
    <View style={[styles.row, style]} accessible accessibilityRole="image" accessibilityLabel="StoreFlick">
      <Image source={MARK} style={{ height: markH, width: markH * MARK_RATIO }} resizeMode="contain" />
      {showName ? (
        <Image source={WORDMARK} style={{ height: wordH, width: wordH * WORD_RATIO }} resizeMode="contain" />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
