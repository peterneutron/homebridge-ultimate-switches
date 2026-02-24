'use strict';

const { bindOnGet, bindOnSet } = require('../hapBinding');
const { runShellCommand, runWebhookRequest } = require('../commandExecutor');
const { formatBoolState, logTransition } = require('../logger');
const { compileRegexOrThrow, testRegexMatch } = require('../regexUtils');

class CommandSwitchAccessory {
  constructor(api, log, accessory, options, coordinator, executorOrExecutors = runShellCommand, timers = {}, randomFn = Math.random) {
    this.api = api;
    this.log = log;
    this.accessory = accessory;
    this.options = options;
    this.coordinator = coordinator;
    if (typeof executorOrExecutors === 'function') {
      this.commandExecutor = executorOrExecutors;
      this.webhookExecutor = runWebhookRequest;
    } else {
      const executors = executorOrExecutors && typeof executorOrExecutors === 'object' ? executorOrExecutors : {};
      this.commandExecutor = typeof executors.runCommand === 'function' ? executors.runCommand : runShellCommand;
      this.webhookExecutor = typeof executors.runWebhook === 'function' ? executors.runWebhook : runWebhookRequest;
    }
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

    if (this.options.polling && this.getAction('status')) {
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

  getAction(name) {
    if (this.options?.actions && this.options.actions[name]) {
      return this.options.actions[name];
    }

    if (name === 'on' && typeof this.options.onCommand === 'string') {
      return { transport: 'command', input: this.options.onCommand };
    }
    if (name === 'off' && typeof this.options.offCommand === 'string') {
      return { transport: 'command', input: this.options.offCommand };
    }
    if (name === 'status' && typeof this.options.stateCommand === 'string') {
      return { transport: 'command', input: this.options.stateCommand };
    }
    return undefined;
  }

  describeAction(action) {
    if (!action) {
      return 'none';
    }
    if (action.transport === 'webhook') {
      return `${action.method || 'GET'} ${action.input}`;
    }
    return 'command';
  }

  buildRegex(action) {
    if (!action?.matchPattern) {
      return null;
    }
    return compileRegexOrThrow(action.matchPattern, action.matchFlags || '', 'Command switch regex');
  }

  evaluateMatch(action, payload, source) {
    if (!action?.matchPattern) {
      return true;
    }
    const regex = this.buildRegex(action);
    const result = testRegexMatch(regex, payload || '', { invert: action.matchInvert });
    this.log.debug(
      '[CommandSwitch:%s] Regex %s (%s source=%s invert=%s)',
      this.options.name,
      result ? 'matched' : 'did not match',
      source,
      action.transport,
      Boolean(action.matchInvert),
    );
    return result;
  }

  async executeActionWithDebug(action, timeoutSeconds, source) {
    if (!action) {
      throw new Error(`Missing action for ${source}`);
    }
    const startedAt = Date.now();
    const descriptor = this.describeAction(action);
    try {
      const result = action.transport === 'webhook'
        ? await this.webhookExecutor(action, timeoutSeconds)
        : await this.commandExecutor(action.input, timeoutSeconds);
      this.log.debug(
        '[CommandSwitch:%s] Action succeeded (%s, %s) in %dms (timeout=%ss)',
        this.options.name,
        source,
        descriptor,
        Date.now() - startedAt,
        timeoutSeconds,
      );
      return action.transport === 'webhook'
        ? result
        : { transport: 'command', stdout: result?.stdout || '', stderr: result?.stderr || '' };
    } catch (error) {
      this.log.debug(
        '[CommandSwitch:%s] Action failed (%s, %s) in %dms (timeout=%ss): %s',
        this.options.name,
        source,
        descriptor,
        Date.now() - startedAt,
        timeoutSeconds,
        error.message,
      );
      throw error;
    }
  }

  async executeStateAction(action, source) {
    try {
      const result = await this.executeActionWithDebug(action, this.options.commandTimeoutSeconds, source);
      const payload = action.transport === 'webhook' ? result.body : result.stdout;
      const nextState = action.matchPattern ? this.evaluateMatch(action, payload, 'status') : true;
      this.log.debug(
        '[CommandSwitch:%s] State resolved via %s: %s',
        this.options.name,
        action.transport,
        nextState,
      );
      return nextState;
    } catch (_error) {
      return false;
    }
  }

  async setState(targetState, source = 'manual') {
    if (this.stopped) {
      return;
    }

    await this.coordinator.run(this.accessory.UUID, async () => {
      const action = this.getAction(targetState ? 'on' : 'off');
      if (targetState || action) {
        const result = await this.executeActionWithDebug(action, this.options.commandTimeoutSeconds, source);
        if (action?.matchPattern) {
          const payload = action.transport === 'webhook' ? result.body : result.stdout;
          if (!this.evaluateMatch(action, payload, targetState ? 'on' : 'off')) {
            throw new Error(`Action output did not match ${targetState ? 'ON' : 'OFF'} confirmation pattern`);
          }
        }
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
    const action = this.getAction('status');
    if (!action || this.stopped) {
      return;
    }

    await this.coordinator.run(this.accessory.UUID, async () => {
      const nextState = await this.executeStateAction(action, 'poll');
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
