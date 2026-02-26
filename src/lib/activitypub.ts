import { Request, Response } from "express";
import crypto from "node:crypto";
import i18next from "i18next";
import Event, { IAttendee, getApprovedAttendeeCount } from "../models/Event.js";
import { sendDirectMessage } from "../activitypub.js";
import { successfulRSVPResponse } from "./activitypub/templates.js";
import getConfig from "./config.js";

interface APObject {
  type: "Note";
  actor?: string;
  id: string;
  to?: string | string[];
  cc?: string | string[];
  attributedTo: string;
  inReplyTo: string;
  name: string;
}

// From https://www.w3.org/TR/activitypub/#client-to-server-interactions:
// "Servers MAY interpret a Content-Type or Accept header of application/activity+json
// as equivalent to application/ld+json; profile="https://www.w3.org/ns/activitystreams"
// for client-to-server interactions.
// For best compatibility, we always send application/ld+json; profile="https://www.w3.org/ns/activitystreams"
// and accept both application/ld+json; profile="https://www.w3.org/ns/activitystreams" and application/activity+json.
export const activityPubContentType =
  'application/ld+json; profile="https://www.w3.org/ns/activitystreams"';
export const alternateActivityPubContentType = "application/activity+json";

// Cf. https://www.w3.org/TR/activitypub/#retrieving-objects
export const acceptsActivityPub = (req: Request) => {
  const validAcceptHeaders = [
    activityPubContentType,
    alternateActivityPubContentType,
  ];
  return validAcceptHeaders.some((header) =>
    req.headers.accept?.includes(header),
  );
};

// At least for poll responses, Mastodon stores the recipient (the poll-maker)
//  in the 'to' field, while Pleroma stores it in 'cc'
export const getNoteRecipient = (object: APObject): string | null => {
  const { to, cc } = object;
  if (!to && !cc) {
    return null;
  }
  if (to && to.length > 0) {
    if (Array.isArray(to)) {
      return to[0];
    }
    if (typeof to === "string") {
      return to;
    }
    return null;
  } else if (cc && cc.length > 0) {
    if (Array.isArray(cc)) {
      return cc[0];
    }
    return cc;
  }
  return null;
};

// Returns the event ID from a URL like http://localhost:3000/123abc
// or https://gath.io/123abc
export const getEventId = (url: string): string => {
  try {
    return new URL(url).pathname.replace("/", "");
  } catch {
    // Apparently not a URL so maybe it's just the ID
    return url;
  }
};

// Fetch a remote ActivityPub resource with an HTTP Signature, required by
// instances that enable Authorized Fetch / Secure Mode.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function signedFetch(url: string, eventID: string): Promise<any> {
  const config = getConfig();
  const domain = config.general.domain;
  const targetUrl = new URL(url);
  const targetDomain = targetUrl.hostname;
  const pathFragment = targetUrl.pathname;
  const fetchDate = new Date().toUTCString();

  const headers: Record<string, string> = {
    Host: targetDomain,
    Date: fetchDate,
    Accept: activityPubContentType,
    "User-Agent": `Gathio - ${domain}`,
  };

  const event = await Event.findOne({ id: eventID });
  if (event?.privateKey) {
    const stringToSign = `(request-target): get ${pathFragment}\nhost: ${targetDomain}\ndate: ${fetchDate}`;
    const signer = crypto.createSign("sha256");
    signer.update(stringToSign);
    signer.end();
    const sig_b64 = signer.sign(event.privateKey).toString("base64");
    headers.Signature = `keyId="https://${domain}/${eventID}#main-key",algorithm="rsa-sha256",headers="(request-target) host date",signature="${sig_b64}"`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Signed fetch of ${url} failed: ${response.status}`);
  }
  return response.json();
}

export const handlePollResponse = async (req: Request, res: Response) => {
  try {
    // figure out what this is in reply to -- it should be addressed specifically to us
    const { attributedTo, inReplyTo, name } = req.body.object as APObject;
    const recipient = getNoteRecipient(req.body.object);
    if (!recipient) throw new Error("No recipient found");

    const eventID = getEventId(recipient);
    const event = await Event.findOne({ id: eventID });
    if (!event) throw new Error("Event not found");

    // make sure this person is actually a follower of the event
    const senderAlreadyFollows = event.followers?.some(
      (el) => el.actorId === attributedTo,
    );
    if (!senderAlreadyFollows) {
      throw new Error("Poll response sender does not follow event");
    }

    // compare the inReplyTo to its stored message, if it exists and
    // it's going to the right follower then this is a valid reply
    const matchingMessage = event.activityPubMessages?.find((el) => {
      const content = JSON.parse(el.content || "{}");
      return inReplyTo === content?.object?.id;
    });
    if (!matchingMessage) throw new Error("No matching message found");
    const messageContent = JSON.parse(matchingMessage.content || "{}");
    // check if the message we sent out was sent to the actor this incoming
    // message is attributedTo
    const messageRecipient = getNoteRecipient(messageContent.object);
    if (!messageRecipient || messageRecipient !== attributedTo) {
      throw new Error("Message recipient does not match attributedTo");
    }

    // it's a match, this is a valid poll response, add RSVP to database

    // 'name' is the poll response
    // - "Yes, and show me in the public list",
    // - "Yes, but hide me from the public list",
    // - "No"
    if (
      name !== "Yes, and show me in the public list" &&
      name !== "Yes, but hide me from the public list" &&
      name !== "No"
    ) {
      throw new Error("Invalid poll response");
    }

    if (name === "No") {
      // Why did you even respond?
      return res.status(200).send("Thanks I guess?");
    }

    const visibility =
      name === "Yes, and show me in the public list" ? "public" : "private";

    // fetch the profile information of the user (signed for Authorized Fetch)
    const apActor = await signedFetch(attributedTo, eventID);

    // If the actor is not already attending the event, add them
    if (!event.attendees?.some((el) => el.id === attributedTo)) {
      // Check if the event is at capacity
      if (event.maxAttendees !== null && event.maxAttendees !== undefined) {
        if (getApprovedAttendeeCount(event) >= event.maxAttendees) {
          const domain = getConfig().general.domain;
          const jsonObject = {
            "@context": "https://www.w3.org/ns/activitystreams",
            type: "Note" as const,
            name: `RSVP to ${event.name}`,
            content: `<span class="h-card"><a href="${attributedTo}" class="u-url mention">@<span>${attributedTo}</span></a></span> Sorry, ${event.name} is now at capacity and we couldn't add you to the list. You can check the event page at <a href="https://${domain}/${eventID}">https://${domain}/${eventID}</a> for updates.`,
            tag: [
              {
                type: "Mention",
                href: attributedTo,
                name: attributedTo,
              },
            ],
          };
          sendDirectMessage(jsonObject, attributedTo, event.id);
          return res.status(200).send("Event is at capacity.");
        }
      }

      const attendeeName =
        apActor.preferredUsername || apActor.name || attributedTo;
      const requiresApproval = !!event.approveRegistrations;
      const newAttendee: Pick<
        IAttendee,
        "name" | "status" | "id" | "number" | "visibility" | "approved"
      > = {
        name: attendeeName,
        status: "attending",
        id: attributedTo,
        number: 1,
        visibility,
        approved: !requiresApproval,
      };
      const updatedEvent = await Event.findOneAndUpdate(
        { id: eventID },
        { $push: { attendees: newAttendee } },
        { new: true },
      ).exec();
      const fullAttendee = updatedEvent?.attendees?.find(
        (el) => el.id === attributedTo,
      );
      if (!fullAttendee) throw new Error("Full attendee not found");

      if (requiresApproval) {
        // Send a "pending approval" DM to the user
        const jsonObject = {
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
        if (newAttendee.id) {
          sendDirectMessage(jsonObject, newAttendee.id, event.id);
        }
        // Notify host by email
        if (event.creatorEmail) {
          try {
            await req.emailService.sendEmailFromTemplate({
              to: event.creatorEmail,
              subject: i18next.t("routes.attendeeawaitingapprovalsubject", {
                eventName: event.name,
              }),
              templateName: "attendeeAwaitingApproval",
              templateData: {
                eventID,
                eventName: event.name,
                attendeeName: newAttendee.name,
                editToken: event.editToken,
              },
            });
          } catch (e) {
            console.error("Error sending attendeeAwaitingApproval email:", e);
          }
        }
      } else {
        // send a "click here to remove yourself" link back to the user as a DM
        const jsonObject = {
          "@context": "https://www.w3.org/ns/activitystreams",
          name: `RSVP to ${event.name}`,
          type: "Note",
          content: successfulRSVPResponse({
            event,
            newAttendee,
            fullAttendee,
          }),
          tag: [
            {
              type: "Mention",
              href: newAttendee.id,
              name: newAttendee.name,
            },
          ],
        };
        if (newAttendee.id) {
          sendDirectMessage(jsonObject, newAttendee.id, event.id);
        }
      }
      return res.sendStatus(200);
    } else {
      return res.status(200).send("Attendee is already registered.");
    }
  } catch (error) {
    console.error(error);
    return res.status(500).send("An unexpected error occurred.");
  }
};
