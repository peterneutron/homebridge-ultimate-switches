'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { SecuritySystemAccessory } = require('../src/accessories/securitySystemAccessory');
const { OperationCoordinator } = require('../src/execution');

function createMockApi() {
  class MockCharacteristic {
    removeAllListeners() { return this; }
    on() { return this; }
    onGet() { return this; }
    onSet() { return this; }
  }

  class MockService {
    constructor() {
      this.characteristics = new Map();
      this.values = new Map();
      this.subtype = undefined;
    }

    getCharacteristic(type) {
      if (!this.characteristics.has(type)) {
        this.characteristics.set(type, new MockCharacteristic());
      }
      return this.characteristics.get(type);
    }

    updateCharacteristic(type, value) {
      this.values.set(type, value);
      return this;
    }
  }

  return {
    hap: {
      Service: { SecuritySystem: MockService, Switch: MockService },
      Characteristic: {
        On: 'On',
        SecuritySystemTargetState: {
          STAY_ARM: 0,
          AWAY_ARM: 1,
          NIGHT_ARM: 2,
          DISARM: 3,
        },
        SecuritySystemCurrentState: {
          STAY_ARM: 0,
          AWAY_ARM: 1,
          NIGHT_ARM: 2,
          DISARMED: 3,
          ALARM_TRIGGERED: 4,
        },
      },
    },
  };
}

function createMockAccessory() {
  const stores = [];

  return {
    UUID: 'security-1',
    context: {},
    services: [],
    getServiceById(type, subtype) {
      return stores.find((s) => s.type === type && s.subtype === subtype)?.instance;
    },
    addService(type, _name, subtype) {
      const instance = new type();
      instance.subtype = subtype;
      stores.push({ type, subtype, instance });
      this.services = stores.map((s) => s.instance);
      return instance;
    },
    removeService(service) {
      const idx = stores.findIndex((s) => s.instance === service);
      if (idx >= 0) {
        stores.splice(idx, 1);
        this.services = stores.map((s) => s.instance);
      }
    },
  };
}

function logger() {
  return { debug() {}, info() {}, warn() {}, error() {} };
}

test('security system arms and zone alarms produce alarm triggered state', async () => {
  const api = createMockApi();
  const accessory = createMockAccessory();

  const instance = new SecuritySystemAccessory(
    api,
    logger(),
    accessory,
    {
      name: 'House Security',
      defaultState: 'unarmed',
      zones: ['Front', 'Back'],
    },
    new OperationCoordinator(),
  );

  instance.configure();

  await instance.setArmState(true, api.hap.Characteristic.SecuritySystemTargetState.AWAY_ARM);
  assert.equal(instance.state.targetState, api.hap.Characteristic.SecuritySystemTargetState.AWAY_ARM);

  await instance.setZoneAlarm('Front', true);
  assert.equal(instance.deriveCurrentState(), api.hap.Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED);

  await instance.setArmState(false, api.hap.Characteristic.SecuritySystemTargetState.AWAY_ARM);
  assert.equal(instance.deriveCurrentState(), api.hap.Characteristic.SecuritySystemCurrentState.DISARMED);
});
