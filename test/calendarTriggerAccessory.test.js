'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { CalendarTriggerAccessory } = require('../src/accessories/calendarTriggerAccessory');
const { OperationCoordinator } = require('../src/execution');

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
    count() {
      return tasks.size;
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

test('calendar trigger refresh updates main and event progress states', async () => {
  const api = createMockApi();
  const accessory = createMockAccessory();
  const scheduler = createFakeScheduler();

  const now = Date.parse('2026-02-15T12:00:00Z');

  const provider = {
    listEvents: async () => [{
      summary: 'Heating Season',
      startMs: now - 30 * 60 * 1000,
      endMs: now + 30 * 60 * 1000,
    }],
  };

  const instance = new CalendarTriggerAccessory(
    api,
    logger(),
    accessory,
    {
      name: 'Cal',
      url: 'https://example.invalid/ics',
      updateIntervalMinutes: 60,
      updateButton: false,
      triggerOnUpdates: false,
      triggerOnAnyEvent: false,
      events: [{ name: 'Heating', triggerOnUpdates: false, notifications: [] }],
    },
    new OperationCoordinator(),
    provider,
    () => now,
    scheduler,
  );

  instance.configure();
  await instance.refresh();

  const mainService = accessory.getServiceById(api.hap.Service.ContactSensor, 'calendar-main');
  assert.equal(
    mainService.values.get(api.hap.Characteristic.ContactSensorState),
    api.hap.Characteristic.ContactSensorState.CONTACT_DETECTED,
  );

  const eventService = accessory.getServiceById(api.hap.Service.ContactSensor, 'calendar-event-0');
  assert.equal(
    eventService.values.get(api.hap.Characteristic.ContactSensorState),
    api.hap.Characteristic.ContactSensorState.CONTACT_DETECTED,
  );

  const progressService = accessory.getServiceById(api.hap.Service.LightSensor, 'calendar-progress-0');
  assert.equal(progressService.values.get(api.hap.Characteristic.CurrentAmbientLightLevel), 50);

  instance.stop();
});

test('calendar notification triggers pulse and resets after timeout', async () => {
  const api = createMockApi();
  const accessory = createMockAccessory();
  const scheduler = createFakeScheduler();

  const start = Date.parse('2026-02-15T12:00:00Z');
  let now = start;

  const provider = {
    listEvents: async () => [{
      summary: 'Meeting',
      startMs: start,
      endMs: start + 60 * 60 * 1000,
    }],
  };

  const instance = new CalendarTriggerAccessory(
    api,
    logger(),
    accessory,
    {
      name: 'Cal',
      url: 'https://example.invalid/ics',
      updateIntervalMinutes: 60,
      updateButton: false,
      triggerOnUpdates: false,
      triggerOnAnyEvent: false,
      events: [{
        name: 'Meeting',
        triggerOnUpdates: false,
        notifications: [{ name: 'Ping', startOffsetMinutes: 0 }],
      }],
    },
    new OperationCoordinator(),
    provider,
    () => now,
    scheduler,
  );

  instance.configure();

  // First refresh primes lastPoll window.
  await instance.refresh();

  // Advance beyond start boundary so notification should fire once.
  now = start + 60_000;
  await instance.refresh();

  const notificationService = accessory.getServiceById(api.hap.Service.ContactSensor, 'calendar-notification-0-0');
  assert.equal(
    notificationService.values.get(api.hap.Characteristic.ContactSensorState),
    api.hap.Characteristic.ContactSensorState.CONTACT_DETECTED,
  );

  const pulseId = Math.max(...scheduler.ids());
  scheduler.run(pulseId);

  assert.equal(
    notificationService.values.get(api.hap.Characteristic.ContactSensorState),
    api.hap.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED,
  );

  instance.stop();
});

test('calendar service names are reconciled on reused cached services', async () => {
  const api = createMockApi();
  const accessory = createMockAccessory();
  const scheduler = createFakeScheduler();

  const now = Date.parse('2026-02-15T12:00:00Z');
  const provider = {
    listEvents: async () => [],
  };

  const initial = new CalendarTriggerAccessory(
    api,
    logger(),
    accessory,
    {
      name: 'Developer',
      url: 'https://example.invalid/ics',
      updateIntervalMinutes: 60,
      updateButton: true,
      triggerOnUpdates: false,
      triggerOnAnyEvent: false,
      events: [{
        name: '^Old$',
        triggerOnUpdates: true,
        notifications: [{ name: 'Old Notification', startOffsetMinutes: 0, endOffsetMinutes: 0 }],
      }],
    },
    new OperationCoordinator(),
    provider,
    () => now,
    scheduler,
  );

  initial.configure();
  initial.stop();

  const updated = new CalendarTriggerAccessory(
    api,
    logger(),
    accessory,
    {
      name: 'Developer',
      url: 'https://example.invalid/ics',
      updateIntervalMinutes: 60,
      updateButton: true,
      triggerOnUpdates: false,
      triggerOnAnyEvent: false,
      events: [{
        name: '^(KF|KT)$',
        triggerOnUpdates: true,
        notifications: [{ name: 'LOL', startOffsetMinutes: 0, endOffsetMinutes: 0 }],
      }],
    },
    new OperationCoordinator(),
    provider,
    () => now,
    scheduler,
  );

  updated.configure();

  const eventService = accessory.getServiceById(api.hap.Service.ContactSensor, 'calendar-event-0');
  const notifService = accessory.getServiceById(api.hap.Service.ContactSensor, 'calendar-notification-0-0');
  assert.equal(eventService.displayName, 'Developer ^(KF|KT)$');
  assert.equal(notifService.displayName, 'Developer LOL');

  updated.stop();
});
