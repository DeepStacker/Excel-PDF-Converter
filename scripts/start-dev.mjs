import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import net from 'net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../');

// Helper to log with nice colors
function log(msg, type = 'info') {
  const colors = {
    info: '\x1b[36m%s\x1b[0m',     // Cyan
    success: '\x1b[32m%s\x1b[0m',  // Green
    warning: '\x1b[33m%s\x1b[0m',  // Yellow
    error: '\x1b[31m%s\x1b[0m',    // Red
    api: '\x1b[35m%s\x1b[0m',      // Magenta
    frontend: '\x1b[34m%s\x1b[0m', // Blue
  };
  console.log(colors[type] || '%s', msg);
}

// 1. Ensure .env exists in the root
const envPath = path.join(rootDir, '.env');
const envExamplePath = path.join(rootDir, '.env.example');

if (!fs.existsSync(envPath)) {
  log('📝 .env file not found. Copying .env.example to .env...', 'warning');
  fs.copyFileSync(envExamplePath, envPath);
  log('✅ .env created successfully.', 'success');
}

// Load env variables manually from .env
function loadEnv() {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let val = match[2].trim();
      // Strip optional quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}
loadEnv();

// Set default PORT if not present
if (!process.env.PORT) {
  process.env.PORT = '8080';
}

// Ensure DATABASE_URL is present
if (!process.env.DATABASE_URL) {
  log('❌ DATABASE_URL is not set in .env. Please define it.', 'error');
  process.exit(1);
}

// 2. Start PostgreSQL via Docker Compose
log('🐘 Starting PostgreSQL database via Docker Compose...', 'info');
try {
  execSync('docker compose up -d', { stdio: 'inherit', cwd: rootDir });
  log('✅ Docker Compose completed.', 'success');
} catch (error) {
  log('⚠️ Failed to start Docker Compose. Please make sure Docker is running!', 'warning');
}

// 3. Wait for PostgreSQL to accept connections on port 5432
async function waitForPostgres(host = '127.0.0.1', port = 5432, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    log(`⏳ Waiting for database on ${host}:${port}...`, 'info');
    
    const interval = setInterval(() => {
      if (Date.now() - startTime > timeoutMs) {
        clearInterval(interval);
        reject(new Error('Timeout waiting for database connection. Make sure Postgres is running and port 5432 is exposed.'));
        return;
      }

      const socket = new net.Socket();
      socket.connect(port, host, () => {
        socket.end();
        clearInterval(interval);
        log('✅ Database is ready and accepting connections!', 'success');
        resolve();
      });

      socket.on('error', () => {
        // Keep trying
        socket.destroy();
      });
    }, 1000);
  });
}

// Main execution flow
async function main() {
  try {
    // Wait for db
    await waitForPostgres('127.0.0.1', 5432);

    // 4. Run database migrations
    log('🔄 Pushing database migrations (drizzle-kit push)...', 'info');
    execSync('pnpm --filter @workspace/db run push', { stdio: 'inherit', cwd: rootDir });
    log('✅ Database schema is up to date.', 'success');

    // 5. Start API Server and Frontend in parallel
    log('🚀 Starting API Server and PDF Generator frontend...', 'info');

    const apiProcess = spawn('pnpm', ['--filter', '@workspace/api-server', 'run', 'dev'], {
      cwd: rootDir,
      stdio: 'pipe',
      shell: true,
      env: { ...process.env, PORT: '8080' }
    });

    const frontendProcess = spawn('pnpm', ['--filter', '@workspace/pdf-generator', 'run', 'dev'], {
      cwd: rootDir,
      stdio: 'pipe',
      shell: true,
      env: { ...process.env, PORT: '25103' }
    });

    const formatLogs = (processName, colorType) => (data) => {
      const lines = data.toString().trim().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          log(`[${processName}] ${line}`, colorType);
        }
      }
    };

    apiProcess.stdout.on('data', formatLogs('API', 'api'));
    apiProcess.stderr.on('data', formatLogs('API', 'error'));

    frontendProcess.stdout.on('data', formatLogs('Frontend', 'frontend'));
    frontendProcess.stderr.on('data', formatLogs('Frontend', 'error'));

    // Handle shutdown
    const cleanup = () => {
      log('\nStopping all services...', 'warning');
      apiProcess.kill();
      frontendProcess.kill();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    apiProcess.on('close', (code) => {
      log(`API process exited with code ${code}`, 'error');
      cleanup();
    });

    frontendProcess.on('close', (code) => {
      log(`Frontend process exited with code ${code}`, 'error');
      cleanup();
    });

  } catch (error) {
    log(`❌ Error during startup: ${error.message}`, 'error');
    process.exit(1);
  }
}

main();
