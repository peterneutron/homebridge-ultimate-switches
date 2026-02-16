'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { LockAccessory } = require('../src/accessories/lockAccessory');
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
      Service: { LockMechanism: MockService },
      Characteristic: {
        LockTargetState: { SECURED: 1, UNSECURED: 0 },
        LockCurrentState: { SECURED: 1, UNSECURED: 0 },
      },
    },
  };
}

function createMockAccessory(api) {
  const services = [];
  return {
    UUID: 'lock-1',
    context: {},
    getServiceById(type, subtype) {
      return services.find((s) => s.type === type && s.subtype === subtype)?.instance;
    },
    addService(type, _name, subtype) {
      const instance = new type();
      services.push({ type, subtype, instance });
      return instance;
    },
  };
}

test('lock defaults to configured defaultState and updates both lock characteristics', async () => {
  const api = createMockApi();
  const accessory = createMockAccessory(api);
  const info = [];
  const logger = {
    debug() {},
    info: (...args) => info.push(args),
    warn() {},
    error() {},
  };

  const instance = new LockAccessory(
    api,
    logger,
    accessory,
    { name: 'Front Door', defaultState: 'locked' },
    new OperationCoordinator(),
  );

  instance.configure();
  assert.equal(instance.targetState, 1);
  assert.equal(instance.currentState, 1);

  await instance.setTargetState(0);
  assert.equal(instance.targetState, 0);
  assert.equal(instance.currentState, 0);
  assert.equal(accessory.context.lockTargetState, 0);
  assert.equal(
    info.some((args) => args[0] === '[%s:%s] State %s -> %s (%s)' && args[1] === 'Lock' && args[2] === 'Front Door'),
    true,
  );
});
