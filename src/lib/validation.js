/**
 * Form validation, using the exact schemas the API enforces.
 *
 * The app does not keep its own copy of any rule. It imports the same Zod schemas the
 * server validates with, so a form cannot accept something the API will refuse — and a
 * rule changed in one place changes in both.
 *
 * Input is never rewritten to make it pass. What the merchant typed stays in the field,
 * and if it does not match the format they are told which characters are expected. The
 * value sent to the API is the schema's parsed output, not the raw text.
 */

/** First message per field, keyed by dotted path, ready to put under an input. */
export const fieldErrors = (issues) => {
  const errors = {};
  for (const issue of issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) errors[key] ??= 'This field is not accepted';
      continue;
    }
    const path = issue.path.join('.') || '_';
    errors[path] ??= issue.message;
  }
  return errors;
};

/**
 * Validates form values against a schema.
 *
 * @returns {{ ok: true, data: any, errors: {} } | { ok: false, data: null, errors: Record<string,string> }}
 */
export const check = (schema, values) => {
  const result = schema.safeParse(values);
  if (result.success) return { ok: true, data: result.data, errors: {} };
  return { ok: false, data: null, errors: fieldErrors(result.error.issues) };
};

/**
 * Merges server-side field errors with client-side ones.
 *
 * The server can refuse something the client cannot know about — an email already
 * registered, a slug taken a second ago — and those arrive in the same `{ path, message }`
 * shape, so they land under the same inputs.
 */
export const mergeErrors = (clientErrors, apiError) => ({
  ...(apiError?.fieldErrors ?? {}),
  ...clientErrors,
});
