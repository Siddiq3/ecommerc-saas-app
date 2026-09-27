/**
 * One-tap help content.
 *
 * Plain data, deliberately: the Help screen and every contextual "Need help?" entry render
 * from here, so a future knowledge base or assistant only has to return the same shape
 * ({ question, steps, note, action }) for the UI to keep working unchanged.
 *
 * `**word**` in a step is shown bold — used for the exact label of a button or screen.
 * `action.href` must be a real route; `npm test` (verify-routes, verify-help) checks every one.
 * `action.url` opens outside the app instead.
 */

/** The StoreKit website (terms, privacy, billing) — not a store. No trailing slash. */
export const WEB_URL = String(process.env.EXPO_PUBLIC_WEB_URL ?? 'https://ecommerc-saas-web-1yfy.vercel.app').replace(/\/$/, '');
/** The website has no help page yet; support is by email, the same address its footer shows. */
export const SUPPORT_URL = 'mailto:help@storekit.app';

export const HELP_CATEGORIES = [
  {
    id: 'setup',
    title: 'Store setup',
    icon: 'storefront-outline',
    questions: [
      {
        id: 'setup-store',
        question: 'How do I set up my store?',
        steps: [
          'Open **Account** and tap **Store details & payments**.',
          'Check your store name and add your mobile number.',
          'Switch on **UPI payments** or **Cash on delivery**.',
          'Tap **Save changes**, then **Publish store**.',
        ],
        note: 'Add at least one product so customers have something to buy.',
        action: { label: 'Open store details', href: '/settings/store' },
      },
      {
        id: 'store-name',
        question: 'How do I change my store name?',
        steps: [
          'Open **Account** and tap **Store details & payments**.',
          'Edit **Store name**.',
          'Tap **Save changes**.',
        ],
        action: { label: 'Change store name', href: '/settings/store' },
      },
      {
        id: 'store-info',
        question: 'How do I update my store information?',
        steps: [
          'Open **Account** and tap **Store details & payments**.',
          'Update your description, contact numbers or address.',
          'Tap **Save changes**.',
        ],
        note: 'Customers see your mobile number on your store.',
        action: { label: 'Open store details', href: '/settings/store' },
      },
      {
        id: 'share-link',
        question: 'How do I share my store link?',
        steps: [
          'Open **Account**.',
          'Tap **Share link** to send it on WhatsApp.',
          'Or press and hold the link under your store name to copy it.',
        ],
        action: { label: 'Go to Account', href: '/(tabs)/account' },
      },
      {
        id: 'customize-store',
        question: 'How do I customize my store?',
        steps: [
          'Add clear photos to your products — they are what customers see first.',
          'Turn on **Feature on the home page** for your best products.',
          'Group products with **Categories** so they are easy to browse.',
        ],
        note: 'Your store’s colours and style were chosen during setup. To change them, contact StoreKit support.',
        action: { label: 'Open categories', href: '/categories' },
      },
    ],
  },
  {
    id: 'products',
    title: 'Products',
    icon: 'pricetag-outline',
    questions: [
      {
        id: 'add-product',
        question: 'How do I add a product?',
        steps: [
          'Open **Products**.',
          'Tap **Add product**.',
          'Enter the product name and price.',
          'Add product photos.',
          'Add options (like size) or other details if needed.',
          'Tap **Add product** at the bottom to save.',
        ],
        action: { label: 'Add a product', href: '/products/new' },
      },
      {
        id: 'edit-product',
        question: 'How do I edit a product?',
        steps: [
          'Open **Products** and tap the product.',
          'Tap **Edit**.',
          'Make your changes and tap **Save changes**.',
        ],
        action: { label: 'Open products', href: '/(tabs)/products' },
      },
      {
        id: 'delete-product',
        question: 'How do I delete a product?',
        steps: [
          'Open **Products** and tap the product.',
          'Scroll down and tap **Delete this product**.',
          'Tap **Delete** to confirm.',
        ],
        note: 'Want to keep it for later? Tap **Hide** instead — it disappears from your store without being deleted.',
        action: { label: 'Open products', href: '/(tabs)/products' },
      },
      {
        id: 'product-images',
        question: 'How do I add product images?',
        steps: [
          'Open a product and tap **Edit** (or start a new product).',
          'Under **Photos**, tap **Add**.',
          'Take a photo or choose one from your gallery.',
          'Tap **Save changes**.',
        ],
        note: 'The first photo is the cover customers see in your store.',
        action: { label: 'Open products', href: '/(tabs)/products' },
      },
      {
        id: 'product-variants',
        question: 'How do I add product variants?',
        steps: [
          'Open a product and tap **Edit** (or start a new product).',
          'Under **Options**, turn on **This product has options**.',
          'Name the option (like Size) and type its values (like S, M, L).',
          'Set a price and stock for each combination.',
          'Save the product.',
        ],
        action: { label: 'Add a product', href: '/products/new' },
      },
      {
        id: 'product-availability',
        question: 'How do I manage product availability?',
        steps: [
          'Open **Products** and tap the product.',
          'Tap **Update** next to stock to change how many you have.',
          'Tap **Hide** to take it off your store, or **Make live** to bring it back.',
        ],
        note: 'Use the **Low** and **Out** filters in Products to see what needs restocking.',
        action: { label: 'Open products', href: '/(tabs)/products' },
      },
    ],
  },
  {
    id: 'orders',
    title: 'Orders',
    icon: 'receipt-outline',
    questions: [
      {
        id: 'view-orders',
        question: 'How do I view my orders?',
        steps: [
          'Tap **Orders** at the bottom of the screen.',
          'Use the filters (New, Confirmed, Shipped…) or search by order number, name or mobile.',
          'Tap an order to see everything about it.',
        ],
        action: { label: 'Open orders', href: '/(tabs)/orders' },
      },
      {
        id: 'accept-order',
        question: 'How do I accept an order?',
        steps: [
          'Open **Orders** and tap a **New** order.',
          'Tap **Update status**.',
          'Choose **Confirmed**.',
        ],
        note: 'For UPI orders, check the payment first.',
        action: { label: 'See new orders', href: '/(tabs)/orders?status=NEW' },
      },
      {
        id: 'order-status',
        question: 'How do I update an order status?',
        steps: [
          'Open **Orders** and tap the order.',
          'Tap **Update status**.',
          'Choose the next step, like **Preparing**, **Shipped** or **Delivered**.',
        ],
        action: { label: 'Open orders', href: '/(tabs)/orders' },
      },
      {
        id: 'cancel-order',
        question: 'How do I cancel an order?',
        steps: [
          'Open **Orders** and tap the order.',
          'Tap **Cancel order**.',
          'Pick a reason and tap **Cancel order** again.',
        ],
        note: 'Leave “Put the items back in stock” on unless the items are really gone.',
        action: { label: 'Open orders', href: '/(tabs)/orders' },
      },
      {
        id: 'customer-details',
        question: 'How do I check customer details?',
        steps: [
          'Open an order — the customer’s name, number and address are under **Customer**.',
          'Tap **Call** or **WhatsApp** to reach them.',
          'Or open **Customers** to see everyone who has ordered.',
        ],
        action: { label: 'Open customers', href: '/(tabs)/customers' },
      },
    ],
  },
  {
    id: 'payments',
    title: 'Payments',
    icon: 'wallet-outline',
    questions: [
      {
        id: 'upi-how',
        question: 'How does UPI payment work?',
        steps: [
          'The customer pays straight to your UPI ID at checkout.',
          'They send you their payment reference (UTR).',
          'You check it in your bank app and mark the payment received.',
        ],
        note: 'Set your UPI ID in **Store details & payments**.',
        action: { label: 'Set up UPI', href: '/settings/store' },
      },
      {
        id: 'verify-upi',
        question: 'How do I verify a UPI payment?',
        steps: [
          'Open the order marked **Payment needs checking**.',
          'Compare the **Reference (UTR)** and amount with your bank app.',
          'Tap **Payment received** if it matches, or **Not received** if it doesn’t.',
        ],
        action: { label: 'Payments to verify', href: '/(tabs)/orders?paymentStatus=PENDING_VERIFICATION' },
      },
      {
        id: 'find-utr',
        question: 'Where can I find the customer’s UTR?',
        steps: [
          'Open the order.',
          'The UTR is shown under **Reference (UTR)** in the payment box.',
          'Press and hold it to copy.',
        ],
        note: 'The UTR is the 12-digit reference from the customer’s UPI app.',
        action: { label: 'Payments to verify', href: '/(tabs)/orders?paymentStatus=PENDING_VERIFICATION' },
      },
      {
        id: 'cod',
        question: 'How do I accept Cash on Delivery?',
        steps: [
          'Open **Account** and tap **Store details & payments**.',
          'Turn on **Cash on delivery**.',
          'Tap **Save changes**.',
        ],
        action: { label: 'Open payment settings', href: '/settings/store' },
      },
      {
        id: 'payment-confirmation',
        question: 'How does payment confirmation work?',
        steps: [
          'UPI orders wait until you check the payment.',
          'Once you tap **Payment received**, the order can move ahead.',
          'Cash on delivery orders are paid when they arrive.',
        ],
        note: 'The Orders tab shows a badge when something needs you.',
        action: { label: 'Payments to verify', href: '/(tabs)/orders?paymentStatus=PENDING_VERIFICATION' },
      },
    ],
  },
  {
    id: 'delivery',
    title: 'Delivery',
    icon: 'bicycle-outline',
    questions: [
      {
        id: 'delivery-charges',
        question: 'How do I set delivery charges?',
        steps: [
          'Open **Account** and tap **Delivery**.',
          'Tap a delivery method, or **Add delivery method**.',
          'Under **Price**, choose **Flat fee** — or **By area** to charge by district, state and rest of India.',
          'Tap **Done**, then **Save delivery settings**.',
        ],
        note: 'Customers see the charge at checkout, before they place the order. **Pincode prices** set a different charge for specific pincodes.',
        action: { label: 'Open delivery settings', href: '/settings/delivery' },
      },
      {
        id: 'free-delivery',
        question: 'How do I offer free delivery?',
        steps: [
          'Open **Account** and tap **Delivery**, then tap a method.',
          'Choose **Free** under **Price** for every order — or turn on **Free above an order value**.',
          'Tap **Done**, then **Save delivery settings**.',
        ],
        note: 'Checkout tells customers how much more to add for free delivery.',
        action: { label: 'Open delivery settings', href: '/settings/delivery' },
      },
      {
        id: 'delivery-settings',
        question: 'How do I change my delivery settings?',
        steps: [
          'Open **Account** and tap **Delivery**.',
          'Add up to 5 methods — like Standard, Express or **Pickup from store** — each with its own price and delivery time.',
          'Under **Where you deliver**, add pincodes to deliver only to those areas.',
          'Tap **Save delivery settings**.',
        ],
        note: 'The **Main** method is chosen for customers until they pick another.',
        action: { label: 'Open delivery settings', href: '/settings/delivery' },
      },
      {
        id: 'delivery-address',
        question: 'How do customers provide their delivery address?',
        steps: [
          'Customers enter their address at checkout on your store.',
          'You’ll see it on the order under **Customer**.',
        ],
        action: { label: 'Open orders', href: '/(tabs)/orders' },
      },
    ],
  },
  {
    id: 'coupons',
    title: 'Coupons & offers',
    icon: 'ticket-outline',
    questions: [
      {
        id: 'create-coupon',
        question: 'How do I create a coupon?',
        steps: [
          'Open **Account** and tap **Coupons**.',
          'Tap **New coupon**.',
          'Enter a code (like WELCOME10) and the discount.',
          'Tap **Create coupon**.',
        ],
        action: { label: 'Create a coupon', href: '/coupons' },
      },
      {
        id: 'coupon-products',
        question: 'How do I apply a discount to specific products?',
        steps: [
          'Create or open a coupon.',
          'Under **Applies to**, choose **Specific products**.',
          'Tap **Choose products**, pick them and tap **Done**.',
        ],
        action: { label: 'Open coupons', href: '/coupons' },
      },
      {
        id: 'coupon-expiry',
        question: 'How do I set a coupon expiry date?',
        steps: [
          'Create or open a coupon.',
          'Under **Sale dates**, tap **Ends** and pick a date.',
          'Save the coupon.',
        ],
        action: { label: 'Open coupons', href: '/coupons' },
      },
      {
        id: 'disable-coupon',
        question: 'How do I disable a coupon?',
        steps: [
          'Open **Coupons** and tap the coupon.',
          'Turn off **Active**.',
          'Tap **Save**.',
        ],
        note: 'It stops working right away and you can turn it back on later.',
        action: { label: 'Open coupons', href: '/coupons' },
      },
    ],
  },
  {
    id: 'marketing',
    title: 'Sharing & marketing',
    icon: 'megaphone-outline',
    questions: [
      {
        id: 'share-instagram',
        question: 'How do I share my store on Instagram?',
        steps: [
          'Open **Account** and press and hold your store link to copy it.',
          'In Instagram, add it to a story with the **Link** sticker.',
          'Post photos of your products and tell people to tap the link.',
        ],
        action: { label: 'Go to Account', href: '/(tabs)/account' },
      },
      {
        id: 'share-whatsapp',
        question: 'How do I share my store link on WhatsApp?',
        steps: [
          'Open **Account**.',
          'Tap **Share link**.',
          'Choose a chat, group or your Status and send.',
        ],
        action: { label: 'Go to Account', href: '/(tabs)/account' },
      },
      {
        id: 'instagram-bio',
        question: 'How do I add my StoreKit link to Instagram bio?',
        steps: [
          'Open **Account** and press and hold your store link to copy it.',
          'In Instagram, go to your profile and tap **Edit profile**.',
          'Tap **Links**, add an external link and paste it.',
        ],
        action: { label: 'Go to Account', href: '/(tabs)/account' },
      },
      {
        id: 'find-store',
        question: 'How can customers find my store?',
        steps: [
          'Customers open your store through your store link.',
          'Share it on WhatsApp, Instagram and anywhere your customers are.',
          'Make sure your store is published in **Store details & payments**.',
        ],
        action: { label: 'Go to Account', href: '/(tabs)/account' },
      },
    ],
  },
  {
    id: 'account',
    title: 'Account & settings',
    icon: 'person-circle-outline',
    questions: [
      {
        id: 'update-profile',
        question: 'How do I update my profile?',
        steps: [
          'Open **Account** and tap **Profile**.',
          'Update your name or mobile number.',
          'Tap **Save changes**.',
        ],
        action: { label: 'Open profile', href: '/settings/profile' },
      },
      {
        id: 'store-settings',
        question: 'How do I change my store settings?',
        steps: [
          'Open **Account** and tap **Store details & payments**.',
          'Change your details, contact info or payment options.',
          'Tap **Save changes**.',
        ],
        action: { label: 'Open store settings', href: '/settings/store' },
      },
      {
        id: 'subscription',
        question: 'How do I manage my subscription?',
        steps: [
          'Tap **Open subscription** below.',
          'Tap **Choose a plan** or **Manage subscription**.',
          'Billing opens on our website in your browser.',
        ],
        action: { label: 'Open subscription', href: '/settings/subscription' },
      },
      {
        id: 'contact-support',
        question: 'How do I contact StoreKit support?',
        steps: [
          'Tap the button below to email StoreKit support.',
        ],
        action: { label: 'Contact support', url: SUPPORT_URL },
      },
    ],
  },
];

/** The questions shown by each screen's "Need help?" button, by question id. */
export const HELP_CONTEXTS = {
  products: ['add-product', 'edit-product', 'product-images', 'product-variants'],
  orders: ['order-status', 'verify-upi', 'accept-order', 'cancel-order'],
  store: ['store-name', 'share-link', 'customize-store', 'upi-how'],
  delivery: ['delivery-charges', 'free-delivery', 'delivery-address'],
};

const BY_ID = new Map(HELP_CATEGORIES.flatMap((c) => c.questions.map((q) => [q.id, q])));

export const helpQuestion = (id) => BY_ID.get(id);
