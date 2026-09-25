export type ConversationSummary = {
  id: string;
  customer_name: string;
  professional_name: string;
  participant_role: "customer" | "professional";
  last_message_at: Date | string;
  last_message_body: string | null;
  last_message_sender_role: "customer" | "professional" | null;
  unread_count: number;
};

export type ConversationMessage = {
  id: string;
  booking_id: string | null;
  sender_role: "customer" | "professional";
  body: string;
  created_at: Date | string;
};

export type ConversationDetails = {
  id: string;
  customer_name: string;
  professional_name: string;
  participant_role: "customer" | "professional";
};

export type MessagePage = {
  messages: ConversationMessage[];
  next: string | null;
  hasMore: boolean;
};
