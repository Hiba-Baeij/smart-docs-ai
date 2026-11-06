/**
 * The corpus and the questions of the Phase 5 search spike (ADR-004).
 *
 * HONEST LIMIT: every passage and question here was written by Claude, in Modern Standard Arabic
 * and English, as a plausible company policy handbook. It was not taken from the user's own
 * documents, and the questions were written before any configuration was run. A result on this
 * corpus says how the configurations behave on this kind of text, not on the user's files.
 * Some questions are deliberately awkward in the ways real questions are: a definite article the
 * passage does not have, a spelling variant, a plural, a diacritic, a typo.
 */

export type Passage = { id: string; language: 'ar' | 'en'; text: string };

export type Question = {
  text: string;
  expected: string;
  /** What the question is meant to stress; used to read the results, not to run them. */
  kind:
    | 'exact'
    | 'article'
    | 'spelling'
    | 'diacritics'
    | 'inflection'
    | 'typo'
    | 'mixed'
    | 'english'
    | 'short'
    | 'digits';
};

export const PASSAGES: Passage[] = [
  {
    id: 'ar-01',
    language: 'ar',
    text: 'يستحق الموظف إجازة سنوية مدفوعة الأجر مدتها واحد وعشرون يوماً عن كل سنة خدمة كاملة، وترتفع إلى ثلاثين يوماً بعد إتمام خمس سنوات في الشركة. ويجب تقديم طلب الإجازة إلى المدير المباشر قبل أسبوعين على الأقل من موعدها.',
  },
  {
    id: 'ar-02',
    language: 'ar',
    text: 'تُمنح الإجازة المرضية بأجر كامل لمدة ثلاثين يوماً في السنة، ثم بنصف الأجر لمدة ستين يوماً. ويشترط تقديم تقرير طبي معتمد من مستشفى حكومي أو مركز صحي معتمد خلال ثلاثة أيام من بداية الغياب.',
  },
  {
    id: 'ar-03',
    language: 'ar',
    text: 'ساعات العمل الرسمية من الأحد إلى الخميس، من الثامنة صباحاً حتى الرابعة عصراً، وتتخللها استراحة غداء مدتها ساعة واحدة. ويُحتسب التأخر عن الدوام بعد مرور خمس عشرة دقيقة من بداية العمل.',
  },
  {
    id: 'ar-04',
    language: 'ar',
    text: 'يجوز للموظف العمل عن بُعد يومين في الأسبوع بعد موافقة المدير المباشر، على أن يبقى متاحاً على قنوات التواصل خلال ساعات الدوام. ولا يشمل العمل عن بعد الموظفين الجدد خلال فترة التجربة التي تمتد ثلاثة أشهر.',
  },
  {
    id: 'ar-05',
    language: 'ar',
    text: 'تلتزم الشركة بسياسة كلمات المرور التالية: ألا يقل طول كلمة المرور عن اثني عشر حرفاً، وأن تحتوي على أرقام ورموز، وأن تُغيَّر كل تسعين يوماً. ويُمنع استخدام كلمة المرور نفسها في أكثر من نظام واحد.',
  },
  {
    id: 'ar-06',
    language: 'ar',
    text: 'تؤخذ نسخة احتياطية يومية من جميع الخوادم عند منتصف الليل، وتُحفظ النسخ اليومية مدة ثلاثين يوماً، بينما تُحفظ النسخ الشهرية مدة سنة كاملة في موقع آمن خارج المبنى الرئيسي.',
  },
  {
    id: 'ar-07',
    language: 'ar',
    text: 'تُسدَّد فواتير الموردين خلال ثلاثين يوماً من تاريخ استلام الفاتورة. وفي حال التأخر عن السداد تُحتسب غرامة تأخير بنسبة اثنين في المئة عن كل شهر، ما لم يُتفق على غير ذلك كتابياً في العقد.',
  },
  {
    id: 'ar-08',
    language: 'ar',
    text: 'أي عملية شراء تتجاوز قيمتها عشرة آلاف ريال تحتاج إلى موافقة لجنة المشتريات، ويجب إرفاق ثلاثة عروض أسعار على الأقل. أما المشتريات الأقل من ذلك فيعتمدها مدير الإدارة مباشرة.',
  },
  {
    id: 'ar-09',
    language: 'ar',
    text: 'يُصرف للموظف بدل سفر يومي قدره ثلاثمائة ريال داخل المملكة، وتُحجز تذاكر الطيران على الدرجة السياحية. وتُقدَّم مطالبة المصروفات مع الإيصالات الأصلية خلال أسبوعين من العودة من الرحلة.',
  },
  {
    id: 'ar-10',
    language: 'ar',
    text: 'مدة العقد سنتان من تاريخ التوقيع، ويتجدد تلقائياً لمدد مماثلة ما لم يُخطر أحد الطرفين الآخر كتابةً برغبته في عدم التجديد قبل ستين يوماً من انتهاء المدة.',
  },
  {
    id: 'ar-11',
    language: 'ar',
    text: 'تظل التزامات السرية في اتفاقية عدم الإفصاح (NDA) سارية لمدة ثلاث سنوات بعد انتهاء العلاقة التعاقدية، ويلتزم الطرف المتلقي بعدم الإفصاح عن المعلومات السرية لأي طرف ثالث إلا بموافقة خطية مسبقة.',
  },
  {
    id: 'ar-12',
    language: 'ar',
    text: 'يقدم المورد ضماناً على المعدات المسلَّمة لمدة اثني عشر شهراً من تاريخ التسليم، ويشمل الضمان إصلاح العيوب المصنعية أو استبدال القطع المعيبة دون أي تكلفة إضافية على الشركة.',
  },
  {
    id: 'ar-13',
    language: 'ar',
    text: 'تخصص الشركة ميزانية تدريب سنوية لكل موظف قدرها ثلاثة آلاف ريال، ويمكن استخدامها في الدورات المهنية والمؤتمرات والشهادات المعتمدة بعد موافقة مدير الإدارة وقسم الموارد البشرية.',
  },
  {
    id: 'ar-14',
    language: 'ar',
    text: 'يُجرى تقييم الأداء السنوي في شهر ديسمبر من كل عام، ويشمل تقييم الموظف لنفسه وتقييم المدير المباشر له. وتُربط نتيجة التقييم بالعلاوة السنوية والترقيات.',
  },
  {
    id: 'ar-15',
    language: 'ar',
    text: 'على كل موظف يشتبه في وقوع حادث أمني، كاختراق حساب أو فقدان جهاز، إبلاغ فريق أمن المعلومات خلال ساعة واحدة من اكتشافه، وعدم محاولة إصلاح المشكلة بنفسه.',
  },
  {
    id: 'ar-16',
    language: 'ar',
    text: 'يُسمح باستخدام الأجهزة الشخصية في العمل بشرط تثبيت برنامج الحماية المعتمد وتفعيل قفل الشاشة والتشفير، وللشركة الحق في مسح بيانات العمل عن بُعد عند فقدان الجهاز.',
  },
  {
    id: 'ar-17',
    language: 'ar',
    text: 'لا يجوز للموظف قبول هدايا من الموردين أو العملاء تتجاوز قيمتها مائتي ريال، ويجب الإبلاغ عن أي هدية مهما كانت قيمتها إلى مسؤول الالتزام لتسجيلها في سجل الهدايا.',
  },
  {
    id: 'ar-18',
    language: 'ar',
    text: 'تُسجَّل شكاوى العملاء في النظام فور استلامها، ويجب الرد على الشكوى خلال ثلاثة أيام عمل، فإن تعذر حلها خلال أسبوع تُصعَّد إلى مدير خدمة العملاء.',
  },
  {
    id: 'ar-19',
    language: 'ar',
    text: 'تُعتمد الموازنة السنوية للشركة في نهاية الربع الثالث من السنة المالية بعد مراجعتها من الإدارة المالية ومجلس الإدارة، وتُراجع الموازنة مرة كل ثلاثة أشهر.',
  },
  {
    id: 'ar-20',
    language: 'ar',
    text: 'تُجرى أعمال الصيانة الدورية للمكاتب والمرافق كل يوم خميس بعد انتهاء الدوام الرسمي، ويُبلَّغ الموظفون بأي انقطاع متوقع للخدمات قبل يومين على الأقل.',
  },
  {
    id: 'ar-21',
    language: 'ar',
    text: 'تشمل الإجازات الرسمية للشركة عيد الفطر وعيد الأضحى واليوم الوطني، وتُعلن قائمة الإجازات الرسمية في بداية كل سنة ميلادية، ولا تُحتسب من رصيد الإجازة السنوية للموظف.',
  },
  {
    id: 'ar-22',
    language: 'ar',
    text: 'تُسدَّد مطالبات المصروفات المعتمدة للموظفين مع الراتب الشهري التالي، ويجب أن تُقدَّم المطالبة مع الإيصالات خلال شهر من تاريخ الإنفاق وإلا سقط الحق فيها.',
  },
  {
    id: 'ar-23',
    language: 'ar',
    text: 'يُستخدم البريد الإلكتروني للشركة لأغراض العمل فقط، ويُمنع إرسال المعلومات السرية إلى حسابات شخصية. وتحتفظ الشركة بحق مراجعة رسائل البريد عند الاشتباه في مخالفة السياسات.',
  },
  {
    id: 'ar-24',
    language: 'ar',
    text: 'يخضع الموظف الجديد لبرنامج تعريفي مدته أسبوعان يشمل التعرف على فريقه وأنظمة الشركة وسياسات السلامة، ويُعيَّن له زميل مرشد يتابع تقدمه خلال الشهر الأول.',
  },
  {
    id: 'ar-25',
    language: 'ar',
    text: 'يُقيَّم الموردون مرة كل سنة بحسب الجودة والالتزام بمواعيد التسليم والسعر، ويُستبعد المورد الذي تقل درجته عن ستين في المئة من قائمة الموردين المعتمدين.',
  },
  {
    id: 'ar-26',
    language: 'ar',
    text: 'تُحفظ السجلات المالية سبع سنوات، وملفات الموظفين خمس سنوات بعد انتهاء الخدمة، ويُتلف ما عدا ذلك بطريقة آمنة بعد انتهاء مدة الاحتفاظ المحددة في جدول الاحتفاظ بالسجلات.',
  },
  {
    id: 'ar-27',
    language: 'ar',
    text: 'يُسجَّل جميع الزوار عند الاستقبال ويحصلون على بطاقة زائر تُعاد عند المغادرة، ولا يُسمح لهم بالتنقل داخل المبنى إلا برفقة موظف مسؤول.',
  },
  {
    id: 'ar-28',
    language: 'ar',
    text: 'يُعوَّض العمل الإضافي بأجر يعادل ساعة ونصف عن كل ساعة عمل إضافية، ويجب أن يُعتمد مسبقاً من المدير المباشر، ولا يتجاوز العمل الإضافي ستين ساعة في الشهر.',
  },
  {
    id: 'ar-29',
    language: 'ar',
    text: 'يُسدَّد المبلغ المتبقي من قيمة العقد خلال 45 يوماً من تاريخ التسليم النهائي، ويُحتفظ بنسبة خمسة في المئة كضمان حسن تنفيذ إلى حين انتهاء فترة الضمان.',
  },
  {
    id: 'en-01',
    language: 'en',
    text: 'Supplier invoices are paid within thirty days of the date the invoice is received. Late payments accrue interest at two percent per month unless a different arrangement is agreed in writing in the contract.',
  },
  {
    id: 'en-02',
    language: 'en',
    text: 'Passwords must be at least twelve characters long, contain numbers and symbols, and be changed every ninety days. The same password must never be reused across different systems.',
  },
  {
    id: 'en-03',
    language: 'en',
    text: 'Employees may work remotely two days per week with the approval of their line manager and must remain reachable on company communication channels during working hours.',
  },
  {
    id: 'en-04',
    language: 'en',
    text: 'Financial records are retained for seven years and employee files for five years after employment ends. All other records are destroyed securely once their retention period expires.',
  },
  {
    id: 'en-05',
    language: 'en',
    text: 'Expense reports must be submitted with original receipts within fourteen days of returning from a business trip. Approved claims are reimbursed together with the next monthly salary.',
  },
  {
    id: 'en-06',
    language: 'en',
    text: 'Any employee who suspects a security incident, such as a compromised account or a lost laptop, must notify the information security team within one hour and must not attempt to fix the problem alone.',
  },
  {
    id: 'en-07',
    language: 'en',
    text: 'New vendors are onboarded after a due diligence review covering financial stability, security practices and references, and must sign the data protection addendum before receiving any company data.',
  },
  {
    id: 'en-08',
    language: 'en',
    text: 'Flights are booked in economy class through the approved travel agency. Hotel stays are capped at the nightly rate set for each city in the travel policy table.',
  },
  {
    id: 'en-09',
    language: 'en',
    text: 'Confidentiality obligations remain in force for three years after the contractual relationship ends. The receiving party must not disclose confidential information to any third party without prior written consent.',
  },
  {
    id: 'en-10',
    language: 'en',
    text: 'Each employee has an annual training budget of three thousand riyals that can be used for professional courses, conferences and accredited certifications with the approval of the department manager.',
  },
];

export const QUESTIONS: Question[] = [
  {
    text: 'ما هي مدة الإجازة المرضية بأجر كامل؟',
    expected: 'ar-02',
    kind: 'exact',
  },
  { text: 'ما هي ساعات العمل الرسمية؟', expected: 'ar-03', kind: 'exact' },
  {
    text: 'كم يوماً أستحق في الإجازة السنوية؟',
    expected: 'ar-01',
    kind: 'article',
  },
  { text: 'كم تبلغ مده العقد وهل يتجدد؟', expected: 'ar-10', kind: 'spelling' },
  { text: 'متي يجب سداد الفواتير؟', expected: 'ar-07', kind: 'article' },
  {
    text: 'كَمْ مُدَّةُ الضَّمَانِ عَلَى المُعَدَّاتِ؟',
    expected: 'ar-12',
    kind: 'diacritics',
  },
  { text: 'ما هي سياسة كلمة المرور؟', expected: 'ar-05', kind: 'exact' },
  {
    text: 'متى يتم تقييم أداء الموظفين؟',
    expected: 'ar-14',
    kind: 'inflection',
  },
  {
    text: 'ما شروط الاستفادة من ميزانية التدريب؟',
    expected: 'ar-13',
    kind: 'article',
  },
  {
    text: 'كم يوما يسمح بالعمل عن بعد؟',
    expected: 'ar-04',
    kind: 'diacritics',
  },
  {
    text: 'خلال كم ساعة يجب إبلاغ فريق الأمن بالحادث؟',
    expected: 'ar-15',
    kind: 'inflection',
  },
  {
    text: 'من يوافق على المشتريات التي تزيد عن عشرة آلاف ريال؟',
    expected: 'ar-08',
    kind: 'exact',
  },
  { text: 'غرامة التأخير', expected: 'ar-07', kind: 'short' },
  {
    text: 'كم مدة الاحتفاض بالسجلات المالية؟',
    expected: 'ar-26',
    kind: 'typo',
  },
  {
    text: 'كم تستمر التزامات NDA بعد انتهاء العلاقة؟',
    expected: 'ar-11',
    kind: 'mixed',
  },
  {
    text: 'How long are financial records retained?',
    expected: 'en-04',
    kind: 'english',
  },
  {
    text: 'When must an expense report be submitted?',
    expected: 'en-05',
    kind: 'english',
  },
  {
    text: 'How often must passwords be changed?',
    expected: 'en-02',
    kind: 'english',
  },
  {
    text: 'What is the annual training budget?',
    expected: 'en-10',
    kind: 'english',
  },
  { text: 'إجازة سنوية', expected: 'ar-01', kind: 'short' },
  // Added AFTER the first run, once a probe of the `arabic` configuration showed which letters it
  // already folds and which it does not (alef maksura vs yeh, Persian digits). They are not part
  // of the original 20 and are reported as such.
  {
    text: 'هل التقرير الطبي من مستشفي مقبول؟',
    expected: 'ar-02',
    kind: 'spelling',
  },
  {
    text: 'كم يوماً أنتظر بعد التسليم لسداد المبلغ المتبقي؟ ٤٥',
    expected: 'ar-29',
    kind: 'digits',
  },
  {
    text: 'متى يُسدَّد المبلغ المتبقي بعد ۴۵ يوماً؟',
    expected: 'ar-29',
    kind: 'digits',
  },
];

/** Questions 1-20 were written before any configuration ran; the rest were added afterwards. */
export const ORIGINAL_QUESTION_COUNT = 20;
