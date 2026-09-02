import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  icsImportErrors,
  parseEventFromIcs,
  resolveIcsTzid,
} from "./importIcs.js";

// ICS requires CRLF line endings
const ics = (body: string): string =>
  [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Test//EN",
    ...body.trim().split("\n"),
    "END:VCALENDAR",
    "",
  ].join("\r\n");

const REQUIRED_FIELDS = [
  "DTSTAMP:20260901T120000Z",
  "LOCATION:Aarhus",
  "DESCRIPTION:Test description",
  "SUMMARY:Test Event",
].join("\n");

describe("resolveIcsTzid", () => {
  it("accepts an IANA zone name", () => {
    assert.equal(resolveIcsTzid("Europe/Copenhagen"), "Europe/Copenhagen");
  });

  it("strips quotes and a leading slash", () => {
    assert.equal(resolveIcsTzid('"Europe/Copenhagen"'), "Europe/Copenhagen");
    assert.equal(resolveIcsTzid("/Europe/Copenhagen"), "Europe/Copenhagen");
  });

  it("maps a Windows zone name to its CLDR canonical zone", () => {
    assert.equal(resolveIcsTzid("Romance Standard Time"), "Europe/Paris");
    assert.equal(
      resolveIcsTzid("Pacific Standard Time"),
      "America/Los_Angeles",
    );
  });

  it("returns undefined for an unknown TZID or no TZID", () => {
    assert.equal(resolveIcsTzid("Customized Time Zone"), undefined);
    assert.equal(resolveIcsTzid(undefined), undefined);
  });
});

describe("parseEventFromIcs", () => {
  it("parses a UTC event as-is", () => {
    const result = parseEventFromIcs(
      ics(`BEGIN:VEVENT
UID:utc@test
${REQUIRED_FIELDS}
DTSTART:20260910T173000Z
DTEND:20260910T203000Z
END:VEVENT`),
    );
    assert.ok(!("error" in result));
    assert.equal(result.name, "Test Event");
    assert.equal(result.location, "Aarhus");
    assert.equal(result.description, "Test description");
    assert.equal(result.timezone, "Etc/UTC");
    assert.equal(result.startUTC.toISOString(), "2026-09-10T17:30:00.000Z");
    assert.equal(result.endUTC.toISOString(), "2026-09-10T20:30:00.000Z");
    assert.deepEqual(result.unresolvedTzids, []);
  });

  it("recovers the correct instant for a TZID-qualified event, regardless of server timezone", () => {
    const result = parseEventFromIcs(
      ics(`BEGIN:VEVENT
UID:iana@test
${REQUIRED_FIELDS}
DTSTART;TZID=Europe/Copenhagen:20260910T193000
DTEND;TZID=Europe/Copenhagen:20260910T223000
END:VEVENT`),
    );
    assert.ok(!("error" in result));
    assert.equal(result.timezone, "Europe/Copenhagen");
    // 19:30 CEST (+02:00) is 17:30 UTC
    assert.equal(result.startUTC.toISOString(), "2026-09-10T17:30:00.000Z");
    assert.equal(result.endUTC.toISOString(), "2026-09-10T20:30:00.000Z");
  });

  it("picks the first VEVENT when the file opens with a VTIMEZONE component", () => {
    const result = parseEventFromIcs(
      ics(`BEGIN:VTIMEZONE
TZID:Europe/Copenhagen
BEGIN:STANDARD
DTSTART:19701025T030000
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:vtz@test
${REQUIRED_FIELDS}
DTSTART;TZID=Europe/Copenhagen:20260910T193000
DTEND;TZID=Europe/Copenhagen:20260910T223000
END:VEVENT`),
    );
    assert.ok(!("error" in result));
    assert.equal(result.name, "Test Event");
    assert.equal(result.timezone, "Europe/Copenhagen");
  });

  it("maps a quoted Windows TZID and recovers the instant", () => {
    const result = parseEventFromIcs(
      ics(`BEGIN:VEVENT
UID:win@test
${REQUIRED_FIELDS}
DTSTART;TZID="Romance Standard Time":20260910T193000
DTEND;TZID="Romance Standard Time":20260910T223000
END:VEVENT`),
    );
    assert.ok(!("error" in result));
    assert.equal(result.timezone, "Europe/Paris");
    assert.equal(result.startUTC.toISOString(), "2026-09-10T17:30:00.000Z");
  });

  it("does not reinterpret a UTC DTEND when DTSTART carries a TZID", () => {
    const result = parseEventFromIcs(
      ics(`BEGIN:VEVENT
UID:mixed@test
${REQUIRED_FIELDS}
DTSTART;TZID=America/New_York:20260301T100000
DTEND:20260301T160000Z
END:VEVENT`),
    );
    assert.ok(!("error" in result));
    assert.equal(result.timezone, "America/New_York");
    // 10:00 EST (-05:00) is 15:00 UTC; the Z-form end must stay 16:00 UTC
    assert.equal(result.startUTC.toISOString(), "2026-03-01T15:00:00.000Z");
    assert.equal(result.endUTC.toISOString(), "2026-03-01T16:00:00.000Z");
  });

  it("falls back to Etc/UTC for an unresolvable TZID and reports it once", () => {
    const result = parseEventFromIcs(
      ics(`BEGIN:VEVENT
UID:custom@test
${REQUIRED_FIELDS}
DTSTART;TZID=Customized Time Zone:20260910T193000
DTEND;TZID=Customized Time Zone:20260910T223000
END:VEVENT`),
    );
    assert.ok(!("error" in result));
    assert.equal(result.timezone, "Etc/UTC");
    assert.deepEqual(result.unresolvedTzids, ["Customized Time Zone"]);
  });

  it("extracts the organizer from the object form", () => {
    const result = parseEventFromIcs(
      ics(`BEGIN:VEVENT
UID:org@test
${REQUIRED_FIELDS}
ORGANIZER;CN="Test Host":MAILTO:host@example.com
DTSTART:20260910T173000Z
DTEND:20260910T203000Z
END:VEVENT`),
    );
    assert.ok(!("error" in result));
    assert.equal(result.organizerEmail, "host@example.com");
    assert.equal(result.organizerName, "Test Host");
  });

  it("does not crash on an organizer with params but no CN, and drops the garbled email", () => {
    // The ical parser garbles params containing quoted colons (SENT-BY), so
    // the derived email is not usable - it must be dropped, not kept
    const result = parseEventFromIcs(
      ics(`BEGIN:VEVENT
UID:nocn@test
${REQUIRED_FIELDS}
ORGANIZER;SENT-BY="MAILTO:sec@example.com":MAILTO:host@example.com
DTSTART:20260910T173000Z
DTEND:20260910T203000Z
END:VEVENT`),
    );
    assert.ok(!("error" in result));
    assert.equal(result.organizerEmail, undefined);
    assert.equal(result.organizerName, undefined);
  });

  it("rejects a file with no VEVENT", () => {
    const result = parseEventFromIcs(
      ics(`BEGIN:VTIMEZONE
TZID:Europe/Copenhagen
END:VTIMEZONE`),
    );
    assert.deepEqual(result, { error: icsImportErrors.noUsableEvent });
  });

  it("rejects a VEVENT missing a required field", () => {
    for (const missing of ["SUMMARY", "LOCATION", "DESCRIPTION"]) {
      const fields = REQUIRED_FIELDS.split("\n")
        .filter((line) => !line.startsWith(missing))
        .join("\n");
      const result = parseEventFromIcs(
        ics(`BEGIN:VEVENT
UID:missing@test
${fields}
DTSTART:20260910T173000Z
DTEND:20260910T203000Z
END:VEVENT`),
      );
      assert.deepEqual(
        result,
        { error: icsImportErrors.noUsableEvent },
        `should reject when ${missing} is missing`,
      );
    }
  });

  it("rejects a VEVENT with a missing or malformed date", () => {
    for (const dates of [
      "DTEND:20260910T203000Z", // no DTSTART
      "DTSTART:20260910T173000Z", // no DTEND
      "DTSTART:notadate\nDTEND:20260910T203000Z",
    ]) {
      const result = parseEventFromIcs(
        ics(`BEGIN:VEVENT
UID:baddate@test
${REQUIRED_FIELDS}
${dates}
END:VEVENT`),
      );
      assert.deepEqual(result, { error: icsImportErrors.noUsableEvent });
    }
  });

  it("rejects input that is not an ICS file", () => {
    const result = parseEventFromIcs("this is not an ics file at all");
    assert.deepEqual(result, { error: icsImportErrors.noUsableEvent });
  });
});
