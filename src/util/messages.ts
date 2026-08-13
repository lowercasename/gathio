type MessageId =
  | "unattend"
  | "approved"
  | "denied"
  | "rsvppending"
  | "answers"
  | "badanswer"
  | "noanswers";

const queryStringMessages: Record<MessageId, string> = {
  unattend: `You have been removed from this event.`,
  approved: `Attendee approved. They can now view the event location.`,
  denied: `Attendee has been removed from this event.`,
  rsvppending: `Your RSVP is pending approval by the host.`,
  answers: `Thanks! Your answers have been sent to the event host.`,
  badanswer: `One of your answers wasn't one of the available choices - the host may have just changed the questions. Please try again.`,
  noanswers: `You didn't answer any of the questions. Fill in at least one answer and try again, or just close this page.`,
};

export const getMessage = (id?: string) => {
  return queryStringMessages[id as MessageId] || "";
};
