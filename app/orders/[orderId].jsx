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
  Alert, Body, Button, Caption, Card, Divider, ErrorState, Field, Row, Touchable,
} from '../../src/components/ui.jsx';
import { OrderTimeline, PaymentPill, StatusPill, Thumb } from '../../src/components/domain.jsx';
import { Sheet } from '../../src/components/Sheet.jsx';
import { SkeletonCard, SkeletonList } from '../../src/components/Skeleton.jsx';
import { useToast } from '../../src/components/Toast.jsx';
import { useAuth } from '../../src/state/auth.jsx';
import { useT } from '../../src/state/locale.jsx';
import { msg } from '../../src/lib/i18n.js';
import { useAsync, useAction } from '../../src/lib/useAsync.js';
import { check } from '../../src/lib/validation.js';
import { orders as ordersApi, payments as paymentsApi } from '../../src/api/endpoints.js';
import { formatDate, relativeTime } from '../../src/lib/format.js';
import { codConfirmMessage, orderUpdateMessage, waLink } from '../../src/lib/whatsapp.js';
import { storeUrl } from '../../src/lib/storefront.js';
import { invoiceHtml } from '../../src/lib/invoiceHtml.js';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
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
  { value: 'not_received', label: msg('Money not received') },
  { value: 'amount_mismatch', label: msg('Wrong amount') },
  { value: 'invalid_reference', label: msg('Reference not valid') },
  { value: 'duplicate', label: msg('Already used on another order') },
  { value: 'other', label: msg('Something else') },
];

export default function OrderDetail() {
  const { orderId } = useLocalSearchParams();
  const router = useRouter();
  const navigation = useNavigation();
  const { businessId, business } = useAuth();
  const t = useT();

  const toast = useToast();
  const [billBusy, setBillBusy] = useState(false);
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

  const { run: setStatus, pending: settingStatus, error: statusError, clearError: clearStatusError } = useAction(async (payload) => {
    const updated = await ordersApi.setStatus(businessId, String(orderId), payload);
    setData(updated);
    setSheet(null);
    setNote('');
    toast.success(t('Order updated'));
  });

  const { run: verifyPayment, pending: verifying, error: verifyError, clearError: clearVerifyError } = useAction(async (payload) => {
    const updated = await paymentsApi.verify(businessId, String(orderId), payload);
    setData(updated);
    setSheet(null);
    setNote('');
    toast.success(t('Payment verified'));
  });

  const { run: rejectPayment, pending: rejecting, error: rejectError, clearError: clearRejectError } = useAction(async (payload) => {
    const updated = await paymentsApi.reject(businessId, String(orderId), payload);
    setData(updated);
    setSheet(null);
    setNote('');
    toast.info(t('Payment rejected'));
  });

  const { run: cancelOrder, pending: cancelling, error: cancelError, clearError: clearCancelError } = useAction(async (payload) => {
    const updated = await ordersApi.cancel(businessId, String(orderId), payload);
    setData(updated);
    setSheet(null);
    setNote('');
    toast.info(t('Order cancelled'));
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

  /** Every sheet opens clean: no note or error carried over from another action. */
  const openSheet = (name) => {
    clearStatusError();
    clearVerifyError();
    clearRejectError();
    clearCancelError();
    setNote('');
    setNoteError(null);
    setSheet(name);
  };

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

  // Opens one chat with this customer, message typed in; the seller reviews it and taps Send.
  const openWhatsApp = (text) => {
    const link = waLink(order.customer?.mobile, text);
    if (!link) return;
    Linking.openURL(link).catch(() =>
      RNAlert.alert(t('WhatsApp not available'), t('Could not open WhatsApp on this device.')),
    );
  };
  const storeName = business?.name ?? '';
  const trackUrl = business?.slug ? `${storeUrl(business.slug)}/track` : null;
  const whatsappCustomer = () => openWhatsApp(orderUpdateMessage(order, storeName, trackUrl));
  // The bill as a PDF, through the share sheet (WhatsApp, print, save). Numbered once by the API.
  const shareBill = async () => {
    setBillBusy(true);
    try {
      const bill = await ordersApi.invoice(businessId, order.orderId);
      const { uri } = await Print.printToFileAsync({ html: invoiceHtml(bill) });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: bill.number, UTI: 'com.adobe.pdf' });
    } catch (err) {
      toast.error(err?.message ?? t('Could not create the bill. Please try again.'));
    } finally {
      setBillBusy(false);
    }
  };
  const awaitingCodConfirmation = order.paymentMethod === 'COD' && ['NEW', 'CONFIRMED', 'PREPARING', 'READY_TO_SHIP'].includes(order.status);

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={onRefresh}
      footer={
        nextStatuses.length || canCancel ? (
          <Row gap={space.sm}>
            {canCancel ? (
              <Button title={t('Cancel order')} variant="danger" full={false} style={{ flex: 1 }} onPress={() => openSheet('cancel')} />
            ) : null}
            {nextStatuses.length ? (
              // Quieter while a payment waits to be checked: that card holds the one primary action.
              <Button
                title={t('Update status')}
                variant={awaitingVerification ? 'secondary' : 'primary'}
                full={false}
                style={{ flex: 1.4 }}
                onPress={() => openSheet('status')}
              />
            ) : null}
          </Row>
        ) : null
      }
    >
      <Row style={styles.head}>
        {/* The order number is already the screen title. */}
        <View style={{ flex: 1 }}>
          <Body strong>{t('Placed {time}', { time: relativeTime(order.createdAt) })}</Body>
          <Caption>{formatDate(order.createdAt)}</Caption>
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
              <Body strong>{t('Payment needs checking')}</Body>
              <Caption>
                {t('The customer says they sent {amount} by UPI. Match the reference against your bank app before you verify.', { amount: formatMoney(order.totals?.total) })}
              </Caption>
            </View>
          </Row>

          {order.upi?.utr ? (
            <View style={styles.utrBox}>
              <Caption>{t('Reference (UTR)')}</Caption>
              <Body style={styles.utr} selectable>{order.upi.utr}</Body>
              {order.upi.submittedAt ? <Caption>{t('Submitted {time}', { time: relativeTime(order.upi.submittedAt) })}</Caption> : null}
            </View>
          ) : null}

          {order.upi?.duplicateOfOrderId ? (
            <Alert
              message={t('This reference was already used on another order in your store. Check both before verifying.')}
              tone="warning"
            />
          ) : null}

          {order.upi?.screenshotUrl ? (
            <Image source={{ uri: order.upi.screenshotUrl }} style={styles.screenshot} resizeMode="contain" />
          ) : null}

          {/* Stacked, full width: side by side, both labels wrap onto two lines on phones up to 375pt. */}
          <View style={styles.verifyActions}>
            <Button title={t('Payment received')} onPress={() => openSheet('verify')} />
            <Button title={t('Not received')} variant="secondary" onPress={() => openSheet('reject')} />
          </View>
        </Card>
      ) : null}

      <Alert message={actionError?.message} />

      <Card style={styles.card}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Body strong>{t('Payment')}</Body>
          <PaymentPill paymentStatus={order.paymentStatus} paymentMethod={order.paymentMethod} />
        </Row>
        <Divider style={styles.innerDivider} />
        <Row style={{ justifyContent: 'space-between' }}>
          <Caption>{t('Method')}</Caption>
          <Body>{t(PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod)}</Body>
        </Row>
        {order.upi?.utr && !awaitingVerification ? (
          <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
            <Caption>{t('Reference')}</Caption>
            <Body selectable style={type.money}>{order.upi.utr}</Body>
          </Row>
        ) : null}
        {order.paymentDecision?.note ? (
          <Caption style={{ marginTop: space.sm }}>{t('Note: {note}', { note: order.paymentDecision.note })}</Caption>
        ) : null}
      </Card>

      <Card style={styles.card} padded={false}>
        <View style={styles.cardHead}>
          <Body strong>{t(order.items.length === 1 ? '{n} item' : '{n} items', { n: order.items.length })}</Body>
        </View>
        {order.items.map((item, index) => (
          <View key={`${item.productId}-${item.variantId ?? index}`}>
            {index > 0 ? <Divider /> : null}
            <Row style={styles.itemRow} align="flex-start">
              <Thumb uri={item.thumbUrl} size={48} />
              {/* Total on the quantity line, not beside the name: a long name keeps the full width. */}
              <View style={{ flex: 1 }}>
                <Body strong numberOfLines={3}>{item.name}</Body>
                {item.variantLabel ? <Caption>{item.variantLabel}</Caption> : null}
                <Row style={{ justifyContent: 'space-between' }} gap={space.sm}>
                  <Caption style={{ flexShrink: 1 }}>{item.quantity} × {formatMoney(item.unitPrice)}</Caption>
                  <Body style={type.money}>{formatMoney(item.lineTotal)}</Body>
                </Row>
              </View>
            </Row>
          </View>
        ))}

        <Divider />
        <View style={styles.totals}>
          <TotalLine label={t('Subtotal')} value={order.totals?.subtotal} />
          {order.totals?.couponDiscount ? (
            <TotalLine label={order.coupon?.code ? t('Coupon {code}', { code: order.coupon.code }) : t('Coupon')} value={-order.totals.couponDiscount} />
          ) : null}
          <TotalLine
            label={order.delivery?.name ?? t('Delivery')}
            value={order.totals?.deliveryFee ?? 0}
            display={order.totals?.deliveryFee ? undefined : t('Free')}
          />
          {order.delivery?.estimate ? (
            <Caption style={styles.estimate}>{t('{estimate} (estimated at checkout)', { estimate: order.delivery.estimate.label })}</Caption>
          ) : null}
          <Divider style={styles.innerDivider} />
          <Row style={{ justifyContent: 'space-between' }}>
            <Body strong>{t('Total')}</Body>
            <Body style={[type.money, styles.grandTotal]}>{formatMoney(order.totals?.total)}</Body>
          </Row>
        </View>
        {order.demo ? null : (
          <Button
            title={t('Share bill (PDF)')}
            variant="secondary"
            size="sm"
            icon={<Ionicons name="document-text-outline" size={18} color={colors.ink900} />}
            onPress={shareBill}
            loading={billBusy}
            style={{ marginTop: space.md }}
          />
        )}
      </Card>

      <Card style={styles.card}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Body strong>{t('Customer')}</Body>
          {order.customerId ? (
            <Touchable onPress={() => router.push(`/customers/${order.customerId}`)} accessibilityLabel={t('View customer')}>
              <Body style={styles.link}>{t('History')}</Body>
            </Touchable>
          ) : null}
        </Row>
        <Divider style={styles.innerDivider} />
        <Body strong>{order.customer?.name ?? t('Guest')}</Body>
        <Caption>{order.customer?.mobile ? `+91 ${order.customer.mobile}` : t('No number on file')}</Caption>
        {order.address ? (
          <Body muted style={styles.address}>
            {[order.address.houseNo, order.address.street, order.address.area, order.address.landmark, order.address.city, order.address.state, order.address.pincode]
              .filter(Boolean)
              .join(', ')}
          </Body>
        ) : null}

        {order.customer?.mobile ? (
          <Row gap={space.sm} style={{ marginTop: space.md }}>
            <Button title={t('Call')} variant="secondary" size="sm" full={false} style={{ flex: 1 }} onPress={callCustomer} />
            <Button title={t('WhatsApp')} variant="secondary" size="sm" full={false} style={{ flex: 1 }} onPress={whatsappCustomer} accessibilityLabel={t('Send order update on WhatsApp')} />
          </Row>
        ) : null}
        {order.customer?.mobile && awaitingCodConfirmation ? (
          <>
            <Button
              title={t('Confirm COD on WhatsApp')}
              icon={<Ionicons name="logo-whatsapp" size={18} color={colors.surface} />}
              size="sm"
              style={{ marginTop: space.sm }}
              onPress={() => openWhatsApp(codConfirmMessage(order, storeName))}
            />
            <Caption style={{ marginTop: space.xs }}>{t('Ask the customer to reply YES before you ship. Fewer parcels come back unpaid.')}</Caption>
          </>
        ) : null}
      </Card>

      <Card style={styles.card}>
        <Body strong style={{ marginBottom: space.lg }}>{t('Progress')}</Body>
        <OrderTimeline order={order} />
      </Card>

      {/* ───────── Sheets ───────── */}

      <Sheet visible={sheet === 'status'} onClose={() => setSheet(null)} title={t('Move this order to')}>
        <Alert message={statusError?.message} />
        {nextStatuses.map((status) => (
          <Touchable
            key={status}
            onPress={() => submitAction(updateOrderStatusSchema, { status, ...noteValue }, setStatus)}
            style={styles.sheetRow}
          >
            <Body strong style={{ flex: 1 }}>{t(ORDER_STATUS_LABELS[status])}</Body>
            <Ionicons name="chevron-forward" size={18} color={colors.ink400} />
          </Touchable>
        ))}
        <Field
          label={t('Note (optional)')}
          value={note}
          onChangeText={(v) => { setNote(v); setNoteError(null); }}
          error={noteError}
          maxLength={300}
          placeholder={t('Enter a note')}
          multiline
        />
        {settingStatus ? <Caption>{t('Updating…')}</Caption> : null}
      </Sheet>

      <Sheet visible={sheet === 'verify'} onClose={() => setSheet(null)} title={t('Confirm you received the money')}>
        <Alert message={verifyError?.message} />
        <Body muted>
          {t('Only verify once you have seen {amount} in your own bank or UPI app. Verifying marks the order paid and cannot be undone.', { amount: formatMoney(order.totals?.total) })}
        </Body>
        {order.upi?.utr ? <Body style={[styles.utr, { marginTop: space.md }]} selectable>{order.upi.utr}</Body> : null}
        <Field
          label={t('Note (optional)')}
          value={note}
          onChangeText={(v) => { setNote(v); setNoteError(null); }}
          error={noteError}
          maxLength={300}
          placeholder={t('Enter a note')}
          containerStyle={{ marginTop: space.lg }}
        />
        <Button
          title={t('Yes, I received it')}
          loading={verifying}
          onPress={() => submitAction(verifyPaymentSchema, { confirmedAmountMatches: true, ...noteValue }, verifyPayment)}
        />
      </Sheet>

      <Sheet visible={sheet === 'reject'} onClose={() => setSheet(null)} title={t('Why are you rejecting this?')}>
        <Alert message={rejectError?.message} />
        {REJECT_REASONS.map((reason) => (
          <Touchable key={reason.value} onPress={() => setRejectReason(reason.value)} style={styles.sheetRow}>
            <Body style={{ flex: 1 }}>{t(reason.label)}</Body>
            {rejectReason === reason.value ? (
              <Ionicons name="checkmark-circle" size={20} color={colors.accent600} />
            ) : null}
          </Touchable>
        ))}
        <Field
          label={t('Note for your records (optional)')}
          value={note}
          onChangeText={(v) => { setNote(v); setNoteError(null); }}
          error={noteError}
          maxLength={300}
          placeholder={t('Enter a note')}
          containerStyle={{ marginTop: space.lg }}
        />
        <Button
          title={t('Reject payment')}
          variant="danger"
          loading={rejecting}
          onPress={() => submitAction(rejectPaymentSchema, { reason: rejectReason, cancelOrder: false, ...noteValue }, rejectPayment)}
        />
      </Sheet>

      <Sheet visible={sheet === 'cancel'} onClose={() => setSheet(null)} title={t('Cancel this order')}>
        <Alert message={cancelError?.message} />
        {CANCELLATION_REASONS.map((reason) => (
          <Touchable key={reason} onPress={() => setCancelReason(reason)} style={styles.sheetRow}>
            <Body style={{ flex: 1 }}>{t(CANCELLATION_REASON_LABELS[reason])}</Body>
            {cancelReason === reason ? <Ionicons name="checkmark-circle" size={20} color={colors.accent600} /> : null}
          </Touchable>
        ))}
        <Touchable onPress={() => setRestock((v) => !v)} style={styles.sheetRow}>
          <View style={{ flex: 1 }}>
            <Body strong>{t('Put the items back in stock')}</Body>
            <Caption>{t('Leave this on unless the stock is actually gone.')}</Caption>
          </View>
          <Ionicons
            name={restock ? 'checkbox' : 'square-outline'}
            size={22}
            color={restock ? colors.accent600 : colors.ink400}
          />
        </Touchable>
        <Field
          label={t('Note (optional)')}
          value={note}
          onChangeText={(v) => { setNote(v); setNoteError(null); }}
          error={noteError}
          maxLength={300}
          placeholder={t('Enter a note')}
          containerStyle={{ marginTop: space.md }}
        />
        <Button
          title={t('Cancel order')}
          variant="danger"
          loading={cancelling}
          onPress={() => submitAction(ownerCancelOrderSchema, { reason: cancelReason, restock, ...noteValue }, cancelOrder)}
        />
      </Sheet>
    </Screen>
  );
}

const TotalLine = ({ label, value, display }) => (
  <Row style={{ justifyContent: 'space-between', marginBottom: space.sm }}>
    <Caption style={{ flex: 1 }}>{label}</Caption>
    <Body style={type.money}>{display ?? formatMoney(value)}</Body>
  </Row>
);

const styles = StyleSheet.create({
  estimate: { marginTop: -space.xs, marginBottom: space.sm },
  verifyActions: { marginTop: space.md, gap: space.sm },
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
