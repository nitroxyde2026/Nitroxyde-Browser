const { WebContentsView, ipcMain, Menu, dialog, clipboard, session, app } = require('electron');
const path = require('path');
const store = require('./store');
const vpn = require('./vpn');

// ---- Panneaux déroulants de la barre : menu ☰ et VPN ----
// Une seule petite vue, créée au premier clic et libérée après 1 min fermée.
let api, pop = null, kind = '', hiddenAt = 0, closedAt = 0, hooked = false;
exports.init = a => {
  api = a;
  ipcMain.handle('pop', (e, cmd, arg) => (pop && e.sender === pop.webContents ? command(cmd, arg) : null));
};
const wc = () => api.state.active?.view?.webContents;
const url = () => api.state.active?.url || '';
const WIDTH = { menu: 344, vpn: 372 };

const LANGS = [['fr', 'Français'], ['en', 'Anglais'], ['es', 'Espagnol'], ['de', 'Allemand'], ['it', 'Italien'], ['pt', 'Portugais'], ['nl', 'Néerlandais'],
  ['ar', 'Arabe'], ['tr', 'Turc'], ['pl', 'Polonais'], ['ru', 'Russe'], ['uk', 'Ukrainien'], ['zh-CN', 'Chinois'], ['ja', 'Japonais'], ['ko', 'Coréen'], ['hi', 'Hindi']];

async function ensure() {
  const S = api.state;
  if (!hooked) {   // fermeture dès qu'on clique ailleurs (barre, page, autre fenêtre) ; une liste déroulante du panneau ne le ferme pas
    hooked = true;
    S.win.on('blur', hide);
    S.win.webContents.on('focus', hide);
  }
  if (!pop) {
    pop = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, preload: path.join(__dirname, 'preload.js') } });
    pop.setBackgroundColor('#00000000');
    pop.webContents.loadFile(path.join(__dirname, 'src', 'popup.html'));
    pop.webContents.on('before-input-event', (e, i) => { if (i.type === 'keyDown' && i.key === 'Escape') hide(); });
    S.win.contentView.addChildView(pop);
    await new Promise(r => pop.webContents.once('did-finish-load', r));
    pop.webContents.send('theme', api.look());
  }
}

exports.toggle = async k => {
  // un second clic sur le même bouton ferme le panneau (le clic a déjà provoqué sa fermeture par perte du focus)
  if (kind === k && (pop?.getVisible() || Date.now() - closedAt < 250)) { hide(); return; }
  const S = api.state;
  await ensure();
  kind = k; hiddenAt = 0;
  place(420);
  pop.setVisible(true);
  S.win.contentView.addChildView(pop);   // au-dessus de tout
  pop.webContents.focus();
  pop.webContents.send('pop-open', k, await info());
};
// ---- Suggestions de la barre d'adresse : liste sous le champ, la saisie reste dans la barre ----
let sug = { items: [], sel: -1, rect: null, n: 0, q: '' };
exports.suggest = async ({ q, rect } = {}) => {
  const n = ++sug.n;
  q = String(q || '');
  const items = q.trim() ? await require('./features').suggest2(q, !!api.state.active?.priv) : [];
  if (n !== sug.n) return;   // une frappe plus récente est déjà partie
  if (!items.length) { if (kind === 'suggest') hide(); return; }
  await ensure();
  if (n !== sug.n) return;
  sug = { ...sug, items, sel: -1, rect, q };
  kind = 'suggest'; hiddenAt = 0;
  place(items.length * 38 + 20);
  if (!pop.getVisible()) { pop.setVisible(true); api.state.win.contentView.addChildView(pop); }
  pop.webContents.send('pop-open', 'suggest', { items, sel: -1, q });
};
// Flèches ↑ ↓ depuis la barre : la ligne choisie est surlignée et son texte remplace la saisie
exports.suggestMove = d => {
  if (kind !== 'suggest' || !pop?.getVisible() || !sug.items.length) return null;
  const n = sug.items.length;
  sug.sel += d;
  if (sug.sel < -1) sug.sel = n - 1;
  if (sug.sel > n - 1) sug.sel = -1;   // -1 : retour à la saisie d'origine
  pop.webContents.send('pop-open', 'suggest', { items: sug.items, sel: sug.sel, q: sug.q });
  const it = sug.items[sug.sel];
  return it ? (it.url || it.text) : sug.q;
};
exports.suggestHide = () => { sug.n++; if (kind === 'suggest') hide(); };
function pickSuggestion(i) {
  const it = sug.items[i];
  hide();
  if (!it) return;
  api.go(api.state.win.webContents, it.url || it.text);
  try { api.state.win.webContents.send('url-blur'); } catch {}
}

function place(h) {
  if (!pop) return;
  if (kind === 'suggest' && sug.rect) {   // sous le champ de recherche, à sa largeur
    const [, H] = api.state.win.getContentSize(), r = sug.rect;
    pop.setBounds({ x: Math.round(r.x - 6), y: Math.round(r.y + r.h + 2), width: Math.round(r.w + 12), height: Math.min(Math.round(h), H - r.y - r.h - 10) });
    return;
  }
  const [W, H] = api.state.win.getContentSize(), i = api.insets(), w = WIDTH[kind] || 344;
  const right = i.tabsR + (i.railLeft ? 0 : i.rail) + 6;
  const y = Math.max(40, i.top - 4);
  pop.setBounds({ x: Math.max(8, W - right - w - (kind === 'vpn' ? 40 : 0)), y, width: w, height: Math.min(Math.round(h), H - y - 8) });
}
function hide() { if (pop?.getVisible()) { pop.setVisible(false); hiddenAt = Date.now(); closedAt = Date.now(); } }
exports.hide = hide;
exports.theme = d => { try { pop?.webContents.send('theme', d); } catch {} };
exports.reap = () => {
  if (pop && hiddenAt && Date.now() - hiddenAt > 60000) {
    try { api.state.win.contentView.removeChildView(pop); pop.webContents.close(); } catch {}
    pop = null; hiddenAt = 0;
  }
};

const isTr = u => { try { return new URL(u).hostname.endsWith('.translate.goog'); } catch { return false; } };
function untranslate(u) {   // https://fr-wikipedia-org.translate.goog/x?_x_tr_sl=… → https://fr.wikipedia.org/x
  const x = new URL(u);
  x.hostname = x.hostname.replace(/\.translate\.goog$/, '').replace(/--/g, '\u0000').replace(/-/g, '.').replace(/\u0000/g, '-');
  for (const k of [...x.searchParams.keys()]) if (k.startsWith('_x_tr_')) x.searchParams.delete(k);
  return x.href;
}

async function info() {
  const s = store.get('settings'), w = wc(), u = url();
  return {
    zoom: w ? Math.round(w.getZoomFactor() * 100) : 100, web: /^https?:/.test(u), translated: isTr(u), lang: s.transLang || 'fr', langs: LANGS,
    mode: s.mode, full: api.state.win.isFullScreen(), priv: !!api.state.active?.priv, version: app.getVersion(), netLimit: s.netLimit || 0,
    speaking: !!api.state.active?.speaking, engine: s.engine || 'google', vpn: vpn.state(), profile: api.profile?.() || '', side: !!s.sidebar, keys: api.keys(),
  };
}

// Lecture à voix haute : la sélection, sinon le texte principal de la page, dans la langue de la page
const SPEAK = `(()=>{const s=speechSynthesis;if(s.speaking){s.cancel();return false}
const sel=String(getSelection()).trim();const main=[...document.querySelectorAll('article,main,[role=main]')].sort((a,b)=>b.innerText.length-a.innerText.length)[0]||document.body;
const txt=(sel||main.innerText).replace(/\\s+/g,' ').slice(0,20000);const lang=document.documentElement.lang||navigator.language;
const parts=txt.match(/[^.!?]{1,220}[.!?]?/g)||[];for(const p of parts){const u=new SpeechSynthesisUtterance(p);u.lang=lang;u.rate=1.02;s.speak(u)}return true})()`;

exports.run = (cmd, a) => command(cmd, a);
async function command(cmd, a) {
  const s = store.get('settings'), w = wc();
  switch (cmd) {
    case 'size': place(+a || 400); return;
    case 'pick': pickSuggestion(+a); return;
    case 'engine': s.engine = String(a); store.save('settings'); api.applyLook(); return;
    case 'delHist': {   // retirer une page de l'historique depuis la liste (✕)
      const it = sug.items[+a];
      if (it?.type === 'history') { const h = store.get('history'); store.set('history', h.filter(x => x.url !== it.url)); sug.items.splice(+a, 1); }
      if (!sug.items.length) hide(); else pop.webContents.send('pop-open', 'suggest', { items: sug.items, sel: -1, q: sug.q });
      return;
    }
    case 'close': hide(); return;
    case 'info': return info();
    case 'act': hide(); api.run(String(a)); return;
    case 'page': hide(); api.page(String(a)); return;
    case 'zoom': {
      if (w) { if (a === 0) w.setZoomLevel(0); else api.zoom(w, a > 0 ? 0.5 : -0.5); }
      return w ? Math.round(w.getZoomFactor() * 100) : 100;
    }
    case 'translate': {
      const lang = LANGS.some(l => l[0] === a) ? a : 'fr', t = api.state.active;
      s.transLang = lang; store.save('settings');
      if (!t || !w) return;
      hide();
      const u = isTr(t.url) ? untranslate(t.url) : t.url;
      if (!/^https?:/.test(u)) return;
      t.url = `https://translate.google.com/translate?sl=auto&tl=${encodeURIComponent(lang)}&u=${encodeURIComponent(u)}`;
      w.loadURL(t.url).catch(() => {});
      return;
    }
    case 'original': { const t = api.state.active; if (t && isTr(t.url)) { hide(); t.url = untranslate(t.url); w?.loadURL(t.url).catch(() => {}); } return; }
    case 'mode': require('./extras').setMode(a === 'gaming' ? 'gaming' : 'normal', false); return info();
    case 'netLimit': s.netLimit = Math.max(0, Math.min(1000, +a || 0)); store.save('settings'); exports.applyNetLimit(); return info();
    case 'native': {   // sous-menus riches (sessions, profils) : menu système à côté du panneau
      const items = a === 'sessions' ? require('./workspace').sessionItems() : require('./extras').profileItems();
      Menu.buildFromTemplate(items).popup({ window: api.state.win });
      return;
    }
    case 'copyLink': if (/^https?:/.test(url())) clipboard.writeText(isTr(url()) ? untranslate(url()) : url()); hide(); return;
    case 'source': hide(); if (/^https?:/.test(url())) api.createTab('view-source:' + url()); return;
    case 'savePage': {
      hide();
      if (!w || !/^https?:/.test(url())) return;
      const name = (api.state.active.title || 'page').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'page';
      const r = await dialog.showSaveDialog(api.state.win, { defaultPath: path.join(app.getPath('downloads'), name + '.html'),
        filters: [{ name: 'Page web complète', extensions: ['html'] }, { name: 'Archive web (un seul fichier)', extensions: ['mhtml'] }] });
      if (!r.canceled) w.savePage(r.filePath, r.filePath.endsWith('.mhtml') ? 'MHTML' : 'HTMLComplete')
        .then(() => api.toast({ icon: '💾', title: 'Page enregistrée', text: path.basename(r.filePath), ms: 4000 })).catch(() => {});
      return;
    }
    case 'speak': {
      hide();
      const t = api.state.active;
      if (!w || !/^https?:/.test(url())) return;
      try { t.speaking = await w.executeJavaScript(SPEAK, true); } catch { t.speaking = false; }
      if (t.speaking) w.once('did-start-navigation', () => { t.speaking = false; });
      return;
    }
    case 'clearData': {
      hide();
      const v = await api.toast({ icon: '🧹', title: 'Effacer les données de navigation ?', text: 'Historique, cookies, cache et données des sites. Favoris, mots de passe et réglages sont gardés.', ms: 15000,
        actions: [{ label: 'Effacer', value: true }, { label: 'Annuler', value: false }] });
      if (v === true) { await api.clearData(); api.toast({ icon: '🧹', title: 'Données effacées', ms: 3000 }); }
      return;
    }
    case 'vpn': {
      const r = await vpn.handle(a?.cmd, a?.arg || {});
      if (a?.cmd === 'openApp' || a?.cmd === 'site') hide();
      return r;
    }
  }
}

// Limiteur réseau (comme Opera GX) : bride le débit du navigateur pour laisser la bande passante aux jeux
exports.applyNetLimit = () => {
  const mbit = store.get('settings').netLimit || 0;
  for (const p of api.partitions) {
    const ses = session.fromPartition(p);
    try { mbit ? ses.enableNetworkEmulation({ downloadThroughput: mbit * 125000, uploadThroughput: Math.max(1, mbit / 4) * 125000 }) : ses.disableNetworkEmulation(); } catch {}
  }
};

// ---- Gestionnaire des tâches (Maj+Échap) : mémoire et processeur de chaque onglet et processus ----
exports.procs = () => {
  const ms = app.getAppMetrics(), cores = require('os').cpus().length || 1, mem = m => Math.round((m.memory.privateBytes || m.memory.workingSetSize) / 1024);
  const byPid = new Map(ms.map(m => [m.pid, m]));
  const used = new Set(), rows = [];
  for (const t of api.state.tabs) {
    if (!t.view) { rows.push({ id: t.id, kind: 'tab', name: t.title || t.url, url: t.url, sleeping: true, mem: 0, cpu: 0, active: t === api.state.active }); continue; }
    const pid = t.view.webContents.getOSProcessId(), m = byPid.get(pid);
    const shared = used.has(pid);
    used.add(pid);
    rows.push({ id: t.id, kind: 'tab', name: t.title || t.url, url: t.url, pid, mem: m && !shared ? mem(m) : 0, cpu: m && !shared ? +(m.cpu.percentCPUUsage / cores).toFixed(1) : 0, shared, active: t === api.state.active, audio: t.view.webContents.isCurrentlyAudible() });
  }
  const NAMES = { Browser: 'Navigateur (processus principal)', GPU: 'Carte graphique', Utility: 'Service', Zygote: 'Service', 'Sandbox helper': 'Service', 'Pepper Plugin': 'Module', Unknown: 'Autre' };
  for (const m of ms) if (!used.has(m.pid)) rows.push({ kind: 'sys', name: m.type === 'Tab' ? 'Interface, panneaux et extensions' : (NAMES[m.type] || m.type) + (m.serviceName ? ' · ' + m.serviceName.replace(/^.*\./, '') : m.name ? ' · ' + m.name : ''), pid: m.pid, mem: mem(m), cpu: +(m.cpu.percentCPUUsage / cores).toFixed(1) });
  return { rows, total: rows.reduce((a, r) => a + r.mem, 0), cpu: +rows.reduce((a, r) => a + r.cpu, 0).toFixed(1) };
};
exports.procKill = id => {   // libère l'onglet (il reste dans la barre et se recharge au clic)
  const t = api.state.tabs.find(x => x.id === id);
  if (!t?.view) return;
  if (t === api.state.active) { const o = api.state.tabs.find(x => x !== t); if (o) api.activate(o.id); }
  api.kill(t); api.push();
};
exports.procGo = id => { if (api.state.tabs.some(t => t.id === id)) api.activate(id); };
