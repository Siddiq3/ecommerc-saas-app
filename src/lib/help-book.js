/**
 * Help for the bill book side of the app: bills, expenses, khata, suppliers, barcodes, staff and reports.
 * Same shape as src/lib/help.js; `about` is a one-line explanation shown above the steps.
 */

export const BOOK_HELP = [
  {
    id: 'book',
    title: 'Bill book',
    icon: 'book-outline',
    questions: [
      {
        id: 'book-what',
        question: 'What is the bill book?',
        about: 'Your daily shop book on the phone. Every bill, expense and payment is written here, and it adds up your cash and UPI for the day.',
        steps: [
          'Open **Home** and tap **Bill book**.',
          'See the day’s bills, expenses and money in hand together.',
          'Tap **Previous day** or **Next day** to see other days.',
        ],
        note: 'It works without internet. Bills are saved on this phone and back up when you are online.',
        action: { label: 'Open bill book', href: '/book' },
      },
      {
        id: 'make-bill',
        question: 'How do I make a bill?',
        about: 'A bill records a sale. A quick bill needs only the amount; add items when you want a detailed bill.',
        steps: [
          'Open **Bill book** and tap **Bill**.',
          'Type the amount.',
          'Choose how the customer paid: **Cash**, **UPI** or **Credit**.',
          'Tap **Save**.',
        ],
        note: 'Choose **Credit** when the customer will pay later. The amount goes into their khata.',
        action: { label: 'Make a bill', href: '/book/entry?kind=sale' },
      },
      {
        id: 'bill-items',
        question: 'How do I add items, discount or GST to a bill?',
        about: 'A detailed bill lists each item with its price and quantity, and the total adds up by itself.',
        steps: [
          'Open **Bill book** and tap **Bill**.',
          'Tap **Add items (what was bought)**. Type the item, or pick it **From my products**.',
          'Type a **Discount (optional)** if you give one.',
          'Choose **GST in the price (optional)** if the price includes GST.',
          'Tap **Save**.',
        ],
        note: 'GST shows only when your GSTIN is saved in your shop details.',
        action: { label: 'Make a bill', href: '/book/entry?kind=sale' },
      },
      {
        id: 'part-payment',
        question: 'The customer paid only part of the bill. What do I do?',
        steps: [
          'In the bill, choose **Credit** under **Paid by customer**.',
          'Choose the customer.',
          'Type what they paid in **Paid now (optional)**.',
          'Tap **Save**. The rest goes into their khata.',
        ],
        action: { label: 'Make a bill', href: '/book/entry?kind=sale' },
      },
      {
        id: 'share-bill',
        question: 'How do I share or print a bill?',
        steps: [
          'After saving a bill, tap **Share bill** to send it as a PDF on WhatsApp.',
          'Or tap **Print receipt** to print it on a receipt printer.',
          'For an older bill, open it from the bill book and tap **Share**.',
        ],
        action: { label: 'Open bill book', href: '/book' },
      },
      {
        id: 'edit-entry',
        question: 'How do I change or delete a bill?',
        steps: [
          'Open **Bill book** and tap the bill.',
          'Tap **Edit entry** to change it.',
          'Or tap **Delete** to remove it.',
        ],
        note: 'A deleted bill is removed from the book and the khata on every phone.',
        action: { label: 'Open bill book', href: '/book' },
      },
      {
        id: 'starting-cash',
        question: 'What is starting cash?',
        about: 'The cash in your drawer when you start using the book. After that, each day’s closing balance carries to the next day by itself.',
        steps: [
          'Open **Bill book**.',
          'Tap **Enter starting cash**.',
          'Type the cash you have in hand now and tap **Save**.',
        ],
        action: { label: 'Open bill book', href: '/book' },
      },
      {
        id: 'search-bills',
        question: 'How do I find an old bill?',
        steps: [
          'Open **Bill book**.',
          'Tap the search icon at the top.',
          'Type a customer name, an amount or a bill number.',
        ],
        action: { label: 'Search bills', href: '/book/search' },
      },
    ],
  },
  {
    id: 'expenses',
    title: 'Expenses',
    icon: 'wallet-outline',
    questions: [
      {
        id: 'add-expense',
        question: 'How do I add an expense?',
        about: 'Expenses are money you spend for the shop, like rent, salary or tea. They come off the day’s cash.',
        steps: [
          'Open **Bill book** and tap **Expense**.',
          'Type the amount.',
          'Choose what it was for, like **Rent** or **Salary**, or type an **Expense name (optional)**.',
          'Choose **Cash** or **UPI** and tap **Save**.',
        ],
        action: { label: 'Add an expense', href: '/book/entry?kind=expense' },
      },
      {
        id: 'expense-receipt',
        question: 'How do I keep a receipt photo?',
        steps: [
          'In the expense, tap **Add receipt photo**.',
          'Tap **Take photo** or **Choose photo**.',
          'Tap **Save**.',
        ],
        note: 'The photo is kept on this phone only.',
        action: { label: 'Add an expense', href: '/book/entry?kind=expense' },
      },
      {
        id: 'repeat-expense',
        question: 'How do I add rent or salary every month by itself?',
        steps: [
          'Add the expense as usual.',
          'Turn on **Repeat every month**.',
          'Tap **Save**. It is added on the same day every month.',
        ],
        note: 'To stop it, open **Reports and export**, find **Monthly expenses** and tap **Stop**.',
        action: { label: 'Add an expense', href: '/book/entry?kind=expense' },
      },
    ],
  },
  {
    id: 'khata',
    title: 'Khata (credit)',
    icon: 'people-outline',
    questions: [
      {
        id: 'khata-what',
        question: 'What is the khata?',
        about: 'The khata keeps track of who owes you money and whom you owe, like a paper udhaar book.',
        steps: [
          'Open **Home** and tap **Khata**.',
          '**You will get** is what customers owe you.',
          '**You will give** is what you owe suppliers.',
        ],
        action: { label: 'Open khata', href: '/khata' },
      },
      {
        id: 'khata-add',
        question: 'How do I add a customer to the khata?',
        steps: [
          'Open **Khata** and tap **Add customer**.',
          'Type the name and mobile number, or tap **Add from contacts**.',
          'Tap **Save**.',
        ],
        note: 'Have old dues in a paper book? Open the customer and tap **Add old dues from your paper khata**.',
        action: { label: 'Open khata', href: '/khata' },
      },
      {
        id: 'khata-entry',
        question: 'How do I write credit given or payment received?',
        steps: [
          'Open **Khata** and tap the customer.',
          'Tap **Gave on credit** when they take goods without paying.',
          'Tap **Got payment** when they pay you.',
          'Type the amount and tap **Save**.',
        ],
        note: 'The balance changes at once, and every entry also shows in the bill book.',
        action: { label: 'Open khata', href: '/khata' },
      },
      {
        id: 'khata-remind',
        question: 'How do I remind a customer to pay?',
        steps: [
          'Open the customer and tap **Reminder**.',
          'WhatsApp opens with the amount written. Tap send.',
          'To remind everyone, open **Khata** and tap **Remind all**.',
        ],
        action: { label: 'Open khata', href: '/khata' },
      },
      {
        id: 'khata-due',
        question: 'How do I set a due date?',
        steps: [
          'Open a customer who owes you money.',
          'Tap **Set date** under the balance and choose the day.',
          'The app reminds you at 9 am on that day.',
        ],
        note: 'To remove it, tap the date again and tap **Clear due date**.',
        action: { label: 'Open khata', href: '/khata' },
      },
      {
        id: 'khata-link',
        question: 'What is the ledger link?',
        about: 'A web link that shows a customer their own account with you: every bill, every payment and what is due.',
        steps: [
          'Open the customer and tap **Link**.',
          'Send the link on WhatsApp or SMS.',
          'To stop it, open the link settings and tap **Turn off ledger link**.',
        ],
        note: 'The link shows only that one customer’s account.',
        action: { label: 'Open khata', href: '/khata' },
      },
      {
        id: 'khata-report',
        question: 'How do I send a customer their statement?',
        steps: [
          'Open the customer and tap **Report**.',
          'A PDF with all their entries is made.',
          'Share it on WhatsApp.',
        ],
        action: { label: 'Open khata', href: '/khata' },
      },
      {
        id: 'khata-delete',
        question: 'How do I delete a customer?',
        steps: [
          'Open the customer and tap their name at the top.',
          'Tap **Delete customer**, then **Delete**.',
        ],
        note: 'Made a mistake? In **Khata**, open **Recently deleted** and tap **Restore**.',
        action: { label: 'Open khata', href: '/khata' },
      },
    ],
  },
  {
    id: 'suppliers',
    title: 'Suppliers & purchases',
    icon: 'cube-outline',
    questions: [
      {
        id: 'supplier-add',
        question: 'How do I add a supplier?',
        steps: [
          'Open **Khata** and tap **Suppliers** at the top.',
          'Tap **Add supplier**.',
          'Type the name and mobile number and tap **Save**.',
        ],
        action: { label: 'Open suppliers', href: '/khata?tab=supplier' },
      },
      {
        id: 'supplier-credit',
        question: 'How do I write goods bought on credit?',
        about: 'When a supplier gives you goods and you pay later, write it down so you always know what you owe.',
        steps: [
          'Open **Khata**, tap **Suppliers** and open the supplier.',
          'Tap **Got goods on credit**, type the amount and tap **Save**.',
          'When you pay them, tap **Paid supplier**.',
        ],
        action: { label: 'Open suppliers', href: '/khata?tab=supplier' },
      },
      {
        id: 'purchase-return',
        question: 'How do I record a purchase or a return?',
        steps: [
          'Open **Bill book** and tap **Bill**.',
          'At the top, choose **Purchase** for goods you bought.',
          'Or choose **Return**, then **From customer** or **To supplier**.',
          'Fill in the amount or items and tap **Save**.',
        ],
        note: 'Stock goes up and down by itself for items picked from your products.',
        action: { label: 'Open bill book', href: '/book' },
      },
    ],
  },
  {
    id: 'scan',
    title: 'Barcodes & item codes',
    icon: 'barcode-outline',
    questions: [
      {
        id: 'item-code-what',
        question: 'What is an item code?',
        about: 'A short code for each product, like COT-M-001. Type it or scan its barcode to put the item on a bill quickly.',
        steps: [
          'Every product gets a code when you save it.',
          'A product with sizes gets one code for each size.',
          'To use your own code, or the barcode number on a packet, type it in **Item code (SKU)** when you edit the product.',
        ],
        action: { label: 'Open products', href: '/(tabs)/products' },
      },
      {
        id: 'scan-bill',
        question: 'How do I scan items onto a bill?',
        steps: [
          'Open **Bill book** and tap **Bill**.',
          'Tap **Scan** and allow the camera.',
          'Point the camera at the barcode. Each scan adds one item.',
          'Tap **Done**, then **Save**.',
        ],
        note: 'Scan the same item again to add one more.',
        action: { label: 'Make a bill', href: '/book/entry?kind=sale' },
      },
      {
        id: 'type-code',
        question: 'How do I add an item by typing its code?',
        steps: [
          'In a bill, tap **Add items (what was bought)**.',
          'Type the code in **Item code**.',
          'The name and price fill in by themselves. Tap **Add to bill**.',
        ],
        note: 'Codes work without internet once the phone has your products.',
        action: { label: 'Make a bill', href: '/book/entry?kind=sale' },
      },
      {
        id: 'print-labels',
        question: 'How do I print barcode labels?',
        steps: [
          'Open **Products** and tap a product.',
          'Tap **Print labels**.',
          'Choose the paper: **A4 sheet (65 labels)** or **Label printer (50×25 mm)**.',
          'Choose how many and tap print.',
        ],
        note: 'Stick the labels on your items, then scan them at the counter.',
        action: { label: 'Open products', href: '/(tabs)/products' },
      },
      {
        id: 'scan-card',
        question: 'My items have no barcode. How do I scan them?',
        about: 'Print a counter scan card: one page with your products and their barcodes. Keep it at the counter and scan from it.',
        steps: [
          'Open **Products** and tap the barcode icon at the top.',
          'Choose the products to put on the card.',
          'Tap **Print scan card**.',
        ],
        action: { label: 'Open scan card', href: '/products/scan-card' },
      },
    ],
  },
  {
    id: 'staff',
    title: 'Staff & salary',
    icon: 'id-card-outline',
    questions: [
      {
        id: 'staff-add',
        question: 'How do I add staff?',
        steps: [
          'Open **Home** and tap **Staff**.',
          'Tap **Add staff**.',
          'Type the name, choose a **Monthly** or **Daily** salary and type the amount.',
          'Tap **Save**.',
        ],
        action: { label: 'Open staff', href: '/staff' },
      },
      {
        id: 'staff-attendance',
        question: 'How do I mark attendance?',
        steps: [
          'Open **Staff**.',
          'For each person, choose **Present**, **Absent**, **Half day** or **Leave**.',
          'Or tap **Mark all present**.',
        ],
        action: { label: 'Open staff', href: '/staff' },
      },
      {
        id: 'staff-salary',
        question: 'How is salary worked out?',
        about: 'Pay is for the days worked: a full day for present and half for a half day. Leave and unmarked days are paid; absent days are cut.',
        steps: [
          'Open **Staff** and tap the person.',
          'See **Salary this month**.',
          'Tap **Pay salary** to write it in the book as an expense.',
        ],
        action: { label: 'Open staff', href: '/staff' },
      },
    ],
  },
  {
    id: 'reports',
    title: 'Reports & GST',
    icon: 'bar-chart-outline',
    questions: [
      {
        id: 'reports',
        question: 'How do I see my profit and reports?',
        steps: [
          'Open **Bill book** and tap **Reports and export**.',
          'Choose the dates with **From** and **To**.',
          'See sales, expenses, credit and **Sales minus expenses**.',
        ],
        action: { label: 'Open reports', href: '/book/report' },
      },
      {
        id: 'export',
        question: 'How do I send reports to my accountant?',
        steps: [
          'Open **Reports and export**.',
          'Tap **PDF** or **Excel (CSV)**.',
          'Share the file on WhatsApp or email.',
        ],
        action: { label: 'Open reports', href: '/book/report' },
      },
      {
        id: 'gst-summary',
        question: 'Where can I see the GST to pay?',
        steps: [
          'Open **Reports and export**.',
          'Scroll down to **GST**.',
          'See **GST collected on sales**, **GST paid on purchases** and **GST to pay**.',
        ],
        note: 'This is a summary from your book. Check with your accountant before filing.',
        action: { label: 'Open reports', href: '/book/report' },
      },
    ],
  },
];
