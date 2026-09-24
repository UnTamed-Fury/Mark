import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import YAML from 'yaml';
import { ensureDataDirSetup, getDataDir } from './core/dataDir.js';
import { BRAND, SISTER_SITES, SERVER } from './constants.js';

export interface AppConfig {
  readonly discordToken: string | null;
  readonly fluxerToken: string | null;
  readonly prefix: string;

  readonly ownerId: string;

  // Server Guild IDs
  readonly discordServerId: string | null;
  readonly fluxerServerId: string | null;
  readonly testServerId: string | null;
  readonly logServerId: string | null;
  readonly fluxerApiUrl: string | null;

  // Channel IDs
  readonly rulesChannelId: string;
  readonly ticketChannelId: string;
  readonly logChannelId: string | null;
  readonly afkLogChannelId: string | null;
  readonly syncLogChannelId: string | null;

  // Timers & Intervals (seconds / minutes)
  readonly logFlushIntervalSec: number;
  readonly afkSummaryIntervalSec: number;
  readonly syncSummaryIntervalSec: number;
  readonly afkCleanupIntervalMin: number;
  readonly afkMentionCooldownSec: number;
  readonly syncCodeExpirySec: number;

  // Cooldowns & Rate Limits (seconds)
  readonly sameChannelCooldownSec: number;
  readonly crossChannelCooldownSec: number;

  // Brand & URLs
  readonly brandName: string;
  readonly websiteUrl: string;
  readonly downloadsUrl: string;
  readonly scheduleUrl: string;
  readonly embedColor: number;

  // Sister Sites
  readonly kissasianUrl: string;
  readonly nineAnimeUrl: string;

  // Cloud Backup & Disaster Recovery
  readonly cloudBackupEnabled: boolean;
  readonly cloudBackupPlatform: 'discord' | 'fluxer';
  readonly cloudBackupServerId: string | null;
  readonly cloudBackupChannelId: string | null;
  readonly cloudBackupIntervalMin: number;
  readonly cloudBackupAutoRestore: boolean;
  readonly cloudBackupMaxPartSizeMb: number;
}

function loadEnvFile(filename: string): Record<string, string> {
  try {
    const fullPath = path.resolve(process.cwd(), filename);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      return dotenv.parse(content);
    }
  } catch {
    // Ignore read errors
  }
  return {};
}

function loadYamlFile(filePath: string): Record<string, any> {
  try {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const parsed = YAML.parse(content);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch {
    // Ignore read/parse errors
  }
  return {};
}

function parseYamlString(content: string | undefined): Record<string, any> {
  if (!content || !content.trim()) return {};
  try {
    const parsed = YAML.parse(content);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Ignore parse errors
  }
  return {};
}

function parseNumber(value: string | null | undefined, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(value: string | null | undefined, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return fallback;
}

function parseColor(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback;
  const clean = value.replace('#', '').trim();
  const parsed = parseInt(clean, 16);
  return Number.isNaN(parsed) ? fallback : parsed;
}

const SECTION_ALIASES: Record<string, string[]> = {
  cloud_backup: ['cloud-uploads', 'cloud_uploads', 'cloud-backup'],
};

function parseConfig(): AppConfig {
  // Layered config hierarchy with priority for local testing:
  // 1. .env.local & .config.mark.local (Local developer overrides have top priority for test bot)
  // 2. /data/.config.mark (Railway persistent volume override if mounted)
  // 3. MARK_CONFIG / CONFIG_MARK (Raw YAML string passed via Railway environment variable)
  // 4. process.env (Railway / container environment variables)
  // 5. .env & .config.mark (Repository base defaults)

  // Initialize data dir and ensure .config.mark stays in /data
  const activeDataDir = ensureDataDirSetup();

  const envLocalConfig = loadEnvFile('.env.local');
  const localYaml = loadYamlFile('.config.mark.local');

  const volumeYaml = loadYamlFile(path.join(activeDataDir, '.config.mark'));
  const rawEnvYaml = parseYamlString(process.env.MARK_CONFIG || process.env.CONFIG_MARK);

  const envConfig = loadEnvFile('.env');
  const baseYaml = loadYamlFile('.config.mark');
  const exampleYaml = loadYamlFile('.config.mark.example');

  // Helper to extract value with cascading precedence
  const getVal = (
    envKey: string,
    yamlSection?:
      | 'servers'
      | 'channels'
      | 'timers'
      | 'cooldowns'
      | 'brand'
      | 'sister_sites'
      | 'cloud_backup',
    yamlKey?: string,
  ): string | null => {
    const checkYamlObj = (obj: Record<string, any>): string | null => {
      if (yamlSection && yamlKey) {
        // Direct section check
        if (obj[yamlSection] && typeof obj[yamlSection] === 'object') {
          const val = obj[yamlSection][yamlKey];
          if (val !== undefined && val !== null && String(val).trim().length > 0) {
            return String(val).trim();
          }
        }
        // Alias section checks (e.g. cloud-uploads, cloud_uploads)
        if (yamlSection === 'cloud_backup') {
          const aliases = ['cloud-uploads', 'cloud_uploads', 'cloud-backup'];
          for (const alias of aliases) {
            if (obj[alias] && typeof obj[alias] === 'object') {
              const val = obj[alias][yamlKey];
              if (val !== undefined && val !== null && String(val).trim().length > 0) {
                return String(val).trim();
              }
            }
          }
        }
      }
      // Top-level fallback in YAML
      const topKey = yamlKey || envKey.toLowerCase();
      const topVal = obj[topKey];
      if (topVal !== undefined && topVal !== null && String(topVal).trim().length > 0) {
        return String(topVal).trim();
      }
      return null;
    };

    // 1. Check local developer overrides (.env.local & .config.mark.local)
    const envLocalVal = envLocalConfig[envKey];
    if (envLocalVal !== undefined && envLocalVal.trim().length > 0) {
      return envLocalVal.trim();
    }
    const fromLocalYaml = checkYamlObj(localYaml);
    if (fromLocalYaml) return fromLocalYaml;

    // 2. Check Railway persistent volume (/data/.config.mark)
    const fromVolumeYaml = checkYamlObj(volumeYaml);
    if (fromVolumeYaml) return fromVolumeYaml;

    // 3. Check raw YAML environment variable (MARK_CONFIG in Railway dashboard)
    const fromRawEnvYaml = checkYamlObj(rawEnvYaml);
    if (fromRawEnvYaml) return fromRawEnvYaml;

    // 4. Check system process.env
    const sysVal = process.env[envKey];
    if (sysVal !== undefined && sysVal.trim().length > 0) {
      return sysVal.trim();
    }

    // 5. Check base repository files (.env & .config.mark / .config.mark.example)
    const envVal = envConfig[envKey];
    if (envVal !== undefined && envVal.trim().length > 0) {
      return envVal.trim();
    }
    const fromBaseYaml = checkYamlObj(baseYaml);
    if (fromBaseYaml) return fromBaseYaml;

    const fromExampleYaml = checkYamlObj(exampleYaml);
    if (fromExampleYaml) return fromExampleYaml;

    return null;
  };

  const discordToken = getVal('DISCORD_BOT_TOKEN') || getVal('BOT_TOKEN');
  const fluxerToken = getVal('FLUXER_BOT_TOKEN');
  const prefix = getVal('PREFIX') || '+';

  const ownerId = getVal('OWNER_ID', undefined, 'owner_id') || SERVER.ownerId;

  // Servers
  const discordServerId = getVal('DISCORD_SERVER_ID', 'servers', 'discord_server_id') || SERVER.discordGuildId;
  const fluxerServerId = getVal('FLUXER_SERVER_ID', 'servers', 'fluxer_server_id') || SERVER.fluxerGuildId;
  const testServerId = getVal('TEST_SERVER_ID', 'servers', 'test_server_id');
  const logServerId = getVal('LOG_SERVER_ID', 'servers', 'log_server_id');
  const fluxerApiUrl = getVal('FLUXER_API_URL', 'servers', 'fluxer_api_url');

  // Channels
  const rulesChannelId = getVal('RULES_CHANNEL_ID', 'channels', 'rules_channel_id') || SERVER.rulesChannelId;
  const ticketChannelId = getVal('TICKET_CHANNEL_ID', 'channels', 'ticket_channel_id') || SERVER.ticketChannelId;
  const logChannelId = getVal('LOG_CHANNEL_ID', 'channels', 'log_channel_id');
  const afkLogChannelId = getVal('AFK_LOG_CHANNEL_ID', 'channels', 'afk_log_channel_id');
  const syncLogChannelId = getVal('SYNC_LOG_CHANNEL_ID', 'channels', 'sync_log_channel_id');

  // Timers
  const logFlushIntervalSec = parseNumber(getVal('LOG_FLUSH_INTERVAL_SEC', 'timers', 'log_flush_interval_sec'), 60);
  const afkSummaryIntervalSec = parseNumber(getVal('AFK_SUMMARY_INTERVAL_SEC', 'timers', 'afk_summary_interval_sec'), 300);
  const syncSummaryIntervalSec = parseNumber(getVal('SYNC_SUMMARY_INTERVAL_SEC', 'timers', 'sync_summary_interval_sec'), 300);
  const afkCleanupIntervalMin = parseNumber(getVal('AFK_CLEANUP_INTERVAL_MIN', 'timers', 'afk_cleanup_interval_min'), 30);
  const afkMentionCooldownSec = parseNumber(getVal('AFK_MENTION_COOLDOWN_SEC', 'timers', 'afk_mention_cooldown_sec'), 10);
  const syncCodeExpirySec = parseNumber(getVal('SYNC_CODE_EXPIRY_SEC', 'timers', 'sync_code_expiry_sec'), 30);

  // Cooldowns
  const sameChannelCooldownSec = parseNumber(getVal('SAME_CHANNEL_COOLDOWN_SEC', 'cooldowns', 'same_channel_cooldown_sec'), 15);
  const crossChannelCooldownSec = parseNumber(getVal('CROSS_CHANNEL_COOLDOWN_SEC', 'cooldowns', 'cross_channel_cooldown_sec'), 5);

  // Brand
  const brandName = getVal('BRAND_NAME', 'brand', 'name') || BRAND.name;
  const websiteUrl = getVal('WEBSITE_URL', 'brand', 'website_url') || BRAND.website;
  const downloadsUrl = getVal('DOWNLOADS_URL', 'brand', 'downloads_url') || BRAND.downloads;
  const scheduleUrl = getVal('SCHEDULE_URL', 'brand', 'schedule_url') || BRAND.schedule;
  const embedColor = parseColor(getVal('EMBED_COLOR', 'brand', 'embed_color'), BRAND.color);

  // Sister sites
  const kissasianUrl = getVal('KISSASIAN_URL', 'sister_sites', 'kissasian_url') || SISTER_SITES.kissasian.url;
  const nineAnimeUrl = getVal('NINE_ANIME_URL', 'sister_sites', 'nine_anime_url') || SISTER_SITES.nineAnime.url;

  // Cloud Backup & Disaster Recovery
  const cloudBackupEnabled = parseBoolean(
    getVal('CLOUD_BACKUP_ENABLED', 'cloud_backup', 'enabled') ||
    getVal('CLOUD_BACKUP_ENABLED', 'cloud_backup', 'enable'),
    false
  );

  const rawPlatform = getVal('CLOUD_BACKUP_PLATFORM', 'cloud_backup', 'platform')?.toLowerCase();
  const cloudBackupPlatform: 'discord' | 'fluxer' = rawPlatform === 'fluxer' ? 'fluxer' : 'discord';

  const cloudBackupServerId =
    getVal('CLOUD_BACKUP_SERVER_ID', 'cloud_backup', 'server_id') ||
    getVal('CLOUD_BACKUP_SERVER_ID', 'cloud_backup', 'server-id') ||
    getVal('CLOUD_BACKUP_SERVER_ID', 'cloud_backup', 'discord_server_id') ||
    getVal('CLOUD_BACKUP_SERVER_ID', 'cloud_backup', 'discord-server-id');

  const cloudBackupChannelId =
    getVal('CLOUD_BACKUP_CHANNEL_ID', 'cloud_backup', 'channel_id') ||
    getVal('CLOUD_BACKUP_CHANNEL_ID', 'cloud_backup', 'channel-id') ||
    getVal('CLOUD_BACKUP_CHANNEL_ID', 'cloud_backup', 'discord_channel_id') ||
    getVal('CLOUD_BACKUP_CHANNEL_ID', 'cloud_backup', 'discord-channel-id');

  const cloudBackupIntervalMin = parseNumber(
    getVal('CLOUD_BACKUP_INTERVAL_MIN', 'cloud_backup', 'backup_interval_min') ||
    getVal('CLOUD_BACKUP_INTERVAL_MIN', 'cloud_backup', 'backup-interval-min'),
    60
  );

  const cloudBackupAutoRestore = parseBoolean(
    getVal('CLOUD_BACKUP_AUTO_RESTORE', 'cloud_backup', 'auto_restore_on_boot') ||
    getVal('CLOUD_BACKUP_AUTO_RESTORE', 'cloud_backup', 'auto-restore-on-boot'),
    true
  );

  const cloudBackupMaxPartSizeMb = parseNumber(
    getVal('CLOUD_BACKUP_MAX_PART_SIZE_MB', 'cloud_backup', 'max_part_size_mb') ||
    getVal('CLOUD_BACKUP_MAX_PART_SIZE_MB', 'cloud_backup', 'max-part-size-mb'),
    8
  );

  return {
    discordToken,
    fluxerToken,
    prefix,
    ownerId,
    discordServerId,
    fluxerServerId,
    testServerId,
    logServerId,
    fluxerApiUrl,
    rulesChannelId,
    ticketChannelId,
    logChannelId,
    afkLogChannelId,
    syncLogChannelId,
    logFlushIntervalSec,
    afkSummaryIntervalSec,
    syncSummaryIntervalSec,
    afkCleanupIntervalMin,
    afkMentionCooldownSec,
    syncCodeExpirySec,
    sameChannelCooldownSec,
    crossChannelCooldownSec,
    brandName,
    websiteUrl,
    downloadsUrl,
    scheduleUrl,
    embedColor,
    kissasianUrl,
    nineAnimeUrl,
    cloudBackupEnabled,
    cloudBackupPlatform,
    cloudBackupServerId,
    cloudBackupChannelId,
    cloudBackupIntervalMin,
    cloudBackupAutoRestore,
    cloudBackupMaxPartSizeMb,
  };
}

export const config = parseConfig();
