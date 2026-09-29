import { useEffect, useState } from 'react';
import {
  Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Heading, Touchable } from './ui.jsx';
import { colors, radius, shadow, space } from '../theme.js';

/**
 * A bottom sheet.
 *
 * Built on Modal rather than a gesture library: the sheets here are short, confirmation-
 * shaped things, and a drag-to-dismiss handle would be a dependency and a gesture
 * conflict for an interaction that a tap already covers. The backdrop and the hardware
 * back button both close it, which is what Android users expect.
 *
 * The panel is laid out with flex (a full-height column, bottom-aligned) and a max height
 * in pixels from the window, not absolute positioning with a percentage. On Android's new
 * architecture the Modal's root has no size on its first layout, so a percentage of it
 * resolved to zero: the sheet never appeared, yet the Modal window still swallowed every
 * touch and the screen looked frozen.
 *
 * The root is also given the window's size outright. In release builds some sheets (New
 * coupon) still got a root with no size, so they opened invisible over a screen that no
 * longer took taps. A fixed size does not follow the keyboard the way a flexible root did,
 * so on Android it is shortened by the keyboard's height while one is open.
 */
const useKeyboardHeight = () => {
  const [keyboard, setKeyboard] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKeyboard(e.endCoordinates?.height ?? 0));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboard(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return keyboard;
};

export const Sheet = ({ visible, onClose, title, children }) => {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const keyboard = useKeyboardHeight();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        style={[styles.root, { width, height: height - keyboard }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { maxHeight: Math.min(height * 0.78, height - keyboard - insets.top - space.lg), paddingBottom: (keyboard ? 0 : insets.bottom) + space.xl }]}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <Heading style={{ flex: 1 }}>{title}</Heading>
            <Touchable onPress={onClose} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.ink500} />
            </Touchable>
          </View>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(12,10,9,0.45)' },
  // maxHeight is set inline: never taller than about three quarters of the screen, so the
  // backdrop stays visibly tappable and the sheet never reads as a screen with no way out.
  sheet: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: space.xl,
    ...shadow.lift,
  },
  grabber: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.ink200,
    alignSelf: 'center',
    marginTop: space.md,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.lg },
  scroll: { flexGrow: 0, flexShrink: 1 },
  body: { paddingBottom: space.lg },
});
