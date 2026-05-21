import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { log } from "./lib/log.mjs";
import { createAwsKnowledgeClient } from "./lib/aws-mcp.mjs";
import { fetchAwsDocAsMarkdown } from "./lib/aws-docs-http.mjs";
import { createNotionClient, generateMergeReport, appendChangeReport } from "./lib/notion-ai.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const CONFIG_PATH = join(REPO_ROOT, "docs.config.json");
const MANIFEST_PATH = join(REPO_ROOT, ".cache", "manifest.json");
const SNAPSHOT_DIR = join(REPO_ROOT, "snapshots");

const DRY_RUN = process.env.DRY_RUN === "1";
const SUMMARY_PATH = process.env.GITHUB_STEP_SUMMARY ?? null;

const NOTION_PAGE_ID_RE = /^[0-9a-f]{32}$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateConfig(cfg) {
  if (!cfg || typeof cfg !== "object") throw new Error("Config: not an object");
  if (!Array.isArray(cfg.tracked) || cfg.tracked.length === 0) {
    throw new Error("Config: tracked must be a non-empty array");
  }
  if (cfg.tracked.length > 200) throw new Error("Config: tracked exceeds 200 entries");
  const ids = new Set();
  for (const t of cfg.tracked) {
    if (!t.id || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(t.id)) {
      throw new Error(`Config: invalid id ${JSON.stringify(t.id)}`);
    }
    if (ids.has(t.id)) throw new Error(`Config: duplicate id ${t.id}`);
    ids.add(t.id);
    if (typeof t.awsUrl !== "string" || !/^https:\/\//.test(t.awsUrl)) {
      throw new Error(`Config[${t.id}]: invalid awsUrl`);
    }
    if (t.awsUrl.length > 2048) throw new Error(`Config[${t.id}]: awsUrl too long`);
    if (typeof t.notionPageId !== "string" || t.notionPageId.length === 0) {
      throw new Error(`Config[${t.id}]: missing notionPageId`);
    }
    if (/^REPLACE_/.test(t.notionPageId)) {
      throw new Error(`Config[${t.id}]: notionPageId placeholder not replaced`);
    }
    const stripped = t.notionPageId.replace(/-/g, "");
    if (!NOTION_PAGE_ID_RE.test(t.notionPageId) && !/^[0-9a-f]{32}$/i.test(stripped)) {
      throw new Error(`Config[${t.id}]: notionPageId is not a valid Notion id`);
    }
  }
}

async function loadJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  const raw = await readFile(path, "utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse ${path}: ${err.message}`);
  }
}

async function ensureDir(path) {
  if (!existsSync(path)) await mkdir(path, { recursive: true });
}

function normalizeForHash(text, ignoreLineRegex) {
  if (!text) return "";
  const compiled = (ignoreLineRegex ?? []).map((p) => new RegExp(p));
  const lines = text.split(/\r?\n/);
  const filtered = lines
    .filter((line) => !compiled.some((rx) => rx.test(line)))
    .map((l) => l.replace(/[ \t]+$/g, ""));
  return filtered.join("\n").trim();
}

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

async function fetchFullDocViaMcp(awsClient, url, settings) {
  const maxLen = settings?.maxDocCharsPerFetch ?? 40_000;
  const HARD_CAP = 400_000;
  let assembled = "";
  let cursor = 0;
  for (let i = 0; i < 16; i++) {
    const { json, raw } = await awsClient.readDocumentation(url, {
      maxLength: maxLen,
      startIndex: cursor,
    });
    let chunk = "";
    let truncated = false;
    let endIndex = cursor;
    if (json && Array.isArray(json) && json[0]) {
      const first = json[0];
      if (first.status === "ERROR") {
        throw new Error(`AWS doc fetch error for ${url}: ${first.error_code} ${first.error_message ?? ""}`);
      }
      chunk = typeof first.content === "string" ? first.content : "";
      truncated = first.truncated === true;
      endIndex = typeof first.end_index === "number" ? first.end_index : cursor + chunk.length;
    } else {
      chunk = raw;
      truncated = chunk.length >= maxLen;
      endIndex = cursor + chunk.length;
    }
    assembled += chunk;
    if (!truncated || assembled.length >= HARD_CAP || endIndex <= cursor) break;
    cursor = endIndex;
  }
  return assembled.slice(0, HARD_CAP);
}

async function fetchFullDocViaHttp(url, settings) {
  const HARD_CAP = 400_000;
  const md = await fetchAwsDocAsMarkdown(url, {
    userAgent: settings?.userAgent ?? "aws-docs-notion-sync/1.0",
  });
  return md.length > HARD_CAP ? md.slice(0, HARD_CAP) : md;
}

async function pLimit(items, concurrency, mapper) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = { ok: true, value: await mapper(items[i], i) };
      } catch (err) {
        results[i] = { ok: false, error: err };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

async function appendSummary(line) {
  if (!SUMMARY_PATH) return;
  try {
    await appendFile(SUMMARY_PATH, line + "\n");
  } catch (err) {
    log.warn("Failed to write GH step summary", { error: String(err?.message ?? err) });
  }
}

async function main() {
  log.info("AWS docs to Notion sync starting", { dryRun: DRY_RUN });

  const cfg = await loadJson(CONFIG_PATH, null);
  if (!cfg) throw new Error(`Missing ${CONFIG_PATH}`);
  validateConfig(cfg);

  const settings = cfg.settings ?? {};
  const ignoreLineRegex = settings?.diff?.ignoreLineRegex ?? [];

  await ensureDir(SNAPSHOT_DIR);
  await ensureDir(dirname(MANIFEST_PATH));

  const manifest = (await loadJson(MANIFEST_PATH, { version: 1, entries: {} })) ?? { version: 1, entries: {} };
  if (!manifest.entries || typeof manifest.entries !== "object") manifest.entries = {};

  const fetcher = (settings?.fetcher ?? "http").toLowerCase();
  if (!["http", "mcp"].includes(fetcher)) {
    throw new Error(`Invalid settings.fetcher: ${fetcher}. Use "http" (default) or "mcp".`);
  }
  log.info("Doc fetcher selected", { fetcher });

  const awsClient = fetcher === "mcp" ? await createAwsKnowledgeClient() : null;
  const notion = DRY_RUN ? null : createNotionClient();

  await appendSummary("# AWS Docs Sync\n");
  await appendSummary(`Run mode: ${DRY_RUN ? "dry-run" : "live"}\n`);
  await appendSummary(`Tracked docs: ${cfg.tracked.length}\n\n`);
  await appendSummary("| Doc | Status | Detail |\n|---|---|---|\n");

  const stats = { changed: 0, unchanged: 0, errors: 0 };

  try {
    const results = await pLimit(cfg.tracked, settings.fetchConcurrency ?? 3, async (entry) => {
      const snapshotPath = join(SNAPSHOT_DIR, `${entry.id}.md`);
      const prevMarkdown = existsSync(snapshotPath) ? await readFile(snapshotPath, "utf8") : "";
      const nextMarkdown =
        fetcher === "mcp"
          ? await fetchFullDocViaMcp(awsClient, entry.awsUrl, settings)
          : await fetchFullDocViaHttp(entry.awsUrl, settings);
      const nextHash = sha256(normalizeForHash(nextMarkdown, ignoreLineRegex));
      const prevHash = manifest.entries[entry.id]?.hash ?? null;
      const nowIso = new Date().toISOString();
      const changed = prevHash !== nextHash;

      manifest.entries[entry.id] = {
        ...(manifest.entries[entry.id] ?? {}),
        awsUrl: entry.awsUrl,
        displayName: entry.displayName ?? entry.id,
        hash: nextHash,
        lastChecked: nowIso,
        ...(changed ? { lastChanged: nowIso } : {}),
      };

      await writeFile(snapshotPath, nextMarkdown, "utf8");

      if (!changed) {
        log.info("No change", { id: entry.id });
        return { id: entry.id, displayName: entry.displayName ?? entry.id, changed: false };
      }

      log.info("Change detected", { id: entry.id, prevHash: prevHash ?? "(initial)", nextHash });
      if (DRY_RUN || prevMarkdown.length === 0) {
        return {
          id: entry.id,
          displayName: entry.displayName ?? entry.id,
          changed: true,
          skippedNotion: true,
          reason: prevMarkdown.length === 0 ? "initial-snapshot" : "dry-run",
        };
      }

      const report = await generateMergeReport({
        displayName: entry.displayName ?? entry.id,
        awsUrl: entry.awsUrl,
        prevMarkdown,
        nextMarkdown,
        settings,
      });
      await appendChangeReport(notion, entry.notionPageId, {
        displayName: entry.displayName ?? entry.id,
        awsUrl: entry.awsUrl,
        dateIso: nowIso,
        ...report,
      });

      return { id: entry.id, displayName: entry.displayName ?? entry.id, changed: true, posted: true };
    });

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const entry = cfg.tracked[i];
      if (!r.ok) {
        stats.errors++;
        log.error("Sync failed for entry", { id: entry.id, error: String(r.error?.message ?? r.error) });
        await appendSummary(`| ${entry.id} | error | ${(r.error?.message ?? "unknown").slice(0, 200)} |\n`);
      } else if (r.value.changed) {
        stats.changed++;
        const detail = r.value.posted ? "posted to Notion" : `skipped (${r.value.reason})`;
        await appendSummary(`| ${entry.id} | changed | ${detail} |\n`);
      } else {
        stats.unchanged++;
        await appendSummary(`| ${entry.id} | unchanged | - |\n`);
      }
    }

    await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf8");

    if (process.env.GITHUB_OUTPUT) {
      await appendFile(process.env.GITHUB_OUTPUT, `changed=${stats.changed}\n`);
      await appendFile(process.env.GITHUB_OUTPUT, `unchanged=${stats.unchanged}\n`);
      await appendFile(process.env.GITHUB_OUTPUT, `errors=${stats.errors}\n`);
    }

    log.info("Sync complete", stats);
    await appendSummary(`\n**Result:** changed=${stats.changed}, unchanged=${stats.unchanged}, errors=${stats.errors}\n`);

    if (stats.errors > 0) process.exitCode = 1;
  } finally {
    if (awsClient) await awsClient.close();
  }
}

main().catch((err) => {
  log.error("Fatal sync error", { error: String(err?.message ?? err) });
  process.exitCode = 1;
});
