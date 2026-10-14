import {
  KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, contentMaxWidth, space } from '../theme.js';
import { useKeyboardHeight } from '../lib/useKeyboardHeight.js';
import { KeyboardSpacer } from './KeyboardSpacer.jsx';

/**
 * Page chrome.
 *
 * Handles the three things every screen needs and none of them want to repeat: the safe
 * area (a bottom inset that respects the tab bar, and a gesture bar that must not sit
 * under a button), keyboard avoidance, and pull-to-refresh.
 *
 * Content sits in a centred column of at most `maxWidth` (contentMaxWidth by default), so a phone layout does not
 * stretch edge to edge on a tablet; on phones the column is simply the full width. Pass `maxWidth={null}` for a
 * screen that must use the whole window.
 */

const HEADER_OFFSET = Platform.select({ ios: 0, default: 0 });

export const Screen = ({
  children,
  scroll = true,
  onRefresh,
  onEndReached,
  refreshing = false,
  padded = true,
  footer,
  contentStyle,
  style,
  maxWidth = contentMaxWidth,
}) => {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();

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
      scrollEventThrottle={200}
      onScroll={onEndReached ? ({ nativeEvent: e }) => {
        if (e.contentOffset.y + e.layoutMeasurement.height >= e.contentSize.height - 200) onEndReached();
      } : undefined}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent600} colors={[colors.accent600]} />
        ) : undefined
      }
    >
      {maxWidth ? <View style={[styles.column, { maxWidth }]}>{children}</View> : children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, padded && styles.padded, contentStyle]}>
      {/* flex: 1 here too, so a non-scrolling screen's flexible children keep their space inside the column. */}
      {maxWidth ? <View style={[styles.column, styles.flex, { maxWidth }]}>{children}</View> : children}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.flex, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={HEADER_OFFSET}
    >
      {body}
      {footer ? (
        <View style={[styles.footer, { paddingBottom: (keyboard ? 0 : insets.bottom) + space.md }]}>
          {maxWidth ? <View style={[styles.column, { maxWidth }]}>{footer}</View> : footer}
        </View>
      ) : null}
      {/* Android: the keyboard's own room, below everything, so the footer sits just above it. */}
      <KeyboardSpacer />
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
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
          <View style={[styles.column, { maxWidth: contentMaxWidth }]}>{footer}</View>
        </View>
      ) : null}
    </View>
  );
};

/** The same tablet column for a FlatList's contentContainerStyle: list screens do their own scrolling. */
export const listColumn = { width: '100%', maxWidth: contentMaxWidth, alignSelf: 'center' };

/** Standard bottom padding for a FlatList inside ListScreen. */
export const useListPadding = (extra = 0) => {
  const insets = useSafeAreaInsets();
  return { paddingBottom: insets.bottom + space.xxl + extra, paddingHorizontal: space.lg, paddingTop: space.md };
};

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.canvas },
  column: { width: '100%', alignSelf: 'center' },
  padded: { paddingHorizontal: space.lg, paddingTop: space.lg },
  footer: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
});
