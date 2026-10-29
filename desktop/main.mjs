import { app, BrowserWindow, dialog, session } from "electron";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { installSensorDriver } from "./sensor-driver.mjs";
import { startServer } from "../server/index.js";

let runtime;
let window;
let quitting = false;
const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
else {
  app.setAppUserModelId("com.mello.pcdiagnostic");
  app.on("second-instance", () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    }
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("activate", () => {
    if (!BrowserWindow.getAllWindows().length && runtime) createWindow();
  });
  app.on("before-quit", (event) => {
    if (!runtime || quitting) return;
    event.preventDefault();
    quitting = true;
    runtime
      .close()
      .catch((error) => console.error(error.message))
      .finally(() => app.quit());
  });
  app
    .whenReady()
    .then(async () => {
      const token = randomBytes(32).toString("hex");
      process.env.MELLO_NATIVE_ROOT = app.isPackaged
        ? path.join(process.resourcesPath, "native")
        : path.join(app.getAppPath(), "build", "native");
      runtime = await startServer({
        port: 0,
        desktop: true,
        apiToken: token,
        installSensorDriver: () =>
          installSensorDriver({
            cacheDirectory: path.join(app.getPath("userData"), "driver-cache"),
          }),
      });
      const trustedSession = session.defaultSession;
      trustedSession.setPermissionRequestHandler(
        (contents, permission, callback) => callback(false),
      );
      trustedSession.setPermissionCheckHandler(() => false);
      trustedSession.webRequest.onBeforeSendHeaders(
        { urls: [runtime.url + "/*"] },
        (details, callback) => {
          const headers = { ...details.requestHeaders };
          if (new URL(details.url).pathname.startsWith("/api/"))
            headers["X-Mello-Token"] = token;
          callback({ requestHeaders: headers });
        },
      );
      trustedSession.on("will-download", (event, item, contents) => {
        if (contents !== window?.webContents) {
          event.preventDefault();
          return;
        }
        item.setSaveDialogOptions({
          title: "Salvar relatório do Mello",
          defaultPath: path.join(
            app.getPath("downloads"),
            path.basename(item.getFilename()),
          ),
        });
      });
      await createWindow();
    })
    .catch(fail);
}
async function createWindow() {
  window = new BrowserWindow({
    title: "Mello PC Diagnostic",
    width: 1460,
    height: 1000,
    minWidth: 800,
    minHeight: 620,
    show: false,
    backgroundColor: "#090d12",
    icon: path.join(app.getAppPath(), "build/icons/mello.png"),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  window.removeMenu();
  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (url !== runtime.url + "/") event.preventDefault();
  });
  window.on("closed", () => {
    window = null;
  });
  await window.loadURL(runtime.url + "/");
}
function fail(error) {
  console.error(error);
  dialog.showErrorBox(
    "Não foi possível iniciar o Mello",
    "O coletor local não pôde ser iniciado. Feche o programa e tente novamente.\n\n" +
      error.message,
  );
  app.quit();
}
