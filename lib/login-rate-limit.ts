import "server-only";

import { createHash } from "node:crypto";
import { open, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const windowMs = 15 * 60 * 1000;
const localLimitFile = join(
  tmpdir(),
  `workshop-login-limit-v2-${createHash("sha256").update(process.cwd()).digest("hex").slice(0, 12)}.json`,
);
const localLockFile = `${localLimitFile}.lock`;

function requestIp(request: Request) {
  // Reverse proxies should append the connecting client's address as the last entry.
  return (
    request.headers.get("x-vercel-forwarded-for")?.split(",").at(-1)?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ||
    "unknown"
  );
}

export async function canAttemptLogin(request: Request) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    const limiter = new Ratelimit({
      redis: new Redis({ url, token }),
      limiter: Ratelimit.fixedWindow(5, "15 m"),
      prefix: "workshop-login",
    });
    const result = await limiter.limit(requestIp(request));
    return result.success;
  }

  // Local-only file limiter. Production fails closed without the shared Upstash limiter.
  if (process.env.NODE_ENV === "production") return false;

  const key = createHash("sha256").update(requestIp(request)).digest("hex");
  const now = Date.now();
  await mkdir(tmpdir(), { recursive: true });

  let lock;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      lock = await open(localLockFile, "wx");
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        const lockInfo = await stat(localLockFile);
        if (now - lockInfo.mtimeMs > 5000) await unlink(localLockFile);
      } catch {}
      await delay(10);
    }
  }
  if (!lock) return false;

  try {
    let attempts: Record<string, { count: number; resetAt: number }> = {};
    try {
      attempts = JSON.parse(await readFile(localLimitFile, "utf8"));
    } catch {}

    const current = attempts[key];
    if (!current || current.resetAt <= now) {
      attempts[key] = { count: 1, resetAt: now + windowMs };
    } else {
      current.count += 1;
    }

    const tempFile = `${localLimitFile}.${process.pid}.tmp`;
    await writeFile(tempFile, JSON.stringify(attempts), "utf8");
    await rename(tempFile, localLimitFile);
    return attempts[key].count <= 5;
  } finally {
    await lock.close();
    await unlink(localLockFile).catch(() => undefined);
  }
}
