import fs from 'node:fs';
import path from 'node:path';
import { AttachmentBuilder as DiscordAttachmentBuilder, type TextBasedChannel as DiscordTextChannel } from 'discord.js';
import { AttachmentBuilder as FluxerAttachmentBuilder, type TextChannel as FluxerTextChannel } from '@fluxerjs/core';
import { config } from '../config.js';
import { createLogger } from './logger.js';
import { loadAfkStore } from './afkManager.js';
import { loadSyncStore } from './syncManager.js';
import {
  getDataDir,
  getAfkFilePath,
  getSyncFilePath,
  getConfigMarkFilePath,
} from './dataDir.js';
import { getDiscordClient } from '../platforms/discord/client.js';
import { getFluxerClient } from '../platforms/fluxer/client.js';

const log = createLogger('CloudBackup');

const BACKUP_HEADER_TAG = '[AnimeX Cloud Backup] v1';

let schedulerStarted = false;
let backupInitialized = false;

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

export async function performCloudBackup(reason = 'scheduled'): Promise<boolean> {
  if (!config.cloudBackupEnabled) return false;

  const target = await resolveBackupChannel();
  if (!target) {
    log.warn('Cloud backup enabled but backup channel could not be accessed. Skipping backup.');
    return false;
  }

  try {
    const dataDir = getDataDir();
    const filesToBackup = [
      { localPath: getAfkFilePath(), fileName: 'afk.json' },
      { localPath: getSyncFilePath(), fileName: 'sync.json' },
      { localPath: getConfigMarkFilePath(), fileName: '.config.mark' },
    ];

    const maxPartBytes = Math.max(1, config.cloudBackupMaxPartSizeMb || 8) * 1024 * 1024;
    const payloads: BackupFilePayload[] = [];
    const archivedNames: string[] = [];

    for (const item of filesToBackup) {
      if (fs.existsSync(item.localPath)) {
        const fileBuffer = fs.readFileSync(item.localPath);
        if (fileBuffer.length > maxPartBytes) {
          const chunks = chunkBuffer(fileBuffer, maxPartBytes);
          for (let i = 0; i < chunks.length; i++) {
            payloads.push({
              name: `${item.fileName}.part${i + 1}`,
              buffer: chunks[i]!,
            });
          }
          archivedNames.push(`${item.fileName} (${chunks.length} parts)`);
        } else {
          payloads.push({ name: item.fileName, buffer: fileBuffer });
          archivedNames.push(item.fileName);
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
      `• **Archived Files**: ${archivedNames.join(', ')}`;

    await target.sendBackup(content, payloads);
    log.info(`Cloud backup dispatched to ${target.platform} (Reason: ${reason}, Files: ${archivedNames.join(', ')})`);
    return true;
  } catch (error) {
    log.error('Failed to dispatch cloud backup:', error);
    return false;
  }
}

export async function restoreFromCloud(): Promise<boolean> {
  if (!config.cloudBackupEnabled || !config.cloudBackupAutoRestore) return false;

  const target = await resolveBackupChannel();
  if (!target) {
    log.warn('Cloud restore requested but backup channel could not be accessed. Skipping.');
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
      return false;
    }

    for (const file of singleFiles) {
      const destPath = path.join(dataDir, file.name);
      const tempPath = `${destPath}.tmp`;
      fs.writeFileSync(tempPath, file.buffer);
      fs.renameSync(tempPath, destPath);
      log.info(`Restored ${file.name} (${file.buffer.length} bytes) to ${destPath}`);
    }

    loadAfkStore();
    loadSyncStore();
    log.info('Cloud backup restoration complete. Persistent state synchronized.');
    return true;
  } catch (error) {
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
