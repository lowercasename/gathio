import { Router, Response, Request } from "express";
import multer from "multer";
import Jimp from "jimp";
import moment from "moment-timezone";
import {
    generateEditToken,
    generateEventID,
    generateRSAKeypair,
    hashString,
} from "../util/generator.js";
import { validateEventData } from "../util/validation.js";
import { addToLog } from "../helpers.js";
import Event from "../models/Event.js";
import EventGroup from "../models/EventGroup.js";
import {
    broadcastCreateMessage,
    broadcastUpdateMessage,
    createActivityPubActor,
    createActivityPubEvent,
    createFeaturedPost,
    sendDirectMessage,
    updateActivityPubActor,
    updateActivityPubEvent,
} from "../activitypub.js";
import { sendEmailFromTemplate } from "../lib/email.js";
import crypto from "crypto";
import ical from "ical";
import { markdownToSanitizedHTML } from "../util/markdown.js";
import { checkMagicLink, getConfigMiddleware } from "../lib/middleware.js";
import { getConfig } from "../lib/config.js";
const config = getConfig();


const storage = multer.memoryStorage();
// Accept only JPEG, GIF or PNG images, up to 10MB
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: function (_, file, cb) {
        const filetypes = /jpeg|jpg|png|gif/;
        const mimetype = filetypes.test(file.mimetype);
        if (!mimetype) {
            return cb(new Error("Only JPEG, PNG and GIF images are allowed."));
        }
        cb(null, true);
    },
});
const icsUpload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: function (_, file, cb) {
        const filetype = "text/calendar";
        if (file.mimetype !== filetype) {
            return cb(new Error("Only ICS files are allowed."));
        }
        cb(null, true);
    },
});

const router = Router();

router.use(getConfigMiddleware);

router.post(
    "/event",
    upload.single("imageUpload"),
    checkMagicLink,
    async (req: Request, res: Response) => {
        const { data: eventData, errors } = validateEventData(req.body);
        if (errors && errors.length > 0) {
            return res.status(400).json({ errors });
        }
        if (!eventData) {
            return res.status(400).json({
                errors: [
                    {
                        message: "No event data was provided.",
                    },
                ],
            });
        }

        const eventID = generateEventID();
        const editToken = generateEditToken();
        let eventImageFilename;
        let isPartOfEventGroup = false;

        if (req.file?.buffer) {
            eventImageFilename = await Jimp.read(req.file.buffer)
                .then((img) => {
                    img.resize(920, Jimp.AUTO) // resize
                        .quality(80) // set JPEG quality
                        .write("./public/events/" + eventID + ".jpg"); // save
                    return eventID + ".jpg";
                })
                .catch((err) => {
                    addToLog(
                        "Jimp",
                        "error",
                        "Attempt to edit image failed with error: " + err,
                    );
                });
        }

        const startUTC = moment.tz(eventData.eventStart, eventData.timezone);
        const endUTC = moment.tz(eventData.eventEnd, eventData.timezone);
        let eventGroup;
        if (eventData?.eventGroupBoolean) {
            try {
                eventGroup = await EventGroup.findOne({
                    id: eventData.eventGroupID,
                    editToken: eventData.eventGroupEditToken,
                });
                if (eventGroup) {
                    isPartOfEventGroup = true;
                }
            } catch (err) {
                console.error(err);
                addToLog(
                    "createEvent",
                    "error",
                    "Attempt to find event group failed with error: " + err,
                );
            }
        }

        // generate RSA keypair for ActivityPub
        const { publicKey, privateKey } = generateRSAKeypair();

        const event = new Event({
            id: eventID,
            type: "public", // This is for backwards compatibility
            name: eventData.eventName,
            location: eventData.eventLocation,
            start: startUTC,
            end: endUTC,
            timezone: eventData.timezone,
            description: eventData.eventDescription,
            image: eventImageFilename,
            creatorEmail: eventData.creatorEmail,
            url: eventData.eventURL,
            hostName: eventData.hostName,
            viewPassword: "", // Backwards compatibility
            editPassword: "", // Backwards compatibility
            editToken: editToken,
            showOnPublicList: eventData?.publicBoolean,
            eventGroup: isPartOfEventGroup ? eventGroup?._id : null,
            usersCanAttend: eventData.joinBoolean ? true : false,
            showUsersList: false, // Backwards compatibility
            usersCanComment: eventData.interactionBoolean ? true : false,
            maxAttendees: eventData.maxAttendees,
            firstLoad: true,
            activityPubActor: createActivityPubActor(
                eventID,
                res.locals.config?.general.domain,
                publicKey,
                markdownToSanitizedHTML(eventData.eventDescription),
                eventData.eventName,
                eventData.eventLocation,
                eventImageFilename,
                startUTC,
                endUTC,
                eventData.timezone,
            ),
            activityPubEvent: createActivityPubEvent(
                eventData.eventName,
                startUTC,
                endUTC,
                eventData.timezone,
                eventData.eventDescription,
                eventData.eventLocation,
            ),
            activityPubMessages: [
                {
                    id: `https://${res.locals.config?.general.domain}/${eventID}/m/featuredPost`,
                    content: JSON.stringify(
                        createFeaturedPost(
                            eventID,
                            eventData.eventName,
                            startUTC,
                            endUTC,
                            eventData.timezone,
                            eventData.eventDescription,
                            eventData.eventLocation,
                        ),
                    ),
                },
            ],
            publicKey,
            privateKey,
        });
        try {
            const savedEvent = await event.save();
            addToLog("createEvent", "success", "Event " + eventID + "created");
            // Send email with edit link
            if (eventData.creatorEmail && req.app.locals.sendEmails) {
                sendEmailFromTemplate(
                    eventData.creatorEmail,
                    "",
                    `${eventData.eventName}`,
                    "createEvent",
                    {
                        eventID,
                        editToken,
                    }
                );
            }
            // If the event was added to a group, send an email to any group
            // subscribers
            if (event.eventGroup && req.app.locals.sendEmails) {
                try {
                    const eventGroup = await EventGroup.findOne({
                        _id: event.eventGroup.toString(),
                    });
                    if (!eventGroup) {
                        throw new Error(
                            "Event group not found for event " + eventID,
                        );
                    }
                    const subscribers = eventGroup?.subscribers?.reduce(
                        (acc: string[], current) => {
                            if (current.email && !acc.includes(current.email)) {
                                return [current.email, ...acc];
                            }
                            return acc;
                        },
                        [] as string[],
                    );
                    subscribers?.forEach((emailAddress) => {
                        sendEmailFromTemplate(
                            emailAddress,
                            "",
                            `New event in ${eventGroup.name}`,
                            "eventGroupUpdated",
                            {
                                eventGroupName: eventGroup.name,
                                eventName: event.name,
                                eventID: event.id,
                                eventGroupID: eventGroup.id,
                                emailAddress: encodeURIComponent(emailAddress),
                            }
                        );
                    });
                } catch (err) {
                    console.error(err);
                    addToLog(
                        "createEvent",
                        "error",
                        "Attempt to send event group emails failed with error: " +
                            err,
                    );
                }
            }
            return res.json({
                eventID: eventID,
                editToken: editToken,
                url: `/${eventID}?e=${editToken}`,
            });
        } catch (err) {
            console.error(err);
            addToLog(
                "createEvent",
                "error",
                "Attempt to create event failed with error: " + err,
            );
            return res.status(500).json({
                errors: [
                    {
                        message: err,
                    },
                ],
            });
        }
    },
);

router.put(
    "/event/:eventID",
    upload.single("imageUpload"),
    async (req: Request, res: Response) => {
        const { data: eventData, errors } = validateEventData(req.body);
        if (errors && errors.length > 0) {
            return res.status(400).json({ errors });
        }
        if (!eventData) {
            return res.status(400).json({
                errors: [
                    {
                        message: "No event data was provided.",
                    },
                ],
            });
        }

        try {
            const submittedEditToken = req.body.editToken;
            const event = await Event.findOne({
                id: req.params.eventID,
            });
            if (!event) {
                return res.status(404).json({
                    errors: [
                        {
                            message: "Event not found.",
                        },
                    ],
                });
            }
            if (event.editToken !== submittedEditToken) {
                // Token doesn't match
                addToLog(
                    "editEvent",
                    "error",
                    `Attempt to edit event ${req.params.eventID} failed with error: token does not match`,
                );
                return res.status(403).json({
                    errors: [
                        {
                            message: "Edit token is invalid.",
                        },
                    ],
                });
            }
            // Token matches
            // If there is a new image, upload that first
            const eventID = req.params.eventID;
            let eventImageFilename = event.image;
            if (req.file?.buffer) {
                Jimp.read(req.file.buffer)
                    .then((img) => {
                        img.resize(920, Jimp.AUTO) // resize
                            .quality(80) // set JPEG quality
                            .write(`./public/events/${eventID}.jpg`); // save
                    })
                    .catch((err) => {
                        addToLog(
                            "Jimp",
                            "error",
                            "Attempt to edit image failed with error: " + err,
                        );
                    });
                eventImageFilename = eventID + ".jpg";
            }

            const startUTC = moment.tz(
                eventData.eventStart,
                eventData.timezone,
            );
            const endUTC = moment.tz(eventData.eventEnd, eventData.timezone);

            let isPartOfEventGroup = false;
            let eventGroup;
            if (eventData.eventGroupBoolean) {
                eventGroup = await EventGroup.findOne({
                    id: eventData.eventGroupID,
                    editToken: eventData.eventGroupEditToken,
                });
                if (eventGroup) {
                    isPartOfEventGroup = true;
                }
            }
            const updatedEvent = {
                name: eventData.eventName,
                location: eventData.eventLocation,
                start: startUTC.toDate(),
                end: endUTC.toDate(),
                timezone: eventData.timezone,
                description: eventData.eventDescription,
                url: eventData.eventURL,
                hostName: eventData.hostName,
                image: eventImageFilename,
                showOnPublicList: eventData.publicBoolean,
                usersCanAttend: eventData.joinBoolean,
                showUsersList: false, // Backwards compatibility
                usersCanComment: eventData.interactionBoolean,
                maxAttendees: eventData.maxAttendeesBoolean
                    ? eventData.maxAttendees
                    : undefined,
                eventGroup: isPartOfEventGroup ? eventGroup?._id : null,
                activityPubActor: event.activityPubActor
                    ? updateActivityPubActor(
                          JSON.parse(event.activityPubActor),
                          eventData.eventDescription,
                          eventData.eventName,
                          eventData.eventLocation,
                          eventImageFilename,
                          startUTC,
                          endUTC,
                          eventData.timezone,
                      )
                    : undefined,
                activityPubEvent: event.activityPubEvent
                    ? updateActivityPubEvent(
                          JSON.parse(event.activityPubEvent),
                          eventData.eventName,
                          startUTC,
                          endUTC,
                          eventData.timezone,
                      )
                    : undefined,
            };
            let diffText =
                "<p>This event was just updated with new information.</p><ul>";
            let displayDate;
            if (event.name !== updatedEvent.name) {
                diffText += `<li>the event name changed to ${updatedEvent.name}</li>`;
            }
            if (event.location !== updatedEvent.location) {
                diffText += `<li>the location changed to ${updatedEvent.location}</li>`;
            }
            if (
                event.start.toISOString() !== updatedEvent.start.toISOString()
            ) {
                displayDate = moment
                    .tz(updatedEvent.start, updatedEvent.timezone)
                    .format("dddd D MMMM YYYY h:mm a");
                diffText += `<li>the start time changed to ${displayDate}</li>`;
            }
            if (event.end.toISOString() !== updatedEvent.end.toISOString()) {
                displayDate = moment
                    .tz(updatedEvent.end, updatedEvent.timezone)
                    .format("dddd D MMMM YYYY h:mm a");
                diffText += `<li>the end time changed to ${displayDate}</li>`;
            }
            if (event.timezone !== updatedEvent.timezone) {
                diffText += `<li>the time zone changed to ${updatedEvent.timezone}</li>`;
            }
            if (event.description !== updatedEvent.description) {
                diffText += `<li>the event description changed</li>`;
            }
            diffText += `</ul>`;
            const updatedEventObject = await Event.findOneAndUpdate(
                { id: req.params.eventID },
                updatedEvent,
                { new: true },
            );
            if (!updatedEventObject) {
                throw new Error("Event not found");
            }
            addToLog(
                "editEvent",
                "success",
                "Event " + req.params.eventID + " edited",
            );
            // send update to ActivityPub subscribers
            const attendees = updatedEventObject.attendees?.filter((el) => el.id);
            // broadcast an identical message to all followers, will show in home timeline
            const guidObject = crypto.randomBytes(16).toString("hex");
            const jsonObject = {
                "@context": "https://www.w3.org/ns/activitystreams",
                id: `https://${res.locals.config?.general.domain}/${req.params.eventID}/m/${guidObject}`,
                name: `RSVP to ${event.name}`,
                type: "Note",
                cc: "https://www.w3.org/ns/activitystreams#Public",
                content: `${diffText} See here: <a href="https://${res.locals.config?.general.domain}/${req.params.eventID}">https://${res.locals.config?.general.domain}/${req.params.eventID}</a>`,
            };
            broadcastCreateMessage(jsonObject, event.followers, eventID);
            // also broadcast an Update profile message to all followers so that at least Mastodon servers will update the local profile information
            const jsonUpdateObject = JSON.parse(event.activityPubActor || "{}");
            broadcastUpdateMessage(jsonUpdateObject, event.followers, eventID);
            // also broadcast an Update/Event for any calendar apps that are consuming our Events
            const jsonEventObject = JSON.parse(event.activityPubEvent || "{}");
            broadcastUpdateMessage(jsonEventObject, event.followers, eventID);

            // DM to attendees
            if (attendees?.length) {
                for (const attendee of attendees) {
                    const jsonObject = {
                        "@context": "https://www.w3.org/ns/activitystreams",
                        name: `RSVP to ${event.name}`,
                        type: "Note",
                        content: `<span class=\"h-card\"><a href="${attendee.id}" class="u-url mention">@<span>${attendee.name}</span></a></span> ${diffText} See here: <a href="https://${res.locals.config?.general.domain}/${req.params.eventID}">https://${res.locals.config?.general.domain}/${req.params.eventID}</a>`,
                        tag: [
                            {
                                type: "Mention",
                                href: attendee.id,
                                name: attendee.name,
                            },
                        ],
                    };
                    // send direct message to user
                    sendDirectMessage(jsonObject, attendee.id, eventID);
                }
            }
            // Send update to all attendees
            if (req.app.locals.sendEmails) {
                const attendeeEmails = event.attendees
                    ?.filter((o) => o.status === "attending" && o.email)
                    .map((o) => o.email!);
                if (attendeeEmails?.length) {
                    sendEmailFromTemplate(
                        config.general.email,
                        attendeeEmails,
                        `${event.name} was just edited`,
                        "editEvent",
                        {
                            diffText,
                            eventID: req.params.eventID,
                        },
                    );
                }
            }
            res.sendStatus(200);
        } catch (err) {
            console.error(err);
            addToLog(
                "editEvent",
                "error",
                "Attempt to edit event " +
                    req.params.eventID +
                    " failed with error: " +
                    err,
            );
            return res.status(500).json({
                errors: [
                    {
                        message: err,
                    },
                ],
            });
        }
    },
);

router.post(
    "/import/event",
    icsUpload.single("icsImportControl"),
    checkMagicLink,
    async (req: Request, res: Response) => {
        if (!req.file) {
            return res.status(400).json({
                errors: [
                    {
                        message: "No file was provided.",
                    },
                ],
            });
        }

        const eventID = generateEventID();
        const editToken = generateEditToken();

        const iCalObject = ical.parseICS(req.file.buffer.toString("utf8"));

        const importedEventData = iCalObject[Object.keys(iCalObject)[0]];

        let creatorEmail: string | undefined;
        if (req.body.creatorEmail) {
            creatorEmail = req.body.creatorEmail;
        } else if (importedEventData.organizer) {
            if (typeof importedEventData.organizer === "string") {
                creatorEmail = importedEventData.organizer.replace(
                    "MAILTO:",
                    "",
                );
            } else {
                creatorEmail = importedEventData.organizer.val.replace(
                    "MAILTO:",
                    "",
                );
            }
        }

        let hostName: string | undefined;
        if (importedEventData.organizer) {
            if (typeof importedEventData.organizer === "string") {
                hostName = importedEventData.organizer.replace(/["]+/g, "");
            } else {
                hostName = importedEventData.organizer.params.CN.replace(
                    /["]+/g,
                    "",
                );
            }
        }

        const event = new Event({
            id: eventID,
            type: "public",
            name: importedEventData.summary,
            location: importedEventData.location,
            start: importedEventData.start,
            end: importedEventData.end,
            timezone: "Etc/UTC", // TODO: get timezone from ics file
            description: importedEventData.description,
            image: "",
            creatorEmail,
            url: "",
            hostName,
            viewPassword: "",
            editPassword: "",
            editToken: editToken,
            usersCanAttend: false,
            showUsersList: false,
            usersCanComment: false,
            firstLoad: true,
        });
        try {
            await event.save();
            addToLog("createEvent", "success", `Event ${eventID} created`);
            // Send email with edit link
            if (creatorEmail && req.app.locals.sendEmails) {
                sendEmailFromTemplate(
                    creatorEmail,
                    "",
                    `${importedEventData.summary}`,
                    "createEvent",
                    {
                        eventID,
                        editToken,
                    },
                );
            }
            return res.json({
                eventID: eventID,
                editToken: editToken,
                url: `/${eventID}?e=${editToken}`,
            });
        } catch (err) {
            console.error(err);
            addToLog(
                "createEvent",
                "error",
                "Attempt to create event failed with error: " + err,
            );
            return res.status(500).json({
                errors: [
                    {
                        message: err,
                    },
                ],
            });
        }
    },
);

router.delete(
    "/event/attendee/:eventID",
    async (req: Request, res: Response) => {
        const removalPassword = req.query.p;
        if (!removalPassword) {
            return res
                .status(400)
                .json({ error: "Please provide a removal password." });
        }
        try {
            const response = await Event.findOne({
                id: req.params.eventID,
                "attendees.removalPassword": removalPassword,
            });
            if (!response) {
                return res.status(404).json({
                    error: "No attendee found with that removal password.",
                });
            }
            const attendee = response?.attendees?.find(
                (a) => a.removalPassword === removalPassword,
            );
            if (!attendee) {
                return res.status(404).json({
                    error: "No attendee found with that removal password.",
                });
            }
            const attendeeEmail = attendee.email;
            const removalResponse = await Event.updateOne(
                { id: req.params.eventID },
                { $pull: { attendees: { removalPassword } } },
            );
            if (removalResponse.nModified === 0) {
                return res.status(404).json({
                    error: "No attendee found with that removal password.",
                });
            }
            addToLog(
                "unattendEvent",
                "success",
                `Attendee removed self from event ${req.params.eventID}`,
            );
            if (attendeeEmail && req.app.locals.sendEmails) {
                await sendEmailFromTemplate(
                    attendeeEmail,
                    "",
                    "You have been removed from an event",
                    "unattendEvent",
                    {
                        eventID: req.params.eventID,
                    },
                );
            }
            res.sendStatus(200);
        } catch (e) {
            addToLog(
                "removeEventAttendee",
                "error",
                `Attempt to remove attendee from event ${req.params.eventID} failed with error: ${e}`,
            );
            return res.status(500).json({
                error: "There has been an unexpected error. Please try again.",
            });
        }
    },
);

// Used to one-click unattend an event from an email.
router.get(
    "/event/:eventID/unattend/:removalPasswordHash",
    async (req: Request, res: Response) => {
        // Find the attendee by the unattendPasswordHash
        const event = await Event.findOne({ id: req.params.eventID });
        if (!event) {
            return res.redirect("/404");
        }
        const attendee = event.attendees?.find(
            (o) =>
                hashString(o.removalPassword || "") ===
                req.params.removalPasswordHash,
        );
        if (!attendee) {
            return res.redirect(`/${req.params.eventID}`);
        }
        // Remove the attendee from the event
        event.attendees = event.attendees?.filter(
            (o) => o.removalPassword !== attendee.removalPassword,
        );
        await event.save();
        // Send email to the attendee
        if (req.app.locals.sendEmails && attendee.email) {
            sendEmailFromTemplate(
                attendee.email,
                "",
                `You have been removed from ${event.name}`,
                "unattendEvent",
                {
                    event,
                },
            );
        }
        return res.redirect(`/${req.params.eventID}?m=unattend`);
    },
);

export default router;
