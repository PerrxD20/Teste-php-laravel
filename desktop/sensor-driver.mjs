import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { powershell, restartNativeCollectors } from "../server/native.js";

const EXPECTED = {
  version: "2.2.0",
  sha256: "1f519a22e47187f70a1379a48ca604981c4fcf694f4e65b734aaa74a9fba3032",
  thumbprint: "F380DCC9F706E2756A5047B832FFE719E1BC35F5",
};
let pending = null;
export async function installSensorDriver({ cacheDirectory } = {}) {
  if (process.platform !== "win32")
    throw new Error("O driver de sensores é específico para Windows.");
  if (pending) return pending;
  pending = openVerifiedInstaller(cacheDirectory).finally(() => {
    pending = null;
  });
  return pending;
}
async function openVerifiedInstaller(cacheDirectory) {
  if (!cacheDirectory)
    throw new Error("Diretório de cache do aplicativo indisponível.");
  const filename = path.join(cacheDirectory, "PawnIO-2.2.0-setup.exe");
  let data = await fs.readFile(filename).catch(() => null);
  if (
    !data ||
    createHash("sha256").update(data).digest("hex") !== EXPECTED.sha256
  ) {
    const response = await fetch(
      "https://github.com/namazso/PawnIO.Setup/releases/download/2.2.0/PawnIO_setup.exe",
      { signal: AbortSignal.timeout(120000) },
    );
    if (!response.ok || new URL(response.url).protocol !== "https:")
      throw new Error(
        "Não foi possível baixar o instalador oficial. Verifique sua conexão com a internet.",
      );
    const reader = response.body.getReader();
    const chunks = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 16 * 1024 * 1024) {
        await reader.cancel();
        throw new Error(
          "O instalador excedeu o tamanho esperado. Download cancelado.",
        );
      }
      chunks.push(value);
    }
    data = Buffer.concat(chunks);
    if (createHash("sha256").update(data).digest("hex") !== EXPECTED.sha256)
      throw new Error(
        "A integridade do download oficial não pôde ser confirmada.",
      );
    await fs.mkdir(cacheDirectory, { recursive: true });
    await fs.writeFile(filename + ".download", data);
    await fs.rename(filename + ".download", filename);
  }
  if (createHash("sha256").update(data).digest("hex") !== EXPECTED.sha256)
    throw new Error(
      "A integridade do instalador de sensores não pôde ser confirmada. Reinstale o Mello.",
    );
  // Encode the path rather than interpolating it as PowerShell code.
  const encoded = Buffer.from(filename, "utf8").toString("base64");
  const status = await powershell(
    `$p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')); $s=Get-AuthenticodeSignature -LiteralPath $p; [PSCustomObject]@{status=[string]$s.Status; thumbprint=$s.SignerCertificate.Thumbprint} | ConvertTo-Json`,
  );
  if (
    status.status !== "Valid" ||
    status.thumbprint?.toUpperCase() !== EXPECTED.thumbprint
  )
    throw new Error(
      "A assinatura do instalador oficial não foi validada pelo Windows. Verifique a conexão e a integridade da instalação.",
    );
  const result = await powershell(
    `$p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')); $installer=Start-Process -FilePath $p -Verb RunAs -PassThru -Wait; [PSCustomObject]@{exitCode=$installer.ExitCode} | ConvertTo-Json`,
    10 * 60 * 1000,
  );
  if (![0, 3010].includes(result.exitCode))
    throw new Error(
      "A instalação foi cancelada ou não foi concluída. Nenhuma permissão foi concedida ao Mello automaticamente.",
    );
  restartNativeCollectors();
  return {
    message:
      result.exitCode === 3010
        ? "Driver instalado. O Windows solicitou uma reinicialização; salve seu trabalho antes de reiniciar."
        : "Instalador encerrado. Atualize os sensores para conferir as leituras disponíveis.",
    restartRequired: result.exitCode === 3010,
  };
}
