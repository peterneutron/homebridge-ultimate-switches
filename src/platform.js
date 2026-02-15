'use strict';

const { normalizeConfig, ValidationError } = require('./config');
const { AccessoryRegistry } = require('./registry');
const { OperationCoordinator } = require('./execution');
const { BasicSwitchAccessory } = require('./accessories/basicSwitchAccessory');
const { CalendarTriggerAccessory } = require('./accessories/calendarTriggerAccessory');
const { CommandSwitchAccessory } = require('./accessories/commandSwitchAccessory');
const { ContextSensorAccessory } = require('./accessories/contextSensorAccessory');
const { LockAccessory } = require('./accessories/lockAccessory');
const { SecuritySystemAccessory } = require('./accessories/securitySystemAccessory');
const { TimerSwitchAccessory } = require('./accessories/timerSwitchAccessory');
const { PLATFORM_NAME, PLUGIN_NAME } = require('./settings');

const SUPPORTED_KINDS = new Set(['commandSwitch', 'switch', 'timer', 'lock', 'security', 'calendar', 'contextSensor']);

class UltimateSwitchesPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.api = api;
    this.cachedAccessories = new Map();
    this.liveAccessories = new Map();
    this.operationCoordinator = new OperationCoordinator();

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
        this.log.info('[Init] Finished launching; preparing accessories');
        this.initializeAccessories();
      });

      this.api.on('shutdown', () => {
        this.liveAccessories.forEach((instance) => instance.stop?.());
      });
    }
  }

  configureAccessory(accessory) {
    this.cachedAccessories.set(accessory.UUID, accessory);
    this.log.debug('[Cache] Restored accessory: %s', accessory.displayName);
  }

  initializeAccessories() {
    this.registry.load(this.config);
    const stats = this.registry.stats();
    this.log.info('[Init] Planned accessory descriptors: %d (%j)', stats.total, stats.byKind);

    const activeUUIDs = new Set();

    this.registry.descriptors.forEach((descriptor) => {
      if (!SUPPORTED_KINDS.has(descriptor.kind)) {
        this.log.debug('[Init] Deferred descriptor kind not implemented yet: %s (%s)', descriptor.kind, descriptor.name);
        return;
      }

      const uuid = this.api.hap.uuid.generate(`${PLATFORM_NAME}:${descriptor.key}`);
      activeUUIDs.add(uuid);

      const category = this.resolveCategory(descriptor.kind);

      let accessory = this.cachedAccessories.get(uuid);
      if (!accessory) {
        accessory = new this.api.platformAccessory(descriptor.name, uuid, category);
        accessory.context.key = descriptor.key;
        accessory.context.kind = descriptor.kind;
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.log.info('[Init] Registered accessory: %s (%s)', descriptor.name, descriptor.kind);
      } else {
        accessory.displayName = descriptor.name;
        accessory.context.key = descriptor.key;
        accessory.context.kind = descriptor.kind;
        this.api.updatePlatformAccessories([accessory]);
        this.cachedAccessories.delete(uuid);
        this.log.debug('[Init] Reused cached accessory: %s (%s)', descriptor.name, descriptor.kind);
      }

      const instance = this.createAccessoryInstance(descriptor, accessory);
      if (!instance) {
        return;
      }

      instance.configure();
      this.liveAccessories.set(uuid, instance);
    });

    const stale = Array.from(this.cachedAccessories.values())
      .filter((accessory) => !activeUUIDs.has(accessory.UUID));

    if (stale.length) {
      this.log.info('[Init] Removing %d stale accessories', stale.length);
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, stale);
      stale.forEach((accessory) => {
        this.cachedAccessories.delete(accessory.UUID);
      });
    }
  }

  createAccessoryInstance(descriptor, accessory) {
    if (descriptor.kind === 'commandSwitch') {
      return new CommandSwitchAccessory(this.api, this.log, accessory, descriptor.config, this.operationCoordinator);
    }

    if (descriptor.kind === 'switch') {
      return new BasicSwitchAccessory(this.api, this.log, accessory, descriptor.config, this.operationCoordinator);
    }

    if (descriptor.kind === 'timer') {
      return new TimerSwitchAccessory(this.api, this.log, accessory, descriptor.config, this.operationCoordinator);
    }

    if (descriptor.kind === 'contextSensor') {
      return new ContextSensorAccessory(this.api, this.log, accessory, descriptor.config);
    }

    if (descriptor.kind === 'lock') {
      return new LockAccessory(this.api, this.log, accessory, descriptor.config, this.operationCoordinator);
    }

    if (descriptor.kind === 'security') {
      return new SecuritySystemAccessory(this.api, this.log, accessory, descriptor.config, this.operationCoordinator);
    }

    if (descriptor.kind === 'calendar') {
      return new CalendarTriggerAccessory(this.api, this.log, accessory, descriptor.config, this.operationCoordinator);
    }

    return null;
  }

  resolveCategory(kind) {
    if (kind === 'contextSensor') {
      return this.api.hap.Accessory.Categories.SENSOR;
    }

    if (kind === 'lock') {
      return this.api.hap.Accessory.Categories.DOOR_LOCK;
    }

    if (kind === 'security') {
      return this.api.hap.Accessory.Categories.SECURITY_SYSTEM;
    }

    return this.api.hap.Accessory.Categories.SWITCH;
  }
}

module.exports = {
  UltimateSwitchesPlatform,
};
