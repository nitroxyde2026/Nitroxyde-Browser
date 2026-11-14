const { app, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const store = require('./store');

let api;
const sleep = ms => new Promise(r => setTimeout(r, ms));
exports.init = a => { api = a; };

const KINDS = { Images: /^(jpe?g|png|gif|webp|bmp|svg|avif|heic)$/, 'Vidéos': /^(mp4|mkv|avi|mov|webm|wmv)$/, Musique: /^(mp3|wav|flac|ogg|m4a|aac|opus)$/,
  Documents: /^(pdf|docx?|xlsx?|pptx?|txt|odt|csv|epub)$/, Archives: /^(zip|rar|7z|tar|gz|iso)$/, Programmes: /^(exe|msi|dmg|deb|apk|appimage)$/ };

function target(filename) {
  const s = store.get('settings'), dir = s.downloadDir || app.getPath('downloads'), { name, ext } = path.parse(filename);
  const ex = ext.slice(1).toLowerCase(), sub = s.dlSort ? (Object.keys(KINDS).find(k => KINDS[k].test(ex)) || 'Autres') : '';
  fs.mkdirSync(path.join(dir, sub), { recursive: true });
  let p = path.join(dir, sub, name + ext), n = 1;
  while (fs.existsSync(p)) p = path.join(dir, sub, `${name} (${n++})${ext}`);
  return p;
}

// Avec une limite de débit, le téléchargement natif est remplacé par le nôtre (flux lu à la vitesse choisie)
exports.intercept = (ses, item, wc, dls, items) => {
  const lim = store.get('settings').dlLimitKB, url = item.getURL();
  if (!lim || !/^https?:/.test(url)) return false;
  const filename = item.getFilename();
  item.cancel();
  start(ses, url, filename, lim, dls, items);
  return true;
};

async function start(ses, url, filename, lim, dls, items) {
  const p = target(filename), ctrl = new AbortController();
  const d = { id: dls.length + 1, name: path.basename(p), path: p, got: 0, total: 0, state: 'progress', paused: false };
  dls.push(d);
  items.set(d.id, { pause: () => { d.paused = true; }, resume: () => { d.paused = false; }, isPaused: () => d.paused, cancel: () => ctrl.abort() });
  try {
    const res = await ses.fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    d.total = +res.headers.get('content-length') || 0;
    const out = fs.createWriteStream(p), reader = res.body.getReader(), rate = lim * 1024, t0 = Date.now();
    for (;;) {
      while (d.paused && !ctrl.signal.aborted) await sleep(200);
      const { done, value } = await reader.read();
      if (done) break;
      if (!out.write(value)) await new Promise(r => out.once('drain', r));
      d.got += value.length;
      const wait = d.got / rate * 1000 - (Date.now() - t0);
      if (wait > 0) await sleep(wait);
    }
    await new Promise(r => out.end(r));
    d.state = 'completed'; items.delete(d.id);
    exports.afterDone(d);
  } catch {
    d.state = ctrl.signal.aborted ? 'cancelled' : 'interrupted'; items.delete(d.id);
    try { fs.unlinkSync(p); } catch {}
  }
}

// Analyse locale : SHA-256, extensions à risque, double extension, et Windows Defender quand il est présent
function analyse(d) {
  const risky = /\.(exe|msi|bat|cmd|scr|ps1|vbs|jar|lnk|com|apk|dmg|pkg)$/i.test(d.path);
  const dbl = /\.(pdf|docx?|xlsx?|pptx?|jpe?g|png|gif|txt|zip|mp3|mp4)\.(exe|scr|bat|cmd|vbs|js|jar)$/i.test(d.path);
  d.risk = dbl ? 'danger' : risky ? 'warn' : 'ok';
  return Promise.all([
    new Promise(res => {
      const h = crypto.createHash('sha256');
      fs.createReadStream(d.path).on('data', c => h.update(c)).on('end', () => { d.sha256 = h.digest('hex'); res(); }).on('error', res);
    }),
    new Promise(res => {
      const mp = process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Windows Defender', 'MpCmdRun.exe');
      if (process.platform !== 'win32' || !mp || !fs.existsSync(mp)) { d.scan = 'n/a'; return res(); }
      execFile(mp, ['-Scan', '-ScanType', '3', '-File', d.path, '-DisableRemediation'], { timeout: 120000, windowsHide: true }, err => {
        d.scan = !err ? 'clean' : err.code === 2 ? 'threat' : 'unknown';
        if (d.scan === 'threat') d.risk = 'danger';
        res();
      });
    }),
  ]);
}

exports.afterDone = async d => {
  api.toast({ icon: '⬇', title: 'Téléchargement terminé', text: d.name, ms: 6000, soft: true, actions: [{ label: 'Ouvrir', value: 'open' }, { label: 'Dossier', value: 'dir' }] })
    .then(v => { if (v === 'open') shell.openPath(d.path); else if (v === 'dir') shell.showItemInFolder(d.path); });
  try { await analyse(d); } catch { return; }
  if (d.risk !== 'ok') {
    api.toast({ icon: '⚠', title: d.risk === 'danger' ? 'Fichier dangereux' : 'Fichier à vérifier', ms: 10000,
      text: d.scan === 'threat' ? `${d.name} : menace détectée par l’antivirus` : `${d.name} : type de fichier à risque`,
      actions: [{ label: 'Voir le dossier', value: 'dir' }] }).then(v => { if (v === 'dir') shell.showItemInFolder(d.path); });
  }
};
