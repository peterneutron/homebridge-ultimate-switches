'use strict';

const { normalizeConfig, ValidationError } = require('./config');
const { AccessoryRegistry } = require('./registry');

class UltimateSwitchesPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.api = api;
    this.cachedAccessories = new Map();

    try {
      this.config = normalizeConfig(config);
    } catch (error) {
      if (error instanceof ValidationError) {
        this.log.error('[Config] Invalid configuration: %s', error.message);
      } else {
        this.log.error('[Config] Unexpected configuration error: %s', error.message);
      }
      throw error;
    }

    this.registry = new AccessoryRegistry(log);

    if (this.api) {
      this.api.on('didFinishLaunching', () => {
        this.log.info('[Init] Finished launching; preparing accessory registry');
        this.registry.load(this.config);
        const stats = this.registry.stats();
        this.log.info('[Init] Planned accessories: %d (%j)', stats.total, stats.byKind);
      });
    }
  }

  configureAccessory(accessory) {
    this.cachedAccessories.set(accessory.UUID, accessory);
    this.log.debug('[Cache] Restored accessory: %s', accessory.displayName);
  }
}

module.exports = {
  UltimateSwitchesPlatform,
};
