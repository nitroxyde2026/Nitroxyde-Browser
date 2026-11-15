const { WebContentsView } = require('electron');
const path = require('path');
const store = require('./store');

let api, tools = null;
const apps = new Map();
const WEB = {
  discord: 'https://discord.com/app', whatsapp: 'https://web.whatsapp.com/', telegram: 'https://web.telegram.org/',
  ytmusic: 'https://music.youtube.com/', spotify: 'https://open.spotify.com/', deezer: 'https://www.deezer.com/',
  chatgpt: 'https://chatgpt.com/', gemini: 'https://gemini.google.com/', claude: 'https://claude.ai/',
};
const MUSIC = ['music', 'ytmusic', 'spotify', 'deezer'], AIS = ['chatgpt', 'gemini', 'claude'];
// Trois cas selon le site :
//  • version téléphone disponible dans un navigateur (YouTube Music) : panneau étroit → version téléphone,
//    panneau élargi au-delà de MOBILE[id] px → version ordinateur (rechargée automatiquement) ;
//  • sites déjà adaptables (Telegram, ChatGPT, Gemini, Claude) : 100 %, ils se réorganisent tout seuls ;
//  • sites sans version téléphone hors de leur appli (Discord, WhatsApp, Spotify, Deezer) : version ordinateur,
//    réduite juste assez pour tenir (jamais sous 70 % pour rester lisible) ; elle grandit quand on élargit.
const MINW = { discord: 800, whatsapp: 720, spotify: 760, deezer: 900, ytmusic: 0, telegram: 0, chatgpt: 0, gemini: 0, claude: 0 };
const MOBILE = { ytmusic: 700 };
exports.DEFW = { discord: 600, whatsapp: 560, spotify: 560, deezer: 600 };   // largeur d'ouverture conseillée (mémorisée ensuite par service)
const MOBILE_UA = `Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Mobile Safari/537.36`;
const widths = new Map(), modes = new Map(), modeT = new Map();
function fit(id, v) {
  const w = widths.get(v) || 440, s = store.get('settings'), user = (s.sideZoom || {})[id] || 1;
  const z = Math.max(0.3, Math.min(2, (MINW[id] ? Math.max(0.7, Math.min(1, w / MINW[id])) : 1) * user));
  if (Math.abs(v.webContents.getZoomFactor() - z) > 0.005) v.webContents.setZoomFactor(z);
  if (MOBILE[id]) {   // bascule téléphone / ordinateur, une fois le glissement de la poignée terminé
    const want = w < MOBILE[id] ? 'mobile' : 'desktop';
    clearTimeout(modeT.get(v));
    if (modes.get(v) !== want) modeT.set(v, setTimeout(() => {
      const wc = v.webContents;
      if (wc.isDestroyed() || modes.get(v) === want) return;
      modes.set(v, want);
      wc.setUserAgent(want === 'mobile' ? MOBILE_UA : wc.session.getUserAgent());
      wc.reload();
    }, modes.has(v) ? 500 : 0));
  }
}
// Ctrl + molette, Ctrl + / Ctrl - / Ctrl 0 dans le panneau : zoom du service, mémorisé
function userZoom(id, v, f) {
  const s = store.get('settings');
  s.sideZoom = s.sideZoom || {};
  s.sideZoom[id] = f === 0 ? 1 : Math.max(0.5, Math.min(2, Math.round((s.sideZoom[id] || 1) * f * 100) / 100));
  store.save('settings'); fit(id, v);
}
exports.init = a => { api = a; };

const hiddenAt = new Map();
const hideAll = () => {
  const now = Date.now();
  for (const v of [tools, ...apps.values()]) if (v) { v.setVisible(false); if (!hiddenAt.has(v)) hiddenAt.set(v, now); }
};
const destroy = v => { try { api.state.win.contentView.removeChildView(v); v.webContents.close(); } catch {} hiddenAt.delete(v); };
// Applications web libérées après 1 min cachées (sauf si elles jouent du son), outils après 2 min
exports.reap = () => {
  const now = Date.now();
  for (const [id, v] of [...apps]) {
    if (hiddenAt.has(v) && now - hiddenAt.get(v) > 60000 && !v.webContents.isCurrentlyAudible()) { destroy(v); apps.delete(id); }
  }
  if (tools && hiddenAt.has(tools) && now - hiddenAt.get(tools) > 120000) { destroy(tools); tools = null; }
};
const current = () => { const id = api.state.side; return WEB[id] ? apps.get(id) : id ? tools : null; };
const headH = () => (MUSIC.includes(api.state.side) || AIS.includes(api.state.side) ? 36 : 0);   // bandeau des sources (musique, assistants)

function createApp(id) {
  const v = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, partition: api.SIDE } });
  v.setBackgroundColor('#ffffff');
  v.webContents.setWindowOpenHandler(({ url }) => { api.createTab(url); return { action: 'deny' }; });
  const wc = v.webContents;
  wc.on('focus', () => require('./popup').hide());
  wc.on('did-finish-load', () => fit(id, v));
  wc.on('did-navigate', () => fit(id, v));
  wc.on('zoom-changed', (_, dir) => userZoom(id, v, dir === 'in' ? 1.1 : 1 / 1.1));
  if (MOBILE[id]) { const w = widths.get(v) || 440, m = w < MOBILE[id] ? 'mobile' : 'desktop'; modes.set(v, m); if (m === 'mobile') wc.setUserAgent(MOBILE_UA); }   // première ouverture directement dans la bonne version
  wc.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown' || !(i.control || i.meta)) return;
    const f = i.key === '0' ? 0 : ['=', '+'].includes(i.key) ? 1.1 : i.key === '-' ? 1 / 1.1 : null;
    if (f !== null) { e.preventDefault(); userZoom(id, v, f); }
  });
  v.webContents.loadURL(WEB[id]).catch(() => {});
  api.state.win.contentView.addChildView(v);
  apps.set(id, v);
  return v;
}

function open(id) {
  const S = api.state, s = store.get('settings');
  hideAll();
  S.side = id;
  if (MUSIC.includes(id)) s.musicSource = id;
  if (AIS.includes(id)) s.aiSource = id;
  store.save('settings');
  let v;
  if (WEB[id]) v = apps.get(id) || createApp(id);
  else {
    if (!tools) {
      tools = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, preload: path.join(__dirname, 'preload.js') } });
      tools.setBackgroundColor('#00000000');
      S.win.contentView.addChildView(tools);
      tools.webContents.once('did-finish-load', () => tools.webContents.send('theme', api.look()));
    }
    tools.webContents.loadURL(api.SIDEHTML + '#' + id).catch(() => {});
    v = tools;
  }
  v.setVisible(true);
  hiddenAt.delete(v);
  if (MINW[id] && !s.sideHint) {   // une seule fois : comment agrandir le panneau
    s.sideHint = true; store.save('settings');
    api.toast({ icon: '↔', title: 'Panneau latéral', text: 'Ce site n’a pas de version téléphone en dehors de son appli : sa version ordinateur est ajustée au panneau. Glisse le bord du panneau pour l’élargir ; Ctrl + molette pour zoomer.', ms: 8000 });
  } else if (id === 'spotify' && !s.spotifyNote) {
    s.spotifyNote = true; store.save('settings');
    api.toast({ icon: 'ℹ', title: 'Spotify', text: 'Le lecteur web de Spotify exige Widevine, absent d’Electron : il peut refuser de lire.', ms: 9000 });
  }
  api.layout(); api.push();
}

// Clic sur une icône : ouvre ou ferme ; « music » et « ai » rouvrent la dernière source utilisée
exports.toggle = id => {
  const S = api.state, s = store.get('settings');
  if (id === 'music') id = MUSIC.includes(S.side) ? S.side : s.musicSource || 'music';
  if (id === 'ai') id = AIS.includes(S.side) ? S.side : s.aiSource || 'chatgpt';
  if (S.side === id) { hideAll(); S.side = null; api.layout(); api.push(); } else open(id);
};
exports.show = id => { if (WEB[id] || ['music', 'notes', 'calc', 'translate', 'downloads'].includes(id)) open(id); };

exports.layout = r => {
  const v = current(), hd = headH();
  if (!v) return;
  v.setBounds({ x: r.x, y: r.y + hd, width: r.width, height: r.height - hd });
  if (WEB[api.state.side] && widths.get(v) !== r.width) { widths.set(v, r.width); fit(api.state.side, v); }
};
exports.theme = d => { try { tools?.webContents.send('theme', d); } catch {} };

// Afficher ou masquer la barre latérale (Ctrl+B)
exports.toggleRail = () => {
  const s = store.get('settings');
  s.sidebar = !s.sidebar; store.save('settings');
  if (!s.sidebar) { hideAll(); api.state.side = null; }
  api.applyLook(); api.push();
};

// Mini lecteur flottant : image dans l'image sur la plus grande vidéo de la page
exports.pip = async () => {
  const wc = api.state.active?.view?.webContents;
  if (!wc) return;
  try {
    const r = await wc.executeJavaScript(`(async()=>{const vs=[...document.querySelectorAll('video')].filter(v=>v.readyState>0).sort((a,b)=>b.videoWidth*b.videoHeight-a.videoWidth*a.videoHeight);const v=vs[0];if(!v)return 'none';if(document.pictureInPictureElement){await document.exitPictureInPicture();return 'exit'}await v.requestPictureInPicture();return 'ok'})()`, true);
    if (r === 'none') api.toast({ icon: '▣', title: 'Mini lecteur', text: 'Aucune vidéo trouvée sur cette page.', ms: 3500 });
  } catch { api.toast({ icon: '▣', title: 'Mini lecteur', text: 'Cette vidéo ne permet pas l’image dans l’image.', ms: 3500 }); }
};
