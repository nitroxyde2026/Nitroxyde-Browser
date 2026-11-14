const h = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
const opts = list => list.map(([v, t]) => h('option', { value: v, textContent: t }));
let timer;
nxt(skin);
nxp('look').then(skin);

const UNITS = {
  Longueur: { m: 1, km: 1000, cm: .01, mm: .001, mi: 1609.344, yd: .9144, ft: .3048, in: .0254 },
  Masse: { kg: 1, g: .001, mg: 1e-6, lb: .45359237, oz: .028349523 },
  Volume: { L: 1, mL: .001, gal: 3.785411784, cup: .2365882365 },
  Données: { o: 1, Ko: 1e3, Mo: 1e6, Go: 1e9, To: 1e12 },
};
const LANGS = [['fr', 'Français'], ['en', 'Anglais'], ['es', 'Espagnol'], ['de', 'Allemand'], ['it', 'Italien'], ['pt', 'Portugais'], ['ar', 'Arabe'], ['ja', 'Japonais'], ['zh', 'Chinois']];

const tools = {
  calc() {
    const out = h('input', { className: 'big', placeholder: '0', inputMode: 'decimal' }), keys = h('div', { className: 'keys' });
    const run = () => {
      const ex = out.value.replace(/,/g, '.').replace(/×/g, '*').replace(/÷/g, '/').replace(/\^/g, '**').replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');
      if (!/^[\d+\-*/().\s]+$/.test(ex)) { out.value = 'Erreur'; return; }
      try { const v = Function('"use strict";return(' + ex + ')')(); out.value = Number.isFinite(v) ? String(+v.toPrecision(12)) : 'Erreur'; } catch { out.value = 'Erreur'; }
    };
    for (const k of ['C', '(', ')', '÷', '7', '8', '9', '×', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', '⌫', '=']) {
      keys.append(h('button', { textContent: k, onclick: () => {
        if (k === 'C') out.value = ''; else if (k === '⌫') out.value = out.value.slice(0, -1); else if (k === '=') run();
        else { if (out.value === 'Erreur') out.value = ''; out.value += k; }
      } }));
    }
    out.onkeydown = e => { if (e.key === 'Enter') run(); };
    return [h('h2', { textContent: 'Calculatrice' }), out, keys];
  },

  async convert() {
    const rates = await nxp('rates'), cats = { ...UNITS, ...(rates ? { Devises: rates } : {}), Température: { '°C': 1, '°F': 1, K: 1 } };
    const cat = h('select', {}, ...opts(Object.keys(cats).map(k => [k, k]))), val = h('input', { type: 'number', value: 1, step: 'any' });
    const a = h('select'), b = h('select'), res = h('div', { className: 'res' });
    const fill = () => { const u = Object.keys(cats[cat.value]).map(k => [k, k]); a.replaceChildren(...opts(u)); b.replaceChildren(...opts(u)); b.selectedIndex = Math.min(1, u.length - 1); calc(); };
    const calc = () => {
      const v = +val.value, c = cat.value, f = a.value, t = b.value;
      let r;
      if (c === 'Température') { const k = f === '°C' ? v + 273.15 : f === '°F' ? (v - 32) * 5 / 9 + 273.15 : v; r = t === '°C' ? k - 273.15 : t === '°F' ? (k - 273.15) * 9 / 5 + 32 : k; }
      else if (c === 'Devises') r = v / cats[c][f] * cats[c][t];
      else r = v * cats[c][f] / cats[c][t];
      res.textContent = Number.isFinite(r) ? `${v} ${f} = ${+r.toPrecision(8)} ${t}` : '—';
    };
    cat.onchange = fill; val.oninput = calc; a.onchange = calc; b.onchange = calc;
    fill();
    return [h('h2', { textContent: 'Convertisseur' }), cat, h('div', { className: 'row' }, val), h('div', { className: 'row' }, a, b), res,
      ...(rates ? [] : [h('small', { textContent: 'Taux de change indisponibles hors ligne.' })])];
  },

  translate() {
    const src = h('textarea', { rows: 5, placeholder: 'Texte à traduire…' }), from = h('select', {}, ...opts(LANGS)), to = h('select', {}, ...opts(LANGS));
    to.value = 'en';
    const res = h('div', { className: 'res', textContent: '' });
    const go = h('button', { textContent: 'Traduire', onclick: async () => { res.textContent = '…'; res.textContent = await nxp('translate', { text: src.value, from: from.value, to: to.value }); } });
    return [h('h2', { textContent: 'Traduction instantanée' }), src, h('div', { className: 'row' }, from, to), go, res,
      h('small', { textContent: 'Avec une clé Groq enregistrée, la traduction passe par l’IA ; sinon par MyMemory (500 caractères max).' })];
  },

  async notes() {
    let tm;
    const t = h('textarea', { rows: 16, value: await nxp('notes'), placeholder: 'Notes rapides…', oninput: e => { clearTimeout(tm); tm = setTimeout(() => nxp('noteSet', e.target.value), 500); } });
    return [h('h2', { textContent: 'Notes' }), t];
  },

  async music() {
    const box = h('div');
    const draw = async () => {
      const m = await nxp('musicState');
      box.replaceChildren(
        h('div', { className: 'res', textContent: m.on ? `▶ ${m.name || '—'}` : `⏸ ${m.name || 'Aucune piste'}` }),
        ...(m.special ? [h('small', { textContent: `Musique du thème ${m.special} (en boucle)` })] : []),
        h('div', { className: 'row' }, h('button', { textContent: m.on ? '⏸ Pause' : '▶ Lecture', onclick: async () => { await nxp('musicCtl', { op: 'toggle' }); draw(); } }),
          h('button', { textContent: '⏭ Suivant', onclick: async () => { await nxp('musicCtl', { op: 'next' }); draw(); } }),
          h('button', { className: m.repeat ? 'on' : '', textContent: m.repeat ? '🔁 Répéter : oui' : '🔁 Répéter : non', title: 'Répéter la piste en boucle', onclick: async () => { await nxp('set', { k: 'musicRepeat', v: !m.repeat }); draw(); } })),
        h('div', { className: 'row' }, h('span', { textContent: 'Volume' }), h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: m.vol, oninput: e => nxp('musicCtl', { op: 'vol', v: e.target.value }) })),
        ...m.tracks.map(t => h('button', { className: 'trk' + (t.path === m.track ? ' on' : ''), textContent: t.name, onclick: async () => { await nxp('musicPlay', t.path); draw(); } })),
        ...(m.tracks.length ? [] : [h('small', { textContent: 'Ajoute des musiques dans Paramètres > Musique de fond.' })]));
    };
    await draw();
    return [h('h2', { textContent: 'Lecteur musical' }), box];
  },

  async downloads() {
    const box = h('div');
    const draw = async () => {
      const all = (await nxp('downloads')).slice().reverse().slice(0, 12);
      box.replaceChildren(...(all.length ? all.map(d => {
        const pct = d.total > 0 ? d.got / d.total : 0;
        return h('div', { className: 'res' }, h('div', { textContent: d.name }),
          h('small', { textContent: { progress: Math.round(pct * 100) + ' %', paused: 'En pause', completed: 'Terminé', cancelled: 'Annulé', interrupted: 'Interrompu' }[d.state] }),
          h('div', { className: 'bar' }, h('i', { style: `transform:scaleX(${d.state === 'completed' ? 1 : pct})` })));
      }) : [h('small', { textContent: 'Aucun téléchargement.' })]));
    };
    await draw(); timer = setInterval(draw, 1000);
    return [h('h2', { textContent: 'Téléchargements' }), box];
  },
};

async function route() {
  clearInterval(timer);
  const id = location.hash.slice(1);
  if (id in tools) document.getElementById('m').replaceChildren(...(await tools[id]()));
}
addEventListener('hashchange', route);
route();
