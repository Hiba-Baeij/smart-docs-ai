# NestJS 01 — Request Lifecycle and Layers

Status: reviewed
Related: system-overview §4, §7
Verified against: `apps/api/src/app.module.ts` and API request flow, 2026-11-02

## 1. The lifecycle, in order

```
middleware → guards → interceptors (pre) → pipes → controller → service
          ← interceptors (post) ← exception filter (on throw)
```

| Stage | Answers | Belongs here |
|---|---|---|
| Middleware | Is this request shaped acceptably? | request id, body limits |
| Guard | Who is calling? | authentication |
| Interceptor | Should I wrap or transform this? | logging, timing, response mapping |
| Pipe | Is the payload valid? | DTO validation, parsing |
| Controller | What was asked? | routing only |
| Service | Is the caller allowed to do it, and how? | ownership, transactions, orchestration |
| Filter | What does failure look like? | the error envelope |

The guard/service split is the most important line in this document. A guard can prove
identity. Only a service can prove ownership of row 42, because only a service queries
row 42.

## 2. Modules are boundaries, not folders

```ts
@Module({
  imports: [PrismaModule],
  controllers: [DocumentsController],
  providers: [UploadDocumentService, ChunkingService, PdfExtractor, DocxExtractor, XlsxExtractor,
              { provide: DOCUMENT_EXTRACTOR, useFactory: extractorFactory, inject: [PdfExtractor, DocxExtractor, XlsxExtractor] }],
})
export class DocumentsModule {}
```

- If module A needs a class from module B, B must export it. That is the enforcement
  mechanism: an import that would create a cycle fails at startup or at review.
- `DocumentsModule` does not import `AiModule`. The document pipeline knows nothing about
  providers.
- `ConversationsModule` imports `RetrievalModule` and `AiModule` because it orchestrates
  both, and it owns the use case that needs them.

## 3. Dependency injection as a testing seam

```ts
export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

@Injectable()
export class AnswerQuestionService {
  constructor(@Inject(LLM_PROVIDER) private readonly llm: LlmProvider) {}
}
```

The symbol token lets tests provide a mock without importing the real adapter. The use
case depends on the idea of a provider, not on a vendor.

Rules:

- Constructor injection; no property injection.
- No service locator (`app.get(...)`) outside bootstrap code.
- Use `useFactory` only when construction needs configuration or runtime selection.

## 4. DTOs and validation

```ts
export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  content!: string;
}
```

Global pipeline:

```ts
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
}));
```

- `whitelist` strips unknown fields; `forbidNonWhitelisted` rejects them. This project
  rejects, because silently ignoring a `userId` field hides a client bug.
- DTOs describe the HTTP boundary only. Domain services take plain parameters, not DTOs.

## 5. Exception handling as a policy

Throw domain errors from services; map them once in a filter:

```ts
export class ResourceNotFoundError extends Error {
  constructor(readonly kind: 'DOCUMENT' | 'CONVERSATION') { super('not found'); }
}
```

The filter turns it into `DOCUMENT_NOT_FOUND` / `CONVERSATION_NOT_FOUND` with status 404
and the standard envelope. Controllers do not build error responses.

## 6. Configuration

- `ConfigModule.forRoot({ isGlobal: true, validate: validateEnv })`.
- Required values missing → the app refuses to start. A misconfigured server that boots is
  worse than one that does not.
- Never read `process.env` outside the config module and adapters that receive config.

## 7. The question to answer before moving on

> A route handler throws `ResourceNotFoundError('DOCUMENT')`. Trace the path from the throw
> to the client's `code` field, and name every class that participates.

If you cannot name the filter, the service, and the contracts type, reread this guide
before Phase 2.
