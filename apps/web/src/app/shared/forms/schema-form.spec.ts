import { z } from 'zod';
import { AppError } from '../../core/http/app-error';
import { createSchemaForm } from './schema-form';

describe('SchemaForm', () => {
  const schema = z.object({
    email: z.string().trim().min(1).pipe(z.email()),
    password: z.string().min(1),
  });

  function make(submit: (data: z.output<typeof schema>) => Promise<unknown>) {
    const host = document.createElement('div');
    host.innerHTML = '<input id="t-email" /><input id="t-password" />';
    document.body.append(host);
    const form = createSchemaForm({ id: 't', schema, initial: { email: '', password: '' }, submit });
    form.attach(host);
    return { form, host, remove: () => host.remove() };
  }

  it('builds one control per schema field, validated by that field', () => {
    const { form, remove } = make(() => Promise.resolve());

    expect(Object.keys(form.group.controls)).toEqual(['email', 'password']);
    expect(form.control('email').errors).toEqual({ schema: { kind: 'required' } });
    form.control('email').setValue('nope');
    expect(form.control('email').errors).toEqual({ schema: { kind: 'email' } });
    form.control('email').setValue('sara@example.com');
    expect(form.control('email').errors).toBeNull();
    remove();
  });

  it('names a missing field clearly', () => {
    const { form, remove } = make(() => Promise.resolve());
    expect(() => form.control('nope')).toThrow('has no field "nope"');
    remove();
  });

  it('does not send an invalid form, marks every field and focuses the first problem', async () => {
    const submit = vi.fn(() => Promise.resolve());
    const { form, host, remove } = make(submit);

    await form.submit();

    expect(submit).not.toHaveBeenCalled();
    expect(form.control('email').touched).toBe(true);
    expect(document.activeElement).toBe(host.querySelector('#t-email'));
    remove();
  });

  it('sends the parsed values', async () => {
    const submit = vi.fn(() => Promise.resolve());
    const { form, remove } = make(submit);
    form.group.setValue({ email: ' sara@example.com ', password: ' p ' });

    await form.submit();

    expect(submit).toHaveBeenCalledWith({ email: 'sara@example.com', password: ' p ' });
    expect(form.submitting()).toBe(false);
    remove();
  });

  it('puts server field errors on their controls and keeps unknown ones for the form', async () => {
    const { form, remove } = make(() =>
      Promise.reject(
        new AppError('VALIDATION_FAILED', 'x', 422, {
          email: ['taken'],
          userId: ['should not exist'],
        }),
      ),
    );
    form.group.setValue({ email: 'sara@example.com', password: 'p' });

    await form.submit();

    expect(form.control('email').errors).toEqual({
      server: { detail: 'taken', field: 'email' },
    });
    expect(form.errors()).toEqual([{ detail: 'should not exist', field: 'userId' }]);
    remove();
  });

  it('shows a form message for a failure that has no field', async () => {
    const { form, remove } = make(() => Promise.reject(new AppError('NETWORK', 'x', 0)));
    form.group.setValue({ email: 'sara@example.com', password: 'p' });

    await form.submit();

    expect(form.errors()).toEqual([{ key: 'error.network' }]);
    remove();
  });
});
