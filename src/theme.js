import { Platform } from 'react-native';
// Reanimated's Easing, not React Native's: these curves run inside worklets on the UI
// thread, and the RN implementation is not worklet-compatible — it throws at runtime.
import { Easing } from 'react-native-reanimated';

/**
 * The design system. One source of truth for every visual decision in the app.
 *
 * Colours and type are carried over from the marketing site (apps/web/app/globals.css, itself
 * ported from auto-garage's website) so the paywall and the website checkout that follows it
 * feel like one product rather than a rebrand that stopped at the app icon.
 *
 * Radii and spacing are native-specific: web reads at arm's length and native reads at 30cm,
 * and native needs its own touch-target and shadow scale. What is shared is the *character* —
 * soft corners, warm neutrals, a single confident accent — not the literal numbers.
 *
 * `success` is deliberately a real green (order delivered, payment verified, stock healthy)
 * and not the accent — once the accent stopped being green, reusing it for "success" would
 * make every accent-coloured button look like a confirmation.
 */

/* ───────────── Colour ───────────── */

export const colors = {
  accent50: '#fef1ea',
  accent100: '#fde3d3',
  accent200: '#f9c7a8',
  accent500: '#ea7548',
  accent600: '#e2511e',
  accent700: '#b83e15',
  accent900: '#7a2a0e',

  ink900: '#101014',
  ink800: '#1c1c22',
  ink700: '#2a2a31',
  ink600: '#45454f',
  ink500: '#5b5b66',
  ink400: '#8a8a95',
  ink200: '#e6e6ea',

  line: '#e6e6ea',
  lineStrong: '#d3d3d9',
  canvas: '#f4f4f6',
  surface: '#ffffff',
  /** A recessed surface for wells, inputs on cards, and preview chrome. */
  sunken: '#eeeef1',

  danger: '#be123c',
  dangerTint: '#fef2f2',
  warning: '#b45309',
  warningTint: '#fffbeb',
  success: '#15803d',
  successTint: '#f0fdf4',
};

/** Status pill colours, keyed by the tone the shared package assigns each order status. */
export const tones = {
  blue: { bg: '#eff6ff', fg: '#1d4ed8' },
  amber: { bg: '#fffbeb', fg: '#b45309' },
  teal: { bg: '#f0fdfa', fg: '#0f766e' },
  indigo: { bg: '#eef2ff', fg: '#4338ca' },
  violet: { bg: '#f5f3ff', fg: '#6d28d9' },
  green: { bg: '#f0fdf4', fg: '#15803d' },
  slate: { bg: '#f8fafc', fg: '#475569' },
  red: { bg: '#fef2f2', fg: '#be123c' },
  /** For a badge that should read as "ours" rather than a status — a plan highlight. */
  accent: { bg: '#fde3d3', fg: '#b83e15' },
};

/**
 * Pastel panel tints — the same six values as the website's --color-tint-* tokens, so a
 * merchant sees the same palette whichever surface they land on first. Used for category
 * bubbles, storefront previews and illustration backdrops.
 */
export const panelTints = {
  lilac: '#d7d9fb',
  mint: '#cdeccb',
  peach: '#fbdcc4',
  sky: '#cfe4fb',
  butter: '#fbeeb8',
  rose: '#fbd6dd',
};

/* ───────────── Type ───────────── */

/**
 * Urbanist for display, Plus Jakarta Sans for everything else — the website's pairing.
 *
 * Weights are separate families rather than `fontWeight`, because Android does not
 * synthesise weights for custom fonts: asking for 600 on a family that only ships 400
 * silently renders 400. Loaded in app/_layout.jsx; `useFonts` gates the first render so
 * nothing paints in a fallback face and then reflows.
 */
export const fonts = {
  display: 'Urbanist_700Bold',
  displayMedium: 'Urbanist_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  semibold: 'PlusJakartaSans_600SemiBold',
  medium: 'PlusJakartaSans_500Medium',
  regular: 'PlusJakartaSans_400Regular',
};

/**
 * The scale is deliberately top-heavy: the jump from `body` to `display` is large, so a
 * screen reads as "one big question, then the answer" at a glance rather than as evenly
 * grey text. Tracking tightens as size grows — large type set at default tracking looks
 * loose and soft, which is what makes a heading read as a document rather than a headline.
 */
export const type = {
  display: { fontFamily: fonts.display, fontSize: 34, lineHeight: 40, letterSpacing: -1 },
  title: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, letterSpacing: -0.6 },
  heading: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24, letterSpacing: -0.3 },
  body: { fontFamily: fonts.regular, fontSize: 15.5, lineHeight: 23 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15.5, lineHeight: 23 },
  label: { fontFamily: fonts.semibold, fontSize: 13.5, lineHeight: 18, letterSpacing: -0.1 },
  caption: { fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 17.5 },
  /** All-caps section kicker. Tracking is wide because small caps need the air. */
  overline: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 1.2 },
  /** Tabular figures keep money columns from jittering as digits change. */
  money: { fontFamily: fonts.semibold, fontSize: 15.5, fontVariant: ['tabular-nums'] },
  /** For a headline figure — a dashboard stat, a price on the paywall. */
  figure: { fontFamily: fonts.display, fontSize: 30, letterSpacing: -0.9, fontVariant: ['tabular-nums'] },
};

/* ───────────── Space and shape ───────────── */

/** 4pt grid. Every margin in the app is one of these. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };

/**
 * Softer than the usual native scale, tracking the website's generous corners. `md` is the
 * control radius (buttons, inputs), `lg` the container radius (cards, sheets' inner blocks).
 */
export const radius = { xs: 6, sm: 12, md: 18, lg: 22, xl: 28, pill: 999 };

/**
 * iOS gets a soft ambient shadow; Android gets elevation. Setting both and letting each
 * platform ignore the other produces a grey box on Android, so they are kept separate.
 */
const ios = (opacity, shadowRadius, offsetY) => ({
  shadowColor: colors.ink900,
  shadowOpacity: opacity,
  shadowRadius,
  shadowOffset: { width: 0, height: offsetY },
});

export const shadow = {
  none: Platform.select({ ios: ios(0, 0, 0), android: { elevation: 0 }, default: {} }),
  /** Barely there — for a control resting on canvas. */
  subtle: Platform.select({ ios: ios(0.04, 6, 2), android: { elevation: 1 }, default: {} }),
  card: Platform.select({ ios: ios(0.06, 12, 4), android: { elevation: 2 }, default: {} }),
  lift: Platform.select({ ios: ios(0.1, 20, 8), android: { elevation: 6 }, default: {} }),
  /** For sheets and anything that floats over a dimmed backdrop. */
  sheet: Platform.select({ ios: ios(0.16, 28, -4), android: { elevation: 16 }, default: {} }),
};

/* ───────────── Motion ───────────── */

/**
 * Motion tokens.
 *
 * Durations are short on purpose: this app is used one-handed, on mid-range Android, often
 * standing in a shop. Anything above ~300ms starts to feel like waiting rather than
 * responding. Springs are used where something should feel physical (a press, a sheet, a
 * toggle); timing is used where something should feel informational (a fade, a skeleton).
 */
export const motion = {
  duration: {
    /** Press feedback — must land within one frame budget of the touch. */
    instant: 90,
    fast: 180,
    base: 280,
    slow: 440,
    /** Deliberate, ceremonial moments only: a store launching. */
    ceremony: 640,
  },
  /**
   * Bezier curves rather than `Easing.out(Easing.cubic)`. A cubic spends too much of its
   * time near the end still visibly moving, which reads as a drag; these settle almost all
   * of the distance in the first third and then glide, which is what "smooth" actually is.
   */
  easing: {
    /** Decelerating — for things entering the screen. */
    out: Easing.bezier(0.22, 1, 0.36, 1),
    /** Accelerating — for things leaving. */
    in: Easing.bezier(0.64, 0, 0.78, 0),
    inOut: Easing.bezier(0.65, 0, 0.35, 1),
    linear: Easing.linear,
  },
  spring: {
    /** A control responding to a finger. Tight, no visible overshoot. */
    press: { damping: 24, stiffness: 380, mass: 0.7 },
    /** A surface arriving. A little overshoot reads as physical. */
    enter: { damping: 18, stiffness: 190, mass: 0.95 },
    /** A toggle or a thumb travelling a short distance. */
    snap: { damping: 16, stiffness: 260, mass: 0.65 },
  },
  /** How far a staggered list item travels on entry. */
  travel: 16,
  /** Gap between staggered children. Beyond ~8 items the tail feels slow, so cap it. */
  stagger: 45,
  maxStaggered: 8,
};

/* ───────────── Layout ───────────── */

/** Android ripple config used by every pressable, so touch feedback is consistent. */
export const ripple = (color = colors.ink200) => ({ color, borderless: false });

/** 44pt is the smallest reliably tappable target on both platforms. */
export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };
export const MIN_TAP = 44;
