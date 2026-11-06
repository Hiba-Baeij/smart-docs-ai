import { Component, computed, input } from '@angular/core';
import DOMPurify from 'dompurify';
import { Marked } from 'marked';

const markdown = new Marked({ async: false });
markdown.use({ renderer: { html: ({ text }) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;') } });

/** Assistant text is untrusted. Raw HTML is escaped, then generated HTML is allowlisted. */
@Component({
  selector: 'app-assistant-markdown',
  template: `<div class="markdown" dir="auto" [innerHTML]="safeHtml()"></div>`,
  styles: `
    .markdown { overflow-wrap: anywhere; }
    .markdown :where(p, ul, ol, blockquote, pre) { margin-block: 0.4rem; }
    .markdown :where(pre, code) { white-space: pre-wrap; overflow-wrap: anywhere; }
    .markdown pre { padding: 0.75rem; border-radius: 0.5rem; background: var(--surface-muted); overflow: auto; }
    .markdown a { color: var(--accent); text-decoration: underline; }
    .markdown a:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
  `,
})
export class AssistantMarkdown {
  readonly content = input.required<string>();
  protected readonly safeHtml = computed(() => {
    const html = markdown.parse(this.content()) as string;
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'a', 'h3', 'h4'],
      ALLOWED_ATTR: ['href', 'title'],
      ALLOW_DATA_ATTR: false,
    });
  });
}
