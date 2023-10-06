import { Router, Request, Response } from "express";
import Event from "../models/Event.js";
import moment from "moment-timezone";
import { marked } from "marked";
import { frontendConfig } from "../util/config.js";
import { renderPlain } from "../util/markdown.js";
import getConfig from "../lib/config.js";
import { addToLog } from "../helpers.js";

const config = getConfig();

const router = Router();
router.get("/", (_: Request, res: Response) => {
  res.render("home", frontendConfig());
});

router.get("/new", (_: Request, res: Response) => {
  res.render("newevent", {
    title: "New event",
    ...frontendConfig(),
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
      res.status(404);
      res.render("404", { url: req.url });
      return;
    }
    const parsedLocation = event.location.replace(/\s+/g, "+");
    let displayDate;
    if (moment.tz(event.end, event.timezone).isSame(event.start, "day")) {
      // Happening during one day
      displayDate =
        moment
          .tz(event.start, event.timezone)
          .format(
            'dddd D MMMM YYYY [<span class="text-muted">from</span>] h:mm a'
          ) +
        moment
          .tz(event.end, event.timezone)
          .format(
            ' [<span class="text-muted">to</span>] h:mm a [<span class="text-muted">](z)[</span>]'
          );
    } else {
      displayDate =
        moment
          .tz(event.start, event.timezone)
          .format(
            'dddd D MMMM YYYY [<span class="text-muted">at</span>] h:mm a'
          ) +
        moment
          .tz(event.end, event.timezone)
          .format(
            ' [<span class="text-muted">–</span>] dddd D MMMM YYYY [<span class="text-muted">at</span>] h:mm a [<span class="text-muted">](z)[</span>]'
          );
    }
    let eventStartISO = moment.tz(event.start, "Etc/UTC").toISOString();
    let eventEndISO = moment.tz(event.end, "Etc/UTC").toISOString();
    let parsedStart = moment
      .tz(event.start, event.timezone)
      .format("YYYYMMDD[T]HHmmss");
    let parsedEnd = moment
      .tz(event.end, event.timezone)
      .format("YYYYMMDD[T]HHmmss");
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
    let fromNow = moment.tz(event.start, event.timezone).fromNow();
    let parsedDescription = marked.parse(event.description);
    let eventEditToken = event.editToken;

    let escapedName = event.name.replace(/\s+/g, "+");

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
        { firstLoad: false }
      );
    }
    let editingEnabled = false;
    if (Object.keys(req.query).length !== 0) {
      if (!req.query.e) {
        editingEnabled = false;
        console.log("No edit token set");
      } else {
        if (req.query.e === eventEditToken) {
          editingEnabled = true;
        } else {
          editingEnabled = false;
        }
      }
    }
    let eventAttendees = event.attendees
      ?.sort((a, b) => (a.name > b.name ? 1 : b.name > a.name ? -1 : 0))
      .map((el) => {
        if (!el.id) {
          el.id = el._id;
        }
        if (el.number && el.number > 1) {
          el.name = `${el.name} (${el.number} people)`;
        }
        return el;
      })
      .filter((obj, pos, arr) => {
        return (
          obj.status === "attending" &&
          arr.map((mapObj) => mapObj.id).indexOf(obj.id) === pos
        );
      });

    let spotsRemaining, noMoreSpots;
    let numberOfAttendees =
      eventAttendees?.reduce((acc, attendee) => {
        if (attendee.status === "attending") {
          return acc + (attendee.number || 1);
        }
        return acc;
      }, 0) || 0;
    if (event.maxAttendees) {
      spotsRemaining = event.maxAttendees - numberOfAttendees;
      if (spotsRemaining <= 0) {
        noMoreSpots = true;
      }
    }
    let metadata = {
      title: event.name,
      description: marked
        .parse(event.description, { renderer: renderPlain() })
        .split(" ")
        .splice(0, 40)
        .join(" ")
        .trim(),
      image: eventHasCoverImage
        ? `https://${config.general.domain}/events/` + event.image
        : null,
      url: `https://${config.general.domain}/` + req.params.eventID,
    };
    if (
      req.headers.accept &&
      (req.headers.accept.includes("application/activity+json") ||
        req.headers.accept.includes("application/json") ||
        req.headers.accept.includes("application/json+ld"))
    ) {
      res
        .header("Content-Type", "application/activity+json")
        .send(JSON.parse(event.activityPubActor || "{}"));
    } else {
      res.set("X-Robots-Tag", "noindex");
      res.render("event", {
        ...frontendConfig(),
        title: event.name,
        escapedName: escapedName,
        eventData: event,
        eventAttendees: eventAttendees,
        numberOfAttendees,
        spotsRemaining: spotsRemaining,
        noMoreSpots: noMoreSpots,
        eventStartISO: eventStartISO,
        eventEndISO: eventEndISO,
        parsedLocation: parsedLocation,
        parsedStart: parsedStart,
        parsedEnd: parsedEnd,
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
        metadata: metadata,
      });
    }
  } catch (err) {
    addToLog(
      "displayEvent",
      "error",
      "Attempt to display event " +
        req.params.eventID +
        " failed with error: " +
        err
    );
    console.log(err);
    res.status(404).render("404", { url: req.url });
  }
});

export default router;
