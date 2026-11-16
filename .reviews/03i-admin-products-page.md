# 03i – Admin products, categories and brands

- **Status:** Awaiting review
- **Phase:** 3b – Admin frontend
- **Date:** 2026-11-16
- **Author:** agent
- **Reviewer:** _unassigned_

## Summary

Catalogue management for the panel toko on `/admin/produk`, with three tabs:
products, categories and brands. Each tab lists its records, creates and edits
them in a drawer, and deletes through a confirmation dialog. Product writes go
through one shared catalogue store, so a product created in the panel is visible
on the storefront immediately.

This note was written retroactively during the 03i/03j review pass; the code and
screenshots were already in place.

## Files added / changed

| File | Change |
| ---- | ------ |
| `client/src/pages/admin/AdminProductsPage.jsx` | Catalogue screen with URL-backed tabs (produk/kategori/merek) |
| `client/src/components/admin/ProductsPanel.jsx` | Product table, search, create/edit drawer, delete confirmation, loading/error/empty states |
| `client/src/components/admin/ProductForm.jsx` | Product form (identity, price/stock, details, variants/images, visibility) with inline validation and image preview |
| `client/src/components/admin/TaxonomyPanel.jsx` | Shared category/brand table with create/edit/delete |
| `client/src/components/admin/TaxonomyForm.jsx` | Shared category/brand form (category adds description and image) |
| `client/src/components/admin/DeleteConfirm.jsx` | Delete confirmation dialog that shows server refusals in place |
| `client/src/hooks/useAdmin.js` | Product and taxonomy queries; create/update/delete mutations refreshing the storefront queries too |
| `client/src/services/admin.js` | Mock-backed admin catalogue services with the intended 04h endpoints |
| `client/src/mocks/admin.js` | Product/category/brand CRUD, slug uniqueness, rename propagation, in-use delete guard, `productCount` |
| `client/src/mocks/catalogStore.js` | One catalogue store seeded from the product/taxonomy mocks; adds `isActive` |
| `client/src/mocks/index.js` | Storefront catalogue reads the shared store, so panel writes reach `/toko` |
| `client/src/lib/validation.js` | `validateProduct`, `validateTaxonomy`, slug pattern and whole-Rupiah checks |
| `client/src/lib/stock.js` | Stock status reused by the product table |
| `client/src/lib/nav.js` | `adminProducts` route reused by the rail |
| `client/src/App.jsx` | `/admin/produk` under the admin branch |
| `.reviews/assets/03i/*` | Desktop and mobile evidence (see below) |

## How to run and verify

```sh
npm run dev
# client on http://localhost:5173
```

Sign in as `admin@badekor.id` / `rahasia123`.

Checklist the reviewer can tick:

- [ ] `/admin/produk` lists the 12 seeded products with image, name, slug, category, price, stock and visibility
- [ ] Search matches name, slug, category and brand; the count shows "n dari 12" while filtering
- [ ] "Tambah produk" opens the drawer; submitting an empty form reports every required field and focuses the first one
- [ ] Creating "Kursi Uji Coba" with a price, material, dimensions, description, colour and image path adds a row
- [ ] The new product is visible on `/toko?q=kursi-uji-coba` — panel edits reach the storefront
- [ ] Editing a product prefills the form; changing the price updates the list
- [ ] Deleting a product asks for confirmation and removes the row
- [ ] The "Kategori" tab lists categories with slug and product count; creating/editing one works
- [ ] Deleting a category that still has products is refused with an explanation instead of removing it
- [ ] The "Merek" tab works the same way for brands
- [ ] Saving a product with "Tampilkan di toko" off keeps it in the panel but hides it from the storefront
- [ ] Renaming a category or brand carries its products to the new slug
- [ ] Mobile (390 px) shows the table with horizontal scroll inside the table region only, and the drawer fits

Screenshot evidence in `.reviews/assets/03i/`: `desktop-admin-products`,
`desktop-admin-product-new`, `desktop-admin-product-edit`,
`desktop-admin-product-delete`, `desktop-admin-product-created`,
`desktop-admin-product-live`, `desktop-admin-categories`, `desktop-admin-brands`,
`desktop-admin-category-in-use`, `mobile-admin-products`,
`mobile-admin-product-new`.

## Decisions and trade-offs

- **One catalogue store.** Before this step the storefront read the seed arrays
  directly; an admin edit could never reach it. Everything now reads
  `catalogStore`, so panel writes and storefront reads share the same data, which
  is how `tbl_produk` will behave in 04h.
- **Products reference taxonomy by slug.** The UI selects category/brand by slug,
  and a rename carries the products along; the real schema can use ids with a
  join, but the visible behaviour stays the same.
- **Slugs stay unique automatically.** A duplicate slug gets a numeric suffix
  instead of failing the save, so the operator does not have to invent one.
- **Delete refuses while in use.** A category or brand still referenced by a
  product cannot be deleted; the dialog shows the message rather than closing.
- **Hide, don't delete.** `isActive: false` removes a product from the storefront
  while keeping it in the panel and in past orders.
- **Images are paths for now.** The form accepts one path per line with a first
  image preview; real upload handling is 04h.

## Not done / deferred

- Server-side admin CRUD and image upload arrive in step 04h.
- List pagination and server-side search arrive with the catalogue API in 04c;
  the panel currently filters the full list in memory at mock scale.
- Catalogue tests arrive in step 07.

## Out of scope / noticed

- This note is retrospective; 03i previously had no review note.
- `desktop-admin-products` is included in the step 03i evidence and also used by
  the mobile review for the same screen.

## Open questions for the reviewer

1. Should hiding a product (`isActive`) also remove it from wishlists? The
   wishlist mock already filters hidden products, but the stored ids remain.
2. Should the product form support more than a path per image (upload/drag-drop)
   in 04h, or stay path-based with an upload helper alongside?

## Reviewer feedback

_To be filled in by the reviewer._
