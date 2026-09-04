import { Router, type Request, type Response } from "express";
import moment from "moment-timezone";
import { marked } from "marked";
import { markdownToSanitizedHTML, renderPlain } from "../util/markdown.js";
import {
  frontendConfig,
  instanceDescription,
  instanceRules,
} from "../lib/config.js";
import {
  addToLog,
  exportIcal,
  recurrenceToRRule,
  type ICalEvent,
} from "../helpers.js";
import Event, { getApprovedAttendeeCount } from "../models/Event.js";
import EventGroup, {
  type IEventGroup,
  type IRecurrenceRule,
} from "../models/EventGroup.js";
import type mongoose from "mongoose";
import {
  acceptsActivityPub,
  activityPubContentType,
} from "../lib/activitypub.js";
import MagicLink from "../models/MagicLink.js";
import { getConfigMiddleware } from "../lib/middleware.js";
import { getMessage } from "../util/messages.js";

const TIMEZONES = moment.tz
  .names()
  .filter((tz) =>
    [
      "Africa/Abidjan",
      "Africa/Accra",
      "Africa/Algiers",
      "Africa/Bissau",
      "Africa/Cairo",
      "Africa/Casablanca",
      "Africa/Ceuta",
      "Africa/El_Aaiun",
      "Africa/Johannesburg",
      "Africa/Juba",
      "Africa/Khartoum",
      "Africa/Lagos",
      "Africa/Maputo",
      "Africa/Monrovia",
      "Africa/Nairobi",
      "Africa/Ndjamena",
      "Africa/Sao_Tome",
      "Africa/Tripoli",
      "Africa/Tunis",
      "Africa/Windhoek",
      "America/Adak",
      "America/Anchorage",
      "America/Araguaina",
      "America/Argentina/Buenos_Aires",
      "America/Argentina/Catamarca",
      "America/Argentina/Cordoba",
      "America/Argentina/Jujuy",
      "America/Argentina/La_Rioja",
      "America/Argentina/Mendoza",
      "America/Argentina/Rio_Gallegos",
      "America/Argentina/Salta",
      "America/Argentina/San_Juan",
      "America/Argentina/San_Luis",
      "America/Argentina/Tucuman",
      "America/Argentina/Ushuaia",
      "America/Asuncion",
      "America/Atikokan",
      "America/Bahia",
      "America/Bahia_Banderas",
      "America/Barbados",
      "America/Belem",
      "America/Belize",
      "America/Blanc-Sablon",
      "America/Boa_Vista",
      "America/Bogota",
      "America/Boise",
      "America/Cambridge_Bay",
      "America/Campo_Grande",
      "America/Cancun",
      "America/Caracas",
      "America/Cayenne",
      "America/Chicago",
      "America/Chihuahua",
      "America/Costa_Rica",
      "America/Creston",
      "America/Cuiaba",
      "America/Curacao",
      "America/Danmarkshavn",
      "America/Dawson",
      "America/Dawson_Creek",
      "America/Denver",
      "America/Detroit",
      "America/Edmonton",
      "America/Eirunepe",
      "America/El_Salvador",
      "America/Fort_Nelson",
      "America/Fortaleza",
      "America/Glace_Bay",
      "America/Godthab",
      "America/Goose_Bay",
      "America/Grand_Turk",
      "America/Guatemala",
      "America/Guayaquil",
      "America/Guyana",
      "America/Halifax",
      "America/Havana",
      "America/Hermosillo",
      "America/Indiana/Indianapolis",
      "America/Indiana/Knox",
      "America/Indiana/Marengo",
      "America/Indiana/Petersburg",
      "America/Indiana/Tell_City",
      "America/Indiana/Vevay",
      "America/Indiana/Vincennes",
      "America/Indiana/Winamac",
      "America/Inuvik",
      "America/Iqaluit",
      "America/Jamaica",
      "America/Juneau",
      "America/Kentucky/Louisville",
      "America/Kentucky/Monticello",
      "America/Kralendijk",
      "America/La_Paz",
      "America/Lima",
      "America/Los_Angeles",
      "America/Lower_Princes",
      "America/Maceio",
      "America/Managua",
      "America/Manaus",
      "America/Marigot",
      "America/Martinique",
      "America/Matamoros",
      "America/Mazatlan",
      "America/Menominee",
      "America/Merida",
      "America/Metlakatla",
      "America/Mexico_City",
      "America/Miquelon",
      "America/Moncton",
      "America/Monterrey",
      "America/Montevideo",
      "America/Montserrat",
      "America/Nassau",
      "America/New_York",
      "America/Nipigon",
      "America/Nome",
      "America/Noronha",
      "America/North_Dakota/Beulah",
      "America/North_Dakota/Center",
      "America/North_Dakota/New_Salem",
      "America/Ojinaga",
      "America/Panama",
      "America/Pangnirtung",
      "America/Paramaribo",
      "America/Phoenix",
      "America/Port-au-Prince",
      "America/Port_of_Spain",
      "America/Porto_Velho",
      "America/Puerto_Rico",
      "America/Punta_Arenas",
      "America/Rainy_River",
      "America/Rankin_Inlet",
      "America/Recife",
      "America/Regina",
      "America/Resolute",
      "America/Rio_Branco",
      "America/Santarem",
      "America/Santiago",
      "America/Santo_Domingo",
      "America/Sao_Paulo",
      "America/Scoresbysund",
      "America/Sitka",
      "America/St_Barthelemy",
      "America/St_Johns",
      "America/St_Kitts",
      "America/St_Lucia",
      "America/St_Thomas",
      "America/St_Vincent",
      "America/Swift_Current",
      "America/Tegucigalpa",
      "America/Thule",
      "America/Thunder_Bay",
      "America/Tijuana",
      "America/Toronto",
      "America/Tortola",
      "America/Vancouver",
      "America/Whitehorse",
      "America/Winnipeg",
      "America/Yakutat",
      "America/Yellowknife",
      "Antarctica/Casey",
      "Antarctica/Davis",
      "Antarctica/DumontDUrville",
      "Antarctica/Macquarie",
      "Antarctica/Mawson",
      "Antarctica/McMurdo",
      "Antarctica/Palmer",
      "Antarctica/Rothera",
      "Antarctica/Syowa",
      "Antarctica/Troll",
      "Antarctica/Vostok",
      "Arctic/Longyearbyen",
      "Asia/Aden",
      "Asia/Almaty",
      "Asia/Amman",
      "Asia/Anadyr",
      "Asia/Aqtau",
      "Asia/Aqtobe",
      "Asia/Ashgabat",
      "Asia/Atyrau",
      "Asia/Baghdad",
      "Asia/Bahrain",
      "Asia/Baku",
      "Asia/Bangkok",
      "Asia/Barnaul",
      "Asia/Beirut",
      "Asia/Bishkek",
      "Asia/Brunei",
      "Asia/Chita",
      "Asia/Choibalsan",
      "Asia/Colombo",
      "Asia/Damascus",
      "Asia/Dhaka",
      "Asia/Dili",
      "Asia/Dubai",
      "Asia/Dushanbe",
      "Asia/Famagusta",
      "Asia/Gaza",
      "Asia/Hebron",
      "Asia/Ho_Chi_Minh",
      "Asia/Hong_Kong",
      "Asia/Hovd",
      "Asia/Irkutsk",
      "Asia/Jakarta",
      "Asia/Jayapura",
      "Asia/Jerusalem",
      "Asia/Kabul",
      "Asia/Kamchatka",
      "Asia/Karachi",
      "Asia/Kathmandu",
      "Asia/Khandyga",
      "Asia/Kolkata",
      "Asia/Krasnoyarsk",
      "Asia/Kuala_Lumpur",
      "Asia/Kuching",
      "Asia/Kuwait",
      "Asia/Macau",
      "Asia/Magadan",
      "Asia/Makassar",
      "Asia/Manila",
      "Asia/Muscat",
      "Asia/Nicosia",
      "Asia/Novokuznetsk",
      "Asia/Novosibirsk",
      "Asia/Omsk",
      "Asia/Oral",
      "Asia/Phnom_Penh",
      "Asia/Pontianak",
      "Asia/Pyongyang",
      "Asia/Qatar",
      "Asia/Qostanay",
      "Asia/Qyzylorda",
      "Asia/Riyadh",
      "Asia/Sakhalin",
      "Asia/Samarkand",
      "Asia/Seoul",
      "Asia/Shanghai",
      "Asia/Singapore",
      "Asia/Srednekolymsk",
      "Asia/Taipei",
      "Asia/Tashkent",
      "Asia/Tbilisi",
      "Asia/Tehran",
      "Asia/Thimphu",
      "Asia/Tokyo",
      "Asia/Tomsk",
      "Asia/Ulaanbaatar",
      "Asia/Urumqi",
      "Asia/Ust-Nera",
      "Asia/Vientiane",
      "Asia/Vladivostok",
      "Asia/Yakutsk",
      "Asia/Yangon",
      "Asia/Yekaterinburg",
      "Asia/Yerevan",
      "Atlantic/Azores",
      "Atlantic/Bermuda",
      "Atlantic/Canary",
      "Atlantic/Cape_Verde",
      "Atlantic/Faroe",
      "Atlantic/Madeira",
      "Atlantic/Reykjavik",
      "Atlantic/South_Georgia",
      "Atlantic/St_Helena",
      "Atlantic/Stanley",
      "Australia/Adelaide",
      "Australia/Brisbane",
      "Australia/Broken_Hill",
      "Australia/Currie",
      "Australia/Darwin",
      "Australia/Eucla",
      "Australia/Hobart",
      "Australia/Lindeman",
      "Australia/Lord_Howe",
      "Australia/Melbourne",
      "Australia/Perth",
      "Australia/Sydney",
      "Europe/Amsterdam",
      "Europe/Andorra",
      "Europe/Astrakhan",
      "Europe/Athens",
      "Europe/Belgrade",
      "Europe/Berlin",
      "Europe/Bratislava",
      "Europe/Brussels",
      "Europe/Bucharest",
      "Europe/Budapest",
      "Europe/Busingen",
      "Europe/Chisinau",
      "Europe/Copenhagen",
      "Europe/Dublin",
      "Europe/Gibraltar",
      "Europe/Guernsey",
      "Europe/Helsinki",
      "Europe/Isle_of_Man",
      "Europe/Istanbul",
      "Europe/Jersey",
      "Europe/Kaliningrad",
      "Europe/Kiev",
      "Europe/Kirov",
      "Europe/Lisbon",
      "Europe/Ljubljana",
      "Europe/London",
      "Europe/Luxembourg",
      "Europe/Madrid",
      "Europe/Malta",
      "Europe/Mariehamn",
      "Europe/Minsk",
      "Europe/Monaco",
      "Europe/Moscow",
      "Europe/Nicosia",
      "Europe/Oslo",
      "Europe/Paris",
      "Europe/Podgorica",
      "Europe/Prague",
      "Europe/Riga",
      "Europe/Rome",
      "Europe/Samara",
      "Europe/San_Marino",
      "Europe/Sarajevo",
      "Europe/Saratov",
      "Europe/Simferopol",
      "Europe/Skopje",
      "Europe/Sofia",
      "Europe/Stockholm",
      "Europe/Tallinn",
      "Europe/Tirane",
      "Europe/Ulyanovsk",
      "Europe/Uzhgorod",
      "Europe/Vaduz",
      "Europe/Vatican",
      "Europe/Vienna",
      "Europe/Vilnius",
      "Europe/Volgograd",
      "Europe/Warsaw",
      "Europe/Zagreb",
      "Europe/Zaporozhye",
      "Europe/Zurich",
      "Indian/Antananarivo",
      "Indian/Chagos",
      "Indian/Christmas",
      "Indian/Cocos",
      "Indian/Comoro",
      "Indian/Kerguelen",
      "Indian/Mahe",
      "Indian/Maldives",
      "Indian/Mauritius",
      "Indian/Mayotte",
      "Indian/Reunion",
      "Pacific/Apia",
      "Pacific/Auckland",
      "Pacific/Bougainville",
      "Pacific/Chatham",
      "Pacific/Chuuk",
      "Pacific/Easter",
      "Pacific/Efate",
      "Pacific/Enderbury",
      "Pacific/Fakaofo",
      "Pacific/Fiji",
      "Pacific/Funafuti",
      "Pacific/Galapagos",
      "Pacific/Gambier",
      "Pacific/Guadalcanal",
      "Pacific/Guam",
      "Pacific/Honolulu",
      "Pacific/Kiritimati",
      "Pacific/Kosrae",
      "Pacific/Kwajalein",
      "Pacific/Majuro",
      "Pacific/Marquesas",
      "Pacific/Midway",
      "Pacific/Nauru",
      "Pacific/Niue",
      "Pacific/Norfolk",
      "Pacific/Noumea",
      "Pacific/Pago_Pago",
      "Pacific/Palau",
      "Pacific/Pitcairn",
      "Pacific/Pohnpei",
      "Pacific/Port_Moresby",
      "Pacific/Rarotonga",
      "Pacific/Saipan",
      "Pacific/Tahiti",
      "Pacific/Tarawa",
      "Pacific/Tongatapu",
      "Pacific/Wake",
      "Pacific/Wallis",
      "Etc/UTC",
    ].includes(tz),
  );
import { type EventListEvent, bucketEventsByMonth } from "../lib/event.js";
import i18next from "i18next";

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const NTH_LABELS: Record<number, string> = {
  1: "first",
  2: "second",
  3: "third",
  4: "fourth",
  [-1]: "last",
};

function buildRecurrenceSummary(rule?: IRecurrenceRule): string | null {
  if (!rule?.enabled) return null;
  const time = rule.time;
  const tz = rule.timezone;
  if (rule.frequency === "weekly") {
    return `Every ${DAYS[rule.dayOfWeek ?? 0]} at ${time} ${tz}`;
  }
  if (rule.frequency === "biweekly") {
    return `Every other ${DAYS[rule.dayOfWeek ?? 0]} at ${time} ${tz}`;
  }
  if (rule.frequency === "monthly") {
    if (!rule.monthlyType || rule.monthlyType === "day-of-month") {
      return `Monthly on the ${rule.dayOfMonth} at ${time} ${tz}`;
    }
    const nthLabel = NTH_LABELS[rule.nth ?? 1] ?? `${rule.nth}th`;
    return `Monthly on the ${nthLabel} ${DAYS[rule.dayOfWeek ?? 0]} at ${time} ${tz}`;
  }
  return null;
}

const router = Router();

// Lightweight interfaces to satisfy TypeScript in this file without importing full model typings
interface AttendeeLite {
  id?: string;
  _id?: string; // when coming from mongoose docs
  name: string;
  number?: number;
  status?: string;
  visibility?: string;
  removalPassword?: string;
  approved?: boolean;
}

// Unified attendee view object with all computed state for templates
interface AttendeeView {
  id: string;
  name: string;
  avatarLetter: string;
  avatarColor: string;
  isHidden: boolean;
  isPending: boolean;
  canApprove: boolean;
  canRemove: boolean;
  canCopyLink: boolean;
  removalPassword?: string;
}

// Generate a consistent HSL color from a string
function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 80%, 45%)`;
}

interface EventLite {
  id: string;
  name: string;
  location: string;
  start: Date | string;
  end: Date | string;
  timezone: string;
  attendees?: AttendeeLite[];
  editToken?: string;
  eventGroup?: mongoose.Types.ObjectId | IEventGroup;
  description: string;
  image?: string;
  hostName?: string;
  firstLoad?: boolean;
  url?: string;
  approveRegistrations?: boolean;
}

// Minimal event shape for location access checks (works with both documents and lean objects)
interface EventForLocationAccess {
  approveRegistrations?: boolean;
  editToken?: string;
  attendees?: AttendeeLite[];
}

// Centralized location visibility resolution for an event view/export
// Determines whether the current viewer should see the precise location
// and returns ancillary flags for template messaging.
function resolveLocationAccess(
  event: EventForLocationAccess,
  query: Record<string, string | string[] | undefined>,
  adminOverride = false,
): {
  viewerApprovedForLocation: boolean;
  viewerRegistered: boolean;
  viewerRegisteredUnapproved: boolean;
  viewerAttendeeId: string | null;
  editingEnabled: boolean;
} {
  const eventEditToken = event.editToken;
  const approveRegistrations = !!event.approveRegistrations;
  // Editing enabled if correct edit token present, or admin override
  let editingEnabled = adminOverride;
  if (!editingEnabled && query && Object.keys(query).length) {
    if (query.e && query.e === eventEditToken) {
      editingEnabled = true;
    }
  }
  let viewerApprovedForLocation = true;
  let viewerAttendeeId: string | null = null;
  if (approveRegistrations) {
    // Start hidden
    viewerApprovedForLocation = false;
    if (editingEnabled) {
      viewerApprovedForLocation = true;
    } else if (query.p) {
      const removalPassword = String(query.p);
      const attendee = (event.attendees as AttendeeLite[] | undefined)?.find(
        (a: AttendeeLite) => a.removalPassword === removalPassword,
      );
      if (attendee) {
        viewerAttendeeId = attendee._id?.toString() || attendee.id || null;
        if (attendee.approved) {
          viewerApprovedForLocation = true;
        }
      }
    }
  }
  // Host override (defensive, though covered above)
  if (approveRegistrations && editingEnabled && !viewerApprovedForLocation) {
    viewerApprovedForLocation = true;
  }
  // Registration status flags for UI messaging
  let viewerRegistered = false;
  let viewerRegisteredUnapproved = false;
  if (approveRegistrations && !editingEnabled && query.p) {
    const removalPassword = String(query.p);
    const attendee = (event.attendees as AttendeeLite[] | undefined)?.find(
      (a: AttendeeLite) => a.removalPassword === removalPassword,
    );
    if (attendee) {
      viewerRegistered = true;
      if (!attendee.approved) {
        viewerRegisteredUnapproved = true;
      }
    }
  }
  return {
    viewerApprovedForLocation,
    viewerRegistered,
    viewerRegisteredUnapproved,
    viewerAttendeeId,
    editingEnabled,
  };
}

// Add config middleware to all routes
router.use(getConfigMiddleware);

router.get("/", (_: Request, res: Response) => {
  if (res.locals.config?.general.show_public_event_list) {
    return res.redirect("/events");
  }
  return res.render("home", {
    ...frontendConfig(res),
    instanceRules: instanceRules(),
    instanceDescription: instanceDescription(),
  });
});

router.get("/about", (_: Request, res: Response) => {
  return res.render("home", {
    ...frontendConfig(res),
    instanceRules: instanceRules(),
    instanceDescription: instanceDescription(),
  });
});

router.get("/new", async (req: Request, res: Response) => {
  if (res.locals.config?.general.creator_email_addresses?.length) {
    // Allow admins to bypass the creator magic link gate
    const adminToken = req.query.adminToken as string | undefined;
    const adminEmail = req.query.adminEmail as string | undefined;
    if (adminToken && adminEmail) {
      const adminLink = await MagicLink.findOne({
        token: adminToken,
        email: adminEmail,
        expiryTime: { $gt: new Date() },
        permittedActions: "editAnyEvent",
      });
      if (adminLink) {
        return res.render("newevent", {
          title: i18next.t("frontend.newevent"),
          ...frontendConfig(res),
          timezones: TIMEZONES,
          defaultTimezone: "America/Los_Angeles",
          adminMagicLinkToken: adminToken,
          adminEmail,
          creatorEmail: adminEmail,
        });
      }
    }
    return res.render("createEventMagicLink", frontendConfig(res));
  }
  return res.render("newevent", {
    title: i18next.t("frontend.newevent"),
    ...frontendConfig(res),
    timezones: TIMEZONES,
    defaultTimezone: "America/Los_Angeles",
  });
});

router.get("/new/:magicLinkToken", async (req: Request, res: Response) => {
  // If we don't have any creator email addresses, we don't need to check the magic link
  // so we can just redirect to the new event page
  if (!res.locals.config?.general.creator_email_addresses?.length) {
    return res.redirect("/new");
  }
  const magicLink = await MagicLink.findOne({
    token: req.params.magicLinkToken,
    expiryTime: { $gt: new Date() },
    permittedActions: "createEvent",
  });
  if (!magicLink) {
    return res.render("createEventMagicLink", {
      ...frontendConfig(res),
      message: {
        type: "danger",
        text: i18next.t("routes.magiclink-invalid"),
      },
    });
  }
  res.render("newevent", {
    title: i18next.t("frontend.newevent"),
    ...frontendConfig(res),
    magicLinkToken: req.params.magicLinkToken,
    creatorEmail: magicLink.email,
    timezones: TIMEZONES,
    defaultTimezone: "America/Los_Angeles",
  });
});

router.get("/admin", (_: Request, res: Response) => {
  const adminEmails = res.locals.config?.general.admin_email_addresses;
  if (!adminEmails?.length) {
    return res.status(404).render("404", frontendConfig(res));
  }
  return res.render("adminMagicLink", frontendConfig(res));
});

router.get("/admin/:magicLinkToken", async (req: Request, res: Response) => {
  const adminEmails = res.locals.config?.general.admin_email_addresses;
  if (!adminEmails?.length) {
    return res.status(404).render("404", frontendConfig(res));
  }
  const magicLink = await MagicLink.findOne({
    token: req.params.magicLinkToken,
    expiryTime: { $gt: new Date() },
    permittedActions: "editAnyEvent",
  });
  if (!magicLink) {
    return res.render("adminMagicLink", {
      ...frontendConfig(res),
      message: {
        type: "danger",
        text: "This admin magic link is invalid or has expired. Please request a new one.",
      },
    });
  }
  return res.render("adminPanel", {
    ...frontendConfig(res),
    adminToken: req.params.magicLinkToken,
    adminEmail: magicLink.email,
  });
});

router.get("/events", async (req: Request, res: Response) => {
  if (!res.locals.config?.general.show_public_event_list) {
    return res.status(404).render("404", frontendConfig(res));
  }
  const events = await Event.find({ showOnPublicList: true })
    .populate("eventGroup")
    .lean()
    .sort("start");
  const updatedEvents: EventListEvent[] = events.map((event: EventLite) => {
    const startMoment = moment.tz(event.start, event.timezone);
    const endMoment = moment.tz(event.end, event.timezone);
    const isSameDay = startMoment.isSame(endMoment, "day");

    return {
      id: event.id,
      name: event.name,
      // Hide precise location if this event requires approvals
      location: event.approveRegistrations
        ? i18next.t("views.event.location_hidden")
        : event.location,
      displayDate: isSameDay
        ? startMoment.format("LL")
        : `${startMoment.format("LL")} - ${endMoment.format("LL")}`,
      eventHasConcluded: endMoment.isBefore(moment.tz(event.timezone)),
      eventGroup: event.eventGroup as unknown as IEventGroup,
      eventGroupId: event.eventGroup?.toString(),
      startMoment,
      endMoment,
    };
  });
  const upcomingEventsInMonthBuckets = updatedEvents
    .filter((event) => event.eventHasConcluded === false)
    .reduce(bucketEventsByMonth, []);
  const pastEventsInMonthBuckets = updatedEvents
    .filter((event) => event.eventHasConcluded === true)
    .reduce(bucketEventsByMonth, []);
  const eventGroups = await EventGroup.find({
    showOnPublicList: true,
  }).lean();
  const updatedEventGroups = eventGroups.map(
    (eventGroup: {
      id: string;
      name: string;
      _id?: mongoose.Types.ObjectId;
    }) => {
      return {
        id: eventGroup.id,
        name: eventGroup.name,
        numberOfEvents: updatedEvents.filter(
          (event) => event.eventGroupId === eventGroup._id?.toString(),
        ).length,
      };
    },
  );

  // Content-negotiate: browsers asking for ActivityPub get the whole public
  // event list as an OrderedCollection of Event objects (scrapeable embeds).
  if (acceptsActivityPub(req)) {
    const domain = res.locals.config?.general.domain;
    const orderedItems = updatedEvents.map((event) => ({
      "@context": "https://www.w3.org/ns/activitystreams",
      type: "Event",
      id: `https://${domain}/${event.id}`,
      url: `https://${domain}/${event.id}`,
      name: event.name,
      location: event.location,
      startTime: event.startMoment.toISOString(),
      endTime: event.endMoment.toISOString(),
    }));
    return res
      .header("Content-Type", activityPubContentType)
      .send(
        JSON.stringify({
          "@context": "https://www.w3.org/ns/activitystreams",
          type: "OrderedCollection",
          id: `https://${domain}/events`,
          totalItems: orderedItems.length,
          orderedItems,
        }),
      );
  }

  res.render("publicEventList", {
    title: i18next.t("frontend.publicevents"),
    upcomingEvents: upcomingEventsInMonthBuckets,
    pastEvents: pastEventsInMonthBuckets,
    eventGroups: updatedEventGroups,
    instanceDescription: instanceDescription(),
    instanceRules: instanceRules(),
    approveRegistrations: false,
    ...frontendConfig(res),
  });
});

router.get("/:eventID", async (req: Request, res: Response) => {
  try {
    const event = await Event.findOne({
      id: req.params.eventID,
    })
      .lean() // Required, see: https://stackoverflow.com/questions/59690923/handlebars-access-has-been-denied-to-resolve-the-property-from-because-it-is
      .populate("eventGroup");
    if (!event) {
      return res.status(404).render("404", frontendConfig(res));
    }

    const parsedLocationOriginal = event.location.replace(/\s+/g, "+");
    let displayDate;
    const dateformat = i18next.t("frontend.dateformat");
    const timeformat = i18next.t("frontend.timeformat");
    if (moment.tz(event.end, event.timezone).isSame(event.start, "day")) {
      // Happening during one day
      displayDate = i18next.t("frontend.displaydate-sameday", {
        startdate: moment.tz(event.start, event.timezone).format(dateformat),
        starttime: moment.tz(event.start, event.timezone).format(timeformat),
        endtime: moment.tz(event.end, event.timezone).format(timeformat),
        timezone: moment.tz(event.end, event.timezone).format("(z)"),
      });
    } else {
      displayDate = i18next.t("frontend.displaydate-days", {
        startdate: moment.tz(event.start, event.timezone).format(dateformat),
        starttime: moment.tz(event.start, event.timezone).format(timeformat),
        enddate: moment.tz(event.end, event.timezone).format(dateformat),
        endtime: moment.tz(event.end, event.timezone).format(timeformat),
        timezone: moment.tz(event.end, event.timezone).format("(z)"),
      });
    }
    const eventStartISO = moment.tz(event.start, "Etc/UTC").toISOString();
    const eventEndISO = moment.tz(event.end, "Etc/UTC").toISOString();
    const parsedStart = moment
      .tz(event.start, event.timezone)
      .format("YYYYMMDD[T]HHmmss");
    const parsedEnd = moment
      .tz(event.end, event.timezone)
      .format("YYYYMMDD[T]HHmmss");
    // See: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/datetime-local
    const parsedStartForDateInput = moment
      .tz(event.start, event.timezone)
      .format("YYYY-MM-DDTHH:mm");
    const parsedEndForDateInput = moment
      .tz(event.end, event.timezone)
      .format("YYYY-MM-DDTHH:mm");
    let eventHasConcluded = false;
    if (
      moment.tz(event.end, event.timezone).isBefore(moment.tz(event.timezone))
    ) {
      eventHasConcluded = true;
    }
    let eventHasBegun = false;
    if (
      moment.tz(event.start, event.timezone).isBefore(moment.tz(event.timezone))
    ) {
      eventHasBegun = true;
    }
    const fromNow = moment.tz(event.start, event.timezone).fromNow();
    const parsedDescription = markdownToSanitizedHTML(event.description);
    const eventEditToken = event.editToken;

    const escapedName = encodeURIComponent(event.name);

    // For a recurring-series template, hand the Google Calendar link an
    // RRULE so it creates a single repeating event rather than a one-off.
    const recurrenceRRule = event.recurrenceTemplate
      ? recurrenceToRRule(event.recurrence)
      : null;
    const recurrenceGCal = recurrenceRRule
      ? encodeURIComponent(`RRULE:${recurrenceRRule}`)
      : null;

    let eventHasCoverImage = false;
    if (event.image) {
      eventHasCoverImage = true;
    } else {
      eventHasCoverImage = false;
    }
    let eventHasHost = false;
    if (event.hostName) {
      eventHasHost = true;
    } else {
      eventHasHost = false;
    }
    let firstLoad = false;
    if (event.firstLoad === true) {
      firstLoad = true;
      await Event.findOneAndUpdate(
        { id: req.params.eventID },
        { firstLoad: false },
      );
    }

    // If this is a recurring-series template, surface the rule + upcoming
    // generated instances on the page so the host can confirm recurrence is
    // actually producing events. Without this, a host who set up recurrence
    // had no UI signal that anything was happening.
    const recurrenceSummary = buildRecurrenceSummary(event.recurrence);
    let upcomingOccurrences: Array<{ id: string; displayDate: string }> = [];
    if (event.recurrenceTemplate && event.id) {
      const now = new Date();
      const threeMonthsFromNow = moment().add(3, "months").toDate();
      const instances = await Event.find({
        recurrenceId: event.id,
        recurrenceTemplate: { $ne: true },
        start: { $gte: now, $lt: threeMonthsFromNow },
      })
        .select("id start timezone")
        .sort("start")
        .limit(10)
        .lean();
      upcomingOccurrences = instances.map((inst) => ({
        id: inst.id,
        displayDate: moment
          .tz(inst.start, inst.timezone || event.timezone)
          .format("LLLL"),
      }));
    }
    // Check admin magic link credentials
    const adminToken = req.query.adminToken as string | undefined;
    const adminEmail = req.query.adminEmail as string | undefined;
    let isAdminAccess = false;
    if (adminToken && adminEmail) {
      const adminLink = await MagicLink.findOne({
        token: adminToken,
        email: adminEmail,
        expiryTime: { $gt: new Date() },
        permittedActions: "editAnyEvent",
      });
      if (adminLink) {
        isAdminAccess = true;
      }
    }

    const {
      viewerApprovedForLocation,
      viewerRegistered,
      viewerRegisteredUnapproved,
      viewerAttendeeId,
      editingEnabled,
    } = resolveLocationAccess(
      event,
      req.query as Record<string, string | string[] | undefined>,
      isAdminAccess,
    );
    const approveRegistrations = !!event.approveRegistrations;
    const parsedLocation = viewerApprovedForLocation
      ? parsedLocationOriginal
      : "";
    const calendarLocationParam = viewerApprovedForLocation
      ? parsedLocationOriginal
      : ""; // leave blank if hidden
    // Provide a sanitized copy of the event object for templates so location isn't leaked accidentally
    const sanitizedEvent = {
      ...event,
      location: !viewerApprovedForLocation
        ? i18next.t("views.event.location_hidden")
        : event.location,
    };

    // Build unified attendee list with computed state
    // Visibility rules:
    // - Host (editingEnabled): sees ALL attendees including pending
    // - Approved viewer: sees only approved attendees
    // - Unapproved viewer with ?p= link: sees only their own entry
    // - Random visitor: sees nothing
    const canSeeAllAttendees =
      editingEnabled || !approveRegistrations || viewerApprovedForLocation;
    const canSeeOnlySelf =
      !canSeeAllAttendees && viewerRegisteredUnapproved && viewerAttendeeId;
    const shouldFilterPending = approveRegistrations && !editingEnabled;

    const isViewerAttendee = (attendee: AttendeeLite) =>
      viewerAttendeeId &&
      (attendee._id?.toString() === viewerAttendeeId ||
        attendee.id === viewerAttendeeId);

    // Process raw attendees into AttendeeView objects
    const rawAttendees =
      (event.attendees as AttendeeLite[] | undefined)
        ?.filter((a) => a.status === "attending")
        .sort((a, b) => a.name.localeCompare(b.name))
        // Dedupe by id
        .filter((obj, pos, arr) => {
          const id = obj._id || obj.id;
          return arr.findIndex((a) => (a._id || a.id) === id) === pos;
        }) || [];

    // Transform to AttendeeView with computed properties
    let attendees: AttendeeView[] = [];
    let numberOfHiddenAttendees = 0;
    let totalAttendees = 0;

    if (canSeeAllAttendees || canSeeOnlySelf) {
      attendees = rawAttendees
        .filter((a) => {
          // Filter based on viewer context
          if (canSeeOnlySelf) return isViewerAttendee(a);
          if (shouldFilterPending && !a.approved) return false;
          return true;
        })
        .map((a): AttendeeView => {
          const id = (a._id || a.id) as string;
          const displayName =
            a.number && a.number > 1
              ? `${a.name} ${i18next.t("frontend.elnumber", { count: a.number })}`
              : a.name;
          const isHidden = (a.visibility || "public") === "private";
          const isPending = approveRegistrations && !a.approved;

          return {
            id,
            name: displayName,
            avatarLetter: a.name.charAt(0).toUpperCase(),
            avatarColor: stringToColor(a.name),
            isHidden,
            isPending,
            // Actions: only available to host
            canApprove: editingEnabled && isPending,
            canRemove: editingEnabled,
            canCopyLink: editingEnabled && approveRegistrations && !isPending,
            // Only include removalPassword for host
            ...(editingEnabled && a.removalPassword
              ? { removalPassword: a.removalPassword }
              : {}),
          };
        });

      // Calculate counts
      totalAttendees = rawAttendees
        .filter((a) => {
          if (canSeeOnlySelf) return isViewerAttendee(a);
          if (shouldFilterPending && !a.approved) return false;
          return true;
        })
        .reduce((acc, a) => acc + (a.number || 1), 0);

      numberOfHiddenAttendees = rawAttendees
        .filter((a) => {
          if (canSeeOnlySelf) return isViewerAttendee(a);
          if (shouldFilterPending && !a.approved) return false;
          return (a.visibility || "public") === "private";
        })
        .reduce((acc, a) => acc + (a.number || 1), 0);
    }

    let spotsRemaining, noMoreSpots;
    if (event.maxAttendees) {
      spotsRemaining = event.maxAttendees - getApprovedAttendeeCount(event);
      if (spotsRemaining <= 0) {
        noMoreSpots = true;
      }
    }
    const metadata = {
      title: event.name,
      description: (
        marked.parse(event.description, {
          renderer: renderPlain(),
        }) as string
      )
        .split(" ")
        .splice(0, 40)
        .join(" ")
        .trim(),
      image: eventHasCoverImage
        ? `https://${res.locals.config?.general.domain}/events/` + event.image
        : null,
      url: `https://${res.locals.config?.general.domain}/` + req.params.eventID,
    };
    if (acceptsActivityPub(req)) {
      const actorObj = JSON.parse(event.activityPubActor || "{}");
      if (approveRegistrations) {
        // Strip location from the actor summary HTML
        if (actorObj.summary) {
          actorObj.summary = actorObj.summary.replace(
            /<p>Location:.*?<\/p>/gi,
            "",
          );
        }
        if (actorObj.location) {
          delete actorObj.location;
        }
      }
      res.header("Content-Type", activityPubContentType).send(actorObj);
    } else {
      res.set("X-Robots-Tag", "noindex");
      res.render("event", {
        ...frontendConfig(res),
        title: event.name,
        escapedName: escapedName,
        eventData: sanitizedEvent,
        viewerApprovedForLocation,
        approveRegistrations: approveRegistrations,
        viewerRegistered,
        viewerRegisteredUnapproved,
        attendeesListHidden: canSeeOnlySelf,
        attendees,
        numberOfAttendees: totalAttendees,
        numberOfHiddenAttendees,
        spotsRemaining: spotsRemaining,
        noMoreSpots: noMoreSpots,
        eventStartISO: eventStartISO,
        eventEndISO: eventEndISO,
        parsedLocation: parsedLocation,
        calendarLocationParam,
        parsedStart: parsedStart,
        parsedEnd: parsedEnd,
        parsedStartForDateInput,
        parsedEndForDateInput,
        displayDate: displayDate,
        fromNow: fromNow,
        timezone: event.timezone,
        parsedDescription: parsedDescription,
        editingEnabled: editingEnabled,
        eventHasCoverImage: eventHasCoverImage,
        eventHasHost: eventHasHost,
        firstLoad: firstLoad,
        eventHasConcluded: eventHasConcluded,
        eventHasBegun: eventHasBegun,
        eventWillBeDeleted:
          (res.locals.config?.general.delete_after_days || 0) > 0,
        daysUntilDeletion: moment
          .tz(event.end, event.timezone)
          .add(res.locals.config?.general.delete_after_days, "days")
          .fromNow(),
        recurrenceSummary,
        upcomingOccurrences,
        isRecurrenceTemplate: !!event.recurrenceTemplate,
        recurrenceGCal,
        metadata: metadata,
        jsonData: {
          name: event.name,
          id: event.id,
          description: event.description,
          location: viewerApprovedForLocation ? event.location : undefined,
          timezone: event.timezone,
          url: event.url,
          hostName: event.hostName,
          creatorEmail: event.creatorEmail,
          showOnPublicList: event.showOnPublicList,
          eventGroupID: event.eventGroup
            ? (event.eventGroup as unknown as IEventGroup).id
            : null,
          eventGroupEditToken: event.eventGroup
            ? (event.eventGroup as unknown as IEventGroup).editToken
            : null,
          usersCanAttend: event.usersCanAttend,
          usersCanComment: event.usersCanComment,
          maxAttendees: event.maxAttendees,
          approveRegistrations: event.approveRegistrations || false,
          startISO: eventStartISO,
          endISO: eventEndISO,
          startForDateInput: parsedStartForDateInput,
          endForDateInput: parsedEndForDateInput,
          image: event.image,
          editToken: editingEnabled && !isAdminAccess ? eventEditToken : null,
          adminMagicLinkToken: isAdminAccess ? adminToken : null,
          adminEmail: isAdminAccess ? adminEmail : null,
        },
        isAdminAccess,
        message: getMessage(req.query.m as string),
      });
    }
  } catch (err) {
    addToLog(
      "displayEvent",
      "error",
      "Attempt to display event " +
        req.params.eventID +
        " failed with error: " +
        err,
    );
    console.log(err);
    return res.status(404).render("404", frontendConfig(res));
  }
});

router.get("/group/:eventGroupID", async (req: Request, res: Response) => {
  try {
    const eventGroup = await EventGroup.findOne({
      id: req.params.eventGroupID,
    }).lean();

    if (!eventGroup) {
      return res.status(404).render("404", frontendConfig(res));
    }
    const parsedDescription = markdownToSanitizedHTML(eventGroup.description);
    const eventGroupEditToken = eventGroup.editToken;
    const escapedName = eventGroup.name.replace(/\s+/g, "+");
    const eventGroupHasCoverImage = !!eventGroup.image;
    const eventGroupHasHost = !!eventGroup.hostName;

    const events = await Event.find({ eventGroup: eventGroup._id })
      .lean()
      .sort("start");

    const updatedEvents: EventListEvent[] = events.map((event: EventLite) => {
      const startMoment = moment
        .tz(event.start, event.timezone)
        .locale(i18next.language);
      const endMoment = moment
        .tz(event.end, event.timezone)
        .locale(i18next.language);
      const isSameDay = startMoment.isSame(endMoment, "day");

      return {
        id: event.id,
        name: event.name,
        // Hide if individual event requires approvals
        location: event.approveRegistrations
          ? i18next.t("views.event.location_hidden")
          : event.location,
        displayDate: isSameDay
          ? startMoment.format("LL")
          : `${startMoment.format("LL")} - ${endMoment.format("LL")}`,
        eventHasConcluded: endMoment.isBefore(moment.tz(event.timezone)),
        startMoment,
        endMoment,
      };
    });

    const upcomingEventsInMonthBuckets = updatedEvents
      .filter((event) => !event.eventHasConcluded)
      .reduce(bucketEventsByMonth, []);

    const pastEventsInMonthBuckets = updatedEvents
      .filter((event) => event.eventHasConcluded)
      .reduce(bucketEventsByMonth, []);

    let firstLoad = false;
    if (eventGroup.firstLoad === true) {
      firstLoad = true;
      await EventGroup.findOneAndUpdate(
        { id: req.params.eventGroupID },
        { firstLoad: false },
      );
    }

    // Check admin magic link credentials
    const adminToken = req.query.adminToken as string | undefined;
    const adminEmail = req.query.adminEmail as string | undefined;
    let isAdminAccess = false;
    if (adminToken && adminEmail) {
      const adminLink = await MagicLink.findOne({
        token: adminToken,
        email: adminEmail,
        expiryTime: { $gt: new Date() },
        permittedActions: "editAnyEvent",
      });
      if (adminLink) {
        isAdminAccess = true;
      }
    }

    let editingEnabled = isAdminAccess;
    if (!editingEnabled && Object.keys(req.query).length !== 0) {
      if (!req.query.e) {
        editingEnabled = false;
      } else {
        editingEnabled = req.query.e === eventGroupEditToken;
      }
    }

    const metadata = {
      title: eventGroup.name,
      description: (
        marked.parse(eventGroup.description, {
          renderer: renderPlain(),
        }) as string
      )
        .split(" ")
        .splice(0, 40)
        .join(" ")
        .trim(),
      image: eventGroupHasCoverImage
        ? `https://${res.locals.config?.general.domain}/events/` +
          eventGroup.image
        : null,
      url: `https://${res.locals.config?.general.domain}/` + req.params.eventID,
    };

    res.set("X-Robots-Tag", "noindex");
    res.render("eventgroup", {
      ...frontendConfig(res),
      domain: res.locals.config?.general.domain,
      title: eventGroup.name,
      eventGroupData: eventGroup,
      escapedName: escapedName,
      upcomingEvents: upcomingEventsInMonthBuckets,
      pastEvents: pastEventsInMonthBuckets,
      parsedDescription: parsedDescription,
      editingEnabled: editingEnabled,
      isAdminAccess: isAdminAccess,
      eventGroupHasCoverImage: eventGroupHasCoverImage,
      eventGroupHasHost: eventGroupHasHost,
      firstLoad: firstLoad,
      approveRegistrations: false, // group view no longer uses global gating; per-event handled when mapping
      metadata: metadata,
      jsonData: {
        name: eventGroup.name,
        id: eventGroup.id,
        description: eventGroup.description,
        url: eventGroup.url,
        hostName: eventGroup.hostName,
        creatorEmail: eventGroup.creatorEmail,
        image: eventGroup.image,
        editToken:
          editingEnabled && !isAdminAccess ? eventGroupEditToken : null,
        adminMagicLinkToken: isAdminAccess ? adminToken : null,
        adminEmail: isAdminAccess ? adminEmail : null,
        showOnPublicList: eventGroup.showOnPublicList,
        colorIndex: eventGroup.colorIndex,
        recurrence: eventGroup.recurrence,
      },
      recurrenceSummary: buildRecurrenceSummary(eventGroup.recurrence),
      timezones: TIMEZONES,
      defaultTimezone: eventGroup.recurrence?.timezone ?? "America/Los_Angeles",
    });
  } catch (err) {
    addToLog(
      "displayEventGroup",
      "error",
      `Attempt to display event group ${req.params.eventGroupID} failed with error: ${err}`,
    );
    console.log(err);
    return res.status(404).render("404", frontendConfig(res));
  }
});

router.get(
  "/group/:eventGroupID/feed.ics",
  async (req: Request, res: Response) => {
    try {
      const eventGroup = await EventGroup.findOne({
        id: req.params.eventGroupID,
      }).lean();

      if (eventGroup) {
        const events = await Event.find({
          eventGroup: eventGroup._id,
        }).sort("start");
        let editingEnabled = false;
        if (req.query.e && req.query.e === eventGroup.editToken) {
          editingEnabled = true;
        }
        // If approvals are required and viewer is not host, strip locations
        const sanitizedEvents: ICalEvent[] = events.map((ev) => {
          const evObj = ev.toObject?.() || ev;
          const needsHide = evObj.approveRegistrations && !editingEnabled;
          return needsHide
            ? {
                ...evObj,
                location: i18next.t("views.event.location_hidden"),
              }
            : evObj;
        });
        const string = exportIcal(sanitizedEvents, eventGroup.name);
        res.set("Content-Type", "text/calendar").send(string);
      }
    } catch (err) {
      addToLog(
        "eventGroupFeed",
        "error",
        `Attempt to display event group feed for ${req.params.eventGroupID} failed with error: ${err}`,
      );
      console.log(err);
      return res.status(404).render("404", frontendConfig(res));
    }
  },
);

router.get("/export/event/:eventID", async (req: Request, res: Response) => {
  try {
    const event = await Event.findOne({
      id: req.params.eventID,
    }).populate("eventGroup");

    if (event) {
      const { viewerApprovedForLocation } = resolveLocationAccess(
        event,
        req.query as Record<string, string | string[] | undefined>,
      );
      const evObj = event.toObject?.() || event;
      const sanitizedEvent: ICalEvent = viewerApprovedForLocation
        ? evObj
        : {
            ...evObj,
            location: i18next.t("views.event.location_hidden"),
          };
      const string = exportIcal([sanitizedEvent], event.name, {
        expandRecurringTemplates: true,
      });
      res.set("Content-Type", "text/calendar").send(string);
    }
  } catch (err) {
    addToLog(
      "exportEvent",
      "error",
      `Attempt to export event ${req.params.eventID} failed with error: ${err}`,
    );
    console.log(err);
    return res.status(404).render("404", frontendConfig(res));
  }
});

router.get(
  "/export/group/:eventGroupID",
  async (req: Request, res: Response) => {
    try {
      const eventGroup = await EventGroup.findOne({
        id: req.params.eventGroupID,
      }).lean();

      if (eventGroup) {
        const events = await Event.find({
          eventGroup: eventGroup._id,
        }).sort("start");
        let editingEnabled = false;
        if (req.query.e && req.query.e === eventGroup.editToken) {
          editingEnabled = true;
        }
        const sanitizedEvents: ICalEvent[] = events.map((ev) => {
          const evObj = ev.toObject?.() || ev;
          const needsHide = evObj.approveRegistrations && !editingEnabled;
          return needsHide
            ? {
                ...evObj,
                location: i18next.t("views.event.location_hidden"),
              }
            : evObj;
        });
        const string = exportIcal(sanitizedEvents, eventGroup.name);
        res.set("Content-Type", "text/calendar").send(string);
      }
    } catch (err) {
      addToLog(
        "exportEvent",
        "error",
        `Attempt to export event group ${req.params.eventGroupID} failed with error: ${err}`,
      );
      console.log(err);
      return res.status(404).render("404", frontendConfig(res));
    }
  },
);

export default router;
