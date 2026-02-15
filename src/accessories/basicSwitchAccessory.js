'use strict';

const { bindOnGet, bindOnSet } = require('../hapBinding');

class BasicSwitchAccessory {
  constructor(api, log, accessory, options, coordinator) {
    this.api = api;
    this.log = log;
    this.accessory = accessory;
    this.options = options;
    this.coordinator = coordinator;
    this.state = false;
  }

  configure() {
    this.service = this.accessory.getService(this.api.hap.Service.Switch)
      || this.accessory.addService(this.api.hap.Service.Switch, this.options.name, 'basicSwitch');

    const cachedState = typeof this.accessory.context.state === 'boolean'
      ? this.accessory.context.state
      : undefined;

    this.state = cachedState !== undefined ? cachedState : this.options.defaultOn;
    this.accessory.context.state = this.state;

    const onCharacteristic = this.service.getCharacteristic(this.api.hap.Characteristic.On);
    bindOnGet(onCharacteristic, () => this.state);
    bindOnSet(onCharacteristic, (value) => this.setState(Boolean(value)));

    this.service.updateCharacteristic(this.api.hap.Characteristic.On, this.state);
  }

  setState(value) {
    return this.coordinator.run(this.accessory.UUID, async () => {
      this.state = value;
      this.accessory.context.state = value;
      this.service.updateCharacteristic(this.api.hap.Characteristic.On, value);
      this.log.debug('[Switch:%s] State set to %s', this.options.name, value);
    });
  }

  stop() {
    return undefined;
  }
}

module.exports = {
  BasicSwitchAccessory,
};
