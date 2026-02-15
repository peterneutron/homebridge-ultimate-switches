/* global homebridge */

const PLATFORM = 'UltimateSwitches';

const state = {
  loaded: false,
  baseBlock: {},
  config: {
    name: 'Ultimate Switches',
    debug: false,
    commandSwitches: [],
    switches: [],
    timers: [],
    locks: [],
    securitySystems: [],
    calendarTriggers: [],
    contextSensor: {
      enabled: false,
      name: 'Home Context',
      latitude: undefined,
      longitude: undefined,
      refreshIntervalSeconds: 60,
    },
  },
};

function defaultCommandSwitch() {
  return {
    name: '',
    onCommand: '',
    offCommand: '',
    stateCommand: '',
    polling: false,
    pollIntervalSeconds: 5,
    commandTimeoutSeconds: 2,
  };
}

function defaultSwitch() {
  return { name: '', defaultOn: false, persistState: false };
}

function defaultTimer() {
  return { name: '', periodSeconds: 60, autoOff: true, emitMotionPulse: true, persistState: false };
}

function defaultLock() {
  return { name: '', defaultState: 'unlocked', persistState: false };
}

function defaultSecurity() {
  return {
    name: '',
    defaultState: 'unarmed',
    zones: ['Alarm'],
    armAwayButtonLabel: '',
    armStayButtonLabel: '',
    armNightButtonLabel: '',
    persistState: true,
  };
}

function defaultNotification() {
  return { name: '', startOffsetMinutes: 0, endOffsetMinutes: 0 };
}

function defaultCalendarEvent() {
  return { name: '', triggerOnUpdates: true, notifications: [] };
}

function defaultCalendarTrigger() {
  return {
    name: '',
    url: '',
    updateIntervalMinutes: 60,
    requestTimeoutSeconds: 15,
    updateButton: true,
    triggerOnUpdates: true,
    triggerOnAnyEvent: true,
    events: [],
  };
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function mergeLoadedConfig(block) {
  return {
    ...state.config,
    ...block,
    commandSwitches: Array.isArray(block.commandSwitches) ? block.commandSwitches : [],
    switches: Array.isArray(block.switches) ? block.switches : [],
    timers: Array.isArray(block.timers) ? block.timers : [],
    locks: Array.isArray(block.locks) ? block.locks : [],
    securitySystems: Array.isArray(block.securitySystems) ? block.securitySystems : [],
    calendarTriggers: Array.isArray(block.calendarTriggers) ? block.calendarTriggers : [],
    contextSensor: {
      ...state.config.contextSensor,
      ...(block.contextSensor && typeof block.contextSensor === 'object' ? block.contextSensor : {}),
    },
  };
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'className') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) node.setAttribute(k, String(v));
  });
  children.forEach((c) => node.append(c));
  return node;
}

function inputField({ label, value, onInput, placeholder = '', type = 'text', step }) {
  const input = el('input', { type, placeholder });
  if (type === 'checkbox') {
    input.checked = Boolean(value);
    input.addEventListener('change', () => onInput(input.checked));
  } else {
    input.value = value ?? '';
    if (step !== undefined) input.step = String(step);
    input.addEventListener('input', () => onInput(type === 'number' ? input.value : input.value));
  }

  const wrapper = el('div');
  wrapper.append(el('label', { text: label }), input);
  return wrapper;
}

function render() {
  renderGeneral();
  renderCommandSwitches();
  renderSwitches();
  renderTimers();
  renderLocks();
  renderSecurity();
  renderCalendar();
  renderContext();
  renderValidation();
}

function rowHeader(title, onRemove) {
  return el('div', { className: 'row-head' }, [
    el('div', { className: 'row-title', text: title }),
    el('button', { className: 'btn danger', type: 'button', text: 'Remove', onclick: onRemove }),
  ]);
}

function renderGeneral() {
  const root = document.getElementById('generalSection');
  root.replaceChildren(
    el('h2', { text: 'General' }),
    el('div', { className: 'grid' }, [
      inputField({
        label: 'Name',
        value: state.config.name,
        placeholder: 'Ultimate Switches',
        onInput: (v) => { state.config.name = v; render(); },
      }),
      inputField({
        label: 'Debug Logging',
        type: 'checkbox',
        value: state.config.debug,
        onInput: (v) => { state.config.debug = v; render(); },
      }),
    ]),
  );
}

function renderListSection({ id, title, items, addLabel, createDefault, renderRow }) {
  const root = document.getElementById(id);
  const children = [el('h2', { text: title })];

  items.forEach((item, index) => {
    children.push(renderRow(item, index));
  });

  children.push(el('div', { className: 'inline-actions' }, [
    el('button', {
      className: 'btn secondary',
      type: 'button',
      text: addLabel,
      onclick: () => {
        items.push(createDefault());
        render();
      },
    }),
  ]));

  root.replaceChildren(...children);
}

function renderCommandSwitches() {
  renderListSection({
    id: 'commandSection',
    title: 'Command Switches',
    items: state.config.commandSwitches,
    addLabel: 'Add Command Switch',
    createDefault: defaultCommandSwitch,
    renderRow: (item, index) => {
      const row = el('div', { className: 'row' });
      row.append(rowHeader(`Command Switch ${index + 1}`, () => { state.config.commandSwitches.splice(index, 1); render(); }));
      row.append(el('div', { className: 'grid' }, [
        inputField({ label: 'Name', value: item.name, placeholder: 'Kitchen Light', onInput: (v) => { item.name = v; render(); } }),
        inputField({ label: 'On Command', value: item.onCommand, placeholder: 'echo on', onInput: (v) => { item.onCommand = v; render(); } }),
        inputField({ label: 'Off Command', value: item.offCommand, placeholder: 'echo off', onInput: (v) => { item.offCommand = v; render(); } }),
        inputField({ label: 'State Command', value: item.stateCommand, placeholder: 'echo state', onInput: (v) => { item.stateCommand = v; render(); } }),
        inputField({ label: 'Polling', type: 'checkbox', value: item.polling, onInput: (v) => { item.polling = v; render(); } }),
        inputField({ label: 'Poll Interval (s)', type: 'number', value: item.pollIntervalSeconds, onInput: (v) => { item.pollIntervalSeconds = Number(v); render(); } }),
        inputField({ label: 'Command Timeout (s)', type: 'number', value: item.commandTimeoutSeconds, onInput: (v) => { item.commandTimeoutSeconds = Number(v); render(); } }),
      ]));
      return row;
    },
  });
}

function renderSwitches() {
  renderListSection({
    id: 'switchSection',
    title: 'Basic Switches',
    items: state.config.switches,
    addLabel: 'Add Basic Switch',
    createDefault: defaultSwitch,
    renderRow: (item, index) => {
      const row = el('div', { className: 'row' });
      row.append(rowHeader(`Basic Switch ${index + 1}`, () => { state.config.switches.splice(index, 1); render(); }));
      row.append(el('div', { className: 'grid' }, [
        inputField({ label: 'Name', value: item.name, placeholder: 'Porch', onInput: (v) => { item.name = v; render(); } }),
        inputField({ label: 'Default On', type: 'checkbox', value: item.defaultOn, onInput: (v) => { item.defaultOn = v; render(); } }),
        inputField({ label: 'Persist State', type: 'checkbox', value: item.persistState, onInput: (v) => { item.persistState = v; render(); } }),
      ]));
      return row;
    },
  });
}

function renderTimers() {
  renderListSection({
    id: 'timerSection',
    title: 'Timers',
    items: state.config.timers,
    addLabel: 'Add Timer',
    createDefault: defaultTimer,
    renderRow: (item, index) => {
      const row = el('div', { className: 'row' });
      row.append(rowHeader(`Timer ${index + 1}`, () => { state.config.timers.splice(index, 1); render(); }));
      row.append(el('div', { className: 'grid' }, [
        inputField({ label: 'Name', value: item.name, placeholder: 'Stair Light Auto-Off', onInput: (v) => { item.name = v; render(); } }),
        inputField({ label: 'Period Seconds', type: 'number', value: item.periodSeconds, onInput: (v) => { item.periodSeconds = Number(v); render(); } }),
        inputField({ label: 'Auto Off', type: 'checkbox', value: item.autoOff, onInput: (v) => { item.autoOff = v; render(); } }),
        inputField({ label: 'Emit Motion Pulse', type: 'checkbox', value: item.emitMotionPulse, onInput: (v) => { item.emitMotionPulse = v; render(); } }),
        inputField({ label: 'Persist State', type: 'checkbox', value: item.persistState, onInput: (v) => { item.persistState = v; render(); } }),
      ]));
      return row;
    },
  });
}

function renderLocks() {
  renderListSection({
    id: 'lockSection',
    title: 'Locks',
    items: state.config.locks,
    addLabel: 'Add Lock',
    createDefault: defaultLock,
    renderRow: (item, index) => {
      const row = el('div', { className: 'row' });
      row.append(rowHeader(`Lock ${index + 1}`, () => { state.config.locks.splice(index, 1); render(); }));

      const select = el('select', { onchange: (e) => { item.defaultState = e.target.value; render(); } }, [
        el('option', { value: 'unlocked', text: 'unlocked' }),
        el('option', { value: 'locked', text: 'locked' }),
      ]);
      select.value = item.defaultState || 'unlocked';

      const selectWrap = el('div');
      selectWrap.append(el('label', { text: 'Default State' }), select);

      row.append(el('div', { className: 'grid' }, [
        inputField({ label: 'Name', value: item.name, placeholder: 'Virtual Gate', onInput: (v) => { item.name = v; render(); } }),
        selectWrap,
        inputField({ label: 'Persist State', type: 'checkbox', value: item.persistState, onInput: (v) => { item.persistState = v; render(); } }),
      ]));
      return row;
    },
  });
}

function renderSecurity() {
  renderListSection({
    id: 'securitySection',
    title: 'Security Systems',
    items: state.config.securitySystems,
    addLabel: 'Add Security System',
    createDefault: defaultSecurity,
    renderRow: (item, index) => {
      const row = el('div', { className: 'row' });
      row.append(rowHeader(`Security System ${index + 1}`, () => { state.config.securitySystems.splice(index, 1); render(); }));

      const select = el('select', { onchange: (e) => { item.defaultState = e.target.value; render(); } }, [
        el('option', { value: 'unarmed', text: 'unarmed' }),
        el('option', { value: 'armed-stay', text: 'armed-stay' }),
        el('option', { value: 'armed-away', text: 'armed-away' }),
        el('option', { value: 'armed-night', text: 'armed-night' }),
      ]);
      select.value = item.defaultState || 'unarmed';
      const selectWrap = el('div');
      selectWrap.append(el('label', { text: 'Default State' }), select);

      const zonesInput = inputField({
        label: 'Zones (comma-separated)',
        value: Array.isArray(item.zones) ? item.zones.join(', ') : 'Alarm',
        placeholder: 'Alarm, Garage',
        onInput: (v) => {
          item.zones = String(v).split(',').map((s) => s.trim()).filter(Boolean);
          render();
        },
      });

      row.append(el('div', { className: 'grid' }, [
        inputField({ label: 'Name', value: item.name, placeholder: 'Home Alarm', onInput: (v) => { item.name = v; render(); } }),
        selectWrap,
        zonesInput,
        inputField({ label: 'Arm Away Label', value: item.armAwayButtonLabel, placeholder: 'Arm Away', onInput: (v) => { item.armAwayButtonLabel = v; render(); } }),
        inputField({ label: 'Arm Stay Label', value: item.armStayButtonLabel, placeholder: 'Arm Stay', onInput: (v) => { item.armStayButtonLabel = v; render(); } }),
        inputField({ label: 'Arm Night Label', value: item.armNightButtonLabel, placeholder: 'Arm Night', onInput: (v) => { item.armNightButtonLabel = v; render(); } }),
        inputField({ label: 'Persist State', type: 'checkbox', value: item.persistState, onInput: (v) => { item.persistState = v; render(); } }),
      ]));

      return row;
    },
  });
}

function renderCalendar() {
  renderListSection({
    id: 'calendarSection',
    title: 'Calendar Triggers',
    items: state.config.calendarTriggers,
    addLabel: 'Add Calendar Trigger',
    createDefault: defaultCalendarTrigger,
    renderRow: (item, index) => {
      const row = el('div', { className: 'row' });
      row.append(rowHeader(`Calendar Trigger ${index + 1}`, () => { state.config.calendarTriggers.splice(index, 1); render(); }));

      row.append(el('div', { className: 'grid' }, [
        inputField({ label: 'Name', value: item.name, placeholder: 'Family Calendar', onInput: (v) => { item.name = v; render(); } }),
        inputField({ label: 'URL', value: item.url, placeholder: 'webcal://...', onInput: (v) => { item.url = v; render(); } }),
        inputField({ label: 'Update Interval Minutes', type: 'number', value: item.updateIntervalMinutes, onInput: (v) => { item.updateIntervalMinutes = Number(v); render(); } }),
        inputField({ label: 'Request Timeout Seconds', type: 'number', value: item.requestTimeoutSeconds, onInput: (v) => { item.requestTimeoutSeconds = Number(v); render(); } }),
        inputField({ label: 'Update Button', type: 'checkbox', value: item.updateButton, onInput: (v) => { item.updateButton = v; render(); } }),
        inputField({ label: 'Trigger On Updates', type: 'checkbox', value: item.triggerOnUpdates, onInput: (v) => { item.triggerOnUpdates = v; render(); } }),
        inputField({ label: 'Trigger On Any Event', type: 'checkbox', value: item.triggerOnAnyEvent, onInput: (v) => { item.triggerOnAnyEvent = v; render(); } }),
      ]));
      row.append(el('div', { className: 'small', text: 'If disabled, at least one watched event regex is required.' }));

      const eventContainer = el('div');
      (item.events || []).forEach((ev, evIndex) => {
        const evRow = el('div', { className: 'row' });
        evRow.append(rowHeader(`Watched Event ${evIndex + 1}`, () => {
          item.events.splice(evIndex, 1);
          render();
        }));
        evRow.append(el('div', { className: 'grid' }, [
          inputField({ label: 'Regex Pattern', value: ev.name, placeholder: '^(KF|KT|GFW|GTW)$', onInput: (v) => { ev.name = v; render(); } }),
          inputField({ label: 'Trigger On Updates', type: 'checkbox', value: ev.triggerOnUpdates, onInput: (v) => { ev.triggerOnUpdates = v; render(); } }),
        ]));
        evRow.append(el('div', { className: 'small', text: 'Regex pattern, e.g. ^(KF|KT|GFW|GTW)$' }));

        const notifWrap = el('div');
        (ev.notifications || []).forEach((nf, nfIndex) => {
          const nfRow = el('div', { className: 'row' });
          nfRow.append(rowHeader(`Notification ${nfIndex + 1}`, () => {
            ev.notifications.splice(nfIndex, 1);
            render();
          }));
          nfRow.append(el('div', { className: 'grid' }, [
            inputField({ label: 'Name', value: nf.name, placeholder: 'Heating Start', onInput: (v) => { nf.name = v; render(); } }),
            inputField({ label: 'Start Offset Minutes', type: 'number', value: nf.startOffsetMinutes, onInput: (v) => { nf.startOffsetMinutes = Number(v); render(); } }),
            inputField({ label: 'End Offset Minutes', type: 'number', value: nf.endOffsetMinutes, onInput: (v) => { nf.endOffsetMinutes = Number(v); render(); } }),
          ]));
          nfRow.append(el('div', { className: 'small', text: 'Offsets in minutes relative to event start/end.' }));
          notifWrap.append(nfRow);
        });

        notifWrap.append(el('div', { className: 'inline-actions' }, [
          el('button', {
            className: 'btn secondary',
            type: 'button',
            text: 'Add Notification',
            onclick: () => {
              if (!Array.isArray(ev.notifications)) {
                ev.notifications = [];
              }
              ev.notifications.push(defaultNotification());
              render();
            },
          }),
        ]));

        evRow.append(notifWrap);
        eventContainer.append(evRow);
      });

      eventContainer.append(el('div', { className: 'inline-actions' }, [
        el('button', {
          className: 'btn secondary',
          type: 'button',
          text: 'Add Watched Event',
          onclick: () => {
            if (!Array.isArray(item.events)) {
              item.events = [];
            }
            item.events.push(defaultCalendarEvent());
            render();
          },
        }),
      ]));

      row.append(eventContainer);
      return row;
    },
  });
}

function renderContext() {
  const root = document.getElementById('contextSection');
  const ctx = state.config.contextSensor;
  root.replaceChildren(
    el('h2', { text: 'Context Sensor' }),
    el('div', { className: 'grid' }, [
      inputField({ label: 'Enabled', type: 'checkbox', value: ctx.enabled, onInput: (v) => { ctx.enabled = v; render(); } }),
      inputField({ label: 'Name', value: ctx.name, placeholder: 'Home Context', onInput: (v) => { ctx.name = v; render(); } }),
      inputField({ label: 'Latitude', type: 'number', step: 0.000001, value: ctx.latitude, onInput: (v) => { ctx.latitude = v === '' ? undefined : Number(v); render(); } }),
      inputField({ label: 'Longitude', type: 'number', step: 0.000001, value: ctx.longitude, onInput: (v) => { ctx.longitude = v === '' ? undefined : Number(v); render(); } }),
      inputField({ label: 'Refresh Interval Seconds', type: 'number', value: ctx.refreshIntervalSeconds, onInput: (v) => { ctx.refreshIntervalSeconds = Number(v); render(); } }),
    ]),
  );
}

function validate(data) {
  const errors = [];
  const seenGroup = (group) => new Set();

  const requireNonEmpty = (path, value) => {
    if (typeof value !== 'string' || value.trim() === '') {
      errors.push(`${path} is required`);
      return false;
    }
    return true;
  };

  if (!requireNonEmpty('name', data.name)) {
    // keep collecting
  }

  let seen = seenGroup('commandSwitches');
  (data.commandSwitches || []).forEach((item, i) => {
    const p = `commandSwitches[${i}]`;
    const okName = requireNonEmpty(`${p}.name`, item.name);
    requireNonEmpty(`${p}.onCommand`, item.onCommand);
    requireNonEmpty(`${p}.offCommand`, item.offCommand);
    if (okName) {
      const k = item.name.trim().toLowerCase();
      if (seen.has(k)) errors.push(`commandSwitches contains duplicate name: ${item.name}`);
      seen.add(k);
    }
    if (item.polling && (!item.stateCommand || String(item.stateCommand).trim() === '')) {
      errors.push(`${p} requires stateCommand when polling is enabled`);
    }
  });

  seen = seenGroup('switches');
  (data.switches || []).forEach((item, i) => {
    const p = `switches[${i}]`;
    const okName = requireNonEmpty(`${p}.name`, item.name);
    if (okName) {
      const k = item.name.trim().toLowerCase();
      if (seen.has(k)) errors.push(`switches contains duplicate name: ${item.name}`);
      seen.add(k);
    }
  });

  seen = seenGroup('timers');
  (data.timers || []).forEach((item, i) => {
    const p = `timers[${i}]`;
    const okName = requireNonEmpty(`${p}.name`, item.name);
    if (okName) {
      const k = item.name.trim().toLowerCase();
      if (seen.has(k)) errors.push(`timers contains duplicate name: ${item.name}`);
      seen.add(k);
    }
  });

  seen = seenGroup('locks');
  (data.locks || []).forEach((item, i) => {
    const p = `locks[${i}]`;
    const okName = requireNonEmpty(`${p}.name`, item.name);
    if (okName) {
      const k = item.name.trim().toLowerCase();
      if (seen.has(k)) errors.push(`locks contains duplicate name: ${item.name}`);
      seen.add(k);
    }
  });

  seen = seenGroup('securitySystems');
  (data.securitySystems || []).forEach((item, i) => {
    const p = `securitySystems[${i}]`;
    const okName = requireNonEmpty(`${p}.name`, item.name);
    if (okName) {
      const k = item.name.trim().toLowerCase();
      if (seen.has(k)) errors.push(`securitySystems contains duplicate name: ${item.name}`);
      seen.add(k);
    }
  });

  seen = seenGroup('calendarTriggers');
  (data.calendarTriggers || []).forEach((item, i) => {
    const p = `calendarTriggers[${i}]`;
    const okName = requireNonEmpty(`${p}.name`, item.name);
    requireNonEmpty(`${p}.url`, item.url);
    if (okName) {
      const k = item.name.trim().toLowerCase();
      if (seen.has(k)) errors.push(`calendarTriggers contains duplicate name: ${item.name}`);
      seen.add(k);
    }

    const events = Array.isArray(item.events) ? item.events : [];
    if (!item.triggerOnAnyEvent && events.length === 0) {
      errors.push(`${p} requires at least one events entry when triggerOnAnyEvent is false`);
    }

    const seenEvent = new Set();
    events.forEach((ev, evIndex) => {
      const ep = `${p}.events[${evIndex}]`;
      const okEventName = requireNonEmpty(`${ep}.name`, ev.name);
      if (okEventName) {
        const k = ev.name.trim().toLowerCase();
        if (seenEvent.has(k)) errors.push(`${p}.events contains duplicate name: ${ev.name}`);
        seenEvent.add(k);
      }

      (Array.isArray(ev.notifications) ? ev.notifications : []).forEach((nf, nfIndex) => {
        const np = `${ep}.notifications[${nfIndex}]`;
        requireNonEmpty(`${np}.name`, nf.name);
        const hasStart = Number.isFinite(Number(nf.startOffsetMinutes));
        const hasEnd = Number.isFinite(Number(nf.endOffsetMinutes));
        if (!hasStart && !hasEnd) {
          errors.push(`${np} requires startOffsetMinutes or endOffsetMinutes`);
        }
      });
    });
  });

  if (data.contextSensor?.enabled) {
    const lat = Number(data.contextSensor.latitude);
    const lon = Number(data.contextSensor.longitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      errors.push('contextSensor.latitude must be a number between -90 and 90 when enabled');
    }
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      errors.push('contextSensor.longitude must be a number between -180 and 180 when enabled');
    }
  }

  return errors;
}

function serializeConfig() {
  const cfg = clone(state.config);
  cfg.name = String(cfg.name || '').trim();
  cfg.commandSwitches = cfg.commandSwitches.map((x) => ({ ...x, name: String(x.name || '').trim(), onCommand: String(x.onCommand || '').trim(), offCommand: String(x.offCommand || '').trim(), stateCommand: String(x.stateCommand || '').trim() }));
  cfg.switches = cfg.switches.map((x) => ({ ...x, name: String(x.name || '').trim() }));
  cfg.timers = cfg.timers.map((x) => ({ ...x, name: String(x.name || '').trim() }));
  cfg.locks = cfg.locks.map((x) => ({ ...x, name: String(x.name || '').trim() }));
  cfg.securitySystems = cfg.securitySystems.map((x) => ({ ...x, name: String(x.name || '').trim() }));
  cfg.calendarTriggers = cfg.calendarTriggers.map((cal) => ({
    ...cal,
    name: String(cal.name || '').trim(),
    url: String(cal.url || '').trim(),
    events: (cal.events || []).map((ev) => ({
      ...ev,
      name: String(ev.name || '').trim(),
      notifications: (ev.notifications || []).map((nf) => ({ ...nf, name: String(nf.name || '').trim() })),
    })),
  }));
  cfg.contextSensor = { ...cfg.contextSensor, name: String(cfg.contextSensor?.name || '').trim() };
  return cfg;
}

function renderValidation() {
  const errs = validate(serializeConfig());
  const node = document.getElementById('validationErrors');
  node.textContent = errs.length ? `Validation errors:\n- ${errs.join('\n- ')}` : '';

  const saveBtn = document.getElementById('saveBtn');
  saveBtn.disabled = errs.length > 0;

  if (typeof homebridge?.disableSaveButton === 'function') {
    if (errs.length > 0) {
      homebridge.disableSaveButton();
    } else {
      homebridge.enableSaveButton();
    }
  }
}

async function persistToHomebridge(saveNow) {
  const payload = serializeConfig();
  const block = {
    ...state.baseBlock,
    ...payload,
    platform: PLATFORM,
  };

  if (typeof homebridge?.updatePluginConfig === 'function') {
    await homebridge.updatePluginConfig([block]);
  }
  if (saveNow && typeof homebridge?.savePluginConfig === 'function') {
    await homebridge.savePluginConfig();
  }
}

async function load() {
  const banner = document.getElementById('errorBanner');
  try {
    if (typeof homebridge?.showSpinner === 'function') {
      homebridge.showSpinner();
    }

    const blocks = (typeof homebridge?.getPluginConfig === 'function')
      ? await homebridge.getPluginConfig()
      : [];

    const existing = (blocks || []).find((b) => b && b.platform === PLATFORM) || { platform: PLATFORM, name: 'Ultimate Switches' };
    state.baseBlock = clone(existing);
    state.config = mergeLoadedConfig(existing);
    state.loaded = true;

    render();
    await persistToHomebridge(false);
  } catch (error) {
    banner.classList.remove('hidden');
    banner.textContent = `Failed to load UI: ${error.message}`;
  } finally {
    if (typeof homebridge?.hideSpinner === 'function') {
      homebridge.hideSpinner();
    }
  }
}

document.getElementById('validateBtn').addEventListener('click', () => {
  renderValidation();
});

document.getElementById('saveBtn').addEventListener('click', async () => {
  const errors = validate(serializeConfig());
  if (errors.length > 0) {
    renderValidation();
    return;
  }

  await persistToHomebridge(true);
  if (typeof homebridge?.toast?.success === 'function') {
    homebridge.toast.success('Configuration saved');
  }
});

load();
