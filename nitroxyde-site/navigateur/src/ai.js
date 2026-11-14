const $ = id => document.getElementById(id);
const call = (c, a) => nxa.call(c, a);
let cur = null, raw = '', raf = 0;
nxt(skin);

// Mise en forme minimale du Markdown, sans jamais injecter de HTML
function md(src) {
  const root = document.createDocumentFragment();
  let list = null, code = null;
  const inline = (el, s) => {
    for (const part of s.split(/(\*\*[^*]+\*\*|`[^`]+`)/)) {
      if (!part) continue;
      let n;
      if (part.startsWith('**')) { n = document.createElement('b'); n.textContent = part.slice(2, -2); }
      else if (part.startsWith('`')) { n = document.createElement('code'); n.textContent = part.slice(1, -1); }
      else n = document.createTextNode(part);
      el.append(n);
    }
  };
  for (const line of src.split('\n')) {
    if (line.startsWith('```')) { if (code) { root.append(code); code = null; } else code = document.createElement('pre'); continue; }
    if (code) { code.textContent += line + '\n'; continue; }
    const li = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)/);
    if (li) {
      if (!list) { list = document.createElement('ul'); root.append(list); }
      const e = document.createElement('li'); inline(e, li[1]); list.append(e);
      continue;
    }
    list = null;
    if (!line.trim()) continue;
    const hd = line.match(/^#{1,6}\s+(.*)/), p = document.createElement(hd ? 'h4' : 'p');
    inline(p, hd ? hd[1] : line); root.append(p);
  }
  if (code) root.append(code);
  return root;
}

function bubble(cls, text) {
  const el = document.createElement('div');
  el.className = 'm ' + cls; el.textContent = text || '';
  $('log').append(el); $('log').scrollTop = 1e9;
  return el;
}
const paint = () => { raf = 0; if (cur) { cur.replaceChildren(md(raw)); $('log').scrollTop = 1e9; } };

nxa.on(m => {
  if (m.type === 'user') { $('log').querySelector('.hint')?.remove(); bubble('u', m.data); cur = bubble('a', '…'); raw = ''; }
  else if (m.type === 'delta') { raw += m.data; if (!raf) raf = requestAnimationFrame(paint); }
  else if (m.type === 'done') { paint(); cur = null; }
  else if (m.type === 'error') { cur?.remove(); cur = null; bubble('err', m.data); }
  else if (m.type === 'cards') showCards(m.data);
  else if (m.type === 'reset') $('log').replaceChildren();
  else if (m.type === 'opened') init();
});

// Mode Études : cartes de révision à retourner
function showCards(cards) {
  cur?.remove(); cur = null;
  if (!cards.length) { bubble('err', 'Aucune carte générée.'); return; }
  let i = 0, back = false;
  const box = bubble('a', ''), card = document.createElement('div'), info = document.createElement('small'), nav = document.createElement('div');
  card.className = 'fc'; nav.className = 'fcn';
  const draw = () => { card.textContent = back ? cards[i].a : cards[i].q; card.dataset.side = back ? 'a' : 'q'; info.textContent = `Carte ${i + 1}/${cards.length} · clique pour retourner`; };
  card.onclick = () => { back = !back; draw(); };
  for (const [t, d] of [['‹', -1], ['›', 1]]) { const b = document.createElement('button'); b.textContent = t; b.onclick = () => { i = (i + d + cards.length) % cards.length; back = false; draw(); }; nav.append(b); }
  box.append(card, nav, info); draw();
}

async function init() {
  const info = await call('info'), list = await call('models');
  $('prov').replaceChildren(...info.providers.map(p => Object.assign(document.createElement('option'), { value: p.id, textContent: p.name + (p.hasKey ? '' : ' (clé manquante)'), selected: p.id === info.provider })));
  const all = [...new Set([info.model, ...list])];
  $('model').replaceChildren(...all.map(id => Object.assign(document.createElement('option'), { value: id, textContent: id, selected: id === info.model })));
}

const send = (text, kind = 'free') => {
  if (kind === 'free' && !text.trim()) return;
  call('ask', { text, kind, ctx: $('ctx').checked });
  $('q').value = '';
};
$('send').onclick = () => send($('q').value);
$('q').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send($('q').value); } };
document.querySelectorAll('#chips button').forEach(b => { b.onclick = () => send('', b.dataset.k); });
$('x').onclick = () => call('close');
$('reset').onclick = () => call('reset');
$('model').onchange = e => call('model', e.target.value);
$('prov').onchange = async e => { await call('provider', e.target.value); init(); };
init();
