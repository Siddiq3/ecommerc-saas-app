import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
 */
export const Sheet = ({ visible, onClose, title, children }) => {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.xl }]}>
        <View style={styles.grabber} />
        <View style={styles.header}>
          <Heading style={{ flex: 1 }}>{title}</Heading>
          <Touchable onPress={onClose} accessibilityLabel="Close">
            <Ionicons name="close" size={22} color={colors.ink500} />
          </Touchable>
        </View>
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(12,10,9,0.45)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    // Never taller than about three quarters of the screen: the backdrop has to stay
    // visibly tappable, or the sheet reads as a screen with no way out.
    maxHeight: '78%',
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
  body: { paddingBottom: space.lg },
});
