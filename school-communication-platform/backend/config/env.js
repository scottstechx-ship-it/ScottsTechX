/**
 * Environment configuration loader.
 * All secrets and environment-specific values come from environment variables
 * (loaded from a .env file at the project root via dotenv in server.js).
 * Never hardcode secrets in source code.
 */
const path = require('path');
const crypto = require('crypto');

function bool(v, def = false) {
  if (v === undefined || v === null || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

const root = path.resolve(__dirname, '..', '..');

const env = {
  // Server
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '4000', 10),
  API_BASE_URL: (process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, ''),
  FRONTEND_URL: (process.env.FRONTEND_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, ''),

  // Database
  DATABASE_PATH: path.resolve(root, process.env.DATABASE_PATH || 'backend/data/school.db'),

  // Uploads
  UPLOAD_DIR: path.resolve(root, process.env.UPLOAD_DIR || 'backend/uploads'),
  MAX_FILE_SIZE: (parseInt(process.env.MAX_FILE_SIZE_MB || '15', 10) || 15) * 1024 * 1024,

  // Auth
  JWT_SECRET: process.env.JWT_SECRET || 'insecure-dev-secret-change-me',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '12h',
  STRONG_PASSWORDS: bool(process.env.STRONG_PASSWORDS, true),

  // CORS
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // Rate limiting
  RATE_LIMIT_PER_MINUTE: parseInt(process.env.RATE_LIMIT_PER_MINUTE || '600', 10),
  LOGIN_RATE_LIMIT_PER_15MIN: parseInt(process.env.LOGIN_RATE_LIMIT_PER_15MIN || '20', 10),

  // Demo data
  SEED_DEMO_DATA: bool(process.env.SEED_DEMO_DATA, true),

  root,
};

if (env.JWT_SECRET === 'insecure-dev-secret-change-me' && env.NODE_ENV === 'production') {
  // Fail fast in production rather than silently running insecure.
  throw new Error('JWT_SECRET must be set to a strong random value in production.');
}

module.exports = env;
