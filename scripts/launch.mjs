import { spawn, execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const url = "http://127.0.0.1:4318";
const ready = async () => {
  try {
    const response = await fetch(`${url}/api/health`, {
      signal: AbortSignal.timeout(800),
    });
    return (
      response.ok && (await response.json()).name === "Mello PC Diagnostic"
    );
  } catch {
    return false;
  }
};
const alreadyRunning = await ready();
const child = alreadyRunning
  ? null
  : spawn(process.execPath, ["server/index.js"], { cwd, stdio: "inherit" });
if (child) {
  child.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.on("exit", (code) => process.exit(code || 0));
}
let available = alreadyRunning;
for (let attempt = 0; attempt < 40 && !available; attempt++) {
  await new Promise((resolve) => setTimeout(resolve, 250));
  available = await ready();
}
if (!available) {
  console.error(
    "Não foi possível iniciar o coletor local. Verifique se a porta 4318 está disponível.",
  );
  child?.kill();
  process.exitCode = 1;
} else {
  console.log(
    "Mello iniciado. Mantenha esta janela aberta durante o uso. Ctrl+C encerra o programa.",
  );
  if (process.argv.includes("--no-open"))
    console.log("Abertura automática do navegador desativada.");
  else if (process.platform === "win32")
    execFile("cmd.exe", ["/c", "start", "", url]);
  else
    execFile(
      process.platform === "darwin" ? "open" : "xdg-open",
      [url],
      (error) => {
        if (error)
          console.log("Abra o endereço local informado acima no navegador.");
      },
    );
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    child?.kill();
    if (!child) process.exit();
  });
