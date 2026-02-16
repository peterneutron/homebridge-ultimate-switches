'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createLogger,
  formatBoolState,
  formatCalendarDelta,
  logTransition,
} = require('../src/logger');

function sink() {
  const calls = { info: 0, warn: 0, error: 0, debug: 0 };
  return {
    calls,
    log: {
      info() { calls.info += 1; },
      warn() { calls.warn += 1; },
      error() { calls.error += 1; },
      debug() { calls.debug += 1; },
    },
  };
}

test('createLogger suppresses debug when disabled', () => {
  const s = sink();
  const log = createLogger(s.log, false);

  log.info('x');
  log.warn('x');
  log.error('x');
  log.debug('x');

  assert.equal(s.calls.info, 1);
  assert.equal(s.calls.warn, 1);
  assert.equal(s.calls.error, 1);
  assert.equal(s.calls.debug, 0);
});

test('createLogger forwards debug when enabled', () => {
  const s = sink();
  const log = createLogger(s.log, true);

  log.debug('x');
  assert.equal(s.calls.debug, 1);
});

test('formatBoolState maps default and lock states', () => {
  assert.equal(formatBoolState('switch', true), 'ON');
  assert.equal(formatBoolState('switch', false), 'OFF');
  assert.equal(formatBoolState('lock', true), 'LOCKED');
  assert.equal(formatBoolState('lock', false), 'UNLOCKED');
});

test('logTransition logs only on changes', () => {
  const messages = [];
  const changed = logTransition(
    { info: (...args) => messages.push(args) },
    'Switch',
    'Lamp',
    'OFF',
    'ON',
    'manual',
  );
  const unchanged = logTransition(
    { info: (...args) => messages.push(args) },
    'Switch',
    'Lamp',
    'ON',
    'ON',
    'manual',
  );

  assert.equal(changed, true);
  assert.equal(unchanged, false);
  assert.equal(messages.length, 1);
});

test('formatCalendarDelta returns compact delta summary', () => {
  assert.equal(formatCalendarDelta(3, 1, 2), '+3 -1 ~2');
});
