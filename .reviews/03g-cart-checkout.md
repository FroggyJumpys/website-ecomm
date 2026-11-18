# 03g – Cart and checkout

- **Status:** Changes requested
- **Phase:** 3 – Frontend pages
- **Date:** 2026-11-16
- **Author:** agent
- **Reviewer:** Kimi (Moonshot AI, AI reviewer)

## Summary

The template has no cart page, so `/keranjang` and a cart context are new. The
checkout from `pages/checkout.html` is rebuilt as a three-step flow — address,
delivery, payment — with a running receipt, and a confirmation screen based on
`complete.png`. Placing an order snapshots the cart and address into a mock order
that the account history and (later) the admin panel read.

This note was written retroactively during the 03i/03j review pass; the code and
screenshots were already in place.

## Files added / changed

| File | Change |
| ---- | ------ |
| `client/src/context/CartProvider.jsx` | Cart state persisted to storage; add/remove/quantity/clear; per-variant keys; stock clamping |
| `client/src/context/cartContext.js` | Context + `useCart` hook |
| `client/src/pages/CartPage.jsx` | Cart page: lines, quantity steppers, remove, summary, guest note, empty state |
| `client/src/pages/CheckoutPage.jsx` | Three-step checkout with validation, inline address creation, running receipt and order placement |
| `client/src/pages/OrderCompletePage.jsx` | Confirmation: order number, status, items, totals, payment instructions, shipping address |
| `client/src/components/cart/CartLine.jsx` | One cart line: variant, unit price, stepper, remove, low-stock note |
| `client/src/components/cart/OrderTotals.jsx` | Shared subtotal/shipping/discount/total block |
| `client/src/components/checkout/AddressPicker.jsx` | Saved-address radio cards and inline new-address form |
| `client/src/components/checkout/ShippingPicker.jsx` | Delivery options with prices |
| `client/src/components/checkout/PaymentPicker.jsx` | Payment options |
| `client/src/components/ui/RadioCard.jsx` | Accessible radio card used by all three pickers |
| `client/src/lib/shipping.js` | Delivery and payment options, defaults, payment instructions |
| `client/src/services/orders.js` | `createOrder`, mock-backed |
| `client/src/mocks/account.js` | `createOrder`, `listOrders`, `getOrder`, shared order store |
| `client/src/hooks/useAccount.js` | `useCreateOrder`, order queries |
| `client/src/lib/validation.js` | `validateCheckout` |
| `client/src/components/layout/SiteHeader.jsx` | Cart item count badge |
| `client/src/main.jsx` | Wraps the app in `CartProvider` |
| `client/src/App.jsx` | `/keranjang`, `/pembayaran` (guarded), `/pesanan/:orderNumber/selesai` (guarded) |
| `client/src/lib/nav.js` | `cart`, `checkout`, `orderComplete` routes |
| `.reviews/assets/03g/*` | Desktop and mobile evidence (see below) |

## How to run and verify

```sh
npm run dev
# client on http://localhost:5173
```

Checklist the reviewer can tick:

- [ ] Adding two variants from a product page creates two cart lines; adding the same variant twice increases its quantity
- [ ] Quantity is clamped to the product's stock and cannot drop below one
- [ ] `/keranjang` shows subtotal, the "shipping calculated later" note and a link to checkout
- [ ] An empty cart shows the empty state instead of the summary
- [ ] As a guest, `/pembayaran` redirects to `/masuk?redirect=%2Fpembayaran`; the cart survives the sign-in round trip
- [ ] Checkout lists saved addresses; "Kirim ke alamat lain" opens the shared address form inline
- [ ] Switching between Reguler (Rp 85.000), Kargo mebel (Rp 250.000) and Ambil di workshop (Gratis) updates the total immediately
- [ ] Submitting without an address, shipping, payment or the terms checkbox reports the matching error and focuses it
- [ ] Placing an order clears the cart and lands on `/pesanan/BD-.../selesai`
- [ ] The confirmation shows the order number, items, totals, payment instructions and shipping address
- [ ] The created order appears in `/akun/pesanan` and, signed in as admin, in the panel
- [ ] Mobile (390 px) stacks the receipt and the steps without horizontal scroll

Screenshot evidence in `.reviews/assets/03g/`: `desktop-cart`,
`desktop-cart-empty`, `desktop-cart-guest`, `desktop-checkout`,
`desktop-checkout-new-address`, `desktop-checkout-guard`, `desktop-complete`,
`mobile-cart`, `mobile-checkout`, `mobile-complete`.

## Decisions and trade-offs

- **Cart keyed by product + variant.** The same sofa in two colours is two lines,
  while the same variant increases quantity; this mirrors what `tbl_item_keranjang`
  will enforce in 04f.
- **Cart survives the sign-in detour.** Checkout requires an account, so the cart
  is persisted; otherwise signing in would empty it.
- **Shipping is priced at checkout, not in the cart.** Furniture delivery depends
  on the chosen method, so the cart intentionally shows "Dihitung saat pembayaran".
- **Orders snapshot their data.** Names, prices, images and the shipping address
  are copied onto the order, so a later catalogue edit cannot rewrite history —
  the same rule `tbl_item_pesanan` follows.
- **No stock decrement in the mock.** 04g performs the decrement in a database
  transaction; pretending to do it here would desynchronise the seeded catalogue.
- **Payment is a label plus instructions.** No card data is collected; `paymentMethod`
  is stored and the confirmation looks up the steps from `lib/shipping.js`.

## Not done / deferred

- Cart CRUD, stock checks and guest merge arrive in step 04f.
- Order creation in a DB transaction and stock decrement arrive in step 04g.
- A real payment provider is out of scope; the confirmation shows instructions.
- Checkout and cart tests arrive in step 07.

## Out of scope / noticed

- This note is retrospective; 03g previously had no review note.
- `debug-cart.png` in the assets folder is a leftover debugging capture, not part
  of the review evidence.

## Open questions for the reviewer

1. Should shipping cost be shown in the cart (e.g. "from Rp 85.000") instead of
   only at checkout?
2. Should guest carts be merged on sign-in (planned in 04f) or cleared, given the
   mock currently keeps one shared cart?

## Reviewer feedback

**Verdict: Changes requested.** The checkout validation does not move focus to the terms checkbox after a terms-only validation failure, contrary to the step's checklist.

### Reproduction

1. Add a product, sign in and open `/pembayaran` with a saved address and the default shipping/payment selections.
2. Leave `Saya menyetujui syarat pemesanan ...` unchecked.
3. Submit `Buat pesanan`.
4. The correct error, `Centang persetujuan untuk melanjutkan.`, appears, but `document.activeElement.id` is empty (focus remains on the submit button), not `setuju-syarat`.

`focusFirstInvalid(formRef.current)` only searches the form around the shipping/payment sections. The terms control is rendered in the receipt aside, outside that ref, so the invalid checkbox cannot be found. The address picker is also outside that form ref; ensure its validation error receives equivalent focus handling. **Required revision:** make the validation-focus scope include all invalid checkout controls and verify both terms and missing-address cases.

Other independent checks passed:

- Ran `npm run dev`; exercised product → guest cart → guarded checkout → order confirmation.
- Two colour variants created separate cart lines; repeating the same variant increased its quantity. Minimum quantity and stock limits are enforced by the stepper/cart logic.
- Cart subtotal, shipping-later note, guest redirect and cart survival across login worked.
- Saved/new-address UI, shipping price changes (Rp 85.000 / Rp 250.000 / free), terms error copy and 390 px layout were present; no mobile horizontal overflow.
- Created `BD-2026-1066`: the cart cleared, confirmation showed items, totals and BCA instructions, the order appeared in `/akun/pesanan`, and an admin search found it in `/admin/pesanan`.

Open questions: shipping at checkout and guest-cart merge are consistent with the documented scope and later API. Displaying a from-price in the cart or changing merge policy would be a product decision, not a blocker.
