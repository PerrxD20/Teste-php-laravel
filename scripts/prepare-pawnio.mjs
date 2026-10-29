import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const metadataRoot = path.join(project, "native/pawnio");
const manifest = JSON.parse(
  await fs.readFile(path.join(metadataRoot, "manifest.json"), "utf8"),
);
const downloadOnly = process.argv.includes("--download-only");
if (process.platform !== "win32" && !downloadOnly) {
  throw new Error(
    "PawnIO distribution must be prepared on Windows so Authenticode can be checked. --download-only verifies downloads without staging a distribution.",
  );
}
const cache = path.resolve(
  process.env.MELLO_NATIVE_CACHE ||
    path.join(os.tmpdir(), "mello-native-cache"),
  `pawnio-${manifest.version}`,
);
const output = path.join(project, "build/native/pawnio");
await fs.mkdir(cache, { recursive: true });

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}
async function verifiedDownload(artifact) {
  const cached = path.join(cache, path.basename(artifact.file));
  const previous = await fs.readFile(cached).catch(() => null);
  if (previous && sha256(previous) === artifact.sha256) return cached;
  const temporary = cached + ".download";
  try {
    await exec(
      process.platform === "win32" ? "curl.exe" : "curl",
      [
        "--fail",
        "--location",
        "--silent",
        "--show-error",
        "--retry",
        "2",
        "--max-time",
        "180",
        artifact.url,
        "--output",
        temporary,
      ],
      { timeout: 210000, maxBuffer: 1024 * 1024, windowsHide: true },
    );
    const data = await fs.readFile(temporary);
    if (sha256(data) !== artifact.sha256)
      throw new Error(`SHA-256 mismatch: ${artifact.file}`);
    await fs.rename(temporary, cached);
    return cached;
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
}
const installer = await verifiedDownload(manifest);
const sources = await Promise.all(
  manifest.sources.map(async (source) => ({
    metadata: source,
    cached: await verifiedDownload(source),
  })),
);
if (process.platform !== "win32") {
  console.log(
    `PawnIO ${manifest.version}: official installer and corresponding source SHA-256 verified. Authenticode remains unchecked; no distribution staged. Cache: ${cache}`,
  );
} else {
  const signatureScript = `$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $s=Get-AuthenticodeSignature -LiteralPath $env:MELLO_PAWNIO_VERIFY_FILE; [PSCustomObject]@{status=[string]$s.Status; signerSubject=$s.SignerCertificate.Subject; signerThumbprint=$s.SignerCertificate.Thumbprint} | ConvertTo-Json -Compress`;
  const encoded = Buffer.from(signatureScript, "utf16le").toString("base64");
  const result = await exec(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
    {
      timeout: 60000,
      windowsHide: true,
      env: { ...process.env, MELLO_PAWNIO_VERIFY_FILE: installer },
    },
  );
  const signature = JSON.parse(result.stdout.replace(/^\uFEFF/, "").trim());
  if (
    signature.status !== "Valid" ||
    signature.signerThumbprint?.toUpperCase() !==
      manifest.expectedSignerThumbprint
  ) {
    throw new Error(
      `Refusing PawnIO installer: expected trusted upstream signer and Valid Authenticode, received ${signature.status}/${signature.signerThumbprint || "no certificate"}`,
    );
  }
  // Stage metadata/source only. The installer wrapper is not redistributed.
  // It may be downloaded by the app only after the user explicitly requests it.
  await fs.mkdir(output, { recursive: true });
  await fs.rm(path.join(output, manifest.file), { force: true });
  for (const { metadata, cached } of sources) {
    const destination = path.join(output, metadata.file);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(cached, destination);
  }
  for (const file of [
    "COPYING.PawnIO",
    "LICENSE.PawnPP",
    "UPSTREAM-PawnIO-README.md",
    "SOURCE-README.md",
  ]) {
    await fs.copyFile(path.join(metadataRoot, file), path.join(output, file));
  }
  const staged = {
    ...manifest,
    authenticode: { ...signature, checkedOn: "win32" },
  };
  await fs.writeFile(
    path.join(output, "manifest.json"),
    JSON.stringify(staged, null, 2) + "\n",
  );
  console.log(
    `PawnIO ${manifest.version}: SHA-256 and Windows Authenticode Valid verified; staged on-demand installer metadata, notices and source only (no installer binary).`,
  );
}
