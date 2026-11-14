const { app, shell } = require('electron');
const fs = require('fs');
const path = require('path');

let api;
const darkCss = new Map();   // contenu web -> clé du CSS inséré
exports.init = a => { api = a; };
const wc = () => api.state.active?.view?.webContents;

// Mode sombre forcé : inverse les couleurs de la page (images et vidéos restent normales)
exports.dark = async w => {
  w = w || wc();
  if (!w) return;
  if (darkCss.has(w.id)) { await w.removeInsertedCSS(darkCss.get(w.id)).catch(() => {}); darkCss.delete(w.id); return; }
  darkCss.set(w.id, await w.insertCSS('html{filter:invert(1) hue-rotate(180deg)!important;background:#fff}img,video,picture,canvas{filter:invert(1) hue-rotate(180deg)!important}'));
  w.once('did-navigate', () => darkCss.delete(w.id));
};

// Capture de la page entière visible, enregistrée dans Images
exports.screenshot = async w => {
  w = w || wc();
  if (!w) return;
  const img = await w.capturePage();
  const file = path.join(app.getPath('pictures'), `Nitroxyde-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`);
  await fs.promises.writeFile(file, img.toPNG());
  const v = await api.toast({ icon: '📸', title: 'Capture enregistrée', text: path.basename(file), ms: 6000, actions: [{ label: 'Ouvrir', value: 'open' }, { label: 'Dossier', value: 'dir' }] });
  if (v === 'open') shell.openPath(file); else if (v === 'dir') shell.showItemInFolder(file);
};

// Mode lecture : garde l'article, retire menus, pubs et cadres ; un second appel recharge la page
const READER = `(()=>{if(document.getElementById('nx-reader')){location.reload();return 'off'}const best=[...document.querySelectorAll('article,main,[role=main]')].sort((a,b)=>b.innerText.length-a.innerText.length)[0]||document.body;const c=best.cloneNode(true);c.querySelectorAll('script,style,nav,aside,footer,form,iframe,noscript,button,[role=banner],[role=navigation],[aria-hidden=true]').forEach(e=>e.remove());const d=document.createElement('div');d.id='nx-reader';const t=document.createElement('h1');t.textContent=document.title;d.append(t,c);const st=document.createElement('style');st.textContent='body{margin:0;background:#fbfaf6;color:#222;font:19px/1.75 Georgia,serif}#nx-reader{max-width:720px;margin:0 auto;padding:48px 24px}#nx-reader h1{font:700 32px/1.25 system-ui;margin:0 0 24px}#nx-reader img{max-width:100%;height:auto}#nx-reader a{color:#1a5fb4}@media(prefers-color-scheme:dark){body{background:#16171a;color:#e6e6e6}#nx-reader a{color:#8ab4ff}}';document.documentElement.removeAttribute('style');document.documentElement.removeAttribute('class');[...document.body.attributes].forEach(a=>document.body.removeAttribute(a.name));document.head.replaceChildren(st);document.body.replaceChildren(d);window.scrollTo(0,0);return 'on'})()`;
exports.reader = async w => {
  w = w || wc();
  if (!w) return;
  try { await w.executeJavaScript(READER, true); } catch { api.toast({ icon: '📖', title: 'Mode lecture', text: 'Cette page ne peut pas être simplifiée.', ms: 3500 }); }
};

exports.items = () => [
  { label: 'Mode lecture', accelerator: 'Ctrl+Alt+R', click: () => exports.reader() },
  { label: 'Forcer le mode sombre sur la page', accelerator: 'Alt+D', click: () => exports.dark() },
  { label: 'Capture d’écran de la page', accelerator: 'Ctrl+Shift+S', click: () => exports.screenshot() },
];
