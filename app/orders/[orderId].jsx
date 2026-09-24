import { useMemo, useState, useEffect } from 'react';
import { Alert as RNAlert, Image, Linking, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  CANCELLATION_REASON_LABELS, CANCELLATION_REASONS, ORDER_STATUS_LABELS, ORDER_TRANSITIONS,
  PAYMENT_METHOD_LABELS, formatMoney,
} from '@storekit/shared';
import {
  ownerCancelOrderSchema, rejectPaymentSchema, updateOrderStatusSchema, verifyPaymentSchema,
} from '@storekit/validation';
import { Screen } from '../../src/components/Screen.jsx';
import {
  Alert, Body, Button, Caption, Card, Divider, ErrorState, Field, Heading, Row, Touchable,
} from '../../src/components/ui.jsx';
import { OrderTimeline, PaymentPill, StatusPill, Thumb } from '../../src/components/domain.jsx';
import { Sheet } from '../../src/components/Sheet.jsx';
import { SkeletonCard, SkeletonList } from '../../src/components/Skeleton.jsx';
import { useToast } from '../../src/components/Toast.jsx';
import { useAuth } from '../../src/state/auth.jsx';
import { useAsync, useAction } from '../../src/lib/useAsync.js';
import { check } from '../../src/lib/validation.js';
import { orders as ordersApi, payments as paymentsApi } from '../../src/api/endpoints.js';
import { formatDate, relativeTime } from '../../src/lib/format.js';
import { colors, radius, space, type } from '../../src/theme.js';

/**
 * Order detail — where the merchant actually works.
 *
 * Three jobs, in the order they matter: decide a pending payment, move the order to its
 * next status, and see what was bought and where it goes. Only transitions the API allows
 * are offered, read from the same table the server enforces, so an impossible action is
 * never rendered rather than rendered and rejected.
 */

const REJECT_REASONS = [
  { value: 'not_received', label: 'Money not received' },
  { value: 'amount_mismatch', label: 'Wrong amount' },
  { value: 'invalid_reference', label: 'Reference not valid' },
  { value: 'duplicate', label: 'Already used on another order' },
  { value: 'other', label: 'Something else' },
];

export default function OrderDetail() {
  const { orderId } = useLocalSearchParams();
  const router = useRouter();
  const navigation = useNavigation();
  const { businessId } = useAuth();

  const toast = useToast();
  const [sheet, setSheet] = useState(null);
  const [note, setNote] = useState('');
  const [rejectReason, setRejectReason] = useState('not_received');
  const [cancelReason, setCancelReason] = useState('customer_request');
  const [restock, setRestock] = useState(true);
  const [noteError, setNoteError] = useState(null);

  const { data: order, error, loading, refreshing, onRefresh, reload, setData } = useAsync(
    () => (businessId && orderId ? ordersApi.get(businessId, String(orderId)) : Promise.resolve(null)),
    [businessId, orderId],
  );

  const nextStatuses = useMemo(() => ORDER_TRANSITIONS[order?.status] ?? [], [order?.status]);

  useEffect(() => {
    if (order) navigation.setOptions?.({ title: order.orderNumber });
  }, [order, navigation]);

  const { run: setStatus, pending: settingStatus, error: statusError } = useAction(async (payload) => {
    const updated = await ordersApi.setStatus(businessId, String(orderId), payload);
    setData(updated);
    setSheet(null);
    setNote('');
    toast.success('Order updated');
  });

  const { run: verifyPayment, pending: verifying, error: verifyError } = useAction(async (payload) => {
    const updated = await paymentsApi.verify(businessId, String(orderId), payload);
    setData(updated);
    setSheet(null);
    setNote('');
    toast.success('Payment verified');
  });

  const { run: rejectPayment, pending: rejecting, error: rejectError } = useAction(async (payload) => {
    const updated = await paymentsApi.reject(businessId, String(orderId), payload);
    setData(updated);
    setSheet(null);
    setNote('');
    toast.info('Payment rejected');
  });

  const { run: cancelOrder, pending: cancelling, error: cancelError } = useAction(async (payload) => {
    const updated = await ordersApi.cancel(businessId, String(orderId), payload);
    setData(updated);
    setSheet(null);
    setNote('');
    toast.info('Order cancelled');
  });

  /**
   * Validates an action's payload against the API's schema before sending it.
   *
   * The note fields are the only free text here, and they carry the same rules the server
   * applies — markup and hidden characters are refused rather than escaped downstream.
   */
  const submitAction = (schema, values, action) => {
    const result = check(schema, values);
    if (!result.ok) {
      setNoteError(result.errors.note ?? Object.values(result.errors)[0]);
      return;
    }
    setNoteError(null);
    action(result.data).catch(() => undefined);
  };

  const noteValue = note.trim() ? { note } : {};

  if (loading && !order) {
    return (
      <Screen>
        <SkeletonCard lines={2} />
        <View style={{ height: space.lg }} />
        <SkeletonList count={2} thumb={48} />
      </Screen>
    );
  }
  if (error && !order) return <ErrorState error={error} onRetry={reload} />;
  if (!order) return null;

  const awaitingVerification = order.paymentStatus === 'PENDING_VERIFICATION';
  const canCancel = !['DELIVERED', 'CANCELLED', 'REJECTED'].includes(order.status);
  const actionError = statusError ?? verifyError ?? rejectError ?? cancelError;

  const callCustomer = () => {
    const number = order.customer?.mobile;
    if (number) Linking.openURL(`tel:+91${number}`).catch(() => undefined);
  };

  const whatsappCustomer = () => {
    const number = order.customer?.mobile;
    if (!number) return;
    const text = encodeURIComponent(`Hi ${order.customer?.name ?? ''}, about your order ${order.orderNumber}:`);
    Linking.openURL(`https://wa.me/91${number}?text=${text}`).catch(() =>
      RNAlert.alert('WhatsApp not available', 'Could not open WhatsApp on this device.'),
    );
  };

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={onRefresh}
      footer={
        nextStatuses.length || canCancel ? (
          <Row gap={space.sm}>
            {canCancel ? (
              <Button title="Cancel order" variant="danger" full={false} style={{ flex: 1 }} onPress={() => setSheet('cancel')} />
            ) : null}
            {nextStatuses.length ? (
              <Button title="Update status" full={false} style={{ flex: 1.4 }} onPress={() => setSheet('status')} />
            ) : null}
          </Row>
        ) : null
      }
    >
      <Row style={styles.head}>
        <View style={{ flex: 1 }}>
          <Heading>{order.orderNumber}</Heading>
          <Caption>Placed {formatDate(order.createdAt)} · {relativeTime(order.createdAt)}</Caption>
        </View>
        <StatusPill status={order.status} />
      </Row>

      {/* Payment sits first whenever it is blocking: it is the decision the merchant
          came here to make, and burying it under a list of items costs them a scroll. */}
      {awaitingVerification ? (
        <Card style={styles.verifyCard}>
          <Row gap={space.md} align="flex-start">
            <Ionicons name="shield-checkmark-outline" size={22} color={colors.warning} />
            <View style={{ flex: 1 }}>
              <Body strong>Payment needs checking</Body>
              <Caption>
                The customer says they sent {formatMoney(order.totals?.total)} by UPI. Match the reference against
                your bank app before you verify.
              </Caption>
            </View>
          </Row>

          {order.upi?.utr ? (
            <View style={styles.utrBox}>
              <Caption>Reference (UTR)</Caption>
              <Body style={styles.utr} selectable>{order.upi.utr}</Body>
              {order.upi.submittedAt ? <Caption>Submitted {relativeTime(order.upi.submittedAt)}</Caption> : null}
            </View>
          ) : null}

          {order.upi?.duplicateOfOrderId ? (
            <Alert
              message="This reference was already used on another order in your store. Check both before verifying."
              tone="warning"
            />
          ) : null}

          {order.upi?.screenshotUrl ? (
            <Image source={{ uri: order.upi.screenshotUrl }} style={styles.screenshot} resizeMode="contain" />
          ) : null}

          <Row gap={space.sm} style={{ marginTop: space.md }}>
            <Button title="Not received" variant="secondary" full={false} style={{ flex: 1 }} onPress={() => setSheet('reject')} />
            <Button title="Payment received" full={false} style={{ flex: 1.3 }} onPress={() => setSheet('verify')} />
          </Row>
        </Card>
      ) : null}

      <Alert message={actionError?.message} />

      <Card style={styles.card}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Body strong>Payment</Body>
          <PaymentPill paymentStatus={order.paymentStatus} paymentMethod={order.paymentMethod} />
        </Row>
        <Divider style={styles.innerDivider} />
        <Row style={{ justifyContent: 'space-between' }}>
          <Caption>Method</Caption>
          <Body>{PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod}</Body>
        </Row>
        {order.upi?.utr && !awaitingVerification ? (
          <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
            <Caption>Reference</Caption>
            <Body selectable style={type.money}>{order.upi.utr}</Body>
          </Row>
        ) : null}
        {order.paymentDecision?.note ? (
          <Caption style={{ marginTop: space.sm }}>Note: {order.paymentDecision.note}</Caption>
        ) : null}
      </Card>

      <Card style={styles.card} padded={false}>
        <View style={styles.cardHead}>
          <Body strong>{order.items.length} item{order.items.length === 1 ? '' : 's'}</Body>
        </View>
        {order.items.map((item, index) => (
          <View key={`${item.productId}-${item.variantId ?? index}`}>
            {index > 0 ? <Divider /> : null}
            <Row style={styles.itemRow} align="flex-start">
              <Thumb uri={item.thumbUrl} size={48} />
              <View style={{ flex: 1 }}>
                <Body strong numberOfLines={2}>{item.name}</Body>
                {item.variantLabel ? <Caption>{item.variantLabel}</Caption> : null}
                <Caption>{item.quantity} × {formatMoney(item.price)}</Caption>
              </View>
              <Body style={type.money}>{formatMoney(item.price * item.quantity)}</Body>
            </Row>
          </View>
        ))}

        <Divider />
        <View style={styles.totals}>
          <TotalLine label="Subtotal" value={order.totals?.subtotal} />
          {order.totals?.discount ? <TotalLine label="Discount" value={-order.totals.discount} /> : null}
          {order.totals?.shipping ? <TotalLine label="Delivery" value={order.totals.shipping} /> : null}
          {order.totals?.tax ? <TotalLine label="Tax" value={order.totals.tax} /> : null}
          <Divider style={styles.innerDivider} />
          <Row style={{ justifyContent: 'space-between' }}>
            <Body strong>Total</Body>
            <Body style={[type.money, styles.grandTotal]}>{formatMoney(order.totals?.total)}</Body>
          </Row>
        </View>
      </Card>

      <Card style={styles.card}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Body strong>Customer</Body>
          {order.customerId ? (
            <Touchable onPress={() => router.push(`/customers/${order.customerId}`)} accessibilityLabel="View customer">
              <Body style={styles.link}>History</Body>
            </Touchable>
          ) : null}
        </Row>
        <Divider style={styles.innerDivider} />
        <Body strong>{order.customer?.name ?? 'Guest'}</Body>
        <Caption>{order.customer?.mobile ? `+91 ${order.customer.mobile}` : 'No number on file'}</Caption>
        {order.address ? (
          <Body muted style={styles.address}>
            {[order.address.line1, order.address.line2, order.address.city, order.address.state, order.address.pincode]
              .filter(Boolean)
              .join(', ')}
          </Body>
        ) : null}

        {order.customer?.mobile ? (
          <Row gap={space.sm} style={{ marginTop: space.md }}>
            <Button title="Call" variant="secondary" size="sm" full={false} style={{ flex: 1 }} onPress={callCustomer} />
            <Button title="WhatsApp" variant="secondary" size="sm" full={false} style={{ flex: 1 }} onPress={whatsappCustomer} />
          </Row>
        ) : null}
      </Card>

      <Card style={styles.card}>
        <Body strong style={{ marginBottom: space.lg }}>Progress</Body>
        <OrderTimeline order={order} />
      </Card>

      {/* ───────── Sheets ───────── */}

      <Sheet visible={sheet === 'status'} onClose={() => setSheet(null)} title="Move this order to">
        {nextStatuses.map((status) => (
          <Touchable
            key={status}
            onPress={() => submitAction(updateOrderStatusSchema, { status, ...noteValue }, setStatus)}
            style={styles.sheetRow}
          >
            <Body strong style={{ flex: 1 }}>{ORDER_STATUS_LABELS[status]}</Body>
            <Ionicons name="chevron-forward" size={18} color={colors.ink400} />
          </Touchable>
        ))}
        <Field
          label="Note (optional)"
          value={note}
          onChangeText={(v) => { setNote(v); setNoteError(null); }}
          error={noteError}
          maxLength={300}
          placeholder="Anything worth recording"
          multiline
        />
        {settingStatus ? <Caption>Updating…</Caption> : null}
      </Sheet>

      <Sheet visible={sheet === 'verify'} onClose={() => setSheet(null)} title="Confirm you received the money">
        <Body muted>
          Only verify once you have seen {formatMoney(order.totals?.total)} in your own bank or UPI app. Verifying
          marks the order paid and cannot be undone.
        </Body>
        {order.upi?.utr ? <Body style={[styles.utr, { marginTop: space.md }]} selectable>{order.upi.utr}</Body> : null}
        <Field
          label="Note (optional)"
          value={note}
          onChangeText={(v) => { setNote(v); setNoteError(null); }}
          error={noteError}
          maxLength={300}
          placeholder="e.g. matched in HDFC statement"
          containerStyle={{ marginTop: space.lg }}
        />
        <Button
          title="Yes, I received it"
          loading={verifying}
          onPress={() => submitAction(verifyPaymentSchema, { confirmedAmountMatches: true, ...noteValue }, verifyPayment)}
        />
      </Sheet>

      <Sheet visible={sheet === 'reject'} onClose={() => setSheet(null)} title="Why are you rejecting this?">
        {REJECT_REASONS.map((reason) => (
          <Touchable key={reason.value} onPress={() => setRejectReason(reason.value)} style={styles.sheetRow}>
            <Body style={{ flex: 1 }}>{reason.label}</Body>
            {rejectReason === reason.value ? (
              <Ionicons name="checkmark-circle" size={20} color={colors.accent600} />
            ) : null}
          </Touchable>
        ))}
        <Field
          label="Note for your records (optional)"
          value={note}
          onChangeText={(v) => { setNote(v); setNoteError(null); }}
          error={noteError}
          maxLength={300}
          placeholder="Optional"
          containerStyle={{ marginTop: space.lg }}
        />
        <Button
          title="Reject payment"
          variant="danger"
          loading={rejecting}
          onPress={() => submitAction(rejectPaymentSchema, { reason: rejectReason, cancelOrder: false, ...noteValue }, rejectPayment)}
        />
      </Sheet>

      <Sheet visible={sheet === 'cancel'} onClose={() => setSheet(null)} title="Cancel this order">
        {CANCELLATION_REASONS.map((reason) => (
          <Touchable key={reason} onPress={() => setCancelReason(reason)} style={styles.sheetRow}>
            <Body style={{ flex: 1 }}>{CANCELLATION_REASON_LABELS[reason]}</Body>
            {cancelReason === reason ? <Ionicons name="checkmark-circle" size={20} color={colors.accent600} /> : null}
          </Touchable>
        ))}
        <Touchable onPress={() => setRestock((v) => !v)} style={styles.sheetRow}>
          <View style={{ flex: 1 }}>
            <Body strong>Put the items back in stock</Body>
            <Caption>Leave this on unless the stock is actually gone.</Caption>
          </View>
          <Ionicons
            name={restock ? 'checkbox' : 'square-outline'}
            size={22}
            color={restock ? colors.accent600 : colors.ink400}
          />
        </Touchable>
        <Field
          label="Note (optional)"
          value={note}
          onChangeText={(v) => { setNote(v); setNoteError(null); }}
          error={noteError}
          maxLength={300}
          placeholder="Optional"
          containerStyle={{ marginTop: space.md }}
        />
        <Button
          title="Cancel order"
          variant="danger"
          loading={cancelling}
          onPress={() => submitAction(ownerCancelOrderSchema, { reason: cancelReason, restock, ...noteValue }, cancelOrder)}
        />
      </Sheet>
    </Screen>
  );
}

const TotalLine = ({ label, value }) => (
  <Row style={{ justifyContent: 'space-between', marginBottom: space.sm }}>
    <Caption>{label}</Caption>
    <Body style={type.money}>{formatMoney(value)}</Body>
  </Row>
);

const styles = StyleSheet.create({
  head: { marginBottom: space.lg },
  card: { marginBottom: space.lg },
  cardHead: { padding: space.lg, paddingBottom: space.md },
  innerDivider: { marginVertical: space.md },

  verifyCard: { marginBottom: space.lg, borderColor: colors.warning, borderWidth: 1, gap: space.md },
  utrBox: { backgroundColor: colors.canvas, borderRadius: radius.md, padding: space.md },
  utr: { ...type.money, fontSize: 17, letterSpacing: 1 },
  screenshot: { width: '100%', height: 220, borderRadius: radius.md, backgroundColor: colors.canvas },

  itemRow: { padding: space.lg },
  totals: { padding: space.lg },
  grandTotal: { fontSize: 18 },

  address: { marginTop: space.sm },
  link: { ...type.label, color: colors.accent700 },

  timelineRow: { marginBottom: space.md },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent500,
    marginTop: 7,
  },

  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    minHeight: 48,
  },
});
