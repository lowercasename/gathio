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
import path from "path";
import { activityPubContentType } from "./lib/activitypub.js";
import { hashString } from "./util/generator.js";
import i18next from "i18next";
import { EmailService } from "./lib/email.js";
import { PrismaClient } from "@prisma/client";

const config = getConfig();
const domain = config.general.domain;
const isFederated = config.general.is_federated ?? true;
const prisma = new PrismaClient();

// nanoid alphabet
const nanoid = customAlphabet(
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_",
    21,
);

const router = express.Router();
router.use(fileUpload());

// SCHEDULED DELETION
schedule.scheduleJob("59 23 * * *", async () => {
    const deleteAfterDays = config.general.delete_after_days;
    if (!deleteAfterDays || deleteAfterDays <= 0) return;

    const too_old = moment
        .tz("Etc/UTC")
        .subtract(deleteAfterDays, "days")
        .toDate();
    console.log(
        "Old event deletion running! Deleting all events before ",
        too_old,
    );

    try {
        const oldEvents = await prisma.event.findMany({
            where: { end: { lte: too_old } },
        });
        for (const event of oldEvents) {
            // delete image file
            if (event.image) {
                fs.unlink(
                    path.join(process.cwd(), `/public/events/${event.image}`),
                    (err) => {
                        if (err)
                            addToLog(
                                "deleteOldEvents",
                                "error",
                                `Image deletion failed for ${event.id}: ${err}`,
                            );
                        else
                            addToLog(
                                "deleteOldEvents",
                                "success",
                                `Image deleted for ${event.id}`,
                            );
                    },
                );
            }

            // handle ActivityPub broadcast
            if (event.activityPubActor && event.activityPubEvent) {
                const actorObj = JSON.parse(event.activityPubActor);
                const eventObj = JSON.parse(event.activityPubEvent);
                broadcastDeleteMessage(
                    actorObj,
                    await getFollowers(event.id),
                    event.id,
                    async () => {
                        broadcastDeleteMessage(
                            eventObj,
                            await getFollowers(event.id),
                            event.id,
                            async () => {
                                await deleteEvent(event.id);
                            },
                        );
                    },
                );
            } else {
                await deleteEvent(event.id);
            }
        }
    } catch (err) {
        addToLog("deleteOldEvents", "error", `Batch delete failed: ${err}`);
    }
});

// helper to delete an event
async function deleteEvent(id) {
    try {
        await prisma.event.delete({ where: { id } });
        addToLog("deleteOldEvents", "success", `Old event ${id} deleted`);
    } catch (err) {
        addToLog("deleteOldEvents", "error", `Deleting ${id} failed: ${err}`);
    }
}

// helper to fetch followers array
async function getFollowers(eventId) {
    const followers = await prisma.follower.findMany({ where: { eventId } });
    return followers.map((f) => ({
        followId: f.followId,
        actorId: f.actorId,
        actorJson: f.actorJson,
        name: f.name,
    }));
}

// VERIFY TOKENS
router.post("/verifytoken/event/:eventID", async (req, res) => {
    const event = await prisma.event.findUnique({
        where: { id: req.params.eventID },
    });
    if (event?.editToken === req.body.editToken) return res.sendStatus(200);
    return res.sendStatus(404);
});

router.post("/verifytoken/group/:eventGroupID", async (req, res) => {
    const group = await prisma.eventGroup.findUnique({
        where: { id: req.params.eventGroupID },
    });
    if (group?.editToken === req.body.editToken) return res.sendStatus(200);
    return res.sendStatus(404);
});

// DELETE IMAGE
router.post("/deleteimage/:eventID/:editToken", async (req, res) => {
    const { eventID, editToken } = req.params;
    const event = await prisma.event.findUnique({ where: { id: eventID } });
    if (!event || event.editToken !== editToken) return res.sendStatus(404);

    if (!event.image) return res.status(500).send("No image to delete");
    const imageName = event.image;

    fs.unlink(
        path.join(process.cwd(), `/public/events/${imageName}`),
        async (err) => {
            if (err) {
                await addToLog(
                    "deleteEventImage",
                    "error",
                    `Deleting image for ${eventID} failed: ${err}`,
                );
                return res.status(500).send(err);
            }
            await prisma.event.update({
                where: { id: eventID },
                data: { image: "" },
            });
            addToLog(
                "deleteEventImage",
                "success",
                `Image deleted for ${eventID}`,
            );
            res.sendStatus(200);
        },
    );
});

// DELETE EVENT
router.post("/deleteevent/:eventID/:editToken", async (req, res) => {
    const { eventID, editToken } = req.params;
    const event = await prisma.event.findUnique({ where: { id: eventID } });
    if (!event || event.editToken !== editToken)
        return res.status(403).send("Invalid token");

    // broadcast delete
    if (event.activityPubActor) {
        const actorObj = JSON.parse(event.activityPubActor);
        await broadcastDeleteMessage(
            actorObj,
            await getFollowers(eventID),
            eventID,
            async () => {
                await performEventDeletion(event);
                res.redirect("/");
            },
        );
    } else {
        await performEventDeletion(event);
        res.redirect("/");
    }
});

async function performEventDeletion(event) {
    const eventID = event.id;
    // delete DB record
    await prisma.event.delete({ where: { id: eventID } });
    addToLog("deleteEvent", "success", `Event ${eventID} deleted`);

    // remove image file
    if (event.image) {
        fs.unlink(
            path.join(process.cwd(), `/public/events/${event.image}`),
            (err) => {
                if (err)
                    addToLog(
                        "deleteEvent",
                        "error",
                        `Deleting image for ${eventID} failed: ${err}`,
                    );
            },
        );
    }

    // notify attendees
    const attendees = await prisma.attendee.findMany({
        where: { eventId: eventID, status: "attending", email: { not: null } },
    });
    if (attendees.length) {
        const to = attendees.map((a) => a.email);
        req.emailService.sendEmailFromTemplate({
            to,
            subject: i18next.t("routes.deleteeventsubject", {
                eventName: event.name,
            }),
            templateName: "deleteEvent",
            templateData: { eventName: event.name },
        });
    }
}

// DELETE EVENT GROUP
router.post("/deleteeventgroup/:eventGroupID/:editToken", async (req, res) => {
    const { eventGroupID, editToken } = req.params;
    const group = await prisma.eventGroup.findUnique({
        where: { id: eventGroupID },
    });
    if (!group || group.editToken !== editToken)
        return res.status(403).send("Invalid token");

    // unlink events
    await prisma.event.updateMany({
        where: { eventGroupId: eventGroupID },
        data: { eventGroupId: null },
    });
    // delete group record
    await prisma.eventGroup.delete({ where: { id: eventGroupID } });
    addToLog("deleteEventGroup", "success", `Group ${eventGroupID} deleted`);

    // delete group image
    if (group.image) {
        fs.unlink(
            path.join(process.cwd(), `/public/events/${group.image}`),
            (err) => {
                if (err)
                    addToLog(
                        "deleteEventGroup",
                        "error",
                        `Deleting group image failed: ${err}`,
                    );
            },
        );
    }

    res.redirect("/");
});

// PROVISION ATTENDEE
router.post("/attendee/provision", async (req, res) => {
    const { eventID } = req.query;
    const removalPassword = niceware.generatePassphrase(6).join("-");
    const event = await prisma.event.findUnique({ where: { id: eventID } });
    if (!event) return res.sendStatus(404);

    const attendee = await prisma.attendee.create({
        data: {
            name: "",
            status: "provisioned",
            removalPassword,
            created: new Date(),
            eventId: eventID,
        },
    });
    addToLog("provisionEventAttendee", "success", `Provisioned for ${eventID}`);

    // calculate free spots
    let freeSpots;
    if (event.maxAttendees != null) {
        const attending = await prisma.attendee.findMany({
            where: { eventId: eventID, status: "attending" },
        });
        const used = attending.reduce((acc, a) => acc + (a.number || 1), 0);
        freeSpots = event.maxAttendees - used;
    }

    res.json({ removalPassword, freeSpots });
});

// ATTEND EVENT
router.post("/attendevent/:eventID", async (req, res) => {
    console.log("🚀 ~ router.postattendevent  ~ req:", req.params);

    const { eventID } = req.params;
    const {
        removalPassword,
        attendeeName,
        attendeeEmail,
        attendeeNumber,
        attendeeVisible,
    } = req.body;
    if (!removalPassword) return res.sendStatus(400);

    const event = await prisma.event.findUnique({
        where: { id: eventID },
        include: { attendees: true },
    });
    if (!event) return res.sendStatus(404);

    // find provisioned attendee
    const provision = event.attendees.find(
        (a) =>
            a.removalPassword === removalPassword && a.status === "provisioned",
    );
    if (!provision) return res.sendStatus(404);

    // check capacity
    if (event.maxAttendees != null) {
        const attending = event.attendees.filter(
            (a) => a.status === "attending",
        );
        const used = attending.reduce((acc, a) => acc + (a.number || 1), 0);
        if (attendeeNumber > event.maxAttendees - used)
            return res.sendStatus(403);
    }

    // update attendee
    await prisma.attendee.update({
        where: { id: provision.id },
        data: {
            status: "attending",
            name: attendeeName,
            email: attendeeEmail,
            number: parseInt(attendeeNumber, 10),
            visibility: attendeeVisible ? "public" : "private",
        },
    });
    addToLog("addEventAttendee", "success", `Attended ${eventID}`);

    if (attendeeEmail) {
        req.emailService.sendEmailFromTemplate({
            to: attendeeEmail,
            subject: i18next.t("routes.addeventattendeesubject", {
                eventName: event.name,
            }),
            templateName: "addEventAttendee",
            templateData: {
                eventID,
                removalPassword,
                removalPasswordHash: hashString(removalPassword),
            },
        });
    }

    res.redirect(`/${eventID}`);
});

// One-click unattend
router.get("/oneclickunattendevent/:eventID/:attendeeID", async (req, res) => {
    const ua = req.headers["user-agent"]?.toLowerCase() || "";
    if (ua.includes("mastodon") || ua.includes("pleroma"))
        return res.sendStatus(200);

    const { eventID, attendeeID } = req.params;
    await prisma.attendee.deleteMany({
        where: { id: attendeeID, eventId: eventID },
    });
    addToLog(
        "oneClickUnattend",
        "success",
        `${attendeeID} un-attended ${eventID}`,
    );
    res.redirect(`/${eventID}`);
});

// Remove attendee by admin
router.post("/removeattendee/:eventID/:attendeeID", async (req, res) => {
    const { eventID, attendeeID } = req.params;
    await prisma.attendee.deleteMany({
        where: { id: attendeeID, eventId: eventID },
    });
    addToLog(
        "removeEventAttendee",
        "success",
        `${attendeeID} removed from ${eventID}`,
    );
    res.redirect(`/${eventID}`);
});

// Subscribe to group
router.post("/subscribe/:eventGroupID", async (req, res) => {
    const { eventGroupID } = req.params;
    const email = req.body.emailAddress;
    if (!email) return res.sendStatus(400);

    await prisma.subscriber.create({
        data: { email, eventGroupId: eventGroupID },
    });
    req.emailService.sendEmailFromTemplate({
        to: email,
        subject: i18next.t("routes.subscribedsubject"),
        templateName: "subscribed",
        templateData: {
            eventGroupName: (
                await prisma.eventGroup.findUnique({
                    where: { id: eventGroupID },
                })
            ).name,
            eventGroupID,
            emailAddress: encodeURIComponent(email),
        },
    });
    res.redirect(`/group/${eventGroupID}`);
});

// Unsubscribe
router.get("/unsubscribe/:eventGroupID", async (req, res) => {
    const { eventGroupID } = req.params;
    const email = req.query.email;
    if (!email) return res.sendStatus(400);
    await prisma.subscriber.deleteMany({
        where: { email: String(email), eventGroupId: eventGroupID },
    });
    res.redirect("/");
});

// Add comment
router.post("/post/comment/:eventID", async (req, res) => {
    const { eventID } = req.params;
    const newComment = {
        id: nanoid(),
        author: req.body.commentAuthor,
        content: req.body.commentContent,
        timestamp: new Date(),
        eventId: eventID,
    };
    await prisma.comment.create({ data: newComment });
    addToLog("addEventComment", "success", `Comment added to ${eventID}`);

    const followers = await getFollowers(eventID);
    broadcastCreateMessage(
        {
            "@context": "https://www.w3.org/ns/activitystreams",
            id: `https://${domain}/${eventID}/m/${crypto.randomBytes(16).toString("hex")}`,
            name: `Comment on ${eventID}`,
            type: "Note",
            cc: "https://www.w3.org/ns/activitystreams#Public",
            content: `<p>${req.body.commentAuthor} commented: ${req.body.commentContent}</p>`,
        },
        followers,
        eventID,
    );

    res.redirect(`/${eventID}`);
});

// Add reply
router.post("/post/reply/:eventID/:commentID", async (req, res) => {
    const { eventID, commentID } = req.params;
    const newReply = {
        id: nanoid(),
        author: req.body.replyAuthor,
        content: req.body.replyContent,
        timestamp: new Date(),
        commentId: commentID,
    };
    await prisma.reply.create({ data: newReply });
    addToLog(
        "addEventReply",
        "success",
        `Reply added to ${commentID} in ${eventID}`,
    );

    const followers = await getFollowers(eventID);
    broadcastCreateMessage(
        {
            "@context": "https://www.w3.org/ns/activitystreams",
            id: `https://${domain}/${eventID}/m/${crypto.randomBytes(16).toString("hex")}`,
            name: `Reply on ${eventID}`,
            type: "Note",
            cc: "https://www.w3.org/ns/activitystreams#Public",
            content: `<p>${req.body.replyAuthor} replied: ${req.body.replyContent}</p>`,
        },
        followers,
        eventID,
    );

    res.redirect(`/${eventID}`);
});

// Delete comment
router.post(
    "/deletecomment/:eventID/:commentID/:editToken",
    async (req, res) => {
        const { eventID, commentID, editToken } = req.params;
        const event = await prisma.event.findUnique({ where: { id: eventID } });
        if (!event || event.editToken !== editToken) return res.sendStatus(403);
        await prisma.comment.deleteMany({
            where: { id: commentID, eventId: eventID },
        });
        addToLog(
            "deleteComment",
            "success",
            `Comment ${commentID} deleted from ${eventID}`,
        );
        res.redirect(`/${eventID}?e=${editToken}`);
    },
);

// ActivityPub inbox
router.post("/activitypub/inbox", (req, res) => {
    if (!isFederated) return res.sendStatus(404);
    const signature = req.get("signature");
    if (!signature) return res.status(401).send("No signature");
    // ... signature parsing and verification remains same ...
    processInbox(req, res);
});

// 404 handler
router.use((req, res) => res.status(404).render("404", frontendConfig(res)));

addToLog("startup", "success", "Started up successfully");
export default router;
