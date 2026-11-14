const { app } = require('electron');
const store = require('./store');
const sidebar = require('./sidebar');
const workspace = require('./workspace');

// Gestion de la mémoire : budget global, onglets inactifs mis en veille, panneaux inutilisés libérés
let api, lastToast = 0;
exports.init = a => { api = a; setInterval(tick, 15000); };
const totalMB = () => app.getAppMetrics().reduce((n, m) => n + (m.memory.privateBytes || m.memory.workingSetSize), 0) / 1024;   // même mesure que le badge

function tick() {
  try { sidebar.reap(); workspace.reap(); require('./popup').reap(); } catch {}
  // Pages internes (nouvel onglet, paramètres…) cachées depuis 30 s : libérées, elles se rouvrent instantanément au clic
  const S0 = api.state;
  let freed = false;
  for (const t of S0.tabs) if (t.view && t !== S0.active && t.url.startsWith('file:') && Date.now() - t.last > 30000) { api.kill(t); freed = true; }
  if (freed) api.push();
  const s = store.get('settings');
  let budget = s.ramBudgetMB || 0;
  if (s.mode === 'gaming') budget = budget ? Math.min(budget, 1000) : 1000;
  if (!budget || totalMB() <= budget) return;
  const S = api.state;
  const old = S.tabs.filter(t => t.view && t !== S.active && !t.loading && !t.view.webContents.isCurrentlyAudible()).sort((a, b) => a.last - b.last).slice(0, 3);
  if (!old.length) return;
  for (const t of old) api.kill(t);
  api.push();
  if (Date.now() - lastToast > 300000) {
    lastToast = Date.now();
    api.toast({ icon: '🧹', title: 'Mémoire libérée', text: `${old.length} onglet(s) inactif(s) mis en veille (budget : ${budget} Mo).`, ms: 5000, soft: true });
  }
}
