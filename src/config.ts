import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { SERVER } from './constants.js';

export interface AppConfig {
  readonly discordToken: string | null;
  readonly fluxerToken: string | null;
  readonly fluxerApiUrl: string | null;
  readonly prefix: string;
  readonly discordServerId: string | null;
  readonly fluxerServerId: string | null;
  readonly ownerId: string;
  readonly rulesChannelId: string;
  readonly ticketChannelId: string;
}

function loadConfigFile(filename: string): Record<string, string> {
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

function parseConfig(): AppConfig {
  // Layered configuration hierarchy:
  // 1. .config.mark (Base configuration for non-secret IDs/prefix)
  // 2. .config.mark.local (Local developer overrides for non-secret settings)
  // 3. .env (Secret tokens: DISCORD_BOT_TOKEN, FLUXER_BOT_TOKEN)
  // 4. .env.local (Local secret overrides)
  // 5. process.env (System / container / cloud environment variables take highest priority)
  const baseConfig = loadConfigFile('.config.mark');
  const localConfig = loadConfigFile('.config.mark.local');
  const envConfig = loadConfigFile('.env');
  const envLocalConfig = loadConfigFile('.env.local');

  const mergedFiles = {
    ...baseConfig,
    ...localConfig,
    ...envConfig,
    ...envLocalConfig,
  };

  const getVal = (key: string): string | null => {
    const sysVal = process.env[key];
    if (sysVal !== undefined && sysVal.trim().length > 0) {
      return sysVal.trim();
    }
    const fileVal = mergedFiles[key];
    if (fileVal !== undefined && fileVal.trim().length > 0) {
      return fileVal.trim();
    }
    return null;
  };

  const discordToken = getVal('DISCORD_BOT_TOKEN') || getVal('BOT_TOKEN');
  const fluxerToken = getVal('FLUXER_BOT_TOKEN');
  const fluxerApiUrl = getVal('FLUXER_API_URL');
  const prefix = getVal('PREFIX') || '+';
  const discordServerId = getVal('DISCORD_SERVER_ID') || getVal('SERVER_ID');
  const fluxerServerId = getVal('FLUXER_SERVER_ID');
  const ownerId = getVal('OWNER_ID') || SERVER.ownerId;
  const rulesChannelId = getVal('RULES_CHANNEL_ID') || SERVER.rulesChannelId;
  const ticketChannelId = getVal('TICKET_CHANNEL_ID') || SERVER.ticketChannelId;

  return {
    discordToken,
    fluxerToken,
    fluxerApiUrl,
    prefix,
    discordServerId,
    fluxerServerId,
    ownerId,
    rulesChannelId,
    ticketChannelId,
  };
}

export const config = parseConfig();
