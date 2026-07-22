import { mkdirSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const distPath = fileURLToPath(new URL("../../dist/", import.meta.url));
if (!existsSync(distPath)) {
  console.error("dist/ missing — run npm run build first");
  process.exit(1);
}

function walk(dir) {
  const entries = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) entries.push(...walk(path));
    else entries.push({ path: path.slice(distPath.length), bytes: st.size });
  }
  return entries;
}

const files = walk(distPath);
const totalBytes = files.reduce((sum, f) => sum + f.bytes, 0);
const result = {
  generatedAt: new Date().toISOString(),
  totalBytes,
  files: files.sort((a, b) => b.bytes - a.bytes),
};
const outDir = fileURLToPath(new URL("../results/", import.meta.url));
mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, "bundle.json"),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(`bundle totalBytes=${totalBytes} files=${files.length}`);
