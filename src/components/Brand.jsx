import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, space, type } from '../theme.js';

/**
 * The wordmark. A drawn glyph rather than an image asset, so it stays crisp at any size
 * and adds nothing to the bundle.
 */
export const Logo = ({ size = 32, showName = true, tone = 'accent', style }) => {
  const fg = tone === 'light' ? '#ffffff' : colors.surface;
  const bg = tone === 'light' ? 'rgba(255,255,255,0.18)' : colors.accent600;
  const nameColor = tone === 'light' ? '#ffffff' : colors.ink900;

  return (
    <View style={[styles.row, style]}>
      <View style={[styles.mark, { width: size, height: size, borderRadius: size * 0.3, backgroundColor: bg }]}>
        <Text style={[styles.glyph, { fontSize: size * 0.5, color: fg }]}>S</Text>
      </View>
      {showName ? <Text style={[styles.name, { fontSize: size * 0.58, color: nameColor }]}>StoreKit</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  mark: { alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  glyph: { fontFamily: fonts.display, letterSpacing: -0.5 },
  name: { ...type.title, letterSpacing: -0.6 },
});
