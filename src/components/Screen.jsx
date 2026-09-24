import {
  KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space } from '../theme.js';

/**
 * Page chrome.
 *
 * Handles the three things every screen needs and none of them want to repeat: the safe
 * area (a bottom inset that respects the tab bar, and a gesture bar that must not sit
 * under a button), keyboard avoidance, and pull-to-refresh.
 */

const HEADER_OFFSET = Platform.select({ ios: 0, default: 0 });

export const Screen = ({
  children,
  scroll = true,
  onRefresh,
  refreshing = false,
  padded = true,
  footer,
  contentStyle,
  style,
}) => {
  const insets = useSafeAreaInsets();

  // Expo Router's stack and tabs already consume the top inset; only the bottom is ours,
  // and only when there is no footer pinned over it.
  const bottomPad = (footer ? 0 : insets.bottom) + space.xxl;

  const body = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        padded && styles.padded,
        { paddingBottom: bottomPad },
        contentStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent600} colors={[colors.accent600]} />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, padded && styles.padded, contentStyle]}>{children}</View>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.flex, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={HEADER_OFFSET}
    >
      {body}
      {footer ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>{footer}</View>
      ) : null}
    </KeyboardAvoidingView>
  );
};

/** A screen whose body is a FlatList: the list owns the scrolling, so Screen must not. */
export const ListScreen = ({ children, footer }) => {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.flex}>
      {children}
      {footer ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>{footer}</View>
      ) : null}
    </View>
  );
};

/** Standard bottom padding for a FlatList inside ListScreen. */
export const useListPadding = (extra = 0) => {
  const insets = useSafeAreaInsets();
  return { paddingBottom: insets.bottom + space.xxl + extra, paddingHorizontal: space.lg, paddingTop: space.md };
};

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.canvas },
  padded: { paddingHorizontal: space.lg, paddingTop: space.lg },
  footer: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
});
