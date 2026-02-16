'use strict';

const { bindOnGet, bindOnSet } = require('../hapBinding');
const { formatBoolState, logTransition } = require('../logger');

class LockAccessory {
  constructor(api, log, accessory, options, coordinator) {
    this.api = api;
    this.log = log;
    this.accessory = accessory;
    this.options = options;
    this.coordinator = coordinator;

    this.targetState = this.defaultTargetState();
    this.currentState = this.defaultCurrentState(this.targetState);
  }

  defaultTargetState() {
    const target = this.api.hap.Characteristic.LockTargetState;
    if (this.options.defaultState === 'locked') {
      return target.SECURED;
    }
    return target.UNSECURED;
  }

  defaultCurrentState(targetState) {
    const current = this.api.hap.Characteristic.LockCurrentState;
    return targetState === this.api.hap.Characteristic.LockTargetState.SECURED
      ? current.SECURED
      : current.UNSECURED;
  }

  configure() {
    this.service = this.accessory.getServiceById(this.api.hap.Service.LockMechanism, 'virtualLock')
      || this.accessory.addService(this.api.hap.Service.LockMechanism, this.options.name, 'virtualLock');
    this.syncServiceName(this.service, this.options.name);

    const cachedTarget = this.accessory.context.lockTargetState;
    if (typeof cachedTarget === 'number') {
      this.targetState = cachedTarget;
      this.currentState = this.defaultCurrentState(cachedTarget);
    }

    const targetCharacteristic = this.service.getCharacteristic(this.api.hap.Characteristic.LockTargetState);
    bindOnGet(targetCharacteristic, () => this.targetState);
    bindOnSet(targetCharacteristic, (value) => this.setTargetState(Number(value)));

    const currentCharacteristic = this.service.getCharacteristic(this.api.hap.Characteristic.LockCurrentState);
    bindOnGet(currentCharacteristic, () => this.currentState);

    this.publishState();
  }

  async setTargetState(value) {
    await this.coordinator.run(this.accessory.UUID, async () => {
      const previous = this.targetState === this.api.hap.Characteristic.LockTargetState.SECURED;
      this.targetState = value;
      this.currentState = this.defaultCurrentState(value);
      this.accessory.context.lockTargetState = this.targetState;
      this.publishState();
      logTransition(
        this.log,
        'Lock',
        this.options.name,
        formatBoolState('lock', previous),
        formatBoolState('lock', value === this.api.hap.Characteristic.LockTargetState.SECURED),
        'manual',
      );
      this.log.debug('[Lock:%s] Target state set to %s', this.options.name, value);
    });
  }

  publishState() {
    this.service.updateCharacteristic(this.api.hap.Characteristic.LockTargetState, this.targetState);
    this.service.updateCharacteristic(this.api.hap.Characteristic.LockCurrentState, this.currentState);
  }

  stop() {
    return undefined;
  }

  syncServiceName(service, name) {
    if (!service || typeof name !== 'string' || name.trim() === '') {
      return;
    }
    service.displayName = name;
    if (typeof service.setCharacteristic === 'function') {
      try {
        service.setCharacteristic(this.api.hap.Characteristic.Name, name);
      } catch (_error) {
        // Optional characteristic; ignore.
      }
    }
  }
}

module.exports = {
  LockAccessory,
};
