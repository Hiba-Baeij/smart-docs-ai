import type { ValidationError } from 'class-validator';

/**
 * Flattens class-validator errors into the envelope's `details`: field path -> messages.
 * Only the property name and the constraint messages are read; the rejected value is never
 * copied, so a bad password cannot end up in an error response.
 */
export function toValidationDetails(
  errors: ValidationError[],
): Record<string, string[]> {
  const details: Record<string, string[]> = {};

  const visit = (error: ValidationError, parentPath: string): void => {
    const path = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    if (error.constraints) {
      details[path] = Object.values(error.constraints);
    }
    for (const child of error.children ?? []) {
      visit(child, path);
    }
  };

  for (const error of errors) {
    visit(error, '');
  }

  return Object.keys(details).length > 0
    ? details
    : { body: ['Invalid request body.'] };
}
