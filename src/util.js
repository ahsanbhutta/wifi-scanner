// Small shared helpers: bounded-concurrency pool, child-process exec, sleeps.

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Run `fn(item)` over `items` with at most `limit` in flight. */
export async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = await fn(items[i], i);
      } catch (err) {
        results[i] = { error: err?.message ?? String(err) };
      }
    }
  }
  const n = Math.max(1, Math.min(limit, items.length || 1));
  await Promise.all(Array.from({ length: n }, worker));
  return results;
}

/** Spawn a process without a shell; resolves with {code, stdout, stderr}. */
export function execFile(file, args, { timeout = 5000 } = {}) {
  return new Promise((resolve) => {
    import('node:child_process').then(({ execFile: run }) => {
      run(
        file,
        args,
        { timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
        (error, stdout, stderr) => {
          resolve({
            code: error && typeof error.code === 'number' ? error.code : error ? 1 : 0,
            stdout: stdout?.toString() ?? '',
            stderr: stderr?.toString() ?? '',
            timedOut: Boolean(error && error.killed),
          });
        },
      );
    });
  });
}

/** Run a PowerShell -Command script and return trimmed stdout. */
export async function runPowerShell(script, { timeout = 15000 } = {}) {
  const res = await execFile(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { timeout },
  );
  return { ok: res.code === 0 && !res.timedOut, out: res.stdout.trim(), err: res.stderr.trim() };
}
