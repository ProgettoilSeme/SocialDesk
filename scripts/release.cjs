// Pubblica una versione compilata come Release su GitHub, da cui l'app scarica gli aggiornamenti.
//   node scripts/release.cjs <cartella di npm run package>
// Carica SocialDesk-Mac.zip, SocialDesk-Setup-<versione>.exe e versione.json nella Release v<versione>
// del repository di package.json → "updates.github" (deve essere pubblico), con il tag sul commit in uso.
// Richiede `gh` con l'accesso al repository. Rifiuta se la Release esiste già o se i file non tornano.
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
(async () => {
  const pkg = require('../package.json');
  const repo = pkg.updates?.github, dist = process.argv[2];
  if (!repo) throw new Error('Manca "updates.github" in package.json.');
  if (!dist) throw new Error('Uso: node scripts/release.cjs <cartella della compilazione>');
  const manifestFile = path.join(dist, 'versione.json');
  const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
  if (manifest.version !== pkg.version) throw new Error(`versione.json è della ${manifest.version}, package.json della ${pkg.version}: ricompila.`);
  const files = [];
  for (const key of ['mac', 'windows']) {
    const a = manifest[key]; if (!a) throw new Error(`versione.json non ha il file per ${key}.`);
    const file = path.join(dist, a.file), data = await fs.readFile(file);
    if (data.length !== a.size || crypto.createHash('sha256').update(data).digest('hex') !== a.sha256) throw new Error(`${a.file} non corrisponde a versione.json.`);
    files.push(file);
  }
  const tag = `v${pkg.version}`, commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const exists = (() => { try { execFileSync('gh', ['release', 'view', tag, '--repo', repo], { stdio: 'ignore' }); return true; } catch { return false; } })();
  if (exists) throw new Error(`La Release ${tag} esiste già su ${repo}.`);
  execFileSync('gh', ['release', 'create', tag, ...files, manifestFile, '--repo', repo, '--target', commit, '--title', `${pkg.productName} ${pkg.version}`, '--notes', manifest.notes || `${pkg.productName} ${pkg.version}`, '--latest'], { stdio: 'inherit' });
  console.log(`Pubblicata ${tag} su https://github.com/${repo}/releases/tag/${tag}`);
})().catch(error => { console.error(error.message || error); process.exitCode = 1; });
