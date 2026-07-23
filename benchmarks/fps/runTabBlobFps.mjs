import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const distPath = join(projectRoot, "dist");
const resultsDir = fileURLToPath(new URL("../results/", import.meta.url));
const viteBin = join(projectRoot, "node_modules/vite/bin/vite.js");

const VIEWPORT = { width: 390, height: 844 };
const DRAG_STEPS = 48;

if (!existsSync(distPath)) {
  console.error("dist/ missing — run npm run build first");
  process.exit(1);
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

async function sampleTabBlobDrag(page, baseUrl) {
  await page.goto(`${baseUrl}/#/tiers`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".app-shell[data-mobile-chrome=\"true\"] .app-tab-bar", {
    timeout: 60_000,
    state: "visible",
  });

  return page.evaluate(async ({ dragSteps }) => {
    const bar = document.querySelector(".app-tab-bar");
    const shell = document.querySelector(".app-shell");
    const startLink = bar?.querySelector(".app-tab-bar__link");
    if (!(bar instanceof HTMLElement) || !(shell instanceof HTMLElement) || !(startLink instanceof HTMLElement)) {
      throw new Error("tab bar chrome missing");
    }

    const rect = bar.getBoundingClientRect();
    const y = rect.top + rect.height / 2;
    const fromX = rect.left + rect.width * 0.12;
    const toX = rect.left + rect.width * 0.88;

    const frameDeltas = [];
    const trackingErrors = [];
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

    const readPress = () => Number(getComputedStyle(shell).getPropertyValue("--press-tab").trim() || "0");

    startLink.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
      button: 0,
      buttons: 1,
      clientX: fromX,
      clientY: y,
    }));

    for (let step = 0; step <= dragSteps; step += 1) {
      const t = step / dragSteps;
      const x = fromX + (toX - fromX) * t;
      startLink.dispatchEvent(new PointerEvent("pointermove", {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId: 1,
        pointerType: "touch",
        isPrimary: true,
        button: 0,
        buttons: 1,
        clientX: x,
        clientY: y,
      }));
      const expected = Math.max(0, Math.min(3, ((x - rect.left) / rect.width) * 4 - 0.5));
      trackingErrors.push(Math.abs(readPress() - expected));
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    startLink.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
      button: 0,
      buttons: 0,
      clientX: toX,
      clientY: y,
    }));

    await new Promise((resolve) => setTimeout(resolve, 200));
    sampling = false;

    const sorted = [...frameDeltas].sort((a, b) => a - b);
    const errSorted = [...trackingErrors].sort((a, b) => a - b);
    if (!sorted.length) {
      return { medianFps: 0, p95FrameMs: 0, samples: 0, maxTrackingError: 0, p95TrackingError: 0 };
    }
    const medianMs = sorted[Math.floor(sorted.length / 2)];
    const p95Ms = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
    const p95Err = errSorted[Math.min(errSorted.length - 1, Math.floor(errSorted.length * 0.95))] ?? 0;
    return {
      medianFps: Math.round((1000 / medianMs) * 10) / 10,
      p95FrameMs: Math.round(p95Ms * 10) / 10,
      samples: sorted.length,
      maxTrackingError: Math.round(Math.max(...trackingErrors, 0) * 1000) / 1000,
      p95TrackingError: Math.round(p95Err * 1000) / 1000,
    };
  }, { dragSteps: DRAG_STEPS });
}

async function main() {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const { proc, getLogs } = startPreview(port);

  let browser;
  try {
    await waitForHttpOk(`${baseUrl}/`);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: VIEWPORT });
    const stats = await sampleTabBlobDrag(page, baseUrl);

    const result = {
      generatedAt: new Date().toISOString(),
      previewUrl: baseUrl,
      runs: [{ route: "#/tiers", gesture: "tab-bar-blob-drag", ...stats }],
    };

    mkdirSync(resultsDir, { recursive: true });
    writeFileSync(join(resultsDir, "tab-blob-fps.json"), JSON.stringify(result, null, 2) + "\n");

    for (const run of result.runs) {
      console.log(
        `tab-blob route=${run.route} medianFps=${run.medianFps} p95FrameMs=${run.p95FrameMs} maxTrackingError=${run.maxTrackingError} p95TrackingError=${run.p95TrackingError} samples=${run.samples}`,
      );
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    if (getLogs()) console.error(getLogs());
    process.exitCode = 1;
  } finally {
    await browser?.close().catch(() => { });
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
