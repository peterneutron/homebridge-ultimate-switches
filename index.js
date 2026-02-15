'use strict';

const { PLUGIN_NAME, PLATFORM_NAME } = require('./src/settings');
const { UltimateSwitchesPlatform } = require('./src/platform');

module.exports = (homebridge) => {
  homebridge.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, UltimateSwitchesPlatform, true);
};

module.exports._internals = {
  UltimateSwitchesPlatform,
};
