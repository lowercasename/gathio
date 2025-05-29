// src/routes/event.ts
import { Router, Request, Response } from "express";
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
import crypto from "crypto";
import ical from "ical";
import { markdownToSanitizedHTML } from "../util/markdown.js";
import {
  checkMagicLink,
  getConfigMiddleware,
} from "../lib/middleware.js";
import { getConfig } from "../lib/config.js";
import i18next from "i18next";
import { PrismaClient } from "@prisma/client";

moment.locale(i18next.language);
const prisma = new PrismaClient();
const config = getConfig();
const domain = config.general.domain;

// Multer setup for images and ICS files
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/jpeg|jpg|png|gif/.test(file.mimetype)) {
      return cb(new Error("Only JPEG, PNG and GIF images are allowed."));
    }
    cb(null, true);
  },
});
const icsUpload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "text/calendar") {
      return cb(new Error("Only ICS files are allowed."));
    }
    cb(null, true);
  },
});

const router = Router();
router.use(getConfigMiddleware);

// POST /event — create a new event
router.post(
  "/event",
  upload.single("imageUpload"),
  checkMagicLink,
  async (req: Request, res: Response) => {
    const { data: eventData, errors } = validateEventData(req.body);
    if (errors?.length) return res.status(400).json({ errors });
    if (!eventData) {
      return res
        .status(400)
        .json({ errors: [{ message: "No event data was provided." }] });
    }

    const eventID = generateEventID();
    const editToken = generateEditToken();

    // handle optional image
    let imageFile: string | null = null;
    if (req.file?.buffer) {
      try {
        const img = await Jimp.read(req.file.buffer);
        await img.resize(920, Jimp.AUTO).quality(80)
          .writeAsync(`./public/events/${eventID}.jpg`);
        imageFile = `${eventID}.jpg`;
      } catch (err) {
        addToLog("Jimp", "error", `Image processing failed: ${err}`);
      }
    }

    // parse maxAttendees
    const maxAttendeesNumber =
      eventData.maxAttendees !== undefined
        ? parseInt(eventData.maxAttendees, 10)
        : null;

    // optionally link to a group
    let groupId: string | null = null;
    if (eventData.eventGroupBoolean) {
      const group = await prisma.eventGroup.findUnique({
        where: { id: eventData.eventGroupID },
      });
      if (group && group.editToken === eventData.eventGroupEditToken) {
        groupId = group.id;
      }
    }

    // prepare ActivityPub actor & event
    const startUTC = moment
      .tz(eventData.eventStart, eventData.timezone)
      .toDate();
    const endUTC = moment
      .tz(eventData.eventEnd, eventData.timezone)
      .toDate();
    const { publicKey, privateKey } = generateRSAKeypair();
    const actor = createActivityPubActor(
      eventID,
      domain,
      publicKey,
      markdownToSanitizedHTML(eventData.eventDescription),
      eventData.eventName,
      eventData.eventLocation,
      imageFile,
      startUTC,
      endUTC,
      eventData.timezone
    );
    const activityEvent = createActivityPubEvent(
      eventData.eventName,
      startUTC,
      endUTC,
      eventData.timezone,
      eventData.eventDescription,
      eventData.eventLocation
    );

    try {
      const created = await prisma.event.create({
        data: {
          id: eventID,
          type: "public",
          name: eventData.eventName,
          location: eventData.eventLocation,
          start: startUTC,
          end: endUTC,
          timezone: eventData.timezone,
          description: eventData.eventDescription,
          image: imageFile,
          creatorEmail: eventData.creatorEmail,
          url: eventData.eventURL,
          hostName: eventData.hostName,
          editToken,
          showOnPublicList: !!eventData.publicBoolean,
          usersCanAttend: !!eventData.joinBoolean,
          usersCanComment: !!eventData.interactionBoolean,
          maxAttendees: maxAttendeesNumber,
          eventGroupId: groupId,
          // store JSON‐strings for your ActivityPub objects
          activityPubActor: actor,
          activityPubEvent: activityEvent,
          activityPubMessages: {
            create: [
              {
                id: `https://${domain}/${eventID}/m/featuredPost`,
                content: JSON.stringify(
                  createFeaturedPost(
                    eventID,
                    eventData.eventName,
                    startUTC,
                    endUTC,
                    eventData.timezone,
                    eventData.eventDescription,
                    eventData.eventLocation
                  )
                ),
              },
            ],
          },
          publicKey,
          privateKey,
        },
      });

      addToLog("createEvent", "success", `Event ${eventID} created`);

      // email the creator
      if (eventData.creatorEmail) {
        req.emailService.sendEmailFromTemplate({
          to: eventData.creatorEmail,
          subject: eventData.eventName,
          templateName: "createEvent",
          templateData: { eventID, editToken },
        });
      }

      // email any group subscribers
      if (groupId) {
        const subs = await prisma.subscriber.findMany({
          where: { eventGroupId: groupId },
        });
        const group = await prisma.eventGroup.findUnique({
          where: { id: groupId },
        });
        for (const sub of subs) {
          await req.emailService.sendEmailFromTemplate({
            to: sub.email!,
            subject: `New event in ${group?.name}`,
            templateName: "eventGroupUpdated",
            templateData: {
              eventGroupName: group?.name,
              eventName: created.name,
              eventID,
              eventGroupID: groupId,
              emailAddress: encodeURIComponent(sub.email!),
            },
          });
        }
      }

      // respond with the public + edit URLs
      return res.json({
        eventID,
        editToken,
        url: `/${eventID}?e=${editToken}`,
      });
    } catch (err) {
      console.error(err);
      addToLog("createEvent", "error", `Create failed: ${err}`);
      return res
        .status(500)
        .json({ errors: [{ message: String(err) }] });
    }
  }
);

// PUT /event/:eventID — edit an existing event
router.put(
  "/event/:eventID",
  upload.single("imageUpload"),
  async (req: Request, res: Response) => {
    const { data: eventData, errors } = validateEventData(req.body);
    if (errors?.length) return res.status(400).json({ errors });
    if (!eventData) {
      return res
        .status(400)
        .json({ errors: [{ message: "No event data was provided." }] });
    }

    try {
      const eventID = req.params.eventID;
      const submittedToken = req.body.editToken;
      const existing = await prisma.event.findUnique({
        where: { id: eventID },
        include: { attendees: true },
      });
      if (!existing) {
        return res
          .status(404)
          .json({ errors: [{ message: "Event not found." }] });
      }
      if (existing.editToken !== submittedToken) {
        addToLog(
          "editEvent",
          "error",
          `Invalid token for ${eventID}`
        );
        return res
          .status(403)
          .json({ errors: [{ message: "Edit token is invalid." }] });
      }

      // handle optional new image
      let imageFile = existing.image;
      if (req.file?.buffer) {
        try {
          const img = await Jimp.read(req.file.buffer);
          await img.resize(920, Jimp.AUTO).quality(80)
            .writeAsync(`./public/events/${eventID}.jpg`);
          imageFile = `${eventID}.jpg`;
        } catch (err) {
          addToLog("Jimp", "error", `Image update failed: ${err}`);
        }
      }

      // group logic
      let groupId: string | null = existing.eventGroupId;
      if (eventData.eventGroupBoolean) {
        const group = await prisma.eventGroup.findUnique({
          where: { id: eventData.eventGroupID },
        });
        if (group && group.editToken === eventData.eventGroupEditToken) {
          groupId = group.id;
        }
      } else {
        groupId = null;
      }

      // prepare updated fields
      const startUTC = moment
        .tz(eventData.eventStart, eventData.timezone)
        .toDate();
      const endUTC = moment
        .tz(eventData.eventEnd, eventData.timezone)
        .toDate();

      // update in the database
      await prisma.event.update({
        where: { id: eventID },
        data: {
          name: eventData.eventName,
          location: eventData.eventLocation,
          start: startUTC,
          end: endUTC,
          timezone: eventData.timezone,
          description: eventData.eventDescription,
          url: eventData.eventURL,
          hostName: eventData.hostName,
          image: imageFile,
          showOnPublicList: !!eventData.publicBoolean,
          usersCanAttend: !!eventData.joinBoolean,
          usersCanComment: !!eventData.interactionBoolean,
          maxAttendees: eventData.maxAttendeesBoolean
            ? parseInt(eventData.maxAttendees, 10)
            : null,
          eventGroupId: groupId,
          activityPubActor: existing.activityPubActor
            ? JSON.stringify(
                updateActivityPubActor(
                  JSON.parse(existing.activityPubActor),
                  eventData.eventDescription,
                  eventData.eventName,
                  eventData.eventLocation,
                  imageFile,
                  startUTC,
                  endUTC,
                  eventData.timezone
                )
              )
            : null,
          activityPubEvent: existing.activityPubEvent
            ? JSON.stringify(
                updateActivityPubEvent(
                  JSON.parse(existing.activityPubEvent),
                  eventData.eventName,
                  startUTC,
                  endUTC,
                  eventData.timezone
                )
              )
            : null,
        },
      });

      addToLog("editEvent", "success", `Event ${eventID} updated`);

      // (You can re-broadcast to followers or email attendees here if desired…)

      return res.sendStatus(200);
    } catch (err) {
      console.error(err);
      addToLog("editEvent", "error", `Edit failed: ${err}`);
      return res
        .status(500)
        .json({ errors: [{ message: String(err) }] });
    }
  }
);

// POST /import/event — import from an ICS file
router.post(
  "/import/event",
  icsUpload.single("icsImportControl"),
  checkMagicLink,
  async (req: Request, res: Response) => {
    if (!req.file) {
      return res
        .status(400)
        .json({ errors: [{ message: "No file provided." }] });
    }

    const eventID = generateEventID();
    const editToken = generateEditToken();
    const iCalObj = ical.parseICS(req.file.buffer.toString("utf8"));
    const data = iCalObj[Object.keys(iCalObj)[0]];

    // pull organizer email & name if present
    let creatorEmail: string | undefined;
    if (req.body.creatorEmail) {
      creatorEmail = req.body.creatorEmail;
    } else if (data.organizer) {
      const val =
        typeof data.organizer === "string"
          ? data.organizer
          : data.organizer.val;
      creatorEmail = val.replace(/^MAILTO:/, "");
    }
    let hostName: string | undefined;
    if (data.organizer && typeof data.organizer !== "string") {
      hostName = data.organizer.params.CN.replace(/"+/g, "");
    }

    try {
      await prisma.event.create({
        data: {
          id: eventID,
          type: "public",
          name: data.summary,
          location: data.location,
          start: data.start as Date,
          end: data.end as Date,
          timezone: "Etc/UTC",
          description: data.description,
          image: null,
          creatorEmail,
          url: null,
          hostName,
          editToken,
          showOnPublicList: false,
          usersCanAttend: false,
          usersCanComment: false,
          firstLoad: true,
        },
      });
      addToLog("createEvent", "success", `Imported ${eventID}`);
      if (creatorEmail) {
        req.emailService.sendEmailFromTemplate({
          to: creatorEmail,
          subject: data.summary || "",
          templateName: "createEvent",
          templateData: { eventID, editToken },
        });
      }
      return res.json({
        eventID,
        editToken,
        url: `/${eventID}?e=${editToken}`,
      });
    } catch (err) {
      console.error(err);
      addToLog("createEvent", "error", `Import failed: ${err}`);
      return res
        .status(500)
        .json({ errors: [{ message: String(err) }] });
    }
  }
);

// DELETE /event/attendee/:eventID?p=… — self-remove from an event
router.delete(
  "/event/attendee/:eventID",
  async (req: Request, res: Response) => {
    const { eventID } = req.params;
    const removalPassword = String(req.query.p || "");
    if (!removalPassword) {
      return res
        .status(400)
        .json({ error: "Please provide a removal password." });
    }

    try {
      const attendee = await prisma.attendee.findFirst({
        where: { eventId: eventID, removalPassword },
      });
      if (!attendee) {
        return res
          .status(404)
          .json({ error: "No attendee found with that removal password." });
      }
      await prisma.attendee.delete({ where: { id: attendee.id } });
      addToLog(
        "unattendEvent",
        "success",
        `Attendee removed from event ${eventID}`
      );
      if (attendee.email) {
        await req.emailService.sendEmailFromTemplate({
          to: attendee.email,
          subject: i18next.t("routes.removeeventattendeesubject"),
          templateName: "unattendEvent",
          templateData: { eventID },
        });
      }
      return res.sendStatus(200);
    } catch (e) {
      addToLog(
        "removeEventAttendee",
        "error",
        `Removal failed for ${eventID}: ${e}`
      );
      return res
        .status(500)
        .json({ error: "An unexpected error occurred." });
    }
  }
);

// GET /event/:eventID/unattend/:removalPasswordHash — one-click unattend from email
router.get(
  "/event/:eventID/unattend/:removalPasswordHash",
  async (req: Request, res: Response) => {
    const { eventID, removalPasswordHash } = req.params;
    const attendees = await prisma.attendee.findMany({
      where: { eventId: eventID },
    });
    const target = attendees.find(
      (a) => hashString(a.removalPassword || "") === removalPasswordHash
    );
    if (!target) {
      return res.redirect(`/${eventID}`);
    }
    await prisma.attendee.delete({ where: { id: target.id } });
    if (target.email) {
      // re-fetch event for template data
      const ev = await prisma.event.findUnique({ where: { id: eventID } });
      await req.emailService.sendEmailFromTemplate({
        to: target.email,
        subject: `You have been removed from ${ev?.name}`,
        templateName: "unattendEvent",
        templateData: { event: ev },
      });
    }
    return res.redirect(`/${eventID}?m=unattend`);
  }
);

export default router;
