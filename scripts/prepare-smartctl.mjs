import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getPath7za } from "app-builder-lib/out/toolsets/7zip.js";

const execute = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const definition = path.join(root, "native/smartctl");
const upstream = JSON.parse(
  await fs.readFile(path.join(definition, "upstream.json"), "utf8"),
);
const cache = path.join(
  root,
  "build/download-cache",
  `smartmontools-${upstream.version}`,
);
const output = path.join(root, "build/native/smartctl");
const hash = (data) => crypto.createHash("sha256").update(data).digest("hex");

async function verifiedArtifact(artifact) {
  await fs.mkdir(cache, { recursive: true });
  const filename = path.join(cache, artifact.filename);
  try {
    if (hash(await fs.readFile(filename)) === artifact.sha256) return filename;
    // An invalid cache is never used. Replace it only after a fresh download
    // has passed the pinned digest check.
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (new URL(artifact.url).protocol !== "https:")
    throw new Error("Artifact transport must be HTTPS.");
  console.log("Downloading verified upstream artifact:", artifact.filename);
  const response = await fetch(artifact.url, {
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok)
    throw new Error(`${artifact.filename}: HTTP ${response.status}`);
  if (new URL(response.url).protocol !== "https:")
    throw new Error("Artifact redirect must preserve HTTPS.");
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length > 25 * 1024 * 1024)
    throw new Error("Unexpectedly large smartmontools artifact.");
  if (hash(data) !== artifact.sha256)
    throw new Error(
      `Integrity mismatch: ${artifact.filename}. Expected pinned upstream SHA-256; refusing extraction.`,
    );
  const pending = filename + ".verified-download";
  await fs.writeFile(pending, data);
  await fs.rename(pending, filename);
  return filename;
}

const installer = await verifiedArtifact(upstream.installer);
const source = await verifiedArtifact(upstream.source);
const sevenZip = await getPath7za(); // Pinned electron-builder toolset verifies its own artifact digest.
const temporary = await fs.mkdtemp(path.join(cache, "extract-"));
try {
  await execute(
    sevenZip,
    [
      "x",
      "-y",
      "-bd",
      "-bb0",
      `-o${temporary}`,
      installer,
      upstream.smartctl.archivePath,
      upstream.driveDatabase.archivePath,
      "doc/COPYING.txt",
      "doc/AUTHORS.txt",
      "doc/INSTALL.txt",
      "doc/README.txt",
      "doc/checksums64.txt",
    ],
    { windowsHide: true, timeout: 60000, maxBuffer: 1024 * 1024 },
  );
  const binary = await fs.readFile(
    path.join(temporary, upstream.smartctl.archivePath),
  );
  const database = await fs.readFile(
    path.join(temporary, upstream.driveDatabase.archivePath),
  );
  if (
    hash(binary) !== upstream.smartctl.sha256 ||
    hash(database) !== upstream.driveDatabase.sha256
  ) {
    throw new Error(
      "Extracted smartctl/database failed individual SHA-256 checks.",
    );
  }
  const peOffset = binary.readUInt32LE(0x3c);
  if (
    binary.toString("ascii", 0, 2) !== "MZ" ||
    binary.toString("ascii", peOffset, peOffset + 4) !== "PE\0\0" ||
    binary.readUInt16LE(peOffset + 4) !== 0x8664
  ) {
    throw new Error(
      "The selected smartctl is not a Windows x64 PE executable.",
    );
  }
  if (process.platform === "win32") {
    const probe = await execute(
      path.join(temporary, upstream.smartctl.archivePath),
      ["--version"],
      { windowsHide: true, timeout: 15000 },
    );
    const banner = probe.stdout.split(/\r?\n/, 1)[0];
    if (
      !banner.startsWith(`smartctl ${upstream.version} `) ||
      !banner.includes(`r${upstream.revision}`)
    )
      throw new Error("Unexpected smartctl runtime version.");
  }
  const staged = path.join(temporary, "distribution");
  await fs.mkdir(path.join(staged, "source"), { recursive: true });
  await fs.copyFile(
    path.join(temporary, upstream.smartctl.archivePath),
    path.join(staged, "smartctl.exe"),
  );
  await fs.copyFile(
    path.join(temporary, upstream.driveDatabase.archivePath),
    path.join(staged, "drivedb.h"),
  );
  for (const file of [
    "COPYING.txt",
    "AUTHORS.txt",
    "INSTALL.txt",
    "README.txt",
    "checksums64.txt",
  ]) {
    await fs.copyFile(
      path.join(temporary, "doc", file),
      path.join(staged, file),
    );
  }
  await fs.copyFile(
    source,
    path.join(staged, "source", upstream.source.filename),
  );
  await fs.copyFile(
    path.join(definition, "NOTICE.md"),
    path.join(staged, "NOTICE.md"),
  );
  await fs.copyFile(
    path.join(definition, "upstream.json"),
    path.join(staged, "UPSTREAM.json"),
  );
  const sums = [
    `${upstream.smartctl.sha256}  smartctl.exe`,
    `${upstream.driveDatabase.sha256}  drivedb.h`,
    `${upstream.source.sha256}  source/${upstream.source.filename}`,
  ];
  await fs.writeFile(
    path.join(staged, "SHA256SUMS.txt"),
    sums.join("\n") + "\n",
  );
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.rm(output, { recursive: true, force: true });
  await fs.cp(staged, output, { recursive: true });
  console.log(
    `smartctl ${upstream.version} x64, drive database, licenses and corresponding source ready: ${path.relative(root, output)}`,
  );
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}
