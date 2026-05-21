import { JSDOM } from "jsdom";
import TurndownService from "turndown";

import { log } from "./log.mjs";

const ALLOWED_HOST_PREFIXES = [
  "https://docs.aws.amazon.com/",
  "https://aws.amazon.com/",
  "https://docs.amplify.aws/",
  "https://repost.aws/knowledge-center/",
];

const DEFAULT_USER_AGENT =
  "aws-docs-notion-sync/1.0 (+https://github.com/awslabs/mcp; learning notes sync)";

function assertSafeUrl(url) {
  if (typeof url !== "string" || url.length > 2048) {
    throw new Error("Invalid AWS docs URL");
  }
  if (!ALLOWED_HOST_PREFIXES.some((p) => url.startsWith(p))) {
    throw new Error(`URL not in AWS docs allow-list: ${url}`);
  }
}

async function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function withRetry(fn, { attempts = 3, baseMs = 800, label = "op" } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = err?.status;
      if (status === 404 || status === 410) throw err;
      const delay = baseMs * Math.pow(2, i) + Math.floor(Math.random() * 200);
      log.warn(`${label} failed, retrying`, {
        attempt: i + 1,
        attempts,
        delayMs: delay,
        error: String(err?.message ?? err),
      });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

function pickMainContent(document, url) {
  const candidates = [
    "main#main-content",
    "main",
    "article",
    "#main-col-body",
    "#main-content",
    ".awsdocs-page-content",
    "#main",
    "[role=main]",
  ];
  for (const sel of candidates) {
    const el = document.querySelector(sel);
    if (el && el.textContent && el.textContent.trim().length > 200) return el;
  }
  log.warn("Could not find main content selector, falling back to <body>", { url });
  return document.body ?? null;
}

function stripNoise(root, document) {
  if (!root || !document) return;
  const noiseSelectors = [
    "script",
    "style",
    "noscript",
    "nav",
    "header",
    "footer",
    "aside",
    "form",
    "iframe",
    "svg",
    ".breadcrumb",
    ".feedback",
    ".feedback-section",
    ".awsdocs-feedback-container",
    ".awsui-context-content-header",
    "#feedback-container",
    "#cookieconsent",
    ".cookies-banner",
    ".prevnext",
    ".awsdocs-page-utilities",
    ".awsdocs-toc-contents",
    "[role=navigation]",
    "[role=banner]",
    "[role=contentinfo]",
  ];
  for (const sel of noiseSelectors) {
    for (const el of root.querySelectorAll(sel)) el.remove();
  }
}

let _turndown;
function getTurndown() {
  if (_turndown) return _turndown;
  _turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "_",
    strongDelimiter: "**",
    linkStyle: "inlined",
  });
  _turndown.remove(["script", "style", "noscript", "iframe"]);
  _turndown.addRule("preserveCodeLanguage", {
    filter: (node) =>
      node.nodeName === "PRE" && node.firstChild && node.firstChild.nodeName === "CODE",
    replacement: (_content, node) => {
      const codeEl = node.firstChild;
      const cls = (codeEl.getAttribute("class") || "").toLowerCase();
      const langMatch = cls.match(/language-([\w+#-]+)/);
      const lang = langMatch ? langMatch[1] : "";
      const text = codeEl.textContent ?? "";
      const fence = "```";
      return `\n\n${fence}${lang}\n${text.replace(/\n+$/, "")}\n${fence}\n\n`;
    },
  });
  return _turndown;
}

function normalizeMarkdown(md) {
  return md
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function fetchAwsDocAsMarkdown(url, { userAgent = DEFAULT_USER_AGENT, timeoutMs = 30_000 } = {}) {
  assertSafeUrl(url);
  return withRetry(
    () =>
      withTimeout(
        (async () => {
          const res = await fetch(url, {
            method: "GET",
            redirect: "follow",
            headers: {
              "user-agent": userAgent,
              accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "accept-language": "en-US,en;q=0.9",
              "accept-encoding": "gzip, deflate, br",
            },
            signal: AbortSignal.timeout(timeoutMs),
          });
          if (!res.ok) {
            const err = new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
            err.status = res.status;
            throw err;
          }
          const ct = res.headers.get("content-type") ?? "";
          if (!/text\/html|application\/xhtml/i.test(ct)) {
            throw new Error(`Unexpected content-type for AWS doc: ${ct}`);
          }
          const html = await res.text();
          if (html.length === 0 || html.length > 8_000_000) {
            throw new Error(`AWS doc HTML out of bounds: ${html.length} bytes`);
          }

          const dom = new JSDOM(html, { url });
          const doc = dom.window.document;
          const main = pickMainContent(doc, url);
          if (!main) throw new Error(`No content extractable from ${url}`);
          stripNoise(main, doc);

          const titleEl = doc.querySelector("h1") ?? doc.querySelector("title");
          const title = titleEl ? titleEl.textContent.trim() : "";

          const turndown = getTurndown();
          let md = turndown.turndown(main.innerHTML);
          md = normalizeMarkdown(md);

          if (title && !md.startsWith("# ")) {
            md = `# ${title}\n\n${md}`;
          }
          md = `> Source: ${url}\n\n${md}`;
          return md;
        })(),
        timeoutMs + 2_000,
        `fetch ${url}`,
      ),
    { label: `fetch ${url}` },
  );
}
