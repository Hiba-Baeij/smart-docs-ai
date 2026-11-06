import { TestBed } from '@angular/core/testing';
import { AssistantMarkdown } from './assistant-markdown';

describe('AssistantMarkdown', () => {
  function render(content: string): HTMLElement {
    const fixture = TestBed.createComponent(AssistantMarkdown);
    fixture.componentRef.setInput('content', content);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders emphasis, lists and code blocks', () => {
    const root = render('**Answer**\n\n- one\n- two\n\n```js\nconst x = 1;\n```');
    expect(root.querySelector('strong')?.textContent).toBe('Answer');
    expect(root.querySelectorAll('li')).toHaveLength(2);
    expect(root.querySelector('pre code')?.textContent).toContain('const x = 1;');
  });

  it('keeps safe links while dropping script URLs, images and raw HTML', () => {
    const root = render('[source](https://example.com) [bad](javascript:alert(1)) ![pixel](https://evil.test/x) <img src=x onerror=alert(1)>');
    expect(root.querySelector('a[href="https://example.com"]')?.textContent).toBe('source');
    expect(root.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('[onerror]')).toBeNull();
  });

  it('preserves mixed Arabic and English text in its own direction context', () => {
    const root = render('راجع **Contract 2026** قبل الموافقة.');
    expect(root.querySelector('.markdown')?.getAttribute('dir')).toBe('auto');
    expect(root.querySelector('strong')?.textContent).toBe('Contract 2026');
  });
});
