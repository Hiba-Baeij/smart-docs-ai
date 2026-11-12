/**
 * Greetings and pleasantries ("hi", "كيف حالك", "شكراً", "bye") get a fixed friendly reply
 * instead of going through retrieval and the model, which would answer them with the
 * insufficient-evidence fallback. Only a message made entirely of small talk matches:
 * "مرحبا، ما سياسة الإرجاع؟" still goes to the RAG pipeline.
 */

type Category =
  | 'salam'
  | 'morning'
  | 'evening'
  | 'greeting'
  | 'howAreYou'
  | 'thanks'
  | 'goodbye';

const PHRASES: Record<Category, string[]> = {
  salam: [
    'السلام عليكم',
    'السلام عليكم ورحمة الله',
    'السلام عليكم ورحمة الله وبركاته',
    'سلام عليكم',
    'سلام',
  ],
  morning: ['صباح الخير', 'صباح النور', 'صباحو', 'good morning', 'morning'],
  evening: ['مساء الخير', 'مساء النور', 'مساءو', 'good evening', 'evening'],
  greeting: [
    'مرحبا',
    'مرحبتين',
    'مرحب',
    'اهلا',
    'اهلين',
    'اهلا وسهلا',
    'هلا',
    'هلا والله',
    'يا هلا',
    'هاي',
    'هلو',
    'هالو',
    'hi',
    'hey',
    'hello',
    'hiya',
    'howdy',
    'greetings',
    'good afternoon',
    'whats up',
    'what s up',
    'sup',
    'yo',
  ],
  howAreYou: [
    'كيف حالك',
    'كيف حالكم',
    'كيف الحال',
    'كيف حالك اليوم',
    'كيفك',
    'كيفكم',
    'كيف اخبارك',
    'شو اخبارك',
    'شو الاخبار',
    'شخبارك',
    'شلونك',
    'ازيك',
    'عامل ايه',
    'اخبارك',
    'how are you',
    'how are you doing',
    'how are you today',
    'how are u',
    'how r u',
    'how is it going',
    'hows it going',
    'how s it going',
    'how do you do',
  ],
  thanks: [
    'شكرا',
    'شكرا لك',
    'شكرا جزيلا',
    'شكرا كتير',
    'مشكور',
    'مشكوره',
    'تسلم',
    'تسلمي',
    'يعطيك العافيه',
    'الله يعطيك العافيه',
    'thanks',
    'thank you',
    'thank you so much',
    'thanks a lot',
    'many thanks',
    'thx',
    'ty',
  ],
  goodbye: [
    'مع السلامه',
    'الى اللقاء',
    'باي',
    'تصبح على خير',
    'تصبحي على خير',
    'bye',
    'bye bye',
    'goodbye',
    'good bye',
    'see you',
    'see ya',
    'good night',
  ],
};

/** Words allowed around the phrases without changing the meaning ("hi there", "يا صديقي"). */
const FILLERS = new Set(
  [
    'يا',
    'و',
    'صديقي',
    'مساعد',
    'and',
    'there',
    'friend',
    'buddy',
    'bot',
    'oh',
  ].map(normalize),
);

/** Longer messages are real questions even when they open with a greeting. */
const MAX_TOKENS = 12;

const REPLIES = {
  ar: {
    salam: 'وعليكم السلام ورحمة الله وبركاته!',
    morning: 'صباح النور!',
    evening: 'مساء النور!',
    greeting: 'أهلاً وسهلاً!',
    howAreYou: 'أنا بخير، شكراً لسؤالك.',
    thanks: 'العفو، يسعدني أن أساعدك!',
    goodbye: 'مع السلامة! عُد متى احتجت أي شيء من مستنداتك.',
    intro:
      'أنا مساعد مستنداتك: اسألني أي سؤال عن الملفات التي رفعتها وسأجيبك منها مع ذكر المصادر.',
    ready: 'إذا كان لديك سؤال آخر عن مستنداتك فأنا جاهز.',
  },
  en: {
    salam: 'Wa alaikum assalam!',
    morning: 'Good morning!',
    evening: 'Good evening!',
    greeting: 'Hello!',
    howAreYou: "I'm doing well, thanks for asking.",
    thanks: "You're welcome, happy to help!",
    goodbye:
      'Goodbye! Come back any time you need something from your documents.',
    intro:
      "I'm your document assistant: ask me anything about the files you uploaded and I'll answer from them with sources.",
    ready: 'If you have another question about your documents, I am here.',
  },
} as const;

const PHRASE_TOKENS: { category: Category; tokens: string[] }[] = (
  Object.entries(PHRASES) as [Category, string[]][]
)
  .flatMap(([category, phrases]) =>
    phrases.map((phrase) => ({
      category,
      tokens: normalize(phrase).split(' '),
    })),
  )
  // Longest first so "السلام عليكم ورحمة الله" wins over "السلام عليكم".
  .sort((a, b) => b.tokens.length - a.tokens.length);

function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '') // tashkeel and tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // punctuation, ؟, emoji
    .replace(/(\p{L})\1+/gu, '$1') // stretched words: "هاااي", "hiii"
    .replace(/\s+/g, ' ')
    .trim();
}

function classify(question: string): Set<Category> | null {
  const normalized = normalize(question);
  if (!normalized) return null;
  const tokens = normalized.split(' ');
  if (tokens.length > MAX_TOKENS) return null;

  const found = new Set<Category>();
  let i = 0;
  while (i < tokens.length) {
    const match = PHRASE_TOKENS.find(({ tokens: phrase }) =>
      phrase.every((token, k) => tokens[i + k] === token),
    );
    if (match) {
      found.add(match.category);
      i += match.tokens.length;
    } else if (FILLERS.has(tokens[i])) {
      i += 1;
    } else {
      return null;
    }
  }
  return found.size > 0 ? found : null;
}

/** The friendly reply for a pure small-talk message, or null when it is a real question. */
export function smallTalkReply(question: string): string | null {
  const found = classify(question);
  if (!found) return null;
  const replies = /\p{Script=Arabic}/u.test(question) ? REPLIES.ar : REPLIES.en;

  if (found.has('goodbye')) {
    return found.has('thanks')
      ? `${replies.thanks} ${replies.goodbye}`
      : replies.goodbye;
  }

  const opener = found.has('salam')
    ? replies.salam
    : found.has('morning')
      ? replies.morning
      : found.has('evening')
        ? replies.evening
        : found.has('greeting')
          ? replies.greeting
          : null;
  const onlyThanks = found.size === 1 && found.has('thanks');
  return [
    opener,
    found.has('thanks') ? replies.thanks : null,
    found.has('howAreYou') ? replies.howAreYou : null,
    onlyThanks ? replies.ready : replies.intro,
  ]
    .filter(Boolean)
    .join(' ');
}
