import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { execFile } from "node:child_process";
import { collect, refresh, drivers, driverUpdates } from "./native.js";
import { timingSafeEqual } from "node:crypto";
export function createApp({ desktop = false, apiToken = null } = {}) {
  const app = express();
  if (desktop)
    app.use((req, res, next) => {
      res.set(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      );
      next();
    });
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1kb" }));
  app.use("/api", (req, res, next) => {
    const host = req.hostname;
    if (!["127.0.0.1", "localhost", "[::1]"].includes(host))
      return res
        .status(403)
        .json({ error: "A coleta é acessível somente pelo endereço local." });
    if (apiToken) {
      const supplied = Buffer.from(req.get("X-Mello-Token") || "");
      const expected = Buffer.from(apiToken);
      if (
        supplied.length !== expected.length ||
        !timingSafeEqual(supplied, expected)
      ) {
        return res
          .status(403)
          .json({ error: "Requisição não autorizada pelo aplicativo." });
      }
    }
    res.set("Cache-Control", "no-store");
    res.set("X-Content-Type-Options", "nosniff");
    if (req.method !== "GET") {
      const allowed = [
        "http://127.0.0.1:4318",
        "http://localhost:4318",
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        `http://${req.get("host")}`,
      ];
      if (req.get("origin") && !allowed.includes(req.get("origin")))
        return res.status(403).json({ error: "Origem não autorizada." });
      if (!req.is("application/json"))
        return res.status(415).json({ error: "Envie application/json." });
    }
    next();
  });
  let cached = null;
  let collecting = null;
  let refreshing = null;
  let activeRam = null;
  let ram = { state: "idle", progress: 0, result: null, error: null };
  let updateJob = { state: "idle", result: null, error: null };
  async function scan(deep) {
    if (collecting) {
      const existing = await collecting;
      return deep && !existing.deep ? scan(true) : existing;
    }
    collecting = collect(deep)
      .then((data) => {
        cached = data;
        return data;
      })
      .finally(() => {
        collecting = null;
      });
    return collecting;
  }
  app.get("/api/health", (req, res) =>
    res.json({
      status: "ok",
      name: "Mello PC Diagnostic",
      platform: process.platform,
    }),
  );
  app.get("/api/snapshot", async (req, res) => {
    if (!cached) return res.json(await scan(false));
    if (collecting) return res.json(await collecting);
    if (Date.now() - Date.parse(cached.collectedAt) < 3000)
      return res.json(cached);
    if (!refreshing) {
      const base = cached;
      refreshing = refresh(base)
        .then((data) => {
          if (cached === base && !collecting) cached = data;
          return cached;
        })
        .finally(() => {
          refreshing = null;
        });
    }
    res.json(await refreshing);
  });
  app.post("/api/scan", async (req, res) =>
    res.json(await scan(req.body?.deep === true)),
  );
  app.get("/api/drivers", async (req, res) =>
    res.json({ drivers: await drivers(), platform: process.platform }),
  );
  app.post("/api/drivers/check", (req, res) => {
    if (updateJob.state === "running") return res.status(202).json(updateJob);
    updateJob = { state: "running", result: null, error: null };
    driverUpdates()
      .then((result) => {
        updateJob = { state: "done", result, error: null };
      })
      .catch((error) => {
        updateJob = { state: "error", result: null, error: error.message };
      });
    res.status(202).json(updateJob);
  });
  app.get("/api/drivers/check", (req, res) => res.json(updateJob));
  app.post("/api/ram/test", (req, res) => {
    if (activeRam) return res.status(202).json(ram);
    ram = { state: "running", progress: 0, result: null, error: null };
    const worker = new Worker(new URL("./ram-worker.js", import.meta.url));
    activeRam = worker;
    const timer = setTimeout(() => {
      ram = {
        ...ram,
        state: "error",
        error: "O teste excedeu 30 segundos e foi interrompido.",
      };
      worker.terminate();
    }, 30000);
    worker.on("message", (message) => {
      if (message.type === "progress")
        ram = { ...ram, progress: message.progress };
      if (message.type === "result")
        ram = {
          state: "done",
          progress: 100,
          result: message.result,
          error: null,
        };
    });
    worker.on("error", (error) => {
      ram = { ...ram, state: "error", error: error.message };
    });
    worker.on("exit", (code) => {
      clearTimeout(timer);
      if (ram.state === "running")
        ram = {
          ...ram,
          state: "error",
          error: `O teste foi interrompido (código ${code}).`,
        };
      activeRam = null;
    });
    res.status(202).json(ram);
  });
  app.get("/api/ram/test", (req, res) => res.json(ram));
  app.post("/api/ram/native", (req, res) => {
    if (process.platform !== "win32")
      return res.status(400).json({
        error: "O diagnóstico nativo está disponível somente no Windows.",
      });
    if (req.body?.confirmed !== true)
      return res
        .status(400)
        .json({ error: "Confirme a abertura do diagnóstico." });
    // Opens the Windows dialog. Never schedules a reboot or restarts automatically.
    execFile("mdsched.exe", [], { windowsHide: false }, (error) => {
      if (error)
        console.error("Não foi possível abrir mdsched:", error.message);
    });
    res.json({
      message:
        "A abertura do Diagnóstico de Memória do Windows foi solicitada. Escolha quando executar na janela do Windows.",
    });
  });
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  app.use(express.static(path.join(root, "dist")));
  app.get("/{*path}", (req, res) => {
    if (req.path.startsWith("/api/"))
      return res.status(404).json({ error: "Endpoint não encontrado." });
    res.sendFile(path.join(root, "dist/index.html"));
  });
  app.use((error, req, res, next) => {
    console.error(error.message);
    res.status(500).json({
      error:
        "Não foi possível concluir a coleta. Verifique as permissões e tente novamente.",
    });
  });

  return {
    app,
    stopJobs: async () => {
      if (activeRam) await activeRam.terminate();
    },
  };
}

export async function startServer({
  port = 4318,
  desktop = false,
  apiToken = null,
} = {}) {
  const { app, stopJobs } = createApp({ desktop, apiToken });
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(port, "127.0.0.1", () => resolve(listener));
    listener.once("error", reject);
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    server,
    url,
    close: async () => {
      await stopJobs();
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const runtime = await startServer();
  console.log(`Mello PC Diagnostic: ${runtime.url} (coleta local)`);
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await runtime.close();
    process.exit();
  };
  process.on("SIGTERM", close);
  process.on("SIGINT", close);
}
