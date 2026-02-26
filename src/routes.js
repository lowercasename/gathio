import fs from "fs";
import express from "express";
import { customAlphabet } from "nanoid";
import { frontendConfig, getConfig } from "./lib/config.js";
import { addToLog } from "./helpers.js";
import moment from "moment-timezone";
import crypto from "crypto";
import niceware from "niceware";
import fileUpload from "express-fileupload";
import schedule from "node-schedule";
import {
  broadcastCreateMessage,
  broadcastDeleteMessage,
} from "./activitypub.js";
import Event from "./models/Event.js";
import EventGroup from "./models/EventGroup.js";
import path from "path";
import i18next from "i18next";

const config = getConfig();
const domain = config.general.domain;

// This alphabet (used to generate all event, group, etc. IDs) is missing '-'
// because ActivityPub doesn't like it in IDs
const nanoid = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_",
  21,
);

const router = express.Router();
router.use(fileUpload());

// SCHEDULED DELETION
schedule.scheduleJob("59 23 * * *", async function (_fireDate) {
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

  try {
    const oldEvents = await Event.find({ end: { $lte: too_old } });
    oldEvents.forEach(async (event) => {
      const deleteEventFromDB = async (id) => {
        try {
          const _response = await Event.deleteOne({ _id: id });
          addToLog(
            "deleteOldEvents",
            "success",
            "Old event " + id + " deleted",
          );
        } catch (err) {
          addToLog(
            "deleteOldEvents",
            "error",
            "Attempt to delete old event " + id + " failed with error: " + err,
          );
        }
      };

      if (event.image) {
        fs.unlink(
          path.join(process.cwd(), "/public/events/" + event.image),
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
        // const guidUpdateObject = crypto
        //     .randomBytes(16)
        //     .toString("hex");
        const jsonUpdateObject = JSON.parse(event.activityPubActor);
        const jsonEventObject = JSON.parse(event.activityPubEvent);

        try {
          await broadcastDeleteMessage(
            jsonUpdateObject,
            event.followers,
            event.id,
          );

          await broadcastDeleteMessage(
            jsonEventObject,
            event.followers,
            event.id,
          );

          return deleteEventFromDB(event._id);
        } catch (err) {
          return addToLog(
            "deleteOldEvents",
            "error",
            "Attempt to broadcast delete for old event " +
              event.id +
              " failed with error: " +
              err,
          );
        }
      } else {
        // No ActivityPub data - simply delete the event
        deleteEventFromDB(event._id);
      }
    });
  } catch (err) {
    addToLog(
      "deleteOldEvents",
      "error",
      "Attempt to delete old event failed with error: " + err,
    );
  }
});

// BACKEND ROUTES
router.post("/verifytoken/event/:eventID", async (req, res) => {
  const event = await Event.findOne({
    id: req.params.eventID,
    editToken: req.body.editToken,
  });

  if (event) return res.sendStatus(200);
  return res.sendStatus(404);
});

router.post("/verifytoken/group/:eventGroupID", async (req, res) => {
  const group = await EventGroup.findOne({
    id: req.params.eventGroupID,
    editToken: req.body.editToken,
  });

  if (group) return res.sendStatus(200);
  return res.sendStatus(404);
});

router.post("/deleteimage/:eventID/:editToken", async (req, res) => {
  let submittedEditToken = req.params.editToken;
  let eventImage;

  const event = await Event.findOne({
    id: req.params.eventID,
  });

  if (event.editToken === submittedEditToken) {
    // Token matches
    if (event.image) {
      eventImage = event.image;
    } else {
      res
        .status(500)
        .send(
          "This event doesn't have a linked image. What are you even doing",
        );
    }
    fs.unlink(
      path.join(process.cwd(), "/public/events/" + eventImage),
      async (err) => {
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

        try {
          const _response = await event.save();

          res.status(200).send("Success");
        } catch (err) {
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
      },
    );
  }
});

router.post("/deleteevent/:eventID/:editToken", async (req, res) => {
  let submittedEditToken = req.params.editToken;

  try {
    const event = await Event.findOne({
      id: req.params.eventID,
    });

    if (event.editToken === submittedEditToken) {
      // Token matches

      let eventImage;
      if (event.image) {
        eventImage = event.image;
      }

      // broadcast a Delete profile message to all followers so that at least Mastodon servers will delete their local profile information
      const jsonUpdateObject = JSON.parse(event.activityPubActor);

      try {
        await broadcastDeleteMessage(
          jsonUpdateObject,
          event.followers,
          req.params.eventID,
        );

        await Event.deleteOne({ id: req.params.eventID });
        // Delete image
        if (eventImage) {
          fs.unlink(
            path.join(process.cwd(), "/public/events/" + eventImage),
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
                "Event " + req.params.eventID + " deleted",
              );
            },
          );
        }
        res.writeHead(302, {
          Location: "/",
        });
        res.end();

        const attendeeEmails =
          event?.attendees
            ?.filter((o) => o.status === "attending" && o.email)
            .map((o) => o.email || "") || [];
        if (attendeeEmails.length) {
          console.log("Sending emails to: " + attendeeEmails);

          try {
            await req.emailService.sendEmailFromTemplate({
              to: attendeeEmails,
              subject: i18next.t("routes.deleteeventsubject", {
                eventName: event?.name,
              }),
              templateName: "deleteEvent",
              templateData: {
                eventName: event?.name,
              },
            });
          } catch (e) {
            console.error("error sending attendee email", e.toString());
            res.status(500).end();
          }
        } else {
          console.log("Nothing to send!");
        }
      } catch (err) {
        res.send("Sorry! Something went wrong (error deleting): " + err);
        addToLog(
          "deleteEvent",
          "error",
          "Attempt to delete event " +
            req.params.eventID +
            " failed with error: " +
            err,
        );
      }
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
  } catch (err) {
    res.send("Sorry! Something went wrong: " + err);
    addToLog(
      "deleteEvent",
      "error",
      "Attempt to delete event " +
        req.params.eventID +
        " failed with error: " +
        err,
    );
  }
});

router.post("/deleteeventgroup/:eventGroupID/:editToken", async (req, res) => {
  let submittedEditToken = req.params.editToken;

  try {
    const eventGroup = await EventGroup.findOne({
      id: req.params.eventGroupID,
    });

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

      try {
        await EventGroup.deleteOne(
          { id: req.params.eventGroupID },
          function (err, _raw) {
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
        );

        // Delete image
        if (eventGroupImage) {
          fs.unlink(
            path.join(process.cwd(), "/public/events/" + eventGroupImage),
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

        try {
          const _response = await Event.updateOne(
            { _id: { $in: linkedEventIDs } },
            { $set: { eventGroup: null } },
            { multi: true },
          );

          addToLog(
            "deleteEventGroup",
            "success",
            "Event group " + req.params.eventGroupID + " deleted",
          );
          res.writeHead(302, {
            Location: "/",
          });
          res.end();
        } catch (err) {
          res.send("Sorry! Something went wrong (error deleting): " + err);
          addToLog(
            "deleteEventGroup",
            "error",
            "Attempt to delete event group " +
              req.params.eventGroupID +
              " failed with error: " +
              err,
          );
        }
      } catch (err) {
        res.send("Sorry! Something went wrong (error deleting): " + err);
        addToLog(
          "deleteEventGroup",
          "error",
          "Attempt to delete event group " +
            req.params.eventGroupID +
            " failed with error: " +
            err,
        );
      }
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
  } catch (err) {
    res.send("Sorry! Something went wrong: " + err);
    addToLog(
      "deleteEventGroup",
      "error",
      "Attempt to delete event group " +
        req.params.eventGroupID +
        " failed with error: " +
        err,
    );
  }
});

router.post("/attendee/provision", async (req, res) => {
  const removalPassword = niceware.generatePassphrase(6).join("-");
  let event;

  try {
    event = await Event.findOne({ id: req.query.eventID });
  } catch (e) {
    addToLog(
      "provisionEventAttendee",
      "error",
      "Attempt to provision attendee in event " +
        req.query.eventID +
        " failed with error: " +
        e,
    );
    event = res.sendStatus(500);
  }

  if (!event) {
    return res.sendStatus(404);
  }

  const newAttendee = {
    status: "provisioned",
    removalPassword,
    created: Date.now(),
    approved: !event.approveRegistrations, // Auto approve if this event does not require approvals
  };

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
  // For approval-required events, only count approved attendees toward capacity
  let freeSpots;
  if (event.maxAttendees !== null && event.maxAttendees !== undefined) {
    freeSpots =
      event.maxAttendees -
      event.attendees.reduce(
        (acc, a) =>
          acc +
          (a.status === "attending" &&
          (!event.approveRegistrations || a.approved)
            ? a.number || 1
            : 0),
        0,
      );
  } else {
    freeSpots = undefined;
  }
  return res.json({ removalPassword, freeSpots });
});

// this is a one-click unattend that requires a secret URL that only the person who RSVPed over
// activitypub knows
router.get("/oneclickunattendevent/:eventID/:attendeeID", async (req, res) => {
  // Mastodon and Pleroma will "click" links that sent to its users, presumably as a prefetch?
  // Anyway, this ignores the automated clicks that are done without the user's knowledge
  if (
    req.headers["user-agent"] &&
    (req.headers["user-agent"].toLowerCase().includes("mastodon") ||
      req.headers["user-agent"].toLowerCase().includes("pleroma"))
  ) {
    return res.sendStatus(200);
  }

  try {
    const event = await Event.findOneAndUpdate(
      { id: req.params.eventID },
      { $pull: { attendees: { _id: req.params.attendeeID } } },
    );

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
      try {
        await req.emailService.sendEmailFromTemplate({
          to: req.body.attendeeEmail,
          subject: i18next.t("routes.removeeventattendeesubject"),
          templateName: "removeEventAttendee",
          templateData: {
            eventName: event.name,
          },
        });
      } catch (e) {
        console.error(
          "error sending removeEventAttendeeHtml email",
          e.toString(),
        );
        res.status(500).end();
      }
    }
    res.writeHead(302, {
      Location: "/" + req.params.eventID,
    });
    res.end();
  } catch (err) {
    res.send("Database error, please try again :(");
    addToLog(
      "removeEventAttendee",
      "error",
      "Attempt to remove attendee by admin from event " +
        req.params.eventID +
        " failed with error: " +
        err,
    );
  }
});

/*
 * Create an email subscription on an event group.
 */
router.post("/subscribe/:eventGroupID", async (req, res) => {
  const subscriber = {
    email: req.body.emailAddress,
  };
  if (!subscriber.email) {
    return res.sendStatus(500);
  }

  try {
    const eventGroup = await EventGroup.findOne({
      id: req.params.eventGroupID,
    });

    if (!eventGroup) {
      return res.sendStatus(404);
    }
    eventGroup.subscribers.push(subscriber);
    eventGroup.save();

    try {
      await req.emailService.sendEmailFromTemplate({
        to: subscriber.email,
        subject: i18next.t("routes.subscribedsubject"),
        templateName: "subscribed",
        templateData: {
          eventGroupName: eventGroup.name,
          eventGroupID: eventGroup.id,
          emailAddress: encodeURIComponent(subscriber.email),
        },
      });
    } catch (e) {
      console.error(
        "error sending removeEventAttendeeHtml email",
        e.toString(),
      );
      res.status(500).end();
    }

    return res.redirect(`/group/${eventGroup.id}`);
  } catch (error) {
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
  }
});

/*
 * Delete an existing email subscription on an event group.
 */
router.get("/unsubscribe/:eventGroupID", async (req, res) => {
  const email = req.query.email;
  if (!email) {
    return res.sendStatus(500);
  }

  try {
    const _response = await EventGroup.updateOne(
      { id: req.params.eventGroupID },
      { $pull: { subscribers: { email } } },
    );

    return res.redirect("/");
  } catch (error) {
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
  }
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
    async function (err, event) {
      if (!event) {
        return res.sendStatus(404);
      }
      event.comments.push(newComment);

      try {
        await event.save();

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
        broadcastCreateMessage(jsonObject, event.followers, req.params.eventID);
        if (!event) {
          return res.sendStatus(404);
        }

        const event = await Event.findOne({ id: req.params.eventID });
        const attendeeEmails =
          event.attendees
            .filter((o) => o.status === "attending" && o.email)
            .map((o) => o.email || "") || [];
        if (attendeeEmails.length) {
          console.log("Sending emails to: " + attendeeEmails);

          try {
            await req.emailService.sendEmailFromTemplate({
              to: event?.creatorEmail || config.general.email,
              bcc: attendeeEmails,
              subject: i18next.t("routes.addeventcommentsubject", {
                eventName: event?.name,
              }),
              templateName: "addEventComment",
              templateData: {
                eventID: req.params.eventID,
                commentAuthor: req.body.commentAuthor,
              },
            });
          } catch (e) {
            console.error(
              "error sending removeEventAttendeeHtml email",
              e.toString(),
            );
            res.status(500).end();
          }
        } else {
          console.log("Nothing to send!");
        }
        res.writeHead(302, {
          Location: "/" + req.params.eventID,
        });
        res.end();
      } catch (err) {
        res.send("Database error, please try again :(" + err);
        addToLog(
          "addEventComment",
          "error",
          "Attempt to add comment to event " +
            req.params.eventID +
            " failed with error: " +
            err,
        );
      }
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
    async function (err, event) {
      if (!event) {
        return res.sendStatus(404);
      }
      var parentComment = event.comments.id(commentID);
      parentComment.replies.push(newReply);

      try {
        await event.save();

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
        broadcastCreateMessage(jsonObject, event.followers, req.params.eventID);
        const event = await Event.findOne({ id: req.params.eventID });
        if (!event) {
          return res.sendStatus(404);
        }
        const attendeeEmails =
          event.attendees
            .filter((o) => o.status === "attending" && o.email)
            .map((o) => o.email || "") || [];
        if (attendeeEmails.length) {
          console.log("Sending emails to: " + attendeeEmails);

          try {
            await req.emailService.sendEmailFromTemplate({
              to: event?.creatorEmail || config.general.email,
              bcc: attendeeEmails,
              subject: i18next.t("routes.addeventcommentsubject", {
                eventName: event.name,
              }),
              templateName: "addEventComment",
              templateData: {
                eventID: req.params.eventID,
                commentAuthor: req.body.replyAuthor,
              },
            });
          } catch (e) {
            console.error(
              "error sending removeEventAttendeeHtml email",
              e.toString(),
            );
            res.status(500).end();
          }
        } else {
          console.log("Nothing to send!");
        }
        res.writeHead(302, {
          Location: "/" + req.params.eventID,
        });
        res.end();
      } catch (err) {
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
      }
    },
  );
});

router.post(
  "/deletecomment/:eventID/:commentID/:editToken",
  async (req, res) => {
    let submittedEditToken = req.params.editToken;

    try {
      const event = await Event.findOne({
        id: req.params.eventID,
      });

      if (event.editToken === submittedEditToken) {
        // Token matches
        event.comments.id(req.params.commentID).remove();

        try {
          await event.save();

          addToLog(
            "deleteComment",
            "success",
            "Comment deleted from event " + req.params.eventID,
          );
          res.writeHead(302, {
            Location: "/" + req.params.eventID + "?e=" + req.params.editToken,
          });
          res.end();
        } catch (err) {
          res.send("Sorry! Something went wrong (error deleting): " + err);
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
        }
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
    } catch (err) {
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
    }
  },
);

router.use(function (req, res, _next) {
  return res.status(404).render("404", frontendConfig(res));
});

addToLog("startup", "success", "Started up successfully");

export default router;
