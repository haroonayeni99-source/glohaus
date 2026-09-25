import "server-only";

import type { SqlClient } from "@/modules/accounts/repository";

export type ConversationSummary = {
  id: string;
  customer_name: string;
  professional_name: string;
  participant_role: "customer" | "professional";
  last_message_at: Date;
  last_message_body: string | null;
  last_message_sender_role: "customer" | "professional" | null;
  unread_count: number;
};

export type ConversationMessage = {
  id: string;
  booking_id: string | null;
  sender_role: "customer" | "professional";
  body: string;
  created_at: Date;
};

export type ConversationDetails = {
  id: string;
  customer_name: string;
  professional_name: string;
  participant_role: "customer" | "professional";
};

export async function conversationInbox(
  db: SqlClient,
  actorUserId: string,
  professionalId: string | null,
) {
  return (
    await db.query<ConversationSummary>(
      `SELECT
        c.id,
        c.customer_name,
        c.professional_name,
        CASE
          WHEN c.customer_id=$1 THEN 'customer'
          WHEN $2::uuid IS NOT NULL AND c.professional_id=$2::uuid THEN 'professional'
        END AS participant_role,
        c.last_message_at,
        latest.body AS last_message_body,
        latest.sender_role AS last_message_sender_role,
        (
          SELECT count(*)::integer
          FROM beauty.messages unread
          WHERE unread.conversation_id=c.id
            AND unread.sender_role <> CASE
              WHEN c.customer_id=$1 THEN 'customer'
              ELSE 'professional'
            END
            AND unread.created_at > coalesce(
              CASE
                WHEN c.customer_id=$1 THEN c.customer_read_at
                ELSE c.professional_read_at
              END,
              'epoch'::timestamptz
            )
        ) AS unread_count
       FROM beauty.conversations c
       LEFT JOIN LATERAL (
         SELECT m.body,m.sender_role
         FROM beauty.messages m
         WHERE m.conversation_id=c.id
         ORDER BY m.created_at DESC,m.id DESC
         LIMIT 1
       ) latest ON true
       WHERE c.customer_id=$1
          OR ($2::uuid IS NOT NULL AND c.professional_id=$2::uuid)
       ORDER BY c.last_message_at DESC,c.id DESC
       LIMIT 100`,
      [actorUserId, professionalId],
    )
  ).rows;
}

export async function conversationDetails(
  db: SqlClient,
  id: string,
  actorUserId: string,
  professionalId: string | null,
) {
  return (
    await db.query<ConversationDetails>(
      `SELECT
        c.id,c.customer_name,c.professional_name,
        CASE
          WHEN c.customer_id=$2 THEN 'customer'
          WHEN $3::uuid IS NOT NULL AND c.professional_id=$3::uuid THEN 'professional'
        END AS participant_role
       FROM beauty.conversations c
       WHERE c.id=$1
         AND (
           c.customer_id=$2
           OR ($3::uuid IS NOT NULL AND c.professional_id=$3::uuid)
         )`,
      [id, actorUserId, professionalId],
    )
  ).rows[0] ?? null;
}

export async function conversationMessages(db: SqlClient, id: string) {
  return (
    await db.query<ConversationMessage>(
      `SELECT id,booking_id,sender_role,body,created_at
       FROM beauty.messages
       WHERE conversation_id=$1
       ORDER BY created_at ASC,id ASC
       LIMIT 200`,
      [id],
    )
  ).rows;
}
