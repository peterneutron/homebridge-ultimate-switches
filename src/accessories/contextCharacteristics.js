'use strict';

const { inherits } = require('util');

const UUIDS = {
  MonthOfYear: 'D0DDB561-FA62-41CA-BE54-70E76D3E90A1',
  WeekOfYear: 'E3ABAC1A-79F8-4F84-8C87-5CE94E5A68B2',
  Season: '2B2FEE7A-F5A5-40EA-BF63-59367CC0CF08',
  SeasonName: 'E7ABF0AB-572A-4B80-A4E4-72E82DCC58D6',
  TimeOfDay: 'EA0D87C7-B60B-4D4F-BA57-D9C2BBD824F9',
  TimeOfDayName: 'A30D3240-779E-4309-9E01-5F92526FBD3A',
};

function registerContextCharacteristics(hap) {
  const { Characteristic } = hap;

  if (Characteristic.MonthOfYear) {
    return {
      MonthOfYear: Characteristic.MonthOfYear,
      WeekOfYear: Characteristic.WeekOfYear,
      Season: Characteristic.Season,
      SeasonName: Characteristic.SeasonName,
      TimeOfDay: Characteristic.TimeOfDay,
      TimeOfDayName: Characteristic.TimeOfDayName,
    };
  }

  Characteristic.MonthOfYear = function() {
    Characteristic.call(this, 'Month of Year', UUIDS.MonthOfYear);
    this.setProps({
      format: Characteristic.Formats.UINT8,
      minValue: 1,
      maxValue: 12,
      minStep: 1,
      perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY],
    });
    this.value = this.getDefaultValue();
  };
  inherits(Characteristic.MonthOfYear, Characteristic);
  Characteristic.MonthOfYear.UUID = UUIDS.MonthOfYear;

  Characteristic.WeekOfYear = function() {
    Characteristic.call(this, 'Week of Year', UUIDS.WeekOfYear);
    this.setProps({
      format: Characteristic.Formats.UINT8,
      minValue: 1,
      maxValue: 53,
      minStep: 1,
      perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY],
    });
    this.value = this.getDefaultValue();
  };
  inherits(Characteristic.WeekOfYear, Characteristic);
  Characteristic.WeekOfYear.UUID = UUIDS.WeekOfYear;

  Characteristic.Season = function() {
    Characteristic.call(this, 'Season', UUIDS.Season);
    this.setProps({
      format: Characteristic.Formats.UINT8,
      minValue: 1,
      maxValue: 4,
      minStep: 1,
      perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY],
    });
    this.value = this.getDefaultValue();
  };
  inherits(Characteristic.Season, Characteristic);
  Characteristic.Season.UUID = UUIDS.Season;

  Characteristic.SeasonName = function() {
    Characteristic.call(this, 'Season Name', UUIDS.SeasonName);
    this.setProps({
      format: Characteristic.Formats.STRING,
      perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY],
    });
    this.value = this.getDefaultValue();
  };
  inherits(Characteristic.SeasonName, Characteristic);
  Characteristic.SeasonName.UUID = UUIDS.SeasonName;

  Characteristic.TimeOfDay = function() {
    Characteristic.call(this, 'Time of Day', UUIDS.TimeOfDay);
    this.setProps({
      format: Characteristic.Formats.UINT8,
      minValue: 1,
      maxValue: 6,
      minStep: 1,
      perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY],
    });
    this.value = this.getDefaultValue();
  };
  inherits(Characteristic.TimeOfDay, Characteristic);
  Characteristic.TimeOfDay.UUID = UUIDS.TimeOfDay;

  Characteristic.TimeOfDayName = function() {
    Characteristic.call(this, 'Time of Day Name', UUIDS.TimeOfDayName);
    this.setProps({
      format: Characteristic.Formats.STRING,
      perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY],
    });
    this.value = this.getDefaultValue();
  };
  inherits(Characteristic.TimeOfDayName, Characteristic);
  Characteristic.TimeOfDayName.UUID = UUIDS.TimeOfDayName;

  return {
    MonthOfYear: Characteristic.MonthOfYear,
    WeekOfYear: Characteristic.WeekOfYear,
    Season: Characteristic.Season,
    SeasonName: Characteristic.SeasonName,
    TimeOfDay: Characteristic.TimeOfDay,
    TimeOfDayName: Characteristic.TimeOfDayName,
  };
}

module.exports = {
  registerContextCharacteristics,
};
