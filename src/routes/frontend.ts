import { Router, Request, Response } from "express";
import moment from "moment-timezone";
import { marked } from "marked";
import { frontendConfig } from "../util/config.js";
import { renderPlain } from "../util/markdown.js";
import getConfig from "../lib/config.js";
import { addToLog, exportICal } from "../helpers.js";
import Event from "../models/Event.js";
import EventGroup, { IEventGroup } from "../models/EventGroup.js";

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
                        'dddd D MMMM YYYY [<span class="text-muted">from</span>] h:mm a',
                    ) +
                moment
                    .tz(event.end, event.timezone)
                    .format(
                        ' [<span class="text-muted">to</span>] h:mm a [<span class="text-muted">](z)[</span>]',
                    );
        } else {
            displayDate =
                moment
                    .tz(event.start, event.timezone)
                    .format(
                        'dddd D MMMM YYYY [<span class="text-muted">at</span>] h:mm a',
                    ) +
                moment
                    .tz(event.end, event.timezone)
                    .format(
                        ' [<span class="text-muted">–</span>] dddd D MMMM YYYY [<span class="text-muted">at</span>] h:mm a [<span class="text-muted">](z)[</span>]',
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
        // See: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/datetime-local
        const parsedStartForDateInput = moment
            .tz(event.start, event.timezone)
            .format("YYYY-MM-DDTHH:mm");
        const parsedEndForDateInput = moment
            .tz(event.end, event.timezone)
            .format("YYYY-MM-DDTHH:mm");
        let eventHasConcluded = false;
        if (
            moment
                .tz(event.end, event.timezone)
                .isBefore(moment.tz(event.timezone))
        ) {
            eventHasConcluded = true;
        }
        let eventHasBegun = false;
        if (
            moment
                .tz(event.start, event.timezone)
                .isBefore(moment.tz(event.timezone))
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
                { firstLoad: false },
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
            res.header("Content-Type", "application/activity+json").send(
                JSON.parse(event.activityPubActor || "{}"),
            );
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
                metadata: metadata,
                jsonData: {
                    name: event.name,
                    id: event.id,
                    description: event.description,
                    location: event.location,
                    timezone: event.timezone,
                    url: event.url,
                    hostName: event.hostName,
                    creatorEmail: event.creatorEmail,
                    eventGroupID: event.eventGroup
                        ? (event.eventGroup as unknown as IEventGroup).id
                        : null,
                    eventGroupEditToken: event.eventGroup
                        ? (event.eventGroup as unknown as IEventGroup).editToken
                        : null,
                    usersCanAttend: event.usersCanAttend,
                    usersCanComment: event.usersCanComment,
                    maxAttendees: event.maxAttendees,
                    startISO: eventStartISO,
                    endISO: eventEndISO,
                    startForDateInput: parsedStartForDateInput,
                    endForDateInput: parsedEndForDateInput,
                    image: event.image,
                    editToken: editingEnabled ? eventEditToken : null,
                },
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
        res.status(404).render("404", { url: req.url });
    }
});

router.get("/group/:eventGroupID", async (req: Request, res: Response) => {
    try {
        const eventGroup = await EventGroup.findOne({
            id: req.params.eventGroupID,
        }).lean();

        if (!eventGroup) {
            return res.status(404).render("404", { url: req.url });
        }
        const parsedDescription = marked.parse(eventGroup.description);
        const eventGroupEditToken = eventGroup.editToken;
        const escapedName = eventGroup.name.replace(/\s+/g, "+");
        const eventGroupHasCoverImage = !!eventGroup.image;
        const eventGroupHasHost = !!eventGroup.hostName;

        const events = await Event.find({ eventGroup: eventGroup._id })
            .lean()
            .sort("start");

        const updatedEvents = events.map((event) => {
            const startMoment = moment.tz(event.start, event.timezone);
            const endMoment = moment.tz(event.end, event.timezone);
            const isSameDay = startMoment.isSame(endMoment, "day");

            return {
                id: event.id,
                name: event.name,
                displayDate: isSameDay
                    ? startMoment.format("D MMM YYYY")
                    : `${startMoment.format("D MMM YYYY")} - ${endMoment.format(
                          "D MMM YYYY",
                      )}`,
                eventHasConcluded: endMoment.isBefore(
                    moment.tz(event.timezone),
                ),
            };
        });

        const upcomingEventsExist = updatedEvents.some(
            (e) => !e.eventHasConcluded,
        );

        let firstLoad = false;
        if (eventGroup.firstLoad === true) {
            firstLoad = true;
            await EventGroup.findOneAndUpdate(
                { id: req.params.eventGroupID },
                { firstLoad: false },
            );
        }

        let editingEnabled = false;
        if (Object.keys(req.query).length !== 0) {
            if (!req.query.e) {
                editingEnabled = false;
            } else {
                editingEnabled = req.query.e === eventGroupEditToken;
            }
        }

        const metadata = {
            title: eventGroup.name,
            description: marked
                .parse(eventGroup.description, {
                    renderer: renderPlain(),
                })
                .split(" ")
                .splice(0, 40)
                .join(" ")
                .trim(),
            image: eventGroupHasCoverImage
                ? `https://${config.general.domain}/events/` + eventGroup.image
                : null,
            url: `https://${config.general.domain}/` + req.params.eventID,
        };

        res.set("X-Robots-Tag", "noindex");
        res.render("eventgroup", {
            domain: config.general.domain,
            title: eventGroup.name,
            eventGroupData: eventGroup,
            escapedName: escapedName,
            events: updatedEvents,
            upcomingEventsExist: upcomingEventsExist,
            parsedDescription: parsedDescription,
            editingEnabled: editingEnabled,
            eventGroupHasCoverImage: eventGroupHasCoverImage,
            eventGroupHasHost: eventGroupHasHost,
            firstLoad: firstLoad,
            metadata: metadata,
            jsonData: {
                name: eventGroup.name,
                id: eventGroup.id,
                description: eventGroup.description,
                url: eventGroup.url,
                hostName: eventGroup.hostName,
                creatorEmail: eventGroup.creatorEmail,
                image: eventGroup.image,
                editToken: editingEnabled ? eventGroupEditToken : null,
            },
        });
    } catch (err) {
        addToLog(
            "displayEventGroup",
            "error",
            `Attempt to display event group ${req.params.eventGroupID} failed with error: ${err}`,
        );
        console.log(err);
        return res.status(404).render("404", { url: req.url });
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
                const string = exportICal(events, eventGroup.name);
                res.set("Content-Type", "text/calendar");
                res.send(string);
            }
        } catch (err) {
            addToLog(
                "eventGroupFeed",
                "error",
                `Attempt to display event group feed for ${req.params.eventGroupID} failed with error: ${err}`,
            );
            console.log(err);
            res.status(404).render("404", { url: req.url });
        }
    },
);

router.get("/export/event/:eventID", async (req: Request, res: Response) => {
    try {
        const event = await Event.findOne({
            id: req.params.eventID,
        }).populate("eventGroup");

        if (event) {
            const string = exportICal([event], event.name);
            res.send(string);
        }
    } catch (err) {
        addToLog(
            "exportEvent",
            "error",
            `Attempt to export event ${req.params.eventID} failed with error: ${err}`,
        );
        console.log(err);
        res.status(404).render("404", { url: req.url });
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
                const string = exportICal(events, eventGroup.name);
                res.send(string);
            }
        } catch (err) {
            addToLog(
                "exportEvent",
                "error",
                `Attempt to export event group ${req.params.eventGroupID} failed with error: ${err}`,
            );
            console.log(err);
            res.status(404).render("404", { url: req.url });
        }
    },
);

export default router;
