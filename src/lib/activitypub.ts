import { Request, Response } from "express";
import Event, { IAttendee } from "../models/Event.js";
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
        return "";
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
            const content = JSON.parse(el.content || "");
            return inReplyTo === content?.object?.id;
        });
        if (!matchingMessage) throw new Error("No matching message found");
        const messageContent = JSON.parse(matchingMessage.content || "");
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
            name === "Yes, and show me in the public list"
                ? "public"
                : "private";

        // fetch the profile information of the user
        const response = await fetch(attributedTo, {
            headers: {
                Accept: activityPubContentType,
                "Content-Type": activityPubContentType,
            },
        });
        if (!response.ok) throw new Error("Actor not found");
        const apActor = await response.json();

        // If the actor is not already attending the event, add them
        if (!event.attendees?.some((el) => el.id === attributedTo)) {
            const attendeeName =
                apActor.preferredUsername || apActor.name || attributedTo;
            const newAttendee: Pick<
                IAttendee,
                "name" | "status" | "id" | "number" | "visibility"
            > = {
                name: attendeeName,
                status: "attending",
                id: attributedTo,
                number: 1,
                visibility,
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
            // send direct message to user
            sendDirectMessage(jsonObject, newAttendee.id, event.id);
            return res.sendStatus(200);
        } else {
            return res.status(200).send("Attendee is already registered.");
        }
    } catch (error) {
        console.error(error);
        return res.status(500).send("An unexpected error occurred.");
    }
};
