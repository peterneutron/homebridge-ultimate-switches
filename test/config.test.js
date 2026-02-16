'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeConfig, ValidationError } = require('../src/config');

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
      triggerOnAnyEvent: true,
      requestTimeoutSeconds: 999,
    }],
  });

  assert.equal(config.commandSwitches[0].pollIntervalSeconds, 300);
  assert.equal(config.commandSwitches[0].commandTimeoutSeconds, 1);
  assert.equal(config.timers[0].periodSeconds, 1);
  assert.equal(config.calendarTriggers[0].requestTimeoutSeconds, 120);
});

test('normalizeConfig accepts command switch without offCommand and defaults timeout to 5', () => {
  const config = normalizeConfig({
    commandSwitches: [{
      name: 'Trigger',
      onCommand: 'echo on',
      polling: false,
    }],
  });

  assert.equal(config.commandSwitches[0].offCommand, undefined);
  assert.equal(config.commandSwitches[0].commandTimeoutSeconds, 5);
});

test('normalizeConfig throws when polling command switch has no state command', () => {
  assert.throws(() => normalizeConfig({
    commandSwitches: [{
      name: 'Broken',
      onCommand: 'echo on',
      polling: true,
    }],
  }), ValidationError);
});

test('normalizeConfig accepts and clamps autoOffSeconds for command switches', () => {
  const config = normalizeConfig({
    commandSwitches: [{
      name: 'AutoOff',
      onCommand: 'echo on',
      autoOffSeconds: 999999,
    }],
  });

  assert.equal(config.commandSwitches[0].autoOffSeconds, 86400);
});

test('normalizeConfig throws when context sensor enabled without latitude', () => {
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

test('normalizeConfig accepts enabled context sensor with latitude only', () => {
  const config = normalizeConfig({
    contextSensor: {
      enabled: true,
      name: 'Ctx',
      latitude: 52.52,
      refreshIntervalSeconds: 60,
    },
  });

  assert.equal(config.contextSensor.enabled, true);
  assert.equal(config.contextSensor.latitude, 52.52);
  assert.equal(config.contextSensor.longitude, undefined);
});

test('normalizeConfig rejects duplicate names per group', () => {
  assert.throws(() => normalizeConfig({
    switches: [
      { name: 'Lamp' },
      { name: 'lamp' },
    ],
  }), ValidationError);
});

test('normalizeConfig throws on partial rows instead of pruning', () => {
  assert.throws(() => normalizeConfig({
    commandSwitches: [{
      polling: false,
      pollIntervalSeconds: 5,
      commandTimeoutSeconds: 2,
    }],
  }), ValidationError);

  assert.throws(() => normalizeConfig({
    switches: [{
      defaultOn: false,
      persistState: false,
    }],
  }), ValidationError);

  assert.throws(() => normalizeConfig({
    calendarTriggers: [{
      name: 'Cal',
      url: 'https://example.invalid/test.ics',
      triggerOnAnyEvent: true,
      events: [{
        triggerOnUpdates: true,
      }],
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

test('normalizeConfig requires watched events when triggerOnAnyEvent is false', () => {
  assert.throws(() => normalizeConfig({
    calendarTriggers: [{
      name: 'Cal',
      url: 'https://example.invalid/test.ics',
      triggerOnAnyEvent: false,
      events: [],
    }],
  }), ValidationError);
});

test('normalizeConfig accepts watched events when triggerOnAnyEvent is false', () => {
  const config = normalizeConfig({
    calendarTriggers: [{
      name: 'Cal',
      url: 'https://example.invalid/test.ics',
      triggerOnAnyEvent: false,
      events: [{
        name: '^Meeting',
      }],
    }],
  });

  assert.equal(config.calendarTriggers.length, 1);
  assert.equal(config.calendarTriggers[0].events.length, 1);
  assert.equal(config.calendarTriggers[0].events[0].name, '^Meeting');
});

test('normalizeConfig allows empty watched events when triggerOnAnyEvent is true', () => {
  const config = normalizeConfig({
    calendarTriggers: [{
      name: 'Cal',
      url: 'https://example.invalid/test.ics',
      triggerOnAnyEvent: true,
      events: [],
    }],
  });

  assert.equal(config.calendarTriggers.length, 1);
  assert.equal(config.calendarTriggers[0].triggerOnAnyEvent, true);
  assert.equal(config.calendarTriggers[0].events.length, 0);
});
