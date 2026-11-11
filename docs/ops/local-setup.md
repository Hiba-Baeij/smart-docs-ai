# Local Setup

Status: reviewed
Related: ADR-015, NFR-11
Verified against: Node v24.15.0, npm 11.12.1, Docker 28.5.1, Git 2.50.1 (2026-10-30, Phase 0 task 0.1); PostgreSQL 17.11 via postgres:17-alpine (task 0.5); fresh copy installed, generated, migrated and served successfully on 2026-11-02 (Phase 12 task 12.2)

## 1. Prerequisites

| Tool | Why | Check |
|---|---|---|
| Node.js LTS | API, web, tooling | `node -v` |
| npm (bundled) | workspaces | `npm -v` |
| Docker Desktop | PostgreSQL | `docker --version` |
| Git | history and diffs | `git --version` |

No global Nest or Angular CLI installation is required; both are used through `npx`.

## 2. First-time setup

```bash
# 1. Start the database
docker compose up -d db

# 2. Install all workspaces
npm install

# 3. Create the API environment file, and give it a JWT secret. The example leaves
#    JWT_SECRET empty on purpose and the API refuses to start without one.
cp .env.example apps/api/.env
node -e "const fs=require('fs');const p='apps/api/.env';fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace(/^JWT_SECRET=.*$/m,'JWT_SECRET='+require('crypto').randomBytes(32).toString('hex')))"

# 4. Generate the Prisma client, then apply migrations
#    (Prisma 7 does not generate the client when migrating; the client is gitignored)
npm run db:generate -w apps/api
npm run db:migrate -w apps/api

# 5. Seed a development user and two sample documents (optional, idempotent)
npm run db:seed -w apps/api

# 6. Run both apps
npm run dev            # starts API and web together
```

Expected:

- API on `http://localhost:3000`
- Web on `http://localhost:4200`
- `GET http://localhost:3000/api/health` returns `{ "status": "ok" }`

## 3. Environment variables

| Variable | Purpose | Example |
|---|---|---|
| `DATABASE_URL` | Prisma connection | `postgresql://smartdocs:smartdocs@localhost:5433/smartdocs` |
| `TEST_DATABASE_URL` | integration tests; must end in `_test` | `postgresql://smartdocs:smartdocs@localhost:5433/smartdocs_test` |
| `JWT_SECRET` | token signing | 32+ random bytes |
| `JWT_EXPIRES_IN` | token lifetime | `1h` |
| `COOKIE_SECURE` | secure cookies | `false` locally, `true` in production |
| `TRUST_PROXY_HOPS` | number of trusted reverse proxies for client IP and throttling | `0` locally, `1` behind one private edge proxy |
| `CORS_ORIGIN` | allowed web origin | `http://localhost:4200` |
| `AUTH_RATE_LIMIT` | requests per client per window on login and register | `5` |
| `AUTH_RATE_WINDOW_MS` | the window for the limit above, in milliseconds | `60000` |
| `UPLOAD_RATE_LIMIT` | uploads per user per `RATE_WINDOW_MS` | `10` |
| `MESSAGE_RATE_LIMIT` | chat sends per user per `RATE_WINDOW_MS` | `20` |
| `GENERAL_RATE_LIMIT` | other API requests per user (or IP without a session) per `RATE_WINDOW_MS` | `120` |
| `RATE_WINDOW_MS` | window for upload, chat, and general limits | `60000` |
| `MAX_JSON_BYTES` | JSON request body ceiling | `102400` |
| `MAX_UPLOAD_BYTES` | upload ceiling | `10485760` |
| `UPLOAD_TIMEOUT_MS` | processing budget | `30000` |
| `MAX_EXTRACTED_CHARS` | most characters of text one file may extract to | `2000000` |
| `LLM_PROVIDER` | `mock` or `openai` | `mock` |
| `LLM_BASE_URL` | OpenAI-compatible endpoint | `https://api.openai.com/v1` |
| `LLM_API_KEY` | provider key | never committed |
| `LLM_MODEL` | model id | provider-specific |
| `LLM_TEMPERATURE` | answer determinism | `0.2` |
| `LLM_MAX_OUTPUT_TOKENS` | output ceiling | `700` |
| `LLM_TIMEOUT_MS` | provider timeout | `20000` |
| `CHUNK_TARGET_WORDS` | new words per chunk before the next starts | `700` |
| `CHUNK_OVERLAP_WORDS` | words repeated at the head of the next chunk (text and PDF) | `100` |
| `CHUNK_MAX_WORDS` | no chunk is longer; must be at least target + overlap + 60 | `1200` |
| `EMBEDDING_MODEL` | embedding model on the LLM endpoint; empty = keyword-only (ADR-018) | `gemini-embedding-001` |
| `EMBEDDING_TIMEOUT_MS` | embedding call timeout; on timeout retrieval is keyword-only | `10000` |
| `VECTOR_MAX_DISTANCE` | cosine distance above which a vector match is dropped | `0.5` |
| `RETRIEVAL_TOP_K` | chunks kept | `6` |
| `RETRIEVAL_CANDIDATES` | chunks ranked | `20` |
| `RETRIEVAL_TOKEN_BUDGET` | evidence budget (estimate) | `3000` |
| `CHAT_HISTORY_MESSAGES` | history turns | `6` |

`.env.example` is committed. `.env` is ignored. The API validates configuration at
startup and refuses to boot with a missing required value.

## 4. Database

- One compose service, one volume, two databases created by `docker-entrypoint-initdb.d`.
- The container listens on host port **5433** (loopback only), not 5432, because a
  host-installed PostgreSQL commonly owns 5432 and would silently receive the connection.
- Extensions needed by the search spike (`unaccent`, `pg_trgm`) are created by a migration
  in Phase 5. The init script may also create them for convenience, but the migration is
  what guarantees a fresh clone and an existing volume behave the same.
- Chunk embeddings are a `real[]` column added by the `chunk_embedding` migration; no extension
  is needed (ADR-018, which also describes the pgvector upgrade). After seeding, or after switching on a real
  `EMBEDDING_MODEL`, run `npm run db:embed -w api` to add the missing chunk embeddings.
- The seed creates the user `dev@smartdocs.local` (its password is defined in
  `apps/api/prisma/seed.ts`), one Arabic DOCX and one English PDF, three chunks each. It is
  safe to run repeatedly and refuses to run in production or against a non-local host.
- Reset everything:

```bash
docker compose down -v
docker compose up -d db
npm run db:migrate -w apps/api
```

`down -v` deletes data. Use it only when you intend to start from zero.

## 5. Angular proxy

The dev server proxies `/api` to `http://localhost:3000` so the browser sees one origin.
This keeps the cookie same-site and avoids CORS during development. The proxy
configuration is `apps/web/proxy.conf.json`, wired in `angular.json` under `serve.options`, and
must not be replaced by a wildcard CORS rule.

## 6. Verify the install

```bash
npm run lint
npm run typecheck
npm run test -w apps/api
npm run test -w apps/web
npm run build
```

Expected at Phase 0: all pass on empty scaffolding. Expected later: all pass on real
features. If a command is missing, add it in the same change and update `commands.md`.

## 7. Troubleshooting

| Symptom | Likely cause | Action |
|---|---|---|
| `P1001: Can't reach database` | container not running | `docker compose ps`, then `up -d db` |
| `extension "unaccent" does not exist` | Phase 5 migration not applied | `npm run db:migrate -w apps/api` |
| 401 on every request | cookie blocked cross-site | use the proxy; check `withCredentials` |
| Tests touch real data | wrong URL | tests must use `TEST_DATABASE_URL` ending in `_test` |
| Port already in use | stale process | `npm run dev` reports the port; stop the old process |

## 8. Real provider data handling and cost record

Development and tests use `LLM_PROVIDER=mock` by default. Production requires an explicit
`LLM_PROVIDER=openai`, an HTTPS `LLM_BASE_URL`, a model id, and a secret key. The adapter uses an
OpenAI-compatible `/chat/completions` endpoint; its name does not establish which company hosts
the endpoint. Before enabling it for customer documents, the operator must record the answers
for the actual endpoint and contract:

| Question | Operator record before enabling live traffic |
|---|---|
| Are inputs or outputs retained or used for training, and can training be disabled? | Provider and contract specific; verify and record. |
| Which data region processes and stores the request? | Provider and deployment specific; verify and record. |
| What are the retention and deletion periods? | Provider and contract specific; verify and record. |
| Can these documents contain regulated, personal, or contract data? | Classify the intended corpus before enabling. |
| Do the provider's terms permit this use and data class? | Review the chosen provider agreement before enabling. |

Each request sends the system rules, up to six packed evidence excerpts, the current question,
and up to six recent messages. The key stays in the server environment. Application logs contain
retry counts and token usage only; they never include a prompt, completion, key, or vendor body.
One retry is allowed for a timeout or upstream 5xx, with 300 ms backoff; 401, 429, and other 4xx
return `AI_UNAVAILABLE` without retry. Each attempt has its own `LLM_TIMEOUT_MS` budget.

The recorded local contract fixture reports 120 input tokens and 20 output tokens for one
successful question, or **140 tokens total**. This measures the telemetry path, not an actual
provider bill. Monetary cost per live question is
`120 × input price per token + 20 × output price per token` for that fixture; record current
prices for the selected model and real `llm_usage` values before making a currency claim.
