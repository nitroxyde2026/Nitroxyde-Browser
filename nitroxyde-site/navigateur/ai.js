const { WebContentsView, ipcMain, net, safeStorage } = require('electron');
const path = require('path');
const store = require('./store');

// Assistant IA : panneau latéral + aperçu au-dessus des résultats de recherche
let api, view, ready, bar, barReady, ctrl = null, barCtrl = null, barTab = null, last = null;
const history = [];
const kt = {};   // minuteurs de libération des vues
function drop(v, clear) {
  if (!v) return;
  try { api.state.win.contentView.removeChildView(v); v.webContents.close(); } catch {}
  clear();
}
const BAR_FULL = 230, BAR_MINI = 52;

const PROVIDERS = {
  groq: { name: 'Groq', kind: 'openai', base: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', keyField: 'groqKey' },
  openai: { name: 'ChatGPT', kind: 'openai', base: 'https://api.openai.com/v1', model: 'gpt-4o-mini', keyField: 'openaiKey' },
  gemini: { name: 'Gemini', kind: 'gemini', base: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-flash', keyField: 'geminiKey' },
  claude: { name: 'Claude', kind: 'claude', base: 'https://api.anthropic.com/v1', model: 'claude-haiku-5-5', keyField: 'claudeKey' },
};
const PROMPTS = {
  summary: ['Résumer la page', 'Résume cette page en français : 5 à 8 points clés, puis une phrase de conclusion.'],
  study: ['Fiche de révision', 'Transforme cette page en fiche de révision : titres, points essentiels, définitions, puis 5 questions de quiz avec leurs réponses.'],
  compare: ['Comparer les onglets', 'Compare ces pages (produits, offres ou idées) : points communs et différences, puis une recommandation.'],
  code: ['Expliquer le code', 'Explique simplement le code présent sur cette page, étape par étape.'],
  video: ['Résumer la vidéo', 'Résume cette vidéo en français à partir de sa transcription : points clés avec leur ordre, puis conclusion.'],
  translate: ['Traduire', 'Traduis ce texte : en français s’il est dans une autre langue, sinon en anglais. Garde la mise en forme.'],
  rewrite: ['Reformuler', 'Reformule ce texte de façon plus claire et plus concise, en gardant le sens et le ton.'],
  cards: ['Mode Études', ''],
};
const SYSTEM = "Tu es l'assistant intégré au navigateur Nitroxyde. Réponds en français, de façon claire et concise, en Markdown simple (listes, **gras**). Si le contenu fourni ne contient pas la réponse, dis-le.";
const SYSTEM_BAR = "Tu es l'aperçu IA d'un moteur de recherche. Réponds en français à la recherche de l'utilisateur : réponse directe en 3 à 6 phrases ou courte liste, sans te présenter, en Markdown simple. Si la recherche est un nom de site ou ambiguë, donne une brève description utile.";

const prov = () => { const p = store.get('settings').aiProvider; return PROVIDERS[p] ? p : 'groq'; };
const modelOf = p => store.get('settings').aiModels?.[p] || PROVIDERS[p].model;
const key = (p = prov()) => {
  const s = store.get('settings')[PROVIDERS[p].keyField];
  if (!s) return '';
  try { return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(s, 'base64')) : s; } catch { return ''; }
};
exports.hasKey = p => !!key(p || prov());
exports.setKey = (p, k) => {
  if (!PROVIDERS[p]) return;
  const s = store.get('settings');
  k = String(k || '').trim();
  s[PROVIDERS[p].keyField] = !k ? '' : safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(k).toString('base64') : k;
  store.save('settings');
};

const headers = (p, k) => PROVIDERS[p].kind === 'claude' ? { 'x-api-key': k, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }
  : PROVIDERS[p].kind === 'gemini' ? { 'x-goog-api-key': k, 'content-type': 'application/json' } : { Authorization: 'Bearer ' + k, 'content-type': 'application/json' };

async function failure(res, P) {
  let msg = '';
  try { const j = await res.json(); msg = j.error?.message || j.error?.status || ''; } catch {}
  if (res.status === 401 || res.status === 403) return `Clé ${P.name} refusée.`;
  if (res.status === 429) return `Limite ${P.name} atteinte, réessaie dans un instant.`;
  if (res.status === 400 || res.status === 404) return `Modèle ou requête refusés par ${P.name} : essaie un autre modèle. ${msg}`.trim();
  return `Erreur ${P.name} ${res.status}. ${msg}`.trim();
}

async function readSSE(res, onData) {
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (line.startsWith('data:') && !line.includes('[DONE]')) { try { onData(JSON.parse(line.slice(5))); } catch {} }
    }
  }
}

// Réponse en flux, quel que soit le fournisseur
async function stream(p, messages, signal, onDelta) {
  const P = PROVIDERS[p], k = key(p), model = modelOf(p);
  if (!k) throw new Error(`Ajoute ta clé ${P.name} dans Paramètres > Assistant IA.`);
  const sys = messages.find(m => m.role === 'system')?.content, chat = messages.filter(m => m.role !== 'system');
  let url, body;
  if (P.kind === 'openai') { url = P.base + '/chat/completions'; body = { model, stream: true, temperature: 0.4, max_tokens: 1500, messages }; }
  else if (P.kind === 'gemini') {
    url = `${P.base}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
    body = { systemInstruction: sys ? { parts: [{ text: sys }] } : undefined, contents: chat.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })), generationConfig: { temperature: 0.4, maxOutputTokens: 1500 } };
  } else { url = P.base + '/messages'; body = { model, max_tokens: 1500, stream: true, system: sys, messages: chat }; }
  const res = await net.fetch(url, { method: 'POST', signal, headers: headers(p, k), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await failure(res, P));
  let out = '';
  await readSSE(res, j => {
    const t = P.kind === 'openai' ? j.choices?.[0]?.delta?.content
      : P.kind === 'gemini' ? j.candidates?.[0]?.content?.parts?.map(x => x.text || '').join('')
      : (j.type === 'content_block_delta' ? j.delta?.text : '');
    if (t) { out += t; onDelta(t); }
  });
  return out;
}

// Réponse complète (sans flux) : JSON des cartes, traduction…
exports.complete = async (messages, json) => {
  const p = prov(), P = PROVIDERS[p], k = key(p), model = modelOf(p);
  if (!k) throw new Error(`Clé ${P.name} manquante.`);
  const sys = messages.find(m => m.role === 'system')?.content, chat = messages.filter(m => m.role !== 'system');
  let url, body;
  if (P.kind === 'openai') { url = P.base + '/chat/completions'; body = { model, temperature: 0.3, max_tokens: 1800, messages, ...(json ? { response_format: { type: 'json_object' } } : {}) }; }
  else if (P.kind === 'gemini') {
    url = `${P.base}/models/${encodeURIComponent(model)}:generateContent`;
    body = { systemInstruction: sys ? { parts: [{ text: sys }] } : undefined, contents: chat.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })), generationConfig: { temperature: 0.3, maxOutputTokens: 1800, ...(json ? { responseMimeType: 'application/json' } : {}) } };
  } else { url = P.base + '/messages'; body = { model, max_tokens: 1800, system: sys, messages: chat }; }
  const res = await net.fetch(url, { method: 'POST', signal: AbortSignal.timeout(30000), headers: headers(p, k), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await failure(res, P));
  const j = await res.json();
  return P.kind === 'openai' ? j.choices?.[0]?.message?.content || ''
    : P.kind === 'gemini' ? j.candidates?.[0]?.content?.parts?.map(x => x.text || '').join('') || ''
    : (j.content || []).map(c => c.text || '').join('');
};

// Liste des modèles proposés par le fournisseur actif
async function models(p) {
  const P = PROVIDERS[p], k = key(p);
  if (!k) return [];
  try {
    const url = P.kind === 'gemini' ? `${P.base}/models?pageSize=100` : P.kind === 'claude' ? `${P.base}/models?limit=100` : `${P.base}/models`;
    const j = await (await net.fetch(url, { headers: headers(p, k), signal: AbortSignal.timeout(6000) })).json();
    let ids;
    if (P.kind === 'gemini') ids = (j.models || []).filter(m => m.supportedGenerationMethods?.includes('generateContent')).map(m => m.name.replace('models/', '')).filter(id => /^gemini/.test(id));
    else ids = (j.data || []).map(m => m.id);
    if (p === 'groq') ids = ids.filter(id => !/whisper|tts|guard|orpheus|playai|safeguard/i.test(id));
    if (p === 'openai') ids = ids.filter(id => /^(gpt|o\d|chatgpt)/.test(id) && !/audio|realtime|tts|whisper|image|embedding|moderation|transcribe|search|instruct/.test(id));
    return ids.sort();
  } catch { return []; }
}

// ---- Lecture de la page : texte, sélection, sous-titres YouTube ----
async function pageText(wc) {
  try { return String(await wc.executeJavaScript('(document.body && document.body.innerText) || ""')).replace(/\n\s*\n+/g, '\n').slice(0, 12000); } catch { return ''; }
}
const YT = `(async()=>{try{const p=document.querySelector('#movie_player');const r=(p&&p.getPlayerResponse&&p.getPlayerResponse())||window.ytInitialPlayerResponse;const t=r&&r.captions&&r.captions.playerCaptionsTracklistRenderer&&r.captions.playerCaptionsTracklistRenderer.captionTracks;if(!t||!t.length)return '';const tr=t.find(x=>/^fr/.test(x.languageCode))||t.find(x=>/^en/.test(x.languageCode))||t[0];const j=await (await fetch(tr.baseUrl+'&fmt=json3')).json();return (j.events||[]).map(e=>(e.segs||[]).map(s=>s.utf8).join('')).join(' ').replace(/\\s+/g,' ')}catch(e){return ''}})()`;
const videoText = async wc => { try { return String(await wc.executeJavaScript(YT, true)).slice(0, 14000); } catch { return ''; } };
const selection = async wc => { try { return String(await wc.executeJavaScript('String(window.getSelection())')).trim(); } catch { return ''; } };

async function studyCards(act) {
  const t = act?.view ? await pageText(act.view.webContents) : '';
  if (!t) throw new Error('Rien à transformer : ouvre d’abord une page.');
  const out = await exports.complete([{ role: 'system', content: SYSTEM },
    { role: 'user', content: `Crée 8 cartes de révision (question courte, réponse courte) à partir de cette page. Réponds uniquement avec ce JSON : {"cards":[{"q":"...","a":"..."}]}\n\n${t}` }], true);
  const m = out.match(/\{[\s\S]*\}/);
  return (JSON.parse(m ? m[0] : out).cards || []).filter(c => c.q && c.a).slice(0, 12);
}

// ---- Deux surfaces : panneau latéral et aperçu au-dessus des résultats ----
function mkView(file) {
  const v = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, preload: path.join(__dirname, 'preload.js') } });
  const r = new Promise(res => v.webContents.once('did-finish-load', () => { v.webContents.send('theme', api.look()); res(); }));
  v.webContents.loadFile(path.join(__dirname, 'src', file));
  api.state.win.contentView.addChildView(v);
  return [v, r];
}
const ensure = () => { if (!view) [view, ready] = mkView('ai.html'); return ready; };
const ensureBar = () => { if (!bar) [bar, barReady] = mkView('aibar.html'); return barReady; };
const send = (type, data) => { try { view.webContents.send('ai', { type, data }); } catch {} };
const sendBar = (type, data) => { try { bar.webContents.send('aib', { type, data }); } catch {} };

exports.layout = r => view?.setBounds(r);
exports.layoutBar = r => bar?.setBounds(r);
exports.theme = d => { for (const v of [view, bar]) { try { v?.webContents.send('theme', d); } catch {} } };

exports.toggle = async (open, query) => {
  api.state.ai = open;
  clearTimeout(kt.panel);
  if (!open) kt.panel = setTimeout(() => drop(view, () => { view = null; ready = null; }), 120000);
  if (open) { await ensure(); view.setVisible(true); api.state.win.contentView.addChildView(view); } else view?.setVisible(false);
  api.layout();
  if (open) { send('opened'); if (query) exports.ask(query, 'search', false); }
};

// Aperçu IA : une recherche tapée dans la barre ou sur le nouvel onglet affiche la réponse au-dessus des résultats
async function runBar(q) {
  barCtrl?.abort(); barCtrl = new AbortController();
  last = { q, a: '' };
  sendBar('user', q);
  try {
    await stream(prov(), [{ role: 'system', content: SYSTEM_BAR }, { role: 'user', content: q }], barCtrl.signal, t => { last.a += t; sendBar('delta', t); });
    sendBar('done');
  } catch (err) { if (err.name !== 'AbortError') sendBar('error', err.message); }
}
async function showBar(q) {
  const S = api.state;
  clearTimeout(kt.bar);
  await ensureBar();
  barTab = S.active?.id;
  S.aiBar = BAR_FULL;
  bar.setVisible(true);
  S.win.contentView.addChildView(bar);
  api.layout();
  sendBar('state', { provider: PROVIDERS[prov()].name, model: modelOf(prov()), mini: false });
  runBar(q);
}
exports.hideBar = () => { if (api.state.aiBar) { api.state.aiBar = 0; bar?.setVisible(false); barCtrl?.abort(); api.layout(); clearTimeout(kt.bar); kt.bar = setTimeout(() => drop(bar, () => { bar = null; barReady = null; }), 120000); } };
exports.barTab = id => { if (api.state.aiBar && id !== barTab) exports.hideBar(); };
exports.pre = q => { if (store.get('settings').aiAuto && key() && String(q).trim().length > 3) showBar(String(q).trim()); };

// ---- Discussion dans le panneau ----
exports.ask = async (text, kind = 'free', useCtx = true) => {
  await ensure();
  ctrl?.abort(); ctrl = new AbortController();
  const plain = kind === 'free' || kind === 'search', [label, prompt] = PROMPTS[kind] || [text, text];
  send('user', plain ? text : label);
  if (!key()) return send('error', `Ajoute ta clé ${PROVIDERS[prov()].name} dans Paramètres > Assistant IA, ou choisis un autre fournisseur dans la liste.`);
  try {
    let content = plain ? text : prompt;
    const act = api.state.active;
    if (kind === 'video') {
      const tx = await videoText(act?.view?.webContents);
      if (!tx) return send('error', 'Pas de sous-titres disponibles sur cette vidéo (ou ce n’est pas une vidéo YouTube).');
      content = `${prompt}\n\nTranscription :\n${tx}`;
    } else if (kind === 'translate' || kind === 'rewrite') {
      const sel = await selection(act?.view?.webContents);
      content = `${prompt}\n\n${sel || (await pageText(act?.view?.webContents)).slice(0, 4000)}`;
    } else if (kind === 'cards') {
      return send('cards', await studyCards(act));
    } else if (kind === 'compare') {
      const parts = [];
      for (const t of api.state.tabs.filter(x => x.view && x.url.startsWith('http')).slice(0, 5)) {
        parts.push(`### ${t.title} (${t.url})\n${(await pageText(t.view.webContents)).slice(0, 3500)}`);
      }
      content = `${prompt}\n\n${parts.join('\n\n')}`;
    } else if (useCtx && kind !== 'search' && act?.view && act.url.startsWith('http')) {
      content = `Page : ${act.title}\nURL : ${act.url}\n\nContenu :\n${await pageText(act.view.webContents)}\n\n---\n${content}`;
    }
    const out = await stream(prov(), [{ role: 'system', content: SYSTEM }, ...history, { role: 'user', content }], ctrl.signal, t => send('delta', t));
    send('done');
    history.push({ role: 'user', content: plain ? text : label }, { role: 'assistant', content: out });
    history.splice(0, Math.max(0, history.length - 10));
  } catch (err) { if (err.name !== 'AbortError') send('error', err.message); }
};

exports.init = a => {
  api = a;
  ipcMain.handle('ai', async (e, cmd, arg) => {
    const fromBar = bar && e.sender === bar.webContents, fromPanel = view && e.sender === view.webContents;
    if (!fromBar && !fromPanel) return;
    switch (cmd) {
      case 'ask': return exports.ask(String(arg.text || ''), arg.kind, !!arg.ctx);
      case 'models': return models(prov());
      case 'info': return { provider: prov(), model: modelOf(prov()), providers: Object.entries(PROVIDERS).map(([id, P]) => ({ id, name: P.name, hasKey: !!key(id) })) };
      case 'provider': if (PROVIDERS[arg]) { store.get('settings').aiProvider = arg; store.save('settings'); } break;
      case 'model': { const s = store.get('settings'); s.aiModels = { ...(s.aiModels || {}), [prov()]: String(arg) }; store.save('settings'); break; }
      case 'close': exports.toggle(false); break;
      case 'reset': history.length = 0; send('reset'); break;
      case 'barClose': exports.hideBar(); break;
      case 'barToggle': { const S = api.state; S.aiBar = S.aiBar === BAR_FULL ? BAR_MINI : BAR_FULL; api.layout(); sendBar('state', { mini: S.aiBar === BAR_MINI }); break; }
      case 'barRetry': if (last) runBar(last.q); break;
      case 'toPanel':
        await exports.toggle(true);
        if (last) { send('user', last.q); send('delta', last.a); send('done'); history.push({ role: 'user', content: last.q }, { role: 'assistant', content: last.a }); }
        exports.hideBar();
        break;
    }
  });
};
