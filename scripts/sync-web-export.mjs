import { existsSync, rmSync, cpSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const src = resolve(root, "out");
const dest = resolve(root, "docs");

if (!existsSync(src)) {
  console.error(`[sync-web-export] source not found at ${src}`);
  process.exit(1);
}

if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
writeFileSync(resolve(dest, ".nojekyll"), "");
console.log(`[sync-web-export] copied ${src} -> ${dest}`);
