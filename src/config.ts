import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import YAML from 'yaml';
import { SERVER } from './constants.js';

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

function parseConfig(): AppConfig {
  // Layered config hierarchy:
  // 1. .config.mark (YAML base in repository)
  // 2. /data/.config.mark (Railway persistent volume override if mounted)
  // 3. .config.mark.local (Local developer YAML override)
  // 4. .env (Secret tokens and PREFIX)
  // 5. .env.local (Local secret overrides)
  // 6. process.env (System / container env variables take highest precedence)

  const baseYaml = loadYamlFile('.config.mark');
  const volumeYaml = loadYamlFile('/data/.config.mark');
  const localYaml = loadYamlFile('.config.mark.local');

  const envConfig = loadEnvFile('.env');
  const envLocalConfig = loadEnvFile('.env.local');

  // Helper to extract value with cascading precedence
  const getVal = (
    envKey: string,
    yamlSection?: 'servers' | 'channels',
    yamlKey?: string,
  ): string | null => {
    // 1. Check system process.env
    const sysVal = process.env[envKey];
    if (sysVal !== undefined && sysVal.trim().length > 0) {
      return sysVal.trim();
    }

    // 2. Check .env.local
    const envLocalVal = envLocalConfig[envKey];
    if (envLocalVal !== undefined && envLocalVal.trim().length > 0) {
      return envLocalVal.trim();
    }

    // 3. Check .env
    const envVal = envConfig[envKey];
    if (envVal !== undefined && envVal.trim().length > 0) {
      return envVal.trim();
    }

    // 4. Check YAML sources (localYaml -> volumeYaml -> baseYaml)
    const checkYamlObj = (obj: Record<string, any>): string | null => {
      if (yamlSection && yamlKey && obj[yamlSection] && typeof obj[yamlSection] === 'object') {
        const val = obj[yamlSection][yamlKey];
        if (val !== undefined && val !== null && String(val).trim().length > 0) {
          return String(val).trim();
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

    const fromLocalYaml = checkYamlObj(localYaml);
    if (fromLocalYaml) return fromLocalYaml;

    const fromVolumeYaml = checkYamlObj(volumeYaml);
    if (fromVolumeYaml) return fromVolumeYaml;

    const fromBaseYaml = checkYamlObj(baseYaml);
    if (fromBaseYaml) return fromBaseYaml;

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
  };
}

export const config = parseConfig();
