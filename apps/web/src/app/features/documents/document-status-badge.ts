import { Component, computed, inject, input } from '@angular/core';
import { LocaleService } from '../../core/i18n/locale.service';
import { Badge, type BadgeTone } from '../../shared/ui/badge/badge';
import type { DocumentState } from './document-state';

const TONES: Record<DocumentState, BadgeTone> = {
  processing: 'info',
  completed: 'success',
  failed: 'danger',
  stalled: 'warning',
};

/** A document's state as a word in a coloured pill (the generic `app-badge` with document wording). */
@Component({
  selector: 'app-status-badge',
  imports: [Badge],
  template: `<app-badge [tone]="tone()" [pulse]="state() === 'processing'">{{ label() }}</app-badge>`,
})
export class StatusBadge {
  readonly state = input.required<DocumentState>();
  private readonly locale = inject(LocaleService);
  protected readonly tone = computed(() => TONES[this.state()]);
  protected readonly label = computed(() => this.locale.t(`docs.state.${this.state()}`));
}
