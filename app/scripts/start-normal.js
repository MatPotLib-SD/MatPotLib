const { spawn } = require('node:child_process');

const child = spawn('npx', ['expo', 'start', '--clear', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, EXPO_PUBLIC_TABLING_MODE: 'false' },
});

child.on('exit', (code) => process.exit(code ?? 0));
