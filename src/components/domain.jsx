import { Image, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ORDER_STATUS_LABELS, ORDER_STATUS_TONE, PAYMENT_STATUS_LABELS, PAYMENT_METHOD_LABELS,
} from '@storekit/shared';
import { Body, Caption, Pill, Row, Touchable } from './ui.jsx';
import { colors, fonts, radius, space, type } from '../theme.js';
import { formatMoney, formatDate, relativeTime, initials } from '../lib/format.js';

/** Shared pieces that know about the domain: orders, products, customers. */

export const StatusPill = ({ status }) => (
  <Pill label={ORDER_STATUS_LABELS[status] ?? status} tone={ORDER_STATUS_TONE[status] ?? 'slate'} />
);

export const PaymentPill = ({ paymentStatus, paymentMethod }) => {
  if (paymentStatus === 'NOT_REQUIRED') return <Pill label={PAYMENT_METHOD_LABELS[paymentMethod] ?? 'COD'} tone="slate" />;

  const tone = {
    PENDING_SUBMISSION: 'amber',
    PENDING_VERIFICATION: 'amber',
    VERIFIED: 'green',
    REJECTED: 'red',
    EXPIRED: 'slate',
  }[paymentStatus] ?? 'slate';

  return <Pill label={PAYMENT_STATUS_LABELS[paymentStatus] ?? paymentStatus} tone={tone} />;
};

/**
 * A square image with a lettered fallback. Products without a photo are the norm on day
 * one, so the fallback is a designed state rather than a broken-image icon.
 */
export const Thumb = ({ uri, label, size = 52, icon = 'cube-outline' }) => {
  if (uri) {
    return <Image source={{ uri }} style={[styles.thumb, { width: size, height: size }]} resizeMode="cover" />;
  }
  return (
    <View style={[styles.thumb, styles.thumbFallback, { width: size, height: size }]}>
      {label ? (
        <Body style={styles.thumbInitials}>{initials(label)}</Body>
      ) : (
        <Ionicons name={icon} size={size * 0.42} color={colors.ink400} />
      )}
    </View>
  );
};

export const OrderRow = ({ order, onPress }) => (
  <Touchable onPress={onPress} style={styles.row} accessibilityLabel={`Order ${order.orderNumber}`}>
    <Thumb uri={order.thumbUrl} icon="receipt-outline" />
    <View style={styles.rowBody}>
      <Row style={{ justifyContent: 'space-between' }} gap={space.sm}>
        <Body strong numberOfLines={1} style={{ flex: 1 }}>
          {order.customerName ?? order.customer?.name ?? 'Guest'}
        </Body>
        <Body style={styles.money}>{formatMoney(order.total)}</Body>
      </Row>
      <Caption numberOfLines={1}>
        {order.orderNumber} · {relativeTime(order.createdAt)}
        {order.itemCount ? ` · ${order.itemCount} item${order.itemCount === 1 ? '' : 's'}` : ''}
      </Caption>
      <Row gap={space.sm} style={styles.rowPills}>
        <StatusPill status={order.status} />
        {order.paymentStatus === 'PENDING_VERIFICATION' ? <Pill label="Verify payment" tone="amber" /> : null}
        {order.duplicateUtr ? <Pill label="Duplicate reference" tone="red" /> : null}
      </Row>
    </View>
    <Ionicons name="chevron-forward" size={18} color={colors.ink400} />
  </Touchable>
);

export const ProductRow = ({ product, onPress }) => {
  const stockDot = { in_stock: colors.success, low_stock: colors.warning, out_of_stock: colors.danger }[product.stockLabel] ?? colors.ink400;
  const stockText = {
    in_stock: `${product.stock} in stock`,
    low_stock: `Only ${product.stock} left`,
    out_of_stock: 'Out of stock',
  }[product.stockLabel] ?? `${product.stock} in stock`;
  const off = product.mrp > product.price ? Math.round((1 - product.price / product.mrp) * 100) : 0;

  return (
    <Touchable onPress={onPress} style={styles.row} accessibilityLabel={product.name}>
      <View>
        <Thumb uri={product.thumbUrl} size={58} />
        {product.featured ? (
          <View style={styles.featuredBadge}>
            <Ionicons name="star" size={9} color="#ffffff" />
          </View>
        ) : null}
      </View>
      <View style={styles.rowBody}>
        <Body strong numberOfLines={1}>{product.name}</Body>
        <Row gap={space.sm}>
          <Body style={styles.money}>{formatMoney(product.price)}</Body>
          {off > 0 ? <Caption style={styles.strike}>{formatMoney(product.mrp)}</Caption> : null}
          {off > 0 ? <Caption style={styles.off}>{off}% off</Caption> : null}
        </Row>
        <Row gap={6} style={styles.rowPills}>
          {product.trackInventory ? (
            <>
              <View style={[styles.stockDot, { backgroundColor: stockDot }]} />
              <Caption style={{ color: stockDot === colors.ink400 ? colors.ink500 : stockDot }}>{stockText}</Caption>
            </>
          ) : (
            <Caption>Made to order</Caption>
          )}
          {!product.active ? <Pill label="Hidden" tone="slate" style={{ marginLeft: space.xs }} /> : null}
        </Row>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.ink400} />
    </Touchable>
  );
};

export const CustomerRow = ({ customer, onPress }) => (
  <Touchable onPress={onPress} style={styles.row} accessibilityLabel={customer.name ?? customer.mobile}>
    <Thumb label={customer.name ?? '?'} size={44} />
    <View style={styles.rowBody}>
      <Row style={{ justifyContent: 'space-between' }} gap={space.sm}>
        <Body strong numberOfLines={1} style={{ flex: 1 }}>{customer.name ?? 'Guest'}</Body>
        <Body style={styles.money}>{formatMoney(customer.totalSpend)}</Body>
      </Row>
      <Caption numberOfLines={1}>
        {customer.mobile ?? '—'}
        {customer.city ? ` · ${customer.city}` : ''}
        {customer.lastOrderAt ? ` · ${relativeTime(customer.lastOrderAt)}` : ''}
      </Caption>
      <Row gap={space.sm} style={styles.rowPills}>
        <Pill label={`${customer.orderCount} order${customer.orderCount === 1 ? '' : 's'}`} tone="slate" />
        {customer.blocked ? <Pill label="Blocked" tone="red" /> : null}
        {customer.cancelledCount > 1 ? <Pill label={`${customer.cancelledCount} cancelled`} tone="amber" /> : null}
      </Row>
    </View>
    <Ionicons name="chevron-forward" size={18} color={colors.ink400} />
  </Touchable>
);

/** A labelled figure. `delta` is a signed percentage against the comparison period. */
export const Stat = ({ label, value, delta, style }) => (
  <View style={[styles.stat, style]}>
    <Caption>{label}</Caption>
    <Body style={styles.statValue}>{value}</Body>
    {typeof delta === 'number' && delta !== 0 ? (
      <Row gap={2}>
        <Ionicons
          name={delta > 0 ? 'trending-up' : 'trending-down'}
          size={13}
          color={delta > 0 ? colors.success : colors.danger}
        />
        <Caption style={{ color: delta > 0 ? colors.success : colors.danger }}>
          {Math.abs(delta)}% vs yesterday
        </Caption>
      </Row>
    ) : (
      <Caption>—</Caption>
    )}
  </View>
);

export const SectionHeader = ({ title, action, onAction }) => (
  <Row style={styles.sectionHeader}>
    <Body strong style={{ flex: 1 }}>{title}</Body>
    {action ? (
      <Touchable onPress={onAction} accessibilityLabel={action}>
        <Body style={styles.sectionAction}>{action}</Body>
      </Touchable>
    ) : null}
  </Row>
);

/**
 * The order's journey as a vertical timeline.
 *
 * The happy path is a fixed spine — placed, confirmed, preparing, on its way, delivered —
 * and each milestone is marked done, current, or still to come. This is the difference
 * between a merchant reading a status word and *seeing* where an order sits and what
 * happens next. A cancelled or rejected order breaks the spine with a red terminal marker
 * rather than pretending it is still travelling.
 *
 * `order.timeline` supplies the real timestamps; the spine supplies the shape, so an order
 * that skipped a step still reads as continuous.
 */
const ORDER_SPINE = [
  { key: 'placed', label: 'Order placed', matches: ['NEW', 'PENDING_PAYMENT'] },
  { key: 'confirmed', label: 'Confirmed', matches: ['PAYMENT_VERIFIED', 'CONFIRMED'] },
  { key: 'preparing', label: 'Preparing', matches: ['PREPARING', 'READY_TO_SHIP'] },
  { key: 'shipped', label: 'On its way', matches: ['SHIPPED'] },
  { key: 'delivered', label: 'Delivered', matches: ['DELIVERED'] },
];

const SPINE_INDEX = ORDER_SPINE.reduce((acc, step, i) => {
  step.matches.forEach((s) => { acc[s] = i; }); return acc;
}, {});

export const OrderTimeline = ({ order }) => {
  const history = order.timeline ?? [];
  const timeFor = (matches) => {
    const entry = [...history].reverse().find((e) => matches.includes(e.status));
    return entry?.at ?? null;
  };

  const terminal = order.status === 'CANCELLED' || order.status === 'REJECTED';
  const currentIndex = SPINE_INDEX[order.status] ?? (terminal ? -1 : 0);

  const rows = ORDER_SPINE.map((step, index) => {
    const at = timeFor(step.matches);
    let state = 'todo';
    if (at || index < currentIndex) state = 'done';
    if (index === currentIndex && !terminal) state = 'active';
    return { ...step, at, state };
  });

  if (terminal) {
    const at = timeFor([order.status]);
    rows.push({
      key: 'terminal',
      label: order.status === 'CANCELLED' ? 'Cancelled' : 'Payment rejected',
      at,
      state: 'cancelled',
    });
  }

  return (
    <View>
      {rows.map((row, index) => (
        <TimelineStep key={row.key} row={row} last={index === rows.length - 1} />
      ))}
    </View>
  );
};

const TimelineStep = ({ row, last }) => {
  const done = row.state === 'done';
  const active = row.state === 'active';
  const cancelled = row.state === 'cancelled';

  const dotColor = cancelled ? colors.danger : done ? colors.success : active ? colors.accent600 : colors.surface;
  const railColor = done ? colors.success : colors.ink200;

  return (
    <Row align="flex-start" gap={space.md} style={styles.tlRow}>
      <View style={styles.tlMarker}>
        <View style={[styles.tlDot, { backgroundColor: dotColor, borderColor: cancelled ? colors.danger : done ? colors.success : active ? colors.accent600 : colors.lineStrong }]}>
          {done ? <Ionicons name="checkmark" size={12} color="#ffffff" /> : null}
          {cancelled ? <Ionicons name="close" size={12} color="#ffffff" /> : null}
          {active ? <View style={styles.tlActiveCore} /> : null}
        </View>
        {!last ? <View style={[styles.tlRail, { backgroundColor: railColor }]} /> : null}
      </View>
      <View style={[styles.tlBody, last && { paddingBottom: 0 }]}>
        <Body strong style={[styles.tlLabel, !done && !active && !cancelled && styles.tlLabelMuted]}>{row.label}</Body>
        {row.at ? <Caption>{formatDate(row.at)}</Caption> : active ? <Caption style={{ color: colors.accent700 }}>In progress</Caption> : null}
      </View>
    </Row>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    backgroundColor: colors.surface,
  },
  rowBody: { flex: 1, gap: 3 },
  rowPills: { marginTop: 2, flexWrap: 'wrap' },
  money: { ...type.money, color: colors.ink900 },
  strike: { textDecorationLine: 'line-through', color: colors.ink400 },
  off: { color: colors.success },
  stockDot: { width: 7, height: 7, borderRadius: 4 },
  featuredBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accent600,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.surface,
  },

  thumb: { borderRadius: radius.md, backgroundColor: colors.ink200 },
  thumbFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent50 },
  thumbInitials: { ...type.bodyStrong, color: colors.accent700 },

  stat: { flex: 1, gap: 2 },
  statValue: { ...type.title, fontSize: 24, color: colors.ink900 },

  sectionHeader: { marginTop: space.xxl, marginBottom: space.md },
  sectionAction: { ...type.label, color: colors.accent700 },

  tlRow: {},
  tlMarker: { alignItems: 'center', width: 24 },
  tlDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tlActiveCore: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent600 },
  tlRail: { flex: 1, width: 2, minHeight: 18, backgroundColor: colors.ink200, marginVertical: 3, borderRadius: 2 },
  tlBody: { flex: 1, paddingBottom: space.lg, paddingTop: 2 },
  tlLabel: { ...type.bodyStrong, fontFamily: fonts.semibold },
  tlLabelMuted: { color: colors.ink400 },
});
