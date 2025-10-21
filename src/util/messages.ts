type MessageId = "unattend" | "approved";

const queryStringMessages: Record<MessageId, string> = {
    unattend: `You have been removed from this event.`,
    approved: `Attendee approved. They can now view the event location.`,
};

export const getMessage = (id?: string) => {
    return queryStringMessages[id as MessageId] || "";
};
