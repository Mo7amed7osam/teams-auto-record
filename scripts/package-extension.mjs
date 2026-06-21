import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import archiver from "archiver";
import { buildExtension } from "./build-extension.mjs";
import {
  distDirectory,
  releaseDirectory
} from "./build-config.mjs";
import { validateExtension } from "./validate-extension.mjs";

async function createZip(zipPath) {
  await new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", resolve);
    output.on("error", reject);
    archive.on("error", reject);

    archive.pipe(output);
    archive.glob("**/*", {
      cwd: distDirectory,
      dot: false,
      ignore: [
        "**/*.map",
        "**/.DS_Store",
        "**/README",
        "**/README.*"
      ]
    });

    void archive.finalize().catch(reject);
  });
}

export async function packageExtension() {
  await buildExtension("protected");
  await validateExtension();

  const manifest = JSON.parse(
    await readFile(path.join(distDirectory, "manifest.json"), "utf8")
  );
  const zipPath = path.join(
    releaseDirectory,
    `teams-auto-record-extension-v${manifest.version}.zip`
  );

  await mkdir(releaseDirectory, { recursive: true });
  await rm(zipPath, { force: true });
  await createZip(zipPath);

  console.log(`Created release ZIP at ${zipPath}`);
  return zipPath;
}

await packageExtension();
