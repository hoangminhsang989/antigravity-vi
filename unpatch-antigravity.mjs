#!/usr/bin/env node
import fs from 'fs';
import os from 'os';
import path from 'path';

const ANTIGRAVITY_DIR = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
  'Programs',
  'antigravity'
);
const ASAR_PATH = path.join(ANTIGRAVITY_DIR, 'resources', 'app.asar');
const ORIG_PATH = path.join(ANTIGRAVITY_DIR, 'resources', 'app.asar.orig');

if (!fs.existsSync(ORIG_PATH)) {
  console.error('[agy-vi] Backup app.asar.orig not found.');
  process.exit(1);
}

fs.copyFileSync(ORIG_PATH, ASAR_PATH);
console.log('[agy-vi] Restored original app.asar from app.asar.orig.');
