// Applique thème, néon, accent, position des onglets, barre latérale, animations et CSS personnel à la page courante
function skin(d) {
  const r = document.documentElement;
  r.dataset.theme = d.theme;
  r.dataset.light = d.light ? '1' : '';
  r.dataset.neon = d.neon ? '1' : '';
  r.dataset.pos = d.pos || 'top';
  r.dataset.rail = d.rail || '';
  r.dataset.anim = d.anim === false ? 'off' : '';
  for (const k of ['bg', 'bg2', 'bg3', 'tx', 'dim', 'ac', 'gl', 'line']) {
    if (d.vars) r.style.setProperty('--' + k, d.vars[k]); else r.style.removeProperty('--' + k);
  }
  if (d.accent) { r.style.setProperty('--ac', d.accent); r.style.setProperty('--gl', d.accent); }
  if ('adoptedStyleSheets' in document) {
    try { const sh = new CSSStyleSheet(); sh.replaceSync(d.css || ''); document.adoptedStyleSheets = [sh]; } catch {}
  }
}
