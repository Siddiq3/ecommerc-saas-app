import { useEffect, useState } from 'react';
import { Dimensions, Keyboard, Platform } from 'react-native';

/**
 * How much of the screen the software keyboard covers while it is open on Android, else 0.
 *
 * Edge to edge (Android 15+, which the app targets) the window is no longer resized for the
 * keyboard, and KeyboardAvoidingView does not account for it reliably there — fields and
 * pinned buttons were left behind the keyboard. Screens pad themselves by this instead.
 *
 * Measured from the keyboard's top edge to the bottom of the screen, not from the reported
 * height: that height leaves out the navigation-bar strip under the keyboard (24pt on the
 * test device), which was just enough to hide a pinned button. iOS keeps its own
 * KeyboardAvoidingView, which works, so this stays 0 there.
 */
export const useKeyboardHeight = () => {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      const { screenY, height: reported = 0 } = e.endCoordinates ?? {};
      const covered = Number.isFinite(screenY) ? Dimensions.get('screen').height - screenY : reported;
      setHeight(Math.max(covered, reported, 0));
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return height;
};
