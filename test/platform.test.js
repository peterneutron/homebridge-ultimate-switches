'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { UltimateSwitchesPlatform } = require('../src/platform');

function createBaseLog() {
  const warnings = [];
  return {
    warnings,
    log: {
      info() {},
      error() {},
      debug() {},
      warn(format, ...args) {
        warnings.push({ format, args });
      },
    },
  };
}

test('platform warns once per group when blank placeholders are pruned', () => {
  const sink = createBaseLog();
  new UltimateSwitchesPlatform(sink.log, {
    commandSwitches: [{ polling: false, pollIntervalSeconds: 5, commandTimeoutSeconds: 2 }],
    switches: [{ defaultOn: false, persistState: false }],
    calendarTriggers: [{ updateIntervalMinutes: 60, requestTimeoutSeconds: 15 }],
  });

  assert.equal(sink.warnings.length, 3);
  assert.equal(sink.warnings[0].format, '[Config] Pruned %d blank placeholder row(s) from %s');
  assert.deepEqual(sink.warnings[0].args, [1, 'commandSwitches']);
  assert.deepEqual(sink.warnings[1].args, [1, 'switches']);
  assert.deepEqual(sink.warnings[2].args, [1, 'calendarTriggers']);
});

test('platform does not warn when no placeholder rows are pruned', () => {
  const sink = createBaseLog();
  new UltimateSwitchesPlatform(sink.log, {
    commandSwitches: [{
      name: 'Cmd',
      onCommand: 'echo on',
      offCommand: 'echo off',
    }],
  });

  assert.equal(sink.warnings.length, 0);
});
