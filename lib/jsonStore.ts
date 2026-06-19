// Atomic, write-serialized JSON file store.
//
// Our on-disk config (providers, Hermes connection, conversations) is plain
// JSON under data/. Two things make naive read-modify-write unsafe:
//   1. Concurrent requests can interleave a read and a write, losing an update.
//   2. A crash mid-write leaves a truncated, unparseable file.
//
// This store fixes both: every operation runs through a per-file promise queue
// (so they never interleave), and writes go to a temp file then `rename` over
// the target (atomic on POSIX and on Windows via MoveFileEx). Server-only.

import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");

export interface JsonStore<T> {
  /** Read current value, seeding the file on first access. */
  read(): Promise<T>;
  /** Replace the whole value. */
  write(value: T): Promise<T>;
  /** Serialized read-modify-write — the only safe way to mutate. */
  update(fn: (current: T) => T | Promise<T>): Promise<T>;
}

export function createJsonStore<T>(opts: {
  filename: string;
  /** Default value used to seed the file when it doesn't exist yet. */
  seed: () => T;
  /**
   * Optional merge of the seed under the parsed file, so newly-added fields
   * pick up sane defaults for existing installs (used by the Hermes config).
   */
  merge?: (seed: T, parsed: T) => T;
}): JsonStore<T> {
  const filePath = path.join(DATA_DIR, opts.filename);
  let chain: Promise<unknown> = Promise.resolve();

  // Run `op` after whatever is already queued, regardless of its outcome, so
  // one failed op doesn't wedge the queue.
  function enqueue<R>(op: () => Promise<R>): Promise<R> {
    const run = chain.then(op, op);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function atomicWrite(value: T): Promise<void> {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmp = `${filePath}.${process.pid}.${Math.random()
      .toString(36)
      .slice(2)}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
    await fs.rename(tmp, filePath);
  }

  async function readRaw(): Promise<T> {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as T;
      return opts.merge ? opts.merge(opts.seed(), parsed) : parsed;
    } catch {
      const seeded = opts.seed();
      await atomicWrite(seeded);
      return seeded;
    }
  }

  return {
    read: () => enqueue(readRaw),
    write: (value) =>
      enqueue(async () => {
        await atomicWrite(value);
        return value;
      }),
    update: (fn) =>
      enqueue(async () => {
        const current = await readRaw();
        const next = await fn(current);
        await atomicWrite(next);
        return next;
      }),
  };
}
