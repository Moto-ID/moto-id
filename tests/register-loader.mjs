// Registers ts-resolve-loader.mjs as an ESM resolve hook. Pass this file via
// `--import` so `node --experimental-strip-types --test` can resolve this
// project's extensionless relative TypeScript imports (see
// ts-resolve-loader.mjs for why that's needed) when running the tests in
// this directory directly against the real src/ files, with no npm install.
import { register } from "node:module";

register("./ts-resolve-loader.mjs", import.meta.url);
