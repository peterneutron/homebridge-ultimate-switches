'use strict';

const { bindOnGet, bindOnSet } = require('../hapBinding');
const { runShellCommand } = require('../commandExecutor');
const { formatBoolState, logTransition } = require('../logger');

class CommandSwitchAccessory {
  constructor(api, log, accessory, options, coordinator, executor = runShellCommand, timers = {}, randomFn = Math.random) {
    this.api = api;
    this.log = log;
    this.accessory = accessory;
    this.options = options;
    this.coordinator = coordinator;
    this.executor = executor;
    this.setTimeoutFn = timers.setTimeout || setTimeout;
    this.clearTimeoutFn = timers.clearTimeout || clearTimeout;
    this.randomFn = randomFn;
    this.state = false;
    this.pollTimer = null;
    this.autoOffTimer = null;
    this.stopped = false;
    this.consecutivePollFailures = 0;
  }

  configure() {
    this.service = this.accessory.getServiceById(this.api.hap.Service.Switch, 'commandSwitch')
      || this.accessory.addService(this.api.hap.Service.Switch, this.options.name, 'commandSwitch');
    this.syncServiceName(this.service, this.options.name);

    const cachedState = typeof this.accessory.context.state === 'boolean'
      ? this.accessory.context.state
      : undefined;
    this.state = cachedState !== undefined ? cachedState : false;
    this.accessory.context.state = this.state;

    const onCharacteristic = this.service.getCharacteristic(this.api.hap.Characteristic.On);
    bindOnGet(onCharacteristic, () => this.state);
    bindOnSet(onCharacteristic, (value) => this.setState(Boolean(value)));

    this.service.updateCharacteristic(this.api.hap.Characteristic.On, this.state);

    if (this.options.polling && this.options.stateCommand) {
      this.startPolling();
    }
  }

  startPolling() {
    this.stopPolling();
    this.consecutivePollFailures = 0;
    this.scheduleNextPoll(0);
  }

  stopPolling() {
    if (this.pollTimer) {
      this.clearTimeoutFn(this.pollTimer);
      this.pollTimer = null;
    }
  }

  clearAutoOffTimer() {
    if (this.autoOffTimer) {
      this.clearTimeoutFn(this.autoOffTimer);
      this.autoOffTimer = null;
    }
  }

  scheduleAutoOff() {
    if (!Number.isFinite(Number(this.options.autoOffSeconds)) || Number(this.options.autoOffSeconds) <= 0) {
      return;
    }
    if (this.autoOffTimer) {
      this.log.debug('[CommandSwitch:%s] Replacing existing auto-off timer', this.options.name);
    }
    this.clearAutoOffTimer();
    const delaySeconds = Number(this.options.autoOffSeconds);
    const delayMs = delaySeconds * 1000;
    this.log.info('[CommandSwitch:%s] Auto-off scheduled in %ds', this.options.name, delaySeconds);
    this.autoOffTimer = this.setTimeoutFn(() => {
      this.autoOffTimer = null;
      void this.setState(false, 'auto-off').catch((error) => {
        this.log.warn('[CommandSwitch:%s] Auto-off failed: %s', this.options.name, error.message);
      });
    }, delayMs);
  }

  scheduleNextPoll(delayMs) {
    if (this.stopped) {
      return;
    }
    this.stopPolling();
    this.pollTimer = this.setTimeoutFn(() => {
      void this.pollOnceAndReschedule();
    }, delayMs);
  }

  computeNextPollDelayMs() {
    const baseDelay = Math.max(1000, this.options.pollIntervalSeconds * 1000);
    if (this.consecutivePollFailures <= 0) {
      return baseDelay;
    }
    const multiplier = Math.min(2 ** this.consecutivePollFailures, 6);
    const capped = Math.min(baseDelay * multiplier, Math.min(baseDelay * 6, 120000));
    const jitter = ((this.randomFn() * 0.4) - 0.2) * capped;
    return Math.max(1000, Math.round(capped + jitter));
  }

  async pollOnceAndReschedule() {
    const startedAt = Date.now();
    try {
      await this.pollState();
      this.consecutivePollFailures = 0;
      this.log.debug('[CommandSwitch:%s] Poll succeeded in %dms', this.options.name, Date.now() - startedAt);
    } catch (error) {
      this.consecutivePollFailures += 1;
      this.log.debug('[CommandSwitch:%s] Poll failed: %s', this.options.name, error.message);
    } finally {
      if (!this.stopped) {
        const nextDelay = this.computeNextPollDelayMs();
        this.log.debug(
          '[CommandSwitch:%s] Next poll in %dms (failures=%d)',
          this.options.name,
          nextDelay,
          this.consecutivePollFailures,
        );
        this.scheduleNextPoll(nextDelay);
      }
    }
  }

  async executeCommandWithDebug(command, timeoutSeconds, source) {
    const startedAt = Date.now();
    try {
      await this.executor(command, timeoutSeconds);
      this.log.debug(
        '[CommandSwitch:%s] Command succeeded (%s) in %dms (timeout=%ss)',
        this.options.name,
        source,
        Date.now() - startedAt,
        timeoutSeconds,
      );
    } catch (error) {
      this.log.debug(
        '[CommandSwitch:%s] Command failed (%s) in %dms (timeout=%ss): %s',
        this.options.name,
        source,
        Date.now() - startedAt,
        timeoutSeconds,
        error.message,
      );
      throw error;
    }
  }

  async setState(targetState, source = 'manual') {
    if (this.stopped) {
      return;
    }

    await this.coordinator.run(this.accessory.UUID, async () => {
      const command = targetState ? this.options.onCommand : this.options.offCommand;
      if (targetState || command) {
        await this.executeCommandWithDebug(command, this.options.commandTimeoutSeconds, source);
      }
      if (!targetState && source !== 'auto-off' && this.autoOffTimer) {
        this.log.info('[CommandSwitch:%s] Auto-off cancelled', this.options.name);
      }
      this.updateState(targetState, source);
      if (targetState) {
        this.scheduleAutoOff();
      } else {
        this.clearAutoOffTimer();
      }
    }, {
      timeoutMs: (this.options.commandTimeoutSeconds * 1000) + 2000,
    });
  }

  async pollState() {
    if (!this.options.stateCommand || this.stopped) {
      return;
    }

    await this.coordinator.run(this.accessory.UUID, async () => {
      let nextState = false;
      try {
        await this.executeCommandWithDebug(this.options.stateCommand, this.options.commandTimeoutSeconds, 'poll');
        nextState = true;
      } catch (error) {
        nextState = false;
      }

      this.updateState(nextState, 'poll');
    }, {
      timeoutMs: (this.options.commandTimeoutSeconds * 1000) + 2000,
    });
  }

  updateState(value, source) {
    if (this.state === value) {
      return;
    }

    const previous = this.state;
    this.state = value;
    this.accessory.context.state = value;
    this.service.updateCharacteristic(this.api.hap.Characteristic.On, value);
    const reason = source === 'poll' ? 'poll' : (source === 'auto-off' ? 'auto-off' : 'manual');
    logTransition(
      this.log,
      'CommandSwitch',
      this.options.name,
      formatBoolState('switch', previous),
      formatBoolState('switch', value),
      reason,
    );
    this.log.debug('[CommandSwitch:%s] State -> %s (%s)', this.options.name, value, source);
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
    this.stopPolling();
    this.clearAutoOffTimer();
  }
}

module.exports = {
  CommandSwitchAccessory,
};
