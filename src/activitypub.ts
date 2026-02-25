import type { Request, Response } from "express";
import { addToLog } from "./helpers.js";
import crypto from "node:crypto";
import { customAlphabet } from "nanoid";
import moment from "moment-timezone";
import i18next from "i18next";
import sanitizeHtml from "sanitize-html";
import { getConfig } from "./lib/config.js";
const config = getConfig();
const domain = config.general.domain;
const siteName = config.general.site_name;
const isFederated = config.general.is_federated;
import Event, { type IFollower } from "./models/Event.js";
import {
  handlePollResponse,
  activityPubContentType,
  alternateActivityPubContentType,
  getEventId,
  getNoteRecipient,
  signedFetch,
} from "./lib/activitypub.js";

// This alphabet (used to generate all event, group, etc. IDs) is missing '-'
// because ActivityPub doesn't like it in IDs
const nanoid = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_",
  21,
);

// @context for Actor objects (includes Mastodon toot extensions for
// discoverable/indexable)
const actorContext = [
  "https://www.w3.org/ns/activitystreams",
  "https://w3id.org/security/v1",
  {
    toot: "http://joinmastodon.org/ns#",
    discoverable: "toot:discoverable",
    indexable: "toot:indexable",
  },
];

// @context for wrapper activities (Create, Announce, Update, Delete, Accept)
const activityContext = [
  "https://www.w3.org/ns/activitystreams",
  "https://w3id.org/security/v1",
];

export function createActivityPubActor(
  eventID: string,
  domain: string,
  pubkey: string,
  description: string,
  name: string,
  location: string | null,
  imageFilename: string | undefined,
  startUTC: moment.Moment,
  endUTC: moment.Moment,
  timezone: string,
): string {
  const actor: Record<string, unknown> = {
    "@context": actorContext,
    indexable: false,
    discoverable: false,
    id: `https://${domain}/${eventID}`,
    type: "Person",
    preferredUsername: `${eventID}`,
    inbox: `https://${domain}/activitypub/inbox`,
    outbox: `https://${domain}/${eventID}/outbox`,
    followers: `https://${domain}/${eventID}/followers`,
    summary: `<p>${description}</p>`,
    name: name,
    featured: `https://${domain}/${eventID}/featured`,
    publicKey: {
      id: `https://${domain}/${eventID}#main-key`,
      owner: `https://${domain}/${eventID}`,
      publicKeyPem: pubkey,
    },
  };
  if (location) {
    actor.summary += `<p>Location: ${location}.</p>`;
  }
  if (startUTC && timezone) {
    const displayStart = moment
      .tz(startUTC, timezone)
      .format("D MMMM YYYY h:mm a");
    actor.summary += `<p>Starting ${displayStart} ${timezone}.`;
    if (endUTC) {
      const displayEnd = moment
        .tz(endUTC, timezone)
        .format("D MMMM YYYY h:mm a");
      actor.summary += ` Ending ${displayEnd} ${timezone}.`;
    }
    actor.summary += "</p>";
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

export function createActivityPubEvent(
  name: string,
  startUTC: moment.Moment,
  endUTC: moment.Moment,
  timezone: string,
  description: string,
  location: string | null,
): string {
  const guid = crypto.randomBytes(16).toString("hex");
  const eventObject = {
    "@context": actorContext,
    indexable: false,
    discoverable: false,
    id: `https://${domain}/${guid}`,
    name: name,
    type: "Event",
    startTime: moment.tz(startUTC, timezone).format(),
    endTime: moment.tz(endUTC, timezone).format(),
    content: description,
    location: location,
  };
  return JSON.stringify(eventObject);
}

export function createFeaturedPost(eventID: string) {
  const featured = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: `https://${domain}/${eventID}/m/featuredPost`,
    type: "Note",
    name: "Test",
    cc: "https://www.w3.org/ns/activitystreams#Public",
    content: `<p>This is an event that was posted on <a href="https://${domain}/${eventID}">${siteName}</a>. If you follow this account, you'll see updates in your timeline about the event. If your software supports polls, you should get a poll in your DMs asking if you want to RSVP. You can reply and RSVP right from there. If your software has an event calendar built in, you should get an event in your inbox that you can RSVP to like you respond to any event.</p><p>For more information on how to interact with this, <a href="https://docs.gath.io/using-gathio/fediverse/">check out this link</a>.</p>`,
    attributedTo: `https://${domain}/${eventID}`,
  };
  return featured;
}

export function updateActivityPubEvent(
  oldEvent: { id: string },
  name: string,
  startUTC: moment.Moment,
  endUTC: moment.Moment,
  timezone: string,
  description: string,
  location: string | null,
): string {
  // we want to persist the old ID no matter what happens to the Event itself
  const id = oldEvent.id;
  const eventObject = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: id,
    name: name,
    type: "Event",
    startTime: moment.tz(startUTC, timezone).format(),
    endTime: moment.tz(endUTC, timezone).format(),
    content: description,
    location: location,
  };
  return JSON.stringify(eventObject);
}

export function updateActivityPubActor(
  actor: Record<string, unknown> | undefined,
  description: string,
  name: string,
  location: string | null,
  imageFilename: string | undefined,
  startUTC: moment.Moment,
  endUTC: moment.Moment,
  timezone: string,
): string | undefined {
  if (!actor) return undefined;
  actor.summary = `<p>${description}</p>`;
  actor.name = name;
  if (location) {
    actor.summary += `<p>Location: ${location}.</p>`;
  }
  if (startUTC && timezone) {
    const displayStart = moment
      .tz(startUTC, timezone)
      .format("D MMMM YYYY h:mm a");
    actor.summary += `<p>Starting ${displayStart} ${timezone}.`;
    if (endUTC) {
      const displayEnd = moment
        .tz(endUTC, timezone)
        .format("D MMMM YYYY h:mm a");
      actor.summary += ` Ending ${displayEnd} ${timezone}.`;
    }
    actor.summary += "</p>";
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

export async function signAndSend(
  message: Record<string, unknown>,
  eventID: string,
  targetDomain: string,
  inbox: string,
): Promise<void> {
  if (!isFederated) return;
  if (!inbox) {
    throw new Error(`No inbox URL for ${targetDomain}`);
  }
  const inboxFragment = inbox.replace(`https://${targetDomain}`, "");
  // get the private key
  const event = await Event.findOne({ id: eventID });
  if (!event) {
    throw new Error(`No record found for ${eventID}.`);
  }
  const digest = crypto
    .createHash("sha256")
    .update(JSON.stringify(message))
    .digest("base64");
  const privateKey = event.privateKey;
  if (!privateKey) throw new Error(`No private key for ${targetDomain}`);
  const signer = crypto.createSign("sha256");
  const d = new Date();
  const stringToSign = `(request-target): post ${inboxFragment}\nhost: ${targetDomain}\ndate: ${d.toUTCString()}\ndigest: SHA-256=${digest}`;
  signer.update(stringToSign);
  signer.end();
  const signature = signer.sign(privateKey);
  const signature_b64 = signature.toString("base64");
  const algorithm = "rsa-sha256";
  const header = `keyId="https://${domain}/${eventID}",algorithm="${algorithm}",headers="(request-target) host date digest",signature="${signature_b64}"`;
  // Store the message in the database before sending, so that reply-matching
  // (e.g. poll responses referencing this message ID) works even if delivery fails
  const newMessage = {
    id: message.id as string,
    content: JSON.stringify(message),
  };
  event.activityPubMessages?.push(newMessage);
  // also add the message's object if it has one
  const msgObject = message.object as Record<string, unknown> | undefined;
  if (msgObject?.id) {
    event.activityPubMessages?.push({
      id: msgObject.id as string,
      content: JSON.stringify(msgObject),
    });
  }
  await event.save();
  addToLog(
    "addActivityPubMessage",
    "success",
    `ActivityPubMessage added to event ${eventID}`,
  );

  const response = await fetch(inbox, {
    method: "POST",
    headers: {
      Host: targetDomain,
      Date: d.toUTCString(),
      Signature: header,
      Digest: `SHA-256=${digest}`,
      "Content-Type": activityPubContentType,
      Accept: activityPubContentType,
      "User-Agent": `Gathio - ${domain}`,
    },
    body: JSON.stringify(message),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to send to ${inbox}: ${response.status} ${response.statusText}`,
    );
  }
}

// Iterates over followers, resolves each inbox, and sends a wrapped
// ActivityPub message.  The `buildMessage` callback receives the per-follower
// actorId so each message type can customise addressing (to/cc).
async function broadcastToFollowers(
  followers: IFollower[],
  eventID: string,
  buildMessage: (actorId: string, guid: string) => Record<string, unknown>,
): Promise<string[]> {
  if (!isFederated) return [];
  const guid = crypto.randomBytes(16).toString("hex");
  const event = await Event.findOne({ id: eventID });
  if (!event) {
    addToLog("broadcast", "error", `No event found with the id ${eventID}`);
    return [`No event found with the id ${eventID}`];
  }
  const statuses: string[] = [];
  for (const follower of followers) {
    const actorId = follower.actorId;
    if (!actorId) continue;
    const targetDomain = new URL(actorId).hostname;
    const followerFound = event.followers?.find((el) => el.actorId === actorId);
    if (!followerFound) {
      addToLog(
        "broadcast",
        "error",
        `No follower found with the id ${actorId}`,
      );
      statuses.push(`No follower found with the id ${actorId}`);
      continue;
    }
    if (!followerFound.actorJson) {
      addToLog(
        "broadcast",
        "error",
        `No stored actor data for follower ${actorId}, skipping`,
      );
      continue;
    }
    let actorJson: Record<string, unknown>;
    try {
      actorJson = JSON.parse(followerFound.actorJson);
    } catch {
      addToLog(
        "broadcast",
        "error",
        `Corrupt actor data for follower ${actorId}, skipping`,
      );
      continue;
    }
    const inbox = actorJson.inbox as string;
    if (!inbox) {
      addToLog(
        "broadcast",
        "error",
        `No inbox found for follower ${actorId}, skipping`,
      );
      statuses.push(`No inbox for ${actorId}`);
      continue;
    }
    try {
      await signAndSend(
        buildMessage(actorId, guid),
        eventID,
        targetDomain,
        inbox,
      );
      addToLog("broadcast", "success", `Sent to ${actorId}`);
      statuses.push(`sent to ${actorId}`);
    } catch (err) {
      addToLog(
        "broadcast",
        "error",
        `Didn't send to ${actorId} with error ${err}`,
      );
      statuses.push(`Didn't send to ${actorId} with error ${err}`);
    }
  }
  return statuses;
}

// Sends a Create wrapping apObject to every follower (unlisted public so
// non-followers can see it on the profile but it doesn't spam timelines)
export async function broadcastCreateMessage(
  apObject: Record<string, unknown>,
  followers: IFollower[],
  eventID: string,
): Promise<void> {
  await broadcastToFollowers(followers, eventID, (actorId, guid) => ({
    "@context": activityContext,
    id: `https://${domain}/${eventID}/m/${guid}`,
    type: "Create",
    actor: `https://${domain}/${eventID}`,
    to: [actorId],
    cc: "https://www.w3.org/ns/activitystreams#Public",
    object: apObject,
  }));
}

export async function broadcastAnnounceMessage(
  apObject: Record<string, unknown>,
  followers: IFollower[],
  eventID: string,
): Promise<void> {
  await broadcastToFollowers(followers, eventID, (actorId, guid) => ({
    "@context": activityContext,
    id: `https://${domain}/${eventID}/m/${guid}`,
    cc: "https://www.w3.org/ns/activitystreams#Public",
    type: "Announce",
    actor: `https://${domain}/${eventID}`,
    object: apObject,
    to: actorId,
  }));
}

export async function broadcastUpdateMessage(
  apObject: Record<string, unknown>,
  followers: IFollower[],
  eventID: string,
): Promise<void> {
  await broadcastToFollowers(followers, eventID, (_actorId, guid) => ({
    "@context": activityContext,
    id: `https://${domain}/${eventID}/m/${guid}`,
    type: "Update",
    actor: `https://${domain}/${eventID}`,
    object: apObject,
  }));
}

export async function broadcastDeleteMessage(
  apObject: Record<string, unknown>,
  followers: IFollower[],
  eventID: string,
): Promise<string[]> {
  return broadcastToFollowers(followers, eventID, (_actorId, guid) => ({
    "@context": activityContext,
    id: `https://${domain}/${eventID}/m/${guid}`,
    type: "Delete",
    actor: `https://${domain}/${eventID}`,
    object: apObject,
  }));
}

// this sends a message "to:" an individual fediverse user
export async function sendDirectMessage(
  apObject: Record<string, unknown>,
  actorId: string,
  eventID: string,
): Promise<void> {
  if (!isFederated) return;
  const guidCreate = crypto.randomBytes(16).toString("hex");
  const guidObject = crypto.randomBytes(16).toString("hex");
  const d = new Date();

  apObject.published = d.toISOString();
  apObject.attributedTo = `https://${domain}/${eventID}`;
  apObject.to = actorId;
  apObject.id = `https://${domain}/${eventID}/m/${guidObject}`;
  apObject.content = decodeURI(apObject.content as string);

  const createMessage = {
    "@context": activityContext,
    id: `https://${domain}/${eventID}/m/${guidCreate}`,
    type: "Create",
    actor: `https://${domain}/${eventID}`,
    to: [actorId],
    object: apObject,
  };

  const myURL = new URL(actorId);
  const targetDomain = myURL.hostname;
  // get the inbox
  const event = await Event.findOne({ id: eventID });
  if (!event) {
    throw new Error(`No event found with the id ${eventID}`);
  }
  const follower = event.followers?.find((el) => el.actorId === actorId);
  if (!follower) {
    throw new Error(`No follower found with the id ${actorId}`);
  }
  if (!follower.actorJson) {
    throw new Error(`No stored actor data for follower ${actorId}`);
  }
  const actorJson = JSON.parse(follower.actorJson);
  const inbox = actorJson.inbox;
  await signAndSend(createMessage, eventID, targetDomain, inbox);
}

export async function sendAcceptMessage(
  thebody: Record<string, unknown>,
  eventID: string,
  targetDomain: string,
): Promise<void> {
  if (!isFederated) return;
  const guid = crypto.randomBytes(16).toString("hex");
  const actorId = thebody.actor as string;
  const message = {
    "@context": activityContext,
    id: `https://${domain}/${guid}`,
    type: "Accept",
    actor: `https://${domain}/${eventID}`,
    object: thebody,
  };
  // get the inbox
  const event = await Event.findOne({ id: eventID });
  if (!event) {
    throw new Error(`Could not find event ${eventID}`);
  }
  const follower = event.followers?.find((el) => el.actorId === actorId);
  if (!follower) {
    throw new Error(`No follower found with the id ${actorId}`);
  }
  if (!follower.actorJson) {
    throw new Error(`No stored actor data for follower ${actorId}`);
  }
  const actorJson = JSON.parse(follower.actorJson);
  const inbox = actorJson.inbox;
  await signAndSend(message, eventID, targetDomain, inbox);
}

async function _handleFollow(req: Request, res: Response) {
  const targetDomain = new URL(req.body.actor).hostname;
  const eventID = getEventId(req.body.object);

  let body: Record<string, string>;
  try {
    body = await signedFetch(req.body.actor, eventID);
  } catch (err) {
    addToLog("handleFollow", "error", `Error fetching actor: ${err}`);
    return res.status(500).send("Error processing follow.");
  }

  const name = body.preferredUsername || body.name || body.attributedTo;
  const newFollower = {
    actorId: req.body.actor,
    followId: req.body.id,
    name: name,
    actorJson: JSON.stringify(body),
  };

  const event = await Event.findOne({ id: eventID });
  if (!event) return res.sendStatus(404);

  // Already a follower — just say OK
  if (event.followers?.map((el) => el.actorId).includes(req.body.actor)) {
    return res.sendStatus(200);
  }

  event.followers?.push(newFollower);
  try {
    await event.save();
  } catch (err) {
    addToLog(
      "addEventFollower",
      "error",
      `Attempt to add follower to event ${eventID} failed with error: ${err}`,
    );
    return res.status(500).send("Database error, please try again :(");
  }
  addToLog("addEventFollower", "success", `Follower added to event ${eventID}`);

  // Accept the follow request
  try {
    await sendAcceptMessage(req.body, eventID, targetDomain);
  } catch (err) {
    addToLog(
      "handleFollow",
      "error",
      `Didn't send Accept to ${req.body.actor} with error ${err}`,
    );
    return res.status(500).send("Error sending Accept.");
  }

  // Send an ActivityPub Event activity since this person is "interested"
  const jsonEventObject = JSON.parse(event.activityPubEvent ?? "{}");
  try {
    await sendDirectMessage(jsonEventObject, newFollower.actorId, event.id);
  } catch (err) {
    addToLog("handleFollow", "error", `Error sending event DM: ${err}`);
  }

  // If users can self-RSVP, send a Question (poll) to the new follower
  if (event.usersCanAttend) {
    const jsonObject = {
      "@context": "https://www.w3.org/ns/activitystreams",
      name: `RSVP to ${event.name}`,
      type: "Question",
      content: `<span class="h-card"><a href="${req.body.actor}" class="u-url mention">@<span>${name}</span></a></span> Will you attend ${event.name}?`,
      oneOf: [
        {
          type: "Note",
          name: "Yes, and show me in the public list",
          replies: { type: "Collection", totalItems: 0 },
        },
        {
          type: "Note",
          name: "Yes, but hide me from the public list",
          replies: { type: "Collection", totalItems: 0 },
        },
        {
          type: "Note",
          name: "No",
          replies: { type: "Collection", totalItems: 0 },
        },
      ],
      endTime: event.start.toISOString(),
      tag: [{ type: "Mention", href: req.body.actor, name: name }],
    };
    try {
      await sendDirectMessage(jsonObject, req.body.actor, eventID);
    } catch (error) {
      addToLog("handleFollow", "error", `Error sending RSVP poll: ${error}`);
      return res.status(500).send("Error sending RSVP poll.");
    }
  }
  return res.sendStatus(200);
}

async function _handleUndoFollow(req: Request, res: Response) {
  // get the record of all followers for this account
  const eventID = req.body.object.object.replace(`https://${domain}/`, "");
  const event = await Event.findOne({ id: eventID });
  if (!event) return res.sendStatus(404);
  // check to see if the Follow object's id matches the id we have on record
  // is this even someone who follows us
  const indexOfFollower = event.followers?.findIndex(
    (el) => el.actorId === req.body.object.actor,
  );
  if (indexOfFollower !== undefined && indexOfFollower !== -1) {
    // does the id we have match the id we are being given
    if (event.followers?.[indexOfFollower].followId === req.body.object.id) {
      // we have a match and can trust the Undo! remove this person from the followers list
      event.followers?.splice(indexOfFollower, 1);
      try {
        await event.save();
        addToLog(
          "removeEventFollower",
          "success",
          `Follower removed from event ${eventID}`,
        );
        return res.sendStatus(200);
      } catch (err) {
        addToLog(
          "removeEventFollower",
          "error",
          "Attempt to remove follower from event " +
            eventID +
            " failed with error: " +
            err,
        );
        return res.status(500).send("Database error, please try again :(");
      }
    }
  }
  return res.sendStatus(200);
}

async function _handleAcceptEvent(req: Request, res: Response) {
  const { actor } = req.body;
  const recipient = getNoteRecipient(req.body);
  if (!recipient) {
    return res.status(400).send("No recipient found in the object");
  }
  const eventID = getEventId(recipient);
  if (!eventID) {
    return res.status(400).send("No event ID found in the recipient");
  }
  const event = await Event.findOne({ id: eventID });
  if (!event) return res.sendStatus(404);
  // does the id we got match the id of a thing we sent out
  const message = event.activityPubMessages?.find(
    (el) => el.id === req.body.object,
  );
  if (!message) {
    return res.sendStatus(404);
  }
  // it's a match — fetch the actor profile with a signed request
  try {
    const body = await signedFetch(actor, eventID);
    // if this account is NOT already in our attendees list, add it
    if (!event.attendees?.map((el) => el.id).includes(actor)) {
      const attendeeName = body.preferredUsername || body.name || actor;
      const requiresApproval = !!event.approveRegistrations;
      const newAttendee = {
        name: attendeeName,
        status: "attending" as const,
        id: actor,
        number: 1,
        approved: !requiresApproval,
      };
      event.attendees?.push(
        newAttendee as typeof newAttendee & { _id: string },
      );
      try {
        const fullEvent = await event.save();
        addToLog(
          "addEventAttendee",
          "success",
          `Attendee added to event ${eventID}`,
        );
        // get the new attendee with its hidden id from the full event
        const fullAttendee = fullEvent.attendees?.find((el) => el.id === actor);
        let jsonObject: Record<string, unknown>;
        if (requiresApproval) {
          // Send a "pending approval" DM to the user
          jsonObject = {
            "@context": "https://www.w3.org/ns/activitystreams",
            name: `RSVP to ${event.name}`,
            type: "Note",
            content: `<span class="h-card"><a href="${newAttendee.id}" class="u-url mention">@<span>${newAttendee.name}</span></a></span> Thanks for RSVPing to ${event.name}! Your attendance is pending approval from the host. You'll receive a message here once you've been approved.`,
            tag: [
              {
                type: "Mention",
                href: newAttendee.id,
                name: newAttendee.name,
              },
            ],
          };
        } else {
          // send a "click here to remove yourself" link back to the user as a DM
          jsonObject = {
            "@context": "https://www.w3.org/ns/activitystreams",
            name: `RSVP to ${event.name}`,
            type: "Note",
            content: `<span class="h-card"><a href="${newAttendee.id}" class="u-url mention">@<span>${newAttendee.name}</span></a></span> Thanks for RSVPing! You can remove yourself from the RSVP list by clicking here: <a href="https://${domain}/oneclickunattendevent/${event.id}/${fullAttendee?._id}">https://${domain}/oneclickunattendevent/${event.id}/${fullAttendee?._id}</a>`,
            tag: [
              {
                type: "Mention",
                href: newAttendee.id,
                name: newAttendee.name,
              },
            ],
          };
        }
        // send direct message to user
        sendDirectMessage(jsonObject, newAttendee.id, event.id).catch((err) =>
          addToLog(
            "handleAcceptEvent",
            "error",
            `Error sending DM to new attendee: ${err}`,
          ),
        );
        // Notify host by email if approval is required
        if (requiresApproval && event.creatorEmail) {
          req.emailService
            .sendEmailFromTemplate({
              to: event.creatorEmail,
              subject: i18next.t(
                "routes.attendeeawaitingapprovalsubject",
                { eventName: event.name },
              ),
              templateName: "attendeeAwaitingApproval",
              templateData: {
                eventID,
                eventName: event.name,
                attendeeName: newAttendee.name,
                editToken: event.editToken,
              },
            })
            .catch((e: unknown) => {
              console.error(
                "Error sending attendeeAwaitingApproval email:",
                e,
              );
            });
        }
        return res.sendStatus(200);
      } catch (err) {
        addToLog(
          "addEventAttendee",
          "error",
          "Attempt to add attendee to event " +
            eventID +
            " failed with error: " +
            err,
        );
        return res.status(500).send("Database error, please try again :(");
      }
    } else {
      // it's a duplicate and this person is already rsvped so just say OK
      return res.status(200).send("Attendee is already registered.");
    }
  } catch (err) {
    addToLog("handleAcceptEvent", "error", `Error fetching actor: ${err}`);
    return res.status(500).send("Error fetching actor profile.");
  }
}

async function _handleUndoAcceptEvent(req: Request, res: Response) {
  let { to } = req.body;
  const { actor } = req.body;
  if (Array.isArray(to)) {
    to = to[0];
  }
  const eventID = to.replace(`https://${domain}/`, "");
  const event = await Event.findOne({ id: eventID });
  if (!event) return res.sendStatus(404);
  // does the id we got match the id of a thing we sent out
  const message = event.activityPubMessages?.find(
    (el) => el.id === req.body.object.object,
  );
  if (message) {
    // it's a match
    await Event.updateOne(
      { id: eventID },
      { $pull: { attendees: { id: actor } } },
    );
    addToLog(
      "oneClickUnattend",
      "success",
      `Attendee removed via one click unattend ${eventID}`,
    );
  }
  return res.sendStatus(200);
}

async function _handleDelete(req: Request, res: Response) {
  // find all events with comments from the author
  const events = await Event.find({ "comments.actorId": req.body.actor });
  if (!events || events.length === 0) {
    return res.sendStatus(404);
  }

  // find the event with THIS comment from the author
  const eventWithComment = events.find((event) => {
    const comments = event.comments;
    return comments?.find((comment) => {
      if (!comment.activityJson) {
        return false;
      }
      return JSON.parse(comment.activityJson).object.id === req.body.object.id;
    });
  });

  if (!eventWithComment) {
    return res.sendStatus(404);
  }

  // delete the comment
  const indexOfComment =
    eventWithComment.comments?.findIndex((comment) => {
      return (
        comment.activityJson &&
        JSON.parse(comment.activityJson).object.id === req.body.object.id
      );
    }) ?? -1;
  if (indexOfComment === -1) {
    return res.sendStatus(404);
  }
  eventWithComment.comments?.splice(indexOfComment, 1);
  try {
    await eventWithComment.save();
    addToLog(
      "deleteComment",
      "success",
      `Comment deleted from event ${eventWithComment.id}`,
    );
    return res.sendStatus(200);
  } catch (err) {
    addToLog(
      "deleteComment",
      "error",
      "Attempt to delete comment " +
        req.body.object.id +
        "from event " +
        eventWithComment.id +
        " failed with error: " +
        err,
    );
    return res.sendStatus(500);
  }
}

async function _handleCreateNoteComment(req: Request, res: Response) {
  // figure out what this is in reply to -- it should be addressed specifically to us
  let { to, cc } = req.body.object;
  // normalize cc into an array
  if (typeof cc === "string") {
    cc = [cc];
  }
  // normalize to into an array
  if (typeof to === "string") {
    to = [to];
  }

  // if this is a public message (in the to or cc fields)
  if (
    !(
      to.includes("https://www.w3.org/ns/activitystreams#Public") ||
      (Array.isArray(cc) &&
        cc.includes("https://www.w3.org/ns/activitystreams#Public"))
    )
  ) {
    return res.sendStatus(200);
  }
  // figure out which event(s) of ours it was addressing
  // Mastodon seems to put the event ID in the to field, Pleroma in the cc field
  // This is because ActivityPub is a mess (love you ActivityPub)
  const ourEvents = (cc as string[])
    .concat(to)
    .filter((el: string) => el.includes(`https://${domain}/`))
    .map((el: string) => el.replace(`https://${domain}/`, ""));
  // comments should only be on one event. if more than one, ignore (spam, probably)
  if (ourEvents.length !== 1) {
    return res.sendStatus(200);
  }
  const eventID = ourEvents[0];
  // add comment
  const commentID = nanoid();
  // get the actor for the commenter (signed for Authorized Fetch)
  try {
    const parsedActor = await signedFetch(req.body.actor, eventID);
    const name =
      parsedActor.preferredUsername || parsedActor.name || req.body.actor;
    const newComment = {
      id: commentID,
      actorId: req.body.actor,
      activityId: req.body.object.id,
      author: name,
      content: sanitizeHtml(req.body.object.content, {
        allowedTags: [],
        allowedAttributes: {},
      }).replace(`@${eventID}`, ""),
      timestamp: moment().toDate(),
      activityJson: JSON.stringify(req.body),
      actorJson: JSON.stringify(parsedActor),
    };

    const event = await Event.findOne({ id: eventID });
    if (!event) {
      return res.sendStatus(404);
    }
    if (!event.usersCanComment) {
      return res.sendStatus(200);
    }
    event.comments?.push(newComment);
    try {
      await event.save();
      addToLog(
        "addEventComment",
        "success",
        `Comment added to event ${eventID}`,
      );
      const jsonObject = req.body.object;
      jsonObject.attributedTo = newComment.actorId;
      broadcastAnnounceMessage(
        jsonObject,
        event.followers ?? [],
        eventID,
      ).catch((err) =>
        addToLog(
          "handleCreateNoteComment",
          "error",
          `Error broadcasting comment: ${err}`,
        ),
      );
      return res.sendStatus(200);
    } catch (err) {
      addToLog(
        "addEventComment",
        "error",
        "Attempt to add comment to event " +
          eventID +
          " failed with error: " +
          err,
      );
      return res.status(500).send(`Database error, please try again :(${err}`);
    }
  } catch (err) {
    addToLog(
      "handleCreateNoteComment",
      "error",
      `Error fetching actor: ${err}`,
    );
    return res.status(500).send("Error fetching actor profile.");
  }
}

export async function processInbox(req: Request, res: Response) {
  if (!isFederated) return res.sendStatus(404);
  try {
    // if a Follow activity hits the inbox
    if (typeof req.body.object === "string" && req.body.type === "Follow") {
      console.log("Sending to _handleFollow");
      await _handleFollow(req, res);
    }
    // if an Undo activity with a Follow object hits the inbox
    else if (
      req.body &&
      req.body.type === "Undo" &&
      req.body.object &&
      req.body.object.type === "Follow"
    ) {
      console.log("Sending to _handleUndoFollow");
      await _handleUndoFollow(req, res);
    }
    // if an Accept activity with the id of the Event we sent out hits the inbox, it is an affirmative RSVP
    else if (
      req.body &&
      req.body.type === "Accept" &&
      req.body.object &&
      typeof req.body.object === "string"
    ) {
      console.log("Sending to _handleAcceptEvent");
      await _handleAcceptEvent(req, res);
    }
    // if an Undo activity containing an Accept containing the id of the Event we sent out hits the inbox, it is an undo RSVP
    else if (
      req.body &&
      req.body.type === "Undo" &&
      req.body.object &&
      req.body.object.object &&
      typeof req.body.object.object === "string" &&
      req.body.object.type === "Accept"
    ) {
      console.log("Sending to _handleUndoAcceptEvent");
      await _handleUndoAcceptEvent(req, res);
    }
    // if a Create activity with a Note object hits the inbox, and it's a reply, it might be a vote in a poll
    else if (
      req.body &&
      req.body.type === "Create" &&
      req.body.object &&
      req.body.object.type === "Note" &&
      req.body.object.inReplyTo &&
      req.body.object.to
    ) {
      await handlePollResponse(req, res);
    }
    // if a Delete activity hits the inbox, it might a deletion of a comment
    else if (req.body && req.body.type === "Delete") {
      console.log("Sending to _handleDelete");
      await _handleDelete(req, res);
    }
    // if we are CC'ed on a public or unlisted Create/Note, then this is a comment to us we should boost (Announce) to our followers
    else if (
      req.body &&
      req.body.type === "Create" &&
      req.body.object &&
      req.body.object.type === "Note" &&
      req.body.object.to
    ) {
      console.log("Sending to _handleCreateNoteComment");
      await _handleCreateNoteComment(req, res);
    } // CC'ed
    else {
      console.log("No action taken");
      return res.sendStatus(200);
    }
  } catch (e) {
    console.error("Error in processing inbox:", e);
    addToLog("processInbox", "error", `Error in processing inbox: ${e}`);
    if (!res.headersSent) {
      return res.status(500).send("Error processing inbox message.");
    }
  }
}

export function createWebfinger(eventID: string, domain: string) {
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
