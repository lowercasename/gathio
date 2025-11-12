type MessageId = "unattend";

const queryStringMessages: Record<MessageId, string> = {
  unattend: `You have been removed from this event.`,
};

export const getMessage = (id?: string) => {
  return queryStringMessages[id as MessageId] || "";
};
