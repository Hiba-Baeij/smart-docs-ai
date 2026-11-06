import { Injectable } from '@angular/core';
import { toast } from 'ngx-sonner';

/** Stable operation IDs update one toast instead of stacking duplicate progress messages. */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  loading(id: string, message: string): void {
    toast.loading(message, { id, duration: Infinity });
  }

  success(id: string, message: string): void {
    toast.success(message, { id, duration: 4000 });
  }

  error(id: string, message: string): void {
    toast.error(message, { id, duration: 6000, important: true });
  }

  info(id: string, message: string): void {
    toast.info(message, { id, duration: 4000 });
  }

  clear(): void {
    toast.dismiss();
  }

  dismiss(id: string): void {
    toast.dismiss(id);
  }
}
