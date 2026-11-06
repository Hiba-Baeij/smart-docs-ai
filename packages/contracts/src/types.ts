import type { ErrorCode } from "./errors";

export type DocumentStatus = "PROCESSING" | "COMPLETED" | "FAILED";

export type FileType = "pdf" | "docx" | "xlsx";

export type MessageRole = "user" | "assistant";

/** The only shape in which a user ever leaves the API: never the password hash. */
export type UserSummary = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

/** POST /api/auth/register */
export type RegisterRequest = {
  name: string;
  email: string;
  password: string;
};

/** POST /api/auth/login */
export type LoginRequest = {
  email: string;
  password: string;
};

/** The body of a successful register or login. (GET /api/auth/me returns a bare UserSummary.) */
export type AuthResponse = {
  user: UserSummary;
};

export type DocumentSummary = {
  id: string;
  originalName: string;
  fileType: FileType;
  status: DocumentStatus;
  /** Set only when status is FAILED; never a free-form message. */
  errorCode: ErrorCode | null;
  chunkCount: number;
  createdAt: string;
};

export type DocumentPage = {
  items: DocumentSummary[];
  page: number;
  pageSize: number;
  total: number;
};

/** One chunk as the document page lists it: where it is and how it starts, not its full text. */
export type ChunkPreview = {
  chunkIndex: number;
  pageNumber: number | null;
  sheetName: string | null;
  /** The first 200 characters of the chunk. */
  preview: string;
};

/** GET /api/documents/:id */
export type DocumentDetail = DocumentSummary & {
  extractedText: string;
  chunks: ChunkPreview[];
};

export type SourceReference = {
  documentId: string;
  documentName: string;
  chunkIndex: number;
  pageNumber: number | null;
  sheetName: string | null;
  /** The passage was shortened to fit the evidence budget. */
  truncated?: boolean;
};

/** POST /api/conversations: the title may be empty and is then taken from the first question. */
export type CreateConversationRequest = {
  title?: string;
};

export type ConversationSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type ConversationPage = {
  items: ConversationSummary[];
  page: number;
  pageSize: number;
  total: number;
};

export type Message = {
  id: string;
  role: MessageRole;
  content: string;
  /** Always an array; `[]` means no citations, which is distinct from `null`. */
  sources: SourceReference[];
  createdAt: string;
};

export type MessagePage = {
  items: Message[];
  page: number;
  pageSize: number;
  total: number;
};
