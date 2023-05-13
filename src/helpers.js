import moment from "moment-timezone";
import icalGenerator from "ical-generator";
import Log from "./models/Log.js";
import { getConfig } from "./lib/config.js";
const config = getConfig();
const domain = config.general.domain;
const siteName = config.general.site_name;

// LOGGING

export function addToLog(process, status, message) {
  let logEntry = new Log({
    status: status,
    process: process,
    message: message,
    timestamp: moment(),
  });
  logEntry.save().catch(() => {
    console.log("Error saving log entry!");
  });
}

export function exportIcal(events, calendarName) {
  // Create a new icalGenerator... generator
  const cal = icalGenerator({
    name: calendarName || siteName,
    x: {
      "X-WR-CALNAME": calendarName || siteName,
    },
  });
  if (events instanceof Array === false) {
    events = [events];
  }
  events.forEach((event) => {
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
        email: event.creatorEmail || "anonymous@anonymous.com",
      },
      location: event.location,
      url: "https://" + domain + "/" + event.id,
    });
  });
  // Stringify it!
  const string = cal.toString();
  return string;
}
