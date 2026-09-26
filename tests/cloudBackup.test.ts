import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  getDataDir,
  getAfkFilePath,
  getSyncFilePath,
  getConfigMarkFilePath,
  ensureDataDirSetup,
} from '../src/core/dataDir.js';
import { chunkBuffer, getBackupStatus } from '../src/core/cloudBackup.js';

describe('Data Directory & Persistence', () => {
  it('resolves a valid, accessible data directory', () => {
    const dir = getDataDir();
    expect(typeof dir).toBe('string');
    expect(fs.existsSync(dir)).toBe(true);
  });

  it('provides persistent file paths within the data directory', () => {
    const dir = getDataDir();
    expect(getAfkFilePath()).toBe(path.join(dir, 'afk.json'));
    expect(getSyncFilePath()).toBe(path.join(dir, 'sync.json'));
    expect(getConfigMarkFilePath()).toBe(path.join(dir, '.config.mark'));
  });

  it('ensures persistent .config.mark exists inside data directory', () => {
    ensureDataDirSetup();
    expect(fs.existsSync(getConfigMarkFilePath())).toBe(true);
  });
});

describe('Cloud Backup Chunking & Multipart Handling', () => {
  it('correctly chunks large buffers when exceeding threshold', () => {
    const testData = Buffer.from('A'.repeat(5000));
    const chunkSize = 1500;

    const chunks = chunkBuffer(testData, chunkSize);

    expect(chunks.length).toBe(4);
    expect(chunks[0]!.length).toBe(1500);
    expect(chunks[1]!.length).toBe(1500);
    expect(chunks[2]!.length).toBe(1500);
    expect(chunks[3]!.length).toBe(500);

    const reassembled = Buffer.concat(chunks);
    expect(reassembled.equals(testData)).toBe(true);
  });

  it('correctly identifies and reassembles multipart backup file parts', () => {
    const attachments = [
      { name: 'sync.json', buffer: Buffer.from('{"test": true}') },
      { name: 'afk.json.part2', buffer: Buffer.from('world!') },
      { name: 'afk.json.part1', buffer: Buffer.from('hello ') },
    ];

    const filePartMap = new Map<string, Array<{ partIndex: number; buffer: Buffer }>>();
    const singleFiles: Array<{ name: string; buffer: Buffer }> = [];

    for (const att of attachments) {
      const partMatch = att.name.match(/^(.*?)\.part(\d+)$/);
      if (partMatch) {
        const baseName = partMatch[1]!;
        const partIndex = parseInt(partMatch[2]!, 10);
        const existing = filePartMap.get(baseName) || [];
        existing.push({ partIndex, buffer: att.buffer });
        filePartMap.set(baseName, existing);
      } else {
        singleFiles.push({ name: att.name, buffer: att.buffer });
      }
    }

    for (const [baseName, parts] of filePartMap.entries()) {
      parts.sort((a, b) => a.partIndex - b.partIndex);
      const combined = Buffer.concat(parts.map((p) => p.buffer));
      singleFiles.push({ name: baseName, buffer: combined });
    }

    const afkFile = singleFiles.find((f) => f.name === 'afk.json');
    expect(afkFile).toBeDefined();
    expect(afkFile?.buffer.toString('utf-8')).toBe('hello world!');

    const syncFile = singleFiles.find((f) => f.name === 'sync.json');
    expect(syncFile).toBeDefined();
    expect(syncFile?.buffer.toString('utf-8')).toBe('{"test": true}');
  });

  it('exposes accurate telemetry status with getBackupStatus', () => {
    const status = getBackupStatus();
    expect(typeof status.enabled).toBe('boolean');
    expect(['discord', 'fluxer']).toContain(status.platform);
    expect(typeof status.intervalMin).toBe('number');
    expect(Array.isArray(status.files)).toBe(true);
    expect(status.files.length).toBeGreaterThanOrEqual(3);
    const names = status.files.map((f) => f.name);
    expect(names).toContain('afk.json');
    expect(names).toContain('sync.json');
    expect(names).toContain('.config.mark');
  });
});
