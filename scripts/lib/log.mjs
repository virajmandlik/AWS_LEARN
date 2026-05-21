const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const ENV_LEVEL = (process.env.LOG_LEVEL ?? "info").toLowerCase();
const THRESHOLD = LEVELS[ENV_LEVEL] ?? LEVELS.info;

const SECRET_KEYS = new Set([
  "token",
  "authorization",
  "apikey",
  "api_key",
  "secret",
  "password",
  "notion_token",
  "github_token",
]);

function redact(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (value.length > 20 && /^(secret_|ntn_|ghp_|gho_|ghs_|ghu_|ghr_|sk-)/i.test(value)) {
      return `[REDACTED:${value.length}]`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEYS.has(k.toLowerCase()) ? "[REDACTED]" : redact(v);
    }
    return out;
  }
  return value;
}

function sanitize(s) {
  if (typeof s !== "string") return s;
  return s.replace(/[\r\n]+/g, " ");
}

function emit(level, msg, meta) {
  if (LEVELS[level] < THRESHOLD) return;
  const record = {
    ts: new Date().toISOString(),
    level,
    msg: sanitize(msg),
    ...(meta ? { meta: redact(meta) } : {}),
  };
  const line = JSON.stringify(record);
  if (level === "error" || level === "warn") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

export const log = {
  debug: (msg, meta) => emit("debug", msg, meta),
  info: (msg, meta) => emit("info", msg, meta),
  warn: (msg, meta) => emit("warn", msg, meta),
  error: (msg, meta) => emit("error", msg, meta),
};
