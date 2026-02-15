'use strict';

const { bindOnGet, bindOnSet } = require('../hapBinding');
const { runShellCommand } = require('../commandExecutor');

class CommandSwitchAccessory {
  constructor(api, log, accessory, options, coordinator, executor = runShellCommand) {
    this.api = api;
    this.log = log;
    this.accessory = accessory;
    this.options = options;
    this.coordinator = coordinator;
    this.executor = executor;
    this.state = false;
    this.pollTimer = null;
    this.stopped = false;
  }

  configure() {
    this.service = this.accessory.getService(this.api.hap.Service.Switch)
      || this.accessory.addService(this.api.hap.Service.Switch, this.options.name, 'commandSwitch');

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
    const intervalMs = this.options.pollIntervalSeconds * 1000;
    this.pollTimer = setInterval(() => {
      this.pollState().catch((error) => {
        this.log.debug('[CommandSwitch:%s] Poll failed: %s', this.options.name, error.message);
      });
    }, intervalMs);

    this.pollState().catch((error) => {
      this.log.debug('[CommandSwitch:%s] Initial poll failed: %s', this.options.name, error.message);
    });
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
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

  stop() {
    this.stopped = true;
    this.stopPolling();
  }
}

module.exports = {
  CommandSwitchAccessory,
};
