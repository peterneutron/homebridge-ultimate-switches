'use strict';

const { bindOnGet, bindOnSet } = require('../hapBinding');
const { CalendarProvider } = require('../calendarProvider');
const { computeProgress, isEventActive, shouldFireNotification } = require('../calendarLogic');

const PULSE_MS = 10000;

function safeRegex(pattern, log, label) {
  try {
    return new RegExp(pattern);
  } catch (error) {
    log.warn('[Calendar:%s] Invalid regex pattern "%s"; using exact match fallback', label, pattern);
    const escaped = String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escaped}$`);
  }
}

class CalendarTriggerAccessory {
  constructor(api, log, accessory, options, coordinator, provider = null, clock = () => Date.now(), timers = {}) {
    this.api = api;
    this.log = log;
    this.accessory = accessory;
    this.options = options;
    this.coordinator = coordinator;
    this.provider = provider || new CalendarProvider(log);
    this.clock = clock;
    this.setTimeoutFn = timers.setTimeout || setTimeout;
    this.clearTimeoutFn = timers.clearTimeout || clearTimeout;

    this.mainActive = false;
    this.eventStates = new Map();
    this.notificationStates = new Map();
    this.pulseTimers = new Map();
    this.pollTimer = null;
    this.lastPollMs = null;
    this.stopped = false;
  }

  configure() {
    this.mainService = this.ensureService(this.api.hap.Service.ContactSensor, this.options.name, 'calendar-main');
    bindOnGet(
      this.mainService.getCharacteristic(this.api.hap.Characteristic.ContactSensorState),
      () => this.toContactState(this.mainActive),
    );

    if (this.options.updateButton) {
      this.updateSwitch = this.ensureService(this.api.hap.Service.Switch, `${this.options.name} Update`, 'calendar-update');
      bindOnGet(this.updateSwitch.getCharacteristic(this.api.hap.Characteristic.On), () => false);
      bindOnSet(this.updateSwitch.getCharacteristic(this.api.hap.Characteristic.On), async () => {
        await this.refresh();
      });
    } else {
      this.removeServiceIfExists(this.api.hap.Service.Switch, 'calendar-update');
      this.updateSwitch = null;
    }

    this.setupEventAndNotificationServices();

    this.publishMainState(false);
    this.refresh().catch((error) => {
      this.log.debug('[Calendar:%s] Initial refresh failed: %s', this.options.name, error.message);
    });

    this.scheduleNextPoll();
  }

  ensureService(type, name, subtype) {
    return this.accessory.getServiceById(type, subtype)
      || this.accessory.addService(type, name, subtype);
  }

  removeServiceIfExists(type, subtype) {
    const service = this.accessory.getServiceById(type, subtype);
    if (service) {
      this.accessory.removeService(service);
    }
  }

  toContactState(active) {
    return active
      ? this.api.hap.Characteristic.ContactSensorState.CONTACT_DETECTED
      : this.api.hap.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
  }

  setupEventAndNotificationServices() {
    const keepSubtypes = new Set(['calendar-main', 'calendar-update']);
    this.eventDefs = this.options.events.map((event, eventIndex) => {
      const regex = safeRegex(event.name, this.log, this.options.name);
      const eventSub = `calendar-event-${eventIndex}`;
      const progressSub = `calendar-progress-${eventIndex}`;
      keepSubtypes.add(eventSub);
      keepSubtypes.add(progressSub);

      const eventService = this.ensureService(
        this.api.hap.Service.ContactSensor,
        `${this.options.name} ${event.name}`,
        eventSub,
      );
      const progressService = this.ensureService(
        this.api.hap.Service.LightSensor,
        `${this.options.name} ${event.name} Progress`,
        progressSub,
      );

      bindOnGet(
        eventService.getCharacteristic(this.api.hap.Characteristic.ContactSensorState),
        () => this.toContactState(Boolean(this.eventStates.get(eventSub)?.active)),
      );
      bindOnGet(
        progressService.getCharacteristic(this.api.hap.Characteristic.CurrentAmbientLightLevel),
        () => this.eventStates.get(eventSub)?.progress || 0.0001,
      );

      const notifications = event.notifications.map((notification, notificationIndex) => {
        const notifSub = `calendar-notification-${eventIndex}-${notificationIndex}`;
        keepSubtypes.add(notifSub);
        const service = this.ensureService(
          this.api.hap.Service.ContactSensor,
          `${this.options.name} ${notification.name}`,
          notifSub,
        );

        bindOnGet(
          service.getCharacteristic(this.api.hap.Characteristic.ContactSensorState),
          () => this.toContactState(Boolean(this.notificationStates.get(notifSub))),
        );

        return { ...notification, subtype: notifSub, service };
      });

      return {
        ...event,
        regex,
        eventSub,
        eventService,
        progressSub,
        progressService,
        notifications,
      };
    });

    this.accessory.services
      .filter((service) => typeof service.subtype === 'string' && service.subtype.startsWith('calendar-'))
      .forEach((service) => {
        if (!keepSubtypes.has(service.subtype)) {
          this.accessory.removeService(service);
        }
      });
  }

  scheduleNextPoll() {
    if (this.stopped) {
      return;
    }

    if (this.pollTimer) {
      this.clearTimeoutFn(this.pollTimer);
    }

    const delay = this.options.updateIntervalMinutes * 60000;
    this.pollTimer = this.setTimeoutFn(() => {
      this.refresh()
        .catch((error) => {
          this.log.debug('[Calendar:%s] Poll refresh failed: %s', this.options.name, error.message);
        })
        .finally(() => {
          this.scheduleNextPoll();
        });
    }, delay);
  }

  async refresh() {
    if (this.stopped) {
      return;
    }

    await this.coordinator.run(this.accessory.UUID, async () => {
      const nowMs = this.clock();
      const previousPollMs = this.lastPollMs ?? (nowMs - (this.options.updateIntervalMinutes * 60000));
      this.lastPollMs = nowMs;

      const events = await this.provider.listEvents(this.options.url);
      const activeEvents = events.filter((event) => isEventActive(event, nowMs));

      const matchedByDef = this.eventDefs.map((def) => {
        const matches = activeEvents.filter((event) => def.regex.test(event.summary));
        return { def, matches };
      });

      const watchedActiveCount = matchedByDef.reduce((acc, item) => acc + item.matches.length, 0);
      const calendarIsActive = this.options.triggerOnAnyEvent
        ? activeEvents.length > 0
        : watchedActiveCount > 0;

      if (this.options.triggerOnUpdates && calendarIsActive) {
        this.triggerMainPulse();
      } else {
        this.publishMainState(calendarIsActive);
      }

      matchedByDef.forEach(({ def, matches }) => {
        const active = matches.length > 0;
        const progress = active ? computeProgress(matches[0], nowMs) : 0.0001;

        if (def.triggerOnUpdates && active) {
          this.triggerEventPulse(def.eventSub);
        } else {
          this.publishEventState(def.eventSub, active);
        }

        this.publishProgress(def.eventSub, progress);

        def.notifications.forEach((notification) => {
          const shouldFire = matches.some((event) => shouldFireNotification(event, notification, previousPollMs, nowMs));
          if (shouldFire) {
            this.triggerNotificationPulse(notification.subtype);
          }
        });
      });

      this.log.debug('[Calendar:%s] Refresh complete: %d events, %d active, %d watched', this.options.name, events.length, activeEvents.length, watchedActiveCount);
    });
  }

  publishMainState(active) {
    this.mainActive = active;
    this.mainService.updateCharacteristic(this.api.hap.Characteristic.ContactSensorState, this.toContactState(active));
  }

  publishEventState(eventSub, active) {
    const state = this.eventStates.get(eventSub) || { active: false, progress: 0.0001 };
    state.active = active;
    this.eventStates.set(eventSub, state);

    const def = this.eventDefs.find((item) => item.eventSub === eventSub);
    if (def) {
      def.eventService.updateCharacteristic(this.api.hap.Characteristic.ContactSensorState, this.toContactState(active));
    }
  }

  publishProgress(eventSub, progress) {
    const state = this.eventStates.get(eventSub) || { active: false, progress: 0.0001 };
    state.progress = progress;
    this.eventStates.set(eventSub, state);

    const def = this.eventDefs.find((item) => item.eventSub === eventSub);
    if (def) {
      def.progressService.updateCharacteristic(this.api.hap.Characteristic.CurrentAmbientLightLevel, progress);
    }
  }

  triggerPulse(key, activate, deactivate) {
    activate();

    const previous = this.pulseTimers.get(key);
    if (previous) {
      this.clearTimeoutFn(previous);
    }

    const timeout = this.setTimeoutFn(() => {
      deactivate();
      this.pulseTimers.delete(key);
    }, PULSE_MS);

    this.pulseTimers.set(key, timeout);
  }

  triggerMainPulse() {
    this.triggerPulse(
      'calendar-main',
      () => this.publishMainState(true),
      () => this.publishMainState(false),
    );
  }

  triggerEventPulse(eventSub) {
    this.triggerPulse(
      eventSub,
      () => this.publishEventState(eventSub, true),
      () => this.publishEventState(eventSub, false),
    );
  }

  triggerNotificationPulse(subtype) {
    this.triggerPulse(
      subtype,
      () => {
        this.notificationStates.set(subtype, true);
        const service = this.accessory.getServiceById(this.api.hap.Service.ContactSensor, subtype);
        service?.updateCharacteristic(this.api.hap.Characteristic.ContactSensorState, this.toContactState(true));
      },
      () => {
        this.notificationStates.set(subtype, false);
        const service = this.accessory.getServiceById(this.api.hap.Service.ContactSensor, subtype);
        service?.updateCharacteristic(this.api.hap.Characteristic.ContactSensorState, this.toContactState(false));
      },
    );
  }

  stop() {
    this.stopped = true;

    if (this.pollTimer) {
      this.clearTimeoutFn(this.pollTimer);
      this.pollTimer = null;
    }

    this.pulseTimers.forEach((timeout) => this.clearTimeoutFn(timeout));
    this.pulseTimers.clear();
  }
}

module.exports = {
  CalendarTriggerAccessory,
};
