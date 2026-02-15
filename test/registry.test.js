'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildDescriptors } = require('../src/registry');


test('buildDescriptors generates entries for each configured group', () => {
  const descriptors = buildDescriptors({
    commandSwitches: [{ name: 'Cmd' }],
    switches: [{ name: 'Switch' }],
    timers: [{ name: 'Timer' }],
    locks: [{ name: 'Lock' }],
    securitySystems: [{ name: 'Security' }],
    calendarTriggers: [{ name: 'Calendar' }],
    contextSensor: { enabled: true, name: 'Context' },
  });

  const kinds = descriptors.map((item) => item.kind);
  assert.deepEqual(kinds, [
    'commandSwitch',
    'switch',
    'timer',
    'lock',
    'security',
    'calendar',
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
