/** Structured server logging — never pass secrets as fields. */

type LogLevel = "info" | "warn" | "error";

function emit(level: LogLevel, scope: string, message: string, meta?: Record<string, unknown>) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    scope,
    message,
    ...(meta ? { meta: redact(meta) } : {}),
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

const SECRET_KEYS = /secret|password|private|apikey|api_key|token|authorization|entity|kit_key|kitkey/i;

function redact(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (SECRET_KEYS.test(k)) {
      out[k] = "[redacted]";
    } else if (typeof v === "string" && v.length > 500) {
      out[k] = `${v.slice(0, 200)}…`;
    } else {
      out[k] = v;
    }
  }
  return out;
}

export const log = {
  info: (scope: string, message: string, meta?: Record<string, unknown>) =>
    emit("info", scope, message, meta),
  warn: (scope: string, message: string, meta?: Record<string, unknown>) =>
    emit("warn", scope, message, meta),
  error: (scope: string, message: string, meta?: Record<string, unknown>) =>
    emit("error", scope, message, meta),
  remit: (message: string, meta?: Record<string, unknown>) =>
    emit("error", "remit", message, meta),
  swap: (message: string, meta?: Record<string, unknown>) =>
    emit("error", "swap", message, meta),
  paymaster: (message: string, meta?: Record<string, unknown>) =>
    emit("error", "paymaster", message, meta),
  rpc: (message: string, meta?: Record<string, unknown>) =>
    emit("error", "rpc", message, meta),
};
