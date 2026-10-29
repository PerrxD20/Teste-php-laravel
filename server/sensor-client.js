import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { sensorExecutable } from "./native-tools.js";
const unsupported = {
  protocolVersion: 1,
  state: "unsupported",
  source: "LibreHardwareMonitorLib",
  sensors: [],
  diagnostics: ["O coletor de sensores incorporado é específico para Windows."],
  capabilities: {},
};
export class SensorClient {
  constructor({
    platform = process.platform,
    executable = sensorExecutable,
    spawnProcess = spawn,
    timeoutMs = 30000,
  } = {}) {
    this.platform = platform;
    this.executable = executable;
    this.spawnProcess = spawnProcess;
    this.timeoutMs = timeoutMs;
    this.child = null;
    this.pending = null;
    this.buffer = "";
    this.nextId = 0;
    this.cached = null;
    this.cachedAt = 0;
  }
  async sample() {
    if (this.platform !== "win32") return unsupported;
    if (this.pending) return this.pending.promise;
    if (this.cached && Date.now() - this.cachedAt < 1500) return this.cached;
    const filename = this.executable();
    try {
      await access(filename);
    } catch {
      return this.failure(
        "Coletor incorporado não encontrado. Reinstale a versão completa do Mello.",
      );
    }
    if (this.pending) return this.pending.promise;
    if (!this.child) this.start(filename);
    const child = this.child;
    const id = String(++this.nextId);
    let resolve;
    const promise = new Promise((done) => {
      resolve = done;
    });
    const timer = setTimeout(() => {
      this.finish(
        this.failure(
          "O coletor de sensores excedeu o tempo de resposta. Uma nova tentativa será feita na próxima leitura.",
        ),
      );
      this.stop();
    }, this.timeoutMs);
    this.pending = { id, promise, resolve, timer };
    child.stdin.write(
      JSON.stringify({ command: "sample", id }) + "\n",
      (error) => {
        if (error) {
          this.finish(
            this.failure(
              "Não foi possível comunicar com o coletor de sensores.",
            ),
          );
          this.stop();
        }
      },
    );
    return promise;
  }
  failure(message) {
    return {
      protocolVersion: 1,
      state: "unavailable",
      source: "LibreHardwareMonitorLib",
      sensors: [],
      diagnostics: [message],
      capabilities: {},
    };
  }
  start(filename) {
    this.buffer = "";
    const child = this.spawnProcess(filename, ["--stdio"], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (data) => {
      if (this.child !== child) return;
      this.buffer += data;
      if (this.buffer.length > 4 * 1024 * 1024) {
        this.finish(
          this.failure("A resposta do coletor ultrapassou o limite permitido."),
        );
        this.stop();
        return;
      }
      let newline;
      while ((newline = this.buffer.indexOf("\n")) !== -1) {
        const line = this.buffer
          .slice(0, newline)
          .replace(/^\uFEFF/, "")
          .trim();
        this.buffer = this.buffer.slice(newline + 1);
        if (!line) continue;
        try {
          const data = JSON.parse(line);
          if (data.protocolVersion !== 1 || !Array.isArray(data.sensors))
            throw new Error("Unsupported collector protocol");
          if (
            this.pending &&
            data.id != null &&
            String(data.id) !== this.pending.id
          )
            continue;
          this.finish(data);
        } catch {
          this.finish(
            this.failure(
              "Resposta inválida do coletor incorporado. Reinstale a versão completa do Mello.",
            ),
          );
          this.stop();
        }
      }
    });
    child.stderr.on("data", () => {}); // Native library diagnostics stay out of the JSON protocol.
    const failed = () => {
      if (this.child !== child) return;
      this.child = null;
      this.finish(
        this.failure(
          "O coletor nativo foi encerrado. Verifique permissões e componentes do instalador.",
        ),
      );
    };
    child.stdin.on("error", failed);
    child.on("error", failed);
    child.on("exit", failed);
  }
  finish(result) {
    const pending = this.pending;
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending = null;
    this.cached = result;
    this.cachedAt = Date.now();
    pending.resolve(result);
  }
  stop() {
    const child = this.child;
    this.child = null;
    if (this.pending)
      this.finish(
        this.failure("O coletor foi reiniciado. Aguarde a próxima leitura."),
      );
    this.cached = null;
    this.cachedAt = 0;
    if (child) {
      child.stdin.end();
      child.kill();
    }
  }
}
export const sensorClient = new SensorClient();
