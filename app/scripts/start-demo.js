/**
 * Starts the Expo dev server with demo mode forced on, without editing .env.
 *
 *   npm run demo              # demo mode, LAN
 *   npm run demo -- --tunnel  # demo mode, tunnel (managed/campus Wi-Fi)
 *
 * Shell environment takes precedence over app/.env, so setting
 * EXPO_PUBLIC_DEMO_MODE here overrides the `false` in that file for this run
 * only.  EXPO_PUBLIC_* values are inlined into the bundle at build time, so
 * --clear is passed to drop Metro's stale transform cache from a normal run.
 */
const { spawn } = require('node:child_process');

const child = spawn('npx', ['expo', 'start', '--clear', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true, // required on Windows to invoke the .cmd shim
  env: { ...process.env, EXPO_PUBLIC_DEMO_MODE: 'true' },
});

child.on('exit', (code) => process.exit(code ?? 0));
