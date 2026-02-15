'use strict';

function buildDescriptors(config) {
  const descriptors = [];

  config.commandSwitches.forEach((item) => {
    descriptors.push({ kind: 'commandSwitch', name: item.name, key: `command:${item.name}` });
  });

  config.switches.forEach((item) => {
    descriptors.push({ kind: 'switch', name: item.name, key: `switch:${item.name}` });
  });

  config.timers.forEach((item) => {
    descriptors.push({ kind: 'timer', name: item.name, key: `timer:${item.name}` });
  });

  config.locks.forEach((item) => {
    descriptors.push({ kind: 'lock', name: item.name, key: `lock:${item.name}` });
  });

  config.securitySystems.forEach((item) => {
    descriptors.push({ kind: 'security', name: item.name, key: `security:${item.name}` });
  });

  config.calendarTriggers.forEach((item) => {
    descriptors.push({ kind: 'calendar', name: item.name, key: `calendar:${item.name}` });
  });

  if (config.contextSensor.enabled) {
    descriptors.push({ kind: 'contextSensor', name: config.contextSensor.name, key: 'contextSensor' });
  }

  return descriptors;
}

class AccessoryRegistry {
  constructor(log) {
    this.log = log;
    this.descriptors = [];
  }

  load(config) {
    this.descriptors = buildDescriptors(config);
    this.log.info('[Registry] Loaded %d planned accessories', this.descriptors.length);
  }

  stats() {
    const countByKind = {};
    this.descriptors.forEach((item) => {
      countByKind[item.kind] = (countByKind[item.kind] || 0) + 1;
    });

    return {
      total: this.descriptors.length,
      byKind: countByKind,
    };
  }
}

module.exports = {
  AccessoryRegistry,
  buildDescriptors,
};
