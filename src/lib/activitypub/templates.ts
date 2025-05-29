// src/lib/activitypub/templates.ts

import type { Event, Attendee } from "@prisma/client";
import getConfig from "../config.js";

const config = getConfig();

interface RSVPInput {
  event: Event;
  attendee: Attendee;
}

/**
 * Build the HTML snippet sent back to a user after a successful ActivityPub RSVP.
 * - Mentions the user (using their actor URI, stored in `attendee.attendeeOriginalId`).
 * - Provides a one-click removal link using the attendee record's primary ID.
 */
export const successfulRSVPResponse = ({ event, attendee }: RSVPInput): string => {
  // Use the original actor URI when mentioning, fallback to the DB PK if needed
  const actorHref = attendee.attendeeOriginalId || attendee.id;

  return `
<span class="h-card">
  <a href="${actorHref}" class="u-url mention">
    @<span>${attendee.name}</span>
  </a>
</span>
Thanks for RSVPing! You can remove yourself from the RSVP list by clicking 
<a href="https://${config.general.domain}/oneclickunattendevent/${event.id}/${attendee.id}">
  here
</a>.
  `.trim();
};
