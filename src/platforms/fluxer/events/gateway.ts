import type { Client } from '@fluxerjs/core';
import { createLogger } from '../../../core/logger.js';

const log = createLogger('FluxerGateway');

export function registerFluxerGatewayEvents(client: Client): void {
  client.on('error', (error) => {
    log.error('Fluxer client encountered an error:', error);
  });

  client.on('warn', (warning) => {
    log.warn('Fluxer client warning:', warning);
  });
}
