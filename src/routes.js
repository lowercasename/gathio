import fs from "fs";
import express from "express";
import { customAlphabet } from "nanoid";
import randomstring from "randomstring";
import { frontendConfig, getConfig } from "./lib/config.js";
import { addToLog } from "./helpers.js";
import moment from "moment-timezone";
import crypto from "crypto";
import request from "request";
import niceware from "niceware";
import ical from "ical";
import fileUpload from "express-fileupload";
import Jimp from "jimp";
import schedule from "node-schedule";
import {
    broadcastCreateMessage,
    broadcastDeleteMessage,
    processInbox,
} from "./activitypub.js";
import Event from "./models/Event.js";
import EventGroup from "./models/EventGroup.js";
import path from "path";
import { activityPubContentType } from "./lib/activitypub.js";
import { hashString } from "./util/generator.js";
import i18next from "i18next";
import { EmailService } from "./lib/email.js";

const config = getConfig();
const domain = config.general.domain;
const isFederated = config.general.is_federated || true;

// This alphabet (used to generate all event, group, etc. IDs) is missing '-'
// because ActivityPub doesn't like it in IDs
const nanoid = customAlphabet(
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_",
    21,
);

const router = express.Router();
router.use(fileUpload());

// SCHEDULED DELETION
schedule.scheduleJob("59 23 * * *", function (fireDate) {
    const deleteAfterDays = config.general.delete_after_days;
    if (!deleteAfterDays || deleteAfterDays <= 0) {
        // Deletion is disabled
        return;
    }

    const too_old = moment
        .tz("Etc/UTC")
        .subtract(deleteAfterDays, "days")
        .toDate();
    console.log(
        "Old event deletion running! Deleting all events concluding before ",
        too_old,
    );

    Event.find({ end: { $lte: too_old } })
        .then((oldEvents) => {
            oldEvents.forEach((event) => {
                const deleteEventFromDB = (id) => {
                    Event.remove({ _id: id })
                        .then((response) => {
                            addToLog(
                                "deleteOldEvents",
                                "success",
                                "Old event " + id + " deleted",
                            );
                        })
                        .catch((err) => {
                            addToLog(
                                "deleteOldEvents",
                                "error",
                                "Attempt to delete old event " +
                                    id +
                                    " failed with error: " +
                                    err,
                            );
                        });
                };

                if (event.image) {
                    fs.unlink(
                        path.join(
                            process.cwd(),
                            "/public/events/" + event.image,
                        ),
                        (err) => {
                            if (err) {
                                addToLog(
                                    "deleteOldEvents",
                                    "error",
                                    "Attempt to delete event image for old event " +
                                        event.id +
                                        " failed with error: " +
                                        err,
                                );
                            }
                            // Image removed
                            addToLog(
                                "deleteOldEvents",
                                "error",
                                "Image deleted for old event " + event.id,
                            );
                        },
                    );
                }
                // Check if event has ActivityPub fields
                if (event.activityPubActor && event.activityPubEvent) {
                    // Broadcast a Delete profile message to all followers so that at least Mastodon servers will delete their local profile information
                    const guidUpdateObject = crypto
                        .randomBytes(16)
                        .toString("hex");
                    const jsonUpdateObject = JSON.parse(event.activityPubActor);
                    const jsonEventObject = JSON.parse(event.activityPubEvent);
                    // first broadcast AP messages, THEN delete from DB
                    broadcastDeleteMessage(
                        jsonUpdateObject,
                        event.followers,
                        event.id,
                        function (statuses) {
                            broadcastDeleteMessage(
                                jsonEventObject,
                                event.followers,
                                event.id,
                                function (statuses) {
                                    deleteEventFromDB(event._id);
                                },
                            );
                        },
                    );
                } else {
                    // No ActivityPub data - simply delete the event
                    deleteEventFromDB(event._id);
                }
            });
        })
        .catch((err) => {
            addToLog(
                "deleteOldEvents",
                "error",
                "Attempt to delete old event " +
                    event.id +
                    " failed with error: " +
                    err,
            );
        });

    // TODO: While we're here, also remove all provisioned event attendees over a day
    // old (they're not going to become active)
});

// BACKEND ROUTES
router.post("/verifytoken/event/:eventID", (req, res) => {
    Event.findOne({
        id: req.params.eventID,
        editToken: req.body.editToken,
    }).then((event) => {
        if (event) return res.sendStatus(200);
        return res.sendStatus(404);
    });
});

router.post("/verifytoken/group/:eventGroupID", (req, res) => {
    EventGroup.findOne({
        id: req.params.eventGroupID,
        editToken: req.body.editToken,
    }).then((group) => {
        if (group) return res.sendStatus(200);
        return res.sendStatus(404);
    });
});

router.post("/deleteimage/:eventID/:editToken", (req, res) => {
    let submittedEditToken = req.params.editToken;
    let eventImage;
    Event.findOne({
        id: req.params.eventID,
    }).then((event) => {
        if (event.editToken === submittedEditToken) {
            // Token matches
            if (event.image) {
                eventImage = event.image;
            } else {
                res.status(500).send(
                    "This event doesn't have a linked image. What are you even doing",
                );
            }
            fs.unlink(
                path.join(process.cwd(), "/public/events/" + eventImage),
                (err) => {
                    if (err) {
                        res.status(500).send(err);
                        addToLog(
                            "deleteEventImage",
                            "error",
                            "Attempt to delete event image for event " +
                                req.params.eventID +
                                " failed with error: " +
                                err,
                        );
                    }
                    // Image removed
                    addToLog(
                        "deleteEventImage",
                        "success",
                        "Image for event " + req.params.eventID + " deleted",
                    );
                    event.image = "";
                    event
                        .save()
                        .then((response) => {
                            res.status(200).send("Success");
                        })
                        .catch((err) => {
                            res.status(500).send(err);
                            addToLog(
                                "deleteEventImage",
                                "error",
                                "Attempt to delete event image for event " +
                                    req.params.eventID +
                                    " failed with error: " +
                                    err,
                            );
                        });
                },
            );
        }
    });
});

router.post("/deleteevent/:eventID/:editToken", (req, res) => {
    let submittedEditToken = req.params.editToken;
    let eventImage;
    Event.findOne({
        id: req.params.eventID,
    })
        .then((event) => {
            if (event.editToken === submittedEditToken) {
                // Token matches

                let eventImage;
                if (event.image) {
                    eventImage = event.image;
                }

                // broadcast a Delete profile message to all followers so that at least Mastodon servers will delete their local profile information
                const guidUpdateObject = crypto.randomBytes(16).toString("hex");
                const jsonUpdateObject = JSON.parse(event.activityPubActor);
                // first broadcast AP messages, THEN delete from DB
                broadcastDeleteMessage(
                    jsonUpdateObject,
                    event.followers,
                    req.params.eventID,
                    function (statuses) {
                        Event.deleteOne(
                            { id: req.params.eventID },
                            function (err, raw) {
                                if (err) {
                                    res.send(err);
                                    addToLog(
                                        "deleteEvent",
                                        "error",
                                        "Attempt to delete event " +
                                            req.params.eventID +
                                            " failed with error: " +
                                            err,
                                    );
                                }
                            },
                        )
                            .then(() => {
                                // Delete image
                                if (eventImage) {
                                    fs.unlink(
                                        path.join(
                                            process.cwd(),
                                            "/public/events/" + eventImage,
                                        ),
                                        (err) => {
                                            if (err) {
                                                res.send(err);
                                                addToLog(
                                                    "deleteEvent",
                                                    "error",
                                                    "Attempt to delete event image for event " +
                                                        req.params.eventID +
                                                        " failed with error: " +
                                                        err,
                                                );
                                            }
                                            // Image removed
                                            addToLog(
                                                "deleteEvent",
                                                "success",
                                                "Event " +
                                                    req.params.eventID +
                                                    " deleted",
                                            );
                                        },
                                    );
                                }
                                res.writeHead(302, {
                                    Location: "/",
                                });
                                res.end();

                                const attendeeEmails = event?.attendees?.filter(
                                        (o) =>
                                            o.status === "attending" &&
                                            o.email,
                                    )
                                    .map((o) => o.email || '') || [];
                                if (attendeeEmails.length) {
                                    console.log(
                                        "Sending emails to: " +
                                            attendeeEmails,
                                    );
                                    req.emailService.sendEmailFromTemplate({
                                        to: attendeeEmails, 
                                        subject: i18next.t("routes.deleteeventsubject", {eventName: event?.name}),
                                        templateName: "deleteEvent",
                                        templateData: {
                                            eventName: event?.name,
                                        },
                                    }).catch((e) => {
                                        console.error('error sending attendee email', e.toString());
                                        res.status(500).end();
                                    });
                                } else {
                                    console.log("Nothing to send!");
                                }
                            })
                            .catch((err) => {
                                res.send(
                                    "Sorry! Something went wrong (error deleting): " +
                                        err,
                                );
                                addToLog(
                                    "deleteEvent",
                                    "error",
                                    "Attempt to delete event " +
                                        req.params.eventID +
                                        " failed with error: " +
                                        err,
                                );
                            });
                    },
                );
            } else {
                // Token doesn't match
                res.send("Sorry! Something went wrong");
                addToLog(
                    "deleteEvent",
                    "error",
                    "Attempt to delete event " +
                        req.params.eventID +
                        " failed with error: token does not match",
                );
            }
        })
        .catch((err) => {
            res.send("Sorry! Something went wrong: " + err);
            addToLog(
                "deleteEvent",
                "error",
                "Attempt to delete event " +
                    req.params.eventID +
                    " failed with error: " +
                    err,
            );
        });
});

router.post("/deleteeventgroup/:eventGroupID/:editToken", (req, res) => {
    let submittedEditToken = req.params.editToken;
    EventGroup.findOne({
        id: req.params.eventGroupID,
    })
        .then(async (eventGroup) => {
            if (eventGroup.editToken === submittedEditToken) {
                // Token matches

                let linkedEvents = await Event.find({
                    eventGroup: eventGroup._id,
                });

                let linkedEventIDs = linkedEvents.map((event) => event._id);
                let eventGroupImage = false;
                if (eventGroup.image) {
                    eventGroupImage = eventGroup.image;
                }

                EventGroup.deleteOne(
                    { id: req.params.eventGroupID },
                    function (err, raw) {
                        if (err) {
                            res.send(err);
                            addToLog(
                                "deleteEventGroup",
                                "error",
                                "Attempt to delete event group " +
                                    req.params.eventGroupID +
                                    " failed with error: " +
                                    err,
                            );
                        }
                    },
                )
                    .then(() => {
                        // Delete image
                        if (eventGroupImage) {
                            fs.unlink(
                                path.join(
                                    process.cwd(),
                                    "/public/events/" + eventGroupImage,
                                ),
                                (err) => {
                                    if (err) {
                                        res.send(err);
                                        addToLog(
                                            "deleteEventGroup",
                                            "error",
                                            "Attempt to delete event image for event group " +
                                                req.params.eventGroupID +
                                                " failed with error: " +
                                                err,
                                        );
                                    }
                                },
                            );
                        }
                        Event.updateOne(
                            { _id: { $in: linkedEventIDs } },
                            { $set: { eventGroup: null } },
                            { multi: true },
                        )
                            .then((response) => {
                                addToLog(
                                    "deleteEventGroup",
                                    "success",
                                    "Event group " +
                                        req.params.eventGroupID +
                                        " deleted",
                                );
                                res.writeHead(302, {
                                    Location: "/",
                                });
                                res.end();
                            })
                            .catch((err) => {
                                res.send(
                                    "Sorry! Something went wrong (error deleting): " +
                                        err,
                                );
                                addToLog(
                                    "deleteEventGroup",
                                    "error",
                                    "Attempt to delete event group " +
                                        req.params.eventGroupID +
                                        " failed with error: " +
                                        err,
                                );
                            });
                    })
                    .catch((err) => {
                        res.send(
                            "Sorry! Something went wrong (error deleting): " +
                                err,
                        );
                        addToLog(
                            "deleteEventGroup",
                            "error",
                            "Attempt to delete event group " +
                                req.params.eventGroupID +
                                " failed with error: " +
                                err,
                        );
                    });
            } else {
                // Token doesn't match
                res.send("Sorry! Something went wrong");
                addToLog(
                    "deleteEventGroup",
                    "error",
                    "Attempt to delete event group " +
                        req.params.eventGroupID +
                        " failed with error: token does not match",
                );
            }
        })
        .catch((err) => {
            res.send("Sorry! Something went wrong: " + err);
            addToLog(
                "deleteEventGroup",
                "error",
                "Attempt to delete event group " +
                    req.params.eventGroupID +
                    " failed with error: " +
                    err,
            );
        });
});

router.post("/attendee/provision", async (req, res) => {
    const removalPassword = niceware.generatePassphrase(6).join("-");
    const newAttendee = {
        status: "provisioned",
        removalPassword,
        created: Date.now(),
    };

    const event = await Event.findOne({ id: req.query.eventID }).catch((e) => {
        addToLog(
            "provisionEventAttendee",
            "error",
            "Attempt to provision attendee in event " +
                req.query.eventID +
                " failed with error: " +
                e,
        );
        return res.sendStatus(500);
    });

    if (!event) {
        return res.sendStatus(404);
    }

    event.attendees.push(newAttendee);
    await event.save().catch((e) => {
        console.log(e);
        addToLog(
            "provisionEventAttendee",
            "error",
            "Attempt to provision attendee in event " +
                req.query.eventID +
                " failed with error: " +
                e,
        );
        return res.sendStatus(500);
    });
    addToLog(
        "provisionEventAttendee",
        "success",
        "Attendee provisioned in event " + req.query.eventID,
    );

    // Return the removal password and the number of free spots remaining
    let freeSpots;
    if (event.maxAttendees !== null && event.maxAttendees !== undefined) {
        freeSpots =
            event.maxAttendees -
            event.attendees.reduce(
                (acc, a) =>
                    acc + (a.status === "attending" ? a.number || 1 : 0),
                0,
            );
    } else {
        freeSpots = undefined;
    }
    return res.json({ removalPassword, freeSpots });
});

router.post("/attendevent/:eventID", async (req, res) => {
    // Do not allow empty removal passwords
    if (!req.body.removalPassword) {
        return res.sendStatus(500);
    }
    const event = await Event.findOne({ id: req.params.eventID }).catch((e) => {
        addToLog(
            "attendEvent",
            "error",
            "Attempt to attend event " +
                req.params.eventID +
                " failed with error: " +
                e,
        );
        return res.sendStatus(500);
    });
    if (!event) {
        return res.sendStatus(404);
    }
    const attendee = event.attendees.find(
        (a) => a.removalPassword === req.body.removalPassword,
    );
    if (!attendee) {
        return res.sendStatus(404);
    }
    // Do we have enough free spots in this event to accomodate this attendee?
    // First, check if the event has a max number of attendees
    if (event.maxAttendees !== null && event.maxAttendees !== undefined) {
        const freeSpots =
            event.maxAttendees -
            event.attendees.reduce(
                (acc, a) =>
                    acc + (a.status === "attending" ? a.number || 1 : 0),
                0,
            );
        if (req.body.attendeeNumber > freeSpots) {
            return res.sendStatus(403);
        }
    }

    Event.findOneAndUpdate(
        {
            id: req.params.eventID,
            "attendees.removalPassword": req.body.removalPassword,
        },
        {
            $set: {
                "attendees.$.status": "attending",
                "attendees.$.name": req.body.attendeeName,
                "attendees.$.email": req.body.attendeeEmail,
                "attendees.$.number": req.body.attendeeNumber,
                "attendees.$.visibility": req.body.attendeeVisible
                    ? "public"
                    : "private",
            },
        },
    )
        .then((event) => {
            if (!event) {
                return res.sendStatus(404);
            }

            addToLog(
                "addEventAttendee",
                "success",
                "Attendee added to event " + req.params.eventID,
            );
            if (req.body.attendeeEmail) {
                const inviteToken = attendee.removalPassword;
                
                const acceptUrl = `https://${config.general.domain}/event/${event.id}/rsvp?token=${inviteToken}&attendance=accepted`;
                const declineUrl = `https://${config.general.domain}/event/${event.id}/rsvp?token=${inviteToken}&attendance=declined`;

                req.emailService
                    .sendEmailFromTemplate({
                        to: req.body.attendeeEmail,
                        subject: i18next.t("routes.addeventattendeesubject", {
                            eventName: event?.name,
                        }),
                        templateName: "addEventAttendee",
                        templateData: {
                            eventID: req.params.eventID,
                            removalPassword: req.body.removalPassword,
                            removalPasswordHash: hashString(
                                req.body.removalPassword,
                            ),
                            acceptUrl,
                            declineUrl,
                        },
                    })
                    .catch((e) => {
                        console.error(
                            "error sending addEventAttendee email",
                            e.toString(),
                        );
                        res.status(500).end();
                    });
            }
            res.redirect(`/${req.params.eventID}`);
        })
        .catch((error) => {
            res.send("Database error, please try again :(");
            addToLog(
                "addEventAttendee",
                "error",
                "Attempt to add attendee to event " +
                    req.params.eventID +
                    " failed with error: " +
                    error,
            );
        });
});

// this is a one-click unattend that requires a secret URL that only the person who RSVPed over
// activitypub knows
router.get("/oneclickunattendevent/:eventID/:attendeeID", (req, res) => {
    // Mastodon and Pleroma will "click" links that sent to its users, presumably as a prefetch?
    // Anyway, this ignores the automated clicks that are done without the user's knowledge
    if (
        req.headers["user-agent"] &&
        (req.headers["user-agent"].toLowerCase().includes("mastodon") ||
            req.headers["user-agent"].toLowerCase().includes("pleroma"))
    ) {
        return res.sendStatus(200);
    }
    Event.findOneAndUpdate(
        { id: req.params.eventID },
        { $pull: { attendees: { _id: req.params.attendeeID } } },
    )
        .then((event) => {
            if (!event) {
                return res.sendStatus(404);
            }
            addToLog(
                "oneClickUnattend",
                "success",
                "Attendee removed via one click unattend " + req.params.eventID,
            );
            // currently this is never called because we don't have the email address
            if (req.body.attendeeEmail) {
                req.emailService.sendEmailFromTemplate({
                    to: req.body.attendeeEmail,
                    subject: i18next.t("routes.removeeventattendeesubject"),
                    templateName: "removeEventAttendee",
                    templateData:{
                        eventName: event.name,
                    },
                }).catch((e) => {
                    console.error('error sending removeEventAttendeeHtml email', e.toString());
                    res.status(500).end();
                });
            }
            res.writeHead(302, {
                Location: "/" + req.params.eventID,
            });
            res.end();
        })
        .catch((err) => {
            res.send("Database error, please try again :(");
            addToLog(
                "removeEventAttendee",
                "error",
                "Attempt to remove attendee by admin from event " +
                    req.params.eventID +
                    " failed with error: " +
                    err,
            );
        });
});

router.post("/removeattendee/:eventID/:attendeeID", (req, res) => {
    Event.findOneAndUpdate(
        { id: req.params.eventID },
        { $pull: { attendees: { _id: req.params.attendeeID } } },
    )
        .then((event) => {
            if (!event) {
                return res.sendStatus(404);
            }
            addToLog(
                "removeEventAttendee",
                "success",
                "Attendee removed by admin from event " + req.params.eventID,
            );
            // currently this is never called because we don't have the email address
            if (req.body.attendeeEmail) {
                req.emailService.sendEmailFromTemplate({
                    to: req.body.attendeeEmail, 
                    subject: i18next.t("routes.removeeventattendeesubject"),
                    templateName: "removeEventAttendee",
                    templateData: {
                        eventName: event.name,
                    },
                }).catch((e) => {
                    console.error('error sending removeEventAttendeeHtml email', e.toString());
                    res.status(500).end();                  
                });
            }
            res.writeHead(302, {
                Location: "/" + req.params.eventID,
            });
            res.end();
        })
        .catch((err) => {
            res.send("Database error, please try again :(");
            addToLog(
                "removeEventAttendee",
                "error",
                "Attempt to remove attendee by admin from event " +
                    req.params.eventID +
                    " failed with error: " +
                    err,
            );
        });
});

/*
 * Create an email subscription on an event group.
 */
router.post("/subscribe/:eventGroupID", (req, res) => {
    const subscriber = {
        email: req.body.emailAddress,
    };
    if (!subscriber.email) {
        return res.sendStatus(500);
    }

    EventGroup.findOne({
        id: req.params.eventGroupID,
    })
        .then((eventGroup) => {
            if (!eventGroup) {
                return res.sendStatus(404);
            }
            eventGroup.subscribers.push(subscriber);
            eventGroup.save();
            req.emailService.sendEmailFromTemplate({
                to: subscriber.email, 
                subject: i18next.t("routes.subscribedsubject"),
                templateName: "subscribed",
                templateData:{
                    eventGroupName: eventGroup.name,
                    eventGroupID: eventGroup.id,
                    emailAddress: encodeURIComponent(subscriber.email),
                },
            }).catch((e) => {
                console.error('error sending removeEventAttendeeHtml email', e.toString());
                res.status(500).end();                  
            });

            return res.redirect(`/group/${eventGroup.id}`);
        })
        .catch((error) => {
            addToLog(
                "addSubscription",
                "error",
                "Attempt to subscribe " +
                    req.body.emailAddress +
                    " to event group " +
                    req.params.eventGroupID +
                    " failed with error: " +
                    error,
            );
            return res.sendStatus(500);
        });
});

/*
 * Delete an existing email subscription on an event group.
 */
router.get("/unsubscribe/:eventGroupID", (req, res) => {
    const email = req.query.email;
    if (!email) {
        return res.sendStatus(500);
    }

    EventGroup.updateOne(
        { id: req.params.eventGroupID },
        { $pull: { subscribers: { email } } },
    )
        .then((response) => {
            return res.redirect("/");
        })
        .catch((error) => {
            addToLog(
                "removeSubscription",
                "error",
                "Attempt to unsubscribe " +
                    req.query.email +
                    " from event group " +
                    req.params.eventGroupID +
                    " failed with error: " +
                    error,
            );
            return res.sendStatus(500);
        });
});

router.post("/post/comment/:eventID", (req, res) => {
    let commentID = nanoid();
    const newComment = {
        id: commentID,
        author: req.body.commentAuthor,
        content: req.body.commentContent,
        timestamp: moment(),
    };

    Event.findOne(
        {
            id: req.params.eventID,
        },
        function (err, event) {
            if (!event) {
                return res.sendStatus(404);
            }
            event.comments.push(newComment);
            event
                .save()
                .then(() => {
                    addToLog(
                        "addEventComment",
                        "success",
                        "Comment added to event " + req.params.eventID,
                    );
                    // broadcast an identical message to all followers, will show in their home timeline
                    // and in the home timeline of the event
                    const guidObject = crypto.randomBytes(16).toString("hex");
                    const jsonObject = {
                        "@context": "https://www.w3.org/ns/activitystreams",
                        id: `https://${domain}/${req.params.eventID}/m/${guidObject}`,
                        name: `Comment on ${event.name}`,
                        type: "Note",
                        cc: "https://www.w3.org/ns/activitystreams#Public",
                        content: `<p>${req.body.commentAuthor} commented: ${req.body.commentContent}.</p><p><a href="https://${domain}/${req.params.eventID}/">See the full conversation here.</a></p>`,
                    };
                    broadcastCreateMessage(
                        jsonObject,
                        event.followers,
                        req.params.eventID,
                    );
                    if (!event) {
                        return res.sendStatus(404);
                    }
                    
                    Event.findOne({ id: req.params.eventID }).then(
                        (event) => {
                            const attendeeEmails = event.attendees
                                .filter(
                                    (o) =>
                                        o.status === "attending" && o.email,
                                )
                                .map((o) => o.email || '')  || [];
                            if (attendeeEmails.length) {
                                console.log(
                                    "Sending emails to: " + attendeeEmails,
                                );
                                req.emailService.sendEmailFromTemplate({
                                    to: event?.creatorEmail || config.general.email,
                                    bcc: attendeeEmails,
                                    subject: i18next.t("routes.addeventcommentsubject", { eventName: event?.name }),
                                    templateName: "addEventComment",
                                    templateData:{
                                        eventID: req.params.eventID,
                                        commentAuthor: req.body.commentAuthor,
                                    },
                                }).catch((e) => {
                                    console.error('error sending removeEventAttendeeHtml email', e.toString());
                                    res.status(500).end();                  
                                });
                            } else {
                                console.log("Nothing to send!");
                            }
                        },
                    );
                    res.writeHead(302, {
                        Location: "/" + req.params.eventID,
                    });
                    res.end();
                })
                .catch((err) => {
                    res.send("Database error, please try again :(" + err);
                    addToLog(
                        "addEventComment",
                        "error",
                        "Attempt to add comment to event " +
                            req.params.eventID +
                            " failed with error: " +
                            err,
                    );
                });
        },
    );
});

router.post("/post/reply/:eventID/:commentID", (req, res) => {
    let replyID = nanoid();
    let commentID = req.params.commentID;
    const newReply = {
        id: replyID,
        author: req.body.replyAuthor,
        content: req.body.replyContent,
        timestamp: moment(),
    };
    Event.findOne(
        {
            id: req.params.eventID,
        },
        function (err, event) {
            if (!event) {
                return res.sendStatus(404);
            }
            var parentComment = event.comments.id(commentID);
            parentComment.replies.push(newReply);
            event
                .save()
                .then(() => {
                    addToLog(
                        "addEventReply",
                        "success",
                        "Reply added to comment " +
                            commentID +
                            " in event " +
                            req.params.eventID,
                    );
                    // broadcast an identical message to all followers, will show in their home timeline
                    const guidObject = crypto.randomBytes(16).toString("hex");
                    const jsonObject = {
                        "@context": "https://www.w3.org/ns/activitystreams",
                        id: `https://${domain}/${req.params.eventID}/m/${guidObject}`,
                        name: `Comment on ${event.name}`,
                        type: "Note",
                        cc: "https://www.w3.org/ns/activitystreams#Public",
                        content: `<p>${req.body.replyAuthor} commented: ${req.body.replyContent}</p><p><a href="https://${domain}/${req.params.eventID}/">See the full conversation here.</a></p>`,
                    };
                    broadcastCreateMessage(
                        jsonObject,
                        event.followers,
                        req.params.eventID,
                    );
                    Event.findOne({ id: req.params.eventID }).then(
                        (event) => {
                            if (!event) {
                                return res.sendStatus(404);
                            }
                            const attendeeEmails = event.attendees
                                .filter(
                                    (o) =>
                                        o.status === "attending" && o.email,
                                )
                                .map((o) => o.email || '') || [];
                            if (attendeeEmails.length) {
                                console.log(
                                    "Sending emails to: " + attendeeEmails,
                                );
                                req.emailService.sendEmailFromTemplate({
                                    to: event?.creatorEmail || config.general.email,
                                    bcc: attendeeEmails,
                                    subject: i18next.t("routes.addeventcommentsubject", { eventName: event.name }),
                                    templateName: "addEventComment",
                                    templateData: {
                                        eventID: req.params.eventID,
                                        commentAuthor: req.body.replyAuthor,
                                    },
                                }).catch((e) => {
                                    console.error('error sending removeEventAttendeeHtml email', e.toString());
                                    res.status(500).end();                  
                                });
                            } else {
                                console.log("Nothing to send!");
                            }
                        },
                    );
                    res.writeHead(302, {
                        Location: "/" + req.params.eventID,
                    });
                    res.end();
                })
                .catch((err) => {
                    res.send("Database error, please try again :(");
                    addToLog(
                        "addEventReply",
                        "error",
                        "Attempt to add reply to comment " +
                            commentID +
                            " in event " +
                            req.params.eventID +
                            " failed with error: " +
                            err,
                    );
                });
        },
    );
});

router.post("/deletecomment/:eventID/:commentID/:editToken", (req, res) => {
    let submittedEditToken = req.params.editToken;
    Event.findOne({
        id: req.params.eventID,
    })
        .then((event) => {
            if (event.editToken === submittedEditToken) {
                // Token matches
                event.comments.id(req.params.commentID).remove();
                event
                    .save()
                    .then(() => {
                        addToLog(
                            "deleteComment",
                            "success",
                            "Comment deleted from event " + req.params.eventID,
                        );
                        res.writeHead(302, {
                            Location:
                                "/" +
                                req.params.eventID +
                                "?e=" +
                                req.params.editToken,
                        });
                        res.end();
                    })
                    .catch((err) => {
                        res.send(
                            "Sorry! Something went wrong (error deleting): " +
                                err,
                        );
                        addToLog(
                            "deleteComment",
                            "error",
                            "Attempt to delete comment " +
                                req.params.commentID +
                                "from event " +
                                req.params.eventID +
                                " failed with error: " +
                                err,
                        );
                    });
            } else {
                // Token doesn't match
                res.send("Sorry! Something went wrong");
                addToLog(
                    "deleteComment",
                    "error",
                    "Attempt to delete comment " +
                        req.params.commentID +
                        "from event " +
                        req.params.eventID +
                        " failed with error: token does not match",
                );
            }
        })
        .catch((err) => {
            res.send("Sorry! Something went wrong: " + err);
            addToLog(
                "deleteComment",
                "error",
                "Attempt to delete comment " +
                    req.params.commentID +
                    "from event " +
                    req.params.eventID +
                    " failed with error: " +
                    err,
            );
        });
});

router.post("/activitypub/inbox", (req, res) => {
    if (!isFederated) return res.sendStatus(404);
    // validate the incoming message
    const signature = req.get("signature");
    if (!signature) {
        return res.status(401).send("No signature provided.");
    }
    let signature_header = signature
        .split(",")
        .map((pair) => {
            return pair.split("=").map((value) => {
                return value.replace(/^"/g, "").replace(/"$/g, "");
            });
        })
        .reduce((acc, el) => {
            acc[el[0]] = el[1];
            return acc;
        }, {});
    // get the actor
    // TODO if this is a Delete for an Actor this won't work
    request(
        {
            url: signature_header.keyId,
            headers: {
                Accept: activityPubContentType,
                "Content-Type": activityPubContentType,
                "User-Agent": `Gathio - ${domain}`
            },
        },
        function (error, response, actor) {
            let publicKey = "";

            try {
                if (JSON.parse(actor).publicKey) {
                    publicKey = JSON.parse(actor).publicKey.publicKeyPem;
                }
            } catch (err) {
                return res.status(500).send("Actor could not be parsed" + err);
            }

            let comparison_string = signature_header.headers
                .split(" ")
                .map((header) => {
                    if (header === "(request-target)") {
                        return "(request-target): post /activitypub/inbox";
                    } else {
                        return `${header}: ${req.get(header)}`;
                    }
                })
                .join("\n");
            const verifier = crypto.createVerify("RSA-SHA256");
            verifier.update(comparison_string, "ascii");
            const publicKeyBuf = Buffer.from(publicKey, "ascii");
            const signatureBuf = Buffer.from(
                signature_header.signature,
                "base64",
            );
            try {
                const result = verifier.verify(publicKeyBuf, signatureBuf);
                if (result) {
                    // actually process the ActivityPub message now that it's been verified
                    processInbox(req, res);
                } else {
                    return res
                        .status(401)
                        .send("Signature could not be verified.");
                }
            } catch (err) {
                return res
                    .status(401)
                    .send("Signature could not be verified: " + err);
            }
        },
    );
});

router.use(function (req, res, next) {
    return res.status(404).render("404", frontendConfig(res));
});

addToLog("startup", "success", "Started up successfully");

export default router;
