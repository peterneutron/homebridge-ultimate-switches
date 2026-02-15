'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createLogger } = require('../src/logger');

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
