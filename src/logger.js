'use strict';

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
};
