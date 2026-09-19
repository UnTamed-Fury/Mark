import { Client, Events } from '@fluxerjs/core';
import { config } from '../../config.js';
import { createLogger } from '../../core/logger.js';
import { registerFluxerGatewayEvents } from './events/gateway.js';
import { handleFluxerMessageCreate } from './events/messageCreate.js';
import { handleFluxerReady } from './events/ready.js';

const log = createLogger('FluxerClient');

export async function createFluxerClient(): Promise<Client> {
  let client: Client;

  if (config.fluxerApiUrl) {
    log.info(`Initializing Fluxer client via discovery from ${config.fluxerApiUrl}`);
    client = await Client.fromDiscovery(config.fluxerApiUrl);
  } else {
    client = new Client({
      ignoredEvents: ['PRESENCE_UPDATE', 'TYPING_START'],
      cache: {
        guilds: 100,
        channels: 2000,
        messages: 50,
        members: 5000,
      },
    });
  }

  registerFluxerGatewayEvents(client);

  client.once(Events.Ready, () => {
    handleFluxerReady(client);
  });

  client.on(Events.MessageCreate, async (message) => {
    try {
      await handleFluxerMessageCreate(message);
    } catch (error) {
      log.error('Unhandled error in Fluxer messageCreate listener:', error);
    }
  });

  return client;
}
