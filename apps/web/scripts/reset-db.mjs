#!/usr/bin/env node
import { rmSync } from 'node:fs';
import { join } from 'node:path';

const base = process.env.RELAY_DB_PATH ?? join(process.cwd(), '.data', 'relay.db');

for (const path of [base, `${base}-wal`, `${base}-shm`]) {
  rmSync(path, { force: true });
}

console.log(`Removed ${base}. It will reseed on the next API request.`);
