//src/activitypub.js

import request from "request";
import { addToLog } from "./helpers.js";
import crypto from "crypto";
import { customAlphabet } from "nanoid";
import moment from "moment-timezone";
import sanitizeHtml from "sanitize-html";
import { getConfig } from "./lib/config.js";
import { PrismaClient } from "@prisma/client";
import {
  handlePollResponse,
  activityPubContentType,
  alternateActivityPubContentType,
  getEventId,
  getNoteRecipient,
} from "./lib/activitypub.js";

const prisma = new PrismaClient();
const config = getConfig();
const domain = config.general.domain;
const siteName = config.general.site_name;
const isFederated = config.general.is_federated;

// Nano ID alphabet without '-' per ActivityPub spec
const nanoid = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_",
  21
);

/**
 * Build the ActivityPub actor (as JSON string) for an event.
 */
export function createActivityPubActor(
  eventID,
  domain,
  pubkey,
  description,
  name,
  location,
  imageFilename,
  startUTC,
  endUTC,
  timezone
) {
  let actor = {
    "@context": [
      "https://www.w3.org/ns/activitystreams",
      "https://w3id.org/security/v1",
      {
        toot: "http://joinmastodon.org/ns#",
        discoverable: "toot:discoverable",
        indexable: "toot:indexable",
      },
    ],
    type: "Person",
    id: `https://${domain}/${eventID}`,
    preferredUsername: `${eventID}`,
    inbox: `https://${domain}/activitypub/inbox`,
    outbox: `https://${domain}/${eventID}/outbox`,
    followers: `https://${domain}/${eventID}/followers`,
    featured: `https://${domain}/${eventID}/featured`,
    summary: `<p>${description}</p>`,
    name: name,
    publicKey: {
      id: `https://${domain}/${eventID}#main-key`,
      owner: `https://${domain}/${eventID}`,
      publicKeyPem: pubkey,
    },
    discoverable: false,
    indexable: false,
  };

  if (location) {
    actor.summary += `<p>Location: ${location}.</p>`;
  }

  if (startUTC && timezone) {
    const displayDate = moment.tz(startUTC, timezone).format(
      "D MMMM YYYY h:mm a"
    );
    actor.summary += `<p>Starts ${displayDate} ${timezone}.</p>`;
  }

  if (imageFilename) {
    actor.icon = {
      type: "Image",
      mediaType: "image/jpg",
      url: `https://${domain}/events/${imageFilename}`,
    };
  }

  return JSON.stringify(actor);
}

/**
 * Build the ActivityPub Event object (as JSON string).
 */
export function createActivityPubEvent(
  name,
  startUTC,
  endUTC,
  timezone,
  description,
  location
) {
  const guid = crypto.randomBytes(16).toString("hex");
  const eventObject = {
    "@context": [
      "https://www.w3.org/ns/activitystreams",
      "https://w3id.org/security/v1",
    ],
    id: `https://${domain}/${guid}`,
    type: "Event",
    name,
    startTime: moment.tz(startUTC, timezone).format(),
    endTime: moment.tz(endUTC, timezone).format(),
    content: description,
    location,
    discoverable: false,
    indexable: false,
  };
  return JSON.stringify(eventObject);
}

/**
 * Create the “featured” Note for an event’s timeline.
 */
export function createFeaturedPost(
  eventID,
  name,
  startUTC,
  endUTC,
  timezone,
  description,
  location
) {
  return {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: `https://${domain}/${eventID}/m/featuredPost`,
    type: "Note",
    name: name,
    cc: "https://www.w3.org/ns/activitystreams#Public",
    content: `<p>This event on <a href="https://${domain}/${eventID}">${siteName}</a>…</p>`,
    attributedTo: `https://${domain}/${eventID}`,
  };
}

/**
 * Update an existing Event object (keep the same id).
 */
export function updateActivityPubEvent(
  oldEvent,
  name,
  startUTC,
  endUTC,
  timezone,
  description,
  location
) {
  const eventObject = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: oldEvent.id,
    type: "Event",
    name,
    startTime: moment.tz(startUTC, timezone).format(),
    endTime: moment.tz(endUTC, timezone).format(),
    content: description,
    location,
  };
  return JSON.stringify(eventObject);
}

/**
 * Update an existing Actor object in place.
 */
export function updateActivityPubActor(
  actor,
  description,
  name,
  location,
  imageFilename,
  startUTC,
  endUTC,
  timezone
) {
  actor.summary = `<p>${description}</p>`;
  actor.name = name;
  if (location) {
    actor.summary += `<p>Location: ${location}.</p>`;
  }
  if (startUTC && timezone) {
    const displayDate = moment.tz(startUTC, timezone).format(
      "D MMMM YYYY h:mm a"
    );
    actor.summary += `<p>Starts ${displayDate} ${timezone}.</p>`;
  }
  if (imageFilename) {
    actor.icon = {
      type: "Image",
      mediaType: "image/jpg",
      url: `https://${domain}/events/${imageFilename}`,
    };
  }
  return JSON.stringify(actor);
}

/**
 * Sign a message with the event’s private key and POST it to the target inbox.
 * Then store the message (and its object) in the database.
 */
export async function signAndSend(
  message,
  eventID,
  targetDomain,
  inbox,
  callback = () => {}
) {
  if (!isFederated) return callback(null, null, 200);

  try {
    // Load the event to get its privateKey
    const event = await prisma.event.findUnique({
      where: { id: eventID },
    });
    if (!event || !event.privateKey) {
      return callback(`Event ${eventID} not found`, null, 404);
    }

    // Create digest & signature
    const jsonBody = JSON.stringify(message);
    const digest = crypto.createHash("sha256").update(jsonBody).digest("base64");
    const signer = crypto.createSign("sha256");
    const date = new Date().toUTCString();
    const stringToSign = `(request-target): post ${new URL(inbox).pathname}\nhost: ${targetDomain}\ndate: ${date}\ndigest: SHA-256=${digest}`;
    signer.update(stringToSign);
    signer.end();
    const signatureB64 = signer.sign(event.privateKey).toString("base64");
    const algorithm = "rsa-sha256";
    const signatureHeader = `keyId="https://${domain}/${eventID}",algorithm="${algorithm}",headers="(request-target) host date digest",signature="${signatureB64}"`;

    // POST to remote inbox
    request(
      {
        url: inbox,
        method: "POST",
        json: true,
        body: message,
        headers: {
          Host: targetDomain,
          Date: date,
          Digest: `SHA-256=${digest}`,
          Signature: signatureHeader,
          "Content-Type": activityPubContentType,
          Accept: activityPubContentType,
          "User-Agent": `Gathio - ${domain}`,
        },
      },
      async (err, response) => {
        if (err) {
          return callback(err, null, 500);
        }
        try {
          // Store the ActivityPubMessage
          await prisma.activityPubMessage.create({
            data: {
              id: message.id,
              content: JSON.stringify(message),
              event: { connect: { id: eventID } },
            },
          });
          // Also store the object if present
          if (message.object && message.object.id) {
            await prisma.activityPubMessage.create({
              data: {
                id: message.object.id,
                content: JSON.stringify(message.object),
                event: { connect: { id: eventID } },
              },
            });
          }
          addToLog(
            "addActivityPubMessage",
            "success",
            `Message ${message.id} stored for event ${eventID}`
          );
          callback(null, message.id, response?.statusCode || 200);
        } catch (dbErr) {
          addToLog(
            "addActivityPubMessage",
            "error",
            `Storing message for ${eventID} failed: ${dbErr}`
          );
          callback(dbErr, null, 500);
        }
      }
    );
  } catch (e) {
    callback(e, null, 500);
  }
}

/**
 * Broadcast a Create to every follower.
 */
export function broadcastCreateMessage(apObject, followers, eventID) {
  if (!isFederated) return;
  const guid = crypto.randomBytes(16).toString("hex");

  for (const f of followers) {
    const actorJson = JSON.parse(f.actorJson || "{}");
    const inbox = actorJson.inbox;
    const targetDomain = new URL(f.actorId).hostname;

    const createMessage = {
      "@context": ["https://www.w3.org/ns/activitystreams", "https://w3id.org/security/v1"],
      id: `https://${domain}/${eventID}/m/${guid}`,
      type: "Create",
      actor: `https://${domain}/${eventID}`,
      to: [f.actorId],
      cc: "https://www.w3.org/ns/activitystreams#Public",
      object: apObject,
    };

    signAndSend(createMessage, eventID, targetDomain, inbox, (err) => {
      if (err) console.error(`Failed Create to ${f.actorId}:`, err);
    });
  }
}

/**
 * Broadcast an Announce (boost) to every follower.
 */
export function broadcastAnnounceMessage(apObject, followers, eventID) {
  if (!isFederated) return;
  const guid = crypto.randomBytes(16).toString("hex");

  for (const f of followers) {
    const actorJson = JSON.parse(f.actorJson || "{}");
    const inbox = actorJson.inbox;
    const targetDomain = new URL(f.actorId).hostname;

    const announceMessage = {
      "@context": ["https://www.w3.org/ns/activitystreams", "https://w3id.org/security/v1"],
      id: `https://${domain}/${eventID}/m/${guid}`,
      type: "Announce",
      actor: `https://${domain}/${eventID}`,
      to: f.actorId,
      object: apObject,
    };

    signAndSend(announceMessage, eventID, targetDomain, inbox, (err) => {
      if (err) console.error(`Failed Announce to ${f.actorId}:`, err);
    });
  }
}

/**
 * Broadcast an Update to every follower.
 */
export function broadcastUpdateMessage(apObject, followers, eventID) {
  if (!isFederated) return;
  const guid = crypto.randomBytes(16).toString("hex");

  for (const f of followers) {
    const actorJson = JSON.parse(f.actorJson || "{}");
    const inbox = actorJson.inbox;
    const targetDomain = new URL(f.actorId).hostname;

    const updateMessage = {
      "@context": "https://www.w3.org/ns/activitystreams",
      id: `https://${domain}/${eventID}/m/${guid}`,
      type: "Update",
      actor: `https://${domain}/${eventID}`,
      object: apObject,
    };

    signAndSend(updateMessage, eventID, targetDomain, inbox, (err) => {
      if (err) console.error(`Failed Update to ${f.actorId}:`, err);
    });
  }
}

/**
 * Broadcast a Delete to every follower, then call callback with an array of results.
 */
export async function broadcastDeleteMessage(apObject, followers, eventID, callback = () => {}) {
  if (!isFederated) {
    return callback([]);
  }
  const guid = crypto.randomBytes(16).toString("hex");
  const results = await Promise.all(
    followers.map(
      (f) =>
        new Promise((resolve) => {
          const actorJson = JSON.parse(f.actorJson || "{}");
          const inbox = actorJson.inbox;
          const targetDomain = new URL(f.actorId).hostname;
          const deleteMessage = {
            "@context": "https://www.w3.org/ns/activitystreams",
            id: `https://${domain}/${eventID}/m/${guid}`,
            type: "Delete",
            actor: `https://${domain}/${eventID}`,
            object: apObject,
          };
          signAndSend(deleteMessage, eventID, targetDomain, inbox, (err) => {
            resolve(err ? { error: err, actor: f.actorId } : { ok: true, actor: f.actorId });
          });
        })
    )
  );
  callback(results);
}

/**
 * Send a direct message to a single follower.
 */
export async function sendDirectMessage(apObject, actorId, eventID, callback = () => {}) {
  if (!isFederated) return;
  const guidCreate = crypto.randomBytes(16).toString("hex");
  const guidObject = crypto.randomBytes(16).toString("hex");
  const published = new Date().toISOString();

  apObject.published = published;
  apObject.attributedTo = `https://${domain}/${eventID}`;
  apObject.to = actorId;
  apObject.id = `https://${domain}/${eventID}/m/${guidObject}`;
  apObject.content = unescape(apObject.content);

  const createMessage = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: `https://${domain}/${eventID}/m/${guidCreate}`,
    type: "Create",
    actor: `https://${domain}/${eventID}`,
    to: [actorId],
    object: apObject,
  };

  try {
    const event = await prisma.event.findUnique({
      where: { id: eventID },
      include: { followers: true },
    });
    if (!event) throw new Error(`No event ${eventID}`);
    const follower = event.followers.find((f) => f.actorId === actorId);
    if (!follower) throw new Error(`No follower ${actorId}`);
    const inbox = JSON.parse(follower.actorJson || "{}").inbox;
    const targetDomain = new URL(actorId).hostname;
    signAndSend(createMessage, eventID, targetDomain, inbox, callback);
  } catch (e) {
    callback(e, null, 500);
  }
}

/**
 * Process an incoming ActivityPub inbox delivery.
 */
export function processInbox(req, res) {
  if (!isFederated) return res.sendStatus(404);

  const { type, object } = req.body;

  if (type === "Follow" && typeof object === "object") {
    return _handleFollow(req, res);
  } else if (type === "Undo" && object?.type === "Follow") {
    return _handleUndoFollow(req, res);
  } else if (type === "Accept" && typeof object === "string") {
    return _handleAcceptEvent(req, res);
  } else if (type === "Undo" && object?.type === "Accept") {
    return _handleUndoAcceptEvent(req, res);
  } else if (type === "Create" && object?.type === "Note" && object.inReplyTo) {
    return handlePollResponse(req, res);
  } else if (type === "Delete") {
    return _handleDelete(req, res);
  } else if (
    type === "Create" &&
    object?.type === "Note" &&
    object.to
  ) {
    return _handleCreateNoteComment(req, res);
  } else {
    console.log("Inbox: no matching handler");
    return res.sendStatus(200);
  }
}

/**
 * WebFinger document for a given event.
 */
export function createWebfinger(eventID, domain) {
  return {
    subject: `acct:${eventID}@${domain}`,
    links: [
      {
        rel: "self",
        type: alternateActivityPubContentType,
        href: `https://${domain}/${eventID}`,
      },
    ],
  };
}

// ——— Internal handlers follow ———

async function _handleFollow(req, res) {
  const actorUrl = req.body.actor;
  const eventID = getEventId(req.body.object);
  try {
    // Fetch actor profile
    const resp = await fetch(actorUrl, {
      headers: {
        Accept: activityPubContentType,
        "Content-Type": activityPubContentType,
      },
    });
    if (!resp.ok) throw new Error("Actor fetch failed");
    const actorJson = await resp.json();
    const name = actorJson.preferredUsername || actorJson.name || actorUrl;

    // Add follower in DB if not exists
    await prisma.follower.upsert({
      where: { followId_actorId: { followId: req.body.id, actorId: actorUrl } },
      create: {
        followId: req.body.id,
        actorId: actorUrl,
        actorJson: JSON.stringify(actorJson),
        name,
        event: { connect: { id: eventID } },
      },
      update: {},
    });
    addToLog("addEventFollower", "success", `Follower ${actorUrl} → ${eventID}`);

    // Send Accept
    sendAcceptMessage(req.body, eventID, new URL(actorUrl).hostname, (err) => {
      if (err) console.error("Accept error:", err);
    });

    // Optionally DM a poll question
    const event = await prisma.event.findUnique({ where: { id: eventID } });
    if (event?.usersCanAttend) {
      const question = {
        "@context": "https://www.w3.org/ns/activitystreams",
        type: "Question",
        name: `RSVP to ${event.name}`,
        content: `<span class="h-card"><a href="${actorUrl}" class="u-url mention">@<span>${name}</span></a></span> Will you attend ${event.name}?`,
        oneOf: [
          { type: "Note", name: "Yes, and show me in the public list", replies: { type: "Collection", totalItems: 0 } },
          { type: "Note", name: "Yes, but hide me from the public list", replies: { type: "Collection", totalItems: 0 } },
          { type: "Note", name: "No", replies: { type: "Collection", totalItems: 0 } },
        ],
        endTime: event.startTime,
        tag: [{ type: "Mention", href: actorUrl, name }],
      };
      await sendDirectMessage(question, actorUrl, eventID);
    }

    res.sendStatus(200);
  } catch (err) {
    addToLog("addEventFollower", "error", `${err}`);
    res.sendStatus(500);
  }
}

async function _handleUndoFollow(req, res) {
  const actorUrl = req.body.object.actor;
  const eventID = getEventId(req.body.object.object);
  try {
    await prisma.follower.deleteMany({
      where: { actorId: actorUrl, followId: req.body.object.id, eventId: eventID },
    });
    addToLog("removeEventFollower", "success", `Unfollow ${actorUrl} ← ${eventID}`);
    res.sendStatus(200);
  } catch (err) {
    addToLog("removeEventFollower", "error", `${err}`);
    res.sendStatus(500);
  }
}

async function _handleAcceptEvent(req, res) {
  // Treat an incoming Accept as a successful RSVP
  return handlePollResponse(req, res);
}

async function _handleUndoAcceptEvent(req, res) {
  // Remove attendee by actorId
  const actorUrl = req.body.actor;
  const recipient = getNoteRecipient(req.body);
  const eventID = getEventId(recipient);
  try {
    await prisma.attendee.deleteMany({
      where: { attendeeOriginalId: actorUrl, eventId: eventID },
    });
    addToLog("oneClickUnattend", "success", `Undo RSVP ${actorUrl} from ${eventID}`);
    res.sendStatus(200);
  } catch (err) {
    addToLog("oneClickUnattend", "error", `${err}`);
    res.sendStatus(500);
  }
}

async function _handleDelete(req, res) {
  // Delete a comment by matching activityJson.object.id
  const actorUrl = req.body.actor;
  const deleteId = req.body.object.id;
  try {
    // Find the comment with that activityJson
    const comment = await prisma.comment.findFirst({
      where: { activityJson: { contains: deleteId } },
    });
    if (!comment) return res.sendStatus(404);
    await prisma.comment.delete({ where: { id: comment.id } });
    addToLog("deleteComment", "success", `Deleted comment ${comment.id}`);
    res.sendStatus(200);
  } catch (err) {
    addToLog("deleteComment", "error", `${err}`);
    res.sendStatus(500);
  }
}

async function _handleCreateNoteComment(req, res) {
  const obj = req.body.object;
  const actorUrl = req.body.actor;
  // Only handle public/unlisted Comments
  const to = Array.isArray(obj.to) ? obj.to : [obj.to];
  const cc = Array.isArray(obj.cc) ? obj.cc : [obj.cc];
  if (
    to.includes("https://www.w3.org/ns/activitystreams#Public") ||
    cc.includes("https://www.w3.org/ns/activitystreams#Public")
  ) {
    // Extract eventID
    const targets = [...to, ...cc].filter((u) => u.includes(`https://${domain}/`));
    if (targets.length !== 1) {
      return res.sendStatus(200);
    }
    const eventID = getEventId(targets[0]);
    try {
      const event = await prisma.event.findUnique({
        where: { id: eventID },
        include: { followers: true },
      });
      if (!event || !event.usersCanComment) return res.sendStatus(200);

      // Fetch actor profile
      const profile = await fetch(actorUrl, {
        headers: {
          Accept: activityPubContentType,
          "Content-Type": activityPubContentType,
        },
      });
      const parsedActor = await profile.json();
      const name = parsedActor.preferredUsername || parsedActor.name || actorUrl;

      // Sanitize content and store
      const commentID = nanoid();
      const newComment = {
        id: commentID,
        author: name,
        content: sanitizeHtml(obj.content || "", {
          allowedTags: [],
          allowedAttributes: {},
        }).replace("@" + eventID, ""),
        timestamp: new Date(),
        activityJson: JSON.stringify(req.body),
        actorJson: JSON.stringify(parsedActor),
        event: { connect: { id: eventID } },
      };
      await prisma.comment.create({ data: newComment });
      addToLog("addEventComment", "success", `Comment ${commentID} on ${eventID}`);

      // Announce to followers
      const guid = crypto.randomBytes(16).toString("hex");
      const announce = { ...obj, attributedTo: newComment.actorJson };
      broadcastAnnounceMessage(announce, event.followers, eventID);
      res.sendStatus(200);
    } catch (err) {
      addToLog("addEventComment", "error", `${err}`);
      res.sendStatus(500);
    }
  } else {
    res.sendStatus(200);
  }
}
