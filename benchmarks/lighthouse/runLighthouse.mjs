import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import lighthouse from "lighthouse";
import { chromium } from "playwright";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const distPath = join(projectRoot, "dist");
const resultsDir = join(
  fileURLToPath(new URL("../results/", import.meta.url)),
  "lighthouse",
);
const viteBin = join(projectRoot, "node_modules/vite/bin/vite.js");

const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"];

if (!existsSync(distPath)) {
  console.error("dist/ missing — run npm run build first");
  process.exit(1);
}

function readBuiltLibrary() {
  const path = join(distPath, "data/library.json");
  if (!existsSync(path)) return { gameIds: [] };
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    const gameIds = Object.keys(data.games ?? {}).sort();
    return { gameIds };
  } catch {
    return { gameIds: [] };
  }
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
    server.on("error", reject);
  });
}

async function waitForHttpOk(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Preview server did not become ready: ${url}`);
}

async function waitForDebugPort(port, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Chrome debug port did not become ready: ${port}`);
}

function startPreview(port) {
  const proc = spawn(
    process.execPath,
    [viteBin, "preview", "--port", String(port), "--host", "127.0.0.1", "--strictPort"],
    {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, BROWSER: "none" },
    },
  );
  let logs = "";
  proc.stdout?.on("data", (chunk) => {
    logs += chunk.toString();
  });
  proc.stderr?.on("data", (chunk) => {
    logs += chunk.toString();
  });
  return {
    proc,
    getLogs: () => logs,
  };
}

function categoryScores(lhr) {
  const scores = {};
  for (const id of CATEGORIES) {
    const cat = lhr.categories?.[id];
    scores[id] =
      cat?.score != null ? Math.round(cat.score * 100) : null;
  }
  return scores;
}

function safeSlugPart(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

async function auditRoute(chromePort, url, slug) {
  const runnerResult = await lighthouse(url, {
    port: chromePort,
    output: "html",
    onlyCategories: CATEGORIES,
    logLevel: "error",
  });

  if (!runnerResult?.lhr) {
    throw new Error(`Lighthouse returned no report for ${url}`);
  }

  mkdirSync(resultsDir, { recursive: true });
  const htmlPath = join(resultsDir, `${slug}.html`);
  const jsonPath = join(resultsDir, `${slug}.json`);
  writeFileSync(htmlPath, runnerResult.report);
  writeFileSync(jsonPath, JSON.stringify(runnerResult.lhr, null, 2) + "\n");

  const scores = categoryScores(runnerResult.lhr);
  console.log(
    `lighthouse slug=${slug} url=${url} performance=${scores.performance} accessibility=${scores.accessibility} best-practices=${scores["best-practices"]} seo=${scores.seo}`,
  );
  return { slug, url, scores };
}

async function main() {
  const { gameIds } = readBuiltLibrary();
  if (gameIds.length === 0) {
    console.warn(
      "dist/data/library.json has no games — skipping #/games/:id audit (run `just db-seed` then `npm run build` for a game page)",
    );
  }

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const { proc, getLogs } = startPreview(port);

  let browser;
  const audits = [];

  try {
    await waitForHttpOk(`${baseUrl}/`);

    const debugPort = await getFreePort();
    browser = await chromium.launch({
      headless: true,
      args: [
        `--remote-debugging-port=${debugPort}`,
        "--remote-debugging-address=127.0.0.1",
      ],
    });
    await waitForDebugPort(debugPort);

    audits.push(await auditRoute(debugPort, `${baseUrl}/#/`, "home"));
    audits.push(await auditRoute(debugPort, `${baseUrl}/#/games`, "catalog"));

    if (gameIds.length > 0) {
      const gameId = gameIds[0];
      const slug = `game-${safeSlugPart(gameId)}`;
      audits.push(
        await auditRoute(
          debugPort,
          `${baseUrl}/#/games/${encodeURIComponent(gameId)}`,
          slug,
        ),
      );
    }

    const summary = {
      generatedAt: new Date().toISOString(),
      previewUrl: baseUrl,
      builtGameCount: gameIds.length,
      categories: CATEGORIES,
      audits,
    };
    writeFileSync(
      join(resultsDir, "summary.json"),
      JSON.stringify(summary, null, 2) + "\n",
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    if (getLogs()) console.error(getLogs());
    process.exitCode = 1;
  } finally {
    await browser?.close().catch(() => {});
    proc.kill("SIGTERM");
    await new Promise((resolve) => {
      if (proc.exitCode != null) {
        resolve();
        return;
      }
      proc.once("exit", resolve);
      setTimeout(resolve, 3000);
    });
  }
}

main();
