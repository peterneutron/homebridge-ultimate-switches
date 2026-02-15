'use strict';

const { bindOnGet } = require('../hapBinding');

class CalendarNotificationAccessory {
  constructor(api, _log, accessory, options, engine) {
    this.api = api;
    this.accessory = accessory;
    this.options = options;
    this.engine = engine;
    this.unsubscribe = null;
  }

  configure() {
    this.mainService = this.ensureService(
      this.api.hap.Service.ContactSensor,
      this.options.name,
      'calendar-notification-main',
    );

    bindOnGet(
      this.mainService.getCharacteristic(this.api.hap.Characteristic.ContactSensorState),
      () => this.toContactState(this.engine.getNotificationState(this.options.notificationKey)),
    );

    this.unsubscribe = this.engine.subscribeNotification(this.options.notificationKey, (active) => {
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

  toContactState(active) {
    return active
      ? this.api.hap.Characteristic.ContactSensorState.CONTACT_DETECTED
      : this.api.hap.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
  }
}

module.exports = {
  CalendarNotificationAccessory,
};
