'use strict';

const {
  buildCalendarRootKey,
  buildCalendarEventKey,
  buildCalendarNotificationKey,
  buildCalendarEventDisplayName,
  buildCalendarNotificationDisplayName,
} = require('./calendarKeys');

function buildDescriptors(config) {
  const descriptors = [];

  config.commandSwitches.forEach((item) => {
    descriptors.push({ kind: 'commandSwitch', name: item.name, key: `command:${item.name}`, config: item });
  });

  config.switches.forEach((item) => {
    descriptors.push({ kind: 'switch', name: item.name, key: `switch:${item.name}`, config: item });
  });

  config.timers.forEach((item) => {
    descriptors.push({ kind: 'timer', name: item.name, key: `timer:${item.name}`, config: item });
  });

  config.locks.forEach((item) => {
    descriptors.push({ kind: 'lock', name: item.name, key: `lock:${item.name}`, config: item });
  });

  config.securitySystems.forEach((item) => {
    descriptors.push({ kind: 'security', name: item.name, key: `security:${item.name}`, config: item });
  });

  config.calendarTriggers.forEach((item) => {
    descriptors.push({
      kind: 'calendarRoot',
      name: item.name,
      key: buildCalendarRootKey(item.name),
      config: item,
    });

    item.events.forEach((event) => {
      descriptors.push({
        kind: 'calendarEvent',
        name: buildCalendarEventDisplayName(item.name, event.name),
        key: buildCalendarEventKey(item.name, event.name),
        config: {
          calendar: item,
          event,
        },
      });

      event.notifications.forEach((notification) => {
        descriptors.push({
          kind: 'calendarNotification',
          name: buildCalendarNotificationDisplayName(item.name, event.name, notification.name),
          key: buildCalendarNotificationKey(item.name, event.name, notification.name),
          config: {
            calendar: item,
            event,
            notification,
          },
        });
      });
    });
  });

  if (config.contextSensor.enabled) {
    descriptors.push({ kind: 'contextSensor', name: config.contextSensor.name, key: 'contextSensor', config: config.contextSensor });
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
    this.log.debug('[Registry] Loaded %d planned accessories', this.descriptors.length);
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
