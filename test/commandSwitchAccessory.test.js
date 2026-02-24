'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { CommandSwitchAccessory } = require('../src/accessories/commandSwitchAccessory');
const { OperationCoordinator } = require('../src/execution');

function createMockApi() {
  class MockCharacteristic {
    constructor() {
      this.value = false;
    }

    removeAllListeners() {
      return this;
    }

    on() {
      return this;
    }

    onGet() {
      return this;
    }

    onSet() {
      return this;
    }
  }

  class MockService {
    constructor() {
      this.characteristics = new Map();
      this.values = new Map();
      this.displayName = '';
    }

    getCharacteristic(type) {
      if (!this.characteristics.has(type)) {
        this.characteristics.set(type, new MockCharacteristic());
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
      Service: { Switch: MockService },
      Characteristic: { On: 'On' },
    },
  };
}

function createMockAccessory(api) {
  return {
    UUID: 'acc-1',
    context: {},
    _service: null,
    getServiceById() {
      return this._service;
    },
    addService(serviceType) {
      this._service = new serviceType();
      return this._service;
    },
  };
}

function createLogger() {
  return { debug() {}, info() {}, warn() {}, error() {} };
}

function createLogSink() {
  const info = [];
  const debug = [];
  const warn = [];
  return {
    info,
    debug,
    warn,
    logger: {
      info: (...args) => info.push(args),
      debug: (...args) => debug.push(args),
      warn: (...args) => warn.push(args),
      error() {},
    },
  };
}

test('setState executes on/off commands and updates state', async () => {
  const api = createMockApi();
  const accessory = createMockAccessory(api);
  const calls = [];

  const instance = new CommandSwitchAccessory(
    api,
    createLogger(),
    accessory,
    {
      name: 'Cmd',
      onCommand: 'on-cmd',
      offCommand: 'off-cmd',
      stateCommand: 'state-cmd',
      polling: false,
      pollIntervalSeconds: 5,
      commandTimeoutSeconds: 2,
    },
    new OperationCoordinator(),
    async (command) => { calls.push(command); },
  );

  instance.configure();

  await instance.setState(true);
  await instance.setState(false);

  assert.deepEqual(calls, ['on-cmd', 'off-cmd']);
  assert.equal(instance.state, false);
  assert.equal(accessory.context.state, false);
});

test('pollState maps command success to on and failure to off', async () => {
  const api = createMockApi();
  const accessory = createMockAccessory(api);
  const responses = [true, false];

  const instance = new CommandSwitchAccessory(
    api,
    createLogger(),
    accessory,
    {
      name: 'Cmd',
      onCommand: 'on-cmd',
      offCommand: 'off-cmd',
      stateCommand: 'state-cmd',
      polling: false,
      pollIntervalSeconds: 120,
      commandTimeoutSeconds: 2,
    },
    new OperationCoordinator(),
    async () => {
      const ok = responses.shift();
      if (!ok) {
        throw new Error('state failure');
      }
    },
  );

  instance.configure();
  await instance.pollState();
  assert.equal(instance.state, true);

  await instance.pollState();
  assert.equal(instance.state, false);

  instance.stop();
});

test('stop clears polling timer', () => {
  const api = createMockApi();
  const accessory = createMockAccessory(api);

  const instance = new CommandSwitchAccessory(
    api,
    createLogger(),
    accessory,
    {
      name: 'Cmd',
      onCommand: 'on-cmd',
      offCommand: 'off-cmd',
      stateCommand: 'state-cmd',
      polling: true,
      pollIntervalSeconds: 120,
      commandTimeoutSeconds: 2,
    },
    new OperationCoordinator(),
    async () => {},
  );

  instance.configure();
  assert.notEqual(instance.pollTimer, null);
  instance.stop();
  assert.equal(instance.pollTimer, null);
});

test('setState off without offCommand does not execute shell', async () => {
  const api = createMockApi();
  const accessory = createMockAccessory(api);
  const calls = [];

  const instance = new CommandSwitchAccessory(
    api,
    createLogger(),
    accessory,
    {
      name: 'Cmd',
      onCommand: 'on-cmd',
      polling: false,
      pollIntervalSeconds: 5,
      commandTimeoutSeconds: 5,
    },
    new OperationCoordinator(),
    async (command) => { calls.push(command); },
  );

  instance.configure();
  await instance.setState(true);
  await instance.setState(false);

  assert.deepEqual(calls, ['on-cmd']);
  assert.equal(instance.state, false);
});

test('autoOff without offCommand flips state off after delay', async () => {
  const api = createMockApi();
  const accessory = createMockAccessory(api);
  const tasks = new Map();
  let taskId = 1;

  const timers = {
    setTimeout(fn) {
      const id = taskId++;
      tasks.set(id, fn);
      return id;
    },
    clearTimeout(id) {
      tasks.delete(id);
    },
  };

  const instance = new CommandSwitchAccessory(
    api,
    createLogger(),
    accessory,
    {
      name: 'Cmd',
      onCommand: 'on-cmd',
      polling: false,
      pollIntervalSeconds: 5,
      commandTimeoutSeconds: 5,
      autoOffSeconds: 5,
    },
    new OperationCoordinator(),
    async () => {},
    timers,
  );

  instance.configure();
  await instance.setState(true);
  assert.equal(instance.state, true);

  const autoOffId = Math.max(...tasks.keys());
  tasks.get(autoOffId)();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(instance.state, false);
});

test('autoOff with failing offCommand keeps switch on', async () => {
  const api = createMockApi();
  const accessory = createMockAccessory(api);
  const tasks = new Map();
  let taskId = 1;

  const timers = {
    setTimeout(fn) {
      const id = taskId++;
      tasks.set(id, fn);
      return id;
    },
    clearTimeout(id) {
      tasks.delete(id);
    },
  };

  const instance = new CommandSwitchAccessory(
    api,
    createLogger(),
    accessory,
    {
      name: 'Cmd',
      onCommand: 'on-cmd',
      offCommand: 'off-cmd',
      polling: false,
      pollIntervalSeconds: 5,
      commandTimeoutSeconds: 5,
      autoOffSeconds: 5,
    },
    new OperationCoordinator(),
    async (command) => {
      if (command === 'off-cmd') {
        throw new Error('off failed');
      }
    },
    timers,
  );

  instance.configure();
  await instance.setState(true);
  assert.equal(instance.state, true);

  const autoOffId = Math.max(...tasks.keys());
  tasks.get(autoOffId)();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(instance.state, true);
});

test('command switch emits INFO transitions and auto-off lifecycle logs', async () => {
  const api = createMockApi();
  const accessory = createMockAccessory(api);
  const tasks = new Map();
  let taskId = 1;
  const logs = createLogSink();

  const timers = {
    setTimeout(fn) {
      const id = taskId++;
      tasks.set(id, fn);
      return id;
    },
    clearTimeout(id) {
      tasks.delete(id);
    },
  };

  const instance = new CommandSwitchAccessory(
    api,
    logs.logger,
    accessory,
    {
      name: 'Cmd',
      onCommand: 'on-cmd',
      polling: false,
      pollIntervalSeconds: 5,
      commandTimeoutSeconds: 5,
      autoOffSeconds: 5,
    },
    new OperationCoordinator(),
    async () => {},
    timers,
  );

  instance.configure();
  await instance.setState(true);
  await instance.setState(false);

  assert.equal(
    logs.info.some((args) => args[0] === '[CommandSwitch:%s] Auto-off scheduled in %ds' && args[1] === 'Cmd' && args[2] === 5),
    true,
  );
  assert.equal(
    logs.info.some((args) => args[0] === '[CommandSwitch:%s] Auto-off cancelled' && args[1] === 'Cmd'),
    true,
  );
  assert.equal(
    logs.info.some((args) => args[0] === '[%s:%s] State %s -> %s (%s)' && args[1] === 'CommandSwitch'),
    true,
  );
});

test('webhook on action succeeds on 2xx and updates state', async () => {
  const api = createMockApi();
  const accessory = createMockAccessory(api);
  const webhookCalls = [];

  const instance = new CommandSwitchAccessory(
    api,
    createLogger(),
    accessory,
    {
      name: 'Webhook',
      actions: {
        on: { transport: 'webhook', input: 'http://127.0.0.1/on', method: 'GET' },
      },
      polling: false,
      pollIntervalSeconds: 5,
      commandTimeoutSeconds: 2,
    },
    new OperationCoordinator(),
    {
      runWebhook: async (action) => {
        webhookCalls.push({ input: action.input, method: action.method });
        return { transport: 'webhook', statusCode: 200, body: 'ok' };
      },
    },
  );

  instance.configure();
  await instance.setState(true);

  assert.equal(instance.state, true);
  assert.deepEqual(webhookCalls, [{ input: 'http://127.0.0.1/on', method: 'GET' }]);
});

test('webhook off failure keeps previous state', async () => {
  const api = createMockApi();
  const accessory = createMockAccessory(api);

  const instance = new CommandSwitchAccessory(
    api,
    createLogger(),
    accessory,
    {
      name: 'Webhook',
      actions: {
        on: { transport: 'webhook', input: 'http://127.0.0.1/on', method: 'GET' },
        off: { transport: 'webhook', input: 'http://127.0.0.1/off', method: 'GET' },
      },
      polling: false,
      pollIntervalSeconds: 5,
      commandTimeoutSeconds: 2,
    },
    new OperationCoordinator(),
    {
      runWebhook: async (action) => {
        if (action.input.endsWith('/off')) {
          throw new Error('HTTP 500');
        }
        return { transport: 'webhook', statusCode: 200, body: 'ok' };
      },
    },
  );

  instance.configure();
  await instance.setState(true);
  await assert.rejects(instance.setState(false), /HTTP 500/);
  assert.equal(instance.state, true);
});

test('mixed transport polling supports webhook on/off and command status regex', async () => {
  const api = createMockApi();
  const accessory = createMockAccessory(api);
  const commandOutputs = ['power: on', 'power: off'];

  const instance = new CommandSwitchAccessory(
    api,
    createLogger(),
    accessory,
    {
      name: 'Mixed',
      actions: {
        on: { transport: 'webhook', input: 'http://127.0.0.1/on', method: 'GET' },
        off: { transport: 'webhook', input: 'http://127.0.0.1/off', method: 'POST' },
        status: { transport: 'command', input: 'device status', matchPattern: 'power:\\s*on', matchFlags: 'i' },
      },
      polling: false,
      pollIntervalSeconds: 5,
      commandTimeoutSeconds: 2,
    },
    new OperationCoordinator(),
    {
      runCommand: async () => ({ stdout: commandOutputs.shift(), stderr: '' }),
      runWebhook: async () => ({ transport: 'webhook', statusCode: 200, body: 'ok' }),
    },
  );

  instance.configure();
  await instance.setState(true);
  assert.equal(instance.state, true);

  await instance.pollState();
  assert.equal(instance.state, true);
  await instance.pollState();
  assert.equal(instance.state, false);
});

test('status webhook polling uses 2xx default and optional regex on body', async () => {
  const api = createMockApi();
  const accessory = createMockAccessory(api);
  const webhookResults = [
    { statusCode: 200, body: 'READY=1' },
    { statusCode: 200, body: 'READY=0' },
    new Error('Webhook request failed: HTTP 500'),
  ];

  const instance = new CommandSwitchAccessory(
    api,
    createLogger(),
    accessory,
    {
      name: 'StatusWebhook',
      actions: {
        on: { transport: 'command', input: 'echo on' },
        status: { transport: 'webhook', input: 'http://127.0.0.1/status', matchPattern: 'READY=1' },
      },
      polling: false,
      pollIntervalSeconds: 5,
      commandTimeoutSeconds: 2,
    },
    new OperationCoordinator(),
    {
      runCommand: async () => ({ stdout: '', stderr: '' }),
      runWebhook: async () => {
        const next = webhookResults.shift();
        if (next instanceof Error) {
          throw next;
        }
        return { transport: 'webhook', ...next };
      },
    },
  );

  instance.configure();

  await instance.pollState();
  assert.equal(instance.state, true);
  await instance.pollState();
  assert.equal(instance.state, false);
  await instance.pollState();
  assert.equal(instance.state, false);
});

test('on action optional regex confirmation can block state update', async () => {
  const api = createMockApi();
  const accessory = createMockAccessory(api);

  const instance = new CommandSwitchAccessory(
    api,
    createLogger(),
    accessory,
    {
      name: 'Confirm',
      actions: {
        on: { transport: 'command', input: 'echo on', matchPattern: 'POWER=ON' },
      },
      polling: false,
      pollIntervalSeconds: 5,
      commandTimeoutSeconds: 2,
    },
    new OperationCoordinator(),
    {
      runCommand: async () => ({ stdout: 'POWER=OFF', stderr: '' }),
    },
  );

  instance.configure();
  await assert.rejects(instance.setState(true), /did not match ON confirmation pattern/);
  assert.equal(instance.state, false);
});
