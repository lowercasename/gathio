// src/helpers.ts
import moment from 'moment-timezone';
import icalGenerator from 'ical-generator';
import i18next from 'i18next';
import handlebars from 'handlebars';
import { PrismaClient } from '@prisma/client';
import { getConfig } from './lib/config.js';
import type { Event as IEvent } from '@prisma/client';

const prisma = new PrismaClient();
const config = getConfig();
const domain = config.general.domain;
const siteName = config.general.site_name;

// LOGGING
export async function addToLog(process: string, status: string, message: string) {
  const logEntry = {
    status,
    process,
    message,
    timestamp: new Date(),
  };
  try {
    await prisma.log.create({ data: logEntry });
  } catch (err) {
    console.error('Error saving log entry!', err);
  }
}

// ICal export
export function exportIcal(events: IEvent | IEvent[], calendarName?: string) {
  const cal = icalGenerator({
    name: calendarName || siteName,
    timezone: 'UTC',
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
        name: event.hostName || 'Anonymous',
        email: event.creatorEmail || 'anonymous@anonymous.com',
      },
      location: event.location,
      url: `https://${domain}/${event.id}`,
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
    t(this: any, key: string, options?: object) {
      const translation = i18next.t(key, { ...this, ...options });
      const template = handlebars.compile(translation);
      return template(this);
    },
    tn(this: any, key: string, options?: object) {
      const translation = i18next.t(key, { count: this.count, ...options });
      const template = handlebars.compile(translation);
      return template(this);
    },
  };
}