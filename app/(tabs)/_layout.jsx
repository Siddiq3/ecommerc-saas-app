import { StyleSheet } from 'react-native';
import { Tabs, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/state/auth.jsx';
import { useOrderCounts } from '../../src/state/counts.js';
import { useRefreshOnFocus } from '../../src/lib/useAsync.js';
import { colors, type } from '../../src/theme.js';

/**
 * The product's five destinations. Everything else in the app is pushed on top of one of
 * these rather than hidden in a drawer — a merchant checking an order on a bus should be
 * one tap from anywhere.
 */

const icon = (name) =>
  function TabIcon({ color, size, focused }) {
    return <Ionicons name={focused ? name : `${name}-outline`} size={size} color={color} />;
  };

export default function TabsLayout() {
  const { businessId } = useAuth();
  const { needsAttention, reload: reloadCounts } = useOrderCounts(businessId);
  const insets = useSafeAreaInsets();

  // Back from an order (a payment just verified, an order just shipped): the badge must drop
  // now, not the next time the app returns from the background.
  useFocusEffect(useRefreshOnFocus(reloadCounts));

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent600,
        tabBarInactiveTintColor: colors.ink500,
        tabBarLabelStyle: styles.label,
        // A fixed height is used as-is while the bottom inset is still added as padding inside
        // it, which squeezed the icons and labels on phones with a home indicator or gesture bar.
        tabBarStyle: [styles.bar, { height: BAR_HEIGHT + insets.bottom }],
        lazy: true,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home') }} />
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
  badge: { backgroundColor: colors.accent600, fontSize: 11 },
});
