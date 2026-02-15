'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { UltimateSwitchesPlatform } = require('../src/platform');

function createBaseLog() {
  const warnings = [];
  return {
    warnings,
    log: {
      info() {},
      error() {},
      debug() {},
      warn(format, ...args) {
        warnings.push({ format, args });
      },
    },
  };
}

function createMockApi() {
  class MockAccessoryInformationService {
    constructor() {
      this.values = {};
    }

    setCharacteristic(key, value) {
      this.values[key] = value;
      return this;
    }
  }

  class MockAccessory {
    constructor(name, uuid, category) {
      this.displayName = name;
      this.UUID = uuid;
      this.category = category;
      this.context = {};
      this.infoService = null;
    }

    getService(type) {
      if (type === 'AccessoryInformation') {
        return this.infoService;
      }
      return null;
    }

    addService(type) {
      if (type === 'AccessoryInformation') {
        this.infoService = new MockAccessoryInformationService();
        return this.infoService;
      }
      return {};
    }
  }

  const registered = [];

  const api = {
    on() {},
    registerPlatformAccessories(_plugin, _platform, accessories) {
      registered.push(...accessories);
    },
    unregisterPlatformAccessories() {},
    updatePlatformAccessories() {},
    platformAccessory: MockAccessory,
    hap: {
      uuid: {
        generate(value) {
          return `uuid-${value}`;
        },
      },
      Accessory: {
        Categories: {
          SWITCH: 1,
          SENSOR: 2,
          DOOR_LOCK: 3,
          SECURITY_SYSTEM: 4,
        },
      },
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

  return { api, registered };
}

test('platform warns once per group when blank placeholders are pruned', () => {
  const sink = createBaseLog();
  new UltimateSwitchesPlatform(sink.log, {
    commandSwitches: [{ polling: false, pollIntervalSeconds: 5, commandTimeoutSeconds: 2 }],
    switches: [{ defaultOn: false, persistState: false }],
    calendarTriggers: [{ updateIntervalMinutes: 60, requestTimeoutSeconds: 15 }],
  });

  assert.equal(sink.warnings.length, 3);
  assert.equal(sink.warnings[0].format, '[Config] Pruned %d blank placeholder row(s) from %s');
  assert.deepEqual(sink.warnings[0].args, [1, 'commandSwitches']);
  assert.deepEqual(sink.warnings[1].args, [1, 'switches']);
  assert.deepEqual(sink.warnings[2].args, [1, 'calendarTriggers']);
});

test('platform does not warn when no placeholder rows are pruned', () => {
  const sink = createBaseLog();
  new UltimateSwitchesPlatform(sink.log, {
    commandSwitches: [{
      name: 'Cmd',
      onCommand: 'echo on',
      offCommand: 'echo off',
    }],
  });

  assert.equal(sink.warnings.length, 0);
});

test('platform applies accessory information during initialization', () => {
  const sink = createBaseLog();
  const { api, registered } = createMockApi();
  const platform = new UltimateSwitchesPlatform(sink.log, {
    switches: [{ name: 'Kitchen Light' }],
  }, api);

  platform.createAccessoryInstance = () => ({
    configure() {},
  });

  platform.initializeAccessories();

  assert.equal(registered.length, 1);
  const accessory = registered[0];
  assert.equal(accessory.infoService.values.Manufacturer, 'Ultimate Switches');
  assert.equal(accessory.infoService.values.Model, 'Basic Switch');
  assert.equal(accessory.infoService.values.SerialNumber, 'US-UUIDULTIMATESWITCHES:SWITCH:KITCHEN LIGHT');
});
