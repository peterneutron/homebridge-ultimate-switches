'use strict';

const { bindOnGet } = require('../hapBinding');
const { computeContextValues } = require('../contextValues');
const { registerContextCharacteristics } = require('./contextCharacteristics');

class ContextSensorAccessory {
  constructor(api, log, accessory, options) {
    this.api = api;
    this.log = log;
    this.accessory = accessory;
    this.options = options;
    this.currentValues = null;
    this.timer = null;
  }

  configure() {
    const custom = registerContextCharacteristics(this.api.hap);

    this.service = this.accessory.getService(this.api.hap.Service.MotionSensor)
      || this.accessory.addService(this.api.hap.Service.MotionSensor, this.options.name, 'contextSensor');

    this.service.updateCharacteristic(this.api.hap.Characteristic.MotionDetected, false);

    this.bindCharacteristic(custom.MonthOfYear, 'monthOfYear');
    this.bindCharacteristic(custom.WeekOfYear, 'weekOfYear');
    this.bindCharacteristic(custom.Season, 'season');
    this.bindCharacteristic(custom.SeasonName, 'seasonName');
    this.bindCharacteristic(custom.TimeOfDay, 'timeOfDay');
    this.bindCharacteristic(custom.TimeOfDayName, 'timeOfDayName');

    this.refreshNow();
    this.timer = setInterval(() => this.refreshNow(), this.options.refreshIntervalSeconds * 1000);
  }

  bindCharacteristic(characteristicType, key) {
    const characteristic = this.service.getCharacteristic(characteristicType);
    bindOnGet(characteristic, () => {
      if (!this.currentValues) {
        this.currentValues = this.computeValues();
      }
      return this.currentValues[key];
    });
  }

  computeValues() {
    return computeContextValues(new Date(), this.options.latitude);
  }

  refreshNow() {
    const next = this.computeValues();

    if (this.currentValues && JSON.stringify(this.currentValues) === JSON.stringify(next)) {
      return;
    }

    this.currentValues = next;

    this.updateValue('monthOfYear', this.api.hap.Characteristic.MonthOfYear);
    this.updateValue('weekOfYear', this.api.hap.Characteristic.WeekOfYear);
    this.updateValue('season', this.api.hap.Characteristic.Season);
    this.updateValue('seasonName', this.api.hap.Characteristic.SeasonName);
    this.updateValue('timeOfDay', this.api.hap.Characteristic.TimeOfDay);
    this.updateValue('timeOfDayName', this.api.hap.Characteristic.TimeOfDayName);

    this.log.debug('[Context] Updated values: %j', this.currentValues);
  }

  updateValue(key, characteristicType) {
    this.service.updateCharacteristic(characteristicType, this.currentValues[key]);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

module.exports = {
  ContextSensorAccessory,
};
