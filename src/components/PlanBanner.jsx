import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Body, Caption } from './ui.jsx';
import { usePlan } from '../state/plan.jsx';
import { colors, radius, space } from '../theme.js';

/**
 * The trial and plan status banner.
 *
 * Information only: it says where the account stands and does nothing when tapped. The
 * app is consumption-only (see src/state/plan.jsx), so there is no plan, price or
 * purchase link here, and there must not be one.
 */
export const PlanBanner = () => {
  const { status, planStatus } = usePlan();

  if (!status || planStatus === 'subscribed') return null;

  const days = status.trialDaysRemaining ?? 0;
  const accessDays = status.accessDaysRemaining ?? 0;

  const content = {
    trial_active:
      days <= 1
        ? { tone: 'warn', icon: 'time-outline', title: 'Your free trial ends today', body: 'Your store stays open until the trial ends.' }
        : { tone: 'info', icon: 'sparkles-outline', title: `${days} days left in your free trial`, body: 'Your store is open while your trial lasts.' },
    trial_expired: {
      tone: 'stop',
      icon: 'lock-closed-outline',
      title: 'Free trial ended',
      body: 'Your free trial has ended. Your account is currently inactive.',
    },
    past_due: {
      tone: 'stop',
      icon: 'alert-circle-outline',
      title: 'Subscription inactive',
      body: 'Your subscription could not be renewed. Your account is currently inactive.',
    },
    cancelled: {
      tone: 'warn',
      icon: 'information-circle-outline',
      title: 'Subscription cancelled',
      body: accessDays > 0
        ? `You have access for ${accessDays} more day${accessDays === 1 ? '' : 's'}.`
        : 'Your subscription has been cancelled.',
    },
  }[planStatus];

  if (!content) return null;

  const palette = {
    info: { bg: colors.accent50, fg: colors.accent900, icon: colors.accent700 },
    warn: { bg: colors.warningTint, fg: '#78350f', icon: colors.warning },
    stop: { bg: colors.dangerTint, fg: '#7f1d1d', icon: colors.danger },
  }[content.tone];

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${content.title}. ${content.body}`}
      style={[styles.banner, { backgroundColor: palette.bg }]}
    >
      <Ionicons name={content.icon} size={20} color={palette.icon} />
      <View style={{ flex: 1 }}>
        <Body strong style={{ color: palette.fg }}>{content.title}</Body>
        <Caption style={{ color: palette.fg, opacity: 0.85 }}>{content.body}</Caption>
      </View>
    </View>
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
});
