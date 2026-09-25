import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { AttachmentBuilder as DiscordAttachmentBuilder, type TextBasedChannel as DiscordTextChannel } from 'discord.js';
import { AttachmentBuilder as FluxerAttachmentBuilder, type TextChannel as FluxerTextChannel } from '@fluxerjs/core';
import { config } from '../config.js';
import { createLogger } from './logger.js';
import { loadAfkStore, saveAfkStore } from './afkManager.js';
import { loadSyncStore, saveSyncStore, getAllLinks } from './syncManager.js';
import {
  getDataDir,
  getAfkFilePath,
  getSyncFilePath,
  getConfigMarkFilePath,
} from './dataDir.js';

const log = createLogger('CloudBackup');

const BACKUP_HEADER_TAG = '[AnimeX Cloud Backup] v1';

let schedulerStarted = false;
let backupInitialized = false;

let lastBackupTime: number | null = null;
let lastBackupReason: string | null = null;
let lastBackupSuccess: boolean | null = null;
let lastRestoreTime: number | null = null;
let lastRestoreSuccess: boolean | null = null;

export interface BackupStatusInfo {
  readonly enabled: boolean;
  readonly platform: 'discord' | 'fluxer';
  readonly channelId: string | null;
  readonly intervalMin: number;
  readonly autoRestore: boolean;
  readonly lastBackupTime: number | null;
  readonly lastBackupReason: string | null;
  readonly lastBackupSuccess: boolean | null;
  readonly lastRestoreTime: number | null;
  readonly lastRestoreSuccess: boolean | null;
  readonly files: Array<{ name: string; sizeBytes: number; exists: boolean }>;
}

export interface BackupFilePayload {
  name: string;
  buffer: Buffer;
}

interface BackupSnapshot {
  content: string;
  attachments: Array<{ name: string; url: string }>;
}

interface BackupChannel {
  readonly platform: 'discord' | 'fluxer';
  sendBackup(content: string, files: BackupFilePayload[]): Promise<void>;
  fetchLatestBackup(): Promise<BackupSnapshot | null>;
}

export function chunkBuffer(buffer: Buffer, maxChunkSize: number): Buffer[] {
  if (buffer.length <= maxChunkSize) {
    return [buffer];
  }
  const chunks: Buffer[] = [];
  let offset = 0;
  while (offset < buffer.length) {
    const end = Math.min(offset + maxChunkSize, buffer.length);
    chunks.push(buffer.subarray(offset, end));
    offset = end;
  }
  return chunks;
}

async function getDiscordBackupChannel(channelId: string): Promise<BackupChannel | null> {
  const { getDiscordClient } = await import('../platforms/discord/client.js');
  const client = getDiscordClient();
  if (!client?.isReady()) return null;

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased() || !('send' in channel) || typeof (channel as any).send !== 'function') return null;

    const textChannel = channel as DiscordTextChannel & {
      send(opts: { content: string; files: DiscordAttachmentBuilder[] }): Promise<unknown>;
    };
    return {
      platform: 'discord',
      async sendBackup(content, files) {
        const attachments = files.map((f) => new DiscordAttachmentBuilder(f.buffer, { name: f.name }));
        await textChannel.send({ content, files: attachments });
      },
      async fetchLatestBackup() {
        const messages = await textChannel.messages.fetch({ limit: 15 });
        for (const msg of messages.values()) {
          if (msg.content.includes(BACKUP_HEADER_TAG) && msg.attachments.size > 0) {
            return {
              content: msg.content,
              attachments: Array.from(msg.attachments.values()).map((a) => ({
                name: a.name,
                url: a.url,
              })),
            };
          }
        }
        return null;
      },
    };
  } catch (error) {
    log.warn(`Could not access Discord cloud backup channel "${channelId}":`, error);
    return null;
  }
}

async function getFluxerBackupChannel(channelId: string): Promise<BackupChannel | null> {
  const { getFluxerClient } = await import('../platforms/fluxer/client.js');
  const client = getFluxerClient();
  if (!client?.isReady()) return null;

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased() || !('send' in channel)) return null;

    const textChannel = channel as FluxerTextChannel;
    return {
      platform: 'fluxer',
      async sendBackup(content, files) {
        const attachments = files.map((f) => new FluxerAttachmentBuilder(f.buffer, { name: f.name }));
        await textChannel.send({ content, files: attachments });
      },
      async fetchLatestBackup() {
        if (typeof textChannel.messages?.fetch !== 'function') return null;
        const messages = await textChannel.messages.fetch({ limit: 15 });
        const list = typeof messages.values === 'function'
          ? Array.from(messages.values())
          : Array.isArray(messages)
            ? messages
            : [];

        for (const msg of list as any[]) {
          const rawAttachments = msg.attachments
            ? typeof msg.attachments.values === 'function'
              ? Array.from(msg.attachments.values())
              : Array.isArray(msg.attachments)
                ? msg.attachments
                : []
            : [];

          if (msg.content?.includes(BACKUP_HEADER_TAG) && rawAttachments.length > 0) {
            return {
              content: msg.content,
              attachments: rawAttachments.map((a: any) => ({
                name: a.filename || a.name,
                url: a.url,
              })),
            };
          }
        }
        return null;
      },
    };
  } catch (error) {
    log.warn(`Could not access Fluxer cloud backup channel "${channelId}":`, error);
    return null;
  }
}

async function resolveBackupChannel(): Promise<BackupChannel | null> {
  const channelId = config.cloudBackupChannelId;
  if (!channelId) return null;

  if (config.cloudBackupPlatform === 'discord') {
    return getDiscordBackupChannel(channelId);
  }
  if (config.cloudBackupPlatform === 'fluxer') {
    return getFluxerBackupChannel(channelId);
  }
  return null;
}

export async function downloadAndReassembleAttachments(
  attachments: Array<{ name: string; url: string }>
): Promise<BackupFilePayload[]> {
  const filePartMap = new Map<string, Array<{ partIndex: number; buffer: Buffer }>>();
  const result: BackupFilePayload[] = [];

  for (const att of attachments) {
    const response = await fetch(att.url);
    if (!response.ok) {
      log.warn(`Failed to fetch attachment "${att.name}" from ${att.url}: ${response.statusText}`);
      continue;
    }
    const arrayBuf = await response.arrayBuffer();
    const buf = Buffer.from(arrayBuf);

    const partMatch = att.name.match(/^(.*?)\.part(\d+)$/);
    if (partMatch) {
      const baseName = partMatch[1]!;
      const partIndex = parseInt(partMatch[2]!, 10);
      const existing = filePartMap.get(baseName) || [];
      existing.push({ partIndex, buffer: buf });
      filePartMap.set(baseName, existing);
    } else {
      result.push({ name: att.name, buffer: buf });
    }
  }

  for (const [baseName, parts] of filePartMap.entries()) {
    parts.sort((a, b) => a.partIndex - b.partIndex);
    const combined = Buffer.concat(parts.map((p) => p.buffer));
    result.push({ name: baseName, buffer: combined });
  }

  return result;
}

export function getBackupStatus(): BackupStatusInfo {
  const trackedFiles = [
    { localPath: getAfkFilePath(), fileName: 'afk.json' },
    { localPath: getSyncFilePath(), fileName: 'sync.json' },
    { localPath: getConfigMarkFilePath(), fileName: '.config.mark' },
  ];

  const files = trackedFiles.map((f) => {
    const exists = fs.existsSync(f.localPath);
    let sizeBytes = 0;
    if (exists) {
      try {
        sizeBytes = fs.statSync(f.localPath).size;
      } catch {
        sizeBytes = 0;
      }
    }
    return { name: f.fileName, sizeBytes, exists };
  });

  return {
    enabled: config.cloudBackupEnabled,
    platform: config.cloudBackupPlatform,
    channelId: config.cloudBackupChannelId,
    intervalMin: config.cloudBackupIntervalMin,
    autoRestore: config.cloudBackupAutoRestore,
    lastBackupTime,
    lastBackupReason,
    lastBackupSuccess,
    lastRestoreTime,
    lastRestoreSuccess,
    files,
  };
}

export async function performCloudBackup(reason = 'scheduled'): Promise<boolean> {
  if (!config.cloudBackupEnabled) return false;

  const target = await resolveBackupChannel();
  if (!target) {
    log.warn('Cloud backup enabled but backup channel could not be accessed. Skipping backup.');
    lastBackupSuccess = false;
    return false;
  }

  try {
    saveAfkStore();
    saveSyncStore();

    const dataDir = getDataDir();
    const filesToBackup = [
      { localPath: getAfkFilePath(), fileName: 'afk.json' },
      { localPath: getSyncFilePath(), fileName: 'sync.json' },
      { localPath: getConfigMarkFilePath(), fileName: '.config.mark' },
    ];

    const maxPartBytes = Math.max(1, config.cloudBackupMaxPartSizeMb || 8) * 1024 * 1024;
    const payloads: BackupFilePayload[] = [];
    const archivedSummaries: string[] = [];

    for (const item of filesToBackup) {
      if (fs.existsSync(item.localPath)) {
        const fileBuffer = fs.readFileSync(item.localPath);
        const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex').slice(0, 10);

        if (fileBuffer.length > maxPartBytes) {
          const chunks = chunkBuffer(fileBuffer, maxPartBytes);
          for (let i = 0; i < chunks.length; i++) {
            payloads.push({
              name: `${item.fileName}.part${i + 1}`,
              buffer: chunks[i]!,
            });
          }
          archivedSummaries.push(`• **${item.fileName}**: ${fileBuffer.length}B, ${chunks.length} parts, sha256:\`${checksum}\``);
        } else {
          payloads.push({ name: item.fileName, buffer: fileBuffer });
          archivedSummaries.push(`• **${item.fileName}**: ${fileBuffer.length}B, sha256:\`${checksum}\``);
        }
      }
    }

    if (payloads.length === 0) {
      log.info('No persistent data files found to back up.');
      return false;
    }

    const timestamp = Date.now();
    const isoTime = new Date(timestamp).toISOString();
    const content =
      `# ${BACKUP_HEADER_TAG}\n` +
      `• **Timestamp**: \`${timestamp}\` (${isoTime})\n` +
      `• **Reason**: \`${reason}\`\n` +
      `• **Data Directory**: \`${dataDir}\`\n` +
      `• **Archived Files**:\n${archivedSummaries.join('\n')}`;

    await target.sendBackup(content, payloads);
    lastBackupTime = timestamp;
    lastBackupReason = reason;
    lastBackupSuccess = true;

    log.info(`Cloud backup dispatched to ${target.platform} (Reason: ${reason}, Parts: ${payloads.length})`);
    return true;
  } catch (error) {
    lastBackupSuccess = false;
    log.error('Failed to dispatch cloud backup:', error);
    return false;
  }
}

export async function restoreFromCloud(force = false): Promise<boolean> {
  if (!config.cloudBackupEnabled || (!config.cloudBackupAutoRestore && !force)) return false;

  const target = await resolveBackupChannel();
  if (!target) {
    log.warn('Cloud restore requested but backup channel could not be accessed. Skipping.');
    lastRestoreSuccess = false;
    return false;
  }

  try {
    log.info(`Checking ${target.platform} channel for latest cloud backup...`);
    const backupMessage = await target.fetchLatestBackup();
    if (!backupMessage || backupMessage.attachments.length === 0) {
      log.info('No valid cloud backup messages found in channel.');
      return false;
    }

    const dataDir = getDataDir();
    const singleFiles = await downloadAndReassembleAttachments(backupMessage.attachments);
    if (singleFiles.length === 0) {
      log.warn('Could not download any attachments from backup message.');
      lastRestoreSuccess = false;
      return false;
    }

    for (const file of singleFiles) {
      if (file.name === 'sync.json') {
        try {
          const incomingLinks = JSON.parse(file.buffer.toString('utf-8'));
          const currentLinks = getAllLinks();
          if (Array.isArray(incomingLinks) && incomingLinks.length === 0 && currentLinks.length > 0) {
            log.warn(`Skipping restore of empty sync.json because local store already has ${currentLinks.length} active links.`);
            continue;
          }
        } catch {
          log.warn('Corrupted sync.json in cloud backup payload, skipping.');
          continue;
        }
      }

      const destPath = path.join(dataDir, file.name);
      const tempPath = `${destPath}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(tempPath, file.buffer);
      fs.renameSync(tempPath, destPath);
      log.info(`Restored ${file.name} (${file.buffer.length} bytes) to ${destPath}`);
    }

    loadAfkStore();
    loadSyncStore();
    lastRestoreTime = Date.now();
    lastRestoreSuccess = true;

    log.info('Cloud backup restoration complete. Persistent state synchronized.');
    return true;
  } catch (error) {
    lastRestoreSuccess = false;
    log.error('Failed to restore from cloud backup:', error);
    return false;
  }
}

export function startCloudBackupScheduler(): void {
  if (schedulerStarted) return;
  if (!config.cloudBackupEnabled) return;

  schedulerStarted = true;

  const intervalMin = Math.max(1, config.cloudBackupIntervalMin || 60);
  const intervalMs = intervalMin * 60 * 1000;

  setInterval(async () => {
    try {
      await performCloudBackup('periodic');
    } catch (err) {
      log.error('Error in periodic cloud backup loop:', err);
    }
  }, intervalMs).unref();

  log.info(`Cloud backup scheduler initialized (Interval: ${intervalMin}m, Platform: ${config.cloudBackupPlatform})`);
}

export async function initCloudBackup(): Promise<void> {
  if (backupInitialized || !config.cloudBackupEnabled) return;

  const target = await resolveBackupChannel();
  if (!target) {
    return;
  }
  backupInitialized = true;

  if (config.cloudBackupAutoRestore) {
    try {
      log.info('Auto-restore enabled. Checking cloud channel for previous backup snapshots...');
      await restoreFromCloud();
    } catch (error) {
      log.error('Error restoring from cloud backup:', error);
    }
  }

  startCloudBackupScheduler();
}
