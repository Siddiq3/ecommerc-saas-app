/**
 * Ready-made WhatsApp messages from the seller to ONE customer about THEIR order.
 *
 * The app only opens WhatsApp with the text filled in; the seller taps Send. Nothing is sent
 * automatically and there is no bulk sending, so this is ordinary one-to-one use that
 * WhatsApp does not restrict. Messages are in English: we do not know the buyer's language.
 */

const rupees = (paise) => `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const itemsLine = (items = []) => {
  const shown = items.slice(0, 3).map((i) => `${i.quantity} × ${i.name}${i.variantLabel ? ` (${i.variantLabel})` : ''}`);
  if (items.length > 3) shown.push(`+${items.length - 3} more`);
  return shown.join(', ');
};

/** wa.me link for an Indian 10-digit mobile number, or null when there is no usable number. */
export const waLink = (mobile, text) => {
  const digits = String(mobile ?? '').replace(/\D/g, '').slice(-10);
  return digits.length === 10 ? `https://wa.me/91${digits}?text=${encodeURIComponent(text)}` : null;
};

/** Before shipping a COD order: cuts parcels refused at the door (RTO). */
export const codConfirmMessage = (order, store) => [
  `Hi ${order.customer?.name ?? ''}, thank you for ordering from ${store}! 🙏`,
  '',
  `Order ${order.orderNumber}: ${itemsLine(order.items)}`,
  `Total: ${rupees(order.totals?.total)} (Cash on Delivery)`,
  '',
  'Please reply *YES* to confirm, and keep the cash ready at delivery.',
].join('\n');

/** The update that fits the order's current status. */
export const orderUpdateMessage = (order, store, trackUrl) => {
  const hi = `Hi ${order.customer?.name ?? ''},`;
  const id = `order ${order.orderNumber}`;
  const track = trackUrl ? `\nTrack it here: ${trackUrl} (order number ${order.orderNumber} and your mobile number)` : '';
  switch (order.status) {
    case 'NEW':
    case 'PENDING_PAYMENT':
      return `${hi} we have received your ${id} (${rupees(order.totals?.total)}) at ${store}. We will update you soon.${track}`;
    case 'PAYMENT_VERIFIED':
    case 'CONFIRMED':
      return `${hi} your ${id} from ${store} is confirmed ✅${track}`;
    case 'PREPARING':
    case 'READY_TO_SHIP':
      return `${hi} your ${id} from ${store} is being packed 📦 We will share tracking details once it ships.${track}`;
    case 'SHIPPED': {
      const courier = [order.courierName && `Courier: ${order.courierName}`, order.trackingReference && `Tracking no: ${order.trackingReference}`]
        .filter(Boolean).join('\n');
      return `${hi} your ${id} from ${store} has been shipped 🚚${courier ? `\n${courier}` : ''}${track}`;
    }
    case 'DELIVERED':
      return `${hi} your ${id} has been delivered. Thank you for shopping with ${store}! 🙏 We would love to see you again.`;
    case 'CANCELLED':
    case 'REJECTED':
      return `${hi} your ${id} from ${store} has been cancelled. If you have any questions, just reply to this message.`;
    default:
      return `${hi} about your ${id} from ${store}:`;
  }
};
