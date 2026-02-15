'use strict';

function bindOnGet(characteristic, getter) {
  if (typeof characteristic.removeAllListeners === 'function') {
    characteristic.removeAllListeners('get');
  }

  if (typeof characteristic.onGet === 'function') {
    characteristic.onGet(() => getter());
  } else {
    characteristic.on('get', (callback) => {
      Promise.resolve()
        .then(() => getter())
        .then((value) => callback(null, value))
        .catch((error) => callback(error));
    });
  }

  return characteristic;
}

function bindOnSet(characteristic, setter) {
  if (typeof characteristic.removeAllListeners === 'function') {
    characteristic.removeAllListeners('set');
  }

  if (typeof characteristic.onSet === 'function') {
    characteristic.onSet((value) => setter(value));
  } else {
    characteristic.on('set', (value, callback) => {
      Promise.resolve()
        .then(() => setter(value))
        .then(() => callback())
        .catch((error) => callback(error));
    });
  }

  return characteristic;
}

module.exports = {
  bindOnGet,
  bindOnSet,
};
