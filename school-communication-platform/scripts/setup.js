/**
 * Configure this copy for the school that will use it.
 *
 * Run this on the computer or server where the system will live, from the
 * project folder:
 *
 *   node scripts/setup.js --url https://school.example.com
 *
 * It writes .env (a secret file — do not zip that and send it around),
 * installs the libraries, and tells you how to start.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const examplePath = path.join(root, '.env.example');
const envPath = path.join(root, '.env');

function arg(name) {
  const i = process.argv.indexOf(name);
  if (i === -1) return '';
  return process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : '';
}

function cleanUrl(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  let url;
  try { url = new URL(raw); } catch { throw new Error('The address must look like https://school.example.com'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('The address must start with http:// or https://');
  }
  return url.origin;
}

const force = process.argv.includes('--force');
const skipInstall = process.argv.includes('--no-install');
let url;
try {
  url = cleanUrl(arg('--url') || 'http://localhost:4000');
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
const port = url.includes('localhost') || url.includes('127.0.0.1')
  ? (new URL(url).port || '4000')
  : (new URL(url).port || '4000');

if (!fs.existsSync(examplePath)) {
  console.error('Missing .env.example. Run this from the school system folder.');
  process.exit(1);
}

if (fs.existsSync(envPath) && !force) {
  console.log('.env already exists. Nothing was overwritten.');
  console.log('To write a new one: node scripts/setup.js --url ' + url + ' --force');
  process.exit(0);
}

const secret = crypto.randomBytes(48).toString('hex');
let text = fs.readFileSync(examplePath, 'utf8');
const set = (key, value) => {
  const line = key + '=' + value;
  const re = new RegExp('^' + key + '=.*$', 'm');
  text = re.test(text) ? text.replace(re, line) : text + '\n' + line;
};
set('NODE_ENV', 'production');
set('PORT', port || '4000');
set('API_BASE_URL', url);
set('FRONTEND_URL', url);
set('JWT_SECRET', secret);
set('JWT_EXPIRES_IN', '12h');
set('STRONG_PASSWORDS', 'true');
set('SEED_DEMO_DATA', 'true');
fs.writeFileSync(envPath, text);
fs.chmodSync(envPath, 0o600);

console.log('Configured ' + url);
console.log('Wrote .env with a new secret. Do not email that file.');

if (!skipInstall) {
  console.log('Installing libraries…');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const install = spawnSync(npm, ['install', '--omit=dev'], { cwd: root, stdio: 'inherit' });
  if (install.status) process.exit(install.status || 1);
}

console.log('');
console.log('Start it with:  npm start');
console.log('Then open:      ' + url);
console.log('First sign-in:  admin / Admin@123');
console.log('Change that password before the school starts using it.');
console.log('After real accounts exist, set SEED_DEMO_DATA=false in .env and restart.');
