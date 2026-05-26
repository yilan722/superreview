#!/usr/bin/env node
/**
 * Upload public/encyclopedia-data → Vercel Blob (public CDN).
 *
 * Prerequisites:
 *   1. Vercel project → Storage → Blob → Create store → copy Read/Write token
 *   2. Local index built: npm run encyclopedia:build && npm run encyclopedia:learn
 *
 * Usage:
 *   export BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
 *   npm run encyclopedia:upload-blob
 *   npm run encyclopedia:upload-blob -- --resume
 *   npm run encyclopedia:upload-blob -- --json-only
 */
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { list, put } from "@vercel/blob";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../public/encyclopedia-data");
const BLOB_PREFIX = "encyclopedia-data";
const MULTIPART_BYTES = 20 * 1024 * 1024;
const CONCURRENCY = 6;

const args = new Set(process.argv.slice(2));
const resume = args.has("--resume");
const jsonOnly = args.has("--json-only");

const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
if (!token) {
  console.error(
    "Missing BLOB_READ_WRITE_TOKEN.\n" +
      "Vercel Dashboard → Storage → Blob → your store → .env.local → BLOB_READ_WRITE_TOKEN",
  );
  process.exit(1);
}

function contentType(filePath) {
  if (filePath.endsWith(".json")) return "application/json";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

async function walk(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...(await walk(full)));
    else if (ent.isFile()) out.push(full);
  }
  return out;
}

async function collectFiles() {
  const all = await walk(ROOT);
  if (jsonOnly) {
    return all.filter((f) => {
      const base = path.basename(f);
      return base === "knowledge.json" || base === "index.json";
    });
  }
  return all.filter((f) => {
    const rel = path.relative(ROOT, f);
    if (rel === "build.log") return false;
    return true;
  });
}

async function loadExisting() {
  if (!resume) return new Set();
  const existing = new Set();
  let cursor;
  do {
    const page = await list({ prefix: BLOB_PREFIX, token, cursor });
    for (const b of page.blobs) existing.add(b.pathname);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  console.log(`resume: ${existing.size} blobs already in store`);
  return existing;
}

async function uploadOne(absPath, existing) {
  const rel = path.relative(ROOT, absPath).split(path.sep).join("/");
  const pathname = `${BLOB_PREFIX}/${rel}`;
  if (existing.has(pathname)) {
    return { pathname, skipped: true, url: null };
  }

  const stat = await fs.stat(absPath);
  const useMultipart = stat.size >= MULTIPART_BYTES;
  const body = useMultipart ? createReadStream(absPath) : await fs.readFile(absPath);

  const result = await put(pathname, body, {
    access: "public",
    token,
    contentType: contentType(absPath),
    addRandomSuffix: false,
    allowOverwrite: true,
    multipart: useMultipart,
  });

  return { pathname, skipped: false, url: result.url };
}

async function runPool(tasks, worker) {
  let i = 0;
  let done = 0;
  const total = tasks.length;

  async function workerLoop() {
    while (i < total) {
      const idx = i++;
      await worker(tasks[idx], idx);
      done++;
      if (done % 50 === 0 || done === total) {
        process.stdout.write(`\r  uploaded ${done}/${total}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => workerLoop()));
  if (total) process.stdout.write("\n");
}

async function main() {
  try {
    await fs.access(path.join(ROOT, "knowledge.json"));
  } catch {
    console.error(`Missing ${ROOT}/knowledge.json — run: npm run encyclopedia:learn`);
    process.exit(1);
  }

  const files = await collectFiles();
  if (!files.length) {
    console.error("No files to upload under public/encyclopedia-data");
    process.exit(1);
  }

  console.log(`Uploading ${files.length} file(s) to Vercel Blob…`);
  const existing = await loadExisting();
  let sampleUrl = null;
  let uploaded = 0;
  let skipped = 0;

  await runPool(files, async (absPath) => {
    const r = await uploadOne(absPath, existing);
    if (r.skipped) skipped++;
    else {
      uploaded++;
      if (!sampleUrl && r.url) sampleUrl = r.url;
    }
  });

  console.log(`Done. uploaded=${uploaded} skipped=${skipped}`);

  if (sampleUrl) {
    const base = sampleUrl.replace(/\/encyclopedia-data\/.*$/, "");
    console.log("\nAdd to Vercel Project → Settings → Environment Variables:");
    console.log(`  VITE_ENCYCLOPEDIA_BASE_URL=${base}`);
    console.log("\nLocal dev (.env):");
    console.log(`  VITE_ENCYCLOPEDIA_BASE_URL=${base}`);
    console.log("\nRedeploy Vercel after setting the variable, then refresh the app.");
  } else if (skipped === files.length && files.length > 0) {
    console.log("\nAll files skipped (--resume). Set VITE_ENCYCLOPEDIA_BASE_URL if not done yet.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
