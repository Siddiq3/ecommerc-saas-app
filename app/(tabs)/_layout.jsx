import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Tabs, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/state/auth.jsx';
import { useOrderCounts } from '../../src/state/counts.js';
import { useRefreshOnFocus } from '../../src/lib/useAsync.js';
import { colors, space, type } from '../../src/theme.js';

/**
 * The product's main destinations. Everything else in the app is pushed on top of one of
 * these rather than hidden in a drawer — a merchant checking an order on a bus should be
 * one tap from anywhere.
 */

/**
 * Tab labels: one shared size, as large as fits, with the bar's width shared by label length.
 *
 * Six equal tabs leave about 50pt each on a 320pt phone. "Customers" then had to shrink alone (visibly smaller than
 * its neighbours), or all six had to drop to about 8pt. Instead each tab's width is half an equal share and half a
 * share by its label's width, so "Customers" gets room that "Home" does not need, and every label shares the largest
 * size at which all of them fit: never above 11pt times the reader's text size (capped at 1.15). Label widths and
 * slots are measured on the device, not estimated (estimates were off for this typeface). Shrink-to-fit stays as a
 * last resort.
 */
const measured = { ratios: {}, slots: {} };
const listeners = new Set();
const publish = (kind, label, value) => {
  if (!value || measured[kind][label] === value) return;
  measured[kind] = { ...measured[kind], [label]: value };
  listeners.forEach((update) => update({ ...measured }));
};
function useMeasured() {
  const [m, setM] = useState({ ...measured });
  useEffect(() => {
    listeners.add(setM);
    return () => { listeners.delete(setM); };
  }, []);
  return m;
}

/** Tab width weight: half equal, half by the label's measured width (equal until measured). */
const weightFor = (ratios, label) => {
  const values = Object.values(ratios);
  if (!ratios[label] || values.length < 6) return 1;
  const average = values.reduce((a, b) => a + b, 0) / values.length;
  return (average + ratios[label]) / 2 / average;
};

function TabLabel({ color, children, position }) {
  const { fontScale } = useWindowDimensions();
  const m = useMeasured();
  const preferred = 11 * Math.min(fontScale, 1.15);
  // Tablets lay the label beside its icon, with room to spare: the plain label, nothing to measure.
  if (position === 'beside-icon') {
    return <Text style={[styles.label, styles.besideIcon, { color }]} maxFontSizeMultiplier={1.15} numberOfLines={1}>{children}</Text>;
  }
  const fits = Object.keys(m.ratios).filter((label) => m.slots[label]).map((label) => (m.slots[label] - 2) / m.ratios[label]);
  const fontSize = fits.length === 6 ? Math.max(8.5, Math.min(preferred, ...fits)) : preferred;
  return (
    <View style={styles.slot} onLayout={(e) => publish('slots', children, Math.round(e.nativeEvent.layout.width))}>
      {m.ratios[children] ? null : (
        <Text
          style={[styles.label, styles.measure]}
          allowFontScaling={false}
          onTextLayout={(e) => publish('ratios', children, (e.nativeEvent.lines[0]?.width ?? 0) / 100)}
        >
          {children}
        </Text>
      )}
      <Text
        style={[styles.label, { color, fontSize, lineHeight: Math.round(fontSize * 1.35) }]}
        allowFontScaling={false}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.9}
      >
        {children}
      </Text>
    </View>
  );
}

const icon = (name) =>
  function TabIcon({ color, size, focused }) {
    return <Ionicons name={focused ? name : `${name}-outline`} size={size} color={color} />;
  };

const TITLES = { index: 'Home', social: 'Social', orders: 'Orders', products: 'Products', customers: 'Customers', account: 'Account' };

export default function TabsLayout() {
  const { businessId } = useAuth();
  const { needsAttention, reload: reloadCounts } = useOrderCounts(businessId);
  const insets = useSafeAreaInsets();
  const { ratios } = useMeasured();
  // Matches the library (BottomTabBar shouldUseHorizontalLabels): from 768pt wide the label sits beside the icon.
  const wide = useWindowDimensions().width >= 768;

  // Back from an order (a payment just verified, an order just shipped): the badge must drop
  // now, not the next time the app returns from the background.
  useFocusEffect(useRefreshOnFocus(reloadCounts));

  return (
    <Tabs
      screenOptions={({ route }) => ({
        // No side padding inside each tab, and widths shared by label length (see TabLabel).
        tabBarItemStyle: { paddingHorizontal: 0, flex: wide ? 1 : weightFor(ratios, TITLES[route.name]) },
        headerShown: false,
        tabBarActiveTintColor: colors.accent600,
        tabBarInactiveTintColor: colors.ink500,
        tabBarLabel: TabLabel,
        // A fixed height is used as-is while the bottom inset is still added as padding inside
        // it, which squeezed the icons and labels on phones with a home indicator or gesture bar.
        tabBarStyle: [styles.bar, { height: BAR_HEIGHT + insets.bottom }],

        lazy: true,
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home') }} />
      <Tabs.Screen
        name="social"
        options={{
          title: 'Social',
          // No outline variant exists for brand logos.
          tabBarIcon: ({ color, size }) => <Ionicons name="logo-instagram" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders',
          tabBarIcon: icon('receipt'),
          // Only orders that need the merchant to do something are badged. Badging every
          // open order would keep the dot permanently lit and teach them to ignore it.
          tabBarBadge: needsAttention || undefined,
          tabBarBadgeStyle: styles.badge,
        }}
      />
      <Tabs.Screen name="products" options={{ title: 'Products', tabBarIcon: icon('pricetag') }} />
      <Tabs.Screen name="customers" options={{ title: 'Customers', tabBarIcon: icon('people') }} />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: icon('person-circle') }} />
    </Tabs>
  );
}

const BAR_HEIGHT = 60;

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 6,
  },
  label: { ...type.caption, fontSize: 11, marginBottom: 4 },
  // Off-screen, measured once: the longest label at 100pt.
  besideIcon: { marginBottom: 0, marginStart: space.sm },
  // Fills the tab's label area, so its width is what a label really has.
  slot: { alignSelf: 'stretch', alignItems: 'center' },
  measure: { position: 'absolute', opacity: 0, fontSize: 100, lineHeight: 130, left: -9999, width: 2000 },
  badge: { backgroundColor: colors.accent600, fontSize: 11 },
});
