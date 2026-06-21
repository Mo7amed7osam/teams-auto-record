import {
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { transform } from "esbuild";
import JavaScriptObfuscator from "javascript-obfuscator";
import {
  distDirectory,
  javascriptFiles,
  obfuscatorOptions,
  sourceDirectory,
  staticFiles
} from "./build-config.mjs";

const supportedModes = new Set([
  "development",
  "minified",
  "protected"
]);

function getRequestedMode() {
  const modeArgument = process.argv.find(argument =>
    argument.startsWith("--mode=")
  );
  return modeArgument?.split("=")[1] || "minified";
}

async function copyFile(relativePath) {
  const sourcePath = path.join(sourceDirectory, relativePath);
  const destinationPath = path.join(distDirectory, relativePath);

  await mkdir(path.dirname(destinationPath), { recursive: true });
  await cp(sourcePath, destinationPath);
}

async function copyIcons() {
  const sourceIconsDirectory = path.join(sourceDirectory, "icons");
  const destinationIconsDirectory = path.join(distDirectory, "icons");

  await mkdir(destinationIconsDirectory, { recursive: true });

  let entries = [];
  try {
    entries = await readdir(sourceIconsDirectory, {
      withFileTypes: true
    });
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  for (const entry of entries) {
    if (
      entry.name === ".DS_Store" ||
      /^README(?:\.|$)/i.test(entry.name) ||
      entry.name.endsWith(".map")
    ) {
      continue;
    }

    await cp(
      path.join(sourceIconsDirectory, entry.name),
      path.join(destinationIconsDirectory, entry.name),
      { recursive: true }
    );
  }
}

async function transformJavaScript(relativePath, mode) {
  const sourcePath = path.join(sourceDirectory, relativePath);
  const destinationPath = path.join(distDirectory, relativePath);
  const sourceCode = await readFile(sourcePath, "utf8");
  const shouldMinify = mode !== "development";

  const transformed = await transform(sourceCode, {
    loader: "js",
    target: "chrome109",
    minify: shouldMinify,
    legalComments: "none",
    sourcemap: false,
    charset: "ascii"
  });

  const outputCode =
    mode === "protected"
      ? JavaScriptObfuscator.obfuscate(
          transformed.code,
          obfuscatorOptions
        ).getObfuscatedCode()
      : transformed.code;

  await mkdir(path.dirname(destinationPath), { recursive: true });
  await writeFile(destinationPath, `${outputCode.trim()}\n`, "utf8");
}

export async function buildExtension(mode = "minified") {
  if (!supportedModes.has(mode)) {
    throw new Error(
      `Unsupported build mode: ${mode}. Expected development, minified, or protected.`
    );
  }

  await rm(distDirectory, { recursive: true, force: true });
  await mkdir(distDirectory, { recursive: true });

  await Promise.all([
    ...staticFiles.map(copyFile),
    copyIcons(),
    ...javascriptFiles.map(relativePath =>
      transformJavaScript(relativePath, mode)
    )
  ]);

  console.log(`Built ${mode} extension at ${distDirectory}`);
}

if (pathToFileURL(process.argv[1]).href === import.meta.url) {
  const requestedMode = getRequestedMode();
  await buildExtension(requestedMode);

  if (requestedMode === "protected") {
    const { validateExtension } = await import(
      "./validate-extension.mjs"
    );
    await validateExtension();
  }
}
