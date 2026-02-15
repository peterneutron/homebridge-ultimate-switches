'use strict';

const { bindOnGet, bindOnSet } = require('../hapBinding');
const { runShellCommand } = require('../commandExecutor');

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
    try {
      await this.pollState();
      this.consecutivePollFailures = 0;
    } catch (error) {
      this.consecutivePollFailures += 1;
      this.log.debug('[CommandSwitch:%s] Poll failed: %s', this.options.name, error.message);
    } finally {
      if (!this.stopped) {
        this.scheduleNextPoll(this.computeNextPollDelayMs());
      }
    }
  }

  async setState(targetState) {
    if (this.stopped) {
      return;
    }

    await this.coordinator.run(this.accessory.UUID, async () => {
      const command = targetState ? this.options.onCommand : this.options.offCommand;
      await this.executor(command, this.options.commandTimeoutSeconds);
      this.updateState(targetState, 'set');
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
        await this.executor(this.options.stateCommand, this.options.commandTimeoutSeconds);
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

    this.state = value;
    this.accessory.context.state = value;
    this.service.updateCharacteristic(this.api.hap.Characteristic.On, value);
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
  }
}

module.exports = {
  CommandSwitchAccessory,
};
