import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { colors } from '../src/theme.js';

/**
 * The launch route. It renders the splash and nothing else: RouteGuard in the root layout
 * decides where to go as soon as the stored session has been read.
 */
export default function Index() {
  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.accent600} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas },
});
