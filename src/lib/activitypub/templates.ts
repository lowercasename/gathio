import { IEvent } from "../../models/Event.js";
import getConfig from "../config.js";
const config = getConfig();

export const successfulRSVPResponse = ({
  event,
  newAttendee,
  fullAttendee,
}: {
  event: IEvent;
  newAttendee: { id?: string; name: string };
  fullAttendee: { _id: string };
}) =>
  `<span class="h-card"><a href="${newAttendee.id}" class="u-url mention">@<span>${newAttendee.name}</span></a></span> Thanks for RSVPing! You can remove yourself from the RSVP list by clicking <a href="https://${config.general.domain}/oneclickunattendevent/${event.id}/${fullAttendee._id}">here</a>.`;
