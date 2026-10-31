// Minimal, zero-dependency ESM loader hook so plain `node --experimental-strip-types`
// can resolve this project's extensionless relative TypeScript imports (e.g.
// `import { newId } from "./crypto"` in src/lib/db.ts), the same way the
// project's own "Bundler" moduleResolution (tsconfig.json) and bundler-based
// deploy (Wrangler) already do. Only used for running these tests locally with
// no npm install — never shipped, never affects the actual Worker build.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (specifier.startsWith(".") && context.parentURL) {
      const basePath = fileURLToPath(new URL(specifier, context.parentURL));
      for (const ext of [".ts", "/index.ts"]) {
        if (existsSync(basePath + ext)) {
          return nextResolve(specifier + ext, context);
        }
      }
    }
    throw err;
  }
}
