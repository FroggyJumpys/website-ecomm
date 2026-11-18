# 03d – Auth pages

- **Status:** Changes requested
- **Phase:** 3 – Frontend pages
- **Date:** 2026-11-12
- **Author:** agent
- **Reviewer:** Kimi (Moonshot AI, AI reviewer)

## Summary

The sign-in and registration pages from `pages/login.html` and `pages/register.html` are rebuilt,
this time with real behaviour: controlled forms with field-level validation, a mock auth service, an
`AuthProvider`, a route guard that returns the visitor to the page they wanted, and an account menu
in the site header. Both roles (`customer`, `admin`) are captured in the mock session so step 03h
can put an admin guard in front of `/admin` without reworking auth.

The template's social-login buttons and its "forgot password" link are **not** carried over: neither
an OAuth provider nor a reset flow exists in this project, and a button that does nothing is worse
than no button. Both are listed under *Not done*.

## Files added / changed

| File | Change |
| ---- | ------ |
| `client/src/pages/LoginPage.jsx` | Replaced the placeholder. Controlled form, validation, form-level error, password reveal, "remember me", demo-account picker, note when arriving from a guard |
| `client/src/pages/RegisterPage.jsx` | Replaced the placeholder. Name/email/WhatsApp/password/confirmation/terms, validation, duplicate-email handling |
| `client/src/components/auth/AuthShell.jsx` | New. Shared split frame: workshop photograph + promise on the left, plain form column on the right |
| `client/src/components/auth/FormAlert.jsx` | New. `role="alert"` block for failures a single field cannot explain |
| `client/src/components/auth/RequireAuth.jsx` | New. Guard for customer pages: skeleton while restoring, `?redirect=` when signed out, children when signed in |
| `client/src/components/layout/AccountMenu.jsx` | New. Header account control: sign-in link for guests, initials + panel (links, role badge, sign out) for signed-in users |
| `client/src/components/layout/SiteHeader.jsx` | Uses `AccountMenu` instead of the fixed `/masuk` link; drawer shows sign-in/registration for guests and name + account links + sign out for customers; icon style moved to `headerIconButton` |
| `client/src/context/authContext.js` | New. `AuthContext` + `useAuth` |
| `client/src/context/AuthProvider.jsx` | New. Restores the session, exposes `status`/`user`/`isAdmin`/`login`/`register`/`logout` |
| `client/src/services/auth.js` | New. `fetchSession`, `login`, `register`, `logout`, mock-backed |
| `client/src/services/catalog.js` | Reads `USE_MOCKS` from `lib/config.js` instead of redeclaring it |
| `client/src/lib/config.js` | New. Single source of the mock/API switch |
| `client/src/lib/validation.js` | New. Pure validators + `normalizePhone`, Bahasa Indonesia messages |
| `client/src/lib/demoAccounts.js` | New. The two demo logins, shared by the mock store and the sign-in page |
| `client/src/lib/focus.js` | New. `focusFirstInvalid` for keyboard users after a failed submit |
| `client/src/lib/nav.js` | Added `safeRedirect` (open-redirect guard for `?redirect=`) |
| `client/src/mocks/auth.js` | New. Mock accounts + session in browser storage |
| `client/src/components/ui/Form.jsx` | Added `PasswordInput` (reveal toggle); checkbox gets `aria-invalid` and top-aligns multi-line labels |
| `client/src/components/ui/buttonStyles.js` | Added `headerIconButton` so header controls share one style |
| `client/src/main.jsx` | Wrapped the app in `AuthProvider` |
| `client/src/App.jsx` | `/akun` and `/akun/profil` now render behind `RequireAuth` |
| `.tmp-capture.mjs` | Repointed at `.reviews/assets/03d`; added input filling, multi-step actions, storage reset and a final-path log |

## How to run and verify

```sh
npm run dev            # client on :5173
# http://localhost:5173/masuk
# http://localhost:5173/daftar
# http://localhost:5173/akun   (redirects to /masuk?redirect=%2Fakun while signed out)
```

```sh
npx eslint client/src server/src
npm run build --workspace=client
npm test
```

Demo accounts (also listed under the form, one click fills the form):

| Role | Email | Password |
| ---- | ----- | -------- |
| Pelanggan | `sari@badekor.id` | `rahasia123` |
| Admin | `admin@badekor.id` | `rahasia123` |

Checklist the reviewer can tick:

- [x] `/masuk` shows email, password, "Ingat saya", submit, link to `/daftar` and the demo picker
- [x] Submitting an empty form reports both fields, draws red borders and moves focus to the first
      invalid field; messages clear as soon as that field is edited
- [x] A wrong password keeps the form and shows "Email atau kata sandi salah." in a `role="alert"`
- [x] The eye button reveals the password and reports `aria-pressed`
- [x] The demo buttons fill the form without signing in; the password is never printed on screen
- [x] A correct sign-in lands on `/akun` and the header switches to initials
- [x] `/akun` while signed out goes to `/masuk?redirect=%2Fakun` and explains why
- [x] `/masuk` while signed in bounces to `/akun` (verified by the harness's final path)
- [x] Registration validates name, email, WhatsApp number, password confirmation and the terms box
- [x] A duplicate email is reported on the email field, not as a generic banner
- [x] A successful registration signs the visitor in and lands on `/akun`
- [x] Opening the header menu shows name, email, the four account links and "Keluar"
- [x] Signing in as the admin shows the `Admin` badge in that panel
- [x] "Keluar" returns to the home page as a guest (not to `/masuk`)
- [x] The mobile drawer shows "Masuk"/"Daftar" for guests and name + links + "Keluar" when signed in
- [x] Mobile (390 px) forms are single-column with no horizontal scroll

Screenshot evidence in `.reviews/assets/03d/`: `desktop-login`, `desktop-login-validation`,
`desktop-login-wrong-password`, `desktop-login-password-visible`, `desktop-login-demo-filled`,
`desktop-login-success`, `desktop-account-menu`, `desktop-login-already-signed-in`,
`desktop-logout`, `desktop-admin-menu`, `desktop-protected-redirect`, `desktop-register`,
`desktop-register-validation`, `desktop-register-filled`, `desktop-register-duplicate-email`,
`desktop-register-success`, `mobile-login`, `mobile-login-validation`, `mobile-register`,
`mobile-menu-guest`, `mobile-menu-signed-in`.

## Decisions and trade-offs

- **One expressive moment, then quiet.** The auth screens get a single deliberate element: the
  workshop photograph with the line "Kami mengukur ruangmu dulu, baru memotong kayunya." The form
  itself stays on plain paper with no card, no eyebrow, no gradient; fields are the only thing to
  look at. On screens below `lg` the photograph is dropped so the form is not pushed down.
- **Mock session in browser storage.** `customer` and `admin` logins are seeded on first use and the
  session is kept in `sessionStorage`, or `localStorage` when "Ingat saya" is ticked. Passwords are
  stored as an unsalted SHA-256 digest purely so plain text is not sitting in `localStorage`; that is
  explicitly **not** password storage and step 04b replaces the whole file with bcrypt + a JWT
  cookie. Trade-off: it is demo code that must not be copied to the server, which is why it lives in
  `mocks/` behind `USE_MOCKS` and says so at the top of the file.
- **`status: 'restoring'` instead of a boolean.** Guards render a skeleton until the session is
  known, so a reload on `/akun` does not flash the sign-in page for a signed-in customer. A boolean
  would have made every consumer guess whether `false` meant "guest" or "not checked yet".
- **`?redirect=` with an allow-list.** `safeRedirect` only accepts in-app paths, refuses
  protocol-relative paths and refuses the auth pages themselves. Without it, the guard's own
  parameter would be an open redirect.
- **The demo picker is deliberately visible.** It is the fastest way for a reviewer (and for step
  03h's admin work) to reach both roles without inventing credentials. It is marked for removal in
  step 10, together with the seed in `mocks/auth.js`.
- **Phone number is collected at registration.** The placeholder for this step promised it and
  delivery confirmation is a real furniture-store need; it is normalised to the local `08…` form so
  04d/04g only ever see one shape.
- **Errors are per field, with a shared banner only for the rest.** Wrong credentials and network
  failures cannot be attributed to a field, so they use `FormAlert`; a duplicate email *can*, so
  `EMAIL_TAKEN` is moved onto the email field.
- **`noValidate` + custom messages.** Native bubbles would mix browser-locale English into an
  otherwise Indonesian form and cannot render our wording, so the form owns validation and messages.
- **`PasswordInput` moved into the shared form primitives** rather than an auth-only folder: it is a
  control, not a page concern, and the profile password change in 03e will want the same reveal
  button.
- **Header menu is a disclosure, not `role="menu"`.** A real menu role owes arrow-key handling; a
  button with `aria-expanded` plus normal links keeps the tab order intact with far less code.
  Escape and outside-click both close it and Escape returns focus to the trigger.
- **Sign-out navigates home before the session drops.** The first implementation awaited `logout()`
  first, and `RequireAuth` won the race, sending a signing-out customer to `/masuk?redirect=%2Fakun`
  — which reads as "access denied" rather than "signed out". The harness's final-path log caught it.
- **`headerIconButton` extracted.** The header had four icon buttons using an inline string; a new
  control (the account trigger) would have been the fourth copy.
- **Removed the template's social buttons and "forgot password".** Dead controls contradict the
  brief's rule about honest states. Both are recorded below instead.

## Not done / deferred

- **Password reset** — no roadmap step and no mail infrastructure; needs a decision before 04b.
- **Social / OAuth sign-in** — not in the stack table or roadmap.
- **Admin route guard** — step 03h; the mock session already carries `role` and `useAuth().isAdmin`.
- **Account pages** — step 03e. Signing in currently lands on the 03e placeholder, which is visible
  in the screenshots.
- **Wishlist and cart merge on sign-in** — step 04f; a guest cart is not merged into the account yet.
- **Real endpoints** — step 04b (server) and 05 (client). `services/auth.js` already speaks the
  intended contract (`/auth/me`, `/auth/login`, `/auth/register`, `/auth/logout`).
- **Session-restore flash on the auth pages** — a signed-in visitor who opens `/masuk` renders the
  form for one tick before the redirect. Invisible with mocks (they resolve in a microtask) but worth
  a loading state in 05.
- **Tests** — step 07. `lib/validation.js` is pure and already shaped for unit tests.
- **Toasts, per-page document titles, reduced-motion review** — step 08.
- **Terms and privacy pages** — the registration checkbox names them but links nowhere; no step owns
  those documents yet.

## Out of scope / noticed

- **Review queue is backed up.** 00, 01a, 01b, 03a, 03b and 03c are still "Awaiting review", and step
  02 has no review note at all. This step was built on top of them at the user's direction; flagging
  again so the backlog is not lost.
- **Prettier is not clean repo-wide.** Checking with `--end-of-line auto` still flags eight
  pre-existing files (`SiteFooter`, `Button`, `Price`, `Pagination`, `Spinner`, `EmptyState`,
  `QuantityStepper`, `buttonStyles`) plus `mocks/` files; the working tree also uses CRLF against
  `endOfLine: "lf"`. Every file added by this step is format-clean, and the two spots my edit
  introduced in `SiteHeader` were fixed. A repo-wide `npm run format` belongs to a separate step.
- **`.tmp-capture.mjs` and `.tmp-chrome-profile/` are still not in `.gitignore`**, so `eslint .` from
  the repo root stays noisy. Linting `client/src server/src` is clean.
- **Mock catalogue names still do not match their photos** (pre-existing from 02) — 04a.
- **Sticky header ghost** from step 02 — 08.
- **The header account icon links to `/masuk` while you are on `/masuk`.** Harmless dead-end, but it
  could be hidden on the auth pages; not worth the conditional.

## Open questions for the reviewer

1. **Demo picker.** Keep it visible on `/masuk` until step 10, or hide it behind an env flag now?
2. **"Remember me".** The mock maps it to `localStorage` vs `sessionStorage`. Confirm that 04b should
   map it to a persistent vs session JWT cookie, so the login payload keeps a `remember` field.
3. **Sign-in destination.** After signing in we go to `?redirect=` or `/akun`, which is a placeholder
   until 03e. Acceptable for now, or should it land on the shop until 03e ships?
4. **Password policy.** Eight characters with at least one letter and one digit. Should 04b's zod
   schema enforce exactly this?
5. **Phone number.** Required at registration, normalised to `08…`. Confirm it is the number 04g
   shows on orders, and that `checkout` (03g) pre-fills from it.
6. **Checkout guard.** Should `/pembayaran` require a signed-in customer in 03g? `RequireAuth` is
   ready to wrap it.

## Reviewer feedback

### Review — 2026-11-18

**Verdict: Changes requested.** Validation, authentication, registration, guarded redirects and account-menu behaviour otherwise work against the current API, but sign-out does not satisfy the explicitly checked destination. Only this review note was edited; no application code was changed.

#### Required change

1. **Make sign-out finish on the home page rather than the guarded page's sign-in redirect.** In a fresh browser session, signing in as the customer, opening `/akun`, opening the header account disclosure and choosing “Keluar” produced `/masuk?redirect=%2Fakun`. A second focused run reproduced this immediately and it remained there after two seconds. This contradicts both the checklist and the intended race fix in `AccountMenu`. Ensure the current async/API-backed logout path cannot leave the user on the guard redirect, and apply the same verified behaviour to the account-layout and mobile-header sign-out actions. Add verification evidence for the final path and signed-out header state.

#### Evidence

- Ran `npx eslint client/src server/src`, `npm run build --workspace=client`, and `npm test` successfully. Client has no tests; all 18 current server unit-test files passed (283 tests).
- Ran `npm run dev` and independently exercised the auth screens against the seeded API:
  - `/akun` while signed out redirected to `/masuk?redirect=%2Fakun` and displayed the guard explanation.
  - Empty sign-in submitted two invalid fields and focused `email`; wrong credentials produced “Email atau kata sandi salah.”
  - Password reveal changed the input to text and set `aria-pressed="true"`.
  - The customer demo picker filled both fields without navigating or authenticating.
  - Correct sign-in landed on `/akun`; opening `/masuk` while authenticated returned to `/akun`.
  - The account disclosure showed the customer identity, account links and “Keluar.”
  - Empty registration produced six invalid fields and focused `nama`.
  - Registering with the existing customer email marked the email field invalid and displayed the duplicate-account message.
  - Registering a unique test account succeeded, authenticated it and landed on `/akun`.
  - At 390×844 the authenticated route had no horizontal overflow; the supplied historical mobile guest/form/menu screenshots were also reviewed.
- Inspected the auth provider/session restoration, route guard, safe redirect helper, form error mapping, validators (including the 72-byte-related password limit), password input and account disclosure. The original mock-session screenshots document the now-removed “remember me” UI.
- The required sign-out failure above was observed twice, including a dedicated run whose final URL was `/masuk?redirect=%2Fakun`.

#### Open questions

1. Keep the demo picker visible for local development and review, then remove or explicitly protect it for deployment in step 10.
2. Phase 05 has deliberately removed the client-side “remember me” option and lets the server own cookie lifetime. Do not restore the old mock-only behaviour without a new product/API decision.
3. `/akun` is now a real page and remains the appropriate default post-auth destination; valid guarded redirects take precedence.
4. Keep the eight-character letter-plus-number policy aligned with the server schema, including its maximum-length handling.
5. Registration phone normalisation to `08…` is appropriate. Checkout/order use and pre-fill are checked in their owning steps.
6. `/pembayaran` is correctly behind `RequireAuth` in the current route table.

#### Non-blocking observations

- Password reset, OAuth and legal-document pages require separate product scope; omitting dead controls is correct.
- Frontend tests and the full accessibility pass remain deferred to steps 07 and 08.
