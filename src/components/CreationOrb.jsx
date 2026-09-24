import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming,
} from 'react-native-reanimated';
import { colors, panelTints } from '../theme.js';

/**
 * The store-building visual: a glowing sphere with products orbiting it.
 *
 * There is no gradient or SVG library in the app, and adding a native dependency for one
 * screen is a poor trade — so the depth is built the old way, from stacked translucent discs.
 * A radial gradient is only a set of concentric circles that change colour gradually; six of
 * them, clipped to the sphere, read as one. Everything moves on the UI thread with linear
 * or sine-like loops, so it stays smooth while the network calls behind it run.
 *
 *   ambient glow     two big discs breathing out of phase
 *   sonar rings      three rings expanding and fading, staggered
 *   orbits           two thin rings; on them, tiles that carry the merchant's products
 *   sphere           base colour, lit side, shaded side, and a highlight that drifts
 *
 * `tiles` are emoji for the products (the merchant's category), so the thing circling the
 * orb is recognisably *their* shop.
 */

const SIZE = 300;
const SPHERE = 132;
const ORBIT_INNER = 190;
const ORBIT_OUTER = 262;

const loop = (value, duration, { from = 0, to = 1, easing = Easing.linear, reverse = false } = {}) => {
  value.value = from;
  value.value = withRepeat(withTiming(to, { duration, easing }), -1, reverse);
};

export const CreationOrb = ({ tiles = ['🛍', '📦', '🎁', '✨', '🏷', '🛒'] }) => {
  const breathe = useSharedValue(0);
  const float = useSharedValue(0);
  const spin = useSharedValue(0);
  const spinSlow = useSharedValue(0);
  const drift = useSharedValue(0);
  const ping = [useSharedValue(0), useSharedValue(0), useSharedValue(0)];

  useEffect(() => {
    loop(breathe, 2600, { easing: Easing.inOut(Easing.sin), reverse: true });
    loop(float, 3000, { easing: Easing.inOut(Easing.sin), reverse: true });
    loop(spin, 9000);
    loop(spinSlow, 15000);
    loop(drift, 6500);
    ping.forEach((value, index) => {
      value.value = 0;
      value.value = withDelay(index * 1000, withRepeat(withTiming(1, { duration: 3000, easing: Easing.out(Easing.quad) }), -1, false));
    });
    return () => {
      [breathe, float, spin, spinSlow, drift, ...ping].forEach(cancelAnimation);
    };
    // The shared values are stable for the life of the component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const glowA = useAnimatedStyle(() => ({ transform: [{ scale: 0.92 + breathe.value * 0.2 }], opacity: 0.55 + breathe.value * 0.25 }));
  const glowB = useAnimatedStyle(() => ({ transform: [{ scale: 1.08 - breathe.value * 0.16 }], opacity: 0.4 + (1 - breathe.value) * 0.2 }));
  const sphereFloat = useAnimatedStyle(() => ({ transform: [{ translateY: (float.value - 0.5) * 14 }, { scale: 1 + breathe.value * 0.04 }] }));
  const orbitInner = useAnimatedStyle(() => ({ transform: [{ rotate: `${-spin.value * 360}deg` }] }));
  const orbitOuter = useAnimatedStyle(() => ({ transform: [{ rotate: `${spinSlow.value * 360}deg` }] }));
  // Counter-rotation keeps each tile's emoji upright while its orbit turns underneath it.
  const upright = useAnimatedStyle(() => ({ transform: [{ rotate: `${-spinSlow.value * 360}deg` }] }));
  // The highlight circles the inside of the sphere, which is what makes it look liquid.
  const swirl = useAnimatedStyle(() => ({ transform: [{ rotate: `${drift.value * 360}deg` }] }));

  return (
    <View style={styles.stage}>
      <Animated.View style={[styles.glow, styles.glowOuter, glowB]} />
      <Animated.View style={[styles.glow, styles.glowInner, glowA]} />

      {ping.map((value, index) => (
        <Ping key={index} value={value} />
      ))}

      {/* Inner orbit: two small dots, turning against the outer orbit. */}
      <Animated.View style={[styles.orbit, { width: ORBIT_INNER, height: ORBIT_INNER, borderRadius: ORBIT_INNER }, orbitInner]}>
        <View style={[styles.dot, { top: -5, left: ORBIT_INNER / 2 - 5, backgroundColor: colors.accent500 }]} />
        <View style={[styles.dot, styles.dotSmall, { bottom: -3.5, left: ORBIT_INNER / 2 - 3.5, backgroundColor: colors.accent200 }]} />
      </Animated.View>

      {/* Outer orbit: three product tiles, a third of a turn apart. */}
      <Animated.View style={[styles.orbit, { width: ORBIT_OUTER, height: ORBIT_OUTER, borderRadius: ORBIT_OUTER }, orbitOuter]}>
        {[0, 1, 2].map((index) => {
          const angle = (index / 3) * Math.PI * 2 - Math.PI / 2;
          const r = ORBIT_OUTER / 2;
          return (
            <Animated.View
              key={index}
              style={[
                styles.tile,
                {
                  left: r + Math.cos(angle) * r - 20,
                  top: r + Math.sin(angle) * r - 20,
                  backgroundColor: [panelTints.peach, panelTints.lilac, panelTints.mint][index],
                },
                upright,
              ]}
            >
              <Text style={styles.tileEmoji}>{tiles[index % tiles.length]}</Text>
            </Animated.View>
          );
        })}
      </Animated.View>

      {/* The shadow lives on the outer view: `overflow: hidden` below would clip it on iOS. */}
      <Animated.View style={[styles.sphereShadow, sphereFloat]}>
      <View style={styles.sphere}>
        {/* Base, then the lit side, then the shade — a poor man's radial gradient. */}
        <View style={[styles.layer, { backgroundColor: colors.accent600 }]} />
        <View style={[styles.disc, { width: SPHERE * 0.86, height: SPHERE * 0.86, top: SPHERE * 0.02, left: SPHERE * 0.02, backgroundColor: colors.accent500 }]} />
        <View style={[styles.disc, { width: SPHERE * 0.6, height: SPHERE * 0.6, top: SPHERE * 0.06, left: SPHERE * 0.08, backgroundColor: '#f39a72', opacity: 0.8 }]} />
        <View style={[styles.disc, { width: SPHERE * 1.15, height: SPHERE * 1.15, bottom: -SPHERE * 0.42, right: -SPHERE * 0.42, backgroundColor: colors.accent900, opacity: 0.07 }]} />
        <View style={[styles.disc, { width: SPHERE * 1.0, height: SPHERE * 1.0, bottom: -SPHERE * 0.36, right: -SPHERE * 0.36, backgroundColor: colors.accent900, opacity: 0.07 }]} />
        <View style={[styles.disc, { width: SPHERE * 0.85, height: SPHERE * 0.85, bottom: -SPHERE * 0.3, right: -SPHERE * 0.3, backgroundColor: colors.accent900, opacity: 0.07 }]} />
        <View style={[styles.disc, { width: SPHERE * 0.7, height: SPHERE * 0.7, bottom: -SPHERE * 0.24, right: -SPHERE * 0.24, backgroundColor: colors.accent900, opacity: 0.07 }]} />
        <View style={[styles.disc, { width: SPHERE * 0.55, height: SPHERE * 0.55, bottom: -SPHERE * 0.18, right: -SPHERE * 0.18, backgroundColor: colors.accent900, opacity: 0.07 }]} />
        <Animated.View style={[styles.layer, swirl]}>
          <View style={[styles.disc, { width: SPHERE * 0.5, height: SPHERE * 0.5, top: SPHERE * 0.06, left: SPHERE * 0.25, backgroundColor: '#ffffff', opacity: 0.1 }]} />
          <View style={[styles.disc, { width: SPHERE * 0.34, height: SPHERE * 0.34, top: SPHERE * 0.1, left: SPHERE * 0.33, backgroundColor: '#ffffff', opacity: 0.14 }]} />
          <View style={[styles.disc, { width: SPHERE * 0.18, height: SPHERE * 0.18, top: SPHERE * 0.14, left: SPHERE * 0.41, backgroundColor: '#ffffff', opacity: 0.4 }]} />
        </Animated.View>
      </View>
      </Animated.View>
    </View>
  );
};

const Ping = ({ value }) => {
  const style = useAnimatedStyle(() => ({ opacity: (1 - value.value) * 0.5, transform: [{ scale: 0.5 + value.value * 1.0 }] }));
  return <Animated.View style={[styles.ping, style]} />;
};

const styles = StyleSheet.create({
  stage: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },

  glow: { position: 'absolute', borderRadius: 999 },
  glowOuter: { width: SIZE, height: SIZE, backgroundColor: colors.accent100, opacity: 0.5 },
  glowInner: { width: SIZE * 0.66, height: SIZE * 0.66, backgroundColor: colors.accent200, opacity: 0.6 },

  ping: {
    position: 'absolute',
    width: SPHERE * 1.5,
    height: SPHERE * 1.5,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.accent500,
  },

  orbit: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(226,81,30,0.22)' },
  dot: { position: 'absolute', width: 10, height: 10, borderRadius: 5 },
  dotSmall: { width: 7, height: 7, borderRadius: 3.5 },

  tile: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    shadowColor: colors.ink900,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  tileEmoji: { fontSize: 20 },

  sphereShadow: {
    width: SPHERE,
    height: SPHERE,
    borderRadius: SPHERE,
    backgroundColor: colors.accent600,
    shadowColor: colors.accent600,
    shadowOpacity: 0.5,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  sphere: { width: SPHERE, height: SPHERE, borderRadius: SPHERE, overflow: 'hidden' },
  layer: { ...StyleSheet.absoluteFillObject },
  disc: { position: 'absolute', borderRadius: 999 },
});
