'use strict';

class OperationCoordinator {
  constructor() {
    this._chains = new Map();
  }

  run(key, operation) {
    const previous = this._chains.get(key) || Promise.resolve();

    const next = previous
      .catch(() => undefined)
      .then(() => operation());

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
