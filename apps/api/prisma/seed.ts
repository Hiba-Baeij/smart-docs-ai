/**
 * Development seed: one user and two documents (one Arabic, one English) with chunks, so
 * the UI and retrieval can be exercised without uploading anything.
 *
 * Idempotent: every row has a fixed id and is written with `upsert`, so running it twice
 * leaves the same data. Development only: it refuses to run in production or against a
 * database that is not on this machine.
 */
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

// Development credentials, printed nowhere else. Never reuse them outside local development.
const DEV_USER = {
  id: '00000000-0000-7000-8000-000000000001',
  name: 'Dev User',
  email: 'dev@smartdocs.local',
  password: 'dev-password-123',
};

type SeedChunk = {
  content: string;
  pageNumber: number | null;
  sheetName: string | null;
};

type SeedDocument = {
  id: string;
  originalName: string;
  fileType: 'pdf' | 'docx' | 'xlsx';
  chunks: SeedChunk[];
};

const documents: SeedDocument[] = [
  {
    id: '00000000-0000-7000-8000-000000000010',
    originalName: 'سياسة-الإجازات.docx',
    fileType: 'docx',
    chunks: [
      {
        pageNumber: null,
        sheetName: null,
        content:
          'سياسة الإجازات في الشركة\n\nيحق لكل موظف دائم إجازة سنوية مدتها واحد وعشرون يومًا مدفوعة الأجر في السنة الواحدة. ' +
          'تبدأ الإجازة السنوية بعد إتمام فترة التجربة، ويجب تقديم طلب الإجازة قبل أسبوعين على الأقل.',
      },
      {
        pageNumber: null,
        sheetName: null,
        content:
          'فترة التجربة والإشعار\n\nمدة فترة التجربة ثلاثة أشهر قابلة للتمديد مرة واحدة. ' +
          'مدة الإشعار المسبق عند الاستقالة هي ثلاثون يومًا، ولا يجوز تقصيرها إلا بموافقة كتابية من مدير الموارد البشرية.',
      },
      {
        pageNumber: null,
        sheetName: null,
        content:
          'الإجازة المرضية\n\nتُمنح الإجازة المرضية بتقرير طبي معتمد، وتصل إلى خمسة عشر يومًا في السنة بأجر كامل، ' +
          'وما زاد عنها يُحتسب بنصف الأجر.',
      },
    ],
  },
  {
    id: '00000000-0000-7000-8000-000000000020',
    originalName: 'remote-work-policy.pdf',
    fileType: 'pdf',
    chunks: [
      {
        pageNumber: 1,
        sheetName: null,
        content:
          'Remote Work Policy\n\nEmployees may work remotely up to two days per week with their manager\'s approval. ' +
          'Remote days must be agreed in advance and recorded in the team calendar.',
      },
      {
        pageNumber: 1,
        sheetName: null,
        content:
          'Core Hours\n\nEveryone must be reachable during core hours, from 10:00 to 15:00 local time, ' +
          'regardless of where they work.',
      },
      {
        pageNumber: 2,
        sheetName: null,
        content:
          'Equipment\n\nThe company provides a one-time home-office stipend of 500 USD. ' +
          'Receipts must be submitted to finance within thirty days of purchase.',
      },
    ],
  },
];

/**
 * Chunk ids are derived from the document id so they stay stable across runs. The `8002`
 * group keeps them visibly apart from the user (`8000...01`) and document ids.
 */
function chunkId(documentId: string, chunkIndex: number): string {
  const documentSuffix = documentId.slice(-8);
  const position = String(chunkIndex + 1).padStart(4, '0');
  return `00000000-0000-7000-8002-${documentSuffix}${position}`;
}

function assertDevelopmentDatabase(connectionString: string): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed: NODE_ENV is production.');
  }
  const { hostname } = new URL(connectionString);
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname)) {
    throw new Error(
      `Refusing to seed: "${hostname}" is not a local database host.`,
    );
  }
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set.');
  }
  assertDevelopmentDatabase(connectionString);

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const passwordHash = await bcrypt.hash(DEV_USER.password, 12);
    await prisma.user.upsert({
      where: { id: DEV_USER.id },
      create: {
        id: DEV_USER.id,
        name: DEV_USER.name,
        email: DEV_USER.email,
        passwordHash,
      },
      update: { name: DEV_USER.name, email: DEV_USER.email, passwordHash },
    });

    for (const doc of documents) {
      const extractedText = doc.chunks.map((c) => c.content).join('\n\n');
      await prisma.document.upsert({
        where: { id: doc.id },
        create: {
          id: doc.id,
          originalName: doc.originalName,
          fileType: doc.fileType,
          extractedText,
          status: 'COMPLETED',
          uploadedBy: DEV_USER.id,
        },
        update: {
          originalName: doc.originalName,
          fileType: doc.fileType,
          extractedText,
          status: 'COMPLETED',
          errorCode: null,
        },
      });

      for (const [index, chunk] of doc.chunks.entries()) {
        await prisma.documentChunk.upsert({
          where: {
            documentId_chunkIndex: { documentId: doc.id, chunkIndex: index },
          },
          create: {
            id: chunkId(doc.id, index),
            documentId: doc.id,
            chunkIndex: index,
            content: chunk.content,
            pageNumber: chunk.pageNumber,
            sheetName: chunk.sheetName,
          },
          update: {
            content: chunk.content,
            pageNumber: chunk.pageNumber,
            sheetName: chunk.sheetName,
          },
        });
      }
    }

    const [users, docs, chunks] = await Promise.all([
      prisma.user.count(),
      prisma.document.count(),
      prisma.documentChunk.count(),
    ]);
    console.log(
      `Seed complete: ${users} user(s), ${docs} document(s), ${chunks} chunk(s) in the database.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(
    `Seed failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
