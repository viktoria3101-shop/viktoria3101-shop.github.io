/*
 * Розбір підписів до постів Instagram у дані товару:
 * ціна, розмір, бренд, категорія, колір, матеріал, заміри, статус «продано».
 * Працює і в браузері (window.ShopParser), і в Node (require).
 */
(function (root) {
  'use strict';

  // ---------- Довідники ----------

  // Відомі бренди: потрібні, щоб «R@lph L@uren» або «hugo bos's» стали «Ralph Lauren» / «Hugo Boss».
  // Новий бренд достатньо дописати сюди.
  const BRANDS = [
    'Ralph Lauren', 'Polo Ralph Lauren', 'Lauren Ralph Lauren', 'Hugo Boss', 'Boss',
    'Osprey London', 'Max Mara', 'Weekend Max Mara', 'Marina Rinaldi', 'Max&Co',
    'Massimo Dutti', 'Zara', 'Mango', 'H&M', 'COS', '& Other Stories', 'Uniqlo', 'Reserved',
    'Tommy Hilfiger', 'Tommy Jeans', 'Lacoste', 'Gant', 'Benetton', 'United Colors of Benetton',
    'Marks & Spencer', 'Next', 'Burberry', 'Calvin Klein', "Levi's", 'Michael Kors', 'Furla',
    'Guess', 'Esprit', 'Gerry Weber', "Marc O'Polo", 'Armani', 'Emporio Armani', 'Giorgio Armani',
    'Armani Exchange', 'Gucci', 'Prada', 'Coach', 'Kate Spade', 'Liu Jo', 'Pinko', 'Escada',
    'Basler', 'Betty Barclay', 's.Oliver', 'Tom Tailor', 'Hobbs', 'Jaeger', 'Reiss', 'Ted Baker',
    'Whistles', 'Jigsaw', 'Barbour', 'Hackett', 'Pringle of Scotland', 'Brooks Brothers',
    'Peter Hahn', 'Madeleine', 'Mulberry', 'Radley', 'Fiorelli', 'Lancaster', 'Longchamp',
    'DKNY', 'Diesel', 'Nike', 'Adidas', 'Puma', 'New Balance', 'Clarks', 'Ecco', 'Geox',
    'Högl', 'Tamaris', 'Gabor', 'Bally', 'Salvatore Ferragamo', 'Sandro', 'Maje', 'Joseph',
    'Theory', 'Eileen Fisher', 'Jil Sander', 'Hermès', 'Louis Vuitton', 'Michael Michael Kors',
    'Banana Republic', 'Gap', 'J.Crew', 'Seasalt', 'White Stuff', 'Boden', 'Phase Eight',
    'Monsoon', 'Laura Ashley', 'Viyella', 'Eastex', 'Windsmoor', 'Basler', 'Olsen', 'Bonita',
    'Street One', 'Cecil', 'Opus', 'Comma', 'More & More', 'Marella', 'Sportmax', 'Iceberg',
  ];

  // Порядок важливий: перша категорія, що збіглася, перемагає
  // (щоб «джинсова куртка» стала курткою, а не джинсами).
  const CATEGORIES = [
    ['Сумки', ['сумк', 'клатч', 'рюкзак', 'шопер', 'портфел', 'саквояж', 'бананк']],
    ['Взуття', ['взутт', 'черевик', 'чобіт', 'чоботи', 'туфл', 'кросів', 'кеди', 'босоніж', 'лофер', 'мокасин', 'ботильйон', 'сандал']],
    ['Верхній одяг', ['куртк', 'пальт', 'пуховик', 'тренч', 'плащ', 'парк', 'жилет', 'дублянк', 'шуб', 'бомбер', 'вітрівк']],
    ['Жакети та піджаки', ['жакет', 'піджак', 'блейзер']],
    ['Сукні', ['сукн', 'плаття', 'сарафан']],
    ['Спідниці', ['спідниц']],
    ['Светри та кардигани', ['светр', 'джемпер', 'кардиган', 'пуловер', 'реглан', 'кофт', 'гольф', 'водолаз', 'худі', 'світшот', 'жилетк']],
    ['Сорочки та блузи', ['сороч', 'блуз']],
    ['Футболки та топи', ['футболк', 'топ', 'майк', 'лонгслів', 'поло']],
    ['Штани та джинси', ['штан', 'брюк', 'джинс', 'шорт', 'легінс', 'кюлот']],
    ['Аксесуари', ['шарф', 'хустк', 'палантин', 'ремін', 'ремен', 'пояс', 'рукавич', 'шапк', 'капелюх', 'гаман', 'окуляр', 'біжутер', 'прикрас']],
  ];

  const COLORS = [
    ['Хакі', '#7d7a4e', ['хакі', 'олив']],
    ['Бежевий', '#d8c3a5', ['беж', 'тауп', 'пісочн', 'кремов', 'молочн', 'айвор', 'екрю', 'нюдов']],
    ['Коричневий', '#7b5034', ['коричн', 'шоколад', 'карамел', 'коньяч', 'кемел', 'камел', 'руд']],
    ['Рожевий', '#eaa2b6', ['рожев', 'пудр', 'фукс']],
    ['Червоний', '#b8342a', ['червон', 'бордо', 'бордов', 'винн', 'марсал']],
    ['Помаранчевий', '#e0782f', ['помаранч', 'оранж', 'теракот']],
    ['Жовтий', '#e3bf3c', ['жовт', 'гірчичн', 'лимон']],
    ['Зелений', '#2f9e55', ['зелен', 'смараг', "м'ят", 'мʼят', 'мят']],
    ['Синій', '#2f5aa8', ['син', 'блакит', 'голуб', 'бірюз', 'індиго', 'навi']],
    ['Фіолетовий', '#8e5bb5', ['фіолет', 'бузков', 'лаванд', 'лілов']],
    ['Сірий', '#9a9a9a', ['сір', 'графіт', 'антрацит']],
    ['Чорний', '#1f1f1f', ['чорн']],
    ['Білий', '#f4f2ec', ['біл']],
    ['Різнокольоровий', 'multi', ['принт', 'клітин', 'смуж', 'різнокол', 'візерун']],
  ];

  const MATERIALS = [
    ['Кашемір', ['кашемір']],
    ['Вовна', ['вовн', 'шерст']],
    ['Мохер', ['мохер']],
    ['Альпака', ['альпак']],
    ['Ангора', ['ангор']],
    ['Шкіра', ['шкір']],
    ['Замша', ['замш']],
    ['Бавовна', ['бавовн', 'котон']],
    ['Льон', ['льон', 'льнян', 'лля']],
    ['Шовк', ['шовк']],
    ['Віскоза', ['віскоз']],
    ['Поліестер', ['поліест']],
    ['Еко-шкіра', ['еко-шкір', 'екошкір']],
  ];

  // Рядки-«підписи магазину», які не треба показувати в описі товару.
  const BOILERPLATE = [/обмін/i, /повернення/i, /уточнюйте/i, /звіряйте/i, /^ціна/i];

  const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', 'ONE SIZE'];

  // ---------- Допоміжне ----------

  const L = 'a-zа-яіїєґ\'ʼ’'; // літери (для меж слів)

  function stemRegex(stems) {
    // Слово, що ПОЧИНАЄТЬСЯ з одного зі stem-ів (кирилиця не дружить з \b).
    const esc = stems.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp('(^|[^' + L + '])(' + esc.join('|') + ')', 'i');
  }

  const CATEGORY_RE = CATEGORIES.map(([name, stems]) => [name, stemRegex(stems)]);
  const COLOR_RE = COLORS.map(([name, hex, stems]) => [name, hex, stemRegex(stems)]);
  const MATERIAL_RE = MATERIALS.map(([name, stems]) => [name, stemRegex(stems)]);

  function stripEmoji(s) {
    return s.replace(/[\p{Extended_Pictographic}️‍]/gu, '');
  }

  // Прибирає маскування: @→a, 0→o, 1→i, $→s, *→''
  function deobfuscate(s) {
    return s
      .replace(/@/g, 'a')
      .replace(/\$/g, 's')
      .replace(/([a-z])0|0([a-z])/gi, (m, a, b) => (a ? a + 'o' : 'o' + b))
      .replace(/([a-z])1|1([a-z])/gi, (m, a, b) => (a ? a + 'i' : 'i' + b))
      .replace(/[*_~^]/g, '');
  }

  // Кирилиця, схожа на латиницю (буває, що бренд набраний «змішано»)
  const LOOKALIKE = { 'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'і': 'i', 'у': 'y', 'к': 'k', 'м': 'm', 'т': 't' };

  function squash(s) {
    return deobfuscate(s)
      .toLowerCase()
      .replace(/[а-яі]/g, ch => LOOKALIKE[ch] || ch)
      .replace(/ö/g, 'o').replace(/è/g, 'e')
      .replace(/['’ʼ`]s\b/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  }

  function allowedTypos(len) {
    if (len <= 4) return 0;
    if (len <= 7) return 1;
    return 2;
  }

  const BRAND_INDEX = Array.from(new Set(BRANDS)).map(name => ({
    name,
    words: name.split(/\s+/).length,
    key: squash(name),
  }));

  // Шукає бренд на початку фрази candidate (дозволяє 1–2 «помилки»).
  function matchBrand(candidate, exactOnly) {
    const words = candidate.trim().split(/\s+/).filter(Boolean);
    let best = null;
    for (const b of BRAND_INDEX) {
      if (words.length < b.words) continue;
      const key = squash(words.slice(0, b.words).join(' '));
      if (!key) continue;
      const dist = levenshtein(key, b.key);
      const limit = exactOnly ? 0 : allowedTypos(b.key.length);
      if (dist <= limit) {
        // Перевага — довшим назвам (Polo Ralph Lauren > Ralph Lauren), потім меншій відстані.
        if (!best || b.words > best.words || (b.words === best.words && dist < best.dist)) {
          best = { name: b.name, words: b.words, dist };
        }
      }
    }
    return best;
  }

  function titleCase(s) {
    return s.replace(/\S+/g, w => w.charAt(0).toUpperCase() + w.slice(1));
  }

  function capitalize(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  // ---------- Окремі поля ----------

  function parseStatus(caption, hashtags) {
    const head = caption.slice(0, 120);
    if (/продан/i.test(head) || hashtags.includes('продано')) return 'sold';
    if (/(заброньован|бронь|резерв)/i.test(head) || hashtags.includes('бронь')) return 'reserved';
    return 'available';
  }

  function cleanFirstLine(line) {
    return stripEmoji(line)
      .replace(/(^|\s)(продано|заброньовано|бронь|резерв)(?=[\s.!,:]|$)[.!,:]?/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parsePrice(caption) {
    const m = caption.match(/ціна\s*[:\-–—]?\s*(\d[\d\s]*)\s*(грн|₴|uah|гривень)/i);
    return m ? parseInt(m[1].replace(/\s/g, ''), 10) : null;
  }

  const CYR_SIZE = { 'М': 'M', 'Л': 'L', 'С': 'S', 'Х': 'X', 'Ь': '' };

  function parseSizes(lines) {
    const out = [];
    for (const line of lines) {
      const m = line.match(/(?:^|\s)(?:розміри?|підійде\s+на|size)\s*[:\-–—]?\s+(.+)$/i);
      if (!m) continue;
      const tokens = m[1]
        .toUpperCase()
        .replace(/[МЛСХЬ]/g, ch => CYR_SIZE[ch])
        .split(/[\/,\-–—\s]+|(?:\s+АБО\s+)/);
      for (let t of tokens) {
        t = t.replace(/[^A-Z0-9]/g, '');
        if (t === 'XXXL') t = '3XL';
        if (/^(XXS|XS|S|M|L|XL|XXL|[2-5]XL)$/.test(t) || /^\d{2}$/.test(t) || /^W\d{2}$/.test(t)) {
          if (!out.includes(t)) out.push(t);
        }
      }
      if (/one\s*size|універсальн/i.test(m[1]) && !out.includes('ONE SIZE')) out.push('ONE SIZE');
    }
    return out;
  }

  function parseBrand(firstLine) {
    // «… від R@lph L@uren.», «… від бренду Osp*rey London у …»
    const m = firstLine.match(/(?:^|\s)від\s+(?:бренду\s+|фірми\s+|марки\s+)?(.+?)(?=[.,!?;:(\n]|\s(?:у|в|з|із|зі|та|і|на|для|розмір)\s|$)/i);
    if (m) {
      const candidate = m[1].trim();
      const hit = matchBrand(candidate, false);
      if (hit) return hit.name;
      const clean = deobfuscate(candidate).replace(/['’ʼ`]s$/i, '').trim();
      if (/[a-z]/i.test(clean)) return titleCase(clean.split(/\s+/).slice(0, 3).join(' '));
    }
    // Запасний варіант: бренд просто згаданий у першому рядку латиницею («Сукня Zara»)
    const words = firstLine.split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      if (!/[a-z@*$]/i.test(words[i])) continue;
      const hit = matchBrand(words.slice(i).join(' '), true);
      if (hit) return hit.name;
    }
    return null;
  }

  function parseTitle(firstLine) {
    let t = (firstLine.match(/^[^.!?]+/) || [firstLine])[0];
    t = t.split(/\s(?:від|бренду)\s/i)[0];
    t = t.trim();
    if (t.length > 60) t = t.slice(0, 60).replace(/\s+\S*$/, '') + '…';
    return capitalize(t) || 'Товар';
  }

  function findFirst(list, texts) {
    for (const text of texts) {
      if (!text) continue;
      for (const entry of list) {
        if (entry[entry.length - 1].test(text)) return entry;
      }
    }
    return null;
  }

  function parseColor(caption) {
    const m = caption.match(/колір\s*[:\-–—]?\s*([^\n.,;]+)/i) || caption.match(/кольор[іуа]\s+([^\n.,;]+)/i);
    if (!m) return null;
    const raw = m[1].trim();
    const hit = findFirst(COLOR_RE, [raw]);
    return { raw, name: hit ? hit[0] : null, hex: hit ? hit[1] : null };
  }

  function parseMaterials(caption) {
    const out = [];
    for (const [name, re] of MATERIAL_RE) {
      if (re.test(caption) && !out.includes(name)) out.push(name);
    }
    // «Еко-шкіра» — це не шкіра
    if (out.includes('Еко-шкіра')) return out.filter(x => x !== 'Шкіра');
    return out;
  }

  function parseMeasurements(lines) {
    const out = [];
    for (const line of lines) {
      if (line.length > 70) continue;
      const m = line.match(/^(.*?)\s*[:\-–—]?\s*(\d+(?:[.,]\d+)?)\s*см\.?$/i);
      if (m && m[1]) out.push({ label: capitalize(m[1].trim()), value: m[2].replace(',', '.') + ' см' });
    }
    return out;
  }

  // ---------- Головна функція ----------

  /**
   * post: { id, caption, timestamp, permalink, media: [url, ...] }
   */
  function parsePost(post) {
    const caption = (post.caption || '').replace(/\r/g, '');
    const hashtags = (caption.match(/#[\p{L}\p{N}_]+/gu) || []).map(h => h.slice(1).toLowerCase());
    const textNoTags = caption.replace(/#[\p{L}\p{N}_]+/gu, '').trim();
    const lines = textNoTags.split('\n').map(s => s.trim()).filter(Boolean);
    const firstLine = cleanFirstLine(lines[0] || '');

    const title = parseTitle(firstLine);
    const brand = parseBrand(firstLine);
    const status = parseStatus(caption, hashtags);
    const price = parsePrice(caption);
    const sizes = parseSizes(lines);
    const color = parseColor(textNoTags);
    const materials = parseMaterials(textNoTags);
    const measurements = parseMeasurements(lines);

    const cat = findFirst(CATEGORY_RE, [title, firstLine, hashtags.join(' '), textNoTags]);
    const category = cat ? cat[0] : 'Інше';

    // Опис: усе, що не ціна, не заміри, не стандартні застереження.
    const measureLines = new Set(lines.filter(l => parseMeasurements([l]).length));
    const details = lines
      .map((l, i) => (i === 0 ? firstLine : l))
      .filter((l, i) => {
        if (!l) return false;
        if (i === 0 && l.length <= 70) return false; // короткий перший рядок = заголовок
        if (measureLines.has(l)) return false;
        return !BOILERPLATE.some(re => re.test(stripEmoji(l).trim()));
      });

    return {
      id: String(post.id),
      title,
      brand,
      category,
      status,
      price,
      sizes,
      color,
      materials,
      measurements,
      details,
      hashtags,
      images: post.media || [],
      permalink: post.permalink || null,
      timestamp: post.timestamp || null,
      caption,
    };
  }

  function sizeSortKey(s) {
    const i = SIZE_ORDER.indexOf(s);
    if (i >= 0) return i;
    const n = parseInt(s.replace(/\D/g, ''), 10);
    return 100 + (isNaN(n) ? 999 : n);
  }

  const api = { parsePost, sizeSortKey, COLORS, CATEGORIES: CATEGORIES.map(c => c[0]).concat('Інше') };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ShopParser = api;
})(typeof window !== 'undefined' ? window : globalThis);
