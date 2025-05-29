// src/lib/activitypub.ts

import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { sendDirectMessage } from "../activitypub.js";
import { successfulRSVPResponse } from "./activitypub/templates.js";

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

export const activityPubContentType =
  'application/ld+json; profile="https://www.w3.org/ns/activitystreams"';
export const alternateActivityPubContentType = "application/activity+json";

export const acceptsActivityPub = (req: Request) => {
  const valid = [activityPubContentType, alternateActivityPubContentType];
  return valid.some((h) => req.headers.accept?.includes(h));
};

export const getNoteRecipient = (object: APObject): string | null => {
  const { to, cc } = object;
  if (to) {
    if (Array.isArray(to)) return to[0];
    return to;
  }
  if (cc) {
    if (Array.isArray(cc)) return cc[0];
    return cc;
  }
  return null;
};

export const getEventId = (url: string): string => {
  try {
    return new URL(url).pathname.replace("/", "");
  } catch {
    return url;
  }
};

const prisma = new PrismaClient();

export const handlePollResponse = async (req: Request, res: Response) => {
  try {
    const { attributedTo, inReplyTo, name } = req
      .body.object as APObject;
    const recipient = getNoteRecipient(req.body.object as APObject);
    if (!recipient) throw new Error("No recipient found");

    const eventID = getEventId(recipient);
    const event = await prisma.event.findUnique({
      where: { id: eventID },
      include: {
        followers: true,
        activityPubMessages: true,
        attendees: true,
      },
    });
    if (!event) throw new Error("Event not found");

    // Verify follower
    if (!event.followers.some((f) => f.actorId === attributedTo)) {
      throw new Error("Sender does not follow this event");
    }

    // Verify poll match
    const matching = event.activityPubMessages.find((m) => {
      const c = JSON.parse(m.content || "{}");
      return inReplyTo === c?.object?.id;
    });
    if (!matching) throw new Error("No matching message found");
    const msg = JSON.parse(matching.content || "{}");
    const msgRecipient = getNoteRecipient(msg.object);
    if (msgRecipient !== attributedTo) {
      throw new Error("Message recipient mismatch");
    }

    // Validate response
    const validResponses = [
      "Yes, and show me in the public list",
      "Yes, but hide me from the public list",
      "No",
    ];
    if (!validResponses.includes(name)) {
      throw new Error("Invalid poll response");
    }
    if (name === "No") {
      return res.status(200).send("Thanks, noted");
    }
    const visibility =
      name === validResponses[0] ? "public" : "private";

    // Fetch actor profile
    const actorResp = await fetch(attributedTo, {
      headers: {
        Accept: activityPubContentType,
        "Content-Type": activityPubContentType,
      },
    });
    if (!actorResp.ok) throw new Error("Actor not found");
    const apActor = await actorResp.json();

    // Add attendee if not already
    if (
      !event.attendees.some(
        (a) => a.attendeeOriginalId === attributedTo
      )
    ) {
      const attendeeName =
        apActor.preferredUsername || apActor.name || attributedTo;

      const fullAttendee = await prisma.attendee.create({
        data: {
          name: attendeeName,
          status: "attending",
          attendeeOriginalId: attributedTo,
          number: 1,
          visibility,
          event: { connect: { id: eventID } },
        },
      });

      // Send DM back with removal link
      const dm = {
        "@context": "https://www.w3.org/ns/activitystreams",
        name: `RSVP to ${event.name}`,
        type: "Note",
        content: successfulRSVPResponse({
          event,
          newAttendee: fullAttendee,
          fullAttendee,
        }),
        tag: [
          {
            type: "Mention",
            href: fullAttendee.attendeeOriginalId,
            name: fullAttendee.name,
          },
        ],
      };
      await sendDirectMessage(
        dm,
        fullAttendee.attendeeOriginalId,
        event.id
      );
      return res.sendStatus(200);
    } else {
      return res
        .status(200)
        .send("Attendee is already registered.");
    }
  } catch (error) {
    console.error("handlePollResponse error:", error);
    return res
      .status(500)
      .send("An unexpected error occurred.");
  }
};
