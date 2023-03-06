const domain = require('./config/domain.js').domain;
const siteName = require('./config/domain.js').sitename;

const mongoose = require('mongoose');
const Log = mongoose.model('Log');
var moment = require('moment-timezone');
const icalGenerator = require('ical-generator');
var i18n = require('i18n');
// LOGGING

function addToLog(process, status, message) {
  let logEntry = new Log({
    status: status,
    process: process,
    message: message,
    timestamp: moment()
  });
  logEntry.save().catch(() => { console.log("Error saving log entry!") });
}

function exportIcal(events, calendarName) {
  // Create a new icalGenerator... generator
  const cal = icalGenerator({
    name: calendarName || siteName,
    x: {
      'X-WR-CALNAME': calendarName || siteName,
    },
  });
  if (events instanceof Array === false) {
    events = [ events ];
  }
  events.forEach(event => {
    // Add the event to the generator
    cal.createEvent({
      start: moment.tz(event.start, event.timezone),
      end: moment.tz(event.end, event.timezone),
      timezone: event.timezone,
      timestamp: moment(),
      summary: event.name,
      description: event.description,
      organizer: {
        name: event.hostName || "Anonymous",
        email: event.creatorEmail || 'anonymous@anonymous.com',
      },
      location: event.location,
      url: 'https://' + domain + '/' + event.id
    });
  });
  // Stringify it!
  const string = cal.toString();
  return string;
}

function getI18nHelpers() {
  var _helpers = {};
  // 声明handlebar中的i18n helper函数
  // __函数不考虑单复数
  _helpers.__ = function () {
    return i18n.__.apply(this, arguments);
  };
  // __n函数考虑单复数
  _helpers.__n = function () {
    return i18n.__n.apply(this, arguments);
  };

  return _helpers;
}

module.exports = {
  addToLog,
  exportIcal,
  getI18nHelpers,
}