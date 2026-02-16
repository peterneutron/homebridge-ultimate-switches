'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { BasicSwitchAccessory } = require('../src/accessories/basicSwitchAccessory');
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
      Service: { Switch: MockService },
      Characteristic: { On: 'On' },
    },
  };
}

function createMockAccessory() {
  return {
    UUID: 'switch-1',
    context: {},
    service: null,
    getService() {
      return this.service;
    },
    addService(serviceType) {
      this.service = new serviceType();
      return this.service;
    },
  };
}

test('basic switch logs INFO only on actual state changes', async () => {
  const info = [];
  const api = createMockApi();
  const accessory = createMockAccessory();
  const logger = {
    info: (...args) => info.push(args),
    debug() {},
    warn() {},
    error() {},
  };

  const instance = new BasicSwitchAccessory(
    api,
    logger,
    accessory,
    { name: 'Lamp', defaultOn: false },
    new OperationCoordinator(),
  );

  instance.configure();
  await instance.setState(true);
  await instance.setState(true);
  await instance.setState(false);

  const transitionLogs = info.filter((args) => args[0] === '[%s:%s] State %s -> %s (%s)' && args[1] === 'Switch');
  assert.equal(transitionLogs.length, 2);
});
