const { Menu, WebContentsView, ipcMain } = require('electron');
const path = require('path');
const store = require('./store');

let api, ts = null, tsHidden = 0;
const SPACES = { perso: ['Personnel', '🏠'], gaming: ['Gaming', '🎮'], travail: ['Travail', '💼'], etudes: ['Études', '📚'] };
const COLORS = { Rouge: '#ff5d5d', Orange: '#ff9f43', Jaune: '#ffd93d', Vert: '#2ee59d', Bleu: '#4d7cff', Violet: '#9b5cff', Rose: '#ff5fb0', Gris: '#9aa3ad' };
const tab = id => api.state.tabs.find(t => t.id === id);
const ask = (title, value, ok) => api.toast({ icon: '✎', title, input: { placeholder: title, value }, actions: [{ label: ok, value: true }, { label: 'Annuler', value: false }] });

exports.init = a => {
  api = a;
  ipcMain.handle('ts', (e, cmd, arg) => {
    if (!ts || e.sender !== ts.webContents) return;
    if (cmd === 'list') return api.state.tabs.map(t => ({ id: t.id, title: t.title, url: t.url.startsWith('http') ? t.url : '', space: SPACES[t.space]?.[1] || '' }));
    if (cmd === 'go') { hideTs(); api.activate(arg); }
    if (cmd === 'close') hideTs();
  });
};

// Épinglés d'abord ; les membres d'un groupe restent côte à côte
function place(t) {
  const T = api.state.tabs;
  T.splice(T.indexOf(t), 1);
  const same = T.filter(x => x.space === t.space);
  let at = T.length;
  if (t.pinned) { const f = same.find(x => !x.pinned); at = f ? T.indexOf(f) : same.length ? T.indexOf(same[same.length - 1]) + 1 : T.length; }
  else if (t.group) { const m = same.filter(x => x.group === t.group); at = m.length ? T.indexOf(m[m.length - 1]) + 1 : T.length; }
  T.splice(at, 0, t);
}

// Ce que voit la barre d'onglets : uniquement l'espace courant
exports.view = shown => {
  const S = api.state;
  S.groups = S.groups.filter(g => S.tabs.some(t => t.group === g.id));
  const tabs = S.tabs.filter(t => t.space === S.space).map(t => ({
    id: t.id, title: t.title, icon: t.icon, url: shown(t.url), loading: t.loading, sleeping: !t.view, priv: t.priv, blocked: t.blocked || 0,
    pinned: !!t.pinned, group: t.group || null, audible: !!t.view?.webContents.isCurrentlyAudible(), muted: !!t.view?.webContents.isAudioMuted(),
  }));
  return { tabs, groups: S.groups, space: S.space, spaces: Object.entries(SPACES).map(([id, [name, icon]]) => ({ id, name, icon })), side: S.side };
};

exports.noteActive = t => { (api.state.last ??= {})[t.space] = t.id; };

exports.afterClose = (t, i) => {
  const S = api.state, same = S.tabs.filter(x => x.space === t.space);
  if (S.active !== t) return api.push();
  S.space = t.space;
  if (!same.length) return api.createTab();
  api.activate((same.find(x => S.tabs.indexOf(x) >= i) || same[same.length - 1]).id);
};

function switchSpace(id) {
  const S = api.state;
  S.space = id;
  const t = S.tabs.find(x => x.id === S.last?.[id] && x.space === id) || S.tabs.find(x => x.space === id);
  if (t) api.activate(t.id); else api.createTab();
}
exports.spaceMenu = () => Menu.buildFromTemplate(Object.entries(SPACES).map(([id, [name, icon]]) => ({
  label: `${icon} ${name}`, type: 'radio', checked: api.state.space === id, click: () => switchSpace(id),
}))).popup({ window: api.state.win });

const closeMany = pred => { for (const x of [...api.state.tabs].filter(pred)) api.closeTab(x.id); };
const colors = fn => Object.entries(COLORS).map(([n, c]) => ({ label: n, click: () => fn(c) }));

async function newGroup(t, color) {
  const r = await ask('Nom du groupe', '', 'Créer');
  if (!r || !r.value) return;
  const g = { id: Date.now().toString(36), name: r.text.trim().slice(0, 24) || 'Groupe', color };
  api.state.groups.push(g); t.group = g.id; place(t); api.push();
}

function moveToSpace(t, sid) {
  const S = api.state;
  t.space = sid; t.group = null; place(t);
  if (S.active === t) { const o = S.tabs.find(x => x.space === S.space); if (o) api.activate(o.id); else api.createTab(); }
  api.push();
}

// Clic droit sur un onglet
exports.tabMenu = id => {
  const t = tab(id), S = api.state;
  if (!t) return;
  const wc = t.view?.webContents;
  Menu.buildFromTemplate([
    { label: t.pinned ? 'Désépingler l’onglet' : 'Épingler l’onglet', click: () => { t.pinned = !t.pinned; place(t); api.push(); } },
    { label: wc?.isAudioMuted() ? 'Réactiver le son' : 'Couper le son', enabled: !!wc, click: () => { wc.setAudioMuted(!wc.isAudioMuted()); api.push(); } },
    { label: 'Dupliquer', click: () => api.createTab(t.url, t.priv) },
    { type: 'separator' },
    { label: 'Groupe', submenu: [
      { label: 'Nouveau groupe', submenu: colors(c => newGroup(t, c)) },
      ...S.groups.map(g => ({ label: g.name, type: 'radio', checked: t.group === g.id, click: () => { t.group = g.id; place(t); api.push(); } })),
      ...(t.group ? [{ type: 'separator' }, { label: 'Retirer du groupe', click: () => { t.group = null; place(t); api.push(); } }] : []),
    ] },
    { type: 'separator' },
    { label: 'Fermer les autres onglets', click: () => closeMany(x => x !== t && x.space === t.space && !x.pinned) },
    { label: 'Fermer les onglets à droite', click: () => { const T = S.tabs.filter(x => x.space === t.space), i = T.indexOf(t); closeMany(x => T.indexOf(x) > i && !x.pinned); } },
    { label: 'Fermer l’onglet', click: () => api.closeTab(t.id) },
  ]).popup({ window: S.win });
};

// Clic sur la pastille d'un groupe
exports.groupMenu = gid => {
  const S = api.state, g = S.groups.find(x => x.id === gid);
  if (!g) return;
  Menu.buildFromTemplate([
    { label: 'Renommer le groupe', click: async () => { const r = await ask('Nom du groupe', g.name, 'Renommer'); if (r?.value && r.text.trim()) { g.name = r.text.trim().slice(0, 24); api.push(); } } },
    { label: 'Couleur', submenu: colors(c => { g.color = c; api.push(); }) },
    { label: 'Dissocier les onglets', click: () => { for (const t of S.tabs) if (t.group === gid) t.group = null; api.push(); } },
    { label: 'Fermer le groupe', click: () => closeMany(t => t.group === gid) },
  ]).popup({ window: S.win });
};

exports.mute = id => { const wc = tab(id)?.view?.webContents; if (wc) { wc.setAudioMuted(!wc.isAudioMuted()); api.push(); } };

// ---- Sessions enregistrées ----
async function saveSession() {
  const S = api.state;
  const r = await ask('Nom de la session', new Date().toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), 'Enregistrer');
  if (!r || !r.value) return;
  const tabs = S.tabs.filter(t => !t.priv && t.url.startsWith('http')).map(t => ({ url: t.url, title: t.title, space: t.space, group: t.group, pinned: !!t.pinned }));
  store.get('sessions').push({ name: r.text.trim().slice(0, 40) || 'Session', t: Date.now(), tabs, groups: S.groups.filter(g => tabs.some(t => t.group === g.id)) });
  store.save('sessions');
}
function restoreSession(s) {
  const S = api.state;
  for (const g of s.groups) if (!S.groups.some(x => x.id === g.id)) S.groups.push({ ...g });
  const added = s.tabs.map(x => api.addTab(x));
  for (const t of added) place(t);
  if (added[0]) api.activate(added[0].id);
}
exports.sessionItems = () => {
  const list = store.get('sessions');
  return [
    { label: 'Enregistrer la session actuelle…', click: saveSession },
    ...(list.length ? [{ type: 'separator' }] : []),
    ...list.map((s, i) => ({ label: `${s.name} (${s.tabs.length})`, submenu: [
      { label: 'Restaurer', click: () => restoreSession(s) },
      { label: 'Supprimer', click: () => { list.splice(i, 1); store.save('sessions'); } },
    ] })),
  ];
};

// ---- Session automatique : espaces, groupes et onglets épinglés reviennent après un redémarrage ----
exports.snapshot = () => {
  const S = api.state;
  store.set('session', S.tabs.filter(t => !t.priv && t.url.startsWith('http')).map(t => ({
    url: t.url, title: t.title, space: t.space, group: t.group, pinned: !!t.pinned, on: t === S.active,
  })));
  store.set('spaces', { space: S.space, groups: S.groups });
};
exports.restore = saved => {
  const S = api.state, sp = store.get('spaces');
  S.space = 'perso';
  S.groups = Array.isArray(sp.groups) ? sp.groups : [];
  const added = saved.map(x => ({ x, t: api.addTab(x) }));
  for (const { t } of added) if (t.pinned) place(t);
  const on = added.find(a => a.x.on)?.t, inSpace = added.find(a => a.t.space === S.space)?.t;
  const first = on && on.space === S.space ? on : inSpace;
  if (first) api.activate(first.id); else api.createTab();
};

// ---- Recherche instantanée parmi tous les onglets (Ctrl+K) ----
exports.search = async () => {
  const S = api.state;
  if (!ts) {
    ts = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, preload: path.join(__dirname, 'preload.js') } });
    ts.setBackgroundColor('#00000000');
    ts.webContents.loadFile(path.join(__dirname, 'src', 'tabsearch.html'));
    ts.webContents.on('blur', () => hideTs());
    S.win.contentView.addChildView(ts);
    ts.webContents.once('did-finish-load', () => ts.webContents.send('theme', api.look()));
  }
  if (ts.webContents.isLoading()) await new Promise(r => ts.webContents.once('did-finish-load', r));
  const [w] = S.win.getContentSize();
  ts.setBounds({ x: Math.round((w - 580) / 2), y: 64, width: 580, height: 420 });
  tsHidden = 0;
  ts.setVisible(true);
  S.win.contentView.addChildView(ts);
  ts.webContents.focus();
  ts.webContents.send('ts-open');
};
exports.theme = d => { try { ts?.webContents.send('theme', d); } catch {} };
function hideTs() { ts?.setVisible(false); tsHidden = Date.now(); }
exports.reap = () => {   // libère la vue de recherche après 1 min d'inactivité
  if (ts && tsHidden && Date.now() - tsHidden > 60000) {
    try { api.state.win.contentView.removeChildView(ts); ts.webContents.close(); } catch {}
    ts = null; tsHidden = 0;
  }
};
