'use strict';

const MANUFACTURER = 'Ultimate Switches';

const MODEL_BY_KIND = {
  commandSwitch: 'Command Switch',
  switch: 'Basic Switch',
  timer: 'Timer Switch',
  heartbeat: 'Heartbeat Trigger',
  lock: 'Virtual Lock',
  security: 'Security System',
  calendarRoot: 'Calendar Trigger',
  calendarEvent: 'Calendar Event',
  calendarNotification: 'Calendar Notification',
  contextSensor: 'Context Sensor',
};

function modelForKind(kind) {
  return MODEL_BY_KIND[kind] || 'Accessory';
}

function serialFromUuid(uuid) {
  return `US-${String(uuid || '').replace(/-/g, '').toUpperCase()}`;
}

function applyAccessoryInformation(api, accessory, kind) {
  const service = accessory.getService(api.hap.Service.AccessoryInformation)
    || accessory.addService(api.hap.Service.AccessoryInformation);

  service.setCharacteristic(api.hap.Characteristic.Manufacturer, MANUFACTURER);
  service.setCharacteristic(api.hap.Characteristic.Model, modelForKind(kind));
  service.setCharacteristic(api.hap.Characteristic.SerialNumber, serialFromUuid(accessory.UUID));
}

module.exports = {
  applyAccessoryInformation,
  modelForKind,
  serialFromUuid,
};
