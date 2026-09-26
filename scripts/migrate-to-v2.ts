#!/usr/bin/env tsx
import { migrateStoresToV2 } from '../src/core/afkManager.js';
import { createLogger } from '../src/core/logger.js';

const log = createLogger('MigrateV2');

console.log('=====================================================');
console.log(' AnimeX Mark Bot: Store Migration to v2 Format       ');
console.log('=====================================================');

try {
  const result = migrateStoresToV2({ backup: true });

  console.log('\n--- Sync Store Migration ---');
  if (result.sync.migrated) {
    console.log(`[SUCCESS] Migrated sync.json to v2 format.`);
    console.log(`  - Total Links: ${result.sync.totalRecords}`);
    if (result.sync.backupPath) {
      console.log(`  - Backup File: ${result.sync.backupPath}`);
    }
  } else {
    console.log(`[INFO] sync.json is already up to date (Total records: ${result.sync.totalRecords})`);
  }

  console.log('\n--- AFK Store Migration ---');
  if (result.afk.migrated) {
    console.log(`[SUCCESS] Migrated afk.json to v2 partitioned format.`);
    console.log(`  - Total Records: ${result.afk.totalRecords}`);
    if (result.afk.backupPath) {
      console.log(`  - Backup File: ${result.afk.backupPath}`);
    }
  } else {
    console.log(`[INFO] afk.json is already up to date (Total records: ${result.afk.totalRecords})`);
  }

  console.log('\n=====================================================');
  console.log(' Migration process completed successfully.');
  console.log('=====================================================\n');
} catch (error) {
  log.error('Migration failed:', error);
  process.exit(1);
}
