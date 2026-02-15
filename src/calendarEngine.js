'use strict';

const { CalendarProvider } = require('./calendarProvider');
const { computeProgress, isEventActive, shouldFireNotification } = require('./calendarLogic');
const { buildCalendarEventKey, buildCalendarNotificationKey } = require('./calendarKeys');

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

class CalendarEngine {
  constructor(log, calendarConfig, provider = null, clock = () => Date.now(), timers = {}) {
    this.log = log;
    this.config = calendarConfig;
    this.provider = provider || new CalendarProvider(log);
    this.clock = clock;
    this.setTimeoutFn = timers.setTimeout || setTimeout;
    this.clearTimeoutFn = timers.clearTimeout || clearTimeout;

    this.started = false;
    this.stopped = false;
    this.pollTimer = null;
    this.refreshing = false;
    this.queuedRefresh = false;
    this.lastPollMs = null;

    this.mainActive = false;
    this.eventStates = new Map();
    this.notificationStates = new Map();

    this.rootSubscribers = new Set();
    this.eventSubscribers = new Map();
    this.notificationSubscribers = new Map();
    this.pulseTimers = new Map();

    this.eventDefs = this.config.events.map((event) => {
      const eventKey = buildCalendarEventKey(this.config.name, event.name);
      const notifications = event.notifications.map((notification) => {
        const notificationKey = buildCalendarNotificationKey(this.config.name, event.name, notification.name);
        return {
          ...notification,
          notificationKey,
        };
      });

      return {
        ...event,
        regex: safeRegex(event.name, this.log, this.config.name),
        eventKey,
        notifications,
      };
    });
  }

  start() {
    if (this.started || this.stopped) {
      return;
    }
    this.started = true;
    void this.refreshNow().catch((error) => {
      this.log.debug('[Calendar:%s] Initial refresh failed: %s', this.config.name, error.message);
    });
    this.scheduleNextPoll();
  }

  stop() {
    this.stopped = true;
    if (this.pollTimer) {
      this.clearTimeoutFn(this.pollTimer);
      this.pollTimer = null;
    }
    for (const timeout of this.pulseTimers.values()) {
      this.clearTimeoutFn(timeout);
    }
    this.pulseTimers.clear();
  }

  scheduleNextPoll() {
    if (this.stopped) {
      return;
    }
    if (this.pollTimer) {
      this.clearTimeoutFn(this.pollTimer);
    }
    this.pollTimer = this.setTimeoutFn(() => {
      void this.refreshNow()
        .catch((error) => {
          this.log.warn('[Calendar:%s] Poll refresh failed: %s', this.config.name, error.message);
        })
        .finally(() => {
          this.scheduleNextPoll();
        });
    }, this.config.updateIntervalMinutes * 60000);
  }

  async refreshNow() {
    if (this.stopped) {
      return;
    }
    if (this.refreshing) {
      this.queuedRefresh = true;
      return;
    }

    this.refreshing = true;
    try {
      const nowMs = this.clock();
      const previousPollMs = this.lastPollMs ?? (nowMs - (this.config.updateIntervalMinutes * 60000));
      this.lastPollMs = nowMs;

      const events = await this.provider.listEvents(this.config.url, this.config.requestTimeoutSeconds);
      const activeEvents = events.filter((event) => isEventActive(event, nowMs));

      const matchedByDef = this.eventDefs.map((def) => {
        const matches = activeEvents.filter((event) => def.regex.test(event.summary));
        return { def, matches };
      });

      const watchedActiveCount = matchedByDef.reduce((acc, item) => acc + item.matches.length, 0);
      const calendarIsActive = this.config.triggerOnAnyEvent
        ? activeEvents.length > 0
        : watchedActiveCount > 0;

      if (this.config.triggerOnUpdates && calendarIsActive) {
        this.triggerPulse(
          'calendar-main',
          () => this.publishRootState(true),
          () => this.publishRootState(false),
        );
      } else {
        this.publishRootState(calendarIsActive);
      }

      matchedByDef.forEach(({ def, matches }) => {
        const active = matches.length > 0;
        const progress = active ? computeProgress(matches[0], nowMs) : 0.0001;

        if (def.triggerOnUpdates && active) {
          this.triggerPulse(
            def.eventKey,
            () => this.publishEventState(def.eventKey, true, progress),
            () => this.publishEventState(def.eventKey, false, this.getEventState(def.eventKey).progress),
          );
        } else {
          this.publishEventState(def.eventKey, active, progress);
        }

        def.notifications.forEach((notification) => {
          const shouldFire = matches.some((event) => shouldFireNotification(event, notification, previousPollMs, nowMs));
          if (shouldFire) {
            this.triggerPulse(
              notification.notificationKey,
              () => this.publishNotificationState(notification.notificationKey, true),
              () => this.publishNotificationState(notification.notificationKey, false),
            );
          }
        });
      });

      this.log.debug(
        '[Calendar:%s] Refresh complete: %d events, %d active, %d watched',
        this.config.name,
        events.length,
        activeEvents.length,
        watchedActiveCount,
      );
    } finally {
      this.refreshing = false;
      if (this.queuedRefresh) {
        this.queuedRefresh = false;
        await this.refreshNow();
      }
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

  publishRootState(active) {
    this.mainActive = Boolean(active);
    this.rootSubscribers.forEach((listener) => listener(this.mainActive));
  }

  publishEventState(eventKey, active, progress) {
    const next = {
      active: Boolean(active),
      progress: Number.isFinite(progress) ? progress : 0.0001,
    };
    this.eventStates.set(eventKey, next);
    const listeners = this.eventSubscribers.get(eventKey);
    if (listeners) {
      listeners.forEach((listener) => listener(next));
    }
  }

  publishNotificationState(notificationKey, active) {
    const next = Boolean(active);
    this.notificationStates.set(notificationKey, next);
    const listeners = this.notificationSubscribers.get(notificationKey);
    if (listeners) {
      listeners.forEach((listener) => listener(next));
    }
  }

  getRootState() {
    return this.mainActive;
  }

  getEventState(eventKey) {
    return this.eventStates.get(eventKey) || { active: false, progress: 0.0001 };
  }

  getNotificationState(notificationKey) {
    return Boolean(this.notificationStates.get(notificationKey));
  }

  subscribeRoot(listener) {
    this.rootSubscribers.add(listener);
    listener(this.getRootState());
    this.start();
    return () => {
      this.rootSubscribers.delete(listener);
    };
  }

  subscribeEvent(eventKey, listener) {
    if (!this.eventSubscribers.has(eventKey)) {
      this.eventSubscribers.set(eventKey, new Set());
    }
    const listeners = this.eventSubscribers.get(eventKey);
    listeners.add(listener);
    listener(this.getEventState(eventKey));
    this.start();
    return () => {
      listeners.delete(listener);
      if (!listeners.size) {
        this.eventSubscribers.delete(eventKey);
      }
    };
  }

  subscribeNotification(notificationKey, listener) {
    if (!this.notificationSubscribers.has(notificationKey)) {
      this.notificationSubscribers.set(notificationKey, new Set());
    }
    const listeners = this.notificationSubscribers.get(notificationKey);
    listeners.add(listener);
    listener(this.getNotificationState(notificationKey));
    this.start();
    return () => {
      listeners.delete(listener);
      if (!listeners.size) {
        this.notificationSubscribers.delete(notificationKey);
      }
    };
  }
}

module.exports = {
  CalendarEngine,
};
