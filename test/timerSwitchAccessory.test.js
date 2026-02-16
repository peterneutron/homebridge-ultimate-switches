'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { TimerSwitchAccessory } = require('../src/accessories/timerSwitchAccessory');
const { OperationCoordinator } = require('../src/execution');

function createMockApi() {
  class MockCharacteristic {
    constructor(type) {
      this.type = type;
    }

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
        this.characteristics.set(type, new MockCharacteristic(type));
      }
      return this.characteristics.get(type);
    }

    updateCharacteristic(type, value) {
      this.values.set(type, value);
    }
  }

  return {
    hap: {
      Service: { Switch: MockService, MotionSensor: MockService },
      Characteristic: { On: 'On', MotionDetected: 'MotionDetected' },
    },
  };
}

function createMockAccessory(api) {
  const services = [];
  return {
    UUID: 'timer-1',
    context: {},
    getServiceById(type, subtype) {
      return services.find((svc) => svc.type === type && svc.subtype === subtype)?.instance;
    },
    addService(type, _name, subtype) {
      const instance = new type();
      services.push({ type, subtype, instance });
      return instance;
    },
    removeService(service) {
      const idx = services.findIndex((entry) => entry.instance === service);
      if (idx >= 0) services.splice(idx, 1);
    },
    _services: services,
  };
}

function createFakeScheduler() {
  let nextId = 1;
  const pending = new Map();

  return {
    setTimeout(fn, _delay) {
      const id = nextId++;
      pending.set(id, fn);
      return id;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
    runOne(id) {
      const fn = pending.get(id);
      if (!fn) return;
      pending.delete(id);
      fn();
    },
    runAll() {
      const ids = Array.from(pending.keys());
      ids.forEach((id) => this.runOne(id));
    },
    size() {
      return pending.size;
    },
    ids() {
      return Array.from(pending.keys());
    },
  };
}

function logger() {
  return { debug() {}, info() {}, warn() {}, error() {} };
}

function createLogSink() {
  const info = [];
  const debug = [];
  return {
    info,
    debug,
    logger: {
      info: (...args) => info.push(args),
      debug: (...args) => debug.push(args),
      warn() {},
      error() {},
    },
  };
}

test('autoOff timer turns switch off after cycle', async () => {
  const api = createMockApi();
  const accessory = createMockAccessory(api);
  const scheduler = createFakeScheduler();

  const instance = new TimerSwitchAccessory(
    api,
    logger(),
    accessory,
    { name: 'Timer', periodSeconds: 1, autoOff: true, emitMotionPulse: false },
    new OperationCoordinator(),
    scheduler,
  );

  instance.configure();
  await instance.setState(true);

  assert.equal(instance.state, true);
  const [cycleId] = scheduler.ids();
  scheduler.runOne(cycleId);

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(instance.state, false);
});

test('non-autoOff timer reschedules itself', async () => {
  const api = createMockApi();
  const accessory = createMockAccessory(api);
  const scheduler = createFakeScheduler();

  const instance = new TimerSwitchAccessory(
    api,
    logger(),
    accessory,
    { name: 'Timer', periodSeconds: 1, autoOff: false, emitMotionPulse: false },
    new OperationCoordinator(),
    scheduler,
  );

  instance.configure();
  await instance.setState(true);
  const firstCycle = scheduler.ids()[0];
  scheduler.runOne(firstCycle);

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(instance.state, true);
  assert.equal(scheduler.size(), 1);
});

test('emitMotionPulse toggles motion service true then false', async () => {
  const api = createMockApi();
  const accessory = createMockAccessory(api);
  const scheduler = createFakeScheduler();

  const instance = new TimerSwitchAccessory(
    api,
    logger(),
    accessory,
    { name: 'Timer', periodSeconds: 1, autoOff: true, emitMotionPulse: true },
    new OperationCoordinator(),
    scheduler,
  );

  instance.configure();
  await instance.setState(true);

  const cycleId = scheduler.ids()[0];
  scheduler.runOne(cycleId);
  await new Promise((resolve) => setImmediate(resolve));

  const motionService = accessory.getServiceById(api.hap.Service.MotionSensor, 'timerMotion');
  assert.equal(motionService.values.get(api.hap.Characteristic.MotionDetected), true);

  const pulseId = scheduler.ids()[0];
  scheduler.runOne(pulseId);
  assert.equal(motionService.values.get(api.hap.Characteristic.MotionDetected), false);
});

test('stop clears all timers', async () => {
  const api = createMockApi();
  const accessory = createMockAccessory(api);
  const scheduler = createFakeScheduler();

  const instance = new TimerSwitchAccessory(
    api,
    logger(),
    accessory,
    { name: 'Timer', periodSeconds: 1, autoOff: false, emitMotionPulse: false },
    new OperationCoordinator(),
    scheduler,
  );

  instance.configure();
  await instance.setState(true);
  assert.equal(scheduler.size(), 1);

  instance.stop();
  assert.equal(scheduler.size(), 0);
});

test('timer emits INFO transitions for manual and timer-cycle changes', async () => {
  const api = createMockApi();
  const accessory = createMockAccessory(api);
  const scheduler = createFakeScheduler();
  const logs = createLogSink();

  const instance = new TimerSwitchAccessory(
    api,
    logs.logger,
    accessory,
    { name: 'Timer', periodSeconds: 1, autoOff: true, emitMotionPulse: false },
    new OperationCoordinator(),
    scheduler,
  );

  instance.configure();
  await instance.setState(true);
  const cycleId = scheduler.ids()[0];
  scheduler.runOne(cycleId);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(
    logs.info.some((args) => args[0] === '[%s:%s] State %s -> %s (%s)' && args[1] === 'Timer' && args[5] === 'manual'),
    true,
  );
  assert.equal(
    logs.info.some((args) => args[0] === '[%s:%s] State %s -> %s (%s)' && args[1] === 'Timer' && args[5] === 'timer-cycle'),
    true,
  );
});
