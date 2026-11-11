import type { Provider } from '@angular/core';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';

/**
 * Providers added to every unit test (angular.json → test → providersFile).
 *
 * Material waits for CSS `animationend` before it finishes opening or closing a dialog, and
 * jsdom never fires that event. With animations off, dialogs open and close at once in tests.
 */
const testProviders: Provider[] = [
  { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
];

export default testProviders;
