import { rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  distDirectory,
  releaseDirectory
} from "./build-config.mjs";

export async function cleanGeneratedFiles() {
  await Promise.all([
    rm(distDirectory, { recursive: true, force: true }),
    rm(releaseDirectory, { recursive: true, force: true })
  ]);
}

if (pathToFileURL(process.argv[1]).href === import.meta.url) {
  await cleanGeneratedFiles();
  console.log("Removed dist/ and release/.");
}
