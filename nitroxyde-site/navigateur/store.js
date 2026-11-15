const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  settings: {
    engine: 'google', suggestOn: true, adblock: true, strip: true, sleepMin: 3,
    theme: 'dark', wall: 'off', wallFile: '', wallV: 0,
    https: false, gpc: true, restore: true,
    news: true, newsSource: 'francetvinfo', stats: true, syncDir: '', downloadDir: '',
    musicOn: true, musicStart: true, musicRepeat: true, musicMinimize: true, musicBlur: false, musicTrack: '', musicVol: 0.3, musicAuto: true, custom: {},
    mode: 'normal', onboarded: false, tabsPos: 'top', anim: true, customCss: '', dns: 'off', dnsCustom: '', allow: [], dlSort: false,
    aiModel: 'openai/gpt-oss-120b', aiAuto: true, groqKey: '', openaiKey: '', geminiKey: '', claudeKey: '', aiProvider: 'groq', aiModels: {},
    musicSource: 'music', aiSource: 'chatgpt', ramBudgetMB: 1500, wallFavs: [], clock: true, notes: false, perf: false,
    sidebar: true, accent: '', clockStyle: 'digital', clock24: true, clockSec: false, weather: false, city: '', calendar: false, tasks: false,
    widgets: false, searchSize: 'm', searchShape: 'pill', cookies3: false, dlLimitKB: 0,
    keys: {}, extensions: [], preSpecialWall: 'off', intro: '', winState: {}, sideW: 440, sideWs: {}, sideZoom: {}, updateUrl: 'https://nitroxyde.fr/version.json', updateSeen: '',
    pwOn: true, pwNever: [], transLang: 'fr', netLimit: 0, cookieBanners: true, vpn: {}, vpnUser: '', vpnPass: '', crashGuard: true,
  },
  history: [],
  bookmarks: [],
  session: [],
  shortcuts: [{ url: 'https://www.google.com/', title: 'Google' }],
  icons: {},
  stats: { ads: 0, params: 0 },
  meta: { t: 0, last: 0 },
  perms: {},
  svcicons: {},
  notes: { text: '', tasks: [] },
  sessions: [],
  spaces: { space: 'perso', groups: [] },
  passwords: [],
};
const data = {}, timers = {};
const file = n => path.join(app.getPath('userData'), n + '.json');

exports.get = n => (data[n] ??= (() => {
  try {
    const v = JSON.parse(fs.readFileSync(file(n), 'utf8'));
    return Array.isArray(v) ? v : { ...DEFAULTS[n], ...v };
  } catch { return structuredClone(DEFAULTS[n]); }
})());

// Écriture asynchrone et regroupée : ne bloque jamais l'interface
exports.save = n => {
  if (n === 'bookmarks' || n === 'shortcuts' || n === 'settings') { exports.get('meta').t = Date.now(); exports.save('meta'); }
  clearTimeout(timers[n]);
  timers[n] = setTimeout(() => fs.promises.writeFile(file(n), JSON.stringify(data[n])).catch(() => {}), 400);
};
exports.set = (n, v) => { data[n] = v; exports.save(n); };
exports.flush = () => { for (const n in data) try { fs.writeFileSync(file(n), JSON.stringify(data[n])); } catch {} };
exports.defaults = n => structuredClone(DEFAULTS[n]);
