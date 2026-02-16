'use strict';

const { bindOnGet, bindOnSet } = require('../hapBinding');
const { logTransition } = require('../logger');

class SecuritySystemAccessory {
  constructor(api, log, accessory, options, coordinator) {
    this.api = api;
    this.log = log;
    this.accessory = accessory;
    this.options = options;
    this.coordinator = coordinator;

    this.state = {
      targetState: this.defaultTargetState(),
      zonesAlarm: {},
    };
  }

  defaultTargetState() {
    const target = this.api.hap.Characteristic.SecuritySystemTargetState;
    switch (this.options.defaultState) {
      case 'armed-stay': return target.STAY_ARM;
      case 'armed-away': return target.AWAY_ARM;
      case 'armed-night': return target.NIGHT_ARM;
      case 'unarmed':
      default:
        return target.DISARM ?? target.DISARMED;
    }
  }

  disarmTargetState() {
    const target = this.api.hap.Characteristic.SecuritySystemTargetState;
    return target.DISARM ?? target.DISARMED;
  }

  deriveCurrentState() {
    const target = this.api.hap.Characteristic.SecuritySystemTargetState;
    const current = this.api.hap.Characteristic.SecuritySystemCurrentState;
    const disarmed = this.disarmTargetState();

    if (this.state.targetState !== disarmed && Object.values(this.state.zonesAlarm).some(Boolean)) {
      return current.ALARM_TRIGGERED;
    }

    if (this.state.targetState === target.AWAY_ARM) {
      return current.AWAY_ARM;
    }
    if (this.state.targetState === target.STAY_ARM) {
      return current.STAY_ARM;
    }
    if (this.state.targetState === target.NIGHT_ARM) {
      return current.NIGHT_ARM;
    }
    return current.DISARMED;
  }

  targetLabel(value) {
    const target = this.api.hap.Characteristic.SecuritySystemTargetState;
    if (value === target.AWAY_ARM) {
      return 'ARM_AWAY';
    }
    if (value === target.STAY_ARM) {
      return 'ARM_STAY';
    }
    if (value === target.NIGHT_ARM) {
      return 'ARM_NIGHT';
    }
    return 'DISARMED';
  }

  currentLabel(value) {
    const current = this.api.hap.Characteristic.SecuritySystemCurrentState;
    if (value === current.AWAY_ARM) {
      return 'ARM_AWAY';
    }
    if (value === current.STAY_ARM) {
      return 'ARM_STAY';
    }
    if (value === current.NIGHT_ARM) {
      return 'ARM_NIGHT';
    }
    if (value === current.ALARM_TRIGGERED) {
      return 'ALARM_TRIGGERED';
    }
    return 'DISARMED';
  }

  configure() {
    this.securityService = this.accessory.getServiceById(this.api.hap.Service.SecuritySystem, 'securitySystem')
      || this.accessory.addService(this.api.hap.Service.SecuritySystem, this.options.name, 'securitySystem');
    this.syncServiceName(this.securityService, this.options.name);

    this.restoreState();

    const targetCharacteristic = this.securityService.getCharacteristic(this.api.hap.Characteristic.SecuritySystemTargetState);
    bindOnGet(targetCharacteristic, () => this.state.targetState);
    bindOnSet(targetCharacteristic, (value) => this.setTargetState(Number(value)));

    const currentCharacteristic = this.securityService.getCharacteristic(this.api.hap.Characteristic.SecuritySystemCurrentState);
    bindOnGet(currentCharacteristic, () => this.deriveCurrentState());

    this.setupArmSwitches();
    this.setupZoneSwitches();
    this.publishState();
  }

  restoreState() {
    const cached = this.accessory.context.securityState;
    if (cached && typeof cached === 'object' && typeof cached.targetState === 'number') {
      this.state.targetState = cached.targetState;
      this.state.zonesAlarm = cached.zonesAlarm && typeof cached.zonesAlarm === 'object'
        ? { ...cached.zonesAlarm }
        : {};
    }

    this.options.zones.forEach((zone) => {
      if (typeof this.state.zonesAlarm[zone] !== 'boolean') {
        this.state.zonesAlarm[zone] = false;
      }
    });

    Object.keys(this.state.zonesAlarm).forEach((zone) => {
      if (!this.options.zones.includes(zone)) {
        delete this.state.zonesAlarm[zone];
      }
    });
  }

  setupArmSwitches() {
    const labels = {
      away: this.options.armAwayButtonLabel || `${this.options.name} Arm Away`,
      stay: this.options.armStayButtonLabel || `${this.options.name} Arm Stay`,
      night: this.options.armNightButtonLabel || `${this.options.name} Arm Night`,
    };

    this.armSwitches = {
      away: this.ensureSwitchService(labels.away, 'arm-away'),
      stay: this.ensureSwitchService(labels.stay, 'arm-stay'),
      night: this.ensureSwitchService(labels.night, 'arm-night'),
    };

    const target = this.api.hap.Characteristic.SecuritySystemTargetState;

    bindOnGet(this.armSwitches.away.getCharacteristic(this.api.hap.Characteristic.On), () => this.state.targetState === target.AWAY_ARM);
    bindOnSet(this.armSwitches.away.getCharacteristic(this.api.hap.Characteristic.On), (value) => this.setArmState(Boolean(value), target.AWAY_ARM));

    bindOnGet(this.armSwitches.stay.getCharacteristic(this.api.hap.Characteristic.On), () => this.state.targetState === target.STAY_ARM);
    bindOnSet(this.armSwitches.stay.getCharacteristic(this.api.hap.Characteristic.On), (value) => this.setArmState(Boolean(value), target.STAY_ARM));

    bindOnGet(this.armSwitches.night.getCharacteristic(this.api.hap.Characteristic.On), () => this.state.targetState === target.NIGHT_ARM);
    bindOnSet(this.armSwitches.night.getCharacteristic(this.api.hap.Characteristic.On), (value) => this.setArmState(Boolean(value), target.NIGHT_ARM));
  }

  setupZoneSwitches() {
    const keep = new Set();
    this.zoneSwitches = {};

    this.options.zones.forEach((zone, index) => {
      const subtype = `zone-${index}`;
      keep.add(subtype);
      const service = this.ensureSwitchService(`${this.options.name} ${zone} Zone`, subtype);
      this.zoneSwitches[zone] = service;

      const onCharacteristic = service.getCharacteristic(this.api.hap.Characteristic.On);
      bindOnGet(onCharacteristic, () => Boolean(this.state.zonesAlarm[zone]));
      bindOnSet(onCharacteristic, (value) => this.setZoneAlarm(zone, Boolean(value)));
    });

    this.accessory.services
      .filter((service) => typeof service.subtype === 'string' && service.subtype.startsWith('zone-'))
      .forEach((service) => {
        if (!keep.has(service.subtype)) {
          this.accessory.removeService(service);
        }
      });
  }

  ensureSwitchService(name, subtype) {
    const service = this.accessory.getServiceById(this.api.hap.Service.Switch, subtype)
      || this.accessory.addService(this.api.hap.Service.Switch, name, subtype);
    this.syncServiceName(service, name);
    return service;
  }

  async setTargetState(value) {
    await this.coordinator.run(this.accessory.UUID, async () => {
      const previousTarget = this.state.targetState;
      const previousCurrent = this.deriveCurrentState();
      this.state.targetState = value;
      this.persistState();
      this.publishState();
      const nextCurrent = this.deriveCurrentState();
      logTransition(
        this.log,
        'Security',
        this.options.name,
        this.targetLabel(previousTarget),
        this.targetLabel(this.state.targetState),
        'manual',
      );
      logTransition(
        this.log,
        'Security',
        this.options.name,
        this.currentLabel(previousCurrent),
        this.currentLabel(nextCurrent),
        'manual',
      );
      this.log.debug('[Security:%s] Target state set to %s', this.options.name, value);
    });
  }

  async setArmState(enabled, armState) {
    const target = enabled ? armState : this.disarmTargetState();
    await this.setTargetState(target);
  }

  async setZoneAlarm(zone, value) {
    await this.coordinator.run(this.accessory.UUID, async () => {
      const previousCurrent = this.deriveCurrentState();
      this.state.zonesAlarm[zone] = value;
      this.persistState();
      this.publishState();
      const nextCurrent = this.deriveCurrentState();
      logTransition(
        this.log,
        'Security',
        this.options.name,
        this.currentLabel(previousCurrent),
        this.currentLabel(nextCurrent),
        'zone',
      );
      this.log.debug('[Security:%s] Zone %s alarm set to %s', this.options.name, zone, value);
    });
  }

  persistState() {
    this.accessory.context.securityState = {
      targetState: this.state.targetState,
      zonesAlarm: { ...this.state.zonesAlarm },
    };
  }

  publishState() {
    const targetChar = this.api.hap.Characteristic.SecuritySystemTargetState;
    const currentChar = this.api.hap.Characteristic.SecuritySystemCurrentState;

    this.securityService.updateCharacteristic(targetChar, this.state.targetState);
    this.securityService.updateCharacteristic(currentChar, this.deriveCurrentState());

    const target = this.api.hap.Characteristic.SecuritySystemTargetState;

    this.armSwitches.away.updateCharacteristic(this.api.hap.Characteristic.On, this.state.targetState === target.AWAY_ARM);
    this.armSwitches.stay.updateCharacteristic(this.api.hap.Characteristic.On, this.state.targetState === target.STAY_ARM);
    this.armSwitches.night.updateCharacteristic(this.api.hap.Characteristic.On, this.state.targetState === target.NIGHT_ARM);

    this.options.zones.forEach((zone) => {
      const service = this.zoneSwitches[zone];
      if (service) {
        service.updateCharacteristic(this.api.hap.Characteristic.On, Boolean(this.state.zonesAlarm[zone]));
      }
    });
  }

  stop() {
    return undefined;
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
  SecuritySystemAccessory,
};
