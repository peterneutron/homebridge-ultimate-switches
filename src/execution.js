'use strict';

class OperationCoordinator {
  constructor(defaultTimeoutMs = 30000) {
    this._chains = new Map();
    this.defaultTimeoutMs = defaultTimeoutMs;
  }

  run(key, operation, options = {}) {
    const previous = this._chains.get(key) || Promise.resolve();
    const timeoutMs = Number.isFinite(options.timeoutMs)
      ? Math.max(1, options.timeoutMs)
      : this.defaultTimeoutMs;

    const runWithTimeout = () => new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          reject(new Error(`Operation timed out after ${timeoutMs}ms for key: ${key}`));
        }
      }, timeoutMs);

      Promise.resolve()
        .then(() => operation())
        .then((value) => {
          if (!done) {
            done = true;
            clearTimeout(timer);
            resolve(value);
          }
        })
        .catch((error) => {
          if (!done) {
            done = true;
            clearTimeout(timer);
            reject(error);
          }
        });
    });

    const next = previous
      .catch(() => undefined)
      .then(() => runWithTimeout());

    this._chains.set(key, next);

    return next.finally(() => {
      if (this._chains.get(key) === next) {
        this._chains.delete(key);
      }
    });
  }
}

module.exports = {
  OperationCoordinator,
};
