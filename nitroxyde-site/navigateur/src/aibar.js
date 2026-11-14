const $ = id => document.getElementById(id);
const call = (c, a) => nxb.call(c, a);
let raw = '', raf = 0;
nxt(skin);
const paint = () => { raf = 0; $('body').replaceChildren(md(raw)); };
nxb.on(m => {
  if (m.type === 'user') { raw = ''; $('body').classList.remove('err'); $('body').textContent = '…'; }
  else if (m.type === 'delta') { raw += m.data; if (!raf) raf = requestAnimationFrame(paint); }
  else if (m.type === 'done') paint();
  else if (m.type === 'error') { $('body').classList.add('err'); $('body').textContent = m.data; }
  else if (m.type === 'state') {
    if (m.provider) $('who').textContent = `${m.provider} · ${m.model}`;
    document.body.classList.toggle('mini', !!m.mini);
    $('up').textContent = m.mini ? '▴' : '▾'; $('up').title = m.mini ? 'Agrandir' : 'Réduire';
  }
});
$('up').onclick = () => call('barToggle');
$('pn').onclick = () => call('toPanel');
$('x').onclick = () => call('barClose');
