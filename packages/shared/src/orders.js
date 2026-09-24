export const ORDER_STATUSES = Object.freeze([
  'NEW', 'PENDING_PAYMENT', 'PAYMENT_VERIFIED', 'CONFIRMED', 'PREPARING',
  'READY_TO_SHIP', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REJECTED',
]);

export const PAYMENT_METHODS = Object.freeze(['COD', 'UPI_MANUAL']);

export const PAYMENT_STATUSES = Object.freeze([
  'NOT_REQUIRED', 'PENDING_SUBMISSION', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'EXPIRED',
]);

/**
 * Allowed transitions. The API enforces this table; the clients read the same table so
 * impossible actions are greyed out instead of round-tripping to an error.
 */
export const ORDER_TRANSITIONS = Object.freeze({
  NEW: ['PENDING_PAYMENT', 'CONFIRMED', 'PREPARING', 'CANCELLED', 'REJECTED'],
  PENDING_PAYMENT: ['PAYMENT_VERIFIED', 'CONFIRMED', 'CANCELLED', 'REJECTED'],
  PAYMENT_VERIFIED: ['CONFIRMED', 'PREPARING', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'READY_TO_SHIP', 'SHIPPED', 'CANCELLED'],
  PREPARING: ['READY_TO_SHIP', 'SHIPPED', 'CANCELLED'],
  READY_TO_SHIP: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
  REJECTED: [],
});

export const TERMINAL_STATUSES = Object.freeze(['DELIVERED', 'CANCELLED', 'REJECTED']);

export const canTransition = (from, to) => (ORDER_TRANSITIONS[from] ?? []).includes(to);

export const isTerminal = (status) => TERMINAL_STATUSES.includes(status);

export const ORDER_STATUS_LABELS = Object.freeze({
  NEW: 'New',
  PENDING_PAYMENT: 'Awaiting payment',
  PAYMENT_VERIFIED: 'Payment verified',
  CONFIRMED: 'Confirmed',
  PREPARING: 'Preparing',
  READY_TO_SHIP: 'Ready to ship',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  REJECTED: 'Rejected',
});

export const ORDER_STATUS_TONE = Object.freeze({
  NEW: 'blue',
  PENDING_PAYMENT: 'amber',
  PAYMENT_VERIFIED: 'teal',
  CONFIRMED: 'teal',
  PREPARING: 'indigo',
  READY_TO_SHIP: 'indigo',
  SHIPPED: 'violet',
  DELIVERED: 'green',
  CANCELLED: 'slate',
  REJECTED: 'red',
});

export const PAYMENT_STATUS_LABELS = Object.freeze({
  NOT_REQUIRED: 'Cash on delivery',
  PENDING_SUBMISSION: 'Awaiting payment reference',
  PENDING_VERIFICATION: 'Pending verification',
  VERIFIED: 'Verified',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired',
});

export const PAYMENT_METHOD_LABELS = Object.freeze({ COD: 'Cash on Delivery', UPI_MANUAL: 'UPI' });

/** Stages the customer sees on the tracking page, in order. */
export const CUSTOMER_TIMELINE = Object.freeze([
  { status: 'CONFIRMED', label: 'Order confirmed' },
  { status: 'PREPARING', label: 'Preparing your order' },
  { status: 'READY_TO_SHIP', label: 'Packed' },
  { status: 'SHIPPED', label: 'Out for delivery' },
  { status: 'DELIVERED', label: 'Delivered' },
]);

/** Statuses that count as needing the owner's attention on the dashboard. */
export const ACTIONABLE_STATUSES = Object.freeze([
  'NEW', 'PENDING_PAYMENT', 'PAYMENT_VERIFIED', 'CONFIRMED', 'PREPARING', 'READY_TO_SHIP',
]);

export const CANCELLATION_REASONS = Object.freeze([
  'customer_request', 'out_of_stock', 'payment_issue', 'delivery_unavailable',
  'duplicate_order', 'suspected_fraud', 'other',
]);

export const CANCELLATION_REASON_LABELS = Object.freeze({
  customer_request: 'Customer requested',
  out_of_stock: 'Out of stock',
  payment_issue: 'Payment issue',
  delivery_unavailable: 'Delivery unavailable',
  duplicate_order: 'Duplicate order',
  suspected_fraud: 'Suspected fraud',
  other: 'Other',
});
