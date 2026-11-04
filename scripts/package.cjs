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
      ignore: [/^\/(?:test|scripts)(?:\/|$)/, /^\/package-lock\.json$/, /^\/node_modules\/@napi-rs(?:\/|$)/],
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
    for (const folder of result) {
      const destination = path.join(out, path.basename(folder));
      await fs.rm(destination, {recursive:true, force:true});
      await fs.cp(folder, destination, {recursive:true, verbatimSymlinks:true});
      console.log(destination);
    }
    } finally { await fs.rm(staging, {recursive:true, force:true}); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
