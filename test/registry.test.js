'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildDescriptors } = require('../src/registry');
const { safeEventName } = require('../src/calendarKeys');


test('buildDescriptors generates entries for each configured group', () => {
  const descriptors = buildDescriptors({
    commandSwitches: [{ name: 'Cmd' }],
    switches: [{ name: 'Switch' }],
    timers: [{ name: 'Timer' }],
    locks: [{ name: 'Lock' }],
    securitySystems: [{ name: 'Security' }],
    calendarTriggers: [{
      name: 'Calendar',
      events: [{
        name: '^(KF|KT|GFW|GTW)$',
        notifications: [{ name: 'LOL' }],
      }],
    }],
    contextSensor: { enabled: true, name: 'Context' },
  });

  const kinds = descriptors.map((item) => item.kind);
  assert.deepEqual(kinds, [
    'commandSwitch',
    'switch',
    'timer',
    'lock',
    'security',
    'calendarRoot',
    'calendarEvent',
    'calendarNotification',
    'contextSensor',
  ]);
});


test('buildDescriptors omits context sensor when disabled', () => {
  const descriptors = buildDescriptors({
    commandSwitches: [],
    switches: [],
    timers: [],
    locks: [],
    securitySystems: [],
    calendarTriggers: [],
    contextSensor: { enabled: false, name: 'Context' },
  });

  assert.equal(descriptors.length, 0);
});

test('safeEventName extracts readable tokens from regex', () => {
  assert.equal(safeEventName('^(KF|KT|GFW|GTW)$'), 'KF KT GFW GTW');
});
