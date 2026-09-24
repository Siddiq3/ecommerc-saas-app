import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Body, Caption, Touchable } from './ui.jsx';
import { usePlan } from '../state/plan.jsx';
import { colors, radius, space, type } from '../theme.js';

/**
 * The trial and billing banner.
 *
 * It states the situation and opens the paywall screen — it never opens a browser or
 * mentions a price, because a banner is not a place anyone should be deciding to spend
 * money. The paywall explains, and the website charges.
 */
export const PlanBanner = () => {
  const router = useRouter();
  const { status, planStatus } = usePlan();

  if (!status || planStatus === 'subscribed') return null;

  const days = status.trialDaysRemaining ?? 0;
  const accessDays = status.accessDaysRemaining ?? 0;

  const content = {
    trial_active:
      days <= 1
        ? { tone: 'warn', icon: 'time-outline', title: 'Your trial ends today', body: 'Pick a plan to keep your store open.' }
        : { tone: 'info', icon: 'sparkles-outline', title: `${days} days left in your trial`, body: 'Pick a plan whenever you are ready.' },
    trial_expired: { tone: 'stop', icon: 'lock-closed-outline', title: 'Your trial has ended', body: 'Choose a plan to reopen your store.' },
    past_due: { tone: 'stop', icon: 'alert-circle-outline', title: 'Payment failed', body: 'Update your payment to avoid losing access.' },
    cancelled: {
      tone: 'warn',
      icon: 'information-circle-outline',
      title: 'Subscription cancelled',
      body: accessDays > 0 ? `You have access for ${accessDays} more day${accessDays === 1 ? '' : 's'}.` : 'Resubscribe to continue.',
    },
  }[planStatus];

  if (!content) return null;

  const palette = {
    info: { bg: colors.accent50, fg: colors.accent900, icon: colors.accent700 },
    warn: { bg: colors.warningTint, fg: '#78350f', icon: colors.warning },
    stop: { bg: colors.dangerTint, fg: '#7f1d1d', icon: colors.danger },
  }[content.tone];

  return (
    <Touchable
      onPress={() => router.push('/paywall')}
      accessibilityLabel={`${content.title}. ${content.body}`}
      style={[styles.banner, { backgroundColor: palette.bg }]}
    >
      <Ionicons name={content.icon} size={20} color={palette.icon} />
      <View style={{ flex: 1 }}>
        <Body strong style={{ color: palette.fg }}>{content.title}</Body>
        <Caption style={{ color: palette.fg, opacity: 0.85 }}>{content.body}</Caption>
      </View>
      <Body style={[styles.action, { color: palette.icon }]}>View plans</Body>
    </Touchable>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    marginBottom: space.lg,
  },
  action: { ...type.label },
});
