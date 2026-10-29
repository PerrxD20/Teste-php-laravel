import fs from "node:fs/promises";
import path from "node:path";
import * as PE from "resedit";

// Resource editing uses a PE parser on all build hosts; Wine is not required.
// Verification of downloaded Electron artifacts remains enabled in the builder.
export default async function brandWindowsExecutable(context) {
  if (context.electronPlatformName !== "win32") return;
  const filename = context.packager.appInfo.productFilename + ".exe";
  const executablePath = path.join(context.appOutDir, filename);
  const executable = PE.NtExecutable.from(await fs.readFile(executablePath), {
    ignoreCert: true,
  });
  const resources = PE.NtExecutableResource.from(executable);
  const icon = PE.Data.IconFile.from(
    await fs.readFile(
      path.join(context.packager.projectDir, "build/icons/mello.ico"),
    ),
  );
  const groups = PE.Resource.IconGroupEntry.fromEntries(resources.entries);
  for (const group of groups.length ? groups : [{ id: 1, lang: 1033 }]) {
    PE.Resource.IconGroupEntry.replaceIconsForResource(
      resources.entries,
      group.id,
      group.lang,
      icon.icons.map((item) => item.data),
    );
  }
  const version = context.packager.appInfo.version;
  const [major, minor, patch] = version.split(".").map(Number);
  const versions = PE.Resource.VersionInfo.fromEntries(resources.entries);
  if (!versions.length)
    throw new Error("Electron did not provide a Windows version resource.");
  for (const info of versions) {
    info.setFileVersion(major, minor, patch, 0, 1033);
    info.setProductVersion(major, minor, patch, 0, 1033);
    for (const language of info.getAllLanguagesForStringValues()) {
      info.setStringValues(language, {
        CompanyName: "Mello PC Diagnostic",
        FileDescription: "Mello PC Diagnostic",
        ProductName: "Mello PC Diagnostic",
        InternalName: "mello-pc-diagnostic",
        OriginalFilename: filename,
        FileVersion: version,
        ProductVersion: version,
      });
    }
    info.outputToResourceEntries(resources.entries);
  }
  resources.outputResource(executable);
  const output = executable.generate(); // Produces an unsigned application, not an invalid upstream signature.
  const temporary = executablePath + ".mello-resource-edit";
  await fs.writeFile(temporary, Buffer.from(output));
  await fs.rename(temporary, executablePath);
  console.log("Windows executable branded:", filename, version);
}
