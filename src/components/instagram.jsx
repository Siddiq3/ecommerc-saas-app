import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Body, Caption, Row, Touchable } from './ui.jsx';
import { Thumb } from './domain.jsx';
import { formatMoney } from '../lib/format.js';
import { colors, radius, space, type } from '../theme.js';

/** Shared pieces of the Instagram screens: the Social tab, a new automation, and an automation's details. */

export const INSTAGRAM = '#e1306c';
// A rule answers one word with one product: on one post or Reel, on every post (new ones included), or in DMs.
export const TARGETS = {
  ALL: { title: 'All posts and Reels', subtitle: 'Includes posts you add later', icon: 'albums-outline' },
  DM: { title: 'Direct messages', subtitle: 'When a customer sends the word in a DM', icon: 'chatbubbles-outline' },
};
export const SUGGESTED_WORDS = ['LINK', 'PRICE', 'DETAILS', 'BUY'];

export const instagramError = (error) => {
  if (error?.code === 'INSTAGRAM_DISABLED') return 'Instagram connection is not enabled yet.';
  if (error?.code === 'INSTAGRAM_RECONNECT') return 'Instagram access expired. Disconnect and connect again.';
  if (error?.code === 'PLAN_LIMIT_EXCEEDED') return 'Your trial has ended. You can still pause automations or disconnect.';
  if (error?.code === 'INSTAGRAM_RULE_EXISTS') return 'You already have an automation for that word there.';
  if (error?.code === 'INSTAGRAM_PRODUCT_UNAVAILABLE') return 'That product is hidden or deleted. Choose an active product.';
  if (error?.code === 'INSTAGRAM_CONFIRMATION_INVALID') return 'This Instagram connection request has expired. Please connect again.';
  if (error?.code === 'INSTAGRAM_CONNECT_FAILED') return 'Could not connect. This Instagram account may already be connected to another store.';
  if (error?.code === 'INSTAGRAM_MEDIA_UNAVAILABLE') return 'Reload your posts and select the post or Reel again.';
  if (error?.code === 'INSTAGRAM_PERMISSIONS_MISSING') return 'Instagram did not allow comment access. Disconnect, connect again and allow all permissions.';
  if (error?.code === 'INSTAGRAM_WEBHOOK_NOT_READY') return 'Comment updates are not on yet. Tap "Check connection" on the Social tab, then try again.';
  if (error?.code === 'INSTAGRAM_MESSAGES_NOT_READY') return 'Instagram did not allow message access. Disconnect, connect again and allow messages.';
  return 'Something went wrong. Please try again.';
};

/** Comment rules need the connection ready; DM rules also need message access. */
export const canTurnOn = (status, target) =>
  Boolean(status?.automationReady) && (target !== 'DM' || Boolean(status?.messagesReady));

export const readinessLabel = (rule) => ({ ready: 'Ready', paused: 'Paused', action_needed: 'Action needed' }[rule?.readiness?.state] ?? 'Checking readiness');
export const readinessHint = (rule) => rule?.readiness?.state === 'paused' ? 'Paused by you. No replies will be attempted.'
  : rule?.readiness?.state === 'ready' ? 'Eligible to attempt replies. Delivery is recorded separately in Activity.'
    : rule?.readiness?.reasons?.map(r => r.message).join('\n') || 'Readiness could not be confirmed. Refresh to check.';

export const shorten = (text, max = 36) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
export const targetName = (id, media = []) =>
  TARGETS[id]?.title ?? shorten(media.find((m) => m.id === id)?.caption || 'One post or Reel');

export const InstagramMark = ({ size = 44 }) => (
  <View style={[styles.mark, { width: size, height: size }]}>
    <Ionicons name="logo-instagram" color="#ffffff" size={size * 0.55} />
  </View>
);

/** The picture for a rule: its post's thumbnail, or the icon for all posts / DMs. */
export const RuleArt = ({ target, media = [], size = 44 }) => (TARGETS[target] ? (
  <View style={[styles.icon, { width: size, height: size }]}>
    <Ionicons name={TARGETS[target].icon} size={size * 0.45} color={colors.ink500} />
  </View>
) : <Thumb uri={media.find((m) => m.id === target)?.thumbnailUrl} size={size} icon="image-outline" />);

/** A selectable row: a picture or icon, a title, and a radio mark. */
export const Option = ({ chosen, title, subtitle, onPress, uri, icon, label, disabled }) => (
  <Touchable accessibilityLabel={title} accessibilityRole="radio" accessibilityState={{ selected: chosen, disabled }}
    onPress={onPress} disabled={disabled} style={[styles.option, chosen && styles.optionChosen, disabled && { opacity: 0.5 }]}>
    <Row gap={space.md}>
      {icon && !uri ? (
        <View style={[styles.icon, chosen && { backgroundColor: colors.accent100 }]}>
          <Ionicons name={icon} size={20} color={chosen ? colors.accent700 : colors.ink500} />
        </View>
      ) : (
        <Thumb uri={uri} label={label} size={44} icon="image-outline" />
      )}
      <View style={{ flex: 1 }}>
        <Body strong numberOfLines={1}>{title}</Body>
        {subtitle ? <Caption numberOfLines={2}>{subtitle}</Caption> : null}
      </View>
      <Ionicons name={chosen ? 'checkmark-circle' : 'ellipse-outline'} size={22}
        color={chosen ? colors.accent600 : colors.ink200} />
    </Row>
  </Touchable>
);

export const ProductOption = ({ product, chosen, onPress, disabled }) => (
  <Option chosen={chosen} disabled={disabled} uri={product.thumbUrl} label={product.name} title={product.name ?? 'Product'}
    subtitle={formatMoney(product.price)} onPress={onPress} />
);

/** A post or Reel as Instagram shows it: the picture, a ▶ for Reels, a tick when chosen. */
export const PostTile = ({ post, chosen, onPress, size }) => (
  <Touchable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: chosen }}
    accessibilityLabel={`${post.mediaProductType === 'REELS' ? 'Reel' : 'Post'}: ${post.caption || 'no caption'}`}
    style={{ width: size }} scaleTo={0.96}>
    <View style={[styles.tileImage, { width: size, height: size }, chosen && styles.tileChosen]}>
      {post.thumbnailUrl ? <Image source={{ uri: post.thumbnailUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        : <Ionicons name="image-outline" size={26} color={colors.ink400} />}
      {post.mediaProductType === 'REELS' ? (
        <View style={styles.tileKind}><Ionicons name="play" size={11} color="#ffffff" /></View>
      ) : null}
      {chosen ? <View style={styles.tileCheck}><Ionicons name="checkmark" size={14} color="#ffffff" /></View> : null}
    </View>
    <Caption numberOfLines={1} style={styles.tileCaption}>{post.caption || (post.mediaProductType === 'REELS' ? 'Reel' : 'Post')}</Caption>
  </Touchable>
);

/** The exact message a customer gets, drawn as a chat bubble. */
export const ReplyPreview = ({ product, word, target, productLink }) => {
  const price = Number.isSafeInteger(product?.price) && product.price > 0 ? ` – ${formatMoney(product.price)}` : '';
  return (
    <View style={styles.previewWrap}>
      <Caption style={{ marginBottom: space.sm }}>
        When someone {target === 'DM' ? 'messages' : 'comments'} &quot;{word || '…'}&quot;, they get:
      </Caption>
      <View style={styles.bubble}>
        <Body strong style={{ color: colors.ink900 }}>{`${product?.name ?? 'Your product'}${price}`}</Body>
        <Body style={{ color: colors.accent700 }}>Shop here: {productLink ?? 'Your product link'}</Body>
      </View>
    </View>
  );
};

export const StepNumber = ({ n }) => (
  <View style={styles.stepNumber}><Text style={styles.stepNumberText}>{n}</Text></View>
);

const styles = StyleSheet.create({
  mark: { borderRadius: radius.sm, backgroundColor: INSTAGRAM, alignItems: 'center', justifyContent: 'center' },
  icon: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.sunken, alignItems: 'center', justifyContent: 'center' },
  option: {
    padding: space.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface,
    borderRadius: radius.md, marginBottom: space.sm,
  },
  optionChosen: { borderColor: colors.accent600, backgroundColor: colors.accent50 },

  tileImage: {
    borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.sunken,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent',
  },
  tileChosen: { borderColor: colors.accent600 },
  tileKind: {
    position: 'absolute', left: 6, bottom: 6, width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(16,16,20,0.55)', alignItems: 'center', justifyContent: 'center',
  },
  tileCheck: {
    position: 'absolute', right: 6, top: 6, width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.accent600, alignItems: 'center', justifyContent: 'center',
  },
  tileCaption: { marginTop: space.xs, color: colors.ink600 },

  previewWrap: { padding: space.md, borderRadius: radius.md, backgroundColor: colors.sunken },
  bubble: {
    alignSelf: 'flex-start', maxWidth: '100%', paddingHorizontal: space.md, paddingVertical: space.sm,
    borderRadius: radius.md, borderTopLeftRadius: radius.xs, backgroundColor: colors.surface,
  },

  stepNumber: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.accent50, alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { ...type.label, color: colors.accent700 },
});
