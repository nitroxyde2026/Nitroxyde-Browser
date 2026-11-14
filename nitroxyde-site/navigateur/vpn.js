const { app, session, net, safeStorage, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const tcp = require('net');
const store = require('./store');

// ---- VPN du navigateur ----
// Le trafic des onglets (et du panneau latéral) passe par un serveur sécurisé :
//  • NordVPN : serveurs proxy HTTPS officiels (port 89) + « identifiants de service » du compte Nord
//  • Proxy personnalisé : SOCKS5 / HTTPS / HTTP avec identifiants (Surfshark, PIA, Windscribe, ton serveur…)
//  • Tor : le Tor Browser ou le service Tor déjà lancé sur le PC (SOCKS5 local)
//  • Proton VPN, Mullvad : pas de proxy public ; leur appli protège tout le PC. Le navigateur la détecte,
//    l'ouvre, et vérifie l'adresse IP visible des sites.
// Un proxy qui ne répond plus bloque la navigation au lieu de laisser passer en clair (pas de fuite).
let api, rules = '', creds = null, failed = 0, failAt = 0, last = null;
const enc = t => (!t ? '' : safeStorage.isEncryptionAvailable() ? 'e:' + safeStorage.encryptString(t).toString('base64') : 'p:' + Buffer.from(t).toString('base64'));
const dec = t => { try { return !t ? '' : t.startsWith('e:') ? safeStorage.decryptString(Buffer.from(t.slice(2), 'base64')) : Buffer.from(t.slice(2), 'base64').toString(); } catch { return ''; } };
const cfg = () => { const s = store.get('settings'); s.vpn = { on: false, provider: 'nord', country: 'auto', type: 'socks5', host: '', port: 1080, kill: false, ...(s.vpn || {}) }; return s.vpn; };

// Pays des serveurs NordVPN (identifiants de l'API publique de Nord)
const COUNTRIES = [['auto', 'Le plus rapide', ''], ['fr', 'France', 74], ['de', 'Allemagne', 81], ['nl', 'Pays-Bas', 153], ['be', 'Belgique', 21], ['ch', 'Suisse', 209],
  ['gb', 'Royaume-Uni', 227], ['es', 'Espagne', 202], ['it', 'Italie', 106], ['se', 'Suède', 208], ['us', 'États-Unis', 228], ['ca', 'Canada', 38], ['jp', 'Japon', 108]];
const PROVIDERS = {
  nord: { name: 'NordVPN', proxy: true, site: 'https://my.nordaccount.com/dashboard/nordvpn/manual-configuration/' },
  proton: { name: 'Proton VPN', app: true, site: 'https://protonvpn.com/download',
    exe: ['C:\\Program Files\\Proton\\VPN\\ProtonVPN.Launcher.exe', 'C:\\Program Files (x86)\\Proton Technologies\\ProtonVPN\\ProtonVPN.exe', '/Applications/Proton VPN.app', '/usr/bin/protonvpn-app'] },
  mullvad: { name: 'Mullvad', app: true, site: 'https://mullvad.net/download',
    exe: ['C:\\Program Files\\Mullvad VPN\\Mullvad VPN.exe', '/Applications/Mullvad VPN.app', '/usr/bin/mullvad-gui', '/opt/Mullvad VPN/mullvad-gui'] },
  custom: { name: 'Proxy personnalisé', proxy: true },
  tor: { name: 'Tor', proxy: true, site: 'https://www.torproject.org/download/' },
};
const flag = cc => (cc || '').toUpperCase().replace(/./g, c => String.fromCodePoint(0x1f1a5 + c.charCodeAt(0)));
const sessions = () => api.partitions.map(p => session.fromPartition(p));

exports.init = a => {
  api = a;
  // Identifiants du proxy (NordVPN, proxy perso) : donnés à Chromium quand le serveur les demande
  app.on('login', (e, wc, details, auth, cb) => {
    if (!auth.isProxy || !rules || !creds) return;
    e.preventDefault();
    if (Date.now() - failAt > 15000) failed = 0;
    failAt = Date.now();
    if (++failed > 3) {   // refusés plusieurs fois : on arrête de réessayer en boucle
      cb();
      if (failed === 4) api.toast({ icon: '🛡', title: 'VPN', text: 'Identifiants refusés par le serveur. Vérifie-les dans le panneau VPN.', ms: 8000 });
      return;
    }
    cb(creds.user, creds.pass);
  });
  if (cfg().on) setTimeout(() => exports.connect(true), 800);
};

function getJSON(url, ses, ms = 9000) {   // requête faite par la session indiquée (donc à travers le VPN si elle l'utilise)
  return new Promise((ok, ko) => {
    const req = net.request({ url, session: ses, useSessionCookies: false });
    const to = setTimeout(() => { req.abort(); ko(new Error('délai dépassé')); }, ms);
    let body = '';
    req.on('response', r => { r.on('data', c => { body += c; }); r.on('end', () => { clearTimeout(to); try { ok(JSON.parse(body)); } catch (err) { ko(err); } }); });
    req.on('error', err => { clearTimeout(to); ko(err); });
    req.end();
  });
}
const portOpen = (port, host = '127.0.0.1') => new Promise(ok => {
  const s = tcp.connect({ port, host, timeout: 800 }, () => { s.destroy(); ok(true); });
  s.on('error', () => ok(false)); s.on('timeout', () => { s.destroy(); ok(false); });
});

async function apply(r) {
  rules = r;
  for (const ses of sessions()) {
    await ses.setProxy(r ? { proxyRules: r, proxyBypassRules: '<local>' } : { mode: 'direct' });
    try { await ses.closeAllConnections(); } catch {}
  }
  const pol = r ? 'disable_non_proxied_udp' : 'default';   // WebRTC ne révèle plus la vraie IP derrière le VPN
  for (const t of api.state.tabs) try { t.view?.webContents.setWebRTCIPHandlingPolicy(pol); } catch {}
}
exports.webrtc = wc => { if (rules) try { wc.setWebRTCIPHandlingPolicy('disable_non_proxied_udp'); } catch {} };

// Choisit le meilleur serveur NordVPN (le moins chargé) dans le pays voulu
async function nordServer(country) {
  const id = COUNTRIES.find(c => c[0] === country)?.[2];
  const q = 'https://api.nordvpn.com/v1/servers/recommendations?filters[servers_technologies][identifier]=proxy_ssl&limit=5' + (id ? `&filters[country_id]=${id}` : '');
  const list = await getJSON(q, session.defaultSession);
  const sv = Array.isArray(list) && list.find(x => x.hostname);
  if (!sv) throw new Error('aucun serveur disponible');
  return { host: sv.hostname, country: sv.locations?.[0]?.country?.name || '', cc: sv.locations?.[0]?.country?.code || country, load: sv.load };
}

exports.connect = async (boot = false) => {
  const v = cfg(), p = PROVIDERS[v.provider];
  if (!p) return { ok: false, err: 'Fournisseur inconnu' };
  if (p.app) { await apply(''); v.on = true; store.save('settings'); api.push(); return exports.check(); }
  try {
    let r, label;
    creds = null;
    if (v.provider === 'nord') {
      const user = dec(store.get('settings').vpnUser), pass = dec(store.get('settings').vpnPass);
      if (!user || !pass) throw new Error('Ajoute tes identifiants de service NordVPN');
      const sv = await nordServer(v.country);
      r = `https://${sv.host}:89`; creds = { user, pass };
      label = `${flag(sv.cc)} ${sv.country || sv.host}`; v.server = sv.host; v.cc = sv.cc;
    } else if (v.provider === 'tor') {
      const port = (await portOpen(9150)) ? 9150 : (await portOpen(9050)) ? 9050 : 0;
      if (!port) throw new Error('Tor n’est pas lancé : ouvre le Tor Browser puis réessaie');
      r = `socks5://127.0.0.1:${port}`; label = 'Réseau Tor'; v.cc = '';
    } else {
      if (!v.host || !v.port) throw new Error('Indique l’adresse et le port du proxy');
      const scheme = { socks5: 'socks5', https: 'https', http: 'http' }[v.type] || 'socks5';
      r = `${scheme}://${v.host}:${v.port}`; label = v.host; v.cc = '';
      const user = dec(store.get('settings').vpnUser), pass = dec(store.get('settings').vpnPass);
      if (user) creds = { user, pass };
    }
    failed = 0;
    await apply(r);
    v.on = true; v.label = label; store.save('settings'); api.push();
    const st = await exports.check();
    if (!st.ok && !boot) return { ...st, ok: false };
    return st;
  } catch (err) {
    if (v.kill && v.on) await apply('socks5://127.0.0.1:9');   // coupe-circuit : rien ne sort sans VPN
    else { await apply(''); v.on = false; }
    store.save('settings'); api.push();
    if (boot) api.toast({ icon: '🛡', title: 'VPN non connecté', text: err.message + (v.kill ? ' — navigation bloquée (coupe-circuit).' : ' — navigation directe.'), ms: 9000 });
    return { ok: false, err: err.message };
  }
};

exports.disconnect = async () => {
  const v = cfg();
  v.on = false; creds = null; last = null;
  await apply('');
  store.save('settings'); api.push();
  return exports.state();
};

// Adresse IP visible par les sites, vue à travers la session des onglets
exports.check = async () => {
  try {
    const j = await getJSON('https://am.i.mullvad.net/json', session.fromPartition(api.partitions[0]));
    last = { ip: j.ip, country: j.country, city: j.city, org: j.organization, mullvad: !!j.mullvad_exit_ip, at: Date.now() };
    return { ok: true, ...exports.state() };
  } catch (err) {
    last = null;
    return { ok: false, err: rules ? 'Le serveur ne répond pas : ' + err.message : 'Impossible de vérifier l’adresse IP', ...exports.state() };
  }
};

exports.state = () => {
  const v = cfg(), s = store.get('settings'), p = PROVIDERS[v.provider];
  const installed = {};
  for (const [id, x] of Object.entries(PROVIDERS)) if (x.exe) installed[id] = x.exe.some(f => { try { return fs.existsSync(f); } catch { return false; } });
  return { on: !!v.on, proxied: !!rules, provider: v.provider, name: p?.name || '', label: v.label || '', cc: v.cc || '', country: v.country, type: v.type, host: v.host, port: v.port,
    kill: !!v.kill, user: dec(s.vpnUser), hasPass: !!s.vpnPass, ip: last, installed, countries: COUNTRIES.map(([id, n]) => ({ id, name: n, flag: flag(id === 'auto' ? '' : id) })),
    providers: Object.entries(PROVIDERS).map(([id, x]) => ({ id, name: x.name, app: !!x.app, site: x.site || '' })) };
};

exports.badge = () => { const v = cfg(); return v.on ? { on: true, cc: (v.cc || '').toUpperCase(), app: !!PROVIDERS[v.provider]?.app } : { on: false }; };

exports.handle = async (cmd, a = {}) => {
  const v = cfg(), s = store.get('settings');
  switch (cmd) {
    case 'state': return exports.state();
    case 'set': {   // réglages du panneau ; les identifiants sont chiffrés
      for (const k of ['provider', 'country', 'type', 'host']) if (typeof a[k] === 'string') v[k] = a[k].trim().slice(0, 200);
      if (a.port !== undefined) v.port = Math.max(0, Math.min(65535, +a.port || 0));
      if (typeof a.kill === 'boolean') v.kill = a.kill;
      if (typeof a.user === 'string') s.vpnUser = enc(a.user.trim());
      if (typeof a.pass === 'string' && a.pass) s.vpnPass = enc(a.pass);
      store.save('settings');
      if (v.on && ['provider', 'country', 'type', 'host', 'port', 'user', 'pass'].some(k => k in a)) return exports.connect();
      return exports.state();
    }
    case 'connect': return exports.connect();
    case 'disconnect': return exports.disconnect();
    case 'check': return exports.check();
    case 'openApp': {
      const p = PROVIDERS[a.id], f = p?.exe?.find(x => fs.existsSync(x));
      if (f) shell.openPath(f); else if (p?.site) api.createTab(p.site);
      return true;
    }
    case 'site': { const p = PROVIDERS[a.id]; if (p?.site) api.createTab(p.site); return true; }
  }
};
