import { useEffect } from 'react';
import { Alert as RNAlert, Linking, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { ORDER_STATUS_LABELS, ORDER_STATUS_TONE, formatMoney } from '@storekit/shared';
import { Screen } from '../../src/components/Screen.jsx';
import {
  Body, Button, Caption, Card, Divider, ErrorState, Heading, Pill, Row, Touchable,
} from '../../src/components/ui.jsx';
import { SkeletonScreen } from '../../src/components/Skeleton.jsx';
import { Thumb } from '../../src/components/domain.jsx';
import { useAuth } from '../../src/state/auth.jsx';
import { useAction, useAsync } from '../../src/lib/useAsync.js';
import { customers as customersApi } from '../../src/api/endpoints.js';
import { formatDate, relativeTime } from '../../src/lib/format.js';
import { colors, space, type } from '../../src/theme.js';

/** One customer: what they have spent, what they have ordered, and how to reach them. */
export default function CustomerDetail() {
  const { customerId } = useLocalSearchParams();
  const router = useRouter();
  const navigation = useNavigation();
  const { businessId } = useAuth();

  const { data: customer, error, loading, refreshing, onRefresh, reload, setData } = useAsync(
    () => (businessId && customerId ? customersApi.get(businessId, String(customerId)) : Promise.resolve(null)),
    [businessId, customerId],
  );

  const { run: toggleBlock, pending: blocking } = useAction(async () => {
    const updated = customer.blocked
      ? await customersApi.unblock(businessId, String(customerId))
      : await customersApi.block(businessId, String(customerId));
    setData((prev) => ({ ...prev, ...updated }));
  });

  useEffect(() => {
    if (customer) navigation.setOptions?.({ title: customer.name ?? 'Customer' });
  }, [customer, navigation]);

  if (loading && !customer) return <SkeletonScreen />;
  if (error && !customer) return <ErrorState error={error} onRetry={reload} />;
  if (!customer) return null;

  const confirmBlock = () =>
    RNAlert.alert(
      customer.blocked ? 'Unblock this customer?' : 'Block this customer?',
      customer.blocked
        ? 'They will no longer be flagged on new orders.'
        : 'Blocking flags them on future orders so you can decide before you pack. It does not stop them ordering.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: customer.blocked ? 'Unblock' : 'Block', onPress: () => toggleBlock().catch(() => undefined) },
      ],
    );

  const call = () => customer.mobile && Linking.openURL(`tel:+91${customer.mobile}`).catch(() => undefined);
  const whatsapp = () =>
    customer.mobile && Linking.openURL(`https://wa.me/91${customer.mobile}`).catch(() => undefined);

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Row gap={space.lg} style={styles.head}>
        <Thumb label={customer.name ?? '?'} size={56} />
        <View style={{ flex: 1 }}>
          <Heading>{customer.name ?? 'Guest'}</Heading>
          <Caption>{customer.mobile ? `+91 ${customer.mobile}` : 'No number on file'}</Caption>
          {customer.blocked ? <Pill label="Blocked" tone="red" style={{ marginTop: 6 }} /> : null}
        </View>
      </Row>

      {customer.mobile ? (
        <Row gap={space.sm} style={styles.contactRow}>
          <Button title="Call" variant="secondary" full={false} style={{ flex: 1 }} onPress={call} />
          <Button title="WhatsApp" variant="secondary" full={false} style={{ flex: 1 }} onPress={whatsapp} />
        </Row>
      ) : null}

      <Card style={styles.card}>
        <Row>
          <View style={styles.stat}>
            <Caption>Spent</Caption>
            <Body style={styles.statValue}>{formatMoney(customer.totalSpend)}</Body>
          </View>
          <View style={styles.stat}>
            <Caption>Orders</Caption>
            <Body style={styles.statValue}>{customer.orderCount ?? 0}</Body>
          </View>
          <View style={styles.stat}>
            <Caption>Cancelled</Caption>
            <Body style={[styles.statValue, (customer.cancelledCount ?? 0) > 1 && { color: colors.warning }]}>
              {customer.cancelledCount ?? 0}
            </Body>
          </View>
        </Row>
        {customer.lastOrderAt ? (
          <Caption style={styles.lastOrder}>Last ordered {relativeTime(customer.lastOrderAt)}</Caption>
        ) : null}
      </Card>

      {customer.lastAddress ? (
        <Card style={styles.card}>
          <Body strong>Last delivery address</Body>
          <Divider style={styles.innerDivider} />
          <Body muted>
            {[
              customer.lastAddress.line1,
              customer.lastAddress.line2,
              customer.lastAddress.city,
              customer.lastAddress.state,
              customer.lastAddress.pincode,
            ]
              .filter(Boolean)
              .join(', ')}
          </Body>
        </Card>
      ) : null}

      <Card style={styles.card} padded={false}>
        <View style={styles.cardHead}>
          <Body strong>Order history</Body>
        </View>
        {customer.orders?.length ? (
          customer.orders.map((order, index) => (
            <View key={order.orderId}>
              {index > 0 ? <Divider /> : null}
              <Touchable onPress={() => router.push(`/orders/${order.orderId}`)} style={styles.orderRow}>
                <View style={{ flex: 1 }}>
                  <Body strong>{order.orderNumber}</Body>
                  <Caption>{formatDate(order.createdAt, undefined, { dateStyle: 'medium' })}</Caption>
                </View>
                <Pill label={ORDER_STATUS_LABELS[order.status]} tone={ORDER_STATUS_TONE[order.status] ?? 'slate'} />
                <Body style={type.money}>{formatMoney(order.total)}</Body>
              </Touchable>
            </View>
          ))
        ) : (
          <View style={styles.emptyOrders}>
            <Body muted>No orders recorded yet.</Body>
          </View>
        )}
      </Card>

      <Button
        title={customer.blocked ? 'Unblock customer' : 'Block customer'}
        variant={customer.blocked ? 'secondary' : 'danger'}
        loading={blocking}
        onPress={confirmBlock}
        style={styles.blockButton}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { marginBottom: space.lg },
  contactRow: { marginBottom: space.lg },
  card: { marginBottom: space.lg },
  cardHead: { padding: space.lg, paddingBottom: space.md },
  innerDivider: { marginVertical: space.md },
  stat: { flex: 1, gap: 2 },
  statValue: { ...type.title, fontSize: 20, color: colors.ink900 },
  lastOrder: { marginTop: space.md },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  emptyOrders: { padding: space.xl },
  blockButton: { marginTop: space.md },
});
