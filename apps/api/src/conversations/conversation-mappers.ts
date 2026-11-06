import type {
  ConversationSummary,
  Message,
  MessageRole,
  SourceReference,
} from '@smartdocs/contracts';

type ConversationRow = {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
};

type MessageRow = {
  id: string;
  role: MessageRole;
  content: string;
  sources: unknown;
  createdAt: Date;
};

/** The only shape in which a conversation leaves the API: never `userId`. */
export function toConversationSummary(
  row: ConversationRow,
): ConversationSummary {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * `sources` is always an array in the contract: `[]` means "no citations", which is not the same
 * as `null`. The column is nullable JSON (a user message has none), so null becomes `[]` here.
 */
export function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    sources: Array.isArray(row.sources)
      ? (row.sources as SourceReference[])
      : [],
    createdAt: row.createdAt.toISOString(),
  };
}
