import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import * as PE from "resedit";
const root = path.resolve("release");
const pkg = JSON.parse(await fs.readFile("package.json", "utf8"));
const runtime = path.join(root, "win-unpacked");
const executable = PE.NtExecutable.from(
  await fs.readFile(path.join(runtime, "Mello PC Diagnostic.exe")),
);
const resources = PE.NtExecutableResource.from(executable);
const versions = PE.Resource.VersionInfo.fromEntries(resources.entries);
assert.ok(versions.length);
assert.ok(PE.Resource.IconGroupEntry.fromEntries(resources.entries).length);
const productNames = versions.flatMap((info) =>
  info
    .getAllLanguagesForStringValues()
    .map((lang) => info.getStringValues(lang).ProductName),
);
assert.ok(productNames.includes("Mello PC Diagnostic"));
const packed = path.join(runtime, "resources/app");
for (const file of [
  "desktop/main.mjs",
  "server/index.js",
  "server/native.js",
  "server/ram-worker.js",
  "dist/index.html",
  "node_modules/systeminformation/lib/index.js",
  "build/icons/mello.png",
]) {
  await fs.access(path.join(packed, file));
}
const manifest = JSON.parse(
  await fs.readFile(path.join(packed, "package.json"), "utf8"),
);
assert.equal(manifest.version, pkg.version);
assert.equal(manifest.main, "desktop/main.mjs");
const native = path.join(runtime, "resources/native");
for (const file of [
  "sensors/Mello.SensorCollector.exe",
  "sensors/LibreHardwareMonitorLib.dll",
  "sensors/coreclr.dll",
  "sensors/source/SOURCE-PROVENANCE.json",
  "smartctl/smartctl.exe",
  "smartctl/drivedb.h",
  "smartctl/COPYING.txt",
  "smartctl/source/smartmontools-7.5.tar.gz",
  "pawnio/manifest.json",
])
  await fs.access(path.join(native, file));
const driverManifest = JSON.parse(
  await fs.readFile(path.join(native, "pawnio/manifest.json"), "utf8"),
);
assert.equal(driverManifest.installerBundled, false);
assert.equal(driverManifest.authenticode.status, "Valid");
const names = ["Setup", "Portable"].map(
  (kind) => `Mello-PC-Diagnostic-${kind}-${pkg.version}-x64.exe`,
);
const checksums = [];
for (const name of names) {
  const data = await fs.readFile(path.join(root, name));
  assert.equal(data.toString("ascii", 0, 2), "MZ");
  assert.ok(data.length > 30 * 1024 ** 2, `${name} is suspiciously small`);
  const hash = crypto.createHash("sha256").update(data).digest("hex");
  checksums.push(`${hash}  ${name}`);
  console.log(
    `${name}: ${(data.length / 1024 ** 2).toFixed(1)} MiB; SHA-256 ${hash}`,
  );
}
await fs.writeFile(
  path.join(root, "SHA256SUMS.txt"),
  checksums.join("\n") + "\n",
);
console.log(
  "Windows distribution: branded resources, complete runtime, RAM worker, installer and portable verified.",
);
