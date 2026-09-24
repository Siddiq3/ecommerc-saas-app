import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ListScreen, useListPadding } from '../src/components/Screen.jsx';
import {
  Body, Button, Caption, Divider, EmptyState, ErrorState, Row, Touchable,
} from '../src/components/ui.jsx';
import { SkeletonScreen } from '../src/components/Skeleton.jsx';
import { useAuth } from '../src/state/auth.jsx';
import { usePaginated } from '../src/lib/usePaginated.js';
import { useAction } from '../src/lib/useAsync.js';
import { notifications as notificationsApi } from '../src/api/endpoints.js';
import { relativeTime } from '../src/lib/format.js';
import { colors, radius, space } from '../src/theme.js';

/** Activity: what happened in the store while the merchant was not looking. */

const ICONS = {
  order_created: 'receipt-outline',
  order_cancelled: 'close-circle-outline',
  payment_submitted: 'card-outline',
  payment_verified: 'checkmark-circle-outline',
  payment_rejected: 'alert-circle-outline',
  low_stock: 'trending-down-outline',
  out_of_stock: 'warning-outline',
  plan_limit: 'lock-closed-outline',
};

export default function Notifications() {
  const router = useRouter();
  const { businessId } = useAuth();
  const padding = useListPadding();

  const list = usePaginated(
    (cursor) =>
      businessId ? notificationsApi.list(businessId, { cursor }) : Promise.resolve({ items: [], nextCursor: null }),
    [businessId],
  );

  const { run: markAllRead, pending: marking } = useAction(async () => {
    await notificationsApi.markAllRead(businessId);
    await list.reload();
  });

  const open = async (item) => {
    if (!item.read) {
      list.patchItem('notificationId', item.notificationId, { read: true });
      notificationsApi.markRead(businessId, item.notificationId).catch(() => undefined);
    }
    if (item.orderId) router.push(`/orders/${item.orderId}`);
    else if (item.productId) router.push(`/products/${item.productId}`);
  };

  if (list.loading && !list.items.length) return <SkeletonScreen />;

  const hasUnread = list.items.some((item) => !item.read);

  return (
    <ListScreen
      footer={
        hasUnread ? (
          <Button
            title="Mark all as read"
            variant="secondary"
            loading={marking}
            onPress={() => markAllRead().catch(() => undefined)}
          />
        ) : null
      }
    >
      <FlatList
        data={list.items}
        keyExtractor={(item) => item.notificationId}
        renderItem={({ item }) => (
          <Touchable onPress={() => open(item)} style={styles.row} accessibilityLabel={item.title}>
            <View style={[styles.icon, !item.read && styles.iconUnread]}>
              <Ionicons
                name={ICONS[item.type] ?? 'ellipse-outline'}
                size={18}
                color={item.read ? colors.ink500 : colors.accent700}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Row gap={space.sm}>
                <Body strong={!item.read} style={{ flex: 1 }}>{item.title}</Body>
                {!item.read ? <View style={styles.dot} /> : null}
              </Row>
              {item.body ? <Caption numberOfLines={2}>{item.body}</Caption> : null}
              <Caption style={styles.time}>{relativeTime(item.createdAt)}</Caption>
            </View>
          </Touchable>
        )}
        ItemSeparatorComponent={Divider}
        contentContainerStyle={[padding, styles.content]}
        style={styles.list}
        refreshControl={
          <RefreshControl refreshing={list.refreshing} onRefresh={list.onRefresh} tintColor={colors.accent600} colors={[colors.accent600]} />
        }
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.4}
        ListFooterComponent={list.loadingMore ? <ActivityIndicator style={styles.more} color={colors.accent600} /> : null}
        ListEmptyComponent={
          list.error ? (
            <ErrorState error={list.error} onRetry={list.reload} />
          ) : (
            <EmptyState
              icon="🔔"
              title="Nothing yet"
              message="New orders, payments and stock warnings will show up here."
            />
          )
        }
      />
    </ListScreen>
  );
}

const styles = StyleSheet.create({
  list: { backgroundColor: colors.canvas },
  content: { backgroundColor: colors.canvas, flexGrow: 1, paddingHorizontal: 0 },
  row: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.lg,
    backgroundColor: colors.surface,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconUnread: { backgroundColor: colors.accent50 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent600, marginTop: 6 },
  time: { marginTop: 2 },
  more: { paddingVertical: space.xl },
});
