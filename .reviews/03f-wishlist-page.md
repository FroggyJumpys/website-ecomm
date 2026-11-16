# 03f – Wishlist page

- **Status:** Awaiting review
- **Phase:** 3 – Frontend pages
- **Date:** 2026-11-16
- **Author:** agent
- **Reviewer:** _unassigned_

## Summary

The wishlist from `pages/wishlist.html` is rebuilt as `/favorit`, backed by a
per-user mock list. Products can be saved or unsaved from the shop grid, the shop
list and the product page through one shared heart control; the page lets the
customer pick a variant, move a saved product into the cart or remove it.

This note was written retroactively during the 03i/03j review pass; the code and
screenshots were already in place.

## Files added / changed

| File | Change |
| ---- | ------ |
| `client/src/pages/WishlistPage.jsx` | Wishlist screen: count, availability line, loading/error/empty states, per-row pending state, success/error banner |
| `client/src/components/wishlist/WishlistRow.jsx` | One saved product: image, spec, availability, variant chips, price and move/remove actions |
| `client/src/components/product/WishlistButton.jsx` | Shared heart control (`floating` and `plain`); guest clicks redirect to sign-in with a return path |
| `client/src/components/product/ProductCard.jsx` | Adds the floating heart to every catalogue card |
| `client/src/components/product/ProductRow.jsx` | Adds the plain heart to the shop list layout |
| `client/src/components/product/ProductPurchase.jsx` | Adds the plain heart to the product page purchase panel |
| `client/src/hooks/useWishlist.js` | List query keyed by user id, add/remove mutations, `useIsSaved` |
| `client/src/services/wishlist.js` | Mock-backed wishlist service with the intended 04e endpoints |
| `client/src/mocks/wishlist.js` | Per-user saved ids in storage, seeded for Sari, hidden products filtered out |
| `client/src/App.jsx` | `/favorit` route wrapped in `RequireAuth` |
| `client/src/lib/nav.js` | `wishlist` route reused by the header/account menu |
| `.reviews/assets/03f/*` | 13 screenshots (see below) |

## How to run and verify

```sh
npm run dev
# client on http://localhost:5173
```

Demo accounts: `sari@badekor.id` / `rahasia123` (customer) and
`admin@badekor.id` / `rahasia123` (admin, empty wishlist).

Checklist the reviewer can tick:

- [ ] Signed in as Sari, `/favorit` lists the three seeded products with image, spec, availability, price and actions
- [ ] The heart on a shop card, a shop list row and the product page toggles filled/unfilled and stays in sync
- [ ] Signed out, a heart redirects to `/masuk?redirect=<current path>` and returns there after sign-in
- [ ] Saving the same product twice does not create a duplicate row
- [ ] "Pindahkan ke keranjang" adds the chosen colour/size and removes the row, then offers "Lihat keranjang"
- [ ] The variant chips are only shown when a product has more than one colour or size
- [ ] A sold-out saved product disables "Pindahkan ke keranjang" and shows "Stok habis"
- [ ] "Hapus" removes the row and reports that the product left favourites
- [ ] An account with no saved products (the admin account) gets the empty state
- [ ] A product hidden in the admin panel disappears from the wishlist
- [ ] Mobile (390 px) keeps image, name, price and actions readable with no horizontal scroll

Screenshot evidence in `.reviews/assets/03f/`: `desktop-wishlist`,
`desktop-wishlist-shop-hearts`, `desktop-wishlist-product-page`,
`desktop-wishlist-after-add`, `desktop-wishlist-added-from-card`,
`desktop-wishlist-moved`, `desktop-wishlist-removed`, `desktop-wishlist-empty`,
`desktop-wishlist-guard`, `desktop-wishlist-guest-heart`, `mobile-wishlist`,
`mobile-wishlist-product-page`, `mobile-wishlist-moved`.

## Decisions and trade-offs

- **Per-user, not per-browser.** Saved ids live under the user id, so switching
  accounts in the demo does not leak one customer's list into another's.
- **Idempotent add.** Saving an already-saved product is a no-op instead of a
  duplicate row, matching the `tbl_favorit` unique constraint 04e will add.
- **Move only after removal succeeds.** The cart is synchronous, so the row is
  added to the cart in the removal's `onSuccess`; a failed removal cannot leave a
  product in both lists.
- **Variant choice happens on the row.** Moving a wishlisted sofa needs a colour
  and size; the row exposes only the options the product actually has.
- **Hidden products are filtered.** A product the admin hides is no longer
  offered to the customer, even if it was saved earlier.

## Not done / deferred

- The real wishlist endpoints and `tbl_favorit` arrive in step 04e.
- Optimistic heart updates are not implemented; the icon waits for the mock
  request, which keeps the saved state honest.
- Wishlist tests arrive with the other frontend tests in step 07.

## Out of scope / noticed

- This note is retrospective; 03f previously had no review note.
- The heart control is used in three places, so it is already extracted into
  `WishlistButton.jsx` rather than repeated.

## Open questions for the reviewer

1. Should a signed-out heart be allowed to save to a guest wishlist and merge on
   sign-in, or is redirecting to sign-in the intended behaviour for 04e?
2. Should moving a wishlist item to the cart delete the saved row, or copy it and
   keep the row? The current choice is delete-and-move.

## Reviewer feedback

_To be filled in by the reviewer._
