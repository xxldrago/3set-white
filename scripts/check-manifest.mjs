// Manifest smoke check: boots the production server, fetches the PWA
// manifest endpoint, and asserts installability signals.
// Usage: npm run build && node scripts/check-manifest.mjs
// Serwist intentionally stays out per D-13 — installability must hold
// without any service worker.
import { spawn } from 'node:child_process';

const PORT = Number(process.env.CHECK_PORT ?? 3111);
const URL = `http://127.0.0.1:${PORT}/manifest.webmanifest`;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(proc, timeoutMs = 30000) {
  const start = Date.now();
  for (;;) {
    try {
      const res = await fetch(URL);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    if (proc.exitCode !== null && proc.exitCode !== undefined) {
      throw new Error(`next start exited early with code ${proc.exitCode}`);
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error(`server did not become ready within ${timeoutMs}ms`);
    }
    await wait(500);
  }
}

async function main() {
  const proc = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  proc.stdout.on('data', (d) => {
    stdout += String(d);
  });
  proc.stderr.on('data', (d) => {
    stdout += String(d);
  });

  const kill = () =>
    new Promise((resolve) => {
      if (proc.exitCode !== null) return resolve();
      proc.on('exit', () => resolve());
      proc.kill('SIGTERM');
      setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {
          // already dead
        }
        resolve();
      }, 5000).unref?.();
    });

  try {
    await waitForServer(proc);
    const res = await fetch(URL);
    if (!res.ok) {
      throw new Error(`manifest endpoint status ${res.status}`);
    }
    const manifest = await res.json();

    const errors = [];
    if (!manifest.name || !String(manifest.name).includes('3set')) {
      errors.push(`name missing or unexpected: ${JSON.stringify(manifest.name)}`);
    }
    if (manifest.display !== 'standalone') {
      errors.push(`display must be standalone, got: ${JSON.stringify(manifest.display)}`);
    }
    const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
    const sizes = icons.map((i) => i?.sizes).filter(Boolean);
    if (!sizes.includes('192x192')) {
      errors.push(`icons lack 192x192 entry: ${JSON.stringify(sizes)}`);
    }
    if (!sizes.includes('512x512')) {
      errors.push(`icons lack 512x512 entry: ${JSON.stringify(sizes)}`);
    }

    if (errors.length > 0) {
      for (const e of errors) console.error(`MANIFEST_FAIL: ${e}`);
      process.exitCode = 1;
      return;
    }
    console.log(
      `MANIFEST_OK name=${JSON.stringify(manifest.name)} display=${manifest.display} icons=${sizes.join(',')}`,
    );
  } finally {
    await kill();
  }
}

main().catch((err) => {
  console.error(`MANIFEST_FAIL: ${err?.message ?? err}`);
  process.exitCode = 1;
});
