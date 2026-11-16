// Temporary verification harness for the admin steps (03h–03j).
// Owns the preview server and Chrome, captures exact device sizes over CDP.
// Usage: node .tmp-capture.mjs [name-prefix-filter]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;
const BASE = 'http://localhost:5199';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const CUSTOMER = { email: 'sari@badekor.id', password: 'rahasia123' };
const ADMIN = { email: 'admin@badekor.id', password: 'rahasia123' };

const SOFA = '/produk/sofa-ulin-l-shape';
const CHAIR = '/produk/kursi-rotan-sungai';

/** Add two different products, then land on `route`. */
const withCart = (route) => [
  { goto: SOFA },
  { clickText: 'Tambah ke keranjang' },
  { goto: CHAIR },
  { clickText: 'Tambah ke keranjang' },
  { goto: route },
];

const desktop = (name, route, extra = {}) => ({
  name,
  width: 1440,
  height: 900,
  route,
  reset: true,
  login: ADMIN,
  fullPage: true,
  ...extra,
});

const mobile = (name, route, extra = {}) => ({
  name,
  width: 390,
  height: 844,
  route,
  reset: true,
  login: ADMIN,
  fullPage: true,
  ...extra,
});

const shots = [
  {
    name: 'debug-products-metrics',
    width: 1440,
    height: 900,
    route: '/admin/produk',
    reset: true,
    login: ADMIN,
    fullPage: false,
    out: '.reviews/assets/tmp',
    steps: [
      {
        eval: `(() => { const divs = Array.from(document.querySelectorAll('div')).filter((d) => d.scrollWidth > d.clientWidth + 1); return divs.map((d) => ({ sw: d.scrollWidth, cw: d.clientWidth, cls: d.className.slice(0, 70) })); })()`,
      },
      {
        eval: `document.elementsFromPoint(700, 352).map((el) => el.tagName + '|' + String(el.className).slice(0, 60)).join(' >> ')`,
      },
      {
        eval: `JSON.stringify(Array.from(document.querySelectorAll('table')).map((t) => { const w = t.parentElement; const cs = getComputedStyle(w); return { tag: w.tagName, cls: String(w.className).slice(0, 80), rect: w.getBoundingClientRect().toJSON(), kids: Array.from(w.childNodes).map((n) => ({ type: n.nodeType, name: n.nodeName, text: (n.textContent || '').slice(0, 20), rect: n.getBoundingClientRect ? n.getBoundingClientRect().toJSON() : null })), overflowX: cs.overflowX, overflowY: cs.overflowY, padTop: cs.paddingTop }; }))`,
      },
    ],
  },
  {
    name: 'debug-band',
    width: 1440,
    height: 900,
    route: '/admin/produk',
    reset: true,
    login: ADMIN,
    fullPage: false,
    out: '.reviews/assets/tmp',
    clip: { x: 250, y: 320, width: 900, height: 70, scale: 3 },
  },
  desktop('desktop-admin-products', '/admin/produk', { out: '.reviews/assets/03i' }),
  desktop('desktop-admin-product-edit', '/admin/produk', {
    out: '.reviews/assets/03i',
    fullPage: false,
    steps: [{ click: '[aria-label^="Ubah "]' }, { wait: 900 }],
  }),
  desktop('desktop-admin-product-new', '/admin/produk', {
    out: '.reviews/assets/03i',
    fullPage: false,
    steps: [{ clickText: 'Tambah produk' }, { wait: 900 }],
  }),
  desktop('desktop-admin-product-delete', '/admin/produk', {
    out: '.reviews/assets/03i',
    fullPage: false,
    steps: [{ click: '[aria-label^="Hapus "]' }, { wait: 700 }],
  }),
  desktop('desktop-admin-product-created', '/admin/produk', {
    out: '.reviews/assets/03i',
    steps: [
      { clickText: 'Tambah produk' },
      {
        fill: [
          { selector: '#produk-nama', value: 'Kursi Uji Coba' },
          { selector: '#produk-harga', value: '4500000' },
          { selector: '#produk-bahan', value: 'Kayu ulin solid' },
          { selector: '#produk-dimensi', value: '60 × 60 × 75 cm' },
          { selector: '#produk-deskripsi', value: 'Kursi uji coba yang dibuat dari panel toko.' },
          { selector: '#produk-warna', value: 'Ulin natural' },
          { selector: '#produk-gambar', value: '/images/products/product4.jpg' },
        ],
      },
      { eval: 'document.getElementById("form-produk").requestSubmit()' },
      { wait: 1800 },
      { eval: 'document.querySelectorAll("tbody tr").length' },
    ],
  }),
  desktop('desktop-admin-product-live', '/toko?q=kursi-uji-coba', {
    out: '.reviews/assets/03i',
    steps: [
      { goto: '/admin/produk' },
      { clickText: 'Tambah produk' },
      {
        fill: [
          { selector: '#produk-nama', value: 'Kursi Uji Coba' },
          { selector: '#produk-harga', value: '4500000' },
          { selector: '#produk-bahan', value: 'Kayu ulin solid' },
          { selector: '#produk-dimensi', value: '60 × 60 × 75 cm' },
          { selector: '#produk-deskripsi', value: 'Kursi uji coba yang dibuat dari panel toko.' },
          { selector: '#produk-warna', value: 'Ulin natural' },
          { selector: '#produk-gambar', value: '/images/products/product4.jpg' },
        ],
      },
      { eval: 'document.getElementById("form-produk").requestSubmit()' },
      { wait: 1800 },
      { goto: '/toko?q=kursi-uji-coba' },
    ],
  }),
  desktop('desktop-admin-categories', '/admin/produk?tab=kategori', { out: '.reviews/assets/03i' }),
  desktop('desktop-admin-brands', '/admin/produk?tab=merek', { out: '.reviews/assets/03i' }),
  desktop('desktop-admin-category-in-use', '/admin/produk?tab=kategori', {
    out: '.reviews/assets/03i',
    fullPage: false,
    steps: [{ click: '[aria-label^="Hapus "]' }, { wait: 500 }, { clickText: 'Hapus' }, { wait: 1200 }],
  }),
  mobile('mobile-admin-products', '/admin/produk', { out: '.reviews/assets/03i' }),
  mobile('mobile-admin-product-new', '/admin/produk', {
    out: '.reviews/assets/03i',
    fullPage: false,
    steps: [{ clickText: 'Tambah produk' }, { wait: 900 }],
  }),
  desktop('desktop-admin-dashboard', '/admin', { out: '.reviews/assets/03h' }),
  desktop('desktop-admin-orders', '/admin/pesanan', { out: '.reviews/assets/03j' }),
  desktop('desktop-admin-orders-filter', '/admin/pesanan', {
    out: '.reviews/assets/03j',
    fullPage: false,
    steps: [{ clickText: 'Dikirim' }, { wait: 700 }],
  }),
  desktop('desktop-admin-orders-search', '/admin/pesanan', {
    out: '.reviews/assets/03j',
    fullPage: false,
    fill: [{ selector: 'input[aria-label="Cari pesanan"]', value: 'BD-2026-0392' }],
    steps: [{ wait: 700 }],
  }),
  desktop('desktop-admin-order-detail', '/admin/pesanan/BD-2026-0417', {
    out: '.reviews/assets/03j',
  }),
  desktop('desktop-admin-order-shipped', '/admin/pesanan/BD-2026-0392', {
    out: '.reviews/assets/03j',
  }),
  desktop('desktop-admin-order-cancelled', '/admin/pesanan/BD-2026-0307', {
    out: '.reviews/assets/03j',
  }),
  desktop('desktop-admin-order-status-updated', '/admin/pesanan/BD-2026-0417', {
    out: '.reviews/assets/03j',
    fullPage: false,
    steps: [
      {
        eval: `(() => { const select = document.getElementById('status-pesanan'); const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set; setter.call(select, 'shipped'); select.dispatchEvent(new Event('change', { bubbles: true })); return select.value; })()`,
      },
      { clickText: 'Simpan status' },
      { wait: 1600 },
    ],
  }),
  mobile('mobile-admin-orders', '/admin/pesanan', { out: '.reviews/assets/03j' }),
  mobile('mobile-admin-order-detail', '/admin/pesanan/BD-2026-0417', {
    out: '.reviews/assets/03j',
  }),
  desktop('desktop-admin-forbidden', '/admin', {
    out: '.reviews/assets/03h',
    login: CUSTOMER,
  }),
  desktop('desktop-admin-guard', '/admin', { out: '.reviews/assets/03h', login: false }),
  desktop('desktop-admin-menu', '/', {
    out: '.reviews/assets/03h',
    steps: [{ click: '[aria-label^="Akun"]' }, { wait: 700 }],
  }),
  mobile('mobile-admin-dashboard', '/admin', { out: '.reviews/assets/03h' }),
];

const only = process.argv[2];
const selected = only ? shots.filter((shot) => shot.name.startsWith(only)) : shots;

const preview = spawn('npx', ['vite', 'preview', '--port', '5199', '--strictPort'], {
  cwd: 'client',
  shell: true,
  stdio: 'ignore',
});

async function waitFor(url, attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {
      /* retry */
    }
    await wait(300);
  }
  throw new Error(`${url} never responded`);
}

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${path.resolve('.tmp-chrome-profile')}`,
    'about:blank',
  ],
  { stdio: 'ignore' }
);

try {
  await waitFor(`${BASE}/`);

  const wsUrl = await (async () => {
    for (let i = 0; i < 40; i += 1) {
      try {
        const response = await fetch(`http://127.0.0.1:${PORT}/json/list`);
        const targets = await response.json();
        const page = targets.find((target) => target.type === 'page');
        if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
      } catch {
        /* retry */
      }
      await wait(250);
    }
    throw new Error('no Chrome target');
  })();

  const socket = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });

  const send = (method, params = {}) => {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  };

  const evaluate = async (expression) => {
    const { result } = await send('Runtime.evaluate', { expression, returnByValue: true });
    return result?.value;
  };

  async function fillFields(fields = []) {
    for (const field of fields) {
      await evaluate(`(() => {
        const input = document.querySelector(${JSON.stringify(field.selector)});
        if (!input) return false;
        const proto =
          input instanceof window.HTMLTextAreaElement
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        setter.call(input, ${JSON.stringify(field.value)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`);
      await wait(120);
    }
  }

  async function clickText(text) {
    await evaluate(
      `Array.from(document.querySelectorAll('button')).find((button) => button.textContent.includes(${JSON.stringify(
        text
      )}))?.click()`
    );
    await wait(900);
  }

  const login = async (credentials) => {
    await send('Page.navigate', { url: `${BASE}/masuk` });
    await wait(1800);
    await fillFields([
      { selector: '#email', value: credentials.email },
      { selector: '#kata-sandi', value: credentials.password },
    ]);
    await clickText('Masuk');
    await wait(1500);
  };

  await send('Page.enable');

  for (const shot of selected) {
    const outDir = shot.out ?? '.reviews/assets/tmp';
    mkdirSync(path.resolve(outDir), { recursive: true });

    await send('Emulation.setDeviceMetricsOverride', {
      width: shot.width,
      height: shot.height,
      deviceScaleFactor: 1,
      mobile: shot.width < 600,
    });

    if (shot.reset) {
      // Touch the app origin first: the very first shot starts on about:blank,
      // where clearing storage would be a no-op on the real origin.
      await send('Page.navigate', { url: `${BASE}/` });
      await wait(600);
      await evaluate('window.localStorage.clear(); window.sessionStorage.clear();');
    }

    if (shot.login) await login(shot.login);

    await send('Page.navigate', { url: `${BASE}${shot.route}` });
    await wait(2000);

    await fillFields(shot.fill ?? []);

    for (const step of shot.steps ?? []) {
      if (step.clickText) {
        for (let i = 0; i < (step.repeat ?? 1); i += 1) await clickText(step.clickText);
        await wait(1100);
      } else if (step.click) {
        await evaluate(`document.querySelector(${JSON.stringify(step.click)})?.click()`);
        await wait(900);
      } else if (step.fill) {
        await fillFields(step.fill);
      } else if (step.goto) {
        await send('Page.navigate', { url: `${BASE}${step.goto}` });
        await wait(2000);
      } else if (step.wait) {
        await wait(step.wait);
      } else if (step.eval) {
        const value = await evaluate(step.eval);
        console.log(`  eval →`, JSON.stringify(value)?.slice(0, 300));
      }
    }

    let clip;
    if (shot.fullPage) {
      const { contentSize } = await send('Page.getLayoutMetrics');
      clip = { x: 0, y: 0, width: shot.width, height: contentSize.height, scale: 1 };
      await send('Emulation.setDeviceMetricsOverride', {
        width: shot.width,
        height: Math.ceil(contentSize.height),
        deviceScaleFactor: 1,
        mobile: shot.width < 600,
      });
      await wait(900);
    }

    const { data } = await send('Page.captureScreenshot', {
      format: 'png',
      ...(shot.clip ? { clip: shot.clip } : clip ? { clip } : {}),
      captureBeyondViewport: Boolean(clip),
    });
    writeFileSync(path.resolve(outDir, `${shot.name}.png`), Buffer.from(data, 'base64'));

    const where = await evaluate('location.pathname + location.search');
    console.log(`saved ${shot.name} @ ${shot.width}×${shot.height} → ${where}`);
  }

  socket.close();
} finally {
  chrome.kill();
  preview.kill();
}
