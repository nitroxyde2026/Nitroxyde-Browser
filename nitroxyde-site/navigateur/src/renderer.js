const $ = id => document.getElementById(id);
const els = new Map(), chips = new Map();
document.documentElement.dataset.os = nx.os;

// Barre latérale : messageries, musique (4 sources), assistants (3 comptes) et outils. Vraies icônes récupérées auprès des sites.
const BRAND = { discord: '#5865F2', whatsapp: '#25D366', telegram: '#229ED9', ytmusic: '#FF0000', spotify: '#1DB954', deezer: '#A238FF', chatgpt: '#10A37F', gemini: '#4285F4', claude: '#D97757' };
const NAMES = { discord: 'Discord', whatsapp: 'WhatsApp', telegram: 'Telegram', ytmusic: 'YouTube Music', spotify: 'Spotify', deezer: 'Deezer', chatgpt: 'ChatGPT', gemini: 'Gemini', claude: 'Claude' };
const MUSIC = ['music', 'ytmusic', 'spotify', 'deezer'], AIS = ['chatgpt', 'gemini', 'claude'];
let svc = {}, headKey = '', lastMode, lastS, hudTimer = 0;

function glyph(id) {   // vraie icône du service, sinon pastille à ses couleurs
  const box = document.createElement('span');
  box.className = 'gl'; box.textContent = NAMES[id][0]; box.style.background = BRAND[id];
  if (svc[id]) {
    const im = document.createElement('img');
    im.alt = ''; im.src = svc[id]; im.onerror = () => im.remove();
    box.className = 'gl ok'; box.textContent = ''; box.style.background = ''; box.append(im);
  }
  return box;
}
const RAIL = [['discord'], ['whatsapp'], ['telegram'], ['-'], ['music', '♪', 'Musique (Nitroxyde, YouTube Music, Spotify, Deezer)'],
  ['ai', '✦', 'Assistants avec ton compte (ChatGPT, Gemini, Claude)'], ['notes', '📝', 'Notes'], ['calc', '🧮', 'Calculatrice'], ['translate', '🌐', 'Traduction'], ['downloads', '⬇', 'Téléchargements']];
function markRail(s) {
  const on = id => id === 'music' ? MUSIC.includes(s.side) : id === 'ai' ? AIS.includes(s.side) : id === s.side;
  $('rail').querySelectorAll('button[data-id]').forEach(b => b.classList.toggle('on', on(b.dataset.id)));
}
function buildRail() {
  const r = $('rail');
  r.replaceChildren();
  for (const [id, icon, label] of RAIL) {
    if (id === '-') { r.append(document.createElement('hr')); continue; }
    const b = document.createElement('button');
    b.dataset.id = id; b.title = label || NAMES[id];
    b.append(icon ? Object.assign(document.createElement('span'), { className: 'gl plain', textContent: icon }) : glyph(id));
    b.onclick = () => nx.nav('side', id);
    r.append(b);
  }
  const pip = document.createElement('button');
  pip.textContent = '▣'; pip.title = 'Mini lecteur vidéo (Alt+P)'; pip.onclick = () => nx.nav('pip');
  r.append(pip);
  if (lastS) markRail(lastS);
}
const SHORT = { music: 'Nitroxyde', ytmusic: 'YT Music' };
function drawHead(s) {   // bandeau des sources (musique ou assistants) au-dessus du panneau
  const grp = MUSIC.includes(s.side) ? MUSIC : AIS.includes(s.side) ? AIS : null;
  $('sidehead').hidden = !grp;
  if (!grp) { headKey = ''; return; }
  const k = grp.join() + s.side + Object.values(svc).filter(Boolean).length;
  if (k === headKey) return;
  headKey = k;
  $('sidehead').replaceChildren(...grp.map(id => {
    const b = document.createElement('button');
    b.className = id === s.side ? 'on' : '';
    b.append(id === 'music' ? Object.assign(document.createElement('span'), { className: 'gl plain', textContent: '♪' }) : glyph(id), document.createTextNode(SHORT[id] || NAMES[id]));
    b.onclick = () => nx.nav('sideSet', id);
    return b;
  }));
}
function hud(on) {   // mode Gaming : CPU et RAM du navigateur en direct dans la barre
  clearInterval(hudTimer);
  $('hud').hidden = !on;
  if (!on) return;
  const upd = async () => { const p = await nx.nav('perf').catch(() => null); if (!p) return; $('hud').textContent = `🎮 CPU ${p.cpu} % · RAM ${p.ram} Mo`; };
  upd(); hudTimer = setInterval(upd, 2000);
}
async function loadSvc() { svc = await nx.nav('svcIcons'); buildRail(); headKey = ''; if (lastS) drawHead(lastS); }
buildRail(); loadSvc(); setTimeout(loadSvc, 6000); setTimeout(loadSvc, 20000);
nx.onExtra(n => document.documentElement.style.setProperty('--extra', n + 'px'));

// Panneau latéral redimensionnable : la poignée se place au bord du panneau, le glisser change sa largeur
nx.onSideW(w => { document.documentElement.style.setProperty('--sidew', w + 'px'); $('grip').hidden = !w; });
{
  const g = $('grip');
  let raf = 0, nextW = 0;
  g.onpointerdown = e => {
    e.preventDefault(); g.setPointerCapture(e.pointerId); g.classList.add('on');
    const right = document.documentElement.dataset.rail === 'right';
    g.onpointermove = ev => {
      nextW = right ? innerWidth - ev.clientX - 48 - 3 : ev.clientX - 48 - 3;
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; nx.nav('sideW', nextW); });
    };
  };
  g.onpointerup = g.onpointercancel = () => { g.onpointermove = null; g.classList.remove('on'); };
  g.ondblclick = () => nx.nav('sideW', 'reset');
}

function mk(t) {
  const el = document.createElement('div');
  el.className = 'tab new';
  el.innerHTML = '<img hidden alt=""><span class="t"></span><i class="au" hidden></i><b class="x">×</b>';
  setTimeout(() => el.classList.remove('new'), 300);
  el.onclick = e => { const c = e.target.classList; if (c.contains('x')) collapse(el); nx.nav(c.contains('x') ? 'close' : c.contains('au') ? 'mute' : 'activate', t.id); };
  el.onauxclick = e => { if (e.button === 1) nx.nav('close', t.id); };
  el.oncontextmenu = e => { e.preventDefault(); nx.nav('tabMenu', t.id); };
  el.onmouseenter = async () => {   // mémoire estimée de l'onglet (infobulle native)
    const name = el.querySelector('.t').textContent;
    if (lastMode !== 'gaming') { el.title = name; return; }   // CPU et RAM : seulement en mode Gaming
    const mb = await nx.nav('ram', t.id);
    el.title = mb === null ? name + '\nEn veille : mémoire libérée' : mb < 0 ? name : `${name}\nMémoire ≈ ${mb} Mo`;
  };
  return el;
}

nx.onState(s => {
  const seen = new Set(), order = [];
  let last = null;
  for (const t of s.tabs) {
    const g = t.group && s.groups.find(x => x.id === t.group);
    if (g && t.group !== last) {
      let c = chips.get(g.id);
      if (!c) { c = document.createElement('div'); c.className = 'grp'; c.onclick = () => nx.nav('groupMenu', g.id); chips.set(g.id, c); }
      c.textContent = g.name; c.style.setProperty('--c', g.color);
      order.push(c);
    }
    last = t.group;
    seen.add(t.id);
    let el = els.get(t.id);
    if (!el) { el = mk(t); els.set(t.id, el); }
    el.classList.toggle('on', t.id === s.active);
    el.classList.toggle('zzz', t.sleeping);
    el.classList.toggle('priv', !!t.priv);
    el.classList.toggle('pin', !!t.pinned);
    if (g) { el.dataset.g = '1'; el.style.setProperty('--c', g.color); } else delete el.dataset.g;
    el.querySelector('.t').textContent = t.title;
    const au = el.querySelector('.au');
    au.hidden = !(t.audible || t.muted); au.textContent = t.muted ? '🔇' : '🔊';
    const img = el.querySelector('img');
    if (t.icon && img.src !== t.icon) img.src = t.icon;
    img.hidden = !t.icon;
    el.dataset.l = (t.title[0] || '•').toUpperCase();
    if (t.id === s.active) {
      $('load').classList.toggle('on', !!t.loading);
      $('sc').textContent = t.blocked || '';
      $('shield').classList.toggle('on', t.blocked > 0);
      if (document.activeElement !== $('url')) $('url').value = t.url;
    }
    order.push(el);
  }
  for (const [id, el] of els) {
    if (!seen.has(id)) { els.delete(id); collapse(el); }
  }
  for (const [id, c] of chips) if (!s.groups.some(x => x.id === id)) { chips.delete(id); c.remove(); }
  const plus = $('plus'), cur = [...$('tabs').children].filter(n => n !== plus && !n.classList.contains('out'));
  if (cur.length !== order.length || cur.some((n, i) => n !== order[i])) for (const n of order) $('tabs').insertBefore(n, plus);
  const vp = s.vpn || {};   // bouton VPN : allumé + pays quand la protection est active
  $('vpn').classList.toggle('on', !!vp.on);
  $('vcc').textContent = vp.on ? vp.cc || (vp.app ? 'APP' : 'ON') : 'VPN';
  $('vpn').title = vp.on ? 'VPN actif (Alt+V)' : 'VPN désactivé (Alt+V)';
  $('back').disabled = !s.back;
  $('fwd').disabled = !s.fwd;
  $('star').textContent = s.star ? '★' : '☆';
  $('star').classList.toggle('on', !!s.star);
  lastS = s; markRail(s); drawHead(s);
  if (s.mode !== lastMode) { lastMode = s.mode; hud(s.mode === 'gaming'); }
});

// Recherche dans la page
const q = $('q');
const find = (fwd = true, next = false) => nx.nav('find', { text: q.value, fwd, next });
nx.onFind(m => {
  if (m === 'open') { $('find').hidden = false; q.focus(); q.select(); }
  else if (m === 'close') $('find').hidden = true;
  else $('cnt').textContent = q.value ? `${m.n}/${m.total}` : '';
});
q.oninput = () => find();
q.onkeydown = e => {
  if (e.key === 'Enter') find(!e.shiftKey, true);
  if (e.key === 'Escape') nx.nav('findclose');
};
$('fp').onclick = () => find(false, true);
$('fn').onclick = () => find(true, true);
$('fx').onclick = () => nx.nav('findclose');

$('plus').onclick = () => nx.nav('new');
$('back').onclick = () => nx.nav('back');
$('fwd').onclick = () => nx.nav('forward');
$('rl').onclick = () => nx.nav('reload');
$('home').onclick = () => nx.nav('home');
$('star').onclick = () => nx.nav('star');
$('menu').onclick = () => nx.nav('menu');
$('vpn').onclick = () => nx.nav('vpn');
$('shield').onclick = () => nx.nav('shield');
$('ai').onclick = () => nx.nav('ai');
$('url').onkeydown = e => { if (e.key === 'Enter') { nx.nav('go', e.target.value); e.target.blur(); } };
nx.onFocusUrl(() => { $('url').focus(); $('url').select(); });

// Thème et suggestions d'adresses
nx.onTheme(skin);
$('url').oninput = async e => {
  const list = await nx.nav('suggest', e.target.value);
  $('sg').replaceChildren(...list.map(u => Object.assign(document.createElement('option'), { value: u })));
};

// Musique de fond : la page de l'interface vit toute la session, elle joue la piste choisie
// Repli d'un onglet fermé : largeur → 0 en 180 ms (les voisins glissent), puis retrait
function collapse(el) {
  if (el.classList.contains('out')) return;
  const vertical = /left|right/.test(document.documentElement.dataset.pos || '');
  if (vertical) el.style.maxHeight = el.offsetHeight + 'px'; else el.style.maxWidth = el.offsetWidth + 'px';
  el.style.pointerEvents = 'none';
  el.getBoundingClientRect();
  el.classList.add('out');
  setTimeout(() => el.remove(), 200);
}
const bgm = $('bgm');
nx.onMusic(m => {
  if (m.src && bgm.dataset.src !== m.src) { bgm.dataset.src = m.src; bgm.src = m.src; }
  bgm.volume = m.vol;
  bgm.loop = m.loop;
  if (m.on && m.src) bgm.play().catch(() => {}); else bgm.pause();
  $('music').classList.toggle('on', m.on);
});
bgm.onended = () => nx.nav('musicNext');
$('music').onclick = () => nx.nav('musicToggle');
$('music').oncontextmenu = e => { e.preventDefault(); nx.nav('music'); };
