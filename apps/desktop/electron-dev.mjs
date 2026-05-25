import { spawn } from 'node:child_process';
import electron from 'electron';

const app = spawn(electron, ['dist/main/main.js'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    LASTBROWSER_RENDERER_URL: 'http://127.0.0.1:5173'
  }
});

app.on('exit', (code) => process.exit(code ?? 0));
