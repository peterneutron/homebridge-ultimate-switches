'use strict';

function formatBoolState(kind, value) {
  const normalized = Boolean(value);
  if (kind === 'lock') {
    return normalized ? 'LOCKED' : 'UNLOCKED';
  }
  return normalized ? 'ON' : 'OFF';
}

function logTransition(log, scope, name, fromState, toState, source) {
  if (fromState === toState) {
    return false;
  }
  log.info('[%s:%s] State %s -> %s (%s)', scope, name, fromState, toState, source);
  return true;
}

function formatCalendarDelta(added, removed, changed) {
  return `+${added} -${removed} ~${changed}`;
}

function createLogger(baseLog, debugEnabled) {
  const debug = (...args) => {
    if (debugEnabled) {
      baseLog.debug(...args);
    }
  };

  return {
    info: (...args) => baseLog.info(...args),
    warn: (...args) => baseLog.warn(...args),
    error: (...args) => baseLog.error(...args),
    debug,
  };
}

module.exports = {
  createLogger,
  formatBoolState,
  logTransition,
  formatCalendarDelta,
};
