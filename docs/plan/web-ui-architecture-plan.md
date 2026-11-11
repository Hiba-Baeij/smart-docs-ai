# خطة رفع مستوى واجهة الويب (apps/web) — UI Architecture & UX

التاريخ: 2026-11-11 · الحالة: مسودة للمراجعة · المرجع: أنماط `matrix-frontend` بنسخة مبسّطة

---

## 0. التقييم الصريح للوضع الحالي

**ما هو جيد ويجب الإبقاء عليه** (لا نعيد كتابته):
- البنية `core / features / shared`، Standalone components، Signals، Lazy routes.
- `errorInterceptor` + `AppError` + `userMessage` (نموذج أخطاء موحّد).
- Feature stores مع حماية race conditions (`ticket`) وفصل بيانات المستخدمين (`owner`).
- `LocaleService` (ar/en + RTL)، `ThemeService` (dark/light)، design tokens عبر CSS variables.
- `ngx-sonner` للـ toasts موجود أصلاً (مكتبة معروفة) و `NotificationService` حوله.
- تغطية tests جيدة.

**المشاكل الفعلية** (وهي ما لاحظتِه):

| المشكلة | المثال في الكود |
|---|---|
| لا يوجد Confirm Dialog موحّد؛ التأكيد كارد inline داخل الصفحة | `document-detail.html` قسم `.danger` / `.confirm` |
| الجداول مكتوبة يدوياً في كل صفحة (`<table>` + pager) | `documents-page.html`, `document-detail.html` |
| كل request يدير loading/نص خاص به (`deleting()`, `signingOut()`, `'docs.loading'`) | `document-detail.ts`, `shell.html` |
| كل mutation يكتب try/catch + toast يدوياً | `confirmDelete()` |
| لا يوجد global pending indicator | — |
| صفحة تفاصيل الملف فقيرة: `<dl>` + `<pre>` + جدول خام، بلا header/actions/tabs | `document-detail.html` |
| لا يوجد UI kit (button, card, page header, skeleton, menu…) فكل صفحة تعيد CSS الأزرار | `document-detail.scss` يعرّف `button` محلياً |
| لا توجد طبقة API عامة؛ كل feature يكرر list/detail/remove | `documents.api.ts` |
| ADR-012 رفض أي UI library لهدف تعليمي — لم يعد مناسباً لمشروع قابل للتوسع | `docs/architecture/decisions/ADR-012` |

الخلاصة: **منطق البيانات احترافي، طبقة الـ UI هي البدائية.** الخطة تركز على بناء UI layer قابلة لإعادة الاستخدام وطبقة feedback مركزية.

---

## 1. القرارات التقنية (Stack)

| الحاجة | القرار المقترح | السبب | البديل المرفوض |
|---|---|---|---|
| Primitives (Dialog, Overlay, Table, Menu, A11y, Bidi) | **`@angular/cdk`** | رسمي، headless، يدعم RTL و focus trap، لا يفرض شكلاً فيبقى الـ design tokens والـ Tailwind كما هي | — |
| Components جاهزة (Paginator, Sort, Progress, Tabs, Tooltip, Menu) | **`@angular/material`** مع theme مبني على tokens الحالية | المعيار في Angular، مستقر، a11y قوي | **PrimeNG**: أغنى (Table/ConfirmDialog/Toast جاهزة) لكنه أثقل ويتعارض theming مع Tailwind tokens |
| Confirm / Alert | `ConfirmService` فوق `MatDialog` (مكافئ `confirm()` في Matrix) | شكل موحّد مع الثيم و RTL و i18n | **SweetAlert2**: ليس Angular-native، يحقن DOM خارج الثيم، صعب مع dark/RTL |
| Toasts | **إبقاء `ngx-sonner`** + `toast.promise` | موجود، يدعم RTL و richColors و loading→success/error | ngx-toastr: أقدم شكلاً |
| Icons | `@lucide/angular` (الحزمة الرسمية الجديدة؛ peer `@angular/core >=17`) | نفس عائلة أيقونات Matrix، tree-shakable | `lucide-angular` القديمة (peer حتى Angular 21 فقط)، SVG inline اليدوي الحالي |
| Animation | Angular `animate.enter` / `animate.leave` (native CSS، Angular ≥20.2) + `withViewTransitions()` للتنقل بين الصفحات | `@angular/animations` في طريقه للـ deprecation؛ الحل الجديد أخف | `@angular/animations` |
| Data fetching | الإبقاء على Signal stores، مع base class عامة (انظر §3) | لا نضيف state model ثالث | TanStack Query Angular (مؤجل كما في ADR-012) |

> ✅ **القرار (2026-11-11): Angular Material + CDK.**
> ⚠️ تثبيت الحزم (`@angular/cdk@22.2.6`, `@angular/material@22.2.6`, `@lucide/angular`) يحتاج موافقتك قبل التنفيذ.
> يُكتب **ADR-019** يستبدل بند "no UI component library" في ADR-012.

---

## 2. البنية المستهدفة للمجلدات

```
src/app/
├─ core/                       # singletons، تُحمّل مرة واحدة
│  ├─ http/                    # interceptors: credentials, error, loading (جديد)
│  ├─ feedback/                # (جديد) ConfirmService, NotificationService, Mutation runner
│  ├─ loading/                 # (جديد) LoadingService + HttpContext tokens
│  ├─ i18n/  presentation/  auth/  config/
│  └─ shell/                   # layout + top progress bar + sidebar/topbar
├─ shared/
│  ├─ ui/                      # (جديد) UI kit — presentational فقط
│  │  ├─ button/  icon-button/  card/  page-header/  details-grid/
│  │  ├─ skeleton/  empty-state/  error-banner/  status-badge/
│  │  ├─ dialog/ (confirm-dialog, dialog-shell)  menu/  tabs/
│  │  └─ index.ts              # barrel
│  ├─ data-table/              # (جديد) Generic table + column/action types
│  ├─ data/                    # (جديد) ResourceApi<T>, PaginatedStore<T>, types
│  ├─ forms/                   # موجود (app-form, app-field, schemas)
│  ├─ animations/              # (جديد) presets: fade, slide, stagger + reduced-motion
│  └─ utils/                   # format-date, file-size, ...
└─ features/
   └─ documents/
      ├─ data/        documents.api.ts, documents.store.ts, document-state.ts
      ├─ pages/       documents-list/, document-detail/
      ├─ components/  upload-dropzone/, document-text-viewer/, document-chunks-table/
      └─ documents.columns.ts   # تعريف أعمدة الجدول
```

القواعد:
- `shared/ui` لا يعرف شيئاً عن API أو stores (inputs/outputs فقط).
- `features/*` لا يستورد من feature آخر.
- كل مجلد shared له `index.ts` barrel.
- Path aliases في `tsconfig`: `@core/*`, `@shared/*`, `@features/*`.

---

## 3. الـ Patterns الأساسية

### 3.1 Global Loading (بدل loading فردي لكل request)

- **`LoadingService`**: signal عدّاد `pending` + `isLoading = computed(pending > 0)`.
- **`loadingInterceptor`**: يزيد العداد عند بدء أي request وينقصه في `finalize`.
- **`HttpContextToken`s**:
  - `SKIP_GLOBAL_LOADING` للـ polling/background (حالة معالجة الملف، chat streaming).
  - `SILENT_ERROR` للطلبات التي تعالج الخطأ بنفسها.
- **`<app-top-progress>`** في الـ shell: شريط علوي متحرك (`mat-progress-bar` indeterminate)، يظهر بعد **150ms delay** (لا وميض للطلبات السريعة) ويبقى **300ms minimum**.
- الأزرار: `<app-button [loading]="mutation.pending()">` يعرض spinner ويعطّل نفسه — تأتي القيمة من الـ mutation runner، وليس من signal يدوي في كل component.
- القوائم والتفاصيل: **skeletons** من الـ data-table و `app-card [loading]`، ونحذف نصوص "Loading…" الفردية.

النتيجة: لا يوجد component يكتب `signal(false)` للـ loading يدوياً.

### 3.2 Feedback مركزي للـ Mutations (مكافئ `useApiMutation` + `withFeedback` في Matrix)

```ts
// core/feedback/mutation.ts
const remove = createMutation((id: string) => api.remove(id), {
  confirm: { title: 'docs.delete.title', message: 'docs.delete.message', tone: 'danger' },
  loading: 'docs.delete.pending',      // toast.loading
  success: 'docs.delete.success',      // toast.success
  error: (e) => userMessage(e),        // default: userMessage(AppError)
  onSuccess: (_, id) => { store.forget(id); router.navigate(['/documents']); },
});

remove.run(doc.id);          // confirm → toast.promise → onSuccess
remove.pending();            // Signal<boolean> للزر
remove.error();              // Signal<AppError | null>
```
- يمنع double-submit تلقائياً.
- `withoutFeedback: true` عند الحاجة.
- يُستخدم لكل create/update/delete/upload/sign-out.
- الرسائل keys من i18n، أو functions `(result, vars) => string`.

### 3.3 Confirm Dialog

- `ConfirmService.confirm({ title, message, confirmLabel, cancelLabel, tone: 'danger'|'primary', icon }) → Promise<boolean>`.
- مبني على `MatDialog`/CDK Dialog: focus trap، `Esc` للإلغاء، restore focus تلقائي (نتخلص من `afterNextRender` + `querySelector` اليدوي)، RTL، dark mode.
- Animation: scale + fade للـ dialog و fade للـ backdrop.
- يمكن تمرير `onConfirm` async فيبقى الـ dialog مفتوحاً مع spinner حتى ينتهي الطلب، مثل `DeleteConfirmationDialog` في Matrix.

### 3.4 Error handling (طبقتان واضحتان)

| نوع الطلب | أين يظهر الخطأ |
|---|---|
| Query (list/detail) | inline داخل الصفحة: `<app-error-banner>` مع Retry |
| Mutation | Toast عبر الـ mutation runner |
| 401 / انتهاء الجلسة | الـ interceptor الحالي (redirect) + toast معلوماتي واحد |

> **تعديل أثناء التنفيذ (المرحلة 1):** لم نضف toast عاماً في الـ interceptor. كل طلب إما query (يظهر خطؤه inline) أو mutation (يظهر خطؤه toast عبر `createMutation`)، فالـ toast العام كان سيكرر الرسالة نفسها.
>
> **قاعدة الأزرار:** زر الإجراء يُربط `[disabled]` بـ `mutation.pending()` وليس `busy()`. السبب: تعطيل الزر أثناء فتح الـ dialog يُفقده الـ focus، فلا يستطيع الـ dialog إعادة الـ focus إليه بعد Cancel.

### 3.5 طبقة البيانات العامة (مكافئ `ApiTemplate` مبسّط)

```ts
// shared/data/resource-api.ts
export abstract class ResourceApi<TList, TDetail = TList, TQuery = PageQuery> {
  protected abstract readonly path: string;
  list(query: TQuery): Observable<Page<TList>>;
  detail(id: string): Observable<TDetail>;
  remove(id: string): Observable<void>;
  // create/update عند الحاجة
}
export class DocumentsApi extends ResourceApi<DocumentSummary, DocumentDetail> {
  protected readonly path = 'documents';
  upload(file: File) { … }   // خاص بالـ feature
}
```

- **`PaginatedStore<T>`** base class، يُستخرج من `DocumentsStore` الحالي: owner guard، ticket، `view` (error/loading/empty/data)، `page/pageSize/total/sort/filters`، `load/refresh/forget`.
- `DocumentsStore extends PaginatedStore<DocumentSummary>`، فأي entity جديدة = ~10 أسطر.
- **مزامنة الحالة مع الـ URL**: `page`, `pageSize`, `sort`, `status` تُحفظ في query params (`withComponentInputBinding()`)، فيعمل refresh/back/share بشكل صحيح، كما في `MatrixResource`.

---

## 4. Generic Data Table (`shared/data-table`)

### API
```ts
export interface ColumnDef<T> {
  key: string;
  header: MessageKey;
  type?: 'text' | 'number' | 'date' | 'badge' | 'link' | 'fileType' | 'custom';
  value?: (row: T) => unknown;           // default: row[key]
  link?: (row: T) => unknown[];          // لـ type 'link'
  sortable?: boolean;
  align?: 'start' | 'center' | 'end';
  width?: string;
  hideBelow?: 'sm' | 'md';               // responsive
  cellClass?: (row: T) => string;
}

export interface RowAction<T> {
  id: string;
  label: MessageKey;
  icon: string;
  tone?: 'default' | 'danger';
  visible?: (row: T) => boolean;
  run: (row: T) => void;
}
```

```html
<app-data-table
  [rows]="store.items()" [columns]="columns" [trackBy]="'id'"
  [loading]="store.view() === 'loading'" [error]="store.error()"
  [page]="store.page()" [pageSize]="store.pageSize()" [total]="store.total()"
  [sort]="store.sort()" [actions]="rowActions"
  (pageChange)="store.load($event)" (sortChange)="store.sortBy($event)"
  (rowClick)="open($event)" (retry)="store.refresh()">

  <!-- custom cell override عند الحاجة -->
  <ng-template appCell="name" let-row>…</ng-template>
  <ng-template appEmpty>…</ng-template>
  <div appToolbar>search / filters / bulk actions</div>
</app-data-table>
```

> **تعديل أثناء التنفيذ (المرحلة 4):** الجدول مبني على `<table>` أصلي وليس `CdkTable`، لأن الأعمدة ديناميكية. زر الترتيب مكتوب داخل المشروع مع `aria-sort` بدل `MatSort`. نسخة `MatPaginator` المستخدمة معرّبة.
> - الوضع الضيق يعمل بـ container query، أي حسب عرض الحاوية وليس الشاشة.
> - إجراءات الصفوف تظهر دائماً في قائمة ⋮ (`app-menu`).
> - الحذف من القائمة أو من صفحة التفاصيل يمر عبر `createDeleteDocument` نفسه.

### الميزات (المرحلة الأولى)
- مبني على `CdkTable` + `MatSort` + `MatPaginator` (page size options).
- حالات مدمجة: skeleton rows (عدد = pageSize)، empty state، error + retry، فلا تعيد كل صفحة كتابة `@switch`.
- عمود actions: أزرار inline على desktop، وقائمة `⋮` (`mat-menu`) على mobile أو عند وجود أكثر من 2 actions.
- Toolbar slot: بحث (debounced) + chips للفلاتر (مثلاً status).
- Responsive: تتحول الصفوف إلى cards تحت `sm` (يوجد `data-label` حالياً، نعمّمه).
- Animation: stagger fade للصفوف عند التحميل الأول فقط (الكود الحالي `animation-delay` ينتقل هنا).
- يعمل **server-side** (القائمة) و **client-side** (مقاطع الملف في التفاصيل: pagination + filter محلي).
- A11y: `caption`, `aria-sort`, keyboard على الصفوف القابلة للنقر.

### مؤجل (البنية تسمح به لاحقاً دون كسر الـ API)
Selection + bulk actions، إخفاء/إظهار الأعمدة، export CSV، virtual scroll (`cdk-virtual-scroll`)، card/grid view.

---

## 5. UI Kit (`shared/ui`)

| Component | الغرض |
|---|---|
| `app-button` | variants: `primary / secondary / ghost / danger`؛ sizes؛ `[loading]`؛ `[icon]` |
| `app-icon-button` | زر أيقونة مع tooltip و `aria-label` إلزامي |
| `app-page-header` | title، subtitle، breadcrumb/back، slot للـ actions — لكل صفحة |
| `app-card` / `app-section-card` | title، icon، actions، `[loading]` (skeleton/spinner) |
| `app-details-grid` | key/value grid من `[items]`، بديل `<dl class="facts">` |
| `app-stat-card` | رقم + label + icon (عدد المقاطع، الحجم، …) |
| `app-skeleton` | `line / circle / rect` + shimmer |
| `app-status-badge` | موجود؛ يُنقل ويُضاف له icon + نبض لحالة processing |
| `app-empty-state` / `app-error-banner` | موجودان؛ يُضاف illustration/icon + action slot |
| `app-tabs` | wrapper على `mat-tab-group` بالثيم |
| `app-menu` | wrapper على `mat-menu` |
| `app-copy-button` | نسخ للحافظة مع toast |
| `app-file-icon` | أيقونة ملونة حسب النوع (pdf/docx/xlsx) |

قواعد التصميم:
- tokens فقط (لا ألوان ثابتة).
- radius و spacing scale موحّدان.
- touch targets ≥ 44px.
- `focus-visible` موحّد.
- `prefers-reduced-motion` يعطّل الحركة.

---

## 6. إعادة تصميم الشاشات

### 6.1 قائمة الملفات `/documents`
- `app-page-header`: "مستنداتي" + زر **رفع ملف** أساسي.
- الرفع: dropzone مضغوطة قابلة للطي فوق الجدول، أو dialog. التقدم يظهر في toast مستمر (`toast.loading` بنسبة %) بدل نص داخل الصفحة.
- `app-data-table`:
  - الأعمدة: name (مع file icon + note الخطأ)، type، uploaded، status badge، chunks.
  - Row actions: فتح، **اسأل عن هذا الملف** (يفتح chat)، حذف (confirm).
- Toolbar: فلتر status (chips: الكل / قيد المعالجة / مكتمل / فشل)؛ الـ API يدعم `status` حالياً. البحث بالاسم يحتاج endpoint، فهو مؤجل.
- Polling خفيف (`SKIP_GLOBAL_LOADING`) عند وجود ملفات `PROCESSING`.

### 6.2 تفاصيل الملف `/documents/:id`
```
┌ Page header ───────────────────────────────────────────────┐
│ ← المستندات   [pdf icon] report.pdf   [● مكتمل]             │
│                         [اسأل عن الملف] [⋮ نسخ الاسم | حذف] │
├ Stat cards ────────────────────────────────────────────────┤
│ [النوع PDF] [تاريخ الرفع] [عدد المقاطع 42] [عدد الأحرف 18k] │
├ Banner (فشل/متوقف) مع سبب واضح وإجراء ──────────────────────┤
├ Tabs ──────────────────────────────────────────────────────┤
│ [النص المستخرج] [المقاطع (42)]                              │
│  • النص: viewer بخط مريح، بحث داخل النص مع highlight،        │
│    نسخ، "عرض الكل"، أرقام صفحات إن وُجدت                     │
│  • المقاطع: app-data-table client-side (#، الموقع، المعاينة) │
│    مع فلتر نصي و expand للمعاينة الكاملة                     │
└────────────────────────────────────────────────────────────┘
```
- الحذف: من قائمة الـ header ← `ConfirmService` ← toast ← navigate. نحذف قسم "danger zone" الـ inline بالكامل.
- Loading: skeleton لنفس الـ layout (header + stats + tabs)، وليس نص "جاري التحميل".
- Not found / already deleted: `app-empty-state` مع زر رجوع.

### 6.3 Shell
- Topbar أوضح: brand، nav مع active indicator متحرك، user menu (`mat-menu`: اللغة، الثيم، تسجيل الخروج).
- `app-top-progress` أعلى الصفحة.
- Route transitions عبر View Transitions (fade/slide خفيف، يحترم RTL و reduced motion).

### 6.4 Chat و Auth
تطبيق الـ UI kit والـ mutation runner عليهما (sign-in/out، إرسال رسالة، حذف محادثة) دون تغيير منطق الـ store.

---

## 7. Animation & Micro-interactions

- **Presets** في `shared/animations`: `fade-in`, `slide-up`, `scale-in`, `stagger(n)` بقيم ثابتة (150–250ms، `cubic-bezier(.2,.8,.2,1)`).
- **Enter/leave**:
  - `animate.enter`/`animate.leave` للعناصر الشرطية (banners، rows المحذوفة، tabs content).
  - Dialogs وmenus تتحرك عبر CDK.
- **Feedback**:
  - hover/press على الأزرار.
  - نبض لـ badge `processing`.
  - shimmer للـ skeleton.
  - collapse ناعم للصف بعد حذفه من القائمة.
- `@media (prefers-reduced-motion: reduce)` يلغي كل ما سبق مركزياً.

---

## 8. مراحل التنفيذ

| # | المرحلة | المخرجات | يعتمد على |
|---|---|---|---|
| 0 ✅ | قرار + إعداد | ADR-019، تثبيت CDK/Material/lucide (بموافقتك)، Material theme من tokens، path aliases | — |
| 1 ✅ | Feedback & Loading infra | `LoadingService` + `loadingInterceptor` + HttpContext tokens، `app-top-progress`، `ConfirmService` + dialog، `createMutation`، global error toast | 0 |
| 2 ✅ | UI kit | button, icon-button, page-header, card, details-grid, stat-card, skeleton, tabs, menu, file-icon، ونقل status-badge/empty-state/error-banner إلى `shared/ui` | 0 |
| 3 ✅ | Data layer | `ResourceApi<T>`، `PaginatedStore<T>` (refactor لـ `DocumentsStore` بدون تغيير السلوك؛ الـ tests الحالية هي الحماية)، URL sync | — |
| 4 ✅ | Data table | `app-data-table` + column types + row actions + toolbar + responsive + tests | 2, 3 |
| 5 ✅ | Documents list | إعادة بناء الصفحة على الجدول، upload بـ toast progress، فلتر status، polling | 1, 4 |
| 6 ✅ | Document detail | header/stats/tabs/text viewer/chunks table/confirm delete/skeleton | 1, 2, 4 |
| 7 ✅ | Shell + Chat + Auth | user menu، transitions، تطبيق الـ kit والـ mutations | 1, 2 |
| 8 ✅ | Polish & QA | animations presets، reduced-motion، RTL/dark review، a11y audit، تحديث e2e، توثيق `shared/ui/README.md` و conventions | الكل |

المرحلتان 2 و 3 مستقلتان ويمكن تنفيذهما بالتوازي.

---

## 9. الاختبارات ومعايير القبول

- **Unit tests** جديدة:
  - `loadingInterceptor`: العدّاد، `SKIP_GLOBAL_LOADING`، الأخطاء.
  - `ConfirmService`: true/false/Esc.
  - `createMutation`: confirm مرفوض فلا طلب، نجاح، فشل، double-submit.
  - `app-data-table`: الحالات الأربع، sort/page outputs، actions visibility، custom cell.
  - `PaginatedStore`: نقل tests الـ store الحالية.
- **تحديث** `document-detail.spec.ts` لأن الـ inline confirm يُستبدل بالـ dialog.
- **e2e**: رفع ← ظهور في الجدول ← فتح التفاصيل ← حذف عبر dialog ← toast.

**معايير القبول:**
1. لا يوجد في أي component signal يدوي للـ loading أو try/catch + toast لـ mutation.
2. لا يوجد `<table>` خارج `shared/data-table`.
3. كل عملية حذف تمر عبر `ConfirmService`.
4. كل صفحة تبدأ بـ `app-page-header`.
5. تعمل الصفحات في ar/en و light/dark و 375px دون horizontal scroll.
6. `lint` + `typecheck` + `test` + e2e خضراء.

---

## 10. خارج النطاق (عمداً، لتجنب تعقيد Matrix)

- Permissions/models layer.
- Kanban/card views.
- Dynamic schema forms.
- Multi-app split.
- Grouping.
- Drag & drop rows.
- Export/print.

البنية (column config، `ResourceApi`، slots) تسمح بإضافتها لاحقاً دون إعادة كتابة.
