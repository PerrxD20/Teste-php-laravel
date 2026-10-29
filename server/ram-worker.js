import { parentPort, workerData } from "node:worker_threads";
const bytes = Math.min(
  64 * 1024 * 1024,
  Math.max(1024, workerData?.bytes || 64 * 1024 * 1024),
);
const memory = new Uint32Array(Math.floor(bytes / 4));
const start = performance.now();
let errors = 0;
const patterns = [0x00000000, 0xffffffff, 0xaaaaaaaa, 0x55555555];
for (let p = 0; p < patterns.length; p++) {
  memory.fill(patterns[p]);
  for (let i = 0; i < memory.length; i++)
    if (memory[i] !== patterns[p]) errors++;
  parentPort.postMessage({
    type: "progress",
    progress: Math.round(((p + 1) / 6) * 100),
  });
}
for (let i = 0; i < memory.length; i++)
  memory[i] = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
for (let i = 0; i < memory.length; i++)
  if (memory[i] !== Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) >>> 0) errors++;
parentPort.postMessage({ type: "progress", progress: 83 });
for (let i = 0; i < memory.length; i++)
  memory[i] = ~Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
for (let i = 0; i < memory.length; i++)
  if (memory[i] !== ~Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) >>> 0) errors++;
parentPort.postMessage({
  type: "result",
  result: {
    bytes: memory.byteLength,
    patterns: 6,
    errors,
    durationMs: Math.round(performance.now() - start),
    completedAt: new Date().toISOString(),
    scope: "process",
    message:
      "Teste limitado à memória alocada pelo processo. Não substitui um teste completo inicializável como MemTest86 ou o Diagnóstico de Memória do Windows.",
  },
});
