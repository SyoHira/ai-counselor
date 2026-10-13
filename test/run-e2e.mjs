import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';

// Own the server and clear the API key so a test can never spend provider credits.
const socket = createServer().listen(0, '127.0.0.1');
await once(socket, 'listening');
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
  stdio: 'inherit', env: { ...process.env, ANTHROPIC_API_KEY: '', APP_PASSCODE: '', NEXT_TELEMETRY_DISABLED: '1' },
});
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error('Test server exited before becoming ready');
    try { ready = (await fetch(base)).ok; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('Test server did not become ready');
  const test = spawn(process.execPath, ['test/e2e.mjs'], { stdio: 'inherit', env: { ...process.env, BASE_URL: base } });
  const [code] = await once(test, 'exit');
  process.exitCode = code ?? 1;
} finally {
  if (server.exitCode === null && server.signalCode === null) {
    server.kill('SIGTERM');
    await once(server, 'exit');
  }
}
