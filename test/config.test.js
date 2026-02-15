'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeConfig, ValidationError, getNormalizationMeta } = require('../src/config');


test('normalizeConfig returns defaults for empty input', () => {
  const config = normalizeConfig({});

  assert.equal(config.name, 'Ultimate Switches');
  assert.equal(config.debug, false);
  assert.deepEqual(config.commandSwitches, []);
  assert.equal(config.contextSensor.enabled, false);
  assert.equal(config.contextSensor.refreshIntervalSeconds, 60);
});


test('normalizeConfig clamps timer and command numeric ranges', () => {
  const config = normalizeConfig({
    commandSwitches: [{
      name: 'Test',
      onCommand: 'echo on',
      offCommand: 'echo off',
      stateCommand: 'echo state',
      polling: true,
      pollIntervalSeconds: 9999,
      commandTimeoutSeconds: 0,
    }],
    timers: [{
      name: 'Timer',
      periodSeconds: -4,
    }],
    calendarTriggers: [{
      name: 'Cal',
      url: 'https://example.invalid/ics',
      requestTimeoutSeconds: 999,
    }],
  });

  assert.equal(config.commandSwitches[0].pollIntervalSeconds, 300);
  assert.equal(config.commandSwitches[0].commandTimeoutSeconds, 1);
  assert.equal(config.timers[0].periodSeconds, 1);
  assert.equal(config.calendarTriggers[0].requestTimeoutSeconds, 120);
});


test('normalizeConfig throws when polling command switch has no state command', () => {
  assert.throws(() => normalizeConfig({
    commandSwitches: [{
      name: 'Broken',
      onCommand: 'echo on',
      offCommand: 'echo off',
      polling: true,
    }],
  }), ValidationError);
});


test('normalizeConfig throws when context sensor enabled without coordinates', () => {
  assert.throws(() => normalizeConfig({
    contextSensor: {
      enabled: true,
      name: 'Ctx',
    },
  }), ValidationError);
});


test('normalizeConfig accepts enabled context sensor with coordinates', () => {
  const config = normalizeConfig({
    contextSensor: {
      enabled: true,
      name: 'Ctx',
      latitude: 52.52,
      longitude: 13.405,
      refreshIntervalSeconds: 5,
    },
  });

  assert.equal(config.contextSensor.enabled, true);
  assert.equal(config.contextSensor.latitude, 52.52);
  assert.equal(config.contextSensor.longitude, 13.405);
  assert.equal(config.contextSensor.refreshIntervalSeconds, 30);
});


test('normalizeConfig rejects duplicate names per group', () => {
  assert.throws(() => normalizeConfig({
    switches: [
      { name: 'Lamp' },
      { name: 'lamp' },
    ],
  }), ValidationError);
});

test('normalizeConfig prunes blank placeholder rows and reports prune counters', () => {
  const config = normalizeConfig({
    commandSwitches: [{
      polling: false,
      pollIntervalSeconds: 5,
      commandTimeoutSeconds: 2,
    }],
    switches: [{
      defaultOn: false,
      persistState: false,
    }],
    timers: [{
      periodSeconds: 60,
      autoOff: true,
      emitMotionPulse: true,
      persistState: false,
    }],
    locks: [{
      defaultState: 'unlocked',
      persistState: false,
    }],
    securitySystems: [{
      defaultState: 'unarmed',
      zones: ['Alarm'],
      persistState: true,
    }],
    calendarTriggers: [{
      updateIntervalMinutes: 60,
      requestTimeoutSeconds: 15,
      updateButton: true,
      triggerOnUpdates: true,
      triggerOnAnyEvent: false,
    }],
  });

  assert.deepEqual(config.commandSwitches, []);
  assert.deepEqual(config.switches, []);
  assert.deepEqual(config.timers, []);
  assert.deepEqual(config.locks, []);
  assert.deepEqual(config.securitySystems, []);
  assert.deepEqual(config.calendarTriggers, []);

  const meta = getNormalizationMeta(config);
  assert.equal(meta.pruneCounters.commandSwitches, 1);
  assert.equal(meta.pruneCounters.switches, 1);
  assert.equal(meta.pruneCounters.timers, 1);
  assert.equal(meta.pruneCounters.locks, 1);
  assert.equal(meta.pruneCounters.securitySystems, 1);
  assert.equal(meta.pruneCounters.calendarTriggers, 1);
});

test('normalizeConfig throws on partially configured rows', () => {
  assert.throws(() => normalizeConfig({
    commandSwitches: [{
      name: 'Only Name',
    }],
  }), ValidationError);

  assert.throws(() => normalizeConfig({
    switches: [{
      defaultOn: true,
    }],
  }), ValidationError);
});

test('normalizeConfig rejects legacy command switch metadata keys', () => {
  assert.throws(() => normalizeConfig({
    commandSwitches: [{
      name: 'Cmd',
      onCommand: 'echo on',
      offCommand: 'echo off',
      manufacturer: 'Legacy',
    }],
  }), ValidationError);

  assert.throws(() => normalizeConfig({
    commandSwitches: [{
      name: 'Cmd',
      onCommand: 'echo on',
      offCommand: 'echo off',
      model: 'Legacy',
    }],
  }), ValidationError);

  assert.throws(() => normalizeConfig({
    commandSwitches: [{
      name: 'Cmd',
      onCommand: 'echo on',
      offCommand: 'echo off',
      serialNumber: 'Legacy',
    }],
  }), ValidationError);
});

test('normalizeConfig prunes nested calendar placeholders and fails partial nested rows', () => {
  const config = normalizeConfig({
    calendarTriggers: [{
      name: 'Cal',
      url: 'https://example.invalid/test.ics',
      events: [{
        triggerOnUpdates: true,
      }],
    }],
  });

  assert.equal(config.calendarTriggers[0].events.length, 0);
  const meta = getNormalizationMeta(config);
  assert.equal(meta.pruneCounters.calendarEvents, 1);

  const configWithNestedBlankEvent = normalizeConfig({
    calendarTriggers: [{
      name: 'Cal',
      url: 'https://example.invalid/test.ics',
      events: [{
        notifications: [{
          name: '',
        }],
      }],
    }],
  });

  assert.equal(configWithNestedBlankEvent.calendarTriggers[0].events.length, 0);
  const nestedBlankEventMeta = getNormalizationMeta(configWithNestedBlankEvent);
  assert.equal(nestedBlankEventMeta.pruneCounters.calendarEvents, 1);

  const configWithBlankNotification = normalizeConfig({
    calendarTriggers: [{
      name: 'Cal',
      url: 'https://example.invalid/test.ics',
      events: [{
        name: 'Event',
        notifications: [{
          name: '',
        }],
      }],
    }],
  });

  assert.equal(configWithBlankNotification.calendarTriggers[0].events[0].notifications.length, 0);
  const nestedMeta = getNormalizationMeta(configWithBlankNotification);
  assert.equal(nestedMeta.pruneCounters.notifications, 1);

  assert.throws(() => normalizeConfig({
    calendarTriggers: [{
      name: 'Cal',
      url: 'https://example.invalid/test.ics',
      events: [{
        name: 'Event',
        notifications: [{
          startOffsetMinutes: 5,
        }],
      }],
    }],
  }), ValidationError);
});
