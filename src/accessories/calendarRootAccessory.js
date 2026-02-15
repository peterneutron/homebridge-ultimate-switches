'use strict';

const { bindOnGet, bindOnSet } = require('../hapBinding');

class CalendarRootAccessory {
  constructor(api, log, accessory, options, engine) {
    this.api = api;
    this.log = log;
    this.accessory = accessory;
    this.options = options;
    this.engine = engine;
    this.unsubscribe = null;
  }

  configure() {
    this.mainService = this.ensureService(this.api.hap.Service.ContactSensor, this.options.name, 'calendar-main');
    bindOnGet(
      this.mainService.getCharacteristic(this.api.hap.Characteristic.ContactSensorState),
      () => this.toContactState(this.engine.getRootState()),
    );

    if (this.options.updateButton) {
      this.updateSwitch = this.ensureService(this.api.hap.Service.Switch, `${this.options.name} Update`, 'calendar-update');
      bindOnGet(this.updateSwitch.getCharacteristic(this.api.hap.Characteristic.On), () => false);
      bindOnSet(this.updateSwitch.getCharacteristic(this.api.hap.Characteristic.On), async () => {
        await this.engine.refreshNow();
      });
    } else {
      this.removeServiceIfExists(this.api.hap.Service.Switch, 'calendar-update');
      this.updateSwitch = null;
    }

    this.removeLegacyChildServices();

    this.unsubscribe = this.engine.subscribeRoot((active) => {
      this.mainService.updateCharacteristic(
        this.api.hap.Characteristic.ContactSensorState,
        this.toContactState(active),
      );
    });
  }

  stop() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  ensureService(type, name, subtype) {
    const existing = this.accessory.getServiceById(type, subtype);
    if (existing) {
      existing.displayName = name;
      return existing;
    }
    return this.accessory.addService(type, name, subtype);
  }

  removeServiceIfExists(type, subtype) {
    const service = this.accessory.getServiceById(type, subtype);
    if (service) {
      this.accessory.removeService(service);
    }
  }

  removeLegacyChildServices() {
    this.accessory.services
      .filter((service) => typeof service.subtype === 'string')
      .filter((service) => (
        service.subtype.startsWith('calendar-event-')
        || service.subtype.startsWith('calendar-progress-')
        || service.subtype.startsWith('calendar-notification-')
      ))
      .forEach((service) => this.accessory.removeService(service));
  }

  toContactState(active) {
    return active
      ? this.api.hap.Characteristic.ContactSensorState.CONTACT_DETECTED
      : this.api.hap.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
  }
}

module.exports = {
  CalendarRootAccessory,
};
