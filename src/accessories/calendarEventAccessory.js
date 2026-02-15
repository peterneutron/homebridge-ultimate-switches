'use strict';

const { bindOnGet } = require('../hapBinding');

class CalendarEventAccessory {
  constructor(api, _log, accessory, options, engine) {
    this.api = api;
    this.accessory = accessory;
    this.options = options;
    this.engine = engine;
    this.unsubscribe = null;
  }

  configure() {
    this.eventService = this.ensureService(this.api.hap.Service.ContactSensor, this.options.name, 'calendar-event-main');
    this.progressService = this.ensureService(
      this.api.hap.Service.LightSensor,
      `${this.options.name} Progress`,
      'calendar-event-progress',
    );

    bindOnGet(
      this.eventService.getCharacteristic(this.api.hap.Characteristic.ContactSensorState),
      () => this.toContactState(this.engine.getEventState(this.options.eventKey).active),
    );
    bindOnGet(
      this.progressService.getCharacteristic(this.api.hap.Characteristic.CurrentAmbientLightLevel),
      () => this.engine.getEventState(this.options.eventKey).progress,
    );

    this.unsubscribe = this.engine.subscribeEvent(this.options.eventKey, (state) => {
      this.eventService.updateCharacteristic(
        this.api.hap.Characteristic.ContactSensorState,
        this.toContactState(state.active),
      );
      this.progressService.updateCharacteristic(
        this.api.hap.Characteristic.CurrentAmbientLightLevel,
        state.progress,
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
  CalendarEventAccessory,
};
