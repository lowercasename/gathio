type MessageId = "unattend" | "approved" | "denied" | "rsvppending";

const queryStringMessages: Record<MessageId, string> = {
    unattend: `You have been removed from this event.`,
    approved: `Attendee approved. They can now view the event location.`,
    denied: `Attendee has been removed from this event.`,
    rsvppending: `Your RSVP is pending approval by the host.`,
};

export const getMessage = (id?: string) => {
    return queryStringMessages[id as MessageId] || "";
};
