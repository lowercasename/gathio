import fs from "fs";
import express from "express";
import { customAlphabet } from "nanoid";
import { frontendConfig, getConfig } from "./lib/config.js";
import { addToLog } from "./helpers.js";
import moment from "moment-timezone";
import crypto from "crypto";
import request from "request";
import niceware from "niceware";
import sgMail from "@sendgrid/mail";
import nodemailer from "nodemailer";
import fileUpload from "express-fileupload";
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

const config = getConfig();
const domain = config.general.domain;
const contactEmail = config.general.email;
const siteName = config.general.site_name;
const mailService = config.general.mail_service;
const siteLogo = config.general.email_logo_url;
const isFederated = config.general.is_federated || true;

// This alphabet (used to generate all event, group, etc. IDs) is missing '-'
// because ActivityPub doesn't like it in IDs
const nanoid = customAlphabet(
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_",
    21,
);

const router = express.Router();

let sendEmails = false;
let nodemailerTransporter;
if (config.general.mail_service) {
    switch (config.general.mail_service) {
        case "sendgrid":
            sgMail.setApiKey(config.sendgrid?.api_key);
            console.log("Sendgrid is ready to send emails.");
            sendEmails = true;
            break;
        case "nodemailer":
            const nodemailerConfig = {
                host: config.nodemailer?.smtp_server,
                port: Number(config.nodemailer?.smtp_port) || 587,
            };

            if (config.nodemailer?.smtp_username) {
                nodemailerConfig.auth = {
                    user: config.nodemailer?.smtp_username,
                    pass: config.nodemailer?.smtp_password,
                };
            }

            nodemailerTransporter = nodemailer.createTransport(nodemailerConfig);

            nodemailerTransporter.verify((error, success) => {
                if (error) {
                    console.log(error);
                } else {
                    console.log(
                        "Nodemailer SMTP server is ready to send emails.",
                    );
                    sendEmails = true;
                }
            });
            break;
        default:
            console.error(
                "You have not configured this Gathio instance to send emails! This means that event creators will not receive emails when their events are created, which means they may end up locked out of editing events. Consider setting up an email service.",
            );
    }
}

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
                "attendees.$.visibility": !!req.body.attendeeVisible
                    ? "public"
                    : "private",
            },
        },
    )
        .then((event) => {
            addToLog(
                "addEventAttendee",
                "success",
                "Attendee added to event " + req.params.eventID,
            );
            if (sendEmails) {
                if (req.body.attendeeEmail) {
                    req.app.get("hbsInstance").renderView(
                        "./views/emails/addEventAttendee/addEventAttendeeHtml.handlebars",
                        {
                            eventID: req.params.eventID,
                            siteName,
                            siteLogo,
                            domain,
                            removalPassword: req.body.removalPassword,
                            removalPasswordHash: hashString(
                                req.body.removalPassword,
                            ),
                            cache: true,
                            layout: "email.handlebars",
                        },
                        function (err, html) {
                            const msg = {
                                to: req.body.attendeeEmail,
                                from: contactEmail,
                                subject: `${siteName}: You're RSVPed to ${event.name}`,
                                html,
                            };
                            switch (mailService) {
                                case "sendgrid":
                                    sgMail.send(msg).catch((e) => {
                                        console.error(e.toString());
                                        res.status(500).end();
                                    });
                                    break;
                                case "nodemailer":
                                    nodemailerTransporter
                                        .sendMail(msg)
                                        .catch((e) => {
                                            console.error(e.toString());
                                            res.status(500).end();
                                        });
                                    break;
                            }
                        },
                    );
                }
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
    Event.updateOne(
        { id: req.params.eventID },
        { $pull: { attendees: { _id: req.params.attendeeID } } },
    )
        .then((response) => {
            addToLog(
                "oneClickUnattend",
                "success",
                "Attendee removed via one click unattend " + req.params.eventID,
            );
            if (sendEmails) {
                // currently this is never called because we don't have the email address
                if (req.body.attendeeEmail) {
                    req.app.get("hbsInstance").renderView(
                        "./views/emails/removeEventAttendee/removeEventAttendeeHtml.handlebars",
                        {
                            eventName: req.params.eventName,
                            siteName,
                            domain,
                            cache: true,
                            layout: "email.handlebars",
                        },
                        function (err, html) {
                            const msg = {
                                to: req.body.attendeeEmail,
                                from: contactEmail,
                                subject: `${siteName}: You have been removed from an event`,
                                html,
                            };
                            switch (mailService) {
                                case "sendgrid":
                                    sgMail.send(msg).catch((e) => {
                                        console.error(e.toString());
                                        res.status(500).end();
                                    });
                                    break;
                                case "nodemailer":
                                    nodemailerTransporter
                                        .sendMail(msg)
                                        .catch((e) => {
                                            console.error(e.toString());
                                            res.status(500).end();
                                        });
                                    break;
                            }
                        },
                    );
                }
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
    Event.updateOne(
        { id: req.params.eventID },
        { $pull: { attendees: { _id: req.params.attendeeID } } },
    )
        .then((response) => {
            addToLog(
                "removeEventAttendee",
                "success",
                "Attendee removed by admin from event " + req.params.eventID,
            );
            if (sendEmails) {
                // currently this is never called because we don't have the email address
                if (req.body.attendeeEmail) {
                    req.app.get("hbsInstance").renderView(
                        "./views/emails/removeEventAttendee/removeEventAttendeeHtml.handlebars",
                        {
                            eventName: req.params.eventName,
                            siteName,
                            siteLogo,
                            domain,
                            cache: true,
                            layout: "email.handlebars",
                        },
                        function (err, html) {
                            const msg = {
                                to: req.body.attendeeEmail,
                                from: contactEmail,
                                subject: `${siteName}: You have been removed from an event`,
                                html,
                            };
                            switch (mailService) {
                                case "sendgrid":
                                    sgMail.send(msg).catch((e) => {
                                        console.error(e.toString());
                                        res.status(500).end();
                                    });
                                    break;
                                case "nodemailer":
                                    nodemailerTransporter
                                        .sendMail(msg)
                                        .catch((e) => {
                                            console.error(e.toString());
                                            res.status(500).end();
                                        });
                                    break;
                            }
                        },
                    );
                }
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
// TODO: Prevent subscribing more than once with the same email
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
            if (sendEmails) {
                req.app.get("hbsInstance").renderView(
                    "./views/emails/subscribed/subscribedHtml.handlebars",
                    {
                        eventGroupName: eventGroup.name,
                        eventGroupID: eventGroup.id,
                        emailAddress: encodeURIComponent(subscriber.email),
                        siteName,
                        siteLogo,
                        domain,
                        cache: true,
                        layout: "email.handlebars",
                    },
                    function (err, html) {
                        const msg = {
                            to: subscriber.email,
                            from: contactEmail,
                            subject: `${siteName}: You have subscribed to an event group`,
                            html,
                        };
                        switch (mailService) {
                            case "sendgrid":
                                sgMail.send(msg).catch((e) => {
                                    console.error(e.toString());
                                    res.status(500).end();
                                });
                                break;
                            case "nodemailer":
                                nodemailerTransporter
                                    .sendMail(msg)
                                    .catch((e) => {
                                        console.error(e.toString());
                                        res.status(500).end();
                                    });
                                break;
                        }
                    },
                );
            }
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
            if (!event) return;
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
                    if (sendEmails) {
                        Event.findOne({ id: req.params.eventID }).then(
                            (event) => {
                                const attendeeEmails = event.attendees
                                    .filter(
                                        (o) =>
                                            o.status === "attending" && o.email,
                                    )
                                    .map((o) => o.email);
                                if (attendeeEmails.length) {
                                    console.log(
                                        "Sending emails to: " + attendeeEmails,
                                    );
                                    req.app.get("hbsInstance").renderView(
                                        "./views/emails/addEventComment/addEventCommentHtml.handlebars",
                                        {
                                            siteName,
                                            siteLogo,
                                            domain,
                                            eventID: req.params.eventID,
                                            commentAuthor:
                                                req.body.commentAuthor,
                                            cache: true,
                                            layout: "email.handlebars",
                                        },
                                        function (err, html) {
                                            const msg = {
                                                to: attendeeEmails,
                                                from: contactEmail,
                                                subject: `${siteName}: New comment in ${event.name}`,
                                                html,
                                            };
                                            switch (mailService) {
                                                case "sendgrid":
                                                    sgMail
                                                        .sendMultiple(msg)
                                                        .catch((e) => {
                                                            console.error(
                                                                e.toString(),
                                                            );
                                                            res.status(
                                                                500,
                                                            ).end();
                                                        });
                                                    break;
                                                case "nodemailer":
                                                    nodemailerTransporter
                                                        .sendMail(msg)
                                                        .catch((e) => {
                                                            console.error(
                                                                e.toString(),
                                                            );
                                                            res.status(
                                                                500,
                                                            ).end();
                                                        });
                                                    break;
                                            }
                                        },
                                    );
                                } else {
                                    console.log("Nothing to send!");
                                }
                            },
                        );
                    }
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
            if (!event) return;
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
                    if (sendEmails) {
                        Event.findOne({ id: req.params.eventID }).then(
                            (event) => {
                                const attendeeEmails = event.attendees
                                    .filter(
                                        (o) =>
                                            o.status === "attending" && o.email,
                                    )
                                    .map((o) => o.email);
                                if (attendeeEmails.length) {
                                    console.log(
                                        "Sending emails to: " + attendeeEmails,
                                    );
                                    req.app.get("hbsInstance").renderView(
                                        "./views/emails/addEventComment/addEventCommentHtml.handlebars",
                                        {
                                            siteName,
                                            siteLogo,
                                            domain,
                                            eventID: req.params.eventID,
                                            commentAuthor: req.body.replyAuthor,
                                            cache: true,
                                            layout: "email.handlebars",
                                        },
                                        function (err, html) {
                                            const msg = {
                                                to: attendeeEmails,
                                                from: contactEmail,
                                                subject: `${siteName}: New comment in ${event.name}`,
                                                html,
                                            };
                                            switch (mailService) {
                                                case "sendgrid":
                                                    sgMail
                                                        .sendMultiple(msg)
                                                        .catch((e) => {
                                                            console.error(
                                                                e.toString(),
                                                            );
                                                            res.status(
                                                                500,
                                                            ).end();
                                                        });
                                                    break;
                                                case "nodemailer":
                                                    nodemailerTransporter
                                                        .sendMail(msg)
                                                        .catch((e) => {
                                                            console.error(
                                                                e.toString(),
                                                            );
                                                            res.status(
                                                                500,
                                                            ).end();
                                                        });
                                                    break;
                                            }
                                        },
                                    );
                                } else {
                                    console.log("Nothing to send!");
                                }
                            },
                        );
                    }
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
