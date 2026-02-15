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
