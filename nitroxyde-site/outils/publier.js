#!/usr/bin/env node
// Prépare une publication : copie les installateurs du dossier dist/ dans telecharger/,
// calcule leur empreinte SHA-256 et met à jour version.json.
// Usage : node outils/publier.js <dossier dist du navigateur>
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const src = process.argv[2];
if (!src || !fs.existsSync(src)) { console.log('Usage : node outils/publier.js <dossier dist du navigateur>'); process.exit(1); }

const root = path.join(__dirname, '..'), out = path.join(root, 'telecharger');
fs.mkdirSync(out, { recursive: true });
const KINDS = {
  win: /^Nitroxyde-Browser-Setup-[\d.]+\.exe$/,
  mac: /^Nitroxyde-Browser-[\d.]+\.dmg$/,
  linux: /^Nitroxyde-Browser-[\d.]+\.AppImage$/,
};
const info = { version: '', url: 'https://nitroxyde.fr/telecharger', files: {}, sha256: {}, size: {} };

for (const f of fs.readdirSync(src)) {
  for (const [os, re] of Object.entries(KINDS)) {
    if (!re.test(f)) continue;
    const dest = path.join(out, f);
    fs.copyFileSync(path.join(src, f), dest);
    const buf = fs.readFileSync(dest);
    info.files[os] = 'telecharger/' + f;
    info.sha256[os] = crypto.createHash('sha256').update(buf).digest('hex');
    info.size[os] = buf.length;
    info.version = (f.match(/(\d+\.\d+\.\d+)/) || [])[1] || info.version;
    console.log(`${os} : ${f}  ${(buf.length / 1048576).toFixed(1)} Mo\n      SHA-256 ${info.sha256[os]}`);
  }
}
if (!info.version) { console.log('Aucun installateur reconnu dans ce dossier.'); process.exit(1); }
fs.writeFileSync(path.join(root, 'version.json'), JSON.stringify(info, null, 2) + '\n');
console.log('\nversion.json mis à jour pour la version ' + info.version + '. Envoie maintenant tout le dossier sur ton hébergeur.');
