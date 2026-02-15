'use strict';

function isoWeekOfYear(date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
}

function seasonFromMonth(month, hemisphere) {
  const north = {
    spring: [3, 4, 5],
    summer: [6, 7, 8],
    autumn: [9, 10, 11],
    winter: [12, 1, 2],
  };

  const south = {
    spring: north.autumn,
    summer: north.winter,
    autumn: north.spring,
    winter: north.summer,
  };

  const table = hemisphere === 'south' ? south : north;
  if (table.spring.includes(month)) {
    return { season: 1, seasonName: 'Spring' };
  }
  if (table.summer.includes(month)) {
    return { season: 2, seasonName: 'Summer' };
  }
  if (table.autumn.includes(month)) {
    return { season: 3, seasonName: 'Autumn' };
  }
  return { season: 4, seasonName: 'Winter' };
}

function timeOfDayFromHour(hour) {
  if (hour >= 5 && hour <= 6) {
    return { timeOfDay: 1, timeOfDayName: 'Morning Twilight' };
  }
  if (hour === 7) {
    return { timeOfDay: 2, timeOfDayName: 'Sunrise' };
  }
  if (hour >= 8 && hour <= 17) {
    return { timeOfDay: 3, timeOfDayName: 'Daytime' };
  }
  if (hour === 18) {
    return { timeOfDay: 4, timeOfDayName: 'Sunset' };
  }
  if (hour >= 19 && hour <= 20) {
    return { timeOfDay: 5, timeOfDayName: 'Evening Twilight' };
  }
  return { timeOfDay: 6, timeOfDayName: 'Night' };
}

function computeContextValues(now, latitude) {
  const month = now.getMonth() + 1;
  const hemisphere = latitude < 0 ? 'south' : 'north';
  const season = seasonFromMonth(month, hemisphere);
  const daytime = timeOfDayFromHour(now.getHours());

  return {
    monthOfYear: month,
    weekOfYear: isoWeekOfYear(now),
    season: season.season,
    seasonName: season.seasonName,
    timeOfDay: daytime.timeOfDay,
    timeOfDayName: daytime.timeOfDayName,
  };
}

module.exports = {
  computeContextValues,
  isoWeekOfYear,
};
