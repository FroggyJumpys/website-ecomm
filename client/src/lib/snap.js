/**
 * Snap popup loading.
 *
 * The script is injected at runtime rather than put in `index.html` because its
 * URL and client key come from the API: the same build must be able to talk to
 * the sandbox in development and to production later, without a rebuild.
 *
 * The popup itself is Midtrans-hosted, which is what keeps card data out of this
 * app entirely.
 */

let loader = null;
let loadedKey = null;

function scriptLoaded() {
  return typeof window !== 'undefined' && typeof window.snap?.pay === 'function';
}

/**
 * Loads `snap.js` once per client key. A second call returns the same promise,
 * so two components cannot inject the script twice.
 */
export function loadSnap({ scriptUrl, clientKey }) {
  if (scriptLoaded()) return Promise.resolve(window.snap);
  if (!scriptUrl || !clientKey) {
    return Promise.reject(new Error('Pembayaran online belum dikonfigurasi.'));
  }

  if (loader && loadedKey === clientKey) return loader;

  loadedKey = clientKey;
  loader = new Promise((resolve, reject) => {
    const script = document.createElement('script');

    script.src = scriptUrl;
    script.async = true;
    script.dataset.clientKey = clientKey;
    script.setAttribute('data-badekor-snap', 'true');
    script.onload = () => {
      if (scriptLoaded()) resolve(window.snap);
      else reject(new Error('Pembayaran online tidak dapat dimuat.'));
    };
    script.onerror = () => {
      loader = null;
      loadedKey = null;
      reject(new Error('Pembayaran online tidak dapat dimuat. Periksa koneksi Anda.'));
    };

    document.head.appendChild(script);
  });

  return loader;
}

/**
 * Opens the Snap popup. The callbacks are only hints: `onSuccess` does not make
 * an order paid, the server's webhook or sync call does.
 */
export function openSnapPayment(snap, token, handlers) {
  snap.pay(token, handlers);
}
