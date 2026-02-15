'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { clampProgress, isEventActive, computeProgress, shouldFireNotification } = require('../src/calendarLogic');


test('computeProgress clamps values to HomeKit-safe range', () => {
  assert.equal(clampProgress(-10), 0.0001);
  assert.equal(clampProgress(50.4), 50);
  assert.equal(clampProgress(999), 100);
});


test('isEventActive includes start and excludes end', () => {
  const event = { startMs: 1000, endMs: 2000 };

  assert.equal(isEventActive(event, 1000), true);
  assert.equal(isEventActive(event, 1999), true);
  assert.equal(isEventActive(event, 2000), false);
});


test('computeProgress returns 50 for halfway through event', () => {
  const event = { startMs: 1000, endMs: 3000 };
  assert.equal(computeProgress(event, 2000), 50);
});


test('shouldFireNotification detects start and end boundaries in poll window', () => {
  const event = { startMs: 60_000, endMs: 120_000 };

  assert.equal(
    shouldFireNotification(event, { startOffsetMinutes: -1 }, -1, 65_000),
    true,
  );

  assert.equal(
    shouldFireNotification(event, { endOffsetMinutes: 1 }, 170_000, 181_000),
    true,
  );

  assert.equal(
    shouldFireNotification(event, { startOffsetMinutes: 5 }, 0, 60_000),
    false,
  );
});
