(function () {
  'use strict';

  const DATA = window.SHOP_DATA;
  const P = window.ShopParser;
  const USER = DATA.shop.username;
  const DM_URL = 'https://ig.me/m/' + USER;
  const PROFILE_URL = 'https://www.instagram.com/' + USER + '/';

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => (n == null ? 'Ціну уточнюйте' : n.toLocaleString('uk-UA') + ' грн');
  const plural = (n, one, few, many) => {
    const a = n % 10, b = n % 100;
    if (a === 1 && b !== 11) return one;
    if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
    return many;
  };

  // ---------- Дані ----------

  const items = DATA.posts.map(P.parsePost).sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  for (const it of items) {
    it.search = [it.title, it.brand, it.category, it.color && it.color.raw, it.color && it.color.name,
      it.materials.join(' '), it.details.join(' '), it.hashtags.join(' '), it.sizes.join(' ')]
      .join(' ').toLowerCase();
  }
  const byId = new Map(items.map(it => [it.id, it]));

  const ALL = {
    sizes: [...new Set(items.flatMap(it => it.sizes))].sort((a, b) => P.sizeSortKey(a) - P.sizeSortKey(b)),
    brands: [...new Set(items.map(it => it.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    colors: P.COLORS.filter(([name]) => items.some(it => it.color && it.color.name === name)),
    materials: [...new Set(items.flatMap(it => it.materials))].sort((a, b) => a.localeCompare(b, 'uk')),
    prices: items.map(it => it.price).filter(p => p != null),
    categories: P.CATEGORIES.filter(c => items.some(it => it.category === c)),
  };

  const state = {
    q: '', sort: 'new', showSold: false,
    categories: new Set(), sizes: new Set(), brands: new Set(), colors: new Set(), materials: new Set(),
    min: null, max: null,
  };

  function matches(it, skip) {
    if (!state.showSold && it.status === 'sold') return false;
    if (skip !== 'category' && state.categories.size && !state.categories.has(it.category)) return false;
    if (skip !== 'sizes' && state.sizes.size && !it.sizes.some(s => state.sizes.has(s))) return false;
    if (skip !== 'brands' && state.brands.size && !state.brands.has(it.brand)) return false;
    if (skip !== 'colors' && state.colors.size && !(it.color && state.colors.has(it.color.name))) return false;
    if (skip !== 'materials' && state.materials.size && !it.materials.some(m => state.materials.has(m))) return false;
    if (state.min != null && (it.price == null || it.price < state.min)) return false;
    if (state.max != null && (it.price == null || it.price > state.max)) return false;
    if (state.q) {
      for (const w of state.q.toLowerCase().split(/\s+/)) if (w && !it.search.includes(w)) return false;
    }
    return true;
  }

  function countBy(skip, getKeys) {
    const counts = new Map();
    for (const it of items) {
      if (!matches(it, skip)) continue;
      for (const k of getKeys(it)) if (k) counts.set(k, (counts.get(k) || 0) + 1);
    }
    return counts;
  }

  function activeFilterCount() {
    return state.categories.size + state.sizes.size + state.brands.size + state.colors.size + state.materials.size +
      (state.min != null ? 1 : 0) + (state.max != null ? 1 : 0) + (state.showSold ? 1 : 0);
  }

  // ---------- Шапка ----------

  $('shopName').textContent = USER;
  $('shopSub').textContent = 'Брендовий секонд-хенд · ' + (DATA.shop.city || '');
  $('igProfile').href = PROFILE_URL;
  if (DATA.demo) $('demoBanner').hidden = false;

  // ---------- Тема (світла / темна) ----------

  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
  const currentTheme = () => document.documentElement.dataset.theme || (systemDark.matches ? 'dark' : 'light');
  $('themeBtn').addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) { /* без збереження — теж ок */ }
  });

  // ---------- Категорії ----------

  function renderCategories() {
    const counts = countBy('category', it => [it.category]);
    const total = items.filter(it => matches(it, 'category')).length;
    const cats = P.CATEGORIES.filter(c => counts.get(c) || state.categories.has(c));
    $('categories').innerHTML =
      `<button type="button" class="chip" data-cat="" aria-pressed="${!state.categories.size}">Усі<span class="count">${total}</span></button>` +
      cats.map(c => `<button type="button" class="chip" data-cat="${esc(c)}" aria-pressed="${state.categories.has(c)}">${esc(c)}<span class="count">${counts.get(c) || 0}</span></button>`).join('');
  }

  $('categories').addEventListener('click', e => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    const c = b.dataset.cat;
    const onlyThis = state.categories.size === 1 && state.categories.has(c);
    state.categories.clear();
    if (c && !onlyThis) state.categories.add(c);
    update();
  });

  // ---------- Фільтри ----------

  const BRANDS_VISIBLE = 8;
  // Літерні розміри показуємо завжди; числові (36, 38…, взуття) — лише в межах обраної категорії
  const LETTER_SIZES = new Set(['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL', 'ONE SIZE']);
  let brandsExpanded = false;

  function buildFilters() {
    const minP = Math.min(...ALL.prices), maxP = Math.max(...ALL.prices);
    const groups = [];
    groups.push(`<div class="f-group"><h3>Ціна, грн</h3><div class="f-price">
        <label class="f-price-field"><span>від</span><input type="number" inputmode="numeric" id="priceMin" placeholder="${minP}" min="0" aria-label="Ціна від"></label>
        <label class="f-price-field"><span>до</span><input type="number" inputmode="numeric" id="priceMax" placeholder="${maxP}" min="0" aria-label="Ціна до"></label>
      </div></div>`);
    if (ALL.categories.length) {
      groups.push(`<div class="f-group"><h3>Категорія</h3>` +
        ALL.categories.map(c => `<label class="f-check"><input type="checkbox" data-category="${esc(c)}"><span>${esc(c)}</span><span class="count" data-count-category="${esc(c)}"></span></label>`).join('') +
        `</div>`);
    }
    if (ALL.sizes.length) {
      groups.push(`<div class="f-group"><h3>Розмір</h3><div class="f-sizes">` +
        ALL.sizes.map(s => `<button type="button" class="size-btn" data-size="${esc(s)}" aria-pressed="false">${esc(s)}</button>`).join('') +
        `</div><p class="f-hint" id="sizeHint" hidden>Числові розміри (36, 38, 40…) з'являться, коли оберете категорію</p></div>`);
    }
    if (ALL.brands.length) {
      groups.push(`<div class="f-group"><h3>Бренд</h3>` +
        ALL.brands.map((b, i) => `<label class="f-check"${i >= BRANDS_VISIBLE ? ' data-extra' : ''}><input type="checkbox" data-brand="${esc(b)}"><span>${esc(b)}</span><span class="count" data-count-brand="${esc(b)}"></span></label>`).join('') +
        (ALL.brands.length > BRANDS_VISIBLE ? `<button type="button" class="f-more" id="brandsMore"></button>` : '') +
        `</div>`);
    }
    if (ALL.colors.length) {
      groups.push(`<div class="f-group"><h3>Колір</h3><div class="f-colors">` +
        ALL.colors.map(([name, hex]) => `<button type="button" class="swatch${hex === 'multi' ? ' multi' : ''}" data-color="${esc(name)}" aria-pressed="false" title="${esc(name)}" aria-label="${esc(name)}"${hex === 'multi' ? '' : ` style="background:${hex}"`}></button>`).join('') +
        `</div></div>`);
    }
    if (ALL.materials.length) {
      groups.push(`<div class="f-group"><h3>Матеріал</h3>` +
        ALL.materials.map(m => `<label class="f-check"><input type="checkbox" data-material="${esc(m)}"><span>${esc(m)}</span><span class="count" data-count-material="${esc(m)}"></span></label>`).join('') +
        `</div>`);
    }
    groups.push(`<div class="f-group"><label class="f-toggle"><span>Показувати продані</span><input type="checkbox" id="showSold"></label></div>`);
    $('filtersBody').innerHTML = groups.join('');
  }

  function syncFilters() {
    const body = $('filtersBody');
    const sizeCounts = countBy('sizes', it => it.sizes);
    body.querySelectorAll('[data-size]').forEach(b => {
      const s = b.dataset.size;
      b.setAttribute('aria-pressed', state.sizes.has(s));
      const noCategory = !state.categories.size;
      const visible = state.sizes.has(s) || (sizeCounts.get(s) && (!noCategory || LETTER_SIZES.has(s)));
      b.hidden = !visible;
    });
    if ($('sizeHint')) {
      $('sizeHint').hidden = state.categories.size > 0 || !ALL.sizes.some(s => !LETTER_SIZES.has(s));
    }
    const catCounts = countBy('category', it => [it.category]);
    body.querySelectorAll('[data-category]').forEach(cb => {
      const c = cb.dataset.category;
      cb.checked = state.categories.has(c);
      const n = catCounts.get(c) || 0;
      body.querySelector(`[data-count-category="${CSS.escape(c)}"]`).textContent = n;
      cb.closest('label').style.opacity = n || cb.checked ? '' : .4;
    });
    body.querySelectorAll('label[data-extra]').forEach(l => {
      l.hidden = !brandsExpanded && !l.querySelector('input').checked;
    });
    if ($('brandsMore')) {
      $('brandsMore').textContent = brandsExpanded ? 'Згорнути' : `Усі бренди (${ALL.brands.length})`;
    }
    const brandCounts = countBy('brands', it => [it.brand]);
    body.querySelectorAll('[data-brand]').forEach(cb => {
      const b = cb.dataset.brand;
      cb.checked = state.brands.has(b);
      const n = brandCounts.get(b) || 0;
      body.querySelector(`[data-count-brand="${CSS.escape(b)}"]`).textContent = n;
      cb.closest('label').style.opacity = n || cb.checked ? '' : .4;
    });
    const colorCounts = countBy('colors', it => [it.color && it.color.name]);
    body.querySelectorAll('[data-color]').forEach(b => {
      const c = b.dataset.color;
      b.setAttribute('aria-pressed', state.colors.has(c));
      b.title = `${c} (${colorCounts.get(c) || 0})`;
      b.style.opacity = colorCounts.get(c) || state.colors.has(c) ? '' : .3;
    });
    const matCounts = countBy('materials', it => it.materials);
    body.querySelectorAll('[data-material]').forEach(cb => {
      const m = cb.dataset.material;
      cb.checked = state.materials.has(m);
      const n = matCounts.get(m) || 0;
      body.querySelector(`[data-count-material="${CSS.escape(m)}"]`).textContent = n;
      cb.closest('label').style.opacity = n || cb.checked ? '' : .4;
    });
    $('showSold').checked = state.showSold;
    for (const [id, v] of [['priceMin', state.min], ['priceMax', state.max]]) {
      if (document.activeElement !== $(id)) $(id).value = v ?? '';
    }

    const n = activeFilterCount();
    $('filterCount').hidden = !n;
    $('filterCount').textContent = n;
  }

  const toggleIn = (set, v) => (set.has(v) ? set.delete(v) : set.add(v));

  $('filtersBody').addEventListener('click', e => {
    const size = e.target.closest('[data-size]');
    const color = e.target.closest('[data-color]');
    if (size) { toggleIn(state.sizes, size.dataset.size); update(); }
    if (e.target.id === 'brandsMore') { brandsExpanded = !brandsExpanded; syncFilters(); }
    if (color) { toggleIn(state.colors, color.dataset.color); update(); }
  });
  $('filtersBody').addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.category) toggleIn(state.categories, t.dataset.category);
    else if (t.dataset.brand) toggleIn(state.brands, t.dataset.brand);
    else if (t.dataset.material) toggleIn(state.materials, t.dataset.material);
    else if (t.id === 'showSold') state.showSold = t.checked;
    else return;
    update();
  });
  let priceTimer;
  $('filtersBody').addEventListener('input', e => {
    if (e.target.id !== 'priceMin' && e.target.id !== 'priceMax') return;
    clearTimeout(priceTimer);
    priceTimer = setTimeout(() => {
      const v = id => { const n = parseInt($(id).value, 10); return isNaN(n) ? null : n; };
      state.min = v('priceMin');
      state.max = v('priceMax');
      update();
    }, 300);
  });

  function resetFilters() {
    Object.assign(state, { min: null, max: null, showSold: false, q: '' });
    state.categories.clear(); state.sizes.clear(); state.brands.clear(); state.colors.clear(); state.materials.clear();
    $('search').value = '';
    update();
  }
  $('resetFilters').addEventListener('click', resetFilters);
  $('emptyReset').addEventListener('click', resetFilters);

  // Мобільна шторка з фільтрами
  const openDrawer = () => { $('filters').classList.add('open'); $('filtersBackdrop').classList.add('open'); };
  const closeDrawer = () => { $('filters').classList.remove('open'); $('filtersBackdrop').classList.remove('open'); };
  $('openFilters').addEventListener('click', openDrawer);
  $('closeFilters').addEventListener('click', closeDrawer);
  $('filtersBackdrop').addEventListener('click', closeDrawer);
  $('applyFilters').addEventListener('click', closeDrawer);

  // ---------- Пошук і сортування ----------

  let searchTimer;
  $('search').addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.q = e.target.value.trim(); update(); }, 200);
  });
  $('sort').addEventListener('change', e => { state.sort = e.target.value; update(); });

  // ---------- Сітка товарів ----------

  function sorted(list) {
    const rank = it => (it.status === 'sold' ? 1 : 0); // продане — завжди в кінці
    const cmp = {
      new: (a, b) => String(b.timestamp).localeCompare(String(a.timestamp)),
      cheap: (a, b) => (a.price ?? 1e9) - (b.price ?? 1e9),
      expensive: (a, b) => (b.price ?? -1) - (a.price ?? -1),
    }[state.sort];
    return list.slice().sort((a, b) => rank(a) - rank(b) || cmp(a, b));
  }

  function cardHTML(it) {
    const tag = it.status === 'sold' ? '<span class="tag sold">Продано</span>'
      : it.status === 'reserved' ? '<span class="tag reserved">Заброньовано</span>' : '';
    const photos = it.photoCount > 1 && it.status !== 'sold' ? `<span class="tag photos">${it.photoCount} фото</span>` : '';
    const img = it.thumb
      ? `<img src="${esc(it.thumb)}" alt="${esc(it.title)}" loading="lazy" decoding="async">`
      : '';
    return `<a class="card${it.status === 'sold' ? ' is-sold' : ''}" href="#p=${encodeURIComponent(it.id)}">
      <div class="card-img">${img}${tag}${photos}</div>
      <div>
        ${it.brand ? `<p class="card-brand">${esc(it.brand)}</p>` : ''}
        <h3 class="card-title">${esc(it.title)}</h3>
        <div class="card-meta">
          <span class="card-price">${money(it.price)}</span>
          ${it.sizes.length ? `<span class="card-sizes">${it.sizes.map(s => `<span>${esc(s)}</span>`).join('')}</span>` : ''}
        </div>
      </div>
    </a>`;
  }

  // Показуємо товари порціями, щоб сторінка з 1000+ постів не гальмувала
  const PAGE = 40;
  let currentList = [];
  let shown = 0;

  function showMore() {
    const next = currentList.slice(shown, shown + PAGE);
    $('grid').insertAdjacentHTML('beforeend', next.map(cardHTML).join(''));
    shown += next.length;
    const left = currentList.length - shown;
    $('moreWrap').hidden = left <= 0;
    $('moreBtn').textContent = `Показати ще (${left})`;
  }

  function renderGrid() {
    const list = sorted(items.filter(it => matches(it)));
    currentList = list;
    shown = 0;
    $('grid').innerHTML = '';
    showMore();
    $('empty').hidden = list.length > 0;
    const avail = list.filter(it => it.status !== 'sold').length;
    $('resultsInfo').textContent = list.length
      ? `${avail} ${plural(avail, 'товар', 'товари', 'товарів')} у наявності` +
        (list.length > avail ? ` · ${list.length - avail} ${plural(list.length - avail, 'продано', 'продано', 'продано')}` : '')
      : '';
    $('applyFilters').textContent = `Показати ${list.length}`;
  }

  function update() {
    renderCategories();
    syncFilters();
    renderGrid();
  }

  $('moreBtn').addEventListener('click', showMore);
  // Автопідвантаження, коли покупець догортав до кінця списку
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting) && shown < currentList.length) showMore();
    }, { rootMargin: '600px 0px' }).observe($('moreWrap'));
  }

  // ---------- Картка товару ----------

  const dlg = $('product');
  dlg.appendChild($('toast')); // щоб повідомлення було видно поверх відкритої картки
  let openedFromList = false;

  function openProduct(id) {
    const it = byId.get(id);
    if (!it) return;

    $('pBrand').textContent = it.brand || '';
    $('pBrand').hidden = !it.brand;
    $('pTitle').textContent = it.title;
    $('pPrice').textContent = money(it.price);

    const st = $('pStatus');
    st.hidden = it.status === 'available';
    st.className = 'p-status ' + it.status;
    st.textContent = it.status === 'sold' ? 'Цей товар уже продано'
      : it.status === 'reserved' ? 'Заброньовано — можна написати й стати в чергу' : '';

    const specs = [];
    if (it.sizes.length) specs.push(['Розмір', esc(it.sizes.join(' / '))]);
    if (it.color) {
      const dot = it.color.hex && it.color.hex !== 'multi' ? `<span class="dot" style="background:${it.color.hex}"></span>` : '';
      specs.push(['Колір', dot + esc(it.color.raw.charAt(0).toUpperCase() + it.color.raw.slice(1))]);
    }
    if (it.materials.length) specs.push(['Матеріал', esc(it.materials.join(', '))]);
    specs.push(['Категорія', esc(it.category)]);
    $('pSpecs').innerHTML = specs.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');

    $('pMeasureWrap').hidden = !it.measurements.length;
    $('pMeasure').innerHTML = it.measurements.map(m => `<tr><td>${esc(m.label)}</td><td>${esc(m.value)}</td></tr>`).join('');

    // Рядки, які вже показані в характеристиках, не дублюємо
    const details = it.details.filter(l => !/^(колір|розмір\s|\d+\s*%)/i.test(l));
    $('pDetails').innerHTML = details.map(l => `<p>${esc(l)}</p>`).join('');

    // Текст показуємо покупцю заздалегідь — копіюється лише після явного натискання
    const msg = dmMessage(it);
    const write = $('pWrite');
    const sold = it.status === 'sold';
    write.href = DM_URL;
    $('pWritePlain').href = DM_URL;
    write.setAttribute('aria-disabled', sold);
    $('pWriteLabel').textContent = sold ? 'Товар продано' : 'Скопіювати текст і написати';
    $('pMsg').textContent = msg;
    $('pMsgWrap').hidden = sold;
    $('pWritePlain').hidden = sold;
    write.onclick = sold ? e => e.preventDefault() : () => {
      copyText(msg).then(ok => toast(ok
        ? 'Текст скопійовано ✓ Вставте його в чат'
        : 'Не вдалося скопіювати — перепишіть текст вручну'));
    };
    $('pPost').href = it.permalink || PROFILE_URL;

    // Галерея
    const track = $('gTrack');
    track.innerHTML = it.images.map((src, i) => `<img src="${esc(src)}" alt="${esc(it.title)} — фото ${i + 1}">`).join('');
    track.scrollLeft = 0;
    const many = it.images.length > 1;
    $('gPrev').hidden = $('gNext').hidden = !many;
    $('gDots').innerHTML = many ? it.images.map((_, i) => `<span class="${i ? '' : 'on'}"></span>`).join('') : '';
    // Якщо в пості Instagram фото більше, ніж на сайті — підказка з посиланням на пост
    const extra = (it.photoCount || 0) - it.images.length;
    const more = $('gMore');
    more.hidden = extra <= 0;
    more.textContent = `+${extra} фото в Instagram →`;
    more.href = it.permalink || PROFILE_URL;

    if (!dlg.open) dlg.showModal();
    document.body.style.overflow = 'hidden';
    $('product').querySelector('.product-info').scrollTop = 0;
  }

  function dmMessage(it) {
    const parts = [it.title, it.brand].filter(Boolean).join(' ');
    return `Вітаю! Мене цікавить: ${parts}${it.price != null ? ', ' + money(it.price) : ''}` +
      (it.permalink ? `\n${it.permalink}` : '');
  }

  function closeProduct() {
    if (dlg.open) dlg.close();
  }

  dlg.addEventListener('close', () => {
    document.body.style.overflow = '';
    if (location.hash.startsWith('#p=')) {
      if (openedFromList) history.back();
      else history.replaceState(null, '', location.pathname + location.search);
    }
    openedFromList = false;
  });
  $('closeProduct').addEventListener('click', closeProduct);
  dlg.addEventListener('click', e => { if (e.target === dlg) closeProduct(); });

  const track = $('gTrack');
  const step = dir => track.scrollBy({ left: dir * track.clientWidth, behavior: 'smooth' });
  $('gPrev').addEventListener('click', () => step(-1));
  $('gNext').addEventListener('click', () => step(1));
  track.addEventListener('scroll', () => {
    const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    [...$('gDots').children].forEach((d, j) => d.classList.toggle('on', i === j));
  }, { passive: true });

  function onHash(fromUser) {
    const m = location.hash.match(/^#p=(.+)$/);
    if (m) {
      openedFromList = fromUser;
      openProduct(decodeURIComponent(m[1]));
    } else if (dlg.open) {
      openedFromList = false;
      dlg.close();
    }
  }
  window.addEventListener('hashchange', () => onHash(true));

  // ---------- Буфер обміну і повідомлення ----------

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(() => true, () => legacyCopy(text));
    }
    return Promise.resolve(legacyCopy(text));
  }
  function legacyCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
  }

  // ---------- Старт ----------

  buildFilters();
  update();
  onHash(false);
})();
