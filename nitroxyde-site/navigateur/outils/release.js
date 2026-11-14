#!/usr/bin/env node
// Lancé par GitHub Actions après la construction : publie l'installateur dans une Release GitHub
// et met à jour version.json à la racine du site (le bouton « Télécharger » et les mises à jour du navigateur le lisent).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const nav = path.join(__dirname, '..'), site = path.join(nav, '..');
const { version } = JSON.parse(fs.readFileSync(path.join(nav, 'package.json'), 'utf8'));
const name = `Nitroxyde-Navigation-Setup-${version}.exe`, file = path.join(nav, 'dist', name);
if (!fs.existsSync(file)) { console.error('Installateur introuvable : ' + file); process.exit(1); }

const buf = fs.readFileSync(file), sha = crypto.createHash('sha256').update(buf).digest('hex');
const repo = process.env.GITHUB_REPOSITORY, tag = 'v' + version;
const sh = (c, opt = {}) => execSync(c, { stdio: 'inherit', ...opt });
const ok = c => { try { execSync(c, { stdio: 'ignore' }); return true; } catch { return false; } };

// 1. Release GitHub (créée, ou fichier remplacé si cette version existe déjà)
const notes = `Nitroxyde Navigation ${version} pour Windows 10 et 11 (64 bits).\n\nSHA-256 : ${sha}\n\nInstallation et avertissement SmartScreen : https://nitroxyde.fr/telecharger.html`;
fs.writeFileSync(path.join(nav, 'dist', 'notes.md'), notes);
if (ok(`gh release view ${tag} --repo ${repo}`)) sh(`gh release upload ${tag} "${file}" --clobber --repo ${repo}`);
else sh(`gh release create ${tag} "${file}" --repo ${repo} --title "Nitroxyde Navigation ${version}" --notes-file "${path.join(nav, 'dist', 'notes.md')}" --latest`);

// 2. version.json du site
const info = { version, url: 'https://nitroxyde.fr/telecharger.html',
  files: { win: `https://github.com/${repo}/releases/download/${tag}/${name}` }, sha256: { win: sha }, size: { win: buf.length } };
fs.writeFileSync(path.join(site, 'version.json'), JSON.stringify(info, null, 2) + '\n');
console.log(`\nversion.json → ${version} · ${(buf.length / 1048576).toFixed(1)} Mo · ${sha}`);

// 3. Enregistrement de version.json dans le dépôt (GitHub Pages republie le site tout seul)
process.chdir(site);
const who = process.env.GITHUB_ACTOR || 'nitroxyde', id = process.env.GITHUB_ACTOR_ID;
sh(`git config user.name "${who}"`);
sh(`git config user.email "${id ? id + '+' : ''}${who}@users.noreply.github.com"`);
sh('git add version.json');
if (ok('git diff --cached --quiet')) { console.log('version.json déjà à jour.'); process.exit(0); }
sh(`git commit -m "Navigateur ${version} disponible au téléchargement"`);
const branch = process.env.GITHUB_REF_NAME || 'main';
sh(`git pull --rebase origin ${branch}`);
sh(`git push origin HEAD:${branch}`);
