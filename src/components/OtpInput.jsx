import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  interpolateColor, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { haptic } from './motion.jsx';
import { colors, fonts, motion, radius, space } from '../theme.js';

/**
 * A six-box code entry.
 *
 * Six boxes are a picture, not six inputs. One real (invisible) TextInput owns the value, and
 * the boxes render whatever it holds. That is what makes "move to the next box" automatic,
 * backspace correct, a pasted code land in one go, and the OS's SMS / email code suggestion
 * work — six separate inputs each break at least one of those on Android.
 *
 * Whitespace and dashes from a paste ("123 456") are dropped: this is a code the merchant
 * copies, not text they author, so tidying it is what they want.
 */

const LENGTH = 6;

export const OtpInput = ({ value, onChange, error, errorKey = 0, autoFocus = true, editable = true }) => {
  const input = useRef(null);
  const [focused, setFocused] = useState(false);
  const shake = useSharedValue(0);

  // A wrong code shakes the row. `errorKey` changes on every failure, so the same message
  // twice in a row still moves — the motion is the feedback, not the text.
  useEffect(() => {
    if (!errorKey) return;
    haptic.error();
    shake.value = withSequence(
      withTiming(-9, { duration: 55 }),
      withTiming(9, { duration: 90 }),
      withTiming(-6, { duration: 80 }),
      withTiming(0, { duration: 60 }),
    );
  }, [errorKey, shake]);

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  const active = Math.min(value.length, LENGTH - 1);

  return (
    <View>
      <Pressable onPress={() => input.current?.focus()} accessibilityLabel="Verification code">
        <Animated.View style={[styles.row, rowStyle]}>
          {Array.from({ length: LENGTH }, (_, index) => (
            <Box
              key={index}
              char={value[index]}
              active={focused && index === active}
              invalid={Boolean(error)}
            />
          ))}
        </Animated.View>
        <TextInput
          ref={input}
          value={value}
          onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, LENGTH))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          autoFocus={autoFocus}
          editable={editable}
          caretHidden
          style={styles.hidden}
          accessibilityLabel="Verification code"
        />
      </Pressable>
    </View>
  );
};

const Box = ({ char, active, invalid }) => {
  const focus = useSharedValue(0);
  const filled = useSharedValue(char ? 1 : 0);
  const pop = useSharedValue(1);
  const blink = useSharedValue(1);

  useEffect(() => {
    focus.value = withTiming(active ? 1 : 0, { duration: motion.duration.fast });
  }, [active, focus]);

  useEffect(() => {
    filled.value = withTiming(char ? 1 : 0, { duration: motion.duration.fast });
    // The digit lands with a small overshoot, so typing feels like pressing a key.
    if (char) {
      pop.value = 0.6;
      pop.value = withSpring(1, motion.spring.snap);
    }
  }, [char, filled, pop]);

  useEffect(() => {
    if (!active) return undefined;
    blink.value = withRepeat(withSequence(withTiming(0, { duration: 520 }), withTiming(1, { duration: 520 })), -1);
    return () => { blink.value = 1; };
  }, [active, blink]);

  const boxStyle = useAnimatedStyle(() => ({
    borderColor: invalid
      ? colors.danger
      : interpolateColor(focus.value, [0, 1], [colors.lineStrong, colors.accent600]),
    backgroundColor: interpolateColor(filled.value, [0, 1], [colors.surface, colors.accent50]),
    transform: [{ scale: 1 + focus.value * 0.04 }],
  }));
  const digitStyle = useAnimatedStyle(() => ({ opacity: filled.value, transform: [{ scale: pop.value }] }));
  const caretStyle = useAnimatedStyle(() => ({ opacity: active && !char ? blink.value : 0 }));

  return (
    <Animated.View style={[styles.box, boxStyle]}>
      <Animated.View style={digitStyle}>
        <Text style={styles.digit}>{char ?? ''}</Text>
      </Animated.View>
      <Animated.View style={[styles.caret, caretStyle]} />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm },
  box: {
    flex: 1,
    height: 66,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digit: { fontFamily: fonts.display, fontSize: 29, lineHeight: 35, letterSpacing: -0.5, color: colors.ink900 },
  caret: { position: 'absolute', width: 2.5, height: 28, borderRadius: 2, backgroundColor: colors.accent600 },
  // Covers the boxes so a tap anywhere on them focuses it, but draws nothing.
  hidden: { ...StyleSheet.absoluteFillObject, opacity: 0.011, color: 'transparent' },
});
