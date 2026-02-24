'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { HeartbeatAccessory } = require('../src/accessories/heartbeatAccessory');

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
      this.displayName = '';
    }

    getCharacteristic(type) {
      if (!this.characteristics.has(type)) {
        this.characteristics.set(type, new MockCharacteristic(type));
      }
      return this.characteristics.get(type);
    }

    updateCharacteristic(type, value) {
      this.values.set(type, value);
    }

    setCharacteristic(type, value) {
      this.values.set(type, value);
      return this;
    }
  }

  return {
    hap: {
      Service: { MotionSensor: MockService },
      Characteristic: { MotionDetected: 'MotionDetected', Name: 'Name' },
    },
  };
}

function createMockAccessory() {
  const services = [];
  return {
    UUID: 'hb-1',
    context: {},
    getServiceById(type, subtype) {
      return services.find((s) => s.type === type && s.subtype === subtype)?.instance || null;
    },
    addService(type, _name, subtype) {
      const instance = new type();
      services.push({ type, subtype, instance });
      return instance;
    },
  };
}

function createScheduler() {
  let nextId = 1;
  const tasks = new Map();
  return {
    setTimeout(fn, delay) {
      const id = nextId++;
      tasks.set(id, { fn, delay });
      return id;
    },
    clearTimeout(id) {
      tasks.delete(id);
    },
    ids() {
      return Array.from(tasks.keys());
    },
    delayOf(id) {
      return tasks.get(id)?.delay;
    },
    run(id) {
      const task = tasks.get(id);
      if (!task) return;
      tasks.delete(id);
      task.fn();
    },
    size() {
      return tasks.size;
    },
  };
}

function logger() {
  return { debug() {}, info() {}, warn() {}, error() {} };
}

test('heartbeat configures motion sensor and initializes false', () => {
  const api = createMockApi();
  const accessory = createMockAccessory();
  const scheduler = createScheduler();
  const instance = new HeartbeatAccessory(
    api,
    logger(),
    accessory,
    { name: 'HB', enabled: true, intervalSeconds: 10, pulseDurationSeconds: 1, startupMode: 'wait' },
    scheduler,
  );

  instance.configure();
  const service = accessory.getServiceById(api.hap.Service.MotionSensor, 'heartbeat');
  assert.equal(service.values.get(api.hap.Characteristic.MotionDetected), false);
});

test('heartbeat wait startup delays first pulse by interval', () => {
  const api = createMockApi();
  const accessory = createMockAccessory();
  const scheduler = createScheduler();
  const instance = new HeartbeatAccessory(
    api,
    logger(),
    accessory,
    { name: 'HB', enabled: true, intervalSeconds: 12, pulseDurationSeconds: 1, startupMode: 'wait' },
    scheduler,
  );

  instance.configure();
  const [id] = scheduler.ids();
  assert.equal(scheduler.delayOf(id), 12000);
});

test('heartbeat immediate startup pulses immediately then resets', async () => {
  const api = createMockApi();
  const accessory = createMockAccessory();
  const scheduler = createScheduler();
  const instance = new HeartbeatAccessory(
    api,
    logger(),
    accessory,
    { name: 'HB', enabled: true, intervalSeconds: 10, pulseDurationSeconds: 2, startupMode: 'immediate' },
    scheduler,
  );

  instance.configure();
  const firstTimer = scheduler.ids()[0];
  assert.equal(scheduler.delayOf(firstTimer), 0);
  scheduler.run(firstTimer);

  const service = accessory.getServiceById(api.hap.Service.MotionSensor, 'heartbeat');
  assert.equal(service.values.get(api.hap.Characteristic.MotionDetected), true);

  const ids = scheduler.ids();
  const offTimer = ids.find((id) => scheduler.delayOf(id) === 2000);
  scheduler.run(offTimer);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(service.values.get(api.hap.Characteristic.MotionDetected), false);
});

test('heartbeat schedules recurring next pulse and stop clears timers', () => {
  const api = createMockApi();
  const accessory = createMockAccessory();
  const scheduler = createScheduler();
  const instance = new HeartbeatAccessory(
    api,
    logger(),
    accessory,
    { name: 'HB', enabled: true, intervalSeconds: 5, pulseDurationSeconds: 1, startupMode: 'immediate' },
    scheduler,
  );

  instance.configure();
  scheduler.run(scheduler.ids()[0]);
  assert.equal(
    scheduler.ids().some((id) => scheduler.delayOf(id) === 5000),
    true,
  );
  assert.equal(
    scheduler.ids().some((id) => scheduler.delayOf(id) === 1000),
    true,
  );

  instance.stop();
  assert.equal(scheduler.size(), 0);
});

test('disabled heartbeat does not schedule pulses', () => {
  const api = createMockApi();
  const accessory = createMockAccessory();
  const scheduler = createScheduler();
  const instance = new HeartbeatAccessory(
    api,
    logger(),
    accessory,
    { name: 'HB', enabled: false, intervalSeconds: 5, pulseDurationSeconds: 1, startupMode: 'wait' },
    scheduler,
  );

  instance.configure();
  assert.equal(scheduler.size(), 0);
});
