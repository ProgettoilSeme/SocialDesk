const path = require('node:path');
const fs = require('node:fs/promises');
const { execFileSync } = require('node:child_process');
const os = require('node:os');

(async () => {
  const { packager } = await import('@electron/packager');
  const root = path.resolve(__dirname, '..');
  const pkg = require('../package.json');
  const out = process.env.SOCIAL_DIST || path.resolve(root, '../distribuzioni');
  const cacheRoot = process.env.SOCIAL_ELECTRON_CACHE;
  await fs.mkdir(out, { recursive: true });
  const targets = process.argv.slice(2);
  for (const target of targets.length ? targets : ['darwin-arm64', 'win32-x64']) {
    const [platform, arch] = target.split('-');
    if (!['darwin-arm64', 'darwin-x64', 'win32-x64'].includes(target)) throw new Error('Target non supportato: ' + target);
    const staging = await fs.mkdtemp(path.join(os.tmpdir(), 'social-package-'));
    try {
    const result = await packager({
      dir: root, name: pkg.productName, out: staging, platform, arch,
      electronVersion: pkg.devDependencies.electron,
      appBundleId: 'it.progettoilseme.social',
      icon: path.join(root, 'build', platform === 'darwin' ? 'socialdesk.icns' : 'socialdesk.ico'),
      appCopyright: 'Progetto il Seme',
      overwrite: true, prune: true, asar: false,
      ignore: [/^\/(?:test|scripts|Mac|Windows|Logo|dist|out|distribuzioni)(?:\/|$)/, /^\/(?:AGENTS\.md|versione\.json)$/, /^\/[^/]+\.(?:xlsx|ai)$/, /^\/package-lock\.json$/, /^\/node_modules\/@napi-rs(?:\/|$)/],
      ...(cacheRoot ? { download: { cacheRoot } } : {}),
    });
    if (platform === 'darwin' && process.platform === 'darwin') {
      for (const folder of result) {
        const bundle = path.join(folder, pkg.productName+'.app');
        execFileSync('/usr/bin/xattr', ['-cr', bundle]);
        execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', bundle], {stdio:'inherit'});
        execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle], {stdio:'inherit'});
        execFileSync('/usr/bin/ditto', ['-c', '-k', '--norsrc', '--noextattr', '--keepParent', bundle, path.join(out, `${pkg.productName}-Mac-${arch}.zip`)]);
      }
    }
    if (platform === 'win32') {
      // Installer NSIS per utente (nessun permesso di amministratore), in
      // %LOCALAPPDATA%\Programs\SocialDesk. Rieseguire un installer, anche di una
      // versione più recente, aggiorna l'installazione esistente: NSIS la riconosce
      // dall'appId, la disinstalla e installa la nuova versione, conservando i dati
      // in %APPDATA%\SocialDesk. NON cambiare appId: un nuovo appId creerebbe una
      // seconda installazione separata invece di aggiornare quella esistente.
      const { build, Platform, Arch } = require('electron-builder');
      const ico = path.join(root, 'build', 'socialdesk.ico');
      const setupName = `${pkg.productName}-Setup-${pkg.version}.exe`;
      for (const folder of result) {
        await build({
          targets: Platform.WINDOWS.createTarget('nsis', Arch.x64),
          prepackaged: folder, publish: 'never',
          config: {
            appId: 'it.progettoilseme.social', productName: pkg.productName,
            copyright: 'Progetto il Seme',
            directories: { output: path.join(staging, 'installer') },
            win: { signAndEditExecutable: false, icon: ico },
            nsis: {
              oneClick: true, perMachine: false, runAfterFinish: true,
              createDesktopShortcut: true, createStartMenuShortcut: true, shortcutName: pkg.productName,
              deleteAppDataOnUninstall: false, installerIcon: ico, uninstallerIcon: ico,
              uninstallDisplayName: pkg.productName, language: '1040', artifactName: setupName,
            },
          },
        });
        const setup = path.join(staging, 'installer', setupName);
        await fs.copyFile(setup, path.join(out, setupName));
        console.log(path.join(out, setupName));
      }
    }
    for (const folder of result) {
      const destination = path.join(out, path.basename(folder));
      await fs.rm(destination, {recursive:true, force:true});
      await fs.cp(folder, destination, {recursive:true, verbatimSymlinks:true});
      console.log(destination);
    }
    } finally { await fs.rm(staging, {recursive:true, force:true}); }
  }
  // versione.json va copiato nella cartella "App Social" della cartella Social, accanto a
  // Mac/SocialDesk.app, Mac/SocialDesk-Mac.zip (= SocialDesk-Mac-arm64.zip, usato dall'aggiornamento:
  // un solo file dal NAS) e Windows/SocialDesk-Setup-<versione>.exe: l'app lo legge per proporre
  // l'aggiornamento. Note facoltative con SOCIAL_NOTES="...".
  const manifest = { version: pkg.version, macZip: 'Mac/SocialDesk-Mac.zip', windows: `Windows/${pkg.productName}-Setup-${pkg.version}.exe`, notes: process.env.SOCIAL_NOTES || '' };
  await fs.writeFile(path.join(out, 'versione.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(path.join(out, 'versione.json'));
})().catch(error => { console.error(error); process.exitCode = 1; });
