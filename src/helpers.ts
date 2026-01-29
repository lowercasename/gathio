import moment from 'moment-timezone';
import icalGenerator from 'ical-generator';
import i18next from 'i18next';
import handlebars from 'handlebars';
import Log from "./models/Log.js";
import { getConfig } from "./lib/config.js";

const config = getConfig();
const domain = config.general.domain;
const siteName = config.general.site_name;

// LOGGING
export function addToLog(process: string, status: string, message: string) {
  const logEntry = {
    status,
    process,
    message,
    timestamp: new Date(),
  };
  new Log(logEntry).save().catch(() => {
    console.log("Error saving log entry!");
  });
}

// Minimal event shape for iCal export (works with both documents and lean objects)
export interface ICalEvent {
  id: string;
  name: string;
  description: string;
  location: string;
  start: Date;
  end: Date;
  timezone: string;
  hostName?: string;
  creatorEmail?: string;
}

export function exportIcal(events: ICalEvent | ICalEvent[], calendarName?: string) {
  // Create a new icalGenerator... generator
  const cal = icalGenerator({
    name: calendarName || siteName,
    timezone: 'UTC'
  });

  const eventArray = Array.isArray(events) ? events : [events];
  eventArray.forEach(event => {
    cal.createEvent({
      start: moment.tz(event.start, event.timezone),
      end: moment.tz(event.end, event.timezone),
      timezone: event.timezone,
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

  return cal.toString();
}

interface I18nHelpers {
  t: (key: string, options?: object) => string;
  tn: (key: string, options?: object) => string;
  count?: number;
}

export function getI18nHelpers(): I18nHelpers {
  return {
    t: function(key: string, options?: object) {
      const translation = i18next.t(key, { ...this, ...options });
      const template = handlebars.compile(translation);
      return template(this);
    },
    tn: function(key: string, options?: object) {
      const translation = i18next.t(key, { count: this.count, ...options });
      const template = handlebars.compile(translation);
      return template(this);
    }
  };
}
