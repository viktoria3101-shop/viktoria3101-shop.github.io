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

  // Розпродажі: стан кожного фото каруселі.
  // «Фото N - Продано» в підписі розпродажу (або продана окрема річ) → фото продане,
  // і окрема річ теж стає проданою. Рахуємо, скільки речей ще в наявності.
  for (const s of items.filter(it => it.isSale)) {
    const soldNums = new Set(s.soldPhotos || []);
    s.slideState = s.images.map((_, i) => {
      if (i === 0) return { kind: 'cover' };
      const linked = s.saleLinks && s.saleLinks[i] ? byId.get(String(s.saleLinks[i])) : null;
      const sold = soldNums.has(i + 1) || !!(linked && linked.status === 'sold');
      if (sold && linked && linked.status !== 'sold') linked.status = 'sold';
      return { kind: sold ? 'sold' : linked ? 'linked' : 'available', linked };
    });
    const slides = s.slideState.filter(x => x.kind !== 'cover');
    s.saleTotal = slides.length;
    s.saleLeft = slides.filter(x => x.kind !== 'sold').length;
    if (s.saleTotal && !s.saleLeft) s.status = 'sold';
  }

  const ALL = {
    sizes: [...new Set(items.flatMap(it => it.sizes))].sort((a, b) => P.sizeSortKey(a) - P.sizeSortKey(b)),
    brands: [...new Set(items.map(it => it.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    colors: P.COLORS.filter(([name]) => items.some(it => it.color && it.color.name === name)),
    materials: [...new Set(items.flatMap(it => it.materials))].sort((a, b) => a.localeCompare(b, 'uk')),
    prices: items.map(it => it.price).filter(p => p != null),
    categories: P.CATEGORIES.filter(c => items.some(it => it.category === c || (c === P.SALE_CATEGORY && it.onSale))),
  };

  const state = {
    q: '', sort: 'new', soldOnly: false, // soldOnly — категорія «Продано» (для мами: що видалити в Instagram)
    categories: new Set(), sizes: new Set(), brands: new Set(), colors: new Set(), materials: new Set(),
    min: null, max: null,
  };

  function matches(it, skip) {
    if (skip !== 'sold' && (state.soldOnly ? it.status !== 'sold' : it.status === 'sold')) return false;
    if (skip !== 'category' && state.categories.size &&
      !(state.categories.has(it.category) || (it.onSale && state.categories.has(P.SALE_CATEGORY)))) return false;
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
      (state.min != null ? 1 : 0) + (state.max != null ? 1 : 0) + (state.soldOnly ? 1 : 0);
  }

  // Річ, що є в розпродажі, рахується і у своїй категорії, і в «Розпродажі»
  const catKeys = it => [it.category, it.onSale ? P.SALE_CATEGORY : null];

  function soldCount() {
    return items.filter(it => it.status === 'sold' && matches(it, 'sold')).length;
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
    const counts = countBy('category', catKeys);
    const total = items.filter(it => matches(it, 'category')).length;
    const cats = P.CATEGORIES.filter(c => counts.get(c) || state.categories.has(c));
    $('categories').innerHTML =
      `<button type="button" class="chip" data-cat="" aria-pressed="${!state.categories.size && !state.soldOnly}">Усі<span class="count">${total}</span></button>` +
      cats.map(c => `<button type="button" class="chip" data-cat="${esc(c)}" aria-pressed="${state.categories.has(c)}">${esc(c)}<span class="count">${counts.get(c) || 0}</span></button>`).join('') +
      (soldCount() || state.soldOnly
        ? `<button type="button" class="chip chip-sold" data-cat="__sold" aria-pressed="${state.soldOnly}">Продано<span class="count">${soldCount()}</span></button>`
        : '');
  }

  $('categories').addEventListener('click', e => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    const c = b.dataset.cat;
    if (c === '__sold') {
      state.soldOnly = !state.soldOnly;
      state.categories.clear();
    } else {
      const onlyThis = state.categories.size === 1 && state.categories.has(c) && !state.soldOnly;
      state.categories.clear();
      state.soldOnly = false;
      if (c && !onlyThis) state.categories.add(c);
    }
    update();
  });

  // ---------- Фільтри ----------

  const BRANDS_VISIBLE = 8;
  // Літерні розміри показуємо завжди; числові (36, 38…, взуття) — лише в межах обраної категорії
  const LETTER_SIZES = new Set(['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL', 'ONE SIZE']);
  let brandsExpanded = false;
  let brandQuery = '';

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
        `<label class="f-check f-sold"><input type="checkbox" id="soldOnly"><span>Продано</span><span class="count" id="soldCount"></span></label>` +
        `</div>`);
    }
    if (ALL.sizes.length) {
      groups.push(`<div class="f-group"><h3>Розмір</h3><div class="f-sizes">` +
        ALL.sizes.map(s => `<button type="button" class="size-btn" data-size="${esc(s)}" aria-pressed="false">${esc(s)}</button>`).join('') +
        `</div><p class="f-hint" id="sizeHint" hidden>Числові розміри (36, 38, 40…) з'являться, коли оберете категорію</p></div>`);
    }
    if (ALL.brands.length) {
      groups.push(`<div class="f-group"><h3>Бренд</h3>` +
        (ALL.brands.length > BRANDS_VISIBLE
          ? `<input type="search" class="f-search" id="brandSearch" placeholder="Пошук бренду…" autocomplete="off" aria-label="Пошук бренду">`
          : '') +
        `<div id="brandList">` +
        ALL.brands.map(b => `<label class="f-check"><input type="checkbox" data-brand="${esc(b)}"><span>${esc(b)}</span><span class="count" data-count-brand="${esc(b)}"></span></label>`).join('') +
        `</div><p class="f-hint" id="brandEmpty" hidden>Такого бренду зараз немає</p>` +
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
    const catCounts = countBy('category', catKeys);
    body.querySelectorAll('[data-category]').forEach(cb => {
      const c = cb.dataset.category;
      cb.checked = state.categories.has(c);
      const n = catCounts.get(c) || 0;
      body.querySelector(`[data-count-category="${CSS.escape(c)}"]`).textContent = n;
      cb.closest('label').hidden = !n && !cb.checked; // категорії без товарів ховаємо
    });

    // Бренди: лише ті, що є в поточній вибірці; найпопулярніші зверху; пошук по назві
    const brandCounts = countBy('brands', it => [it.brand]);
    const q = brandQuery.trim().toLowerCase();
    const rows = [...body.querySelectorAll('#brandList label')].map(label => {
      const cb = label.querySelector('input');
      const b = cb.dataset.brand;
      const n = brandCounts.get(b) || 0;
      cb.checked = state.brands.has(b);
      label.querySelector('.count').textContent = n;
      const show = (n > 0 || cb.checked) && (!q || b.toLowerCase().includes(q));
      return { label, b, n, checked: cb.checked, show };
    });
    const brandRows = rows.filter(r => r.show)
      .sort((a, b) => (b.checked - a.checked) || (b.n - a.n) || a.b.localeCompare(b.b));
    const limit = brandsExpanded || q ? Infinity : BRANDS_VISIBLE;
    const list = $('brandList');
    if (list) {
      brandRows.forEach((r, i) => { r.label.hidden = i >= limit && !r.checked; list.appendChild(r.label); });
      rows.filter(r => !r.show).forEach(r => { r.label.hidden = true; });
      $('brandEmpty').hidden = !(q && !brandRows.length);
    }
    if ($('brandsMore')) {
      $('brandsMore').hidden = !!q || brandRows.length <= BRANDS_VISIBLE;
      $('brandsMore').textContent = brandsExpanded ? 'Згорнути' : `Усі бренди (${brandRows.length})`;
    }
    const colorCounts = countBy('colors', it => [it.color && it.color.name]);
    body.querySelectorAll('[data-color]').forEach(b => {
      const c = b.dataset.color;
      b.setAttribute('aria-pressed', state.colors.has(c));
      b.title = `${c} (${colorCounts.get(c) || 0})`;
      b.hidden = !colorCounts.get(c) && !state.colors.has(c);
    });
    const matCounts = countBy('materials', it => it.materials);
    body.querySelectorAll('[data-material]').forEach(cb => {
      const m = cb.dataset.material;
      cb.checked = state.materials.has(m);
      const n = matCounts.get(m) || 0;
      body.querySelector(`[data-count-material="${CSS.escape(m)}"]`).textContent = n;
      cb.closest('label').hidden = !n && !cb.checked;
    });
    if ($('soldOnly')) {
      $('soldOnly').checked = state.soldOnly;
      $('soldCount').textContent = soldCount();
    }
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
    else if (t.id === 'soldOnly') state.soldOnly = t.checked;
    else return;
    update();
  });
  let priceTimer;
  $('filtersBody').addEventListener('input', e => {
    if (e.target.id === 'brandSearch') { brandQuery = e.target.value; syncFilters(); return; }
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
    Object.assign(state, { min: null, max: null, soldOnly: false, q: '' });
    state.categories.clear(); state.sizes.clear(); state.brands.clear(); state.colors.clear(); state.materials.clear();
    $('search').value = '';
    brandQuery = '';
    if ($('brandSearch')) $('brandSearch').value = '';
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
    const saleView = state.categories.has(P.SALE_CATEGORY);
    // продане — завжди в кінці; у «Розпродажі» спершу самі дописи-розпродажі
    const rank = it => (it.status === 'sold' ? 2 : 0) + (saleView && !it.isSale ? 1 : 0);
    const cmp = {
      new: (a, b) => String(b.timestamp).localeCompare(String(a.timestamp)),
      cheap: (a, b) => (a.price ?? 1e9) - (b.price ?? 1e9),
      expensive: (a, b) => (b.price ?? -1) - (a.price ?? -1),
    }[state.sort];
    return list.slice().sort((a, b) => rank(a) - rank(b) || cmp(a, b));
  }

  function cardHTML(it) {
    const tag = it.status === 'sold' ? '<span class="tag sold">Продано</span>'
      : it.status === 'reserved' ? '<span class="tag reserved">Заброньовано</span>'
      : it.onSale ? '<span class="tag sale">Розпродаж</span>' : '';
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
          <span class="card-price">${it.oldPrice ? `<s class="old-price">${money(it.oldPrice)}</s> ` : ''}${money(it.price)}</span>
          ${it.sizes.length ? `<span class="card-sizes">${it.sizes.map(s => `<span>${esc(s)}</span>`).join('')}</span>` : ''}
          ${it.isSale ? `<span class="card-left">В наявності: ${it.saleLeft} з ${it.saleTotal}</span>` : ''}
        </div>
      </div>
    </a>`;
  }

  // Показуємо товари порціями, щоб сторінка з 1000+ постів не гальмувала
  const PAGE = 40;
  const AUTO_LOAD_LIMIT = 120;
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
    const n = list.length;
    $('resultsInfo').textContent = !n ? ''
      : state.soldOnly
        ? `${n} ${plural(n, 'продана річ', 'продані речі', 'проданих речей')} · відкрийте річ, щоб перейти до поста в Instagram`
        : `${n} ${plural(n, 'товар', 'товари', 'товарів')} у наявності`;
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
      // Автоматично — лише перші ~120 товарів, далі кнопкою: інакше до низу сайту (доставка, оплата) не догорнути
      if (entries.some(e => e.isIntersecting) && shown < currentList.length && shown < AUTO_LOAD_LIMIT) showMore();
    }, { rootMargin: '600px 0px' }).observe($('moreWrap'));
  }

  // ---------- Картка товару ----------

  const dlg = $('product');
  let currentItem = null, currentPhoto = 0, currentMsg = '';
  dlg.appendChild($('toast')); // щоб повідомлення було видно поверх відкритої картки
  let openedFromList = false;

  function openProduct(id) {
    const it = byId.get(id);
    if (!it) return;

    $('pBrand').textContent = it.brand || '';
    $('pBrand').hidden = !it.brand;
    $('pTitle').textContent = it.title;
    $('pPrice').innerHTML = (it.oldPrice ? `<s class="old-price">${money(it.oldPrice)}</s> ` : '') + money(it.price) +
      (it.onSale && byId.has(it.saleFrom) ? ` <a class="p-sale-link" href="#p=${encodeURIComponent(it.saleFrom)}">з розпродажу →</a>` : '');

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
    if (it.isSale) specs.push(['В наявності', `${it.saleLeft} з ${it.saleTotal} речей`]);
    specs.push(['Категорія', esc(it.category)]);
    $('pSpecs').innerHTML = specs.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');

    $('pMeasureWrap').hidden = !it.measurements.length;
    $('pMeasure').innerHTML = it.measurements.map(m => `<tr><td>${esc(m.label)}</td><td>${esc(m.value)}</td></tr>`).join('');

    // Рядки, які вже показані в характеристиках, не дублюємо
    const details = it.details.filter(l => !/^(колір|розмір\s|\d+\s*%)/i.test(l));
    $('pDetails').innerHTML = details.map(l => `<p>${esc(l)}</p>`).join('');

    // Текст показуємо покупцю заздалегідь — копіюється лише після явного натискання
    currentItem = it;
    currentPhoto = 0;
    const msg = dmMessage(it, 0);
    currentMsg = msg;
    const write = $('pWrite');
    const sold = it.status === 'sold';
    // Продана річ: кнопка веде прямо на пост в Instagram (щоб мама швидко його видалила)
    write.href = sold ? (it.permalink || PROFILE_URL) : DM_URL;
    $('pWritePlain').href = DM_URL;
    $('pWriteLabel').textContent = sold ? 'Відкрити пост в Instagram' : 'Скопіювати текст і написати';
    $('pMsg').textContent = msg;
    $('pMsgWrap').hidden = sold;
    $('pWritePlain').hidden = sold;
    $('pPost').hidden = sold;
    write.removeAttribute('aria-disabled');
    document.querySelector('.p-shipping').hidden = sold;
    write.onclick = sold ? null : () => {
      copyText(currentMsg).then(ok => toast(ok
        ? 'Текст скопійовано ✓ Вставте його в чат'
        : 'Не вдалося скопіювати — перепишіть текст вручну'));
    };
    $('pPost').href = it.permalink || PROFILE_URL;
    $('saleNow').hidden = !it.isSale;
    syncCartButton(it);
    if (it.isSale) updateSaleSlide(0);

    // Галерея
    const track = $('gTrack');
    track.innerHTML = it.images.map((src, i) => {
      const st = it.isSale && it.slideState ? it.slideState[i] : null;
      const badge = st && st.kind === 'sold' ? `<span class="g-item sold">Продано</span>` : '';
      // Перше фото: поки вантажиться чітке, видно мініатюру з каталогу (вона вже в кеші) — без чорного квадрата
      const ph = i === 0 && it.thumb ? ` style="background:url('${esc(it.thumb)}') center/contain no-repeat"` : '';
      return `<div class="g-slide"><img src="${esc(src)}" alt="${esc(it.title)} — фото ${i + 1}" loading="${i < 2 ? 'eager' : 'lazy'}" decoding="async"${ph}>${badge}</div>`;
    }).join('');
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
    // Нова картка — завжди з початку (на телефоні прокручується весь блок, на ПК — лише опис)
    $('product').querySelector('.product-info').scrollTop = 0;
    $('product').querySelector('.product-inner').scrollTop = 0;
    // …і з першого фото: поки вікно було закрите, браузер ігнорував скидання прокрутки галереї
    track.scrollTo({ left: 0, behavior: 'instant' });
    requestAnimationFrame(() => track.scrollTo({ left: 0, behavior: 'instant' }));
  }

  // Розпродаж: текст і кнопка залежать від фото, яке зараз на екрані
  function updateSaleSlide(i) {
    const it = currentItem;
    if (!it || !it.isSale) return;
    currentPhoto = i;
    const st = it.slideState && it.slideState[i];
    const sold = st && st.kind === 'sold';
    const write = $('pWrite');
    write.setAttribute('aria-disabled', sold);
    $('pWriteLabel').textContent = sold ? `Фото №${i + 1} уже продано` : 'Скопіювати текст і написати';
    currentMsg = dmMessage(it, i);
    $('pMsg').textContent = sold ? `Річ на фото №${i + 1} уже продано — гортайте далі 🙂` : currentMsg;

    // Блок «що на цьому фото»
    const total = it.images.length;
    const box = $('saleNow');
    box.hidden = false;
    if (!st || st.kind === 'cover') {
      box.innerHTML = `<p class="sale-now-hint">Гортайте фото — тут буде видно, що це за річ, а кнопками нижче її можна купити.</p>`;
    } else if (sold) {
      box.innerHTML = `<p class="sale-now-head">Фото ${i + 1} з ${total} · <span class="sale-now-sold">уже продано</span></p>
        <p class="sale-now-hint">Гортайте далі 🙂</p>`;
    } else if (st.kind === 'linked') {
      const l = st.linked;
      box.innerHTML = `<p class="sale-now-head">Фото ${i + 1} з ${total} · ${money(it.price)}</p>
        <p class="sale-now-item">${esc([l.title, l.brand].filter(Boolean).join(' '))}${l.sizes.length ? `, розмір ${esc(l.sizes.join('/'))}` : ''}</p>
        <a class="sale-now-more" href="#p=${encodeURIComponent(l.id)}">Заміри й усі фото цієї речі →</a>`;
    } else {
      box.innerHTML = `<p class="sale-now-head">Фото ${i + 1} з ${total} · ${money(it.price)}</p>
        <p class="sale-now-hint">Розмір і заміри уточнимо в директі.</p>`;
    }
    syncCartButton(it);
  }

  function dmMessage(it, photo) {
    if (it.isSale && !photo) {
      return `Вітаю! Мене цікавить розпродаж${it.price != null ? ' по ' + money(it.price) : ''}` + (it.permalink ? `\n${it.permalink}` : '');
    }
    if (it.isSale) {
      const st = it.slideState && it.slideState[photo];
      const l = st && st.kind === 'linked' ? st.linked : null;
      const what = l ? ` (${[l.title, l.brand].filter(Boolean).join(' ')}${l.sizes.length ? ', ' + l.sizes.join('/') : ''})` : '';
      return `Вітаю! Мене цікавить річ із розпродажу${it.price != null ? ' по ' + money(it.price) : ''} — фото №${photo + 1}${what}` +
        (it.permalink ? `
${it.permalink}` : '');
    }
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
    // У розпродажі текст повідомлення залежить від того, яке фото зараз видно
    if (currentItem && currentItem.isSale && i !== currentPhoto) updateSaleSlide(i);
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
    // Показуємо поверх того вікна, що зараз відкрите (кошик або картка товару)
    const host = [$('cart'), dlg].find(d => d.open) || document.body;
    if (t.parentNode !== host) host.appendChild(t);
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
  }

  // На телефоні посилання на Instagram відкриваємо в тій самій вкладці: застосунок Instagram
  // перехоплює їх сам, а з target="_blank" Chrome на Android лишає порожні вкладки.
  if (window.matchMedia('(pointer: coarse)').matches) {
    ['pWrite', 'pWritePlain', 'pPost', 'gMore', 'igProfile', 'cartWrite'].forEach(id => $(id) && $(id).removeAttribute('target'));
  }

  // ---------- Кошик ----------
  // Зберігається в браузері покупця (localStorage). Оплати на сайті немає —
  // кошик лише збирає кілька речей в одне повідомлення в директ.

  const CART_KEY = 'cart:v1';
  function resolveCartItem(id) {
    if (byId.has(id)) return byId.get(id);
    const m = /^(.+)#(\d+)$/.exec(id);
    const s = m && byId.get(m[1]);
    if (!s || !s.isSale) return null;
    const n = +m[2];
    const st = s.slideState && s.slideState[n - 1];
    if (!st) return null;
    return {
      id, virtual: true, saleId: s.id, photo: n,
      title: `Річ із розпродажу — фото №${n}`, brand: null, sizes: [],
      price: s.price, oldPrice: null, thumb: s.images[n - 1], permalink: s.permalink,
      status: st.kind === 'sold' ? 'sold' : 'available',
    };
  }
  let cart = [];
  try {
    cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]').map(String).filter(id => resolveCartItem(id));
  } catch (e) { cart = []; }
  const saveCart = () => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) { /* без збереження */ } };
  const inCart = id => cart.includes(id);
  const cartItems = () => cart.map(resolveCartItem).filter(Boolean);
  const cartAvailable = () => cartItems().filter(it => it.status !== 'sold');
  const cartSum = () => cartAvailable().reduce((s, it) => s + (it.price || 0), 0);

  function cartMessage() {
    const lines = cartAvailable().map((it, i) =>
      `${i + 1}. ${[it.title, it.brand].filter(Boolean).join(' ')}${it.sizes.length ? ', ' + it.sizes.join('/') : ''} — ${money(it.price)}` +
      (it.permalink ? `\n${it.permalink}` : ''));
    return `Вітаю! Хочу замовити:\n${lines.join('\n')}\nРазом: ${money(cartSum())}`;
  }

  function updateCartBadge() {
    $('cartCount').hidden = !cart.length;
    $('cartCount').textContent = cart.length;
    const go = $('pGoCart');
    go.hidden = !cart.length;
    go.textContent = `Перейти в кошик (${cart.length}) →`;
  }

  function toggleCart(id) {
    cart = inCart(id) ? cart.filter(x => x !== id) : cart.concat(id);
    saveCart();
    updateCartBadge();
  }

  // Що саме додаємо в кошик: звичайну річ або річ на поточному фото розпродажу
  function cartIdFor(it) {
    if (!it.isSale) return it.status === 'sold' ? null : it.id;
    const st = it.slideState && it.slideState[currentPhoto];
    if (!st || st.kind === 'cover' || st.kind === 'sold') return null;
    return st.kind === 'linked' ? st.linked.id : `${it.id}#${currentPhoto + 1}`;
  }

  function syncCartButton(it) {
    const b = $('pCart');
    const id = cartIdFor(it);
    b.hidden = !id;
    if (!id) return;
    const on = inCart(id);
    b.classList.toggle('on', on);
    b.querySelector('span').textContent = on ? 'У кошику ✓ (прибрати)' : 'Додати в кошик';
  }

  $('pCart').addEventListener('click', () => {
    if (!currentItem) return;
    const id = cartIdFor(currentItem);
    if (!id) return;
    const was = inCart(id);
    toggleCart(id);
    syncCartButton(currentItem);
    toast(was ? 'Прибрано з кошика' : `Додано в кошик (${cart.length}). Оберіть ще або відкрийте кошик`);
  });

  const cartDlg = $('cart');
  function renderCart() {
    const items = cartItems();
    const avail = cartAvailable();
    $('cartTitle').textContent = items.length ? `Кошик (${items.length})` : 'Кошик';
    $('cartList').innerHTML = items.map(it => `<li class="cart-item${it.status === 'sold' ? ' is-sold' : ''}">
        <a class="cart-thumb" href="#p=${encodeURIComponent(it.id)}" data-open="${esc(it.id)}">${it.thumb ? `<img src="${esc(it.thumb)}" alt="" loading="lazy">` : ''}</a>
        <div class="cart-info">
          <a class="cart-title" href="#p=${encodeURIComponent(it.id)}" data-open="${esc(it.id)}">${esc(it.title)}</a>
          <p class="cart-meta">${[it.brand, it.sizes.join('/')].filter(Boolean).map(esc).join(' · ')}</p>
          <p class="cart-price">${it.status === 'sold' ? 'Уже продано' : (it.oldPrice ? `<s class="old-price">${money(it.oldPrice)}</s> ` : '') + money(it.price)}</p>
        </div>
        <button type="button" class="icon-btn" data-remove="${esc(it.id)}" aria-label="Прибрати з кошика">✕</button>
      </li>`).join('');
    $('cartEmpty').hidden = items.length > 0;
    for (const id of ['cartSumWrap', 'cartMsgWrap', 'cartWrite']) $(id).hidden = !avail.length;
    $('cartClear').hidden = !items.length;
    $('cartSum').textContent = money(cartSum());
    $('cartMsg').textContent = avail.length ? cartMessage() : '';
  }

  $('cartBtn').addEventListener('click', () => {
    renderCart();
    cartDlg.showModal();
    document.body.style.overflow = 'hidden';
  });
  $('pGoCart').addEventListener('click', () => { renderCart(); cartDlg.showModal(); });
  $('closeCart').addEventListener('click', () => cartDlg.close());
  cartDlg.addEventListener('click', e => { if (e.target === cartDlg) cartDlg.close(); });
  cartDlg.addEventListener('close', () => { if (!dlg.open) document.body.style.overflow = ''; });
  $('cartList').addEventListener('click', e => {
    const rm = e.target.closest('[data-remove]');
    if (rm) {
      toggleCart(rm.dataset.remove);
      renderCart();
      if (currentItem && dlg.open) syncCartButton(currentItem);
      return;
    }
    const open = e.target.closest('[data-open]');
    if (open) {
      e.preventDefault();
      cartDlg.close();
      const v = resolveCartItem(open.dataset.open);
      if (v && v.virtual) {
        location.hash = '#p=' + encodeURIComponent(v.saleId);
        setTimeout(() => { const t = $('gTrack'); t.scrollLeft = (v.photo - 1) * t.clientWidth; }, 350);
      } else {
        location.hash = '#p=' + encodeURIComponent(open.dataset.open);
      }
    }
  });
  $('cartClear').addEventListener('click', () => {
    cart = [];
    saveCart();
    updateCartBadge();
    renderCart();
    if (currentItem && dlg.open) syncCartButton(currentItem);
  });
  $('cartWrite').href = DM_URL;
  $('cartWrite').addEventListener('click', () => {
    copyText(cartMessage()).then(ok => toast(ok
      ? 'Список скопійовано ✓ Вставте його в чат'
      : 'Не вдалося скопіювати — перепишіть текст вручну'));
  });
  updateCartBadge();

  // ---------- Старт ----------

  buildFilters();
  update();
  onHash(false);
})();
