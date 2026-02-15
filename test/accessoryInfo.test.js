'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { applyAccessoryInformation, modelForKind, serialFromUuid } = require('../src/accessoryInfo');

test('modelForKind returns human-readable labels', () => {
  assert.equal(modelForKind('commandSwitch'), 'Command Switch');
  assert.equal(modelForKind('contextSensor'), 'Context Sensor');
  assert.equal(modelForKind('unknown-kind'), 'Accessory');
});

test('serialFromUuid uses deterministic UUID-derived format', () => {
  assert.equal(
    serialFromUuid('aa-bb-cc-11'),
    'US-AABBCC11',
  );
});

test('applyAccessoryInformation sets manufacturer model and serial', () => {
  const characteristics = {};
  const accessoryInformationService = {
    setCharacteristic(key, value) {
      characteristics[key] = value;
      return this;
    },
  };

  const accessory = {
    UUID: 'ab-cd-ef',
    getService() {
      return null;
    },
    addService() {
      return accessoryInformationService;
    },
  };

  const api = {
    hap: {
      Service: {
        AccessoryInformation: 'AccessoryInformation',
      },
      Characteristic: {
        Manufacturer: 'Manufacturer',
        Model: 'Model',
        SerialNumber: 'SerialNumber',
      },
    },
  };

  applyAccessoryInformation(api, accessory, 'timer');

  assert.equal(characteristics.Manufacturer, 'Ultimate Switches');
  assert.equal(characteristics.Model, 'Timer Switch');
  assert.equal(characteristics.SerialNumber, 'US-ABCDEF');
});
