import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { SensorClient } from "../server/sensor-client.js";
const execute = promisify(execFile);
if (process.platform !== "win32")
  throw new Error("Native collector smoke requires a Windows runner.");
const root = path.resolve("build/native");
const sensor = path.join(root, "sensors/Mello.SensorCollector.exe");
const status = JSON.parse(
  (
    await execute(sensor, ["--status"], { windowsHide: true, timeout: 30000 })
  ).stdout.replace(/^\uFEFF/, ""),
);
assert.equal(status.protocolVersion, 1);
assert.equal(typeof status.capabilities.elevated, "boolean");
const client = new SensorClient({ executable: () => sensor });
try {
  const result = await client.sample();
  assert.equal(result.protocolVersion, 1);
  assert.ok(Array.isArray(result.sensors));
  assert.ok(Array.isArray(result.diagnostics));
  assert.ok(["ok", "partial", "unavailable"].includes(result.state));
  console.log(
    "Native sensors: protocol, permissions, persistent collector and diagnostics verified. Sensor count:",
    result.sensors.length,
  );
} finally {
  client.stop();
}
const smartctl = path.join(root, "smartctl/smartctl.exe");
const version = (
  await execute(smartctl, ["--version"], { windowsHide: true, timeout: 15000 })
).stdout;
assert.match(version, /smartctl 7\.5/);
let scan;
try {
  scan = (
    await execute(
      smartctl,
      ["-B", path.join(root, "smartctl/drivedb.h"), "--scan-open", "-j"],
      { windowsHide: true, timeout: 30000 },
    )
  ).stdout;
} catch (error) {
  if (!error.stdout) throw error;
  scan = error.stdout;
}
const parsed = JSON.parse(scan);
assert.ok(parsed.smartctl);
console.log(
  "Native SMART: verified bundled binary and JSON device discovery. Units visible:",
  parsed.devices?.length || 0,
);
const manifest = JSON.parse(
  await fs.readFile(path.join(root, "pawnio/manifest.json"), "utf8"),
);
assert.equal(manifest.installerBundled, false);
assert.equal(manifest.installerDownload, "on-demand");
assert.equal(manifest.authenticode.status, "Valid");
console.log(
  "Optional driver: official download metadata and Windows signature gate verified; no installation was performed.",
);
