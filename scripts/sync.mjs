/*
 * Синхронізація каталогу з Instagram.
 *
 * Запускається на GitHub Actions (див. .github/workflows/sync.yml).
 * 1. Забирає всі пости маминого акаунта через Instagram API (Graph API).
 * 2. Розбирає підписи тим самим парсером, що й сайт (js/parser.js).
 * 3. Завантажує та стискає фото: для товарів у наявності — всі фото каруселі,
 *    для проданих — лише обкладинку.
 * 4. Записує data/posts.js (дані для сайту) і data/sync-report.json (звіт).
 *
 * Токен береться зі змінної середовища IG_TOKEN (секрет GitHub) і ніде не друкується.
 */
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = require(path.join(ROOT, 'js', 'parser.js'));

const TOKEN = process.env.IG_TOKEN || '';
const IG_USER_ID = process.env.IG_USER_ID || '';
const GRAPH = 'https://graph.facebook.com/' + (process.env.GRAPH_VERSION || 'v27.0');
const SHOP = { username: 'viktoria3101_shop', city: 'Київ' };

const DATA_DIR = path.join(ROOT, 'data');
// Номер у назві папки: якщо змінити розміри/якість, достатньо збільшити його — фото перегенеруються.
const IMG_VERSION = 'p2';
const IMG_DIR = path.join(DATA_DIR, 'img', IMG_VERSION);
const MAX_PHOTOS = 10;      // максимум фото з однієї каруселі (решта — в пості Instagram)
const FULL_WIDTH = 960;     // фото в картці товару
const FULL_QUALITY = 72;
const THUMB_WIDTH = 480;    // фото в сітці каталогу
const SIZE_WARN_MB = 850;   // GitHub Pages дозволяє сайт до 1 ГБ
const PARALLEL = 6;

const report = {
  startedAt: new Date().toISOString(),
  finishedAt: null,
  ok: false,
  error: null,
  account: null,
  totals: { posts: 0, products: 0, available: 0, reserved: 0, sold: 0, skippedNoPrice: 0 },
  images: { downloaded: 0, reused: 0, failed: 0, removedDirs: 0 },
  issues: { noPrice: [], noSize: [], noBrand: [], otherCategory: [] },
};

// ---------- Утиліти ----------

const hide = s => (TOKEN ? String(s).split(TOKEN).join('***') : String(s));
const log = (...a) => console.log(hide(a.join(' ')));
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function graph(urlOrPath, params = {}) {
  const url = new URL(urlOrPath.startsWith('http') ? urlOrPath : GRAPH + urlOrPath);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.delete('access_token'); // токен передаємо лише в заголовку
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + TOKEN } });
    const body = await res.json().catch(() => ({}));
    if (res.ok && !body.error) return body;
    const e = body.error || {};
    const msg = `Graph API ${res.status}: ${e.message || 'невідома помилка'} (code ${e.code ?? '-'}, subcode ${e.error_subcode ?? '-'})`;
    const retryable = res.status >= 500 || e.is_transient || [1, 2, 4, 17, 32, 613].includes(e.code);
    if (!retryable || attempt >= 4) throw new Error(hide(msg));
    log(`  повтор через ${attempt * 5} с: ${msg}`);
    await sleep(attempt * 5000);
  }
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  }));
}

async function download(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      if (attempt === 3) throw e;
      await sleep(2000 * attempt);
    }
  }
}

async function saveImage(buf, file, width, quality) {
  await sharp(buf).rotate().resize({ width, withoutEnlargement: true }).webp({ quality }).toFile(file);
}

// ---------- Instagram ----------

async function fetchAccount() {
  if (!IG_USER_ID) throw new Error('Не задано IG_USER_ID');
  const acc = await graph('/' + IG_USER_ID, { fields: 'id,username,media_count' });
  log(`Акаунт: @${acc.username}, постів: ${acc.media_count}`);
  return acc;
}

async function fetchAllMedia(igId) {
  const fields = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,' +
    'children{id,media_type,media_url,thumbnail_url}';
  const all = [];
  let page = await graph(`/${igId}/media`, { fields, limit: '50' });
  for (;;) {
    all.push(...(page.data || []));
    log(`  отримано постів: ${all.length}`);
    const next = page.paging && page.paging.next;
    if (!next) break;
    page = await graph(next);
  }
  return all;
}

function photoUrls(m) {
  const pick = x => (x.media_type === 'VIDEO' ? x.thumbnail_url : x.media_url);
  if (m.media_type === 'CAROUSEL_ALBUM' && m.children && m.children.data) {
    return m.children.data.map(pick).filter(Boolean);
  }
  return [pick(m)].filter(Boolean);
}

// ---------- Розпродажі ----------
//
// Пост «❗Розпродаж❗ Всі речі в дописі по 200 грн» — карусель із фото речей, які мають і свої окремі
// пости (зі старою ціною). Знаходимо пари за «відбитком» фото (dHash 16×16): однакові фото дають
// відстань ~0–20 з 256, різні — 55+.

const SALE_RE = /розпрод/i;
const SALE_MAX_PHOTOS = 20;
const MATCH_MAX_DIST = 30;   // не більше стількох різних біт — та сама фотографія
const MATCH_MIN_GAP = 20;    // і друга найкраща пара має бути помітно гіршою (щоб не сплутати схожі речі)

async function dhash(file) {
  const { data } = await sharp(file).grayscale().resize(17, 16, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const words = new Uint32Array(8);
  let bit = 0;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++, bit++) {
      if (data[y * 17 + x] > data[y * 17 + x + 1]) words[bit >> 5] |= 1 << (bit & 31);
    }
  }
  return words;
}

function hamming(a, b) {
  let n = 0;
  for (let i = 0; i < 8; i++) {
    let v = a[i] ^ b[i];
    v = v - ((v >>> 1) & 0x55555555);
    v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
    n += (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
  }
  return n;
}

async function matchSales(products) {
  const sales = products.filter(p => p.isSale);
  report.sales = [];
  if (!sales.length) return;

  // Відбитки всіх фото кожної звичайної речі (у розпродаж мама іноді бере не перше фото)
  const index = [];
  for (const p of products) {
    if (p.isSale) continue;
    for (const f of p.files) {
      if (!existsSync(f)) continue;
      try { index.push({ h: await dhash(f), p }); } catch { /* пошкоджене фото — пропускаємо */ }
    }
  }

  // Від старіших розпродажів до новіших: якщо річ була в кількох, перемагає найновіша ціна
  sales.sort((a, b) => String(a.m.timestamp).localeCompare(String(b.m.timestamp)));
  for (const s of sales) {
    const price = s.parsed.price;
    s.saleLinks = [];
    const entry = { post: s.m.permalink, price, photos: s.files.length, matched: [], unmatched: [] };
    for (let i = 0; i < s.files.length; i++) {
      s.saleLinks[i] = null;
      if (!existsSync(s.files[i])) continue;
      let h;
      try { h = await dhash(s.files[i]); } catch { continue; }
      // Найкраща і друга найкраща річ (різні пости)
      let best = null, second = Infinity;
      const perPost = new Map();
      for (const x of index) {
        const d = hamming(h, x.h);
        if (!perPost.has(x.p) || d < perPost.get(x.p)) perPost.set(x.p, d);
      }
      for (const [p, d] of perPost) {
        if (!best || d < best.d) { if (best) second = Math.min(second, best.d); best = { p, d }; }
        else if (d < second) second = d;
      }
      if (best && best.d <= MATCH_MAX_DIST && second - best.d >= MATCH_MIN_GAP) {
        const item = best.p;
        s.saleLinks[i] = item.m.id;
        if (price != null && item.parsed.price != null && price < item.parsed.price) {
          item.sale = { price, id: s.m.id };
        }
        entry.matched.push({ photo: i + 1, post: item.m.permalink, oldPrice: item.parsed.price, status: item.parsed.status });
      } else if (i > 0) {
        entry.unmatched.push(i + 1); // фото 1 — зазвичай обкладинка «Речі по 100 грн»
      }
    }
    report.sales.push(entry);
    log(`Розпродаж ${s.m.permalink}: знайдено ${entry.matched.length} з ${s.files.length} фото`);
  }
}

// ---------- Головне ----------

async function main() {
  if (!TOKEN) throw new Error('Немає токена: секрет IG_TOKEN не заданий');

  const acc = await fetchAccount();
  report.account = { username: acc.username, mediaCount: acc.media_count };
  const media = await fetchAllMedia(acc.id);
  report.totals.posts = media.length;

  // Розбираємо підписи
  const products = [];
  for (const m of media) {
    const urls = photoUrls(m);
    const parsed = P.parsePost({ id: m.id, caption: m.caption || '', timestamp: m.timestamp, permalink: m.permalink, media: [] });
    if (parsed.price == null) {
      report.totals.skippedNoPrice++;
      report.issues.noPrice.push(m.permalink);
      continue;
    }
    report.totals[parsed.status]++;
    const needsSize = !['Сумки', 'Аксесуари'].includes(parsed.category);
    if (parsed.status !== 'sold') {
      if (needsSize && !parsed.sizes.length) report.issues.noSize.push(m.permalink);
      if (!parsed.brand) report.issues.noBrand.push(m.permalink);
      if (parsed.category === 'Інше') report.issues.otherCategory.push(m.permalink);
    }
    const isSale = SALE_RE.test((m.caption || '').split('\n')[0]);
    const keep = isSale ? SALE_MAX_PHOTOS : parsed.status === 'sold' ? 1 : MAX_PHOTOS;
    products.push({ m, parsed, isSale, urls: urls.slice(0, keep), total: urls.length });
  }
  report.totals.products = products.length;
  log(`Товарів: ${products.length} (у наявності ${report.totals.available}, бронь ${report.totals.reserved}, продано ${report.totals.sold}); без ціни пропущено: ${report.totals.skippedNoPrice}`);

  // Фото
  await fs.mkdir(IMG_DIR, { recursive: true });
  const jobs = [];
  for (const p of products) {
    const dir = path.join(IMG_DIR, p.m.id);
    p.files = [];
    p.urls.forEach((url, i) => {
      const file = path.join(dir, `${i}.webp`);
      p.files.push(file);
      jobs.push({ url, dir, file, width: FULL_WIDTH, q: FULL_QUALITY });
      if (i === 0) jobs.push({ url, dir, file: path.join(dir, 't.webp'), width: THUMB_WIDTH, q: 70 });
    });
  }
  await pool(jobs, PARALLEL, async job => {
    if (existsSync(job.file)) { report.images.reused++; return; }
    try {
      await fs.mkdir(job.dir, { recursive: true });
      const buf = await download(job.url);
      await saveImage(buf, job.file, job.width, job.q);
      report.images.downloaded++;
    } catch (e) {
      report.images.failed++;
      log(`  не вдалося завантажити фото (${path.relative(ROOT, job.file)}): ${e.message}`);
    }
  });
  log(`Фото: нових ${report.images.downloaded}, вже були ${report.images.reused}, помилок ${report.images.failed}`);

  // Прибираємо зайве: видалені пости і зайві фото проданих
  const keepIds = new Set(products.map(p => p.m.id));
  for (const name of existsSync(IMG_DIR) ? await fs.readdir(IMG_DIR) : []) {
    const dir = path.join(IMG_DIR, name);
    if (!keepIds.has(name)) {
      await fs.rm(dir, { recursive: true, force: true });
      report.images.removedDirs++;
      continue;
    }
    const p = products.find(x => x.m.id === name);
    const allowed = new Set(['t.webp', ...p.files.map(f => path.basename(f))]);
    for (const f of await fs.readdir(dir)) if (!allowed.has(f)) await fs.rm(path.join(dir, f), { force: true });
  }
  // Тестові фото з макета і папки фото старих версій більше не потрібні
  for (const f of await fs.readdir(path.join(DATA_DIR, 'img'))) {
    const full = path.join(DATA_DIR, 'img', f);
    if (f.endsWith('.jpg') || (f !== IMG_VERSION && /^p\d*$/.test(f))) await fs.rm(full, { recursive: true, force: true });
  }
  // Скільки місця займають фото
  let bytes = 0;
  for (const d of await fs.readdir(IMG_DIR)) {
    for (const f of await fs.readdir(path.join(IMG_DIR, d))) bytes += (await fs.stat(path.join(IMG_DIR, d, f))).size;
  }
  report.images.totalMB = Math.round(bytes / 1048576);
  log(`Фото займають ${report.images.totalMB} МБ`);
  if (report.images.totalMB > SIZE_WARN_MB) log(`УВАГА: фото займають понад ${SIZE_WARN_MB} МБ — ліміт GitHub Pages 1 ГБ`);

  // Розпродажі: шукаємо, якому окремому посту відповідає кожне фото каруселі
  await matchSales(products);

  // Дані для сайту
  const rel = f => path.relative(ROOT, f).split(path.sep).join('/');
  const posts = products.map(p => {
    const kept = p.files.map((f, i) => ({ f, i })).filter(x => existsSync(x.f));
    const media = kept.map(x => rel(x.f));
    const thumb = path.join(IMG_DIR, p.m.id, 't.webp');
    const post = {
      id: p.m.id,
      timestamp: p.m.timestamp,
      permalink: p.m.permalink,
      media,
      thumb: existsSync(thumb) ? rel(thumb) : media[0] || null,
      photoCount: p.total, // скільки фото в пості Instagram усього (на сайті — до MAX_PHOTOS)
      caption: p.m.caption || '',
    };
    if (p.isSale) {
      post.isSale = true;
      post.saleLinks = kept.map(x => (p.saleLinks && p.saleLinks[x.i]) || null); // id окремого поста для кожного фото
    }
    if (p.sale) {
      post.salePrice = p.sale.price;   // ціна з розпродажу (менша за звичайну)
      post.saleFrom = p.sale.id;       // id поста-розпродажу
    }
    return post;
  }).filter(p => p.media.length);

  const data = { demo: false, shop: SHOP, updatedAt: new Date().toISOString(), posts };
  const js = '/* Згенеровано автоматично скриптом scripts/sync.mjs — не редагувати вручну */\n' +
    'window.SHOP_DATA = ' + JSON.stringify(data, null, 1) + ';\n';
  await fs.writeFile(path.join(DATA_DIR, 'posts.js'), js, 'utf8');
  log(`Записано data/posts.js: ${posts.length} товарів`);
  report.ok = true;
}

try {
  await main();
} catch (e) {
  report.error = hide(e.message || String(e));
  console.error('ПОМИЛКА:', report.error);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, 'sync-report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
}
