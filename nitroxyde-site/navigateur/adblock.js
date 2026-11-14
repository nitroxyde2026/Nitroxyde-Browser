const { app, session, net } = require('electron');
const fs = require('fs');
const path = require('path');
const store = require('./store');

// Moteur Ghostery (listes EasyList, EasyPrivacy, uBlock) : blocage réseau + masquage des éléments de pub.
// Tant qu'il n'est pas chargé (premier lancement : téléchargement des listes), la liste intégrée de main.js protège déjà.
let blocker = null, api, applied = [];
exports.init = a => { api = a; };
exports.active = () => !!blocker;
const sessions = () => api.partitions.map(p => session.fromPartition(p));

exports.start = async () => {
  try {
    const { ElectronBlocker } = require('@ghostery/adblocker-electron');
    // Option « bandeaux de cookies » : listes complètes (pubs, traceurs, bandeaux cookies et nuisances)
    const full = store.get('settings').cookieBanners !== false;
    const cache = path.join(app.getPath('userData'), full ? 'adblock-full.bin' : 'adblock-engine.bin');
    try { if (Date.now() - fs.statSync(cache).mtimeMs > 7 * 864e5) fs.unlinkSync(cache); } catch {}   // listes renouvelées chaque semaine
    blocker = await ElectronBlocker[full ? 'fromPrebuiltFull' : 'fromPrebuiltAdsAndTracking']((...a) => net.fetch(...a), {
      path: cache, read: fs.promises.readFile, write: fs.promises.writeFile,
    });
    blocker.on('request-blocked', req => { api.count('ads'); api.blockedOn(req.tabId); });
    exports.allow(store.get('settings').allow);
    if (store.get('settings').adblock) for (const s of sessions()) blocker.enableBlockingInSession(s);
  } catch (err) { console.error('[bloqueur] moteur avancé indisponible :', err.message); blocker = null; }
};

exports.toggle = on => {
  if (!blocker) return;
  for (const s of sessions()) { try { on ? blocker.enableBlockingInSession(s) : blocker.disableBlockingInSession(s); } catch {} }
};

// Sites où le bloqueur est désactivé (règle d'exception uBlock : @@||site^$document)
exports.allow = hosts => {
  if (!blocker) return;
  const rules = hosts.map(h => `@@||${h}^$document`);
  try {
    blocker.updateFromDiff({ added: rules.filter(r => !applied.includes(r)), removed: applied.filter(r => !rules.includes(r)) });
    applied = rules;
  } catch {}
};
