'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { CalendarEngine } = require('../src/calendarEngine');
const { CalendarRootAccessory } = require('../src/accessories/calendarRootAccessory');
const { CalendarEventAccessory } = require('../src/accessories/calendarEventAccessory');
const { CalendarNotificationAccessory } = require('../src/accessories/calendarNotificationAccessory');

function createFakeScheduler() {
  let nextId = 1;
  const tasks = new Map();

  return {
    setTimeout(fn, _delay) {
      const id = nextId++;
      tasks.set(id, fn);
      return id;
    },
    clearTimeout(id) {
      tasks.delete(id);
    },
    run(id) {
      const fn = tasks.get(id);
      if (!fn) return;
      tasks.delete(id);
      fn();
    },
    ids() {
      return Array.from(tasks.keys());
    },
  };
}

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
      return this;
    }

    setCharacteristic(type, value) {
      this.values.set(type, value);
      return this;
    }
  }

  return {
    hap: {
      Service: {
        ContactSensor: MockService,
        Switch: MockService,
        LightSensor: MockService,
      },
      Characteristic: {
        Name: 'Name',
        On: 'On',
        ContactSensorState: {
          CONTACT_DETECTED: 1,
          CONTACT_NOT_DETECTED: 0,
        },
        CurrentAmbientLightLevel: 'CurrentAmbientLightLevel',
      },
    },
  };
}

function createMockAccessory() {
  const store = [];
  return {
    UUID: 'calendar-1',
    context: {},
    services: [],
    getServiceById(type, subtype) {
      return store.find((item) => item.type === type && item.subtype === subtype)?.instance;
    },
    addService(type, name, subtype) {
      const instance = new type();
      instance.subtype = subtype;
      instance.displayName = name;
      store.push({ type, subtype, instance });
      this.services = store.map((s) => s.instance);
      return instance;
    },
    removeService(service) {
      const index = store.findIndex((item) => item.instance === service);
      if (index >= 0) {
        store.splice(index, 1);
        this.services = store.map((s) => s.instance);
      }
    },
  };
}

function logger() {
  return { debug() {}, info() {}, warn() {}, error() {} };
}

function createLogSink() {
  const info = [];
  const debug = [];
  const warn = [];
  const error = [];
  return {
    info,
    debug,
    warn,
    error,
    logger: {
      info: (...args) => info.push(args),
      debug: (...args) => debug.push(args),
      warn: (...args) => warn.push(args),
      error: (...args) => error.push(args),
    },
  };
}

test('calendar engine computes root/event states and progress', async () => {
  const scheduler = createFakeScheduler();
  const now = Date.parse('2026-02-15T12:00:00Z');

  const engine = new CalendarEngine(
    logger(),
    {
      name: 'Developer',
      url: 'https://example.invalid/ics',
      updateIntervalMinutes: 60,
      requestTimeoutSeconds: 15,
      updateButton: true,
      triggerOnUpdates: false,
      triggerOnAnyEvent: false,
      events: [{ name: '^Meeting$', triggerOnUpdates: false, notifications: [] }],
    },
    {
      listEvents: async () => [{
        summary: 'Meeting',
        startMs: now - 30 * 60 * 1000,
        endMs: now + 30 * 60 * 1000,
      }],
    },
    () => now,
    scheduler,
  );

  await engine.refreshNow();

  assert.equal(engine.getRootState(), true);
  assert.deepEqual(engine.getEventState('calendarEvent:Developer:^Meeting$'), {
    active: true,
    progress: 50,
  });
});

test('calendar engine notification pulse activates then resets', async () => {
  const scheduler = createFakeScheduler();
  const start = Date.parse('2026-02-15T12:00:00Z');
  let now = start;

  const engine = new CalendarEngine(
    logger(),
    {
      name: 'Developer',
      url: 'https://example.invalid/ics',
      updateIntervalMinutes: 60,
      requestTimeoutSeconds: 15,
      updateButton: false,
      triggerOnUpdates: false,
      triggerOnAnyEvent: false,
      events: [{
        name: '^Meeting$',
        triggerOnUpdates: false,
        notifications: [{ name: 'LOL', startOffsetMinutes: 0, endOffsetMinutes: 0 }],
      }],
    },
    {
      listEvents: async () => [{
        summary: 'Meeting',
        startMs: start,
        endMs: start + 60 * 60 * 1000,
      }],
    },
    () => now,
    scheduler,
  );

  await engine.refreshNow();
  now = start + 60_000;
  await engine.refreshNow();

  const notificationKey = 'calendarNotification:Developer:^Meeting$:LOL';
  assert.equal(engine.getNotificationState(notificationKey), true);

  const pulseId = Math.max(...scheduler.ids());
  scheduler.run(pulseId);
  assert.equal(engine.getNotificationState(notificationKey), false);
});

test('calendar engine fires negative start-offset notifications before event start', async () => {
  const scheduler = createFakeScheduler();
  const start = Date.parse('2026-02-15T12:00:00Z');
  const now = start - 4 * 60 * 1000;

  const engine = new CalendarEngine(
    logger(),
    {
      name: 'Developer',
      url: 'https://example.invalid/ics',
      updateIntervalMinutes: 60,
      requestTimeoutSeconds: 15,
      updateButton: false,
      triggerOnUpdates: false,
      triggerOnAnyEvent: false,
      events: [{
        name: '^Meeting$',
        triggerOnUpdates: false,
        notifications: [{ name: 'PreStart', startOffsetMinutes: -5 }],
      }],
    },
    {
      listEvents: async () => [{
        summary: 'Meeting',
        startMs: start,
        endMs: start + 60 * 60 * 1000,
      }],
    },
    () => now,
    scheduler,
  );

  await engine.refreshNow();

  const notificationKey = 'calendarNotification:Developer:^Meeting$:PreStart';
  assert.equal(engine.getNotificationState(notificationKey), true);
});

test('calendar engine replays missed boundaries from persisted poll timestamp', async () => {
  const scheduler = createFakeScheduler();
  const start = Date.parse('2026-02-15T12:00:00Z');
  const now = start - 4 * 60 * 1000;
  let persistedPollMs = now - 2 * 60 * 1000;

  const engine = new CalendarEngine(
    logger(),
    {
      name: 'Developer',
      url: 'https://example.invalid/ics',
      updateIntervalMinutes: 60,
      requestTimeoutSeconds: 15,
      updateButton: false,
      triggerOnUpdates: false,
      triggerOnAnyEvent: false,
      events: [{
        name: '^Meeting$',
        triggerOnUpdates: false,
        notifications: [{ name: 'PreStart', startOffsetMinutes: -5 }],
      }],
    },
    {
      listEvents: async () => [{
        summary: 'Meeting',
        startMs: start,
        endMs: start + 60 * 60 * 1000,
      }],
    },
    () => now,
    scheduler,
    {
      getPersistedLastPollMs: () => persistedPollMs,
      setPersistedLastPollMs: (ms) => {
        persistedPollMs = ms;
      },
    },
  );

  await engine.refreshNow();

  const notificationKey = 'calendarNotification:Developer:^Meeting$:PreStart';
  assert.equal(engine.getNotificationState(notificationKey), true);
  assert.equal(persistedPollMs, now);
});

test('calendar engine caps replay window to 24h for stale persisted timestamp', async () => {
  const scheduler = createFakeScheduler();
  const start = Date.parse('2026-02-15T12:00:00Z');
  const now = start;
  const twoDays = 48 * 60 * 60 * 1000;
  let persistedPollMs = now - twoDays;

  const engine = new CalendarEngine(
    logger(),
    {
      name: 'Developer',
      url: 'https://example.invalid/ics',
      updateIntervalMinutes: 60,
      requestTimeoutSeconds: 15,
      updateButton: false,
      triggerOnUpdates: false,
      triggerOnAnyEvent: false,
      events: [{
        name: '^Meeting$',
        triggerOnUpdates: false,
        notifications: [{ name: 'HugeOffset', startOffsetMinutes: -(36 * 60) }],
      }],
    },
    {
      listEvents: async () => [{
        summary: 'Meeting',
        startMs: start,
        endMs: start + 60 * 60 * 1000,
      }],
    },
    () => now,
    scheduler,
    {
      getPersistedLastPollMs: () => persistedPollMs,
      setPersistedLastPollMs: (ms) => {
        persistedPollMs = ms;
      },
    },
  );

  await engine.refreshNow();

  const notificationKey = 'calendarNotification:Developer:^Meeting$:HugeOffset';
  assert.equal(engine.getNotificationState(notificationKey), false);
  assert.equal(persistedPollMs, now);
});

test('calendar root accessory removes legacy child services on cached accessory reuse', () => {
  const api = createMockApi();
  const accessory = createMockAccessory();

  accessory.addService(api.hap.Service.ContactSensor, 'Old Event', 'calendar-event-0');
  accessory.addService(api.hap.Service.LightSensor, 'Old Progress', 'calendar-progress-0');
  accessory.addService(api.hap.Service.ContactSensor, 'Old Notification', 'calendar-notification-0-0');

  const root = new CalendarRootAccessory(
    api,
    logger(),
    accessory,
    {
      name: 'Developer',
      updateButton: false,
    },
    {
      getRootState() {
        return false;
      },
      subscribeRoot() {
        return () => {};
      },
      refreshNow: async () => {},
    },
  );

  root.configure();

  const legacyLeft = accessory.services.some((service) => {
    return typeof service.subtype === 'string'
      && (service.subtype.startsWith('calendar-event-')
      || service.subtype.startsWith('calendar-progress-')
      || service.subtype.startsWith('calendar-notification-'));
  });

  assert.equal(legacyLeft, false);
});

test('calendar accessories expose active state as contact open semantics', () => {
  const api = createMockApi();
  const accessory = createMockAccessory();

  const root = new CalendarRootAccessory(api, logger(), accessory, { name: 'Developer', updateButton: false }, {
    getRootState() { return false; },
    subscribeRoot() { return () => {}; },
    refreshNow: async () => {},
  });
  const event = new CalendarEventAccessory(api, logger(), accessory, {
    name: 'Developer Event',
    eventKey: 'calendarEvent:Developer:^Meeting$',
  }, {
    getEventState() { return { active: false, progress: 0.0001 }; },
    subscribeEvent(_k, _cb) { return () => {}; },
  });
  const notification = new CalendarNotificationAccessory(api, logger(), accessory, {
    name: 'Developer Notification',
    notificationKey: 'calendarNotification:Developer:^Meeting$:LOL',
  }, {
    getNotificationState() { return false; },
    subscribeNotification(_k, _cb) { return () => {}; },
  });

  assert.equal(
    root.toContactState(true),
    api.hap.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED,
  );
  assert.equal(
    root.toContactState(false),
    api.hap.Characteristic.ContactSensorState.CONTACT_DETECTED,
  );

  assert.equal(
    event.toContactState(true),
    api.hap.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED,
  );
  assert.equal(
    event.toContactState(false),
    api.hap.Characteristic.ContactSensorState.CONTACT_DETECTED,
  );

  assert.equal(
    notification.toContactState(true),
    api.hap.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED,
  );
  assert.equal(
    notification.toContactState(false),
    api.hap.Characteristic.ContactSensorState.CONTACT_DETECTED,
  );
});

test('calendar engine logs INFO event delta only when delta exists', async () => {
  const scheduler = createFakeScheduler();
  const sink = createLogSink();
  const now = Date.parse('2026-02-15T12:00:00Z');
  const events = [{
    summary: 'Meeting',
    startMs: now - 30 * 60 * 1000,
    endMs: now + 30 * 60 * 1000,
  }];

  const engine = new CalendarEngine(
    sink.logger,
    {
      name: 'Developer',
      url: 'https://example.invalid/ics',
      updateIntervalMinutes: 60,
      requestTimeoutSeconds: 15,
      updateButton: false,
      triggerOnUpdates: false,
      triggerOnAnyEvent: true,
      events: [],
    },
    {
      listEvents: async () => events,
    },
    () => now,
    scheduler,
  );

  await engine.refreshNow();
  await engine.refreshNow();

  const deltaLogs = sink.info.filter((args) => args[0] === '[Calendar:%s] Event delta: %s');
  assert.equal(deltaLogs.length, 1);
});

test('calendar engine logs INFO when notifications fire', async () => {
  const scheduler = createFakeScheduler();
  const sink = createLogSink();
  const start = Date.parse('2026-02-15T12:00:00Z');
  const now = start - (4 * 60 * 1000);

  const engine = new CalendarEngine(
    sink.logger,
    {
      name: 'Developer',
      url: 'https://example.invalid/ics',
      updateIntervalMinutes: 60,
      requestTimeoutSeconds: 15,
      updateButton: false,
      triggerOnUpdates: false,
      triggerOnAnyEvent: false,
      events: [{
        name: '^Meeting$',
        triggerOnUpdates: false,
        notifications: [{ name: 'PreStart', startOffsetMinutes: -5 }],
      }],
    },
    {
      listEvents: async () => [{
        summary: 'Meeting',
        startMs: start,
        endMs: start + 60 * 60 * 1000,
      }],
    },
    () => now,
    scheduler,
  );

  await engine.refreshNow();
  assert.equal(
    sink.info.some((args) => args[0] === '[Calendar:%s] Notifications fired: %d' && args[1] === 'Developer' && args[2] === 1),
    true,
  );
});
