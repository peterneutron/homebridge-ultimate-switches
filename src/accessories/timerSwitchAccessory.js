'use strict';

const { bindOnGet, bindOnSet } = require('../hapBinding');
const { formatBoolState, logTransition } = require('../logger');

class TimerSwitchAccessory {
  constructor(api, log, accessory, options, coordinator, timers = {}) {
    this.api = api;
    this.log = log;
    this.accessory = accessory;
    this.options = options;
    this.coordinator = coordinator;

    this.setTimeoutFn = timers.setTimeout || setTimeout;
    this.clearTimeoutFn = timers.clearTimeout || clearTimeout;

    this.state = false;
    this.timerHandle = null;
    this.pulseHandle = null;
    this.stopped = false;
  }

  configure() {
    this.switchService = this.accessory.getServiceById(this.api.hap.Service.Switch, 'timerSwitch')
      || this.accessory.addService(this.api.hap.Service.Switch, this.options.name, 'timerSwitch');
    this.syncServiceName(this.switchService, this.options.name);

    if (this.options.emitMotionPulse) {
      this.motionService = this.accessory.getServiceById(this.api.hap.Service.MotionSensor, 'timerMotion')
        || this.accessory.addService(this.api.hap.Service.MotionSensor, `${this.options.name} Pulse`, 'timerMotion');
      this.syncServiceName(this.motionService, `${this.options.name} Pulse`);
      this.motionService.updateCharacteristic(this.api.hap.Characteristic.MotionDetected, false);
    } else {
      const existingMotion = this.accessory.getServiceById(this.api.hap.Service.MotionSensor, 'timerMotion');
      if (existingMotion) {
        this.accessory.removeService(existingMotion);
      }
      this.motionService = null;
    }

    const cachedState = typeof this.accessory.context.state === 'boolean'
      ? this.accessory.context.state
      : undefined;

    this.state = cachedState !== undefined ? cachedState : false;
    this.accessory.context.state = this.state;

    const onCharacteristic = this.switchService.getCharacteristic(this.api.hap.Characteristic.On);
    bindOnGet(onCharacteristic, () => this.state);
    bindOnSet(onCharacteristic, (value) => this.setState(Boolean(value)));

    this.switchService.updateCharacteristic(this.api.hap.Characteristic.On, this.state);

    if (this.state) {
      this.scheduleNextCycle();
    }
  }

  async setState(value, source = 'manual') {
    if (this.stopped) {
      return;
    }

    await this.coordinator.run(this.accessory.UUID, async () => {
      if (value === this.state && value === false) {
        return;
      }

      const previous = this.state;
      this.state = value;
      this.accessory.context.state = value;
      this.switchService.updateCharacteristic(this.api.hap.Characteristic.On, value);

      if (value) {
        this.scheduleNextCycle();
      } else {
        this.clearCycleTimer();
      }

      logTransition(
        this.log,
        'Timer',
        this.options.name,
        formatBoolState('timer', previous),
        formatBoolState('timer', value),
        source,
      );
      this.log.debug('[Timer:%s] State set to %s', this.options.name, value);
    });
  }

  scheduleNextCycle() {
    this.clearCycleTimer();
    const nextAt = Date.now() + (this.options.periodSeconds * 1000);
    this.log.debug('[Timer:%s] Next cycle in %ds at %s', this.options.name, this.options.periodSeconds, new Date(nextAt).toISOString());
    this.timerHandle = this.setTimeoutFn(() => {
      this.handleCycle().catch((error) => {
        this.log.debug('[Timer:%s] Cycle failed: %s', this.options.name, error.message);
      });
    }, this.options.periodSeconds * 1000);
  }

  clearCycleTimer() {
    if (this.timerHandle) {
      this.clearTimeoutFn(this.timerHandle);
      this.timerHandle = null;
    }
  }

  clearPulseTimer() {
    if (this.pulseHandle) {
      this.clearTimeoutFn(this.pulseHandle);
      this.pulseHandle = null;
    }
  }

  async handleCycle() {
    if (this.stopped) {
      return;
    }

    await this.coordinator.run(this.accessory.UUID, async () => {
      this.timerHandle = null;
      if (!this.state) {
        return;
      }

      if (this.options.emitMotionPulse && this.motionService) {
        this.emitMotionPulse();
      }

      if (this.options.autoOff) {
        const previous = this.state;
        this.state = false;
        this.accessory.context.state = false;
        this.switchService.updateCharacteristic(this.api.hap.Characteristic.On, false);
        logTransition(
          this.log,
          'Timer',
          this.options.name,
          formatBoolState('timer', previous),
          formatBoolState('timer', false),
          'timer-cycle',
        );
      } else {
        this.scheduleNextCycle();
      }
    });
  }

  emitMotionPulse() {
    this.log.debug('[Timer:%s] Motion pulse emitted', this.options.name);
    this.motionService.updateCharacteristic(this.api.hap.Characteristic.MotionDetected, true);
    this.clearPulseTimer();
    this.pulseHandle = this.setTimeoutFn(() => {
      if (this.motionService) {
        this.motionService.updateCharacteristic(this.api.hap.Characteristic.MotionDetected, false);
      }
      this.log.debug('[Timer:%s] Motion pulse reset', this.options.name);
      this.pulseHandle = null;
    }, 1000);
  }

  stop() {
    this.stopped = true;
    this.clearCycleTimer();
    this.clearPulseTimer();
  }

  syncServiceName(service, name) {
    if (!service || typeof name !== 'string' || name.trim() === '') {
      return;
    }
    service.displayName = name;
    if (typeof service.setCharacteristic === 'function') {
      try {
        service.setCharacteristic(this.api.hap.Characteristic.Name, name);
      } catch (_error) {
        // Optional characteristic; ignore.
      }
    }
  }
}

module.exports = {
  TimerSwitchAccessory,
};
