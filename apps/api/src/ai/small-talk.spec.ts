import { smallTalkReply } from './small-talk';

describe('small talk', () => {
  it.each([
    'هاي',
    'مرحبا',
    'مَرْحَبًا!!',
    'هاااي 👋',
    'أهلاً وسهلاً',
    'hi',
    'Hello!!!',
    'hey there',
  ])('greets back for %j', (message) => {
    expect(smallTalkReply(message)).not.toBeNull();
  });

  it('answers a greeting in Arabic with the assistant intro', () => {
    expect(smallTalkReply('مرحبا')).toBe(
      'أهلاً وسهلاً! أنا مساعد مستنداتك: اسألني أي سؤال عن الملفات التي رفعتها وسأجيبك منها مع ذكر المصادر.',
    );
  });

  it('answers in English for a Latin-script greeting', () => {
    expect(smallTalkReply('hi')).toMatch(/^Hello! I'm your document assistant/);
  });

  it('returns the salam', () => {
    expect(smallTalkReply('السلام عليكم ورحمة الله')).toMatch(
      /^وعليكم السلام ورحمة الله وبركاته!/,
    );
  });

  it('answers "how are you" and a combined greeting', () => {
    expect(smallTalkReply('كيف حالك؟')).toMatch(/^أنا بخير، شكراً لسؤالك\./);
    expect(smallTalkReply('هاي كيفك')).toMatch(
      /^أهلاً وسهلاً! أنا بخير، شكراً لسؤالك\./,
    );
    expect(smallTalkReply('How are you?')).toMatch(/^I'm doing well/);
  });

  it('matches morning and evening greetings', () => {
    expect(smallTalkReply('صباح الخير')).toMatch(/^صباح النور!/);
    expect(smallTalkReply('good evening')).toMatch(/^Good evening!/);
  });

  it('answers thanks without the intro', () => {
    expect(smallTalkReply('شكراً جزيلاً')).toBe(
      'العفو، يسعدني أن أساعدك! إذا كان لديك سؤال آخر عن مستنداتك فأنا جاهز.',
    );
    expect(smallTalkReply('thank you')).toMatch(/^You're welcome/);
  });

  it('says goodbye', () => {
    expect(smallTalkReply('مع السلامة')).toMatch(/^مع السلامة!/);
    expect(smallTalkReply('thanks, bye')).toMatch(
      /^You're welcome, happy to help! Goodbye!/,
    );
  });

  it.each([
    'مرحبا، ما هي سياسة الإرجاع؟',
    'hi, when are invoices paid?',
    'hello world in python',
    'سلامة المعلومات',
    'ok',
    '',
    '   ',
    '👋',
  ])('leaves %j to the RAG pipeline', (message) => {
    expect(smallTalkReply(message)).toBeNull();
  });
});
