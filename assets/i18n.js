// Language switching (English / Romanian / Spanish).
//
// The pages are authored in English and English is the source of truth: the
// dictionaries in assets/i18n/ are keyed by the English text itself, so a
// page needs no per-string markup and a copy edit in the HTML only means
// updating the matching key.
//
// What counts as a string: any element with a direct text node that contains
// a letter. Its key is its whitespace-collapsed textContent. Children of a
// unit belong to it (the value carries their markup), so "<strong>A.</strong>
// B" is one unit; but a parent whose own text is only punctuation — the
// "·"-separated service links on work.html — is not, and its children are
// looked up one by one.
//
// The choice is stored in localStorage and can also arrive as ?lang=ro in the
// URL, which is stored too, so a shared link opens in its language and stays
// there. The inline script in each page's head reads the same value before
// first paint: it sets <html lang> and, for anything but English, holds the
// page hidden (.i18n-pending) until apply() below has swapped the text, so
// English never flashes first.
(function () {
  const LANGS = ['en', 'ro', 'es'];
  const NAMES = { en: 'English', ro: 'Română', es: 'Español' };
  const dicts = window.DEVROCA_I18N || {};
  const root = document.documentElement;

  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const maps = {};
  Object.keys(dicts).forEach((lang) => {
    maps[lang] = new Map(dicts[lang].map(([k, v]) => [norm(k), v]));
  });

  const read = () => {
    let fromUrl = null;
    try { fromUrl = new URLSearchParams(location.search).get('lang'); } catch (e) {}
    if (LANGS.includes(fromUrl)) {
      try { localStorage.setItem('lang', fromUrl); } catch (e) {}
      return fromUrl;
    }
    try {
      const stored = localStorage.getItem('lang');
      if (LANGS.includes(stored)) return stored;
    } catch (e) {}
    return 'en';
  };

  // ---- Collect everything translatable once, from the English page ----

  const SKIP = new Set(['SCRIPT', 'STYLE', 'SVG', 'TEMPLATE', 'TEXTAREA', 'NOSCRIPT']);
  const LETTER = /\p{L}/u;
  const units = [];
  const walk = (el) => {
    if (SKIP.has(el.tagName.toUpperCase())) return;
    const ownText = Array.from(el.childNodes).some(
      (n) => n.nodeType === 3 && LETTER.test(n.nodeValue));
    if (ownText) {
      units.push({ el, key: norm(el.textContent), html: el.innerHTML });
      return;
    }
    for (const c of el.children) walk(c);
  };
  walk(document.body);

  const attrs = [];
  const addAttr = (el, name) => {
    const v = el && el.getAttribute(name);
    if (v && LETTER.test(v)) attrs.push({ el, name, key: norm(v), en: v });
  };
  document.querySelectorAll('[aria-label], [placeholder], [title], [alt]').forEach((el) => {
    ['aria-label', 'placeholder', 'title', 'alt'].forEach((a) => addAttr(el, a));
  });
  addAttr(document.querySelector('meta[name="description"]'), 'content');
  addAttr(document.querySelector('input[name="_autoresponse"]'), 'value');
  const enTitle = document.title;

  // ---- Apply ----

  const tpl = document.createElement('template');
  let current = 'en';

  const t = (en, lang = current) => {
    const m = maps[lang];
    const v = m && m.get(norm(en));
    return v === undefined ? en : v;
  };

  const apply = (lang) => {
    current = lang;
    root.lang = lang;
    units.forEach((u) => {
      const v = lang === 'en' ? null : maps[lang] && maps[lang].get(u.key);
      if (v == null) {
        if (u.el.innerHTML !== u.html) u.el.innerHTML = u.html;
        return;
      }
      // An element with no child elements takes plain text, so the same
      // heading can be written with <em> accents in one place and render
      // plainly where the English is plain.
      if (u.el.children.length || /<[a-z]/i.test(u.html)) u.el.innerHTML = v;
      else { tpl.innerHTML = v; u.el.textContent = tpl.content.textContent; }
    });
    attrs.forEach((a) => a.el.setAttribute(a.name, lang === 'en' ? a.en : t(a.en, lang)));
    document.title = lang === 'en' ? enTitle : t(enTitle, lang);
    syncSwitcher();
    root.classList.remove('i18n-pending');
    window.dispatchEvent(new CustomEvent('devroca:langchange', { detail: { lang } }));
  };

  // ---- The switcher ----
  //
  // One button showing the current language, opening a short menu of the
  // three. Built here rather than in the markup, so a visitor without JS
  // is never offered a control that does nothing — the same rule the theme
  // toggle follows.

  let syncSwitcher = () => {};
  const navEnd = document.querySelector('.nav-end');
  if (navEnd) {
    const wrap = document.createElement('div');
    wrap.className = 'lang';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lang-btn';
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'langMenu');
    const code = document.createElement('span');
    btn.appendChild(code);
    const menu = document.createElement('div');
    menu.className = 'lang-menu';
    menu.id = 'langMenu';
    const items = LANGS.map((l) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'lang-opt';
      b.lang = l;
      b.dataset.lang = l;
      b.innerHTML = '<span class="lang-code">' + l.toUpperCase() + '</span>' + NAMES[l];
      menu.appendChild(b);
      return b;
    });
    wrap.append(btn, menu);
    navEnd.insertBefore(wrap, navEnd.firstChild);

    const setOpen = (open, focusBtn) => {
      wrap.dataset.open = String(open);
      btn.setAttribute('aria-expanded', String(open));
      if (open) (items.find((b) => b.dataset.lang === current) || items[0]).focus();
      else if (focusBtn) btn.focus();
    };
    setOpen(false);

    syncSwitcher = () => {
      code.textContent = current.toUpperCase();
      btn.setAttribute('aria-label', t('Language') + ': ' + NAMES[current]);
      items.forEach((b) => {
        if (b.dataset.lang === current) b.setAttribute('aria-current', 'true');
        else b.removeAttribute('aria-current');
      });
    };

    btn.addEventListener('click', () => setOpen(wrap.dataset.open !== 'true'));
    items.forEach((b, i) => {
      b.addEventListener('click', () => {
        const l = b.dataset.lang;
        setOpen(false, true);
        if (l === current) return;
        try { localStorage.setItem('lang', l); } catch (e) {}
        // A ?lang= in the address would win on the next load and undo this
        // choice, so it is rewritten to match.
        try {
          const url = new URL(location.href);
          if (url.searchParams.has('lang')) {
            url.searchParams.set('lang', l);
            history.replaceState(null, '', url.pathname + url.search + url.hash);
          }
        } catch (e) {}
        switchTo(l);
      });
      b.addEventListener('keydown', (e) => {
        const k = e.key;
        if (k === 'ArrowDown' || k === 'ArrowUp') {
          e.preventDefault();
          items[(i + (k === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
        } else if (k === 'Home' || k === 'End') {
          e.preventDefault();
          items[k === 'Home' ? 0 : items.length - 1].focus();
        }
      });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && wrap.dataset.open === 'true') setOpen(false, true);
    });
    document.addEventListener('pointerdown', (e) => {
      if (wrap.dataset.open === 'true' && !wrap.contains(e.target)) setOpen(false);
    });
    document.addEventListener('focusin', (e) => {
      if (wrap.dataset.open === 'true' && !wrap.contains(e.target)) setOpen(false);
    });
  }

  // Switching on a page already in view: the text dips out, swaps while it
  // is invisible, and comes back — rather than every line jumping at once.
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let switchTimer;
  const switchTo = (lang) => {
    if (reduced) { apply(lang); return; }
    clearTimeout(switchTimer);
    root.classList.add('lang-switching');
    switchTimer = setTimeout(() => {
      apply(lang);
      requestAnimationFrame(() => root.classList.remove('lang-switching'));
    }, 180);
  };

  window.devrocaI18n = { t: (en) => t(en), lang: () => current };
  apply(read());
})();
