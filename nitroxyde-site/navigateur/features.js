const { app, ipcMain, dialog, shell, Menu, clipboard } = require('electron');
const fs = require('fs');
const path = require('path');
const store = require('./store');
const extras = require('./extras');
const dl = require('./dl');
const ICON = { geolocation: '📍', notifications: '🔔', media: '🎥', midi: '🎹', 'clipboard-read': '📋', 'display-capture': '🖥' };

let api;
const dls = [], items = new Map();
const asked = {   // autorisations des sites : mémorisées sur disque
  has: k => k in store.get('perms'),
  get: k => store.get('perms')[k],
  set: (k, v) => { store.get('perms')[k] = v; store.save('perms'); },
};
const ASK = {
  geolocation: 'ta position', notifications: 'les notifications', media: 'la caméra ou le micro',
  midi: 'tes appareils MIDI', 'clipboard-read': 'le presse-papiers', 'display-capture': "l'enregistrement de ton écran",
};

// ---- Favoris et historique ----
exports.isBookmarked = u => store.get('bookmarks').some(b => b.url === u);

exports.toggleBookmark = t => {
  if (!t || !t.url.startsWith('http')) return;
  const b = store.get('bookmarks'), i = b.findIndex(x => x.url === t.url);
  if (i < 0) b.push({ url: t.url, title: t.title, t: Date.now() }); else b.splice(i, 1);
  store.save('bookmarks');
  api.push();
};

exports.addHistory = (url, title) => {
  const h = store.get('history'), last = h[h.length - 1];
  if (last?.url === url) last.t = Date.now();
  else { h.push({ url, title: title || url, t: Date.now() }); if (h.length > 5000) h.splice(0, h.length - 5000); }
  store.save('history');
};

exports.setTitle = (url, title) => {
  const last = store.get('history').at(-1);
  if (last?.url === url) { last.title = title; store.save('history'); }
};

// ---- Téléchargements et autorisations (par session) ----
exports.hookSession = ses => {
  ses.on('will-download', (_, item, wc) => {
    if (dl.intercept(ses, item, wc, dls, items)) return;      // limite de débit active : téléchargement géré par dl.js
    const dir = store.get('settings').downloadDir || app.getPath('downloads'), { name, ext } = path.parse(item.getFilename());
    const kinds = { Images: /^(jpe?g|png|gif|webp|bmp|svg|avif|heic)$/, 'Vidéos': /^(mp4|mkv|avi|mov|webm|wmv)$/, Musique: /^(mp3|wav|flac|ogg|m4a|aac|opus)$/,
      Documents: /^(pdf|docx?|xlsx?|pptx?|txt|odt|csv|epub)$/, Archives: /^(zip|rar|7z|tar|gz|iso)$/, Programmes: /^(exe|msi|dmg|deb|apk|appimage)$/ };
    const ex = ext.slice(1).toLowerCase(), sub = store.get('settings').dlSort ? (Object.keys(kinds).find(k => kinds[k].test(ex)) || 'Autres') : '';
    if (sub) fs.mkdirSync(path.join(dir, sub), { recursive: true });
    let p = path.join(dir, sub, name + ext), n = 1;
    while (fs.existsSync(p)) p = path.join(dir, sub, `${name} (${n++})${ext}`);
    item.setSavePath(p);
    const d = { id: dls.length + 1, name: path.basename(p), path: p, got: 0, total: item.getTotalBytes(), state: 'progress' };
    dls.push(d); items.set(d.id, item);
    if (store.get('settings').mode === 'gaming') { item.pause(); d.state = 'paused'; d.auto = true; }   // mode Gaming : rien ne télécharge pendant la partie
    item.on('updated', (_, st) => { d.got = item.getReceivedBytes(); d.total = item.getTotalBytes(); d.state = st === 'interrupted' ? 'interrupted' : item.isPaused() ? 'paused' : 'progress'; });
    item.once('done', (_, st) => {
      d.state = st; d.got = item.getReceivedBytes(); items.delete(d.id);
      if (st === 'completed') dl.afterDone(d);
    });
  });

  // Position, caméra, micro, notifications… : on demande, puis on retient le choix
  ses.setPermissionRequestHandler(async (wc, perm, cb, det) => {
    if (!ASK[perm]) return cb(true);
    let site = 'Ce site';
    try { site = new URL(det.requestingUrl).hostname; } catch {}
    const key = site + '|' + perm;
    if (!asked.has(key)) {
      const v = await api.toast({ icon: ICON[perm], title: site, text: `veut accéder à ${ASK[perm]}`, ms: 30000,
        actions: [{ label: 'Autoriser', value: true }, { label: 'Refuser', value: false }] });
      if (v !== null) asked.set(key, v);
    }
    cb(asked.get(key) === true);
  });
};

// ---- Menu clic droit ----
exports.hookContents = (wc, t) => wc.on('context-menu', (_, p) => {
  const sep = { type: 'separator' }, m = [];
  if (p.linkURL) m.push(
    { label: 'Ouvrir le lien dans un nouvel onglet', click: () => api.createTab(p.linkURL, t.priv) },
    { label: "Copier l'adresse du lien", click: () => clipboard.writeText(p.linkURL) }, sep);
  if (p.mediaType === 'image') m.push(
    { label: "Enregistrer l'image", click: () => wc.downloadURL(p.srcURL) },
    { label: "Copier l'adresse de l'image", click: () => clipboard.writeText(p.srcURL) }, sep);
  if (p.isEditable) m.push(
    { role: 'cut', label: 'Couper' }, { role: 'copy', label: 'Copier' },
    { role: 'paste', label: 'Coller' }, { role: 'selectAll', label: 'Tout sélectionner' });
  else if (p.selectionText) m.push(
    { role: 'copy', label: 'Copier' },
    { label: `Rechercher « ${p.selectionText.slice(0, 28)} »`, click: () => api.createTab(api.resolve(p.selectionText), t.priv) });
  else if (!p.linkURL) m.push(
    { label: 'Précédent', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() },
    { label: 'Suivant', enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() },
    { label: 'Actualiser', click: () => wc.reload() });
  m.push(sep, { label: 'Inspecter', click: () => wc.inspectElement(p.x, p.y) });
  Menu.buildFromTemplate(m).popup();
});

// ---- Suggestions, sites les plus visités, fond d'écran personnel ----
exports.suggest = q => {
  q = String(q || '').toLowerCase().trim();
  if (q.length < 2) return [];
  const seen = new Set(), out = [];
  for (const x of [...store.get('bookmarks'), ...store.get('history').slice(-1500).reverse()]) {
    if (!seen.has(x.url) && (x.url + ' ' + x.title).toLowerCase().includes(q)) { seen.add(x.url); out.push(x.url); if (out.length === 6) break; }
  }
  return out;
};

function topSites() {
  const n = new Map();
  for (const x of store.get('history').slice(-2000)) {
    try { const h = new URL(x.url).hostname.replace(/^www\./, ''); n.set(h, (n.get(h) || 0) + 1); } catch {}
  }
  return [...n].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([host]) => host);
}

// ---- Pages internes (nitroxyde://history, bookmarks, downloads, settings) ----
exports.init = a => {
  api = a; extras.init(a); dl.init(a);
  ipcMain.handle('pg', async (e, cmd, arg) => {
    const url = e.sender.getURL();
    if (!url.startsWith(api.PAGES) && !url.startsWith(api.NEWTAB) && !url.startsWith(api.WELCOME) && !url.startsWith(api.SIDEHTML)) return;     // réservé à nos pages
    const h = store.get('history'), b = store.get('bookmarks'), d = dls.find(x => x.id === arg);
    switch (cmd) {
      case 'history': {
        const q = String(arg || '').toLowerCase();
        return h.filter(x => !q || (x.url + x.title).toLowerCase().includes(q)).slice(-300).reverse();
      }
      case 'delHistory': store.set('history', h.filter(x => x.t !== arg)); break;
      case 'clearHistory': store.set('history', []); break;
      case 'bookmarks': return b;
      case 'bmFolder': { const x = b.find(y => y.url === arg.url); if (x) { x.folder = String(arg.folder || '').trim().slice(0, 30); store.save('bookmarks'); } break; }
      case 'delBookmark': store.set('bookmarks', b.filter(x => x.url !== arg)); api.push(); break;
      case 'downloads': return dls;
      case 'dlShow': if (d) shell.showItemInFolder(d.path); break;
      case 'dlOpen': if (d) shell.openPath(d.path); break;
      case 'dlCancel': items.get(arg)?.cancel(); break;
      case 'dlPause': items.get(arg)?.pause(); if (d) { d.state = 'paused'; d.auto = false; } break;
      case 'dlResume': items.get(arg)?.resume(); if (d) d.state = 'progress'; break;
      case 'look': return api.look();
      case 'go': api.go(e.sender, String(arg.text ?? arg), arg.engine); break;
      case 'suggest': return exports.suggest(arg);
      case 'top': return topSites();
      case 'clearData': await api.clearData(); break;
      case 'settings': {
        const s = store.get('settings');
        return { ...s, groqKey: undefined, openaiKey: undefined, geminiKey: undefined, claudeKey: undefined,
          hasKeys: { groq: !!s.groqKey, openai: !!s.openaiKey, gemini: !!s.geminiKey, claude: !!s.claudeKey } };
      }
      default: return extras.handle(e, cmd, arg);
      case 'set': {
        const s = store.get('settings');
        if (arg && arg.k in s && typeof s[arg.k] === typeof arg.v) { s[arg.k] = arg.v; store.save('settings'); if (arg.k === 'theme' || arg.k === 'wall') api.applyLook(); if (arg.k.startsWith('music')) extras.sendMusic(); extras.after(arg.k, arg.v); }
        break;
      }
    }
  });
};

// Mode Gaming : met en pause (ou reprend) les téléchargements
exports.pauseDownloads = on => {
  for (const [id, it] of items) {
    const d = dls.find(x => x.id === id);
    if (!d) continue;
    if (on && !it.isPaused()) { it.pause(); d.state = 'paused'; d.auto = true; }
    else if (!on && d.auto) { it.resume(); d.state = 'progress'; d.auto = false; }
  }
};
