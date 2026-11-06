import { TestBed } from '@angular/core/testing';
import { toastState } from 'ngx-sonner';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  beforeEach(() => toastState.reset());
  afterEach(() => toastState.reset());

  it('replaces a loading toast with its result using one operation id', () => {
    const notifications = TestBed.inject(NotificationService);
    notifications.loading('upload-1', 'Uploading file');
    expect(toastState.toasts().filter((item) => item.id === 'upload-1')).toHaveLength(1);
    notifications.success('upload-1', 'File uploaded');
    const matching = toastState.toasts().filter((item) => item.id === 'upload-1');
    expect(matching).toHaveLength(1);
    expect(matching[0].type).toBe('success');
  });
});
