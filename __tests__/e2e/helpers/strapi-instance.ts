import { execSync, spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const STRAPI_APP_DIR = path.resolve(__dirname, '..', 'strapi-app');
const DB_PATH = path.resolve(STRAPI_APP_DIR, '.tmp', 'data.db');
const BASE_URL = process.env.STRAPI_URL ?? 'http://127.0.0.1:1337';
const STARTUP_TIMEOUT_MS = 60_000;

let strapiProcess: ChildProcess | null = null;

const waitForStrapi = (): Promise<void> =>
  new Promise((resolve, reject) => {
    const start = Date.now();

    const check = async () => {
      if (Date.now() - start > STARTUP_TIMEOUT_MS) {
        reject(new Error('Strapi did not start within timeout'));
        return;
      }

      try {
        const response = await fetch(`${BASE_URL}/_health`);
        if (response.status === 204) {
          resolve();
          return;
        }
      } catch {
        // Not ready yet
      }

      setTimeout(check, 500);
    };

    check();
  });

const buildStrapiApp = (): void => {
  console.log('[strapi] Building Strapi app...');
  execSync('npx strapi build', {
    cwd: STRAPI_APP_DIR,
    env: { ...process.env, BROWSER: 'none' },
    stdio: 'inherit',
  });
  console.log('[strapi] Build complete.');
};

export const startStrapi = async (): Promise<void> => {
  // Delete DB for fresh state every run
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
  }

  // Build once (compiles TS, builds admin panel)
  buildStrapiApp();

  // Use `strapi start` — faster than develop, no file watchers, CI-friendly
  strapiProcess = spawn('npx', ['strapi', 'start'], {
    cwd: STRAPI_APP_DIR,
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  strapiProcess.stdout?.on('data', (data: Buffer) => {
    const line = data.toString().trim();
    if (line) process.stdout.write(`[strapi] ${line}\n`);
  });

  strapiProcess.stderr?.on('data', (data: Buffer) => {
    const line = data.toString().trim();
    if (line) process.stderr.write(`[strapi:err] ${line}\n`);
  });

  strapiProcess.on('error', (err) => {
    console.error('[strapi] Process error:', err);
  });

  await waitForStrapi();
};

export const stopStrapi = async (): Promise<void> => {
  if (!strapiProcess) return;

  return new Promise((resolve) => {
    strapiProcess!.on('close', () => {
      strapiProcess = null;
      resolve();
    });

    strapiProcess!.kill('SIGTERM');

    // Force kill after 5 seconds
    setTimeout(() => {
      if (strapiProcess) {
        strapiProcess.kill('SIGKILL');
      }
    }, 5_000);
  });
};

export const getBaseUrl = (): string => BASE_URL;
