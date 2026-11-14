const { app, dialog, Menu, net, nativeImage, session, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const os = require('os');
const store = require('./store');
const adblock = require('./adblock');
const ai = require('./ai');

let api, ducked = false;
const UNP = __dirname.replace('app.asar', 'app.asar.unpacked');   // dossiers livrés avec l'exe : music/ et wallpapers/
const user = (...p) => path.join(app.getPath('userData'), ...p);
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const yieldMain = () => new Promise(r => setImmediate(r));
exports.init = a => { api = a; };
// Redémarrage sans « --reset » : sinon un redémarrage lancé par « npm run reset » effacerait tout à nouveau
const relaunch = () => app.relaunch({ args: process.argv.slice(1).filter(x => x !== '--reset') });

// ---- Statistiques de protection ----
exports.count = k => { const st = store.get('stats'); st[k]++; store.save('stats'); };

// ---- Logos des sites (mémorisés à la visite) ----
exports.setIcon = (url, icon) => {
  const h = hostOf(url), ic = store.get('icons');
  if (h && ic[h] !== icon) { ic[h] = icon; store.save('icons'); }
};

// ---- Fonds d'écran : photos ajoutées + dossier wallpapers/ ----
const IMG = /\.(jpe?g|png|webp|bmp|gif|avif)$/i;
const VID = /\.(mp4|webm|mov|m4v)$/i;
const wallDirs = () => [user('wallpapers'), path.join(UNP, 'wallpapers')];

exports.wallUrl = s => {
  if (s.wall === 'custom' && s.wallFile) return pathToFileURL(user(s.wallFile)).href + '?v=' + s.wallV;
  if (/^[pv]:/.test(s.wall)) {
    const n = path.basename(s.wall.slice(2));
    for (const d of wallDirs()) if (fs.existsSync(path.join(d, n))) return pathToFileURL(path.join(d, n)).href;
  }
  return '';
};

// Les grandes photos sont réduites (2560 px max) : le nouvel onglet reste instantané
async function saveWall(src, dir) {
  const base = Date.now() + '-' + path.parse(src).name.replace(/[^\w-]/g, '_').slice(0, 30);
  const img = nativeImage.createFromPath(src);
  if (img.isEmpty()) {
    const n = base + path.extname(src).toLowerCase();
    await fs.promises.copyFile(src, path.join(dir, n));
    return n;
  }
  const out = img.getSize().width > 2560 ? img.resize({ width: 2560, quality: 'good' }) : img;
  await fs.promises.writeFile(path.join(dir, base + '.jpg'), out.toJPEG(88));
  return base + '.jpg';
}

// Liste des photos avec miniatures (créées une fois, en laissant respirer l'interface)
async function gallery() {
  const out = [], tdir = user('thumbs');
  await fs.promises.mkdir(tdir, { recursive: true });
  for (const d of wallDirs()) {
    let names = [];
    try { names = await fs.promises.readdir(d); } catch {}
    for (const n of names.filter(x => IMG.test(x) || VID.test(x)).slice(0, 40)) {
      if (VID.test(n)) { out.push({ id: 'v:' + n, name: path.parse(n).name, thumb: '', video: true }); continue; }
      const t = path.join(tdir, n.replace(/[^\w.-]/g, '_') + '.jpg');
      if (!fs.existsSync(t)) {
        try {
          const img = nativeImage.createFromBuffer(await fs.promises.readFile(path.join(d, n)));
          if (!img.isEmpty()) await fs.promises.writeFile(t, img.resize({ width: 320, quality: 'good' }).toJPEG(80));
        } catch {}
        await yieldMain();
      }
      out.push({ id: 'p:' + n, name: path.parse(n).name, thumb: pathToFileURL(fs.existsSync(t) ? t : path.join(d, n)).href });
    }
  }
  return out;
}

// ---- Thèmes : couleur unie, import, export ----
const VARS = ['bg', 'bg2', 'bg3', 'tx', 'dim', 'ac', 'gl', 'line'];
const COLOR = /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([\d\s.,%/]+\))$/i;
const TEMPLATE = { name: 'Mon thème', light: false, bg: '#050506', bg2: '#101114', bg3: '#1b1c21', tx: '#eef2f7', dim: '#7b828c', ac: '#f4f8ff', gl: '#a9c8ff', line: '#2a2b31' };

function solid(hex) {   // fonds teintés par la couleur choisie, qui devient l'accent
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  const hh = !d ? 0 : mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const h = Math.round((hh * 60 + 360) % 360), k = d < 0.05 ? 0 : 1;
  return { bg: `hsl(${h}, ${45 * k}%, 9%)`, bg2: `hsl(${h}, ${40 * k}%, 14%)`, bg3: `hsl(${h}, ${36 * k}%, 21%)`, tx: `hsl(${h}, ${30 * k}%, 96%)`, dim: `hsl(${h}, ${18 * k}%, 68%)`, ac: hex, gl: hex, line: `hsl(${h}, ${32 * k}%, 27%)` };
}

function useTheme(custom) {
  const s = store.get('settings');
  s.theme = 'custom'; s.custom = custom;
  leaveSpecial(s);
  store.save('settings');
  api.applyLook(); exports.sendMusic();
}

// ---- Texte propre : entités HTML décodées (même doublement encodées), balises retirées ----
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', hellip: '…', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  euro: '€', eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', acirc: 'â', ccedil: 'ç', ocirc: 'ô', icirc: 'î', ucirc: 'û', ugrave: 'ù', iuml: 'ï', euml: 'ë', oelig: 'œ', Eacute: 'É', copy: '©', deg: '°', middot: '·' };
const decode = s => s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z][a-z0-9]*));/gi, (m, d, x, n) => {
  if (d || x) { try { return String.fromCodePoint(d ? +d : parseInt(x, 16)); } catch { return ''; } }
  return n in ENT ? ENT[n] : m;
});
// Première image d'un article : enclosure, media:content, media:thumbnail ou <img> du contenu
function imgOf(b) {
  const m = b.match(/<(?:enclosure|media:content|media:thumbnail)\b[^>]*?\burl=["']([^"']+)["'][^>]*>/i) || b.match(/<img\b[^>]*?\bsrc=["']([^"']+)["']/i) || decode(b).match(/<img\b[^>]*?\bsrc=["']([^"']+)["']/i);
  const u = m ? decode(m[1]).trim() : '';
  return /^https:\/\//i.test(u) && !/\.(mp3|mp4|m4a|ogg|wav|mov|webm)(\?|$)/i.test(u) ? u : '';
}

function plain(s) {
  s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  for (let i = 0; i < 3; i++) { const d = decode(s); if (d === s) break; s = d; }
  return s.replace(/<[^>]+>/g, ' ').replace(/[\u00a0\s]+/g, ' ').trim();
}

// ---- Actualités (flux RSS lus côté processus principal, sans bloquer la page) ----
const FEEDS = {
  francetvinfo: ['France Info', 'https://www.francetvinfo.fr/titres.rss'],
  lemonde: ['Le Monde', 'https://www.lemonde.fr/rss/une.xml'],
  google: ['Google Actualités', 'https://news.google.com/rss?hl=fr&gl=FR&ceid=FR:fr'],
  bbc: ['BBC News', 'https://feeds.bbci.co.uk/news/rss.xml'],
};
let newsCache = { key: '', at: 0, items: [] };

async function news() {
  const key = store.get('settings').newsSource, f = FEEDS[key] || FEEDS.francetvinfo;
  if (newsCache.key === key && Date.now() - newsCache.at < 15 * 60000) return newsCache.items;
  try {
    const xml = await (await net.fetch(f[1], { signal: AbortSignal.timeout(6000) })).text();
    const tag = (s, t) => {
      const m = s.match(new RegExp('<' + t + '[^>]*>([\\s\\S]*?)</' + t + '>'));
      return m ? plain(m[1]) : '';
    };
    const items = [...xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/g)].slice(0, 9)
      .map(m => ({ title: tag(m[1], 'title'), link: tag(m[1], 'link'), date: Date.parse(tag(m[1], 'pubDate')) || 0, source: f[0], img: imgOf(m[1]) }))
      .filter(x => x.title && /^https?:/.test(x.link));
    newsCache = { key, at: Date.now(), items };
  } catch { return newsCache.key === key ? newsCache.items : []; }
  return newsCache.items;
}

// ---- Musique de fond : lue par la page de l'interface, pilotée d'ici ----
const AUDIO = /\.(mp3|ogg|wav|m4a|flac|opus|aac)$/i;
const DEFAULT_TRACK = 'Seismic Souls - NUYA';   // piste jouée au premier lancement
const musicDirs = () => [path.join(UNP, 'music'), user('music')];   // pistes de base d'abord, puis celles de l'utilisateur
let trackCache = null;
function tracks() {
  if (trackCache) return trackCache;
  const out = [];
  for (const d of musicDirs()) { try { for (const n of fs.readdirSync(d).sort((a, b) => a.localeCompare(b, 'fr'))) if (AUDIO.test(n)) out.push(path.join(d, n)); } catch {} }
  return (trackCache = out);
}
const isUserTrack = f => path.dirname(f) === user('music');
// La piste mémorisée est retrouvée même si le dossier d'installation a changé (mise à jour, autre PC)
function curTrack(s, all = tracks()) {
  if (all.includes(s.musicTrack)) return s.musicTrack;
  const base = s.musicTrack && path.basename(s.musicTrack);
  return (base && all.find(f => path.basename(f) === base)) || all.find(f => path.parse(f).name === DEFAULT_TRACK) || all[0] || '';
}

// Au lancement : la musique démarre si l'option est cochée (par défaut oui), même si elle avait été mise en pause
exports.musicBoot = () => {
  const s = store.get('settings');
  s.musicOn = !!s.musicStart;
  store.save('settings');
  exports.sendMusic();
};

// Thèmes spéciaux : chacun a sa propre musique, jouée en boucle tant qu'il est actif
const SPECIAL = { tron: { name: 'Tron', track: path.join(UNP, 'themes', 'tron', 'End of Line - Daft Punk.mp3'), wall: 'anim:tron' } };
const themeTrack = s => { const sp = SPECIAL[s.theme]; return sp && fs.existsSync(sp.track) ? sp.track : ''; };

exports.sendMusic = () => {
  const s = store.get('settings'), all = tracks(), tt = themeTrack(s);
  const t = tt || curTrack(s, all);
  try {
    api.state.win.webContents.send('music', {
      on: !!(s.musicOn && t && !(ducked && s.musicAuto)),
      src: t ? pathToFileURL(t).href : '', vol: s.musicVol, loop: !!tt || s.musicRepeat !== false || all.length < 2,   // « Répéter » : la piste choisie tourne en boucle
    });
  } catch {}
};

// Activation d'un thème spécial : thème + fond animé + musique, puis redémarrage avec l'animation d'intro
exports.special = id => {
  const sp = SPECIAL[id];
  if (!sp) return;
  const s = store.get('settings');
  if (s.wall !== sp.wall) s.preSpecialWall = s.wall;
  s.theme = id; s.wall = sp.wall; s.intro = id; s.musicOn = true;
  store.save('settings'); store.flush();
  relaunch(); app.quit();
};
// Sortie d'un thème spécial : le fond d'avant revient
function leaveSpecial(s) {
  if (SPECIAL[s.theme]) return;
  if (Object.values(SPECIAL).some(sp => sp.wall === s.wall)) s.wall = s.preSpecialWall || 'off';
}
exports.specialTrack = themeTrack;

exports.duck = on => { if (on !== ducked) { ducked = on; exports.sendMusic(); } };

exports.musicNext = () => {
  const s = store.get('settings'), all = tracks();
  if (!all.length || themeTrack(s)) return;   // thème spécial : sa musique tourne en boucle
  s.musicTrack = all[(all.indexOf(curTrack(s, all)) + 1) % all.length];
  store.save('settings'); exports.sendMusic();
};

exports.addMusic = async () => {
  const r = await dialog.showOpenDialog(api.state.win, {
    properties: ['openFile', 'multiSelections'], filters: [{ name: 'Audio', extensions: ['mp3', 'ogg', 'wav', 'm4a', 'flac', 'opus', 'aac'] }],
  });
  if (r.canceled) return;
  const dir = user('music'), s = store.get('settings');
  await fs.promises.mkdir(dir, { recursive: true });
  for (const f of r.filePaths.filter(x => AUDIO.test(x)).slice(0, 50)) { s.musicTrack = path.join(dir, path.basename(f)); await fs.promises.copyFile(f, s.musicTrack); }
  trackCache = null;
  s.musicOn = true; store.save('settings'); exports.sendMusic();
};

async function delMusic(f) {   // seules les musiques ajoutées par l'utilisateur peuvent être supprimées
  if (!tracks().includes(f) || !isUserTrack(f)) return;
  const s = store.get('settings'), was = curTrack(s);
  try { await fs.promises.unlink(f); } catch {}
  trackCache = null;
  if (was === f) s.musicTrack = '';
  store.save('settings'); exports.sendMusic();
}

exports.musicMenu = () => {
  const s = store.get('settings'), all = tracks(), cur = curTrack(s, all);
  const set = (k, v) => () => { s[k] = v; store.save('settings'); exports.sendMusic(); };
  Menu.buildFromTemplate([
    { label: s.musicOn ? 'Mettre la musique en pause' : 'Lancer la musique', click: set('musicOn', !s.musicOn) },
    { label: 'Piste suivante', click: exports.musicNext },
    { label: 'Répéter la piste en boucle', type: 'checkbox', checked: s.musicRepeat !== false, click: () => { s.musicRepeat = s.musicRepeat === false; store.save('settings'); exports.sendMusic(); } },
    { type: 'separator' },
    ...all.slice(0, 25).map(f => ({ label: path.parse(f).name, type: 'radio', checked: f === cur, click: () => { s.musicTrack = f; s.musicOn = true; store.save('settings'); exports.sendMusic(); } })),
    ...(all.length ? [{ type: 'separator' }] : []),
    { label: 'Volume', submenu: [0.1, 0.25, 0.5, 0.75, 1].map(v => ({ label: Math.round(v * 100) + ' %', type: 'radio', checked: s.musicVol === v, click: set('musicVol', v) })) },
    { label: 'Ajouter une musique…', click: exports.addMusic },
    { label: 'Lancer la musique au démarrage', type: 'checkbox', checked: !!s.musicStart, click: () => { s.musicStart = !s.musicStart; store.save('settings'); } },
  ]).popup({ window: api.state.win });
};

// ---- Synchronisation par dossier (OneDrive, Google Drive, Dropbox…) : le plus récent gagne ----
const SYNC_SET = ['engine', 'adblock', 'strip', 'sleepMin', 'theme', 'custom', 'wall', 'https', 'gpc', 'restore', 'news', 'newsSource', 'stats',
  'tabsPos', 'anim', 'mode', 'clock', 'notes', 'perf', 'dns', 'dnsCustom', 'dlSort', 'aiModel', 'aiAuto', 'sidebar', 'accent', 'clockStyle', 'clock24', 'clockSec',
  'weather', 'city', 'calendar', 'tasks', 'widgets', 'searchSize', 'searchShape', 'cookies3', 'dlLimitKB', 'musicStart', 'musicAuto', 'musicVol', 'wallFavs'];

exports.syncNow = () => {
  const s = store.get('settings'), meta = store.get('meta');
  if (!s.syncDir) return 'Aucun dossier choisi';
  const f = path.join(s.syncDir, 'nitroxyde-sync.json');
  try {
    let remote = null;
    try { remote = JSON.parse(fs.readFileSync(f, 'utf8')); } catch {}
    if (remote && remote.t > meta.t) {              // le fichier est plus récent : on l'applique
      store.set('bookmarks', remote.bookmarks || []);
      store.set('shortcuts', remote.shortcuts || []);
      for (const k of SYNC_SET) if (k in (remote.settings || {})) s[k] = remote.settings[k];
      store.save('settings');
      meta.t = remote.t;
      api.applyLook(); api.push();
    } else if (!remote || meta.t > remote.t) {      // nos données sont plus récentes : on écrit
      const pick = {};
      for (const k of SYNC_SET) pick[k] = s[k];
      fs.writeFileSync(f, JSON.stringify({ t: meta.t, bookmarks: store.get('bookmarks'), shortcuts: store.get('shortcuts'), settings: pick }));
    }
    meta.last = Date.now(); store.save('meta');
    return 'ok';
  } catch (err) { return 'Erreur : ' + err.message; }
};
exports.syncStart = () => { exports.syncNow(); setInterval(() => { if (store.get('settings').mode !== 'gaming') exports.syncNow(); }, 5 * 60000); };

// ---- Commandes demandées par les pages internes ----
exports.handle = async (e, cmd, arg) => {
  const s = store.get('settings');
  if (cmd.startsWith('pw')) return require('./passwords').handle(cmd, arg);
  if (cmd === 'procs') return require('./popup').procs();
  if (cmd === 'procKill') return require('./popup').procKill(+arg);
  if (cmd === 'procGo') return require('./popup').procGo(+arg);
  if (cmd === 'vpnState') return require('./vpn').state();
  if (cmd === 'vpnOpen') return require('./popup').toggle('vpn');
  const r2 = await handle2(e, cmd, arg, s);
  if (r2 !== NOT) return r2;
  switch (cmd) {
    case 'icons': {   // logos mémorisés à la visite + vraies icônes des services de la barre latérale
      const out = { ...store.get('icons') }, svc = store.get('svcicons');
      for (const id in SVC) if (svc[id]) { const h = hostOf(SVC[id]); out[h] ??= svc[id]; if (id === 'discord') out['discord.gg'] ??= svc[id]; }
      return out;
    }
    case 'lookReset': {   // apparence d'origine : thème Sombre, sans fond, sans accent
      Object.assign(s, { theme: 'dark', wall: 'off', accent: '', custom: {}, customCss: '', clockStyle: 'digital', searchSize: 'm', searchShape: 'pill' });
      store.save('settings'); api.applyLook(); exports.sendMusic();
      return;
    }
    case 'stats': return store.get('stats');
    case 'shortcuts': return store.get('shortcuts');
    case 'scAdd': {
      const l = store.get('shortcuts');
      let u = String(arg.url || '').trim();
      if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
      let x; try { x = new URL(u); } catch { return l; }
      if (/^https?:$/.test(x.protocol) && x.hostname && l.length < 12) {
        l.push({ url: x.href, title: String(arg.title || '').trim().slice(0, 30) || hostOf(x.href) });
        store.save('shortcuts');
      }
      return l;
    }
    case 'scDel': { const l = store.get('shortcuts'); l.splice(+arg, 1); store.save('shortcuts'); return l; }
    case 'news': return news();
    case 'gallery': return gallery();
    case 'pickWall': {
      const r = await dialog.showOpenDialog(api.state.win, {
        properties: ['openFile', 'multiSelections'], filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'] }],
      });
      if (r.canceled) break;
      const dir = user('wallpapers');
      await fs.promises.mkdir(dir, { recursive: true });
      let last = '';
      for (const f of r.filePaths.slice(0, 12)) last = await saveWall(f, dir);
      s.wall = 'p:' + last; store.save('settings'); api.applyLook();
      break;
    }
    case 'solid': if (/^#[0-9a-f]{6}$/i.test(String(arg))) useTheme({ name: 'Couleur unie', light: false, vars: solid(arg) }); break;
    case 'importTheme': {
      const r = await dialog.showOpenDialog(api.state.win, { properties: ['openFile'], filters: [{ name: 'Thème Nitroxyde', extensions: ['json'] }] });
      if (r.canceled) break;
      try {
        const j = JSON.parse(await fs.promises.readFile(r.filePaths[0], 'utf8')), vars = {};
        for (const k of VARS) {
          if (!COLOR.test(String(j[k]))) throw new Error(`la couleur « ${k} » est absente ou invalide`);
          vars[k] = j[k];
        }
        useTheme({ name: String(j.name || 'Thème importé').slice(0, 40), light: !!j.light, vars });
      } catch (err) { api.toast({ icon: '⚠', title: 'Thème non importé', text: err.message, ms: 6000 }); }
      break;
    }
    case 'exportTheme': {
      const r = await dialog.showSaveDialog(api.state.win, { defaultPath: 'mon-theme-nitroxyde.json', filters: [{ name: 'Thème Nitroxyde', extensions: ['json'] }] });
      if (r.canceled) break;
      const c = s.theme === 'custom' && s.custom.vars ? s.custom : null;
      await fs.promises.writeFile(r.filePath, JSON.stringify(c ? { name: c.name, light: c.light, ...c.vars } : TEMPLATE, null, 2));
      break;
    }
    case 'pickDir': {
      if (!['downloadDir', 'syncDir'].includes(arg)) break;
      const r = await dialog.showOpenDialog(api.state.win, { properties: ['openDirectory', 'createDirectory'] });
      if (r.canceled) break;
      s[arg] = r.filePaths[0]; store.save('settings');
      if (arg === 'syncDir') exports.syncNow();
      break;
    }
    case 'syncNow': return exports.syncNow();
    case 'special': exports.special(String(arg)); break;
    case 'factoryReset': {   // remise à zéro totale (comme une nouvelle installation) : effacée au prochain démarrage
      const v = await api.toast({ icon: '⚠', title: 'Tout effacer et redémarrer ?', text: 'Réglages, historique, favoris, mots de passe, cookies, musiques et fonds ajoutés : tout repart de zéro.', ms: 15000,
        actions: [{ label: 'Tout effacer', value: true }, { label: 'Annuler', value: false }] });
      if (v !== true) return false;
      fs.writeFileSync(path.join(global.NX_ROOT, 'reset.flag'), '1');
      relaunch(); app.quit();
      return true;
    }
    case 'addMusic': return exports.addMusic();
    case 'mode': exports.setMode(String(arg), true); break;
    case 'perf': return exports.perf();
    case 'perms': return Object.entries(store.get('perms')).map(([k, v]) => { const [site, perm] = k.split('|'); return { key: k, site, perm, allow: v }; });
    case 'permDel': { const p = store.get('perms'); delete p[arg]; store.save('perms'); break; }
    case 'wallUrl': return exports.wallUrl({ wall: String(arg), wallFile: '', wallV: 0 });
    case 'wallList': return wallNames();
    case 'notes': return store.get('notes').text;
    case 'noteSet': store.get('notes').text = String(arg).slice(0, 20000); store.save('notes'); break;
    case 'aiKey': ai.setKey(arg.provider, arg.key); break;
    case 'blockInfo': return { engine: adblock.active() };
    case 'about': return { version: app.getVersion(), chrome: process.versions.chrome, electron: process.versions.electron };
    case 'reset': {   // les clés d'IA et l'écran d'accueil déjà vu sont conservés
      const keep = { groqKey: s.groqKey, openaiKey: s.openaiKey, geminiKey: s.geminiKey, claudeKey: s.claudeKey, onboarded: true, welcomeV: s.welcomeV, tuneV: s.tuneV };
      store.set('settings', { ...store.defaults('settings'), ...keep });
      api.applyLook(); exports.applyMode(); exports.sendMusic(); api.push();
      break;
    }
  }
};

function wallNames() {
  const out = [];
  for (const d of wallDirs()) { try { for (const n of fs.readdirSync(d)) if (IMG.test(n)) out.push('p:' + n); } catch {} }
  return out;
}

// ---- Réseau : DNS privé (DNS sur HTTPS) ----
const DNS = { cloudflare: 'https://cloudflare-dns.com/dns-query', google: 'https://dns.google/dns-query', quad9: 'https://dns.quad9.net/dns-query', adguard: 'https://dns.adguard-dns.com/dns-query' };
exports.applyDns = () => {
  const s = store.get('settings'), url = DNS[s.dns] || (s.dns === 'custom' ? s.dnsCustom : '');
  try {
    app.configureHostResolver(/^https:\/\//.test(url)
      ? { enableBuiltInResolver: true, secureDnsMode: 'secure', secureDnsServers: [url] }
      : { secureDnsMode: 'off' });
  } catch {}
};

// ---- Mémoire d'un onglet (survol) et CPU/RAM du navigateur ----
exports.tabRam = id => {
  const t = api.state.tabs.find(x => x.id === id);
  if (!t || !t.view) return null;
  const m = app.getAppMetrics().find(x => x.pid === t.view.webContents.getOSProcessId());
  return m ? Math.round(memKB(m) / 1024) : -1;
};
// Mémoire comptée comme le Gestionnaire des tâches : la mémoire privée de chaque processus (Windows),
// et non le « working set » qui compte plusieurs fois les bibliothèques partagées entre processus
const memKB = m => m.memory.privateBytes || m.memory.workingSetSize;
exports.memKB = memKB;
// CPU : moyenne lissée sur quelques mesures, ramenée au nombre de cœurs comme dans le Gestionnaire des tâches
let cpuAvg = 0;
exports.perf = () => {
  const ms = app.getAppMetrics();
  const cpu = ms.reduce((a, m) => a + m.cpu.percentCPUUsage, 0) / (os.cpus().length || 1);   // Chromium compte en « % d'un cœur »
  cpuAvg = cpuAvg ? cpuAvg * 0.6 + cpu * 0.4 : cpu;
  return { cpu: Math.min(100, Math.round(cpuAvg)), ram: Math.round(ms.reduce((a, m) => a + memKB(m), 0) / 1024) };
};

// ---- Musique : le disque de la barre met en pause d'un clic ----
exports.musicToggle = () => {
  if (!tracks().length) return exports.musicMenu();
  const s = store.get('settings');
  s.musicOn = !s.musicOn; store.save('settings'); exports.sendMusic();
};

// ---- Bouclier : compteur de la page, bloqueur par site, effacement des données du site ----
exports.shieldMenu = () => {
  const t = api.state.active;
  if (!t) return;
  const s = store.get('settings'), host = hostOf(t.url), web = t.url.startsWith('http'), off = s.allow.includes(host);
  Menu.buildFromTemplate([
    { label: `${t.blocked || 0} éléments bloqués sur cette page`, enabled: false },
    { label: 'Bloqueur actif sur ce site', type: 'checkbox', checked: !off, enabled: web, click: () => {
      s.allow = off ? s.allow.filter(h => h !== host) : [...s.allow, host];
      store.save('settings'); adblock.allow(s.allow); api.reloadActive();
    } },
    { label: 'Effacer les données de ce site', enabled: web, click: async () => {
      await session.fromPartition(t.priv ? 'nitroxyde-prive' : 'persist:nitroxyde').clearStorageData({ origin: new URL(t.url).origin });
      api.toast({ icon: '🧹', title: host, text: 'Données du site effacées', ms: 3500 });
    } },
    { type: 'separator' },
    { label: 'Réglages de confidentialité…', click: () => api.createTab(api.PAGES + '#settings') },
  ]).popup({ window: api.state.win });
};

// ---- Modes d'utilisation ----
const LOW = m => m === 'gaming';
const LABELS = { normal: 'Basique', gaming: 'Gaming' };

exports.priority = wc => {   // Gaming et Économie : le navigateur passe en priorité basse pour laisser le CPU au reste
  try { os.setPriority(wc.getOSProcessId(), LOW(store.get('settings').mode) ? os.constants.priority.PRIORITY_BELOW_NORMAL : os.constants.priority.PRIORITY_NORMAL); } catch {}
};

exports.applyMode = () => {
  api.pauseDownloads(store.get('settings').mode === 'gaming');
  for (const t of api.state.tabs) if (t.view) exports.priority(t.view.webContents);
};

exports.setMode = (id, full) => {
  const s = store.get('settings'), was = s.mode;
  id = id === 'gaming' ? 'gaming' : 'normal';        // deux modes : Basique et Gaming
  s.mode = id; s.onboarded = true;                   // un mode ne touche ni au thème ni au fond : seulement aux fonctionnalités
  if (full && id === 'gaming') {                     // premier choix : on AJOUTE les raccourcis Gaming, sans rien retirer
    const cur = store.get('shortcuts');
    for (const [title, url] of [['Steam', 'https://store.steampowered.com/'], ['Discord', 'https://discord.com/app'], ['Twitch', 'https://www.twitch.tv/'], ['YouTube', 'https://www.youtube.com/']]) {
      if (cur.length < 12 && !cur.some(x => hostOf(x.url) === hostOf(url))) cur.push({ title, url });
    }
    store.save('shortcuts');
  }
  store.save('settings');
  api.applyLook(); exports.applyMode(); api.push();
  if (was !== id) api.toast(id === 'gaming'
    ? { icon: '🎮', title: 'Mode Gaming activé', text: 'Téléchargements en pause, onglets en veille après 1 min, priorité basse, notifications discrètes.', ms: 6000 }
    : { icon: '🌐', title: 'Mode Basique', text: 'Tout est de nouveau actif.', ms: 3500 });
};

exports.modeItems = () => Object.entries(LABELS).map(([id, label]) => ({
  label, type: 'radio', checked: store.get('settings').mode === id, click: () => exports.setMode(id, false),
}));

// Effets de bord d'un réglage modifié depuis la page Paramètres
exports.after = (k, v) => {
  if (k === 'dns' || k === 'dnsCustom') exports.applyDns();
  else if (k === 'adblock') adblock.toggle(v);
  else if (k === 'mode') exports.setMode(v, false);
  else if (k === 'netLimit') require('./popup').applyNetLimit();
  else if (k === 'theme') {
    const s = store.get('settings');
    if (SPECIAL[v]) exports.special(v);   // choisi depuis la page Paramètres : même effet que sur le nouvel onglet
    else { leaveSpecial(s); store.save('settings'); api.applyLook(); exports.sendMusic(); }
  }
  else if (['tabsPos', 'anim', 'customCss', 'accent', 'sidebar'].includes(k)) api.applyLook();
};

// ================= Version 0.6 =================
const NOT = Symbol('none');

// ---- Modes : valeurs effectives, rien n'est écrasé dans les réglages de l'utilisateur ----
const MODE_SLEEP = { gaming: 1 };
exports.sleepMin = () => {
  const s = store.get('settings'), m = MODE_SLEEP[s.mode] || 0, u = s.sleepMin || 0;
  return u && m ? Math.min(u, m) : u || m;
};

// ---- Cookies tiers : supprimés dès qu'ils sont posés par un site qui n'est pas ouvert (toujours actif en navigation privée) ----
const COM2 = new Set(['co', 'com', 'org', 'net', 'gov', 'ac']);
const siteOf = h => {
  const p = h.replace(/^\./, '').toLowerCase().split('.');
  return p.slice(-(p.length > 2 && COM2.has(p[p.length - 2]) && p[p.length - 1].length === 2 ? 3 : 2)).join('.');
};
const LOGIN = ['google.com', 'googleapis.com', 'gstatic.com', 'microsoftonline.com', 'live.com', 'microsoft.com', 'apple.com', 'paypal.com', 'stripe.com', 'cloudflare.com'];
exports.cookieGuard = (ses, strict) => {
  ses.cookies.on('changed', (e, c, cause, removed) => {
    if (removed || !api || (!strict && !store.get('settings').cookies3)) return;
    const site = siteOf(c.domain);
    if (LOGIN.includes(site)) return;
    const open = new Set(api.state.tabs.filter(t => !!t.priv === strict).map(t => siteOf(hostOf(t.url))));
    for (const a of store.get('settings').allow) open.add(siteOf(a));
    if (!open.has(site)) ses.cookies.remove(`http${c.secure ? 's' : ''}://${c.domain.replace(/^\./, '')}${c.path}`, c.name).catch(() => {});
  });
};

// ---- Extensions (partie de l'API Chrome prise en charge par Electron) ----
const extApi = () => { const ses = session.fromPartition('persist:nitroxyde'); return ses.extensions || ses; };
exports.loadExtensions = () => { for (const p of store.get('settings').extensions) extApi().loadExtension(p).catch(() => {}); };

// ---- Profils ----
const profFile = () => path.join(global.NX_ROOT, 'profile.json');
function profiles() {
  let j = { current: 'principal', list: ['principal'] };
  try { j = { ...j, ...JSON.parse(fs.readFileSync(profFile(), 'utf8')) }; } catch {}
  if (!j.list.includes('principal')) j.list.unshift('principal');
  return j;
}
const switchProfile = (j, name) => { j.current = name; fs.writeFileSync(profFile(), JSON.stringify(j)); relaunch(); app.quit(); };
exports.profileName = () => { try { return profiles().current; } catch { return ''; } };
exports.profileItems = () => { const j = profiles(); return j.list.map(n => ({ label: n, type: 'radio', checked: n === j.current, click: () => switchProfile(j, n) })); };

// ---- Météo (Open-Meteo, sans clé) ----
let wx = { key: '', at: 0, data: null };
async function weather() {
  const s = store.get('settings'), city = String(s.city || '').trim();
  if (!city) return { need: true };
  if (wx.key === city && Date.now() - wx.at < 15 * 60000) return wx.data;
  try {
    const g = await (await net.fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=fr&name=' + encodeURIComponent(city), { signal: AbortSignal.timeout(6000) })).json();
    const r = g.results?.[0];
    if (!r) return { error: 'Ville introuvable' };
    const w = await (await net.fetch(`https://api.open-meteo.com/v1/forecast?latitude=${r.latitude}&longitude=${r.longitude}&current=temperature_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=4`, { signal: AbortSignal.timeout(6000) })).json();
    wx = { key: city, at: Date.now(), data: { city: r.name, temp: Math.round(w.current.temperature_2m), code: w.current.weather_code, wind: Math.round(w.current.wind_speed_10m),
      days: w.daily.time.map((d, i) => ({ d, code: w.daily.weather_code[i], max: Math.round(w.daily.temperature_2m_max[i]), min: Math.round(w.daily.temperature_2m_min[i]) })) } };
    return wx.data;
  } catch { return wx.key === city && wx.data ? wx.data : { error: 'Météo indisponible' }; }
}

// ---- Widgets personnalisés : simples fichiers .html affichés dans un cadre isolé ----
const widgetDirs = () => [user('widgets'), path.join(UNP, 'widgets')];
async function widgets() {
  const out = [];
  for (const [i, d] of widgetDirs().entries()) {
    let names = [];
    try { names = await fs.promises.readdir(d); } catch {}
    for (const n of names.filter(x => /\.html?$/i.test(x)).slice(0, 12)) {
      try {
        const html = await fs.promises.readFile(path.join(d, n), 'utf8');
        if (html.length < 200000) out.push({ id: (i ? 'b:' : 'u:') + n, name: path.parse(n).name, html, user: !i });
      } catch {}
    }
  }
  return out;
}

// ---- Thèmes enregistrés : dossier themes/ livré + thèmes importés ----
const themeDirs = () => [user('themes'), path.join(UNP, 'themes')];
function parseTheme(j) {
  const vars = {};
  for (const k of VARS) { if (!COLOR.test(String(j[k]))) throw new Error(`la couleur « ${k} » est absente ou invalide`); vars[k] = j[k]; }
  return { name: String(j.name || 'Thème importé').slice(0, 40), light: !!j.light, neon: !!j.neon, vars };
}
function readThemes() {
  const out = [];
  for (const [i, d] of themeDirs().entries()) {
    let names = [];
    try { names = fs.readdirSync(d); } catch {}
    for (const n of names.filter(x => /\.json$/i.test(x)).slice(0, 40)) {
      try { out.push({ id: (i ? 'b:' : 'u:') + n, ...parseTheme(JSON.parse(fs.readFileSync(path.join(d, n), 'utf8'))) }); } catch {}
    }
  }
  return out;
}

// ---- Devises et traduction (barre latérale) ----
let rateCache = { at: 0, rates: null };
async function rates() {
  if (rateCache.rates && Date.now() - rateCache.at < 6 * 3600e3) return rateCache.rates;
  try {
    const j = await (await net.fetch('https://api.frankfurter.app/latest?from=EUR', { signal: AbortSignal.timeout(6000) })).json();
    rateCache = { at: Date.now(), rates: { EUR: 1, ...j.rates } };
  } catch {}
  return rateCache.rates;
}
async function translate({ text, from, to }) {
  text = String(text || '').slice(0, 4000);
  if (!text.trim() || !/^[a-z]{2}$/.test(from) || !/^[a-z]{2}$/.test(to)) return '';
  if (ai.hasKey()) {
    try { return await ai.complete([{ role: 'system', content: 'Tu es un traducteur. Réponds uniquement avec la traduction.' }, { role: 'user', content: `Traduis de « ${from} » vers « ${to} » :\n${text}` }]); } catch {}
  }
  try {
    const r = await net.fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 450))}&langpair=${from}|${to}`, { signal: AbortSignal.timeout(8000) });
    return (await r.json()).responseData?.translatedText || 'Traduction indisponible';
  } catch { return 'Traduction indisponible hors ligne.'; }
}

// ---- Mises à jour : un simple fichier version.json sur nitroxyde.fr ----
async function checkUpdate(manual) {
  const s = store.get('settings');
  try {
    const j = await (await net.fetch(s.updateUrl, { signal: AbortSignal.timeout(6000) })).json();
    const cmp = (a, b) => { const x = String(a).split('.'), y = String(b).split('.'); for (let i = 0; i < 3; i++) { const d = (+x[i] || 0) - (+y[i] || 0); if (d) return d; } return 0; };
    if (cmp(j.version, app.getVersion()) > 0 && /^https:\/\//.test(String(j.url))) {
      if (!manual && s.updateSeen === j.version) return;
      s.updateSeen = j.version; store.save('settings');
      const v = await api.toast({ icon: '⬆', title: `Nitroxyde ${j.version} disponible`, text: 'Une nouvelle version est prête à être téléchargée.', ms: 12000, soft: true,
        actions: [{ label: 'Télécharger', value: true }, { label: 'Plus tard', value: false }] });
      if (v === true) shell.openExternal(j.url);
    } else if (manual) api.toast({ icon: '✔', title: 'À jour', text: `Version ${app.getVersion()}`, ms: 3500 });
  } catch { if (manual) api.toast({ icon: '⚠', title: 'Vérification impossible', text: 'Le serveur de mises à jour ne répond pas.', ms: 4500 }); }
}
exports.updateStart = () => setTimeout(() => checkUpdate(false), 10000);

// ---- Commandes des pages internes (version 0.6) ----
async function handle2(e, cmd, arg, s) {
  switch (cmd) {
    case 'wallMenu': {   // clic droit sur un fond : favori, et suppression pour les fonds ajoutés
      const id = String(arg.id), favs = s.wallFavs || [], isFav = favs.includes(id);
      const mine = /^[pv]:/.test(id) && fs.existsSync(user('wallpapers', path.basename(id.slice(2))));
      Menu.buildFromTemplate([
        { label: isFav ? '★ Retirer des favoris' : '☆ Ajouter aux favoris', click: () => { s.wallFavs = isFav ? favs.filter(x => x !== id) : [...favs, id]; store.save('settings'); api.applyLook(); } },
        ...(mine ? [{ type: 'separator' }, { label: 'Supprimer ce fond', click: () => delWall(id) }] : []),
      ]).popup({ window: api.state.win });
      return;
    }
    case 'weather': return weather();
    case 'tasks': return store.get('notes').tasks;
    case 'tasksSet': store.get('notes').tasks = (Array.isArray(arg) ? arg : []).slice(0, 60).map(x => ({ t: String(x.t).slice(0, 120), done: !!x.done })); store.save('notes'); return;
    case 'widgets': return widgets();
    case 'widgetAdd': {
      const r = await dialog.showOpenDialog(api.state.win, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Widget', extensions: ['html', 'htm'] }] });
      if (r.canceled) return;
      await fs.promises.mkdir(user('widgets'), { recursive: true });
      for (const f of r.filePaths.slice(0, 6)) await fs.promises.copyFile(f, user('widgets', path.basename(f)));
      return;
    }
    case 'widgetDel': if (String(arg).startsWith('u:')) { try { fs.unlinkSync(user('widgets', path.basename(String(arg).slice(2)))); } catch {} } return;
    case 'pickVideo': {
      const r = await dialog.showOpenDialog(api.state.win, { properties: ['openFile'], filters: [{ name: 'Vidéos', extensions: ['mp4', 'webm', 'mov', 'm4v'] }] });
      if (r.canceled) return;
      await fs.promises.mkdir(user('wallpapers'), { recursive: true });
      const n = Date.now() + '-' + path.basename(r.filePaths[0]).replace(/[^\w.-]/g, '_');
      await fs.promises.copyFile(r.filePaths[0], user('wallpapers', n));
      s.wall = 'v:' + n; store.save('settings'); api.applyLook();
      return;
    }
    case 'neon':
      if (/^#[0-9a-f]{6}$/i.test(String(arg))) useTheme({ name: 'Néon', light: false, neon: true, vars: { ...solid(arg), bg: '#05030a', bg2: '#0c0818', bg3: '#150f2a', tx: '#f4f0ff', dim: '#8f88b8', line: arg + '66' } });
      return;
    case 'importTheme': {
      const r = await dialog.showOpenDialog(api.state.win, { properties: ['openFile'], filters: [{ name: 'Thème Nitroxyde', extensions: ['json'] }] });
      if (r.canceled) return;
      try {
        const raw = await fs.promises.readFile(r.filePaths[0], 'utf8'), t = parseTheme(JSON.parse(raw));
        await fs.promises.mkdir(user('themes'), { recursive: true });
        await fs.promises.writeFile(user('themes', path.basename(r.filePaths[0])), raw);
        useTheme(t);
      } catch (err) { api.toast({ icon: '⚠', title: 'Thème non importé', text: err.message, ms: 6000 }); }
      return;
    }
    case 'exportTheme': {
      const r = await dialog.showSaveDialog(api.state.win, { defaultPath: 'mon-theme-nitroxyde.json', filters: [{ name: 'Thème Nitroxyde', extensions: ['json'] }] });
      if (r.canceled) return;
      const c = s.theme === 'custom' && s.custom?.vars ? s.custom : null;
      await fs.promises.writeFile(r.filePath, JSON.stringify(c ? { name: c.name, light: c.light, neon: !!c.neon, ...c.vars } : TEMPLATE, null, 2));
      return;
    }
    case 'themes': return readThemes().map(t => ({ id: t.id, name: t.name }));
    case 'themeUse': { const t = readThemes().find(x => x.id === arg); if (t) useTheme(t); return; }
    case 'keyList': return api.actions().map(a => ({ ...a, combo: s.keys[a.id] || a.def }));
    case 'keySet':
      if (api.actions().some(a => a.id === arg.id) && /^[\w+=\-.]{1,40}$/.test(String(arg.combo))) { s.keys[arg.id] = arg.combo; store.save('settings'); }
      return;
    case 'keyReset': s.keys = {}; store.save('settings'); return;
    case 'extList': return (extApi().getAllExtensions?.() || []).map(x => ({ id: x.id, name: x.name, version: x.version, path: x.path }));
    case 'extAdd': {
      const r = await dialog.showOpenDialog(api.state.win, { properties: ['openDirectory'] });
      if (r.canceled) return;
      try {
        await extApi().loadExtension(r.filePaths[0]);
        if (!s.extensions.includes(r.filePaths[0])) s.extensions.push(r.filePaths[0]);
        store.save('settings');
      } catch (err) { api.toast({ icon: '⚠', title: 'Extension non chargée', text: err.message, ms: 6000 }); }
      return;
    }
    case 'extDel': {
      const x = (extApi().getAllExtensions?.() || []).find(y => y.id === arg);
      if (x) { extApi().removeExtension(x.id); s.extensions = s.extensions.filter(p => p !== x.path); store.save('settings'); }
      return;
    }
    case 'profiles': return profiles();
    case 'profileAdd': {
      const n = String(arg).trim().replace(/[^\w -]/g, '').slice(0, 24), j = profiles();
      if (n && !j.list.includes(n)) { j.list.push(n); fs.writeFileSync(profFile(), JSON.stringify(j)); }
      return profiles();
    }
    case 'profileUse': { const j = profiles(); if (j.list.includes(arg)) switchProfile(j, arg); return; }
    case 'rates': return rates();
    case 'translate': return translate(arg || {});
    case 'musicState': {
      const all = tracks(), tt = themeTrack(s), cur = tt || curTrack(s, all);
      return { on: !!s.musicOn, start: !!s.musicStart, auto: !!s.musicAuto, repeat: s.musicRepeat !== false, vol: s.musicVol, track: cur, name: cur ? path.parse(cur).name : '', special: tt ? SPECIAL[s.theme].name : '',
        tracks: all.map(f => ({ path: f, name: path.parse(f).name, user: isUserTrack(f), def: path.parse(f).name === DEFAULT_TRACK })) };
    }
    case 'musicDel': return delMusic(String(arg));
    case 'musicCtl':
      if (arg.op === 'toggle') exports.musicToggle();
      else if (arg.op === 'next') exports.musicNext();
      else if (arg.op === 'vol') { s.musicVol = Math.max(0, Math.min(1, +arg.v || 0)); store.save('settings'); exports.sendMusic(); }
      return;
    case 'musicPlay': if (tracks().includes(arg) && !themeTrack(s)) { s.musicTrack = arg; s.musicOn = true; store.save('settings'); exports.sendMusic(); } return;
    case 'checkUpdate': return checkUpdate(true);
    default: return NOT;
  }
}

// ---- Vraies icônes des services de la barre latérale : lues sur leur page d'accueil, mises en cache ----
const SVC = {
  discord: 'https://discord.com/', whatsapp: 'https://web.whatsapp.com/', telegram: 'https://web.telegram.org/',
  ytmusic: 'https://music.youtube.com/', spotify: 'https://open.spotify.com/', deezer: 'https://www.deezer.com/',
  chatgpt: 'https://chatgpt.com/', gemini: 'https://gemini.google.com/', claude: 'https://claude.ai/',
};
let svcBusy = false;
const absUrl = (h, base) => { try { return new URL(decode(h), base).href; } catch { return ''; } };

async function fetchSvcIcon(id) {
  const res = await net.fetch(SVC[id], { signal: AbortSignal.timeout(7000) });
  const html = (await res.text()).slice(0, 250000), base = res.url || SVC[id];
  const score = t => (/apple-touch/i.test(t) ? 100 : 0) + (/\.svg|image\/svg/i.test(t) ? 90 : 0) + (+((t.match(/sizes=["'](\d+)x/i) || [])[1]) || 16);
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map(m => m[0]).filter(t => /rel=["'][^"']*icon/i.test(t)).sort((a, b) => score(b) - score(a));
  const cands = [...links.map(t => absUrl((t.match(/href=["']([^"']+)["']/i) || [])[1] || '', base)), absUrl('/favicon.ico', base)].filter(Boolean);
  for (const u of cands.slice(0, 4)) {
    try {
      const r = await net.fetch(u, { signal: AbortSignal.timeout(7000) });
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer()), type = (r.headers.get('content-type') || 'image/png').split(';')[0];
      if (buf.length > 100 && buf.length < 120000 && /^image\//.test(type)) return `data:${type};base64,${buf.toString('base64')}`;
    } catch {}
  }
  return '';
}

exports.svcIcons = () => {
  const cache = store.get('svcicons'), out = {};
  for (const id in SVC) out[id] = cache[id] || '';
  if (!svcBusy && Object.values(out).some(v => !v)) {
    svcBusy = true;
    (async () => {
      for (const id in SVC) if (!out[id]) { try { const d = await fetchSvcIcon(id); if (d) { cache[id] = d; store.save('svcicons'); } } catch {} }
      svcBusy = false;
    })();
  }
  return out;
};

// Suppression d'un fond ajouté par l'utilisateur (photo ou vidéo) et de sa miniature
async function delWall(id) {
  const s = store.get('settings'), n = path.basename(id.slice(2));
  try { await fs.promises.unlink(user('wallpapers', n)); } catch {}
  try { await fs.promises.unlink(user('thumbs', n.replace(/[^\w.-]/g, '_') + '.jpg')); } catch {}
  s.wallFavs = (s.wallFavs || []).filter(x => x !== id);
  if (s.wall === id) s.wall = 'off';
  store.save('settings');
  api.applyLook();
}
