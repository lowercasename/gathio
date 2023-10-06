import moment from "moment-timezone";
import icalGenerator from "ical-generator";
import Log, { ILog } from "./models/Log.js";
import { getConfig } from "./lib/config.js";
import { IEvent } from "./models/Event.js";

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

export function exportIcal(events: IEvent[], calendarName: string) {
    if (!events || events.length < 1) return;

    // Create a new icalGenerator... generator
    const cal = icalGenerator({
        name: calendarName || siteName,
    });
    events.forEach((event) => {
        // Add the event to the generator
        cal.createEvent({
            start: moment.tz(event.start, event.timezone),
            end: moment.tz(event.end, event.timezone),
            timezone: event.timezone,
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
