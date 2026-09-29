// Homepage, below the hero. Loaded by index.html only, after main.js.
//
// Three scroll-linked states, each an enhancement over markup that already
// reads correctly without it: every process step lit, every reason and
// category at full strength. Nothing here hides content; it only decides
// which part is in the foreground.
//
// Listeners run only while their section is on screen, and every write is a
// class flip or a single custom property, so scrolling never forces layout
// beyond one rect read per frame.
{
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const IO = 'IntersectionObserver' in window;

  // ---- Process: the line fills as the steps are read ----
  //
  // Across on desktop, down the left below it — the same --p drives either
  // (see .h-track-fill), only the geometry of "how far along" differs. Under
  // reduced motion it is left complete, with every step lit.
  const timeline = document.querySelector('[data-timeline]');
  if (timeline && IO && !reduced) {
    const fill = timeline.querySelector('.h-track-fill');
    const track = timeline.querySelector('.h-track');
    const steps = Array.from(timeline.querySelectorAll('.h-step'));
    const vertical = window.matchMedia('(max-width: 980px)');
    timeline.classList.add('is-live');

    let queued = false;
    const update = () => {
      queued = false;
      const vh = window.innerHeight;
      const r = track.getBoundingClientRect();
      let p;
      if (vertical.matches) {
        // Drawn down to whatever has reached two thirds of the screen.
        p = (vh * 0.66 - r.top) / (r.height || 1);
      } else {
        // All four sit on one line, so progress is how far that line has
        // travelled from the lower part of the screen to the upper.
        p = (vh * 0.82 - r.top) / (vh * 0.42);
      }
      p = Math.min(Math.max(p, 0), 1);
      fill.style.setProperty('--p', p.toFixed(3));
      const last = steps.length - 1;
      steps.forEach((st, i) => {
        const on = vertical.matches
          ? st.getBoundingClientRect().top < vh * 0.66
          : p >= (last ? i / last : 0) - 0.001;
        st.classList.toggle('is-on', on);
      });
    };
    const request = () => {
      if (!queued) { queued = true; requestAnimationFrame(update); }
    };
    new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          window.addEventListener('scroll', request, { passive: true });
          window.addEventListener('resize', request, { passive: true });
          request();
        } else {
          window.removeEventListener('scroll', request);
          window.removeEventListener('resize', request);
          request(); // settle the final state as it leaves
        }
      });
    }).observe(timeline);
    update();
  }

  // ---- Focus follows the reading line ----
  //
  // Whichever item crosses a band just above the middle of the screen
  // becomes active. Used for the reasons (desktop and mobile) and the
  // category stage (desktop only, where the stage exists).
  const followReadingLine = (items, onActive) => {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) onActive(en.target); });
    }, { rootMargin: '-42% 0px -48% 0px' });
    items.forEach((it) => obs.observe(it));
    return obs;
  };

  const reasons = document.querySelector('[data-reasons]');
  if (reasons && IO) {
    const items = Array.from(reasons.querySelectorAll('.h-reason'));
    const setActive = (el) => items.forEach((it) => it.classList.toggle('is-active', it === el));
    reasons.classList.add('is-live');
    setActive(items[0]);
    followReadingLine(items, setActive);
  }

  // ---- Categories: one on stage ----
  //
  // Hover or tap chooses directly; otherwise the stage follows the reading
  // line. Below desktop every card shows its own glyph and line (see
  // home.css), so the active state is only cosmetic there.
  const cats = document.querySelector('[data-cats]');
  if (cats) {
    const items = Array.from(cats.querySelectorAll('.h-cat'));
    const setActive = (el) => items.forEach((it) => it.classList.toggle('is-active', it === el));
    setActive(items[0]);
    let pointerInside = false;
    items.forEach((it) => {
      it.addEventListener('pointerenter', (e) => {
        if (e.pointerType === 'mouse') { pointerInside = true; setActive(it); }
      });
      it.addEventListener('click', () => setActive(it));
    });
    cats.addEventListener('pointerleave', () => { pointerInside = false; });
    const desktop = window.matchMedia('(min-width: 981px)');
    if (IO) {
      followReadingLine(items, (el) => {
        if (desktop.matches && !pointerInside) setActive(el);
      });
    }
  }
}
