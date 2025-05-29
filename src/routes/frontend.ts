//src/routes/frontend.ts
import { Router, Request, Response } from "express";
import moment from "moment-timezone";
import { marked } from "marked";
import { markdownToSanitizedHTML, renderPlain } from "../util/markdown.js";
import {
  frontendConfig,
  instanceDescription,
  instanceRules,
} from "../lib/config.js";
import { addToLog, exportIcal } from "../helpers.js";
import { acceptsActivityPub, activityPubContentType } from "../lib/activitypub.js";
import { getConfigMiddleware } from "../lib/middleware.js";
import { getMessage } from "../util/messages.js";
import { EventListEvent, bucketEventsByMonth } from "../lib/event.js";
import i18next from "i18next";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

// Add config middleware to all routes
router.use(getConfigMiddleware);

// Home & About
router.get("/", (_req: Request, res: Response) => {
  if (res.locals.config?.general.show_public_event_list) {
    return res.redirect("/events");
  }
  return res.render("home", {
    ...frontendConfig(res),
    instanceRules: instanceRules(),
    instanceDescription: instanceDescription(),
  });
});

router.get("/about", (_req: Request, res: Response) => {
  return res.render("home", {
    ...frontendConfig(res),
    instanceRules: instanceRules(),
    instanceDescription: instanceDescription(),
  });
});

// New Event page or magic link form
router.get("/new", (_req: Request, res: Response) => {
  if (res.locals.config?.general.creator_email_addresses?.length) {
    return res.render("createEventMagicLink", frontendConfig(res));
  }
  return res.render("newevent", {
    title: i18next.t("frontend.newevent"),
    ...frontendConfig(res),
  });
});

router.get("/new/:magicLinkToken", async (req: Request, res: Response) => {
  if (!res.locals.config?.general.creator_email_addresses?.length) {
    return res.redirect("/new");
  }
  try {
    const ml = await prisma.magicLink.findFirst({
      where: {
        token: req.params.magicLinkToken,
        expiryTime: { gt: new Date() },
      },
    });
    const permitted = Array.isArray(ml?.permittedActions)
      ? ml.permittedActions
      : [];
    if (!ml || !permitted.includes("createEvent")) {
      return res.render("createEventMagicLink", {
        ...frontendConfig(res),
        message: { type: "danger", text: i18next.t("routes.magiclink-invalid") },
      });
    }
    res.render("newevent", {
      title: i18next.t("frontend.newevent"),
      ...frontendConfig(res),
      magicLinkToken: req.params.magicLinkToken,
      creatorEmail: ml.email,
    });
  } catch (err) {
    addToLog("renderMagicLink", "error", `MagicLink lookup failed: ${err}`);
    return res.render("createEventMagicLink", {
      ...frontendConfig(res),
      message: { type: "danger", text: i18next.t("routes.magiclink-invalid") },
    });
  }
});

// Public event list
router.get("/events", async (_req: Request, res: Response) => {
  if (!res.locals.config?.general.show_public_event_list) {
    return res.status(404).render("404", frontendConfig(res));
  }
  try {
    const events = await prisma.event.findMany({
      where: { showOnPublicList: true },
      include: { eventGroup: true },
      orderBy: { start: 'asc' },
    });

    const updated: EventListEvent[] = events.map((e) => {
      const startM = moment.tz(e.start, e.timezone);
      const endM = moment.tz(e.end, e.timezone);
      const sameDay = startM.isSame(endM, 'day');
      return {
        id: e.id,
        name: e.name,
        location: e.location,
        displayDate: sameDay
          ? startM.format('LL')
          : `${startM.format('LL')} - ${endM.format('LL')}`,
        eventHasConcluded: endM.isBefore(moment.tz(e.timezone)),
        eventGroup: e.eventGroup || undefined,
        startMoment: startM,
        endMoment: endM,
      };
    });

    const upcoming = updated.filter((e) => !e.eventHasConcluded).reduce(bucketEventsByMonth, []);
    const past = updated.filter((e) => e.eventHasConcluded).reduce(bucketEventsByMonth, []);

    const groups = await prisma.eventGroup.findMany({ where: { showOnPublicList: true } });
    const updatedGroups = groups.map((g) => ({
      id: g.id,
      name: g.name,
      numberOfEvents: updated.filter((e) => e.eventGroup?.id === g.id).length,
    }));

    res.render("publicEventList", {
      title: i18next.t("frontend.publicevents"),
      upcomingEvents: upcoming,
      pastEvents: past,
      eventGroups: updatedGroups,
      instanceDescription: instanceDescription(),
      instanceRules: instanceRules(),
      ...frontendConfig(res),
    });
  } catch (err) {
    addToLog("displayEventList", "error", `Public list failed: ${err}`);
    res.status(500).render("404", frontendConfig(res));
  }
});

// Single event page
router.get("/:eventID", async (req: Request, res: Response) => {
  try {
    const event = await prisma.event.findUnique({
      where: { id: req.params.eventID },
      include: { eventGroup: true, attendees: true },
    });
    if (!event) {
      return res.status(404).render("404", frontendConfig(res));
    }

    // format dates, metadata, ICS links, attendees, etc.
    const datefmt = i18next.t("frontend.dateformat");
    const timefmt = i18next.t("frontend.timeformat");
    const startM = moment.tz(event.start, event.timezone);
    const endM = moment.tz(event.end, event.timezone);
    let displayDate: string;
    if (startM.isSame(endM, 'day')) {
      displayDate = i18next.t("frontend.displaydate-sameday", {
        startdate: startM.format(datefmt),
        starttime: startM.format(timefmt),
        endtime: endM.format(timefmt),
        timezone: endM.format('(z)'),
      });
    } else {
      displayDate = i18next.t("frontend.displaydate-days", {
        startdate: startM.format(datefmt),
        starttime: startM.format(timefmt),
        enddate: endM.format(datefmt),
        endtime: endM.format(timefmt),
        timezone: endM.format('(z)'),
      });
    }

    // ICS
    const eventStartISO = moment.tz(event.start, 'Etc/UTC').toISOString();
    const eventEndISO = moment.tz(event.end, 'Etc/UTC').toISOString();
    const parsedStart = startM.format('YYYYMMDD[T]HHmmss');
    const parsedEnd = endM.format('YYYYMMDD[T]HHmmss');
    const parsedStartInput = startM.format('YYYY-MM-DDTHH:mm');
    const parsedEndInput = endM.format('YYYY-MM-DDTHH:mm');

    // status flags
    const nowTz = moment.tz(event.timezone);
    const eventHasConcluded = endM.isBefore(nowTz);
    const eventHasBegun = startM.isBefore(nowTz);
    const fromNow = startM.fromNow();

    // attendees
    const attendees = event.attendees
      .sort((a, b) => a.name.localeCompare(b.name))
      .filter((a, i, arr) => a.status === 'attending' && arr.map(x => x.id).indexOf(a.id) === i)
      .map((a) => ({
        ...a,
        visibility: a.visibility || 'public',
        name: a.number && a.number > 1
          ? `${a.name} ${i18next.t('frontend.elnumber', { count: a.number })}`
          : a.name,
      }));

    const totalAttendees = attendees.reduce((sum, a) => sum + (a.number || 1), 0);
    const publicAtt = attendees.filter(a => a.visibility === 'public');
    const privateCount = attendees.reduce((sum, a) => a.visibility === 'private' ? sum + (a.number || 1) : sum, 0);
    let spotsRemaining: number | undefined;
    let noMoreSpots = false;
    if (event.maxAttendees) {
      spotsRemaining = event.maxAttendees - totalAttendees;
      noMoreSpots = (spotsRemaining <= 0);
    }

    // firstLoad update
    let firstLoad = false;
    if (event.firstLoad) {
      firstLoad = true;
      await prisma.event.update({ where: { id: event.id }, data: { firstLoad: false } });
    }

    // editingEnabled
    let editingEnabled = false;
    if (req.query.e === event.editToken) editingEnabled = true;

    // metadata
    const metadata = {
      title: event.name,
      description: marked.parse(event.description, { renderer: renderPlain() })
        .split(' ').slice(0,40).join(' ').trim(),
      image: event.image
        ? `https://${res.locals.config?.general.domain}/events/${event.image}`
        : null,
      url: `https://${res.locals.config?.general.domain}/${event.id}`,
    };

    if (acceptsActivityPub(req)) {
      res.header("Content-Type", activityPubContentType)
         .send(JSON.parse(event.activityPubActor || "{}"));
    } else {
      res.set("X-Robots-Tag", "noindex");
      res.render("event", {
        ...frontendConfig(res),
        title: event.name,
        escapedName: event.name.replace(/\s+/g,'+'),
        eventData: event,
        visibleAttendees: publicAtt,
        hiddenAttendees: privateCount,
        numberOfAttendees: totalAttendees,
        numberOfHiddenAttendees: privateCount,
        spotsRemaining,
        noMoreSpots,
        eventStartISO,
        eventEndISO,
        parsedLocation: event.location.replace(/\s+/g,'+'),
        parsedStart,
        parsedEnd,
        parsedStartForDateInput: parsedStartInput,
        parsedEndForDateInput: parsedEndInput,
        displayDate,
        fromNow,
        timezone: event.timezone,
        parsedDescription: markdownToSanitizedHTML(event.description),
        editingEnabled,
        eventHasCoverImage: !!event.image,
        eventHasHost: !!event.hostName,
        firstLoad,
        eventHasConcluded,
        eventHasBegun,
        eventWillBeDeleted: (res.locals.config?.general.delete_after_days || 0) > 0,
        daysUntilDeletion: endM.add(res.locals.config.general.delete_after_days, 'days').fromNow(),
        metadata,
        jsonData: {
          name: event.name,
          id: event.id,
          description: event.description,
          location: event.location,
          timezone: event.timezone,
          url: event.url,
          hostName: event.hostName,
          creatorEmail: event.creatorEmail,
          showOnPublicList: event.showOnPublicList,
          eventGroupID: event.eventGroup?.id,
          eventGroupEditToken: event.eventGroup?.editToken,
          usersCanAttend: event.usersCanAttend,
          usersCanComment: event.usersCanComment,
          maxAttendees: event.maxAttendees,
          startISO: eventStartISO,
          endISO: eventEndISO,
          startForDateInput: parsedStartInput,
          endForDateInput: parsedEndInput,
          image: event.image,
          editToken: editingEnabled ? event.editToken : null,
        },
        message: getMessage(String(req.query.m || '')),
      });
    }
  } catch (err) {
    addToLog(
      "displayEvent",
      "error",
      `Attempt to display event ${req.params.eventID} failed: ${err}`
    );
    return res.status(404).render("404", frontendConfig(res));
  }
});

// Event group page
router.get("/group/:eventGroupID", async (req: Request, res: Response) => {
  try {
    const group = await prisma.eventGroup.findUnique({
      where: { id: req.params.eventGroupID },
    });
    if (!group) {
      return res.status(404).render("404", frontendConfig(res));
    }
    const parsedDescription = markdownToSanitizedHTML(group.description);
    const groupEditToken = group.editToken;
    const escapedName = group.name.replace(/\s+/g,'+');
    const hasCover = !!group.image;
    const hasHost = !!group.hostName;

    const events = await prisma.event.findMany({
      where: { eventGroupId: group.id },
      orderBy: { start: 'asc' },
    });
    const updated: EventListEvent[] = events.map((e) => {
      const s = moment.tz(e.start, e.timezone).locale(i18next.language);
      const en = moment.tz(e.end, e.timezone).locale(i18next.language);
      const sameDay = s.isSame(en,'day');
      return {
        id: e.id,
        name: e.name,
        location: e.location,
        displayDate: sameDay ? s.format('LL') : `${s.format('LL')} - ${en.format('LL')}`,
        eventHasConcluded: en.isBefore(moment.tz(e.timezone)),
        startMoment: s,
        endMoment: en,
      };
    });
    const upcoming = updated.filter(e => !e.eventHasConcluded).reduce(bucketEventsByMonth, []);
    const past = updated.filter(e => e.eventHasConcluded).reduce(bucketEventsByMonth, []);

    let firstLoad = false;
    if (group.firstLoad) {
      firstLoad = true;
      await prisma.eventGroup.update({ where: { id: group.id }, data: { firstLoad: false } });
    }
    let editingEnabled = req.query.e === groupEditToken;

    const metadata = {
      title: group.name,
      description: marked.parse(group.description, { renderer: renderPlain() })
        .split(' ').slice(0,40).join(' ').trim(),
      image: hasCover ? `https://${res.locals.config?.general.domain}/events/${group.image}` : null,
      url: `https://${res.locals.config?.general.domain}/group/${group.id}`,
    };

    res.set("X-Robots-Tag","noindex");
    res.render("eventgroup", {
      ...frontendConfig(res),
      domain: res.locals.config?.general.domain,
      title: group.name,
      eventGroupData: group,
      escapedName,
      upcomingEvents: upcoming,
      pastEvents: past,
      parsedDescription,
      editingEnabled,
      eventGroupHasCoverImage: hasCover,
      eventGroupHasHost: hasHost,
      firstLoad,
      metadata,
      jsonData: {
        name: group.name,
        id: group.id,
        description: group.description,
        url: group.url,
        hostName: group.hostName,
        creatorEmail: group.creatorEmail,
        image: group.image,
        editToken: editingEnabled ? groupEditToken : null,
        showOnPublicList: group.showOnPublicList,
      },
    });
  } catch (err) {
    addToLog(
      "displayEventGroup",
      "error",
      `Attempt to display group ${req.params.eventGroupID} failed: ${err}`
    );
    return res.status(404).render("404", frontendConfig(res));
  }
});

// ICS feeds
router.get("/group/:eventGroupID/feed.ics", async (req: Request, res: Response) => {
  try {
    const group = await prisma.eventGroup.findUnique({ where: { id: req.params.eventGroupID } });
    if (group) {
      const events = await prisma.event.findMany({ where: { eventGroupId: group.id }, orderBy: { start: 'asc' } });
      const cal = exportIcal(events, group.name);
      res.header("Content-Type","text/calendar").send(cal);
    } else {
      res.status(404).render("404", frontendConfig(res));
    }
  } catch (err) {
    addToLog("eventGroupFeed","error",`Group feed failed for ${req.params.eventGroupID}: ${err}`);
    return res.status(404).render("404", frontendConfig(res));
  }
});

router.get("/export/event/:eventID", async (req: Request, res: Response) => {
  try {
    const event = await prisma.event.findUnique({ where: { id: req.params.eventID }, include: { eventGroup: true } });
    if (event) {
      const cal = exportIcal([event], event.name);
      res.header("Content-Type","text/calendar").send(cal);
    } else {
      res.status(404).render("404", frontendConfig(res));
    }
  } catch (err) {
    addToLog("exportEvent","error",`Export event failed for ${req.params.eventID}: ${err}`);
    return res.status(404).render("404", frontendConfig(res));
  }
});

router.get("/export/group/:eventGroupID", async (req: Request, res: Response) => {
  try {
    const group = await prisma.eventGroup.findUnique({ where: { id: req.params.eventGroupID } });
    if (group) {
      const events = await prisma.event.findMany({ where: { eventGroupId: group.id }, orderBy: { start: 'asc' } });
      const cal = exportIcal(events, group.name);
      res.header("Content-Type","text/calendar").send(cal);
    } else {
      res.status(404).render("404", frontendConfig(res));
    }
  } catch (err) {
    addToLog("exportGroup","error",`Export group failed for ${req.params.eventGroupID}: ${err}`);
    return res.status(404).render("404", frontendConfig(res));
  }
});

export default router;
