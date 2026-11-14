// Temporary verification harness for step 03f.
// Owns the preview server and Chrome, captures exact device sizes over CDP.
// Usage: node .tmp-capture.mjs [name-prefix-filter]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;
const BASE = 'http://localhost:5199';
const OUT = '.reviews/assets/03f';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const CUSTOMER = { email: 'sari@badekor.id', password: 'rahasia123' };

const desktop = (name, route, extra = {}) => ({
  name,
  width: 1440,
  height: 900,
  route,
  reset: true,
  login: CUSTOMER,
  fullPage: true,
  ...extra,
});

const mobile = (name, route, extra = {}) => ({
  name,
  width: 390,
  height: 844,
  route,
  reset: true,
  login: CUSTOMER,
  fullPage: true,
  ...extra,
});

const shots = [
  desktop('desktop-wishlist', '/favorit'),
  desktop('desktop-wishlist-product-page', '/produk/sofa-ulin-l-shape'),
  desktop('desktop-wishlist-shop-hearts', '/toko'),
  desktop('desktop-wishlist-added-from-card', '/toko', {
    steps: [{ click: '[aria-label^="Simpan"]' }, { wait: 1200 }],
  }),
  desktop('desktop-wishlist-after-add', '/favorit', {
    steps: [
      { goto: '/toko' },
      { click: '[aria-label^="Simpan"]' },
      { wait: 1200 },
      { goto: '/favorit' },
    ],
  }),
  desktop('desktop-wishlist-moved', '/favorit', {
    steps: [{ clickText: 'Pindahkan ke keranjang' }, { wait: 1400 }],
  }),
  desktop('desktop-wishlist-removed', '/favorit', {
    steps: [{ clickText: 'Hapus' }, { wait: 1400 }],
  }),
  desktop('desktop-wishlist-empty', '/favorit', {
    steps: [
      { clickText: 'Hapus' },
      { wait: 1200 },
      { clickText: 'Hapus' },
      { wait: 1200 },
      { clickText: 'Hapus' },
      { wait: 1400 },
    ],
  }),
  desktop('desktop-wishlist-soldout', '/favorit'),
  {
    name: 'desktop-wishlist-guest-heart',
    width: 1440,
    height: 900,
    route: '/toko',
    reset: true,
    fullPage: true,
    steps: [{ click: '[aria-label^="Simpan"]' }, { wait: 1600 }],
  },
  {
    name: 'desktop-wishlist-guard',
    width: 1440,
    height: 900,
    route: '/favorit',
    reset: true,
    fullPage: true,
  },
  mobile('mobile-wishlist', '/favorit'),
  mobile('mobile-wishlist-product-page', '/produk/sofa-ulin-l-shape'),
  mobile('mobile-wishlist-moved', '/favorit', {
    steps: [{ clickText: 'Pindahkan ke keranjang' }, { wait: 1400 }],
  }),
];

const only = process.argv[2];
const selected = only ? shots.filter((shot) => shot.name.startsWith(only)) : shots;

mkdirSync(OUT, { recursive: true });

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
    await send('Emulation.setDeviceMetricsOverride', {
      width: shot.width,
      height: shot.height,
      deviceScaleFactor: 1,
      mobile: shot.width < 600,
    });

    if (shot.reset) {
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
      ...(clip ? { clip } : {}),
      captureBeyondViewport: Boolean(clip),
    });
    writeFileSync(path.resolve(OUT, `${shot.name}.png`), Buffer.from(data, 'base64'));

    const where = await evaluate('location.pathname + location.search');
    const carts = await evaluate(
      'document.querySelectorAll("header a[aria-label^=\\"Keranjang\\"] span").length'
    );
    console.log(`saved ${shot.name} @ ${shot.width}×${shot.height} → ${where} (cartBadge=${carts})`);
  }

  socket.close();
} finally {
  chrome.kill();
  preview.kill();
}
