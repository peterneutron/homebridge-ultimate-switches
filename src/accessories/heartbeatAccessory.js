'use strict';

class HeartbeatAccessory {
  constructor(api, log, accessory, options, timers = {}) {
    this.api = api;
    this.log = log;
    this.accessory = accessory;
    this.options = options;
    this.setTimeoutFn = timers.setTimeout || setTimeout;
    this.clearTimeoutFn = timers.clearTimeout || clearTimeout;
    this.nextPulseTimer = null;
    this.pulseOffTimer = null;
    this.stopped = false;
    this.motionDetected = false;
  }

  configure() {
    this.service = this.accessory.getServiceById(this.api.hap.Service.MotionSensor, 'heartbeat')
      || this.accessory.addService(this.api.hap.Service.MotionSensor, this.options.name, 'heartbeat');
    this.syncServiceName(this.service, this.options.name);
    this.setMotion(false);

    if (this.options.enabled === false) {
      this.log.debug('[Heartbeat:%s] Disabled; no pulse schedule created', this.options.name);
      return;
    }

    const initialDelayMs = this.options.startupMode === 'immediate'
      ? 0
      : (this.options.intervalSeconds * 1000);
    this.log.debug(
      '[Heartbeat:%s] Starting (startupMode=%s interval=%ss pulse=%ss firstDelayMs=%d)',
      this.options.name,
      this.options.startupMode,
      this.options.intervalSeconds,
      this.options.pulseDurationSeconds,
      initialDelayMs,
    );
    this.scheduleNextPulse(initialDelayMs);
  }

  scheduleNextPulse(delayMs) {
    if (this.stopped || this.options.enabled === false) {
      return;
    }
    if (this.nextPulseTimer) {
      this.clearTimeoutFn(this.nextPulseTimer);
      this.nextPulseTimer = null;
    }
    this.log.debug('[Heartbeat:%s] Next pulse in %dms', this.options.name, delayMs);
    this.nextPulseTimer = this.setTimeoutFn(() => {
      this.nextPulseTimer = null;
      this.firePulse();
    }, delayMs);
  }

  firePulse() {
    if (this.stopped || this.options.enabled === false) {
      return;
    }
    this.log.debug('[Heartbeat:%s] Pulse start', this.options.name);
    this.setMotion(true);
    this.schedulePulseOff(this.options.pulseDurationSeconds * 1000);
    this.scheduleNextPulse(this.options.intervalSeconds * 1000);
  }

  schedulePulseOff(delayMs) {
    if (this.pulseOffTimer) {
      this.clearTimeoutFn(this.pulseOffTimer);
      this.pulseOffTimer = null;
    }
    this.pulseOffTimer = this.setTimeoutFn(() => {
      this.pulseOffTimer = null;
      this.log.debug('[Heartbeat:%s] Pulse end', this.options.name);
      this.setMotion(false);
    }, delayMs);
  }

  setMotion(value) {
    this.motionDetected = Boolean(value);
    this.service.updateCharacteristic(this.api.hap.Characteristic.MotionDetected, this.motionDetected);
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

  stop() {
    this.stopped = true;
    if (this.nextPulseTimer) {
      this.clearTimeoutFn(this.nextPulseTimer);
      this.nextPulseTimer = null;
    }
    if (this.pulseOffTimer) {
      this.clearTimeoutFn(this.pulseOffTimer);
      this.pulseOffTimer = null;
    }
    if (this.service) {
      this.setMotion(false);
    }
    this.log.debug('[Heartbeat:%s] Stopped', this.options.name);
  }
}

module.exports = {
  HeartbeatAccessory,
};
