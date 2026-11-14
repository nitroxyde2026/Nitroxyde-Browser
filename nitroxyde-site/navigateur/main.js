const { app, BrowserWindow, WebContentsView, Menu, ipcMain, session, nativeTheme, screen } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');

// Profils : chaque profil a son propre dossier de données (cookies, historique, favoris, réglages)
global.NX_ROOT = app.getPath('userData');
// Remise à zéro totale : « npm run reset », « --reset », ou bouton des Paramètres (fichier reset.flag) → comme une nouvelle installation
if (process.argv.includes('--reset') || fs.existsSync(path.join(global.NX_ROOT, 'reset.flag'))) {
  let names = [];
  try { names = fs.readdirSync(global.NX_ROOT); } catch {}
  for (const n of names) { try { fs.rmSync(path.join(global.NX_ROOT, n), { recursive: true, force: true, maxRetries: 3 }); } catch {} }
  try { fs.rmSync(path.join(global.NX_ROOT, 'reset.flag'), { force: true }); } catch {}
}
try {
  const cur = JSON.parse(fs.readFileSync(path.join(global.NX_ROOT, 'profile.json'), 'utf8')).current;
  if (cur && cur !== 'principal') app.setPath('userData', path.join(global.NX_ROOT, 'profiles', cur));
} catch {}
const store = require('./store');
const features = require('./features');
const extras = require('./extras');
const adblock = require('./adblock');
const ai = require('./ai');
const sidebar = require('./sidebar');
const workspace = require('./workspace');
const tools = require('./tools');
const memory = require('./memory');
const vpn = require('./vpn');
const passwords = require('./passwords');
const popup = require('./popup');

// Rendu GPU : animations plus fluides, moins de charge CPU
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
// Mémoire : moins de processus de rendu, services Chromium inutiles désactivés
app.commandLine.appendSwitch('renderer-process-limit', '8');
// SpareRendererForSitePerProcess : Chromium garde sinon un processus de rendu vide « au chaud » (~40 Mo pour rien)
app.commandLine.appendSwitch('disable-features', 'Translate,MediaRouter,OptimizationHints,AutofillServerCommunication,SpareRendererForSitePerProcess,InterestFeedContentSuggestions,CertificateTransparencyComponentUpdater');
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');

const PART = 'persist:nitroxyde', SIDE = 'persist:nitroxyde-side';
const PRIV = 'nitroxyde-prive';           // sans "persist:" : rien n'est écrit sur le disque
const FIND_H = 40, AI_W = 400, SIDE_W = 232, RAIL_W = 48, GRIP = 6;              // hauteur de l'interface, puis de la barre de recherche
const NEWTAB = pathToFileURL(path.join(__dirname, 'src', 'newtab.html')).href;
const PAGES = pathToFileURL(path.join(__dirname, 'src', 'pages.html')).href;
const WELCOME = pathToFileURL(path.join(__dirname, 'src', 'welcome.html')).href;
const SIDEHTML = pathToFileURL(path.join(__dirname, 'src', 'side.html')).href;
const ENGINES = {
  duckduckgo: 'https://duckduckgo.com/?q=', google: 'https://www.google.com/search?q=',
  brave: 'https://search.brave.com/search?q=', ecosia: 'https://www.ecosia.org/search?q=',
  startpage: 'https://www.startpage.com/do/search?q=',
};
const BLOCK = new RegExp('^https?://([^/]*\\.)?(' + [
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'googletagservices.com', 'google-analytics.com', 'adservice.google.com',
  'hotjar.com', 'scorecardresearch.com', 'taboola.com', 'outbrain.com', 'adnxs.com', 'adsrvr.org', 'criteo.com', 'criteo.net',
  'amazon-adsystem.com', 'pubmatic.com', 'rubiconproject.com', 'openx.net', 'moatads.com', 'quantserve.com', 'clarity.ms',
  'mixpanel.com', 'fullstory.com', 'mouseflow.com', 'crazyegg.com', 'mc.yandex.ru', 'adform.net', 'casalemedia.com', 'bidswitch.net',
  'smartadserver.com', 'teads.tv', 'ads-twitter.com', 'analytics.tiktok.com', 'ads.linkedin.com', 'advertising.com', '2mdn.net',
  'serving-sys.com', 'everesttech.net', 'demdex.net', 'krxd.net', 'bluekai.com',
].map(d => d.replace(/\./g, '\\.')).join('|') + ')/');
const TRACK = /^(utm_[a-z_]+|fbclid|gclid|msclkid|igshid|mc_eid|yclid)$/i;

const state = { win: null, active: null, tabs: [], find: false, full: false, space: 'perso', groups: [], side: null, last: {}, aiBar: 0 };
const closed = [];
let nextId = 1;

const load = (wc, url) => wc.loadURL(url).catch(() => {});
const page = name => createTab(PAGES + '#' + name);
const zoom = (wc, d) => wc && wc.setZoomLevel(Math.max(-3, Math.min(5, wc.getZoomLevel() + d)));

// Liens nettoyés : paramètres de suivi retirés, HTTPS forcé si l'option est active
function clean(u, priv) {
  try {
    const s = store.get('settings'), x = new URL(u);
    if (!/^https?:$/.test(x.protocol)) return u;
    if (s.strip || priv) for (const k of [...x.searchParams.keys()]) if (TRACK.test(k)) { x.searchParams.delete(k); extras.count('params'); }
    if ((s.https || priv) && x.protocol === 'http:' && !/^(localhost|127\.|\[::1\]|10\.|192\.168\.)/.test(x.hostname)) x.protocol = 'https:';
    return x.href;
  } catch { return u; }
}
const isSearch = q => {
  q = q.trim();
  return !/^[a-z][\w+.-]*:\/\//i.test(q) && !/^(localhost|[\w-]+(\.[\w-]+)+)(:\d+)?(\/.*)?$/i.test(q);
};

// Onglet en veille (restauration de session, sessions enregistrées)
function addTab(x) {
  const t = { id: nextId++, url: x.url, title: x.title || x.url, icon: '', loading: false, last: Date.now(), view: null, priv: false, blocked: 0,
    pinned: !!x.pinned, group: x.group || null, space: 'perso' };
  state.tabs.push(t);
  return t;
}

// Compteur par page : appelé par le bloqueur à chaque requête bloquée
const pushSoon = (() => { let tm; return () => { clearTimeout(tm); tm = setTimeout(push, 250); }; })();
function blockedOn(id) {
  const t = state.tabs.find(x => x.view?.webContents.id === id);
  if (t) { t.blocked = (t.blocked || 0) + 1; pushSoon(); }
}

function resolve(q) {
  q = q.trim();
  if (/^nitroxyde:\/\/newtab/i.test(q)) return NEWTAB;
  if (/^nitroxyde:\/\//i.test(q)) return PAGES + '#' + q.slice(12);
  if (/^[a-z][\w+.-]*:\/\//i.test(q)) return clean(q);
  if (/^(localhost|[\w-]+(\.[\w-]+)+)(:\d+)?(\/.*)?$/i.test(q)) return 'https://' + q;
  return (ENGINES[store.get('settings').engine] || ENGINES.duckduckgo) + encodeURIComponent(q);
}
const shown = u => u.startsWith(PAGES) ? 'nitroxyde://' + u.slice(PAGES.length + 1) : u === NEWTAB || u.startsWith(WELCOME) ? '' : u;

// ---- Thèmes et fond d'écran ----
const BARS = { dark: ['#050506', '#eef2f7'], light: ['#ffffff', '#14171c'], arcade: ['#0a0a14', '#ffd400'], galaxy: ['#0d0830', '#f1ecff'], tron: ['#000000', '#6fefff'] };

const themeBg = () => { const d = look(); return /^#[0-9a-f]{6}/i.test(d.vars?.bg || '') ? d.vars.bg.slice(0, 7) : (BARS[d.theme] || BARS.dark)[0]; };

function look() {
  const s = store.get('settings');
  const theme = s.theme === 'auto' ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light') : s.theme;
  const wallUrl = extras.wallUrl(s);
  const custom = s.theme === 'custom' ? s.custom : null;
  return { theme, pick: s.theme, wall: s.wall, wallUrl, vars: custom?.vars, light: custom ? !!custom.light : theme === 'light', neon: !!custom?.neon || theme === 'tron', cname: custom?.name || '',
    pos: s.tabsPos, rail: s.sidebar ? (s.tabsPos === 'left' ? 'right' : 'left') : '', anim: s.anim && s.mode !== 'gaming', css: s.customCss, accent: s.accent, wallFavs: s.wallFavs };
}

// Applique le thème partout : interface, barre de titre, pages internes, préférence des sites web
function applyLook() {
  const { win } = state, s = store.get('settings');
  if (!win || win.isDestroyed()) return;
  const d = look();
  nativeTheme.themeSource = s.theme === 'auto' ? 'system' : d.light ? 'light' : 'dark';
  const [color, symbolColor] = d.vars ? [d.vars.bg, d.vars.tx] : BARS[d.theme] || BARS.dark;
  try { win.setBackgroundColor(color); win.setTitleBarOverlay({ color, symbolColor, height: s.tabsPos === 'top' ? 40 : 48 }); } catch {}
  win.webContents.send('theme', d);
  toastView?.webContents.send('theme', d);
  ai.theme(d); sidebar.theme(d); workspace.theme(d); popup.theme(d);
  layout();
  for (const t of state.tabs) {
    if (t.view && (t.url.startsWith(PAGES) || t.url.startsWith(NEWTAB))) t.view.webContents.send('theme', d);
  }
}

// Lance une recherche/adresse dans l'onglet qui l'a demandée (barre de la page Nouvel onglet)
function go(sender, text, engine) {
  const t = state.tabs.find(x => x.view?.webContents === sender);
  if (t) { t.url = engine && ENGINES[engine] && isSearch(text) ? ENGINES[engine] + encodeURIComponent(text) : resolve(text); load(t.view.webContents, t.url); if (isSearch(text)) ai.pre(text); }
}

async function clearData() {
  store.set('history', []);
  const s = session.fromPartition(PART);
  await s.clearStorageData();
  await s.clearCache();
}

// Blocage des pubs/traceurs et nettoyage des liens, selon les paramètres
function guard(ses) {
  ses.webRequest.onBeforeRequest((d, cb) => {
    const s = store.get('settings');
    if (s.adblock && BLOCK.test(d.url)) { extras.count('ads'); return cb({ cancel: true }); }
    if (s.https && d.resourceType === 'mainFrame' && d.url.startsWith('http://') && !/^http:\/\/(localhost|127\.|\[::1\]|10\.|192\.168\.)/.test(d.url))
      return cb({ redirectURL: 'https://' + d.url.slice(7) });
    if (s.strip && d.resourceType === 'mainFrame' && /[?&](utm_|fbclid|gclid|msclkid|igshid|mc_eid|yclid)/i.test(d.url)) {
      try {
        const u = new URL(d.url);
        for (const k of [...u.searchParams.keys()]) if (TRACK.test(k)) u.searchParams.delete(k);
        if (u.href !== d.url) { extras.count('params'); return cb({ redirectURL: u.href }); }
      } catch {}
    }
    cb({});
  });
  ses.webRequest.onBeforeSendHeaders((d, cb) => {
    if (store.get('settings').gpc || ses === session.fromPartition(PRIV)) { d.requestHeaders['Sec-GPC'] = '1'; d.requestHeaders.DNT = '1'; }
    cb({ requestHeaders: d.requestHeaders });
  });
  features.hookSession(ses);
}

function push() {
  const { win, active } = state;
  if (!win || win.isDestroyed()) return;
  const nh = active?.view?.webContents.navigationHistory;
  win.webContents.send('state', {
    active: active?.id,
    back: !!nh?.canGoBack(), fwd: !!nh?.canGoForward(),
    star: !!active && features.isBookmarked(active.url),
    ...workspace.view(shown), mode: store.get('settings').mode, vpn: vpn.badge(),
  });
}

// Espace occupé par l'interface selon la position de la barre d'onglets et le panneau IA
// Largeur du panneau latéral : réglable à la souris (poignée), bornée selon la taille de la fenêtre
function panelW() {
  const [width] = state.win.getContentSize();
  return Math.round(Math.max(300, Math.min(store.get('settings').sideW || 440, width * 0.6, 1100)));
}

function insets() {
  const s = store.get('settings'), pos = s.tabsPos, rail = s.sidebar ? RAIL_W : 0, railLeft = pos !== 'left';
  const pw = s.sidebar && state.side ? panelW() : 0, panel = pw ? pw + GRIP : 0, tabsL = pos === 'left' ? SIDE_W : 0, tabsR = pos === 'right' ? SIDE_W : 0, bar = state.aiBar || 0;
  const extra = (state.find ? FIND_H : 0) + bar;
  return { top: (pos === 'top' ? 88 : 48) + extra, extra, bar, bottom: pos === 'bottom' ? 40 : 0, railLeft, rail, panel, pw, tabsL, tabsR,
    left: tabsL + (railLeft ? rail + panel : 0), right: tabsR + (railLeft ? 0 : rail + panel) + (state.ai ? AI_W : 0) };
}

// ---- Notifications animées : une vue transparente au-dessus des pages ----
let toastView, toastQ = Promise.resolve(), toastId = 0, toastIdle = 0;

// La vue des notifications n'est créée qu'au premier besoin et libérée après 90 s d'inactivité
function ensureToast() {
  if (toastView) return toastView;
  toastView = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, preload: path.join(__dirname, 'preload.js') } });
  toastView.setBackgroundColor('#00000000');
  toastView.webContents.once('did-finish-load', () => toastView?.webContents.send('theme', look()));
  toastView.webContents.loadFile(path.join(__dirname, 'src', 'toast.html'));
  toastView.setVisible(false);
  state.win.contentView.addChildView(toastView);
  return toastView;
}
function dropToast() {
  if (!toastView || toastRes.size) return;
  try { state.win.contentView.removeChildView(toastView); toastView.webContents.close(); } catch {}
  toastView = null;
}
const toastRes = new Map();

function layoutToast() {
  if (!toastView) return;
  const [width] = state.win.getContentSize();
  toastView.setBounds({ x: Math.round((width - 460) / 2), y: insets().top + 6, width: 460, height: 84 });
}

// Une notification à la fois ; résout avec la valeur du bouton cliqué, ou null si le délai expire
function toast(d) {
  if (d.soft && store.get('settings').mode === 'gaming') return Promise.resolve(null);   // mode Gaming : seules les alertes importantes passent
  return new Promise(resolve => {
    toastQ = toastQ.then(async () => {
      clearTimeout(toastIdle);
      const wc = ensureToast().webContents, id = ++toastId;
      if (wc.isLoading()) await new Promise(r => wc.once('did-finish-load', r));
      await new Promise(done => {
        toastRes.set(id, (v, clicked, text) => {
          if (!toastRes.delete(id)) return;
          wc.send('toast-hide');
          setTimeout(() => {
            toastView.setVisible(false);
            if (clicked) state.active?.view?.webContents.focus();
            resolve(d.input ? { value: v, text } : v); done();
            toastIdle = setTimeout(dropToast, 90000);
          }, 350);
        });
        layoutToast();
        toastView.setVisible(true);
        state.win.contentView.addChildView(toastView);
        wc.send('toast', { ...d, id });
        if (d.input) wc.focus();
        if (d.ms) setTimeout(() => toastRes.get(id)?.(null, false), d.ms);
      });
    }).catch(() => {});
  });
}

ipcMain.on('toast-answer', (e, id, v, text) => { if (toastView && e.sender === toastView.webContents) toastRes.get(id)?.(v, true, text); });

function layout() {
  layoutToast();
  const { win, active, full } = state;
  if (!active?.view) return;
  const [width, height] = win.getContentSize();
  const i = insets(), hh = height - i.top - i.bottom;
  if (full) active.view.setBounds({ x: 0, y: 0, width, height });
  else active.view.setBounds({ x: i.left, y: i.top, width: width - i.left - i.right, height: hh });
  if (state.side && store.get('settings').sidebar) sidebar.layout({ x: i.railLeft ? i.rail : width - i.tabsR - i.rail - i.pw, y: i.top, width: i.pw, height: hh });
  if (i.pw !== state.pw) { state.pw = i.pw; win.webContents.send('sidew', i.pw); }   // l'interface place la poignée et le bandeau
  if (state.ai) ai.layout({ x: width - i.tabsR - (i.railLeft ? 0 : i.rail + i.panel) - AI_W, y: i.top, width: AI_W, height: hh });
  if (state.aiBar) ai.layoutBar({ x: i.left, y: i.top - i.bar, width: width - i.left - i.right, height: i.bar });
  if (i.extra !== state.extra) { state.extra = i.extra; win.webContents.send('extra', i.extra); }
}

function focusUrl() {
  state.win.webContents.focus();
  state.win.webContents.send('focus-url');
}

function findOpen() {
  if (!state.active?.view) return;
  state.find = true;
  layout();
  state.win.webContents.focus();
  state.win.webContents.send('find', 'open');
}

function findClose() {
  state.find = false;
  state.active?.view?.webContents.stopFindInPage('clearSelection');
  layout();
  state.win.webContents.send('find', 'close');
}

function cycle(d) {
  const { active } = state, tabs = state.tabs.filter(t => t.space === state.space);
  if (tabs.length > 1) activate(tabs[(tabs.indexOf(active) + d + tabs.length) % tabs.length].id);
}

const reopen = () => { const u = closed.pop(); if (u) createTab(u); };

// Raccourcis clavier configurables (Paramètres > Raccourcis) ; ils fonctionnent aussi quand le focus est dans une page web
const wcOf = () => state.active?.view?.webContents;
const ACTIONS = {
  newTab: ['Nouvel onglet', 'Ctrl+T', () => { createTab(); focusUrl(); }],
  reopenTab: ['Rouvrir l’onglet fermé', 'Ctrl+Shift+T', () => reopen()],
  privateTab: ['Nouvel onglet privé', 'Ctrl+Shift+N', () => { createTab(NEWTAB, true); focusUrl(); }],
  closeTab: ['Fermer l’onglet', 'Ctrl+W', () => state.active && closeTab(state.active.id)],
  nextTab: ['Onglet suivant', 'Ctrl+Tab', () => cycle(1)],
  prevTab: ['Onglet précédent', 'Ctrl+Shift+Tab', () => cycle(-1)],
  tabSearch: ['Rechercher parmi les onglets', 'Ctrl+K', () => workspace.search()],
  focusUrl: ['Barre d’adresse', 'Ctrl+L', () => focusUrl()],
  back: ['Page précédente', 'Alt+ArrowLeft', () => wcOf()?.navigationHistory.goBack()],
  forward: ['Page suivante', 'Alt+ArrowRight', () => wcOf()?.navigationHistory.goForward()],
  home: ['Page d’accueil', 'Alt+Home', () => { if (state.active?.view) { state.active.url = NEWTAB; load(wcOf(), NEWTAB); } }],
  reload: ['Actualiser', 'Ctrl+R', () => wcOf()?.reload()],
  bookmark: ['Ajouter aux favoris', 'Ctrl+D', () => features.toggleBookmark(state.active)],
  find: ['Rechercher dans la page', 'Ctrl+F', () => findOpen()],
  ai: ['Assistant IA', 'Ctrl+Shift+A', () => ai.toggle(!state.ai)],
  sidebar: ['Barre latérale', 'Ctrl+B', () => sidebar.toggleRail()],
  pip: ['Mini lecteur vidéo', 'Alt+P', () => sidebar.pip()],
  history: ['Historique', 'Ctrl+H', () => page('history')],
  downloads: ['Téléchargements', 'Ctrl+J', () => page('downloads')],
  print: ['Imprimer', 'Ctrl+P', () => wcOf()?.print()],
  zoomIn: ['Zoom avant', 'Ctrl+=', () => zoom(wcOf(), 0.5)],
  zoomOut: ['Zoom arrière', 'Ctrl+-', () => zoom(wcOf(), -0.5)],
  zoomReset: ['Zoom 100 %', 'Ctrl+0', () => wcOf()?.setZoomLevel(0)],
  devtools: ['Outils développeur', 'F12', () => wcOf()?.toggleDevTools()],
  fullscreen: ['Plein écran', 'F11', () => { state.full = false; state.win.setFullScreen(!state.win.isFullScreen()); }],
  reader: ['Mode lecture', 'Ctrl+Alt+R', () => tools.reader()],
  screenshot: ['Capture d’écran de la page', 'Ctrl+Shift+S', () => tools.screenshot()],
  forceDark: ['Forcer le mode sombre sur la page', 'Alt+D', () => tools.dark()],
  savePage: ['Enregistrer la page', 'Ctrl+S', () => popup.run('savePage')],
  source: ['Code source de la page', 'Ctrl+U', () => popup.run('source')],
  speak: ['Lire la page à voix haute', 'Ctrl+Shift+U', () => popup.run('speak')],
  translate: ['Traduire la page', 'Alt+T', () => popup.run('translate', store.get('settings').transLang || 'fr')],
  tasks: ['Gestionnaire des tâches', 'Shift+Escape', () => page('tasks')],
  passwords: ['Mots de passe', 'Ctrl+Shift+P', () => page('passwords')],
  menu: ['Menu principal', 'Alt+F', () => popup.toggle('menu')],
  vpn: ['Panneau VPN', 'Alt+V', () => popup.toggle('vpn')],
  help: ['Aide', 'F1', () => createTab('https://nitroxyde.fr/aide')],
  quit: ['Quitter', 'Ctrl+Shift+Q', () => app.quit()],
};
const combo = i => [i.control || i.meta ? 'Ctrl' : '', i.alt ? 'Alt' : '', i.shift ? 'Shift' : '', i.key.length === 1 ? i.key.toUpperCase() : i.key].filter(Boolean).join('+');
function keys(e, i) {
  if (i.type !== 'keyDown') return;
  if (i.key === 'Escape' && state.find) { e.preventDefault(); return findClose(); }
  let c = combo(i);
  if (/^Ctrl(\+Shift)?\+\+$/.test(c)) c = 'Ctrl+=';
  const mine = store.get('settings').keys || {};
  for (const [id, [, def, fn]] of Object.entries(ACTIONS)) {
    if ((mine[id] || def) === c) { e.preventDefault(); fn(); return; }
  }
}

function spawn(t) {
  const view = new WebContentsView({
    webPreferences: { sandbox: true, contextIsolation: true, partition: t.priv ? PRIV : PART, preload: path.join(__dirname, 'preload.js') },
  });
  const paint = u => { try { view.setBackgroundColor(u.startsWith('file:') ? themeBg() : '#ffffff'); } catch {} };   // pages internes : couleur du thème (pas de flash blanc) ; sites : blanc
  paint(t.url);
  const wc = view.webContents;
  t.view = view;
  wc.setWindowOpenHandler(({ url }) => { createTab(clean(url, t.priv), t.priv); return { action: 'deny' }; });
  wc.on('before-input-event', keys);
  const nav = (e, url) => { const c = clean(url, t.priv); if (c !== url) { e.preventDefault(); load(wc, c); } };
  wc.on('will-navigate', nav);
  wc.on('will-redirect', nav);
  wc.on('did-start-navigation', (e, url, inPlace, isMain) => { if ((e.isMainFrame ?? isMain) && !(e.isSameDocument ?? inPlace)) { t.blocked = 0; paint(e.url || url); } });
  wc.once('did-finish-load', () => extras.priority(wc));
  wc.on('page-title-updated', (_, title) => { t.title = title; if (!t.priv) features.setTitle(t.url, title); push(); });
  wc.on('page-favicon-updated', (_, icons) => {
    t.icon = icons[0] || '';
    if (!t.priv && t.icon.startsWith('http')) extras.setIcon(t.url, t.icon);
    push();
  });
  wc.on('did-start-loading', () => { t.loading = true; push(); });
  wc.on('did-stop-loading', () => { t.loading = false; push(); });
  wc.on('did-navigate', (_, u) => { t.url = u; if (!t.priv && u.startsWith('http')) features.addHistory(u, ''); push(); });
  wc.on('did-navigate-in-page', (_, u, main) => { t.url = u; if (main && !t.priv && u.startsWith('http')) features.addHistory(u, ''); push(); });
  wc.on('found-in-page', (_, r) => state.win.webContents.send('find', { n: r.activeMatchOrdinal, total: r.matches }));
  // Vidéo en plein écran (YouTube…) : la fenêtre passe en plein écran, l'interface disparaît
  wc.on('enter-html-full-screen', () => { state.full = true; state.win.setFullScreen(true); layout(); });
  wc.on('leave-html-full-screen', () => { state.full = false; state.win.setFullScreen(false); layout(); });
  wc.on('audio-state-changed', () => extras.duck(state.tabs.some(x => x.view?.webContents.isCurrentlyAudible())));
  features.hookContents(wc, t);
  vpn.webrtc(wc);
  wc.on('focus', () => popup.hide());
  // Onglet planté : il se recharge au clic au lieu de rester blanc ; page bloquée : on propose de l'arrêter
  wc.on('render-process-gone', async (_, d) => {
    if (d.reason === 'clean-exit' || !t.view) return;
    const was = t === state.active;
    kill(t); t.loading = false; push();
    if (!was) return;
    const v = await toast({ icon: '💥', title: 'Cet onglet a planté', text: d.reason === 'oom' ? 'Mémoire insuffisante pour cette page.' : 'La page s’est arrêtée de façon inattendue.', ms: 12000,
      actions: [{ label: 'Recharger', value: true }, { label: 'Fermer l’onglet', value: 'close' }] });
    if (v === 'close') closeTab(t.id); else if (v === true && state.tabs.includes(t)) activate(t.id);
  });
  wc.on('unresponsive', async () => {
    if (t !== state.active) return;
    const v = await toast({ icon: '⏳', title: 'La page ne répond plus', text: t.title, ms: 15000, actions: [{ label: 'Attendre', value: false }, { label: 'Arrêter la page', value: true }] });
    if (v === true && t.view) { kill(t); push(); activate(t.id); }
  });
  state.win.contentView.addChildView(view);
  view.setVisible(false);
  if (toastView) state.win.contentView.addChildView(toastView);   // la notification reste au-dessus
  load(wc, t.url);
}

// Libère entièrement la mémoire d'un onglet (l'onglet reste dans la barre)
function kill(t) {
  if (!t.view) return;
  state.win.contentView.removeChildView(t.view);
  t.view.webContents.close();
  t.view = null;
}

function createTab(url = NEWTAB, priv = false) {
  const t = { id: nextId++, url, title: priv ? 'Navigation privée' : 'Nouvel onglet', icon: '', loading: false, last: Date.now(), view: null, priv, blocked: 0, space: state.space, pinned: false, group: null };
  state.tabs.push(t);
  activate(t.id);
}

function activate(id) {
  const t = state.tabs.find(x => x.id === id);
  if (!t) return;
  if (t.space) state.space = t.space;
  if (state.find) findClose();
  if (state.active) state.active.last = Date.now();
  if (!t.view) spawn(t);               // réveille un onglet en veille
  state.active = t;
  workspace.noteActive(t);
  ai.barTab(t.id);
  for (const o of state.tabs) o.view?.setVisible(o === t);
  layout();
  t.view.webContents.focus();
  push();
}

function closeTab(id) {
  const i = state.tabs.findIndex(t => t.id === id);
  if (i < 0) return;
  const [t] = state.tabs.splice(i, 1);
  if (!t.priv && t.url.startsWith('http')) closed.push(t.url);
  // Fermeture fluide : la page disparaît tout de suite, l'onglet voisin s'affiche, et la destruction (coûteuse)
  // se fait après l'animation de la barre d'onglets, pour ne pas figer l'affichage pendant qu'elle joue
  const v = t.view;
  t.view = null;
  if (v) { try { v.webContents.setAudioMuted(true); v.setVisible(false); } catch {} }
  workspace.afterClose(t, i);
  setTimeout(() => {
    if (v) { try { state.win.contentView.removeChildView(v); v.webContents.close(); } catch {} }
    if (t.priv && !state.tabs.some(x => x.priv)) {   // plus aucun onglet privé : on efface tout
      const s = session.fromPartition(PRIV);
      s.clearStorageData(); s.clearCache();
    }
  }, 350);
}

ipcMain.handle('nav', (e, cmd, arg) => {
  const { win, active } = state;
  if (!win || e.sender !== win.webContents) return;   // seule notre interface peut commander
  const wc = active?.view?.webContents;
  switch (cmd) {
    case 'go': if (wc) { const q = String(arg); active.url = resolve(q); load(wc, active.url); wc.focus(); if (isSearch(q)) ai.pre(q); } break;
    case 'back': wc?.navigationHistory.goBack(); break;
    case 'forward': wc?.navigationHistory.goForward(); break;
    case 'reload': wc?.reload(); break;
    case 'new': createTab(); focusUrl(); break;
    case 'close': closeTab(arg); break;
    case 'activate': activate(arg); break;
    case 'star': features.toggleBookmark(active); break;
    case 'find': if (wc) arg.text ? wc.findInPage(arg.text, { forward: arg.fwd, findNext: arg.next }) : wc.stopFindInPage('clearSelection'); break;
    case 'findclose': findClose(); break;
    case 'suggest': return features.suggest(arg);
    case 'music': extras.musicMenu(); break;
    case 'musicNext': extras.musicNext(); break;
    case 'musicToggle': extras.musicToggle(); break;
    case 'home': if (wc) { active.url = NEWTAB; load(wc, NEWTAB); } break;
    case 'shield': extras.shieldMenu(); break;
    case 'ai': ai.toggle(!state.ai); break;
    case 'ram': return extras.tabRam(arg);
    case 'side': sidebar.toggle(String(arg)); break;
    case 'pip': sidebar.pip(); break;
    case 'tabMenu': workspace.tabMenu(arg); break;
    case 'groupMenu': workspace.groupMenu(arg); break;
    case 'spaceMenu': workspace.spaceMenu(); break;
    case 'mute': workspace.mute(arg); break;
    case 'perf': return extras.perf();
    case 'svcIcons': return extras.svcIcons();
    case 'sideSet': sidebar.show(String(arg)); break;
    case 'sideW': {   // glisser la poignée : nouvelle largeur du panneau latéral (double-clic = largeur par défaut)
      const s = store.get('settings');
      s.sideW = arg === 'reset' ? 440 : Math.round(+arg) || 440;
      s.sideW = Math.max(300, Math.min(s.sideW, win.getContentSize()[0] * 0.6, 1100));
      store.save('settings'); layout();
      break;
    }
    case 'menu': popup.toggle('menu'); break;
    case 'vpn': popup.toggle('vpn'); break;
  }
});

app.whenReady().then(() => {
  for (const p of [PART, PRIV]) guard(session.fromPartition(p));
  // Identité « navigateur Chrome » : sans le mot Electron, Google, Discord ou WhatsApp acceptent la connexion plus souvent
  const UA = session.defaultSession.getUserAgent().replace(/\s*Electron\/\S+/, '').replace(/\s*nitroxyde[\s-]?(browser|navigation)\/\S+/i, '');
  for (const p of [PART, PRIV, SIDE]) { const ses = session.fromPartition(p); ses.setUserAgent(UA); ses.setSpellCheckerEnabled(false); }   // le correcteur orthographique coûte de la mémoire
  extras.cookieGuard(session.fromPartition(PART), false);
  extras.cookieGuard(session.fromPartition(PRIV), true);
  extras.loadExtensions();
  features.init({ state, PAGES, NEWTAB, WELCOME, createTab, push, resolve, go, look, applyLook, clearData, toast, layout,
    pauseDownloads: on => features.pauseDownloads(on), reloadActive: () => state.active?.view?.webContents.reload(), SIDEHTML,
    actions: () => Object.entries(ACTIONS).map(([id, [label, def]]) => ({ id, label, def })) });
  nativeTheme.on('updated', () => { if (store.get('settings').theme === 'auto') applyLook(); });
  const hub = { state, layout: () => layout(), look, applyLook, push, toast, createTab, closeTab, activate, addTab, kill, shown, SIDE, SIDEHTML, NEWTAB, PAGES,
    insets: () => insets(), page, zoom, clearData, partitions: [PART, PRIV, SIDE], run: id => ACTIONS[id]?.[2](),
    keys: () => { const mine = store.get('settings').keys || {}; return Object.fromEntries(Object.entries(ACTIONS).map(([id, [, def]]) => [id, mine[id] || def])); },
    profile: () => extras.profileName?.() || '' };
  ai.init(hub); sidebar.init(hub); workspace.init(hub); tools.init(hub); memory.init(hub);
  vpn.init(hub); passwords.init(hub); popup.init(hub); popup.applyNetLimit();
  adblock.init({ count: extras.count, blockedOn, partitions: [PART, PRIV] });
  extras.applyDns();
  {   // migration : deux modes seulement, et l'écran d'accueil est proposé une fois
    const s = store.get('settings');
    if (s.mode !== 'gaming') s.mode = 'normal';
    if ((s.welcomeV || 0) < 2) { s.onboarded = false; s.welcomeV = 2; store.save('settings'); }
    // réglages laissés par les anciens préréglages de modes : actualités rétablies, CPU/RAM réservés au Gaming, veille à 3 min
    if ((s.tuneV || 0) < 1) { s.tuneV = 1; s.news = true; s.perf = false; s.anim = true; s.sleepMin = 3; store.save('settings'); }
    // 0.9 : musique de base au démarrage, widgets « Jeux » et « Favoris » retirés du nouvel onglet
    if ((s.tuneV || 0) < 2) { s.tuneV = 2; s.musicStart = true; if (s.wall === 'auto' || s.wall === 'none') s.wall = 'off'; delete s.games; delete s.bmWidget; delete s.bmView; store.save('settings'); }
  }

  // Fenêtre : taille, position, plein écran et agrandissement retrouvés au lancement (et après un redémarrage)
  const ws = store.get('settings').winState || {};
  const onScreen = ws.width && screen.getAllDisplays().some(d => { const a = d.workArea; return ws.x < a.x + a.width - 80 && ws.x + ws.width > a.x + 80 && ws.y >= a.y - 20 && ws.y < a.y + a.height - 80; });
  const win = state.win = new BrowserWindow({
    ...(onScreen ? { x: ws.x, y: ws.y, width: ws.width, height: ws.height } : { width: 1280, height: 800 }), minWidth: 640, minHeight: 400,
    show: false, backgroundColor: '#050506', icon: path.join(__dirname, 'src', 'icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#050506', symbolColor: '#eef2f7', height: 40 },
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, autoplayPolicy: 'no-user-gesture-required' },
  });
  win.on('resize', layout);
  if (ws.max) win.maximize();
  if (ws.full) win.setFullScreen(true);
  const saveWin = () => {
    if (win.isDestroyed() || win.isMinimized()) return;
    const b = win.getNormalBounds(), s = store.get('settings');
    s.winState = { x: b.x, y: b.y, width: b.width, height: b.height, max: win.isMaximized(), full: win.isFullScreen() && !state.full };   // le plein écran d'une vidéo ne compte pas
    store.save('settings');
  };
  for (const ev of ['resize', 'move', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) win.on(ev, () => { clearTimeout(win._ws); win._ws = setTimeout(saveWin, 400); });
  win.on('close', () => { saveWin(); store.flush(); });   // écrit tout de suite : l'appli se ferme juste après
  win.webContents.on('before-input-event', keys);
  const intro = store.get('settings').intro;   // thème spécial tout juste activé : animation d'intro au redémarrage
  win.once('ready-to-show', () => { if (!intro) win.show(); });
  if (intro) setTimeout(() => { if (!win.isVisible()) win.show(); }, 2500);   // sécurité
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.webContents.once('did-finish-load', () => {
    applyLook();
    extras.musicBoot(); extras.syncStart(); extras.applyMode(); adblock.start(); extras.updateStart();
    // Restauration : les onglets reviennent en veille, seul l'onglet actif se charge
    const saved = store.get('session');
    if (store.get('settings').restore && saved.length) {
      workspace.restore(saved);
    } else createTab();
    if (!store.get('settings').onboarded) createTab(WELCOME);   // premier lancement : choix du mode
    if (intro) playIntro(intro);
  });

  // Mise en veille des onglets inactifs (délai réglable, 0 = jamais)
  setInterval(() => {
    const min = extras.sleepMin();
    if (!min) return;
    let changed = false;
    for (const t of state.tabs) {
      if (t !== state.active && t.view && Date.now() - t.last > min * 60000) { kill(t); changed = true; }
    }
    if (changed) push();
  }, 30000);
});

// Animation d'intro d'un thème spécial : une vue plein écran au-dessus de tout, libérée dès la fin
function playIntro(id) {
  const s = store.get('settings');
  s.intro = ''; store.save('settings');
  const { win } = state;
  const v = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true } });
  v.setBackgroundColor('#000000');
  const fit = () => { const [width, height] = win.getContentSize(); v.setBounds({ x: 0, y: 0, width, height }); };
  fit(); win.on('resize', fit);
  win.contentView.addChildView(v);
  v.webContents.once('did-finish-load', () => { if (!win.isVisible()) win.show(); });
  v.webContents.loadFile(path.join(__dirname, 'src', 'intro.html'), { hash: id });
  let done = false;
  const end = () => {
    if (done) return; done = true;
    win.off('resize', fit);
    try { win.contentView.removeChildView(v); v.webContents.close(); } catch {}
    state.active?.view?.webContents.focus();
  };
  v.webContents.on('page-title-updated', (_, t) => { if (t === 'fin') end(); });   // la page signale sa fin par son titre
  setTimeout(end, 6000);
}

app.on('before-quit', () => {
  workspace.snapshot();
  extras.syncNow();
  store.flush();
});
app.on('window-all-closed', () => app.quit());
