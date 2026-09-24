import fs from 'node:fs';
import path from 'node:path';
import { createLogger } from './logger.js';

const log = createLogger('DataDir');

let resolvedDataDir: string | null = null;

function isWritable(dirPath: string): boolean {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    fs.accessSync(dirPath, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export function getDataDir(): string {
  if (resolvedDataDir) {
    return resolvedDataDir;
  }

  // 1. Explicit environment override
  if (process.env.DATA_DIR) {
    const customPath = path.isAbsolute(process.env.DATA_DIR)
      ? process.env.DATA_DIR
      : path.resolve(process.cwd(), process.env.DATA_DIR);
    if (isWritable(customPath)) {
      resolvedDataDir = customPath;
      return resolvedDataDir;
    }
    log.warn(`DATA_DIR "${process.env.DATA_DIR}" is not writable. Falling back.`);
  }

  // 2. Railway / Linux root persistent volume (/data)
  if (fs.existsSync('/data') && isWritable('/data')) {
    resolvedDataDir = '/data';
    return resolvedDataDir;
  }

  // 3. Local working directory fallback (./data)
  const localDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(localDir)) {
    try {
      fs.mkdirSync(localDir, { recursive: true });
    } catch {
      // Ignore directory create error
    }
  }
  resolvedDataDir = localDir;
  return resolvedDataDir;
}

export function ensureDataDirSetup(): string {
  const dir = getDataDir();
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Ensure .config.mark stays in /data
    const dataConfigFile = path.join(dir, '.config.mark');
    if (!fs.existsSync(dataConfigFile)) {
      const candidates = [
        path.resolve(process.cwd(), '.config.mark'),
        path.resolve(process.cwd(), '.config.mark.local'),
        path.resolve(process.cwd(), '.config.mark.example'),
      ];
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          fs.copyFileSync(candidate, dataConfigFile);
          log.info(`Initialized persistent configuration at ${dataConfigFile} from ${path.basename(candidate)}`);
          break;
        }
      }
    }
  } catch (error) {
    log.warn('Could not complete data directory setup:', error);
  }
  return dir;
}

export function getAfkFilePath(): string {
  return path.join(getDataDir(), 'afk.json');
}

export function getSyncFilePath(): string {
  return path.join(getDataDir(), 'sync.json');
}

export function getConfigMarkFilePath(): string {
  return path.join(getDataDir(), '.config.mark');
}
