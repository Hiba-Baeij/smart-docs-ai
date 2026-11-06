# NestJS 05 — Testing

Status: reviewed
Related: NFR-06, ADR-014
Verified against: Jest and Supertest versions confirmed at Phase 0

## 1. What to test at which level

| Behaviour | Level | Why |
|---|---|---|
| Chunk boundaries, ordering, metadata | unit | pure function, fast, high value |
| Prompt assembly, budget packing | unit | pure, easy to get subtly wrong |
| Evidence policy (sentinel → fallback) | unit | the core guarantee |
| Query building | unit | asserts parameters, not SQL text |
| Auth flows, ownership matrix | integration | needs real guards, cookies, DB |
| Cascades, unique constraints, FTS | integration | database semantics cannot be mocked |
| Error envelope | integration | asserts the filter, not the throw |
| Rate limiting | integration | needs the middleware stack |
| UI states, guards, interceptors | component | TestBed |
| One full journey | E2E | confidence, not coverage |

## 2. Integration test bootstrap

```ts
beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(LLM_PROVIDER)
    .useValue(new MockLlmProvider())
    .compile();
  app = moduleRef.createNestApplication();
  configureApp(app);            // same pipes, filters, cookie parser as production
  await app.init();
  db = app.get(PrismaService);
  if (!process.env.TEST_DATABASE_URL?.endsWith('_test')) {
    throw new Error('Refusing to run integration tests against a non-test database');
  }
});

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE "Message","Conversation","DocumentChunk","Document","User" RESTART IDENTITY CASCADE',
  );
});
```

Two rules:

1. **The test app is configured by the same function as production.** A test that passes
   because it skipped the global pipe is a lie.
2. **The `_test` guard is non-negotiable.** It is the cheapest protection against deleting
   development data.

## 3. The ownership matrix as a parameterised test

```ts
const cases = [
  { method: 'GET',    path: (id) => `/documents/${id}`,                  resource: 'document' },
  { method: 'DELETE', path: (id) => `/documents/${id}`,                  resource: 'document' },
  { method: 'GET',    path: (id) => `/conversations/${id}/messages`,     resource: 'conversation' },
  { method: 'POST',   path: (id) => `/conversations/${id}/messages`,     resource: 'conversation' },
  { method: 'DELETE', path: (id) => `/conversations/${id}`,              resource: 'conversation' },
];

it.each(cases)('user B gets 404 on $method $path', async ({ method, path, resource }) => {
  const { a, b } = await seedTwoUsers();
  const foreignId = resource === 'document' ? await seedDocument(a.id) : await seedConversation(a.id);
  const response = await request(app.getHttpServer())
    .get(path(foreignId)) // use the right method
    .set('Cookie', b.cookie);
  expect(response.status).toBe(404);
  expect(response.body.code).toBe(`${resource.toUpperCase()}_NOT_FOUND`);
});
```

Also assert `GET /documents` as B returns zero of A's rows, not just a 404 elsewhere.

## 4. Fixtures

```
apps/api/test/fixtures/
├── simple.pdf
├── simple.docx
├── simple.xlsx
├── scanned.pdf          # no extractable text
├── empty.pdf            # zero bytes
├── arabic.pdf           # Arabic content for the search spike
├── injection.pdf        # "ignore previous instructions..."
└── renamed.txt.pdf      # wrong magic bytes
```

Fixtures are small, committed, and purpose-built. Do not add a 5 MB real contract; it
slows every run and teaches nothing new. Document each fixture's purpose in a README in
the folder.

## 5. Mock provider contract

```ts
class MockLlmProvider implements LlmProvider {
  response = 'ANSWER [S1]';
  async generate(input: GenerateInput) {
    if (!input.messages.some(m => m.content.includes('EVIDENCE'))) {
      return { text: 'NO_EVIDENCE' };
    }
    return { text: this.response };
  }
}
```

It must be able to produce: a normal answer, `NO_EVIDENCE`, a timeout, and an upstream
error. Tests configure the behaviour explicitly; a mock with hidden defaults produces
tests that pass for the wrong reason.

## 6. Assertions that are worth the words

- Assert `code`, not `message`, for errors.
- Assert the exact fallback constant, imported from the source, never a literal copy.
- Assert `sources` is `[]` for the fallback.
- Assert `passwordHash` is absent from every user-shaped response.
- Assert the document row is `FAILED` and `chunkCount` is zero after a failed extraction.
- Assert chunk `pageNumber` for a known PDF page, not just "not null".

## 7. What not to test

- Prisma itself (trust the ORM, test your queries).
- Framework wiring that has no project behaviour.
- Exact prompt strings beyond a structural snapshot; byte-for-byte prompt tests break on
  every wording improvement and teach nothing.
- The real provider on every run; use a separate, opt-in contract suite.

## 8. Gate for every phase

```bash
npm run lint
npm run typecheck
npm run test -w apps/api
npm run test:e2e -w apps/api
npm run build
```

Report actual output. A phase is not done because the code compiles; it is done when the
gate passes and the failure drills were observed.
