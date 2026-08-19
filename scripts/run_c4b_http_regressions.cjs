const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
let server;

async function waitForHealth() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch('http://127.0.0.1:3000/api/health');
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('Regression server did not become healthy');
}

function runScript(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { cwd: root, stdio: 'inherit' });
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${script} exited with ${code}`)));
  });
}

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  server.kill('SIGTERM');
  await Promise.race([
    new Promise(resolve => server.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 3000))
  ]);
  if (server.exitCode === null) server.kill('SIGKILL');
}

async function main() {
  server = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: root,
    env: { ...process.env, PORT: '3000', NODE_ENV: 'test', DISABLE_VITE: 'true' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stdout.on('data', chunk => process.env.C4B_REGRESSION_VERBOSE === 'true' && process.stdout.write(chunk));
  server.stderr.on('data', chunk => process.env.C4B_REGRESSION_VERBOSE === 'true' && process.stderr.write(chunk));
  await waitForHealth();
  await runScript('scripts/verify_c4b2.cjs');
  await runScript('scripts/verify_c4b3.cjs');
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(stopServer);
