import { createParticleHero } from './particles/hero.js';
import { readTheme } from './particles/theme.js';

/* ---------------------------------------------------------------
   Entry point for the homepage hero: a gemstone built from particles,
   inside a particle field. The pieces live in ./particles/:

     hero.js          scene, layout, scroll, frame loop
     gemGeometry.js   the cut, and the particles sampled from it
     fieldGeometry.js the ambient dust
     shaders.js       all per-particle motion and light (GPU)
     pointer.js       cursor / touch -> a smoothed disturbance
     lifecycle.js     the formation / dissolution cycle
     quality.js       particle budget per device, adaptive fallback
     theme.js         palettes and blending per page theme

   Theme hook — unchanged from the previous solid gem, so main.js does
   not need to know the gem was rebuilt. Either entry point works:

     window.devrocaGem.setTheme('light' | 'dark')
     window.dispatchEvent(new CustomEvent('devroca:themechange'))

   The event carries no payload: the toggle has already written
   data-theme onto <html> by the time it fires, so readTheme() is the
   single source of truth. Both are safe on pages with no gem.
--------------------------------------------------------------- */
const heroes = [];

function applyTheme(theme) {
  const t = theme === 'light' ? 'light' : 'dark';
  heroes.forEach(h => h.setTheme(t));
}

window.addEventListener('devroca:themechange', () => applyTheme(readTheme()));
window.devrocaGem = { setTheme: applyTheme };

document.querySelectorAll('canvas[data-gem]').forEach(canvas => {
  const hero = createParticleHero(canvas, readTheme());
  if (hero) heroes.push(hero);
});
