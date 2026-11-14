const { ipcMain, safeStorage, dialog, clipboard } = require('electron');
const fs = require('fs');
const store = require('./store');

// ---- Gestionnaire de mots de passe ----
// Les identifiants sont chiffrés par Windows (safeStorage / DPAPI) et liés au site exact (origine) où ils ont été saisis.
// Une page ne reçoit jamais les mots de passe d'un autre site : l'origine est vérifiée ici, pas dans la page.
let api;
const enc = t => safeStorage.isEncryptionAvailable() ? 'e:' + safeStorage.encryptString(t).toString('base64') : 'p:' + Buffer.from(t).toString('base64');
const dec = t => { try { return t.startsWith('e:') ? safeStorage.decryptString(Buffer.from(t.slice(2), 'base64')) : Buffer.from(t.slice(2), 'base64').toString(); } catch { return ''; } };
const list = () => store.get('passwords');
const originOf = e => { try { const o = e.senderFrame?.origin || new URL(e.sender.getURL()).origin; return /^https?:\/\//.test(o) ? o : ''; } catch { return ''; } };
const tabOf = wc => api.state.tabs.find(t => t.view?.webContents === wc);
const never = () => (store.get('settings').pwNever ||= []);

exports.init = a => {
  api = a;
  // La page demande quels comptes existent pour son propre site (les noms d'utilisateur seulement)
  ipcMain.handle('pw', (e, cmd, arg) => {
    const origin = originOf(e), t = tabOf(e.sender);
    if (!origin || !t || t.priv || !store.get('settings').pwOn) return null;
    if (cmd === 'accounts') return list().filter(x => x.origin === origin).map(x => x.user);
    if (cmd === 'fill') {   // déclenché par un clic de l'utilisateur sur la suggestion
      const x = list().find(y => y.origin === origin && y.user === String(arg));
      if (x) { x.used = Date.now(); store.save('passwords'); return dec(x.pass); }
    }
    return null;
  });
  // Formulaire envoyé avec un mot de passe : proposer de l'enregistrer (ou de le mettre à jour)
  ipcMain.on('pw-save', async (e, d) => {
    const origin = originOf(e), t = tabOf(e.sender), s = store.get('settings');
    if (!origin || !t || t.priv || !s.pwOn || !d || typeof d.pass !== 'string' || !d.pass || d.pass.length > 400) return;
    if (never().includes(origin)) return;
    const user = String(d.user || '').slice(0, 200), all = list(), host = new URL(origin).hostname.replace(/^www\./, '');
    const old = all.find(x => x.origin === origin && x.user === user);
    if (old && dec(old.pass) === d.pass) return;
    const v = await api.toast({ icon: '🔑', title: old ? 'Mettre à jour le mot de passe ?' : 'Enregistrer le mot de passe ?', text: `${host}${user ? ' · ' + user : ''}`, ms: 20000,
      actions: [{ label: old ? 'Mettre à jour' : 'Enregistrer', value: 'ok' }, { label: 'Jamais pour ce site', value: 'never' }, { label: 'Non', value: false }] });
    if (v === 'never') { never().push(origin); store.save('settings'); return; }
    if (v !== 'ok') return;
    if (old) { old.pass = enc(d.pass); old.at = Date.now(); } else all.push({ origin, user, pass: enc(d.pass), at: Date.now(), used: 0 });
    store.save('passwords');
  });
};

// Commandes de la page Paramètres › Mots de passe
exports.handle = async (cmd, arg) => {
  const all = list();
  switch (cmd) {
    case 'pwList': return all.map((x, i) => ({ i, origin: x.origin, host: x.origin.replace(/^https?:\/\/(www\.)?/, ''), user: x.user, at: x.at, used: x.used }))
      .sort((a, b) => a.host.localeCompare(b.host));
    case 'pwReveal': { const x = all[arg]; return x ? dec(x.pass) : ''; }
    case 'pwCopy': { const x = all[arg]; if (x) { clipboard.writeText(dec(x.pass)); setTimeout(() => { if (clipboard.readText() === dec(x.pass)) clipboard.clear(); }, 30000); } return true; }   // effacé du presse-papiers après 30 s
    case 'pwDel': if (all[arg]) { all.splice(arg, 1); store.save('passwords'); } return true;
    case 'pwNeverList': return never();
    case 'pwNeverDel': { const s = store.get('settings'); s.pwNever = never().filter(o => o !== arg); store.save('settings'); return true; }
    case 'pwImport': {   // export CSV de Chrome, Edge, Brave, Opera ou Firefox : name,url,username,password
      const r = await dialog.showOpenDialog(api.state.win, { title: 'Importer des mots de passe (CSV)', filters: [{ name: 'CSV', extensions: ['csv'] }], properties: ['openFile'] });
      if (r.canceled) return { n: 0 };
      const rows = parseCsv(await fs.promises.readFile(r.filePaths[0], 'utf8'));
      const head = rows.shift()?.map(x => x.toLowerCase()) || [];
      const iu = head.findIndex(x => x === 'url' || x === 'origin'), in_ = head.findIndex(x => x === 'username' || x === 'login'), ip = head.indexOf('password');
      if (iu < 0 || ip < 0) return { n: 0, err: 'Colonnes url / password introuvables' };
      let n = 0;
      for (const row of rows) {
        let origin; try { origin = new URL(row[iu]).origin; } catch { continue; }
        if (!/^https?:/.test(origin) || !row[ip]) continue;
        const user = in_ >= 0 ? row[in_] || '' : '', old = all.find(x => x.origin === origin && x.user === user);
        if (old) old.pass = enc(row[ip]); else all.push({ origin, user, pass: enc(row[ip]), at: Date.now(), used: 0 });
        n++;
      }
      store.save('passwords');
      return { n };
    }
    case 'pwExport': {   // en clair : à n'utiliser que pour changer de navigateur
      const r = await dialog.showSaveDialog(api.state.win, { title: 'Exporter les mots de passe (non chiffrés)', defaultPath: 'mots-de-passe-nitroxyde.csv', filters: [{ name: 'CSV', extensions: ['csv'] }] });
      if (r.canceled) return false;
      const q = v => '"' + String(v).replace(/"/g, '""') + '"';
      await fs.promises.writeFile(r.filePath, 'name,url,username,password\n' + all.map(x => [new URL(x.origin).hostname, x.origin, x.user, dec(x.pass)].map(q).join(',')).join('\n'));
      return true;
    }
  }
  return undefined;
};

function parseCsv(t) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"' && t[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(f); f = ''; if (row.some(x => x)) rows.push(row); row = []; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}
