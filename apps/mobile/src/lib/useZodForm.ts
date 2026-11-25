import { useCallback, useState } from 'react';
import type { ZodType } from 'zod';

type Errors<T> = Partial<Record<keyof T & string, string>>;

/**
 * Tiny form state helper around a zod schema. `submit` validates and calls `onValid` with the
 * parsed (and transformed) output; field errors are keyed by the first path segment.
 */
export function useZodForm<TIn extends Record<string, unknown>, TOut = TIn>(
  schema: ZodType<TOut, unknown>,
  initial: TIn,
) {
  const [values, setValues] = useState<TIn>(initial);
  const [errors, setErrors] = useState<Errors<TIn>>({});
  const [submitting, setSubmitting] = useState(false);

  const set = useCallback(<K extends keyof TIn & string>(key: K, value: TIn[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  }, []);

  const validate = useCallback((): TOut | null => {
    const result = schema.safeParse(values);
    if (result.success) {
      setErrors({});
      return result.data;
    }
    const next: Errors<TIn> = {};
    for (const issue of result.error.issues) {
      const key = String(issue.path[0] ?? '') as keyof TIn & string;
      if (key && !next[key]) next[key] = issue.message;
    }
    setErrors(next);
    return null;
  }, [schema, values]);

  const submit = useCallback(
    async (onValid: (data: TOut) => Promise<void> | void) => {
      const data = validate();
      if (!data) return false;
      setSubmitting(true);
      try {
        await onValid(data);
        return true;
      } finally {
        setSubmitting(false);
      }
    },
    [validate],
  );

  return { values, set, setValues, errors, setErrors, validate, submit, submitting };
}
