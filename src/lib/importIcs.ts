// Parsing of an uploaded ICS file into the fields needed to create a Gathio
// event. Kept free of Express and Mongoose so it can be unit tested.

import moment from "moment-timezone";
import ical from "ical";
import { findIana } from "windows-iana";

// `tz` is attached by the ical parser but missing from @types/ical.
type DateWithTzid = Date & { tz?: string };

export interface ImportedIcsEvent {
  name: string;
  location: string;
  description: string;
  startUTC: moment.Moment;
  endUTC: moment.Moment;
  timezone: string;
  organizerEmail?: string;
  organizerName?: string;
  // Raw TZIDs we saw but couldn't resolve to an IANA zone (for logging)
  unresolvedTzids: string[];
}

export const icsImportErrors = {
  unparseable: "This file could not be parsed as an ICS file.",
  noUsableEvent:
    "No event with a name, location, description, and valid start and end times was found in this file.",
} as const;

// Resolve an ICS TZID to an IANA timezone name, or undefined if we can't.
// Some producers quote the TZID or prefix it with a slash, and Outlook uses
// Windows zone names ("Romance Standard Time") rather than IANA ones - the
// "001" territory picks the CLDR canonical zone for those.
export const resolveIcsTzid = (
  tzid: string | undefined,
): string | undefined => {
  if (!tzid) {
    return undefined;
  }
  const cleaned = tzid.replace(/^"+|"+$/g, "").replace(/^\//, "");
  if (moment.tz.zone(cleaned)) {
    return cleaned;
  }
  return findIana(cleaned, "001")[0];
};

// The ical package reads a TZID-qualified timestamp's wall-clock digits in
// the *server's* timezone and attaches the raw TZID to the Date as `tz`, so
// the parsed instant is wrong whenever those zones differ. Reinterpreting the
// digits in the timestamp's own resolved zone recovers the correct instant.
// UTC ("...Z"), floating, and all-day (VALUE=DATE) timestamps carry no `tz`
// and are stored as parsed, and a TZID we can't resolve to an IANA zone keeps
// the parsed instant; in all those cases the timezone falls back to Etc/UTC.
// (The digit recovery formats the Date in the server's zone, so a timestamp
// falling inside the server's own DST gap can shift by an hour - unavoidable
// without reparsing the raw ICS text.)
export const icsDateToMoment = (
  date: Date,
  timezone: string | undefined,
): moment.Moment => {
  if (!timezone) {
    return moment.tz(date, "Etc/UTC");
  }
  return moment.tz(moment(date).format("YYYY-MM-DDTHH:mm:ss"), timezone);
};

export const parseEventFromIcs = (
  icsText: string,
): ImportedIcsEvent | { error: string } => {
  let iCalObject;
  try {
    iCalObject = ical.parseICS(icsText);
  } catch {
    return { error: icsImportErrors.unparseable };
  }

  // Files exported from Google Calendar or Outlook usually open with a
  // VTIMEZONE component, so take the first VEVENT rather than the first
  // component.
  const vevent = Object.values(iCalObject).find(
    (component) => component.type === "VEVENT",
  );
  // The Event model requires all of these fields, so reject their absence
  // with one clear message here rather than a save-time validation error.
  // The instanceof checks matter: the parser stores a date it can't parse as
  // its raw string.
  if (
    !(vevent?.start instanceof Date) ||
    isNaN(vevent.start.getTime()) ||
    !(vevent.end instanceof Date) ||
    isNaN(vevent.end.getTime()) ||
    !vevent.summary ||
    !vevent.location ||
    !vevent.description
  ) {
    return { error: icsImportErrors.noUsableEvent };
  }

  let organizerEmail: string | undefined;
  let organizerName: string | undefined;
  if (vevent.organizer) {
    if (typeof vevent.organizer === "string") {
      organizerEmail = vevent.organizer.replace("MAILTO:", "");
      organizerName = vevent.organizer.replace(/["]+/g, "");
    } else {
      organizerEmail = vevent.organizer.val?.replace("MAILTO:", "");
      organizerName = vevent.organizer.params?.CN?.replace(/["]+/g, "");
    }
  }
  // The parser garbles ORGANIZER lines whose params contain quoted colons
  // (e.g. SENT-BY="MAILTO:..."), so only keep an email-shaped result
  if (organizerEmail && !/^[^@\s"]+@[^@\s"]+\.[^@\s"]+$/.test(organizerEmail)) {
    organizerEmail = undefined;
  }

  const rawStartTzid = (vevent.start as DateWithTzid).tz;
  const rawEndTzid = (vevent.end as DateWithTzid).tz;
  const startTzid = resolveIcsTzid(rawStartTzid);
  const endTzid = resolveIcsTzid(rawEndTzid);
  const unresolvedTzids: string[] = [];
  if (rawStartTzid && !startTzid) {
    unresolvedTzids.push(rawStartTzid);
  }
  if (rawEndTzid && !endTzid && rawEndTzid !== rawStartTzid) {
    unresolvedTzids.push(rawEndTzid);
  }

  return {
    name: vevent.summary,
    location: vevent.location,
    description: vevent.description,
    startUTC: icsDateToMoment(vevent.start, startTzid),
    endUTC: icsDateToMoment(vevent.end, endTzid),
    timezone: startTzid ?? "Etc/UTC",
    organizerEmail,
    organizerName,
    unresolvedTzids,
  };
};
