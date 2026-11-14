const $ = id => document.getElementById(id);
const set = (k, v) => nxp('set', { k, v });
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const h = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
let cur = {}, cfg = {}, gal = [], icons = {}, galLoaded = false, auto = null, clockTimer = 0, calM = new Date(), applyN = 0;

// Paysages générés en SVG : aucun fichier à charger, affichage instantané
const SCENES = {
  aurore:     { name: 'Aurore boréale',  seed: 1,  stars: 1, sky: ['#050b1f', '#0b3a4a', '#1b7a68'], orb: [.76, .2, .045, '#eafff7'], ridges: ['#0e3140', '#0a2330', '#05141d'] },
  crepuscule: { name: 'Crépuscule',      seed: 2,  sky: ['#2b1055', '#d4506a', '#ffb36b'], orb: [.5, .5, .09, '#fff1c9'], ridges: ['#5b2a62', '#3a1a50', '#1d0d33'] },
  alpes:      { name: 'Alpes',           seed: 3,  sky: ['#4f9fe0', '#a9d6f5', '#eaf6ff'], orb: [.2, .2, .05, '#fffbe0'], ridges: ['#9db6d1', '#6f8db0', '#3f5b7a', '#223649'] },
  desert:     { name: 'Désert',          seed: 4,  sky: ['#f0904a', '#f9c98a', '#fde7b8'], orb: [.78, .28, .07, '#fff6d6'], ridges: ['#d9894a', '#bb6a36', '#8f4a26'] },
  foret:      { name: 'Forêt',           seed: 5,  sky: ['#12372a', '#2f7a55', '#a8d8a0'], orb: [.3, .3, .06, '#fff9d0'], ridges: ['#1f5d3f', '#14452e', '#0b2e1e'] },
  collines:   { name: 'Collines bleues', seed: 6,  sky: ['#0a2a5c', '#2a77c9', '#9fd8ff'], orb: [.65, .25, .05, '#ffffff'], ridges: ['#2b6cb0', '#1b4f8f', '#133a6e'] },
  nuit:       { name: 'Nuit étoilée',    seed: 7,  stars: 1, sky: ['#02030a', '#0b1440', '#2a2a7a'], orb: [.2, .18, .045, '#fffbe8'], ridges: ['#0a0d24', '#050716'] },
  automne:    { name: 'Automne',         seed: 8,  sky: ['#4a2a1a', '#c8642a', '#f5c27a'], orb: [.35, .4, .07, '#ffe9b0'], ridges: ['#7a3a1c', '#552812', '#331808'] },
  brume:      { name: 'Lac dans la brume', seed: 9, sky: ['#cfd8e3', '#e8edf3', '#f7f9fb'], orb: [.7, .3, .06, '#ffffff'], ridges: ['#9fb0c4', '#7f93ab', '#5d728c'] },
  braise:     { name: 'Volcan',          seed: 10, stars: 1, sky: ['#1b0a14', '#6a1b2a', '#ff7a3d'], orb: [.5, .46, .07, '#ffb067'], ridges: ['#2a0f18', '#150810'] },
  lagon:      { name: 'Lagon',           seed: 11, sky: ['#0e5f8a', '#35b6c9', '#c9f2ea'], orb: [.25, .22, .05, '#fffbe0'], ridges: ['#1f8a8a', '#126d78'] },
  hiver:      { name: 'Hiver',           seed: 12, sky: ['#2d3b5c', '#7a8fb5', '#dfe8f5'], orb: [.8, .28, .04, '#ffffff'], ridges: ['#e9f0fa', '#b8c8dd', '#8197b3', '#566a87'] },
};
const ANIMS = { tron: 'Grille Tron', aurore: 'Aurore animée', etoiles: 'Étoiles', pluie: 'Pluie', synthwave: 'Synthwave', braises: 'Braises' };

function ridge(seed, base, amp, w, h) {
  let d = `M0 ${h}`;
  for (let x = 0; x <= w; x += 20) {
    const y = base + amp * (Math.sin(x * .0045 + seed) * .6 + Math.sin(x * .011 + seed * 2.3) * .3 + Math.sin(x * .023 + seed * 5.1) * .1);
    d += `L${x} ${y.toFixed(1)}`;
  }
  return d + `L${w} ${h}Z`;
}

function scene(s, w = 1600, hh = 900) {
  const [a, b, c] = s.sky;
  const oc = s.orb[3];
  let g = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient><radialGradient id="h"><stop offset="0" stop-color="${oc}" stop-opacity=".42"/><stop offset=".4" stop-color="${oc}" stop-opacity=".14"/><stop offset="1" stop-color="${oc}" stop-opacity="0"/></radialGradient></defs><rect width="${w}" height="${hh}" fill="url(#g)"/>`;
  if (s.stars) for (let i = 0; i < 90; i++) g += `<circle cx="${(i * 733) % w}" cy="${(i * 419) % (hh * .55)}" r="${(i % 3) * .5 + .6}" fill="#fff" opacity="${(.4 + (i % 5) * .12).toFixed(2)}"/>`;
  const [ox, oy, or] = s.orb;
  g += `<circle cx="${ox * w}" cy="${oy * hh}" r="${or * hh * 4}" fill="url(#h)"/><circle cx="${ox * w}" cy="${oy * hh}" r="${or * hh}" fill="${oc}"/>`;
  s.ridges.forEach((col, i) => { g += `<path d="${ridge(s.seed + i * 1.7, hh * (.52 + i * .12), 110 - i * 20, w, hh)}" fill="${col}"/>`; });
  return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${hh}" preserveAspectRatio="xMidYMid slice">${g}</svg>`);
}

const URI = {};
const uri = id => (URI[id] ??= scene(SCENES[id]));
const bg = u => (u ? `url("${u}")` : '');

function mkb(parent, cls, v, text, fn) {
  const b = document.createElement('button');
  b.className = cls; b.dataset.v = v; b.textContent = text; b.onclick = fn;
  parent.append(b);
  return b;
}

// Logo du site : icône mémorisée, sinon celle du site, sinon le service d'icônes de DuckDuckGo ; l'initiale en dernier recours
function icoEl(url, letter) {
  const hs = host(url), box = h('span', { className: 'ico' });
  box.dataset.l = (letter || hs[0] || '?').toUpperCase();
  if (!hs) return box;
  const srcs = [icons[hs], icons[hs.split('.').slice(-2).join('.')], `https://icons.duckduckgo.com/ip3/${hs}.ico`, `https://${hs}/favicon.ico`].filter((u, i, a) => u && a.indexOf(u) === i);
  const im = h('img', { alt: '', src: srcs.shift() });
  im.onerror = () => { const n = srcs.shift(); if (n) im.src = n; else im.remove(); };
  im.onload = () => { if (im.naturalWidth < 8) im.onerror(); };   // icône vide (1 px) : on passe à la suivante
  box.append(im);
  return box;
}

// ---- Fonds : paysage différent à chaque onglet, animé, vidéo ou photo ----
async function autoWall() {
  if (auto) return auto;
  const pool = [...Object.keys(SCENES), ...(await nxp('wallList'))];
  const id = pool[Math.floor(Math.random() * pool.length)];
  return (auto = { url: SCENES[id] ? uri(id) : await nxp('wallUrl', id) });
}

function animWall(id) {
  const w = $('wall');
  w.className = 'anim-' + id;
  const r = (a, b) => a + Math.random() * (b - a);
  const add = (tag, css = {}, cls = '') => { const e = document.createElement(tag); e.className = cls; for (const [k, v] of Object.entries(css)) e.style.setProperty(k, String(v)); w.append(e); return e; };
  if (id === 'aurore') for (let i = 0; i < 3; i++) add('i');
  else if (id === 'pluie') for (let i = 0; i < 70; i++) add('i', { left: r(0, 100) + '%', 'animation-duration': r(.6, 1.4) + 's', 'animation-delay': -r(0, 2) + 's', opacity: r(.3, .8) });
  else if (id === 'braises') for (let i = 0; i < 40; i++) { const s = r(3, 8) + 'px'; add('i', { left: r(0, 100) + '%', width: s, height: s, '--dx': r(-12, 12) + 'vw', 'animation-duration': r(6, 14) + 's', 'animation-delay': -r(0, 14) + 's' }); }
  else if (id === 'etoiles') {
    [[1, 240], [1.5, 160], [2, 100]].forEach(([size, dur]) => {
      const pts = [];
      for (let k = 0; k < 60; k++) { const x = r(0, 100).toFixed(1), y = r(0, 100).toFixed(1); pts.push(`${x}vw ${y}vh #fff`, `${x}vw ${(+y + 100).toFixed(1)}vh #fff`); }
      const e = add('i', { width: size + 'px', height: size + 'px', 'animation-duration': dur + 's' });
      e.style.boxShadow = pts.join(',');
    });
  } else if (id === 'synthwave') { add('div', {}, 'sun'); add('div', {}, 'grid'); }
  else if (id === 'tron') {   // la grille du film : sol et plafond bleu néon, horizon lumineux, motos de lumière
    add('div', {}, 'haze'); add('div', {}, 'ceil'); add('div', {}, 'floor').append(document.createElement('i')); add('div', {}, 'hz');
    const lanes = add('div', {}, 'lanes');
    [['#00e5ff', 38, 7, 0], ['#ff9a1f', 61, 9, -4], ['#00e5ff', 22, 11, -7]].forEach(([c, x, d, l]) => {
      const b = document.createElement('b'); b.style.cssText = `--c:${c};left:${x}%;animation-duration:${d}s;animation-delay:${l}s`; lanes.append(b);
    });
  }
}

function videoWall(url) {
  const w = $('wall'), v = h('video', { src: url, autoplay: true, loop: true, playsInline: true });
  v.muted = true;
  w.append(v);
}
document.addEventListener('visibilitychange', () => { const v = $('wall').querySelector('video'); if (v) { if (document.hidden) v.pause(); else v.play().catch(() => {}); } });

// Le fond choisi est toujours respecté, quel que soit le mode (un mode ne touche ni au thème ni au fond)
let wallKey = '';
async function apply(d) {
  const n = ++applyN;
  cur = d;
  skin(d);
  const w = $('wall'), id = !d.wall || d.wall === 'none' ? 'off' : d.wall, key = id + '|' + (d.wallUrl || '');
  if (key !== wallKey) {   // le fond n'est reconstruit que s'il a changé (un changement de couleur ne relance pas l'animation)
    wallKey = key;
    w.className = ''; w.style.backgroundImage = ''; w.replaceChildren();
    if (id === 'auto') { const a = await autoWall(); if (n !== applyN) return; w.style.backgroundImage = bg(a.url); }
    else if (id.startsWith('anim:') && ANIMS[id.slice(5)]) animWall(id.slice(5));
    else if (id.startsWith('v:') && d.wallUrl) videoWall(d.wallUrl);
    else if (SCENES[id]) w.style.backgroundImage = bg(uri(id));
    else if (id !== 'off' && d.wallUrl) w.style.backgroundImage = bg(d.wallUrl);
    document.body.classList.toggle('hasw', w.childElementCount > 0 || !!w.style.backgroundImage);
    document.body.classList.toggle('tronw', id === 'anim:tron');
  }
  if (galLoaded && $('panel').classList.contains('open')) { gal = await nxp('gallery'); if (n !== applyN) return; }   // après une suppression
  thumbs();
  marks();
}

// Repère du choix actif : thème, couleur unie, néon ou thème enregistré
function marks() {
  const d = cur, ac = String(d.vars?.ac || '').toLowerCase();
  document.querySelectorAll('#themes button').forEach(b => b.classList.toggle('on', b.dataset.v === d.pick));
  document.querySelectorAll('#colors .dot').forEach(b => b.classList.toggle('on', d.pick === 'custom' && !d.neon && d.cname === 'Couleur unie' && b.dataset.v === ac));
  document.querySelectorAll('#neons .dot').forEach(b => b.classList.toggle('on', d.pick === 'custom' && d.neon && d.cname === 'Néon' && b.dataset.v === ac));
  document.querySelectorAll('#mythemes button').forEach(b => b.classList.toggle('on', d.pick === 'custom' && b.textContent === d.cname));
  document.querySelectorAll('#special .sp').forEach(b => { const on = b.classList.contains('sp-' + d.pick); b.classList.toggle('on', on); b.querySelector('small').textContent = on ? '✓ Thème actif — choisis un autre thème pour le quitter' : SPECIALS.find(x => b.classList.contains('sp-' + x[0]))[3]; });
}

function thumbs() {
  if (!$('panel').classList.contains('open')) return;   // miniatures construites seulement panneau ouvert (mémoire)
  const th = $('thumbs'), w = !cur.wall || cur.wall === 'none' ? 'off' : cur.wall, favs = cur.wallFavs || [];
  th.replaceChildren();
  mkb(th, 'th', 'off', 'Aucun', () => set('wall', 'off')).title = 'Fond du thème (par défaut)';
  mkb(th, 'th', 'auto', 'Aléatoire', () => set('wall', 'auto')).title = 'Un paysage différent à chaque nouvel onglet';
  mkb(th, 'th', '+', '+ Photos', async () => { await nxp('pickWall'); gal = await nxp('gallery'); thumbs(); });
  mkb(th, 'th', '++', '+ Vidéo', async () => { await nxp('pickVideo'); gal = await nxp('gallery'); thumbs(); });
  const items = [
    ...Object.entries(ANIMS).map(([id, name]) => ({ id: 'anim:' + id, name: name + ' (animé)' })),
    ...gal.map(g => ({ id: g.id, name: g.name, thumb: g.thumb, video: g.video })),
    ...Object.entries(SCENES).map(([id, s]) => ({ id, name: s.name, scene: id })),
  ];
  items.sort((a, b) => favs.includes(b.id) - favs.includes(a.id));   // favoris en premier
  for (const it of items) {
    const b = mkb(th, 'th', it.id, it.video ? '🎞 ' + it.name : '', () => set('wall', it.id));
    if (it.scene) b.style.backgroundImage = bg(uri(it.scene)); else if (it.thumb) b.style.backgroundImage = bg(it.thumb);
    b.title = it.name + (favs.includes(it.id) ? ' ★' : '');
    if (favs.includes(it.id)) b.classList.add('fav');
    if (it.id.startsWith('anim:')) b.classList.add('an');
    b.oncontextmenu = e => { e.preventDefault(); nxp('wallMenu', { id: it.id }); };
  }
  th.querySelectorAll('.th').forEach(b => b.classList.toggle('on', b.dataset.v === w));
}

// ---- Panneau Personnaliser ----
for (const [v, t] of [['auto', 'Auto'], ['dark', 'Sombre'], ['light', 'Clair'], ['arcade', '8-bit'], ['galaxy', 'Galaxie']]) mkb($('themes'), 'sw', v, t, () => set('theme', v));
for (const c of ['#ff4d4d', '#ff9f43', '#ffd93d', '#2ee59d', '#29c6ff', '#4d7cff', '#9b5cff', '#ff5fb0']) {
  const b = mkb($('colors'), 'dot', c, '', () => nxp('solid', c));
  b.style.background = c; b.title = c;
  $('colors').insertBefore(b, $('cc'));
}
for (const c of ['#00f0ff', '#ff2bd6', '#39ff14', '#ff7a00', '#b44bff']) {
  const b = mkb($('neons'), 'dot neon', c, '', () => nxp('neon', c));
  b.style.background = c; b.style.color = c; b.title = 'Néon ' + c;
}
$('cc').onchange = e => nxp('solid', e.target.value);
$('imp').onclick = async () => { await nxp('importTheme'); loadThemes(); };
async function loadThemes() {
  const list = await nxp('themes');
  $('mythemes').replaceChildren(...list.map(t => h('button', { className: 'sw', textContent: t.name, onclick: () => nxp('themeUse', t.id) })));
  marks();
}
$('lreset').onclick = () => nxp('lookReset');

// ---- Thèmes spéciaux : thème + fond animé + musique ; l'activation redémarre le navigateur avec une intro ----
const SPECIALS = [['tron', 'TRON', 'Legacy', 'Grille bleu néon, musique « End of Line »']];
for (const [id, name, tag, text] of SPECIALS) {
  $('special').append(h('button', { className: 'sp sp-' + id, title: 'Le navigateur redémarre pour lancer le thème', onclick: e => {
    if (cur.pick === id) return;
    e.currentTarget.classList.add('go'); e.currentTarget.querySelector('small').textContent = 'Redémarrage…';
    setTimeout(() => nxp('special', id), 450);
  } }, h('b', { textContent: name }, h('i', { textContent: tag })), h('small', { textContent: text })));
}

const openPanel = async () => {
  $('panel').classList.add('open'); $('shade').classList.add('on'); document.body.classList.add('po');
  loadThemes();
  if (!galLoaded) { galLoaded = true; gal = await nxp('gallery'); }
  thumbs();
};
const closePanel = () => { $('panel').classList.remove('open'); $('shade').classList.remove('on'); document.body.classList.remove('po'); };
$('cust').onclick = () => ($('panel').classList.contains('open') ? closePanel() : openPanel());
$('pclose').onclick = closePanel;
$('shade').onclick = closePanel;
addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });
$('wadd').onclick = async () => { await nxp('widgetAdd'); showWidgets(true); };

// ---- Recherche au centre : moteur au choix, suggestions favoris/historique ----
for (const [v, t] of [['', 'Par défaut'], ['duckduckgo', 'DuckDuckGo'], ['google', 'Google'], ['brave', 'Brave'], ['ecosia', 'Ecosia'], ['startpage', 'Startpage']]) $('eng').append(h('option', { value: v, textContent: t }));
const s = $('s');
s.onkeydown = e => { if (e.key === 'Enter' && s.value.trim()) nxp('go', { text: s.value, engine: $('eng').value || undefined }); };
s.oninput = async () => {
  const list = await nxp('suggest', s.value);
  $('sg').replaceChildren(...list.map(u => h('option', { value: u })));
};

// ---- Raccourcis ----
async function loadTiles() {
  const list = await nxp('shortcuts'), box = $('top');
  box.replaceChildren(...list.map((x, i) => {
    const a = h('a', { className: 'tile', href: x.url }, icoEl(x.url, x.title[0]), h('span', { className: 'nm', textContent: x.title }),
      h('i', { className: 'rm', textContent: '✕', title: 'Retirer', onclick: async e => { e.preventDefault(); e.stopPropagation(); await nxp('scDel', i); loadTiles(); } }));
    return a;
  }));
  if (list.length < 12) {
    const b = h('button', { className: 'tile', onclick: () => { $('an').value = ''; $('au').value = ''; $('add').showModal(); $('an').focus(); } },
      h('span', { className: 'ico plus', textContent: '+' }), h('span', { className: 'nm', textContent: 'Ajouter' }));
    box.append(b);
  }
}
$('acancel').onclick = () => $('add').close();
$('addf').onsubmit = async e => {
  e.preventDefault();
  if (!$('au').value.trim()) return;
  await nxp('scAdd', { title: $('an').value, url: $('au').value });
  $('add').close();
  loadTiles();
};

// ---- Widgets : cartes dans la rangée ----
function card(id, on) {
  let e = $(id);
  if (!e) { e = h('div', { id, className: 'wd' }); $('wid').append(e); }
  e.hidden = !on;
  return e;
}

const WMO = c => c === 0 ? '☀️' : c < 3 ? '🌤️' : c === 3 ? '☁️' : c < 50 ? '🌫️' : c < 60 ? '🌦️' : c < 70 ? '🌧️' : c < 80 ? '❄️' : c < 85 ? '🌧️' : c < 90 ? '❄️' : '⛈️';
async function showWeather(on) {
  const box = card('wx', on);
  if (!on) return;
  const w = await nxp('weather');
  box.replaceChildren();
  if (w.paused) { box.append(h('small', { textContent: 'Météo en pause (mode Gaming).' })); return; }
  if (w.need || w.error) {
    const inp = h('input', { placeholder: 'Ta ville' }), go = async () => { if (inp.value.trim()) { await set('city', inp.value.trim()); showWeather(true); } };
    inp.onkeydown = e => { if (e.key === 'Enter') go(); };
    box.append(h('b', { textContent: 'Météo' }), h('small', { textContent: w.error || 'Choisis une ville pour afficher la météo.' }), inp, h('button', { textContent: 'OK', onclick: go }));
    return;
  }
  box.append(h('div', { className: 'wnow' }, h('span', { textContent: WMO(w.code) }), h('b', { textContent: w.temp + '°' })),
    h('small', { textContent: `${w.city} · vent ${w.wind} km/h` }),
    h('div', { className: 'wdays' }, ...w.days.slice(1).map(d => h('div', {}, h('small', { textContent: new Date(d.d).toLocaleDateString('fr-FR', { weekday: 'short' }) }),
      h('span', { textContent: WMO(d.code) }), h('small', { textContent: `${d.min}°/${d.max}°` })))));
}

function showCal(on) {
  const box = card('cal', on);
  if (!on) return;
  const y = calM.getFullYear(), m = calM.getMonth(), first = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate(), t = new Date();
  box.replaceChildren(
    h('div', { className: 'ch' }, h('button', { textContent: '‹', onclick: () => { calM = new Date(y, m - 1, 1); showCal(true); } }),
      h('b', { textContent: new Date(y, m, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) }),
      h('button', { textContent: '›', onclick: () => { calM = new Date(y, m + 1, 1); showCal(true); } })),
    h('div', { className: 'cg' }, ...['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(x => h('small', { textContent: x })), ...Array.from({ length: first }, () => h('span')),
      ...Array.from({ length: days }, (_, i) => h('span', { textContent: i + 1, className: t.getFullYear() === y && t.getMonth() === m && t.getDate() === i + 1 ? 'td' : '' }))));
}

async function showTasks(on) {
  const box = card('tasks', on);
  if (!on) return;
  const list = await nxp('tasks'), save = () => nxp('tasksSet', list);
  const inp = h('input', { placeholder: 'Ajouter une tâche…', onkeydown: e => { if (e.key === 'Enter' && e.target.value.trim()) { list.push({ t: e.target.value.trim(), done: false }); save(); draw(); } } });
  const draw = () => box.replaceChildren(h('b', { textContent: 'Tâches' }), ...list.map((t, i) => h('label', { className: 'tk' },
    h('input', { type: 'checkbox', checked: t.done, onchange: e => { t.done = e.target.checked; save(); draw(); } }), h('span', { textContent: t.t, className: t.done ? 'dn' : '' }),
    h('i', { textContent: '✕', onclick: () => { list.splice(i, 1); save(); draw(); } }))), inp);
  draw();
}

async function showWidgets(on) {
  document.querySelectorAll('.cw').forEach(e => e.remove());
  if (!on) return;
  for (const w of await nxp('widgets')) {
    const W = (w.html.match(/widget:width"\s+content="(\d+)"/) || [])[1] || 220, H = (w.html.match(/widget:height"\s+content="(\d+)"/) || [])[1] || 150;
    const f = h('iframe', { sandbox: 'allow-scripts', srcdoc: w.html, title: w.name });
    f.style.width = W + 'px'; f.style.height = H + 'px';
    const box = h('div', { className: 'cw wd' }, f);
    if (w.user) box.append(h('i', { className: 'rm', textContent: '✕', title: 'Retirer le widget', onclick: async () => { await nxp('widgetDel', w.id); showWidgets(true); } }));
    $('wid').append(box);
  }
}

// ---- Actualités avec images, chargées après l'affichage ----
const ago = t => { const m = Math.max(1, Math.round((Date.now() - t) / 60000)); return m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`; };
async function showNews(on) {
  $('news').hidden = !on;
  if (!on || $('cards').childElementCount) return;
  const items = (await nxp('news')).slice(0, 6);
  if (!items.length) { $('cards').textContent = 'Actualités indisponibles pour le moment.'; return; }
  $('cards').replaceChildren(...items.map(n => {
    const a = h('a', { className: 'card', href: n.link });
    if (n.img) { const im = h('img', { src: n.img, alt: '', loading: 'lazy' }); im.onerror = () => im.remove(); a.append(im); }
    a.append(h('small', { textContent: n.source + (n.date ? ' · ' + ago(n.date) : '') }), h('b', { textContent: n.title }));
    return a;
  }));
}

// ---- Statistiques de protection (temps gagné : estimation à 50 ms par requête bloquée) ----
async function showStats(on) {
  $('stats').hidden = !on;
  if (!on) return;
  const st = await nxp('stats'), sec = st.ads * 0.05;
  const t = sec < 60 ? Math.round(sec) + ' s' : sec < 3600 ? `${Math.floor(sec / 60)} min ${Math.round(sec % 60)} s` : `${Math.floor(sec / 3600)} h ${Math.round((sec % 3600) / 60)} min`;
  $('stats').replaceChildren(
    ...[[st.ads.toLocaleString('fr-FR'), 'pubs et traceurs bloqués'], [st.params.toLocaleString('fr-FR'), 'liens nettoyés'], [t, 'de temps gagné (estimation)']]
      .map(([n, l]) => h('div', {}, h('b', { textContent: n }), h('span', { textContent: l }))));
}

// ---- Horloge : numérique, analogique, minimal, néon, rétro ----
function buildClock() {
  const c = $('clock'), st = cfg.clockStyle || 'digital';
  c.dataset.style = st; c.replaceChildren(); c._h = null;
  if (st === 'analog') {
    const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    const mk = (tag, a) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); svg.append(e); return e; };
    mk('circle', { cx: 50, cy: 50, r: 46, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5, opacity: .6 });
    for (let i = 0; i < 12; i++) mk('line', { x1: 50, y1: 6, x2: 50, y2: i % 3 ? 10 : 13, stroke: 'currentColor', 'stroke-width': i % 3 ? 1 : 2, transform: `rotate(${i * 30} 50 50)` });
    c._h = mk('line', { x1: 50, y1: 50, x2: 50, y2: 28, stroke: 'currentColor', 'stroke-width': 3.5, 'stroke-linecap': 'round' });
    c._m = mk('line', { x1: 50, y1: 50, x2: 50, y2: 16, stroke: 'currentColor', 'stroke-width': 2.2, 'stroke-linecap': 'round' });
    c._s = mk('line', { x1: 50, y1: 56, x2: 50, y2: 12, stroke: 'var(--ac)', 'stroke-width': 1 });
    c.append(svg, h('span', { id: 'dt' }));
  } else c.append(h('b', { id: 'ck' }), h('span', { id: 'dt' }));
  tickClock();
  clearInterval(clockTimer);
  clockTimer = setInterval(tickClock, st === 'analog' || cfg.clockSec ? 1000 : 15000);
}
function tickClock() {
  const c = $('clock');
  if (c.hidden) return;
  const n = new Date();
  $('dt').textContent = n.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  if (c._h) {
    const sec = n.getSeconds(), min = n.getMinutes() + sec / 60, hr = (n.getHours() % 12) + min / 60;
    c._h.setAttribute('transform', `rotate(${hr * 30} 50 50)`); c._m.setAttribute('transform', `rotate(${min * 6} 50 50)`); c._s.setAttribute('transform', `rotate(${sec * 6} 50 50)`);
  } else $('ck').textContent = n.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', ...(cfg.clockSec ? { second: '2-digit' } : {}), hour12: !cfg.clock24 });
}
function showClock(on) { $('clock').hidden = !on; if (on) buildClock(); else clearInterval(clockTimer); }

// ---- Notes rapides ----
let noteTimer;
async function showNotes(on) {
  $('nbtn').hidden = !on;
  if (!on) $('notes').hidden = true;
  else if (!$('nt').value) $('nt').value = await nxp('notes');
}
$('nbtn').onclick = () => { $('notes').hidden = !$('notes').hidden; if (!$('notes').hidden) $('nt').focus(); };
$('nt').oninput = () => { clearTimeout(noteTimer); noteTimer = setTimeout(() => nxp('noteSet', $('nt').value), 500); };
const applySearch = () => { $('sbox').dataset.size = cfg.searchSize || 'm'; $('sbox').dataset.shape = cfg.searchShape || 'pill'; };

// ---- Interrupteurs et listes du panneau ----
const TOG = [
  ['news', 'Actualités (mode Basique)', on => showNews(on && cfg.mode !== 'gaming')], ['stats', 'Statistiques de protection', showStats], ['clock', 'Horloge', showClock],
  ['clock24', 'Horloge au format 24 h', () => cfg.clock && buildClock()], ['clockSec', 'Horloge avec secondes', () => cfg.clock && buildClock()], ['notes', 'Notes rapides', showNotes],
  ['weather', 'Météo', showWeather], ['calendar', 'Calendrier', showCal], ['tasks', 'Tâches', showTasks], ['widgets', 'Widgets personnalisés', showWidgets],
];
const SELS = [
  ['clockStyle', "Style de l'horloge", [['digital', 'Numérique'], ['analog', 'Analogique'], ['minimal', 'Minimal'], ['neon', 'Néon'], ['retro', 'Rétro']], () => cfg.clock && buildClock()],
  ['searchSize', 'Taille de la barre', [['s', 'Petite'], ['m', 'Moyenne'], ['l', 'Grande']], applySearch],
  ['searchShape', 'Forme de la barre', [['pill', 'Arrondie'], ['round', 'Douce'], ['square', 'Droite']], applySearch],
];
for (const [key, label, fn] of TOG) $('opts').append(h('label', {}, h('input', { type: 'checkbox', id: 'o_' + key, onchange: e => { set(key, e.target.checked); cfg[key] = e.target.checked; fn(e.target.checked); } }), label));
for (const [key, label, list, fn] of SELS) $('opts').append(h('label', {}, label, h('select', { id: 'o_' + key, onchange: e => { set(key, e.target.value); cfg[key] = e.target.value; fn(); } }, ...list.map(([v, t]) => h('option', { value: v, textContent: t })))));

// Réglages modifiés ailleurs (page Paramètres, réinitialisation) : le panneau suit
async function syncOpts() {
  cfg = await nxp('settings');
  for (const [key] of TOG) $('o_' + key).checked = !!cfg[key];
  for (const [key, , list] of SELS) $('o_' + key).value = list.some(([v]) => v === cfg[key]) ? cfg[key] : list[0][0];
  applySearch();
}

(async () => {
  [cfg, icons] = await Promise.all([nxp('settings'), nxp('icons')]);
  await syncOpts();
  loadTiles();
  showNews(cfg.news && cfg.mode !== 'gaming'); showStats(cfg.stats); showClock(cfg.clock); showNotes(cfg.notes);
  showWeather(cfg.weather); showCal(cfg.calendar); showTasks(cfg.tasks); showWidgets(cfg.widgets);
})();
nxt(async d => {
  apply(d);
  const was = cfg.mode;
  await syncOpts();
  if (cfg.mode !== was) showNews(cfg.news && cfg.mode !== 'gaming');   // actualités : mode Basique seulement
});
nxp('look').then(apply);
