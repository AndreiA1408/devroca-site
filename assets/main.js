// Mobile menu
const menuBtn = document.getElementById('menuBtn');
const menuClose = document.getElementById('menuClose');
const mobileMenu = document.getElementById('mobileMenu');

if (menuBtn && mobileMenu) {
  const setMenu = (open) => {
    mobileMenu.classList.toggle('open', open);
    document.body.classList.toggle('menu-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    // Return focus where the user can act on it, rather than leaving it
    // stranded on a control that just scrolled out of reach.
    (open ? (menuClose || mobileMenu) : menuBtn).focus();
  };
  menuBtn.addEventListener('click', () => setMenu(true));
  if (menuClose) menuClose.addEventListener('click', () => setMenu(false));
  mobileMenu.querySelectorAll('a').forEach(a =>
    a.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && mobileMenu.classList.contains('open')) setMenu(false);
  });
}

// Tabs (services page)
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const tabs = tab.closest('.tabs');
    const group = tabs && tabs.nextElementSibling;
    if (!group) return;
    const panel = group.querySelector(`.tab-panel[data-panel="${tab.dataset.tab}"]`);
    if (!panel) return;
    tabs.querySelectorAll('.tab').forEach(t => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    group.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    panel.classList.add('active');
  });
});

// FAQ accordion
document.querySelectorAll('.faq-item').forEach(item => {
  const q = item.querySelector('.faq-q');
  const a = item.querySelector('.faq-a');
  if (!q || !a) return;
  q.addEventListener('click', () => {
    const isOpen = item.classList.contains('open');
    const list = item.closest('.faq-list') || document;
    list.querySelectorAll('.faq-item').forEach(i => {
      i.classList.remove('open');
      const ia = i.querySelector('.faq-a');
      const iq = i.querySelector('.faq-q');
      if (ia) ia.style.maxHeight = null;
      if (iq) iq.setAttribute('aria-expanded', 'false');
    });
    if (!isOpen) {
      item.classList.add('open');
      a.style.maxHeight = a.scrollHeight + 'px';
      q.setAttribute('aria-expanded', 'true');
    }
  });
});

// An open answer is pinned to a pixel height, so it clips when the text
// reflows. Re-measure whatever is open after a resize or orientation change.
let faqResize;
window.addEventListener('resize', () => {
  clearTimeout(faqResize);
  faqResize = setTimeout(() => {
    document.querySelectorAll('.faq-item.open .faq-a').forEach(a => {
      a.style.maxHeight = a.scrollHeight + 'px';
    });
  }, 120);
});

// Scroll reveal. Content starts at opacity 0, so anything that stops this
// from running would leave the page blank — fall back to showing everything.
const revealables = document.querySelectorAll('.reveal');
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Siblings inside the same grid/row cascade instead of arriving together.
// The delay is written once, up front, so revealing costs only a class flip.
if (!prefersReduced) {
  const groups = new Map();
  revealables.forEach(el => {
    const parent = el.parentElement;
    if (!groups.has(parent)) groups.set(parent, []);
    groups.get(parent).push(el);
  });
  groups.forEach(items => {
    if (items.length < 2) return;
    items.forEach((el, i) => {
      // Cap the cascade so a long list never leaves the last card lagging.
      el.style.setProperty('--reveal-delay', Math.min(i, 5) * 80 + 'ms');
    });
  });
}

if (!('IntersectionObserver' in window) || prefersReduced) {
  revealables.forEach(el => el.classList.add('visible'));
} else {
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('visible'); obs.unobserve(en.target); }
    });
  }, { threshold: 0.15 });
  revealables.forEach(el => obs.observe(el));
  // Safety net: if anything above still has not been revealed, show it.
  window.addEventListener('load', () => {
    setTimeout(() => revealables.forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) el.classList.add('visible');
    }), 300);
  });
}

// Deep links into the services tabs. A card inside a hidden panel has no
// box, so the browser can't scroll to it — open its tab first, then scroll.
const openHashTab = () => {
  const target = location.hash.length > 1 && document.getElementById(location.hash.slice(1));
  const panel = target && target.closest('.tab-panel');
  if (!panel) return null;
  const tab = document.querySelector(`.tab[data-tab="${panel.dataset.panel}"]`);
  if (tab && !panel.classList.contains('active')) tab.click();
  return target;
};
// Measured from layout (offsetTop ignores transforms), because the reveal
// and tab-entrance slides are still mid-flight when this runs.
const scrollToCard = (target) => {
  if (!target) return;
  let top = -(parseFloat(getComputedStyle(target).scrollMarginTop) || 0);
  for (let el = target; el; el = el.offsetParent) top += el.offsetTop;
  window.scrollTo({ top, behavior: prefersReduced ? 'auto' : 'smooth' });
};
// On first load, open the tab now but scroll after load: the web-font swap
// reflows the page, and the browser's own fragment scroll (which measures the
// mid-slide position) starts at load too — this one has to land last.
const hashCard = openHashTab();
if (hashCard) window.addEventListener('load', () => requestAnimationFrame(() => scrollToCard(hashCard)));
window.addEventListener('hashchange', () => scrollToCard(openHashTab()));


// Count-up stat numbers. Only elements carrying data-count animate, so
// non-numeric badges ("Custom", "Web+App") are left exactly as authored.
const counters = document.querySelectorAll('[data-count]');
if (counters.length) {
  const runCount = (el) => {
    const target = parseFloat(el.dataset.count);
    const suffix = el.dataset.countSuffix || '';
    if (!isFinite(target)) return;
    if (prefersReduced) { el.textContent = target + suffix; return; }
    const duration = 1100;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      // Ease out cubic — fast off the line, settles onto the final value.
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  if (!('IntersectionObserver' in window)) {
    counters.forEach(runCount);
  } else {
    const countObs = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        countObs.unobserve(en.target);
        runCount(en.target);
      });
    }, { threshold: 0.6 });
    counters.forEach(el => {
      // Hold the final value in the DOM until the observer fires, so the
      // number is correct for anyone whose JS timing differs.
      el.textContent = el.dataset.count + (el.dataset.countSuffix || '');
      countObs.observe(el);
    });
  }
}


// Cursor-tracked glow on cards. One delegated listener, and the write is
// deferred to a frame so a fast pointer cannot force layout per event.
if (!prefersReduced && window.matchMedia('(hover: hover)').matches) {
  const glowCards = document.querySelectorAll('.svc-card, .teaser-card, .quote-doc');
  let glowQueued = false;
  let pending = null;
  const flush = () => {
    glowQueued = false;
    if (!pending) return;
    const { el, x, y } = pending;
    el.style.setProperty('--mx', x + '%');
    el.style.setProperty('--my', y + '%');
    pending = null;
  };
  glowCards.forEach(card => {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      pending = {
        el: card,
        x: (((e.clientX - r.left) / r.width) * 100).toFixed(1),
        y: (((e.clientY - r.top) / r.height) * 100).toFixed(1)
      };
      if (!glowQueued) { glowQueued = true; requestAnimationFrame(flush); }
    });
  });
}


// Scroll progress bar + header state + interior-hero parallax.
// All three read scroll position, so they share a single rAF-gated handler.
{
  const header = document.querySelector('header');
  const hero = document.querySelector('.page-hero');
  const heroLayers = hero && !prefersReduced
    ? [
        [hero.querySelector('.breadcrumb'), 0.05],
        [hero.querySelector('h1'), 0.11],
        [hero.querySelector('p'), 0.17]
      ].filter(([el]) => el)
    : [];

  let bar = null;
  if (!prefersReduced) {
    bar = document.createElement('div');
    bar.className = 'scroll-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);
  }

  const bigSteps = document.querySelector('.big-steps');
  const stepNodes = bigSteps ? Array.from(bigSteps.querySelectorAll('.big-step')) : [];

  let queued = false;
  const onScroll = () => {
    queued = false;
    const y = window.scrollY;

    if (header) header.classList.toggle('scrolled', y > 12);

    // Process page: the rule down the left of the steps draws as they pass,
    // and each step's node lights when it is reached. Four elements, read
    // inside the frame that is already running — no extra listener, no
    // layout thrash. Skipped entirely under reduced motion, where CSS
    // shows the line already drawn.
    if (bigSteps && !prefersReduced) {
      const r = bigSteps.getBoundingClientRect();
      const p = (window.innerHeight * 0.8 - r.top) / (r.height || 1);
      bigSteps.style.setProperty('--step-progress', Math.min(Math.max(p, 0), 1).toFixed(3));
      stepNodes.forEach((st) => {
        st.classList.toggle('lit', st.getBoundingClientRect().top < window.innerHeight * 0.75);
      });
    }

    if (bar) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(y / max, 1) : 0) + ')';
    }

    // Fade the hero out as it leaves rather than letting it slide under
    // the fixed header at full opacity.
    if (heroLayers.length && y < window.innerHeight * 1.2) {
      const fade = Math.max(1 - y / (window.innerHeight * 0.75), 0);
      heroLayers.forEach(([el, rate]) => {
        el.style.transform = 'translate3d(0,' + (y * rate).toFixed(1) + 'px,0)';
        el.style.opacity = fade;
      });
    }
  };

  const request = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(onScroll);
  };
  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', request, { passive: true });
  onScroll();
}


// Contact form confirmation.
//
// The form posts natively — no fetch, no interception, so submission works
// exactly as the browser and the form service intend it to. What JS adds is
// a round trip back here: a _next field tells the service to redirect to this
// page with ?sent=true once it has processed the submission, and that flag is
// what plays the confirmation.
//
// _next is written from location.origin rather than hardcoded, so it follows
// the site to whatever domain it is served from, and it is created here rather
// than sitting in the HTML on purpose: without JS there is nothing on this page
// that could draw the confirmation, so a no-JS visitor is better off on the
// form service's own thank-you page than back here looking at an empty form.
{
  const form = document.getElementById('contactForm');
  const panel = document.getElementById('sentPanel');
  const btn = document.getElementById('sendBtn');

  if (form && panel) {
    // ---- Confirmation, shown on return from the form service ----

    // A short burst of gold facet shards out of the checkmark. Purely
    // decorative, torn down as soon as it finishes.
    const burst = () => {
      const mark = document.getElementById('sentMark');
      if (!mark || prefersReduced) return;
      for (let i = 0; i < 11; i++) {
        const s = document.createElement('span');
        s.className = 'shard';
        // Spread evenly, then nudge so it doesn't read as a clock face.
        const angle = (i * 360) / 11 + (i % 3) * 7;
        s.style.setProperty('--a', angle + 'deg');
        s.style.setProperty('--d', (34 + (i % 4) * 8) + 'px');
        s.style.setProperty('--sd', (i % 5) * 18 + 'ms');
        s.addEventListener('animationend', () => s.remove());
        mark.appendChild(s);
      }
    };

    const showSent = () => {
      form.hidden = true;
      panel.hidden = false;
      // The panel sits well down the page, and the visitor arrives here
      // scrolled to the top. Put it in front of them before it animates.
      panel.scrollIntoView({ block: 'center' });
      panel.setAttribute('tabindex', '-1');
      panel.focus({ preventScroll: true });
      burst();
    };

    if (new URLSearchParams(location.search).get('sent') === 'true') {
      // The panel lives inside a .reveal wrapper that starts at opacity 0.
      // Reveal it directly rather than waiting on the observer.
      const col = panel.closest('.reveal');
      if (col) col.classList.add('visible');
      showSent();
      // Drop the flag so a refresh or a shared link does not replay this.
      // Only `sent` is removed; anything else on the URL is left alone.
      const url = new URL(location.href);
      url.searchParams.delete('sent');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    }

    // ---- Outbound: point the service back here, and acknowledge the click ----

    form.addEventListener('submit', () => {
      const next = document.createElement('input');
      next.type = 'hidden';
      next.name = '_next';
      next.value = location.origin + location.pathname + '?sent=true';
      form.appendChild(next);

      // The POST and redirect take a moment with no other feedback, which is
      // where double submissions come from. aria-disabled only, never the
      // disabled property, which would drop the button from the submission.
      if (btn) {
        btn.textContent = 'Sending…';
        btn.setAttribute('aria-disabled', 'true');
      }
    });

    // Restored from the back/forward cache, the page comes back exactly as it
    // was left — mid-send. Put the button back.
    window.addEventListener('pageshow', (e) => {
      if (e.persisted && btn) {
        btn.textContent = 'Send Message';
        btn.removeAttribute('aria-disabled');
      }
    });
  }
}


// Custom select — "Project type" on the contact page.
//
// This wraps the native <select> rather than replacing it. The real control
// stays in the DOM and every selection is written straight back to it, so the
// form still POSTs natively with the right value and nothing here is load
// bearing for submission. If this block never runs — JS off, or an error
// earlier in the file — the visitor gets the plain browser select, which works.
//
// Interaction follows the ARIA select-only combobox pattern: focus never
// leaves the trigger, and the active option is tracked with
// aria-activedescendant instead of being focused itself. That keeps a single
// tab stop and means Escape/Tab have nowhere awkward to return focus to.
{
  const native = document.getElementById('f-type');

  if (native && native.tagName === 'SELECT') {
    const label = document.querySelector('label[for="f-type"]');
    const labelId = 'f-type-label';
    const btnId = 'f-type-btn';
    const listId = 'f-type-list';

    if (label) {
      label.id = labelId;
      // Point the label at the trigger so clicking it still focuses the
      // control the visitor can actually see.
      label.setAttribute('for', btnId);
    }

    const options = Array.from(native.options).map((o) => o.text);

    const wrap = document.createElement('div');
    wrap.className = 'sel';
    wrap.dataset.open = 'false';

    const btn = document.createElement('button');
    btn.type = 'button';           // never submits the form
    btn.className = 'sel-btn';
    btn.id = btnId;
    btn.setAttribute('role', 'combobox');
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', listId);
    // Name is the label plus the current value, so a screen reader announces
    // "Project type, New website" rather than just the field name.
    btn.setAttribute('aria-labelledby', labelId + ' ' + btnId);

    const valSpan = document.createElement('span');
    valSpan.className = 'sel-val';
    const caret = document.createElement('span');
    caret.className = 'sel-caret';
    caret.setAttribute('aria-hidden', 'true');
    btn.append(valSpan, caret);

    const list = document.createElement('ul');
    list.className = 'sel-list';
    list.id = listId;
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-labelledby', labelId);

    const items = options.map((text, i) => {
      const li = document.createElement('li');
      li.className = 'sel-opt';
      li.id = 'f-type-o' + i;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');
      li.textContent = text;
      list.appendChild(li);
      return li;
    });

    // Start from whatever the native control already has selected, so a
    // value restored by the back/forward cache is what shows.
    let selected = Math.max(0, native.selectedIndex);
    let active = selected;
    let open = false;

    const commit = (i) => {
      selected = i;
      native.selectedIndex = i;
      // Anything listening on the real control still hears about it.
      native.dispatchEvent(new Event('change', { bubbles: true }));
      valSpan.textContent = options[i];
      items.forEach((li, n) => li.setAttribute('aria-selected', n === i ? 'true' : 'false'));
    };

    const setActive = (i) => {
      active = (i + items.length) % items.length;
      items.forEach((li, n) => {
        if (n === active) li.dataset.active = 'true';
        else delete li.dataset.active;
      });
      btn.setAttribute('aria-activedescendant', items[active].id);
      // Keep the cursor visible when the list is scrolling.
      items[active].scrollIntoView({ block: 'nearest' });
    };

    const setOpen = (next, { focusBtn = true } = {}) => {
      open = next;
      wrap.dataset.open = String(next);
      btn.setAttribute('aria-expanded', String(next));
      if (next) {
        setActive(selected);
      } else {
        btn.removeAttribute('aria-activedescendant');
        items.forEach((li) => delete li.dataset.active);
        if (focusBtn) btn.focus();
      }
    };

    btn.addEventListener('click', () => setOpen(!open));

    btn.addEventListener('keydown', (e) => {
      const k = e.key;

      if (!open) {
        if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Enter' || k === ' ' || k === 'Spacebar') {
          e.preventDefault();
          setOpen(true);
          if (k === 'ArrowDown') setActive(selected);
          if (k === 'ArrowUp') setActive(selected);
        }
        return;
      }

      switch (k) {
        case 'ArrowDown': e.preventDefault(); setActive(active + 1); break;
        case 'ArrowUp':   e.preventDefault(); setActive(active - 1); break;
        case 'Home':      e.preventDefault(); setActive(0); break;
        case 'End':       e.preventDefault(); setActive(items.length - 1); break;
        case 'Enter':
        case ' ':
        case 'Spacebar':
          e.preventDefault(); commit(active); setOpen(false); break;
        case 'Escape':
          // Close without changing anything.
          e.preventDefault(); setOpen(false); break;
        case 'Tab':
          // Let focus move on, but take the highlighted option with it —
          // this is how the native control behaves.
          commit(active); setOpen(false, { focusBtn: false }); break;
        default:
          // Type-ahead on a single printable character.
          if (k.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
            const from = (active + 1) % items.length;
            const order = items.map((_, n) => (from + n) % items.length);
            const hit = order.find((n) => options[n].toLowerCase().startsWith(k.toLowerCase()));
            if (hit !== undefined) { e.preventDefault(); setActive(hit); }
          }
      }
    });

    items.forEach((li, i) => {
      li.addEventListener('mouseenter', () => { if (open) setActive(i); });
      // mousedown, not click: this beats the document handler below and
      // avoids the button losing focus before the choice registers.
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        commit(i);
        setOpen(false);
      });
    });

    document.addEventListener('mousedown', (e) => {
      if (open && !wrap.contains(e.target)) setOpen(false, { focusBtn: false });
    });
    // A click on something else that takes focus should close it too.
    document.addEventListener('focusin', (e) => {
      if (open && !wrap.contains(e.target)) setOpen(false, { focusBtn: false });
    });

    // Swap in: the native select stays put, just hidden. A hidden select is
    // still submitted — only a disabled one is dropped.
    //
    // Hiding happens here rather than in the stylesheet on purpose. The same
    // script that creates the replacement is the one that hides the original,
    // so the two can never get out of step: if this block runs the native
    // control is gone, and if it doesn't run the native control is all there
    // is and works on its own. Leaving it to a CSS class meant a stale or
    // half-loaded stylesheet could show both at once — or, with stale JS,
    // a native select that still opens its own white dropdown on click.
    // The class stays too, as a declarative hedge, but nothing depends on it.
    native.classList.add('sel-native');
    native.style.display = 'none';
    // Never focusable, never announced — from here it is a value carrier and
    // nothing else. Guards the same behaviour if the hiding technique is ever
    // swapped for a visually-hidden clip, which stays focusable.
    native.setAttribute('tabindex', '-1');
    native.setAttribute('aria-hidden', 'true');
    native.parentNode.insertBefore(wrap, native);
    wrap.append(btn, list);
    wrap.appendChild(native);

    commit(selected);

    // Back/forward cache can restore the native value behind our back.
    window.addEventListener('pageshow', () => {
      if (native.selectedIndex !== selected && native.selectedIndex >= 0) {
        commit(native.selectedIndex);
      }
    });
  }
}
