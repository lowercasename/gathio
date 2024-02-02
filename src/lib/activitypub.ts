import { Request, Response } from "express";

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
    return validAcceptHeaders.some(
        (header) => req.headers.accept?.includes(header),
    );
};
