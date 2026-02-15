'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { CalendarEngine } = require('../src/calendarEngine');
const { CalendarRootAccessory } = require('../src/accessories/calendarRootAccessory');

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
