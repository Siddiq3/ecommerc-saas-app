import { Platform } from 'react-native';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';

/**
 * Space at the bottom of a screen exactly as tall as the open keyboard, on Android only.
 *
 * Edge to edge (Android 15+, which the app targets) the window is no longer resized for the
 * keyboard. The keyboard events React Native sends were not enough to follow it: they leave
 * out the navigation-bar strip, and are not sent again when the keyboard changes height
 * between fields (a password keyboard has an extra row), so a pinned button ended up half
 * behind it. Reanimated follows the keyboard's real size on every frame instead. The
 * navigation-bar option counts that strip too, because the screen reaches the bottom edge.
 * iOS keeps its KeyboardAvoidingView, which works.
 */
const AndroidKeyboardSpacer = () => {
  const keyboard = useAnimatedKeyboard({ isNavigationBarTranslucentAndroid: true, isStatusBarTranslucentAndroid: true });
  const style = useAnimatedStyle(() => ({ height: keyboard.height.value }));
  return <Animated.View style={style} />;
};

export const KeyboardSpacer = () => (Platform.OS === 'android' ? <AndroidKeyboardSpacer /> : null);
