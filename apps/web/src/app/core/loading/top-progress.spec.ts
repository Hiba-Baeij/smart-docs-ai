import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LoadingService } from './loading.service';
import { MIN_VISIBLE_MS, SHOW_DELAY_MS, TopProgress } from './top-progress';

describe('TopProgress', () => {
  let loading: LoadingService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    loading = TestBed.inject(LoadingService);
  });

  afterEach(() => vi.useRealTimers());

  function render() {
    const fixture = TestBed.createComponent(TopProgress);
    fixture.detectChanges();
    const bar = () => (fixture.nativeElement as HTMLElement).querySelector('mat-progress-bar');
    /** Lets the effect see the latest state first, then lets time pass. */
    const tick = (ms: number) => {
      fixture.detectChanges();
      vi.advanceTimersByTime(ms);
      fixture.detectChanges();
    };
    return { fixture, bar, tick };
  }

  it('does not show for a request shorter than the delay, so fast calls do not flicker', () => {
    const { bar, tick } = render();
    const end = loading.start();
    tick(SHOW_DELAY_MS - 50);

    end();
    tick(SHOW_DELAY_MS);

    expect(bar()).toBeNull();
  });

  it('shows after the delay while work is still running, with a label', () => {
    const { bar, tick } = render();
    loading.start();
    tick(0);
    tick(SHOW_DELAY_MS);

    expect(bar()).not.toBeNull();
    expect(bar()!.getAttribute('aria-label')).toBe('Loading');
  });

  it('stays visible for the minimum time once shown, then hides', () => {
    const { bar, tick } = render();
    const end = loading.start();
    tick(0);
    tick(SHOW_DELAY_MS);

    end();
    tick(MIN_VISIBLE_MS - 100);
    expect(bar()).not.toBeNull();

    tick(100);
    expect(bar()).toBeNull();
  });
});
