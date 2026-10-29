import path from "node:path";
import { fileURLToPath } from "node:url";
import { access } from "node:fs/promises";
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const nativeRoot = () =>
  process.env.MELLO_NATIVE_ROOT || path.join(projectRoot, "build", "native");
export const sensorExecutable = () =>
  path.join(nativeRoot(), "sensors", "Mello.SensorCollector.exe");
export async function smartctlExecutable() {
  if (process.platform === "win32") {
    const bundled = path.join(nativeRoot(), "smartctl", "smartctl.exe");
    try {
      await access(bundled);
      return bundled;
    } catch {}
  }
  return "smartctl";
}
