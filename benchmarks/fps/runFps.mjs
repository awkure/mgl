import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const distPath = join(projectRoot, "dist");
const resultsDir = fileURLToPath(new URL("../results/", import.meta.url));
const viteBin = join(projectRoot, "node_modules/vite/bin/vite.js");

const SCROLL_STEPS = 40;
const VIEWPORT = { width: 390, height: 844 };

if (!existsSync(distPath)) {
  console.error("dist/ missing — run npm run build first");
  process.exit(1);
}

function gameCountInBuiltLibrary() {
  const path = join(distPath, "data/library.json");
  if (!existsSync(path)) return 0;
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    return Object.keys(data.games ?? {}).length;
  } catch {
    return 0;
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

async function sampleScrollRoute(page, hashRoute, scrollSelector, listSelector) {
  await page.goto(hashRoute, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(listSelector, { timeout: 60_000, state: "visible" });
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      return el != null && el.scrollHeight > el.clientHeight + 8;
    },
    scrollSelector,
    { timeout: 60_000 },
  );

  return page.evaluate(
    async ({ scrollSelector, scrollSteps }) => {
      const scrollEl = document.querySelector(scrollSelector);
      if (!scrollEl) {
        throw new Error(`Scroll root not found: ${scrollSelector}`);
      }

      const frameDeltas = [];
      let last = performance.now();
      let sampling = true;

      const onFrame = (now) => {
        if (!sampling) return;
        const delta = now - last;
        last = now;
        if (delta > 0 && delta < 500) frameDeltas.push(delta);
        requestAnimationFrame(onFrame);
      };
      requestAnimationFrame(onFrame);

      const maxScroll = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
      for (let step = 0; step < scrollSteps; step += 1) {
        const t = (step + 1) / scrollSteps;
        scrollEl.scrollTop = Math.round(maxScroll * (step % 2 === 0 ? t : 1 - t));
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }

      await new Promise((resolve) => setTimeout(resolve, 400));
      sampling = false;

      const sorted = [...frameDeltas].sort((a, b) => a - b);
      if (!sorted.length) {
        return { medianFps: 0, p95FrameMs: 0, samples: 0 };
      }
      const medianMs = sorted[Math.floor(sorted.length / 2)];
      const p95Ms = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
      return {
        medianFps: Math.round((1000 / medianMs) * 10) / 10,
        p95FrameMs: Math.round(p95Ms * 10) / 10,
        samples: sorted.length,
      };
    },
    { scrollSelector, scrollSteps: SCROLL_STEPS },
  );
}

async function main() {
  const builtGames = gameCountInBuiltLibrary();
  if (builtGames < 50) {
    console.warn(
      `dist/data/library.json has ${builtGames} games — run \`just db-seed\` then \`npm run build\` for meaningful FPS samples`,
    );
  }

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const { proc, getLogs } = startPreview(port);

  let browser;
  try {
    await waitForHttpOk(`${baseUrl}/`);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: VIEWPORT });

    const catalogStats = await sampleScrollRoute(
      page,
      `${baseUrl}/#/games`,
      ".catalog-page.pull-to-refresh",
      ".catalog-list",
    );

    const tierStats = await sampleScrollRoute(
      page,
      `${baseUrl}/#/`,
      ".tier-board.pull-to-refresh",
      ".tier-board",
    );

    const result = {
      generatedAt: new Date().toISOString(),
      previewUrl: baseUrl,
      builtGameCount: builtGames,
      runs: [
        { route: "#/games", ...catalogStats },
        { route: "#/", ...tierStats },
      ],
    };

    mkdirSync(resultsDir, { recursive: true });
    writeFileSync(join(resultsDir, "fps.json"), JSON.stringify(result, null, 2) + "\n");

    for (const run of result.runs) {
      console.log(
        `fps route=${run.route} medianFps=${run.medianFps} p95FrameMs=${run.p95FrameMs} samples=${run.samples}`,
      );
    }
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
