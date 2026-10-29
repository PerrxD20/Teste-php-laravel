import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'native/sensors/source-artifacts.json'), 'utf8'));
const cache = path.join(root, 'build/download-cache/sensor-sources');
const output = path.join(root, 'build/native/sensors/source');
await fs.mkdir(cache, { recursive: true });
const digest = data => crypto.createHash('sha256').update(data).digest('hex');

async function verifiedSource(source) {
  if (new URL(source.url).protocol !== 'https:') throw new Error('Source archives require HTTPS.');
  if (!/^[a-f0-9]{64}$/.test(source.sha256)) throw new Error('Missing pinned SHA-256.');
  if (path.basename(source.file) !== source.file) throw new Error('Invalid source archive filename.');
  const cached = path.join(cache, source.file);
  const previous = await fs.readFile(cached).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
  if (!previous || digest(previous) !== source.sha256) {
    const pending = cached + '.download';
    try {
      await exec(process.platform === 'win32' ? 'curl.exe' : 'curl', [
        '--fail', '--location', '--silent', '--show-error', '--retry', '2',
        '--proto', '=https', '--proto-redir', '=https', '--max-time', '120',
        source.url, '--output', pending,
      ], { timeout: 150000, maxBuffer: 1024 * 1024, windowsHide: true });
      const data = await fs.readFile(pending);
      if (data.length > 20 * 1024 ** 2 || digest(data) !== source.sha256)
        throw new Error(`Source integrity mismatch: ${source.file}; refusing distribution.`);
      await fs.rename(pending, cached);
    } catch (error) { await fs.rm(pending, { force: true }); throw error; }
  }
  const listed = await exec(process.platform === 'win32' ? 'tar.exe' : 'tar', ['-tzf', cached], { timeout: 30000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
  const files = new Set(listed.stdout.split(/\r?\n/).filter(Boolean));
  if ([...files].some(file => !file.startsWith(source.prefix) || file.split('/').includes('..')))
    throw new Error(`Unexpected source archive layout: ${source.file}`);
  if (!files.has(source.prefix + (source.id === 'PawnIO.Modules' ? 'COPYING' : 'LICENSE')))
    throw new Error(`Source license missing: ${source.file}`);
  if (source.id === 'PawnIO.Modules') {
    for (const module of manifest.pawnIOModules.modules)
      if (!files.has(source.prefix + module.source)) throw new Error(`Module source missing: ${module.source}`);
    for (const required of [manifest.pawnIOModules.compilerSource, manifest.pawnIOModules.buildInstructions, 'include/pawnio.inc', 'include/core.inc'])
      if (!files.has(source.prefix + required)) throw new Error(`Build/compiler source missing: ${required}`);
    if ([...files].some(file => file.endsWith('/.gitmodules')))
      throw new Error('Unexpected source submodules: corresponding submodule sources must be added before distribution.');
  }
  return { source, cached };
}

// Download and verify everything before altering the distribution directory.
const sources = await Promise.all(manifest.sources.map(verifiedSource));
await fs.mkdir(output, { recursive: true });
for (const { source, cached } of sources) {
  await fs.copyFile(cached, path.join(output, source.file));
  console.log(`Corresponding source staged: ${source.file} SHA-256 ${source.sha256}`);
}
await fs.writeFile(path.join(output, 'SOURCE-PROVENANCE.json'), JSON.stringify(manifest, null, 2) + '\n');
await fs.writeFile(path.join(output, 'README.txt'), `Corresponding source for the unmodified sensor dependencies distributed with Mello.\n\nLibreHardwareMonitorLib 0.9.6: ${manifest.library.sourceCommit}\nPawnIO.Modules 0.2.2: ${manifest.pawnIOModules.sourceCommit}\n\nBoth complete source archives are provided here, including licenses, headers and build scripts. The PawnIO.Modules archive also includes its Pawn compiler source RPM; it has no git submodules and does not use PawnPP at this version.\n\nThe official source resources in LibreHardwareMonitor 0.9.6 contain twelve signed modules that match the PawnIO.Modules 0.2.2 release byte-for-byte. SOURCE-PROVENANCE.json records every module hash and the official release-archive digest. The upstream resource README claiming 0.1.6 is stale.\n\nModule rebuild instructions: extract PawnIO.Modules-0.2.2-source.tar.gz, see .github/workflows/ci.yml. Upstream uses Oracle Linux 9, installs the included Pawn compiler RPM, then runs pawncc on each .p with '-iinclude' '-C64' '-;+' '-(+' '-p'. Compiler source is included as _pawn/pawn-4.1.7152-1.el9.src.rpm.\n\nThe sensor library remains an ordinary replaceable DLL; this application does not restrict modifications/debugging permitted by its third-party licenses. Source archives are data only and are not executed by this preparation script.\n`);
console.log('Sensor corresponding-source distribution verified.');
