// The shared explicitly saved form behind every editable form in the Admin.
import { type SubmitEvent, useId, useState } from "react";

import { BackendError } from "../lib/backend";
import { ConfirmButton } from "./ConfirmButton";
import { ErrorMessage } from "./ErrorMessage";

export type Values = Record<string, string>;
// Validation messages keyed by field name.
export type FieldErrors = Record<string, string>;
export type Field = {
  name: string;
  label: string;
  kind: "number" | "text" | "textarea" | "url" | "date";
  // A blank optional field passes validation; the caller decides what blank means.
  optional?: boolean;
};

// A field's own check: a message, or undefined when the value passes.
export function fieldProblem({ label, kind, optional }: Field, value = "") {
  if (optional && !value.trim()) return;
  if (kind === "number" ? !/^[1-9]\d*$/.test(value) : !value.trim())
    return kind === "number"
      ? `${label} must be a positive whole number.`
      : `${label} must not be blank.`;
}

// One explicitly saved form: client-side validation first, then backend field errors.
// Without onSave it has no Save of its own, as when another form's Save sends its fields.
export function EditForm({
  name,
  fields,
  value,
  onChange,
  onSave,
  validate,
  errors,
  readOnly = false,
  submitLabel = "Save",
  status,
  className,
  confirmMessage,
}: {
  name: string;
  fields: Field[];
  value: Values;
  onChange: (value: Values) => void;
  onSave?: (value: Values) => Promise<void>;
  // Cross-field checks, run after each field's own check; returns messages by field name.
  validate?: (value: Values) => FieldErrors;
  // Messages from checks made elsewhere, shown on the fields this form has no message for.
  errors?: FieldErrors;
  readOnly?: boolean;
  submitLabel?: string;
  status?: string;
  // Extra layout class for the form, such as "inline-form".
  className?: string;
  // Asked in the page once the fields pass their checks, before anything is saved.
  confirmMessage?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [invalid, setInvalid] = useState<FieldErrors>({});
  const id = useId();

  // Shows every failed check; true when the form may be saved.
  function check() {
    // A field's own check takes precedence over a cross-field message for that field.
    const problems: FieldErrors = { ...validate?.(value) };
    for (const field of fields) {
      const problem = fieldProblem(field, value[field.name]);
      if (problem) problems[field.name] = problem;
    }
    setInvalid(problems);
    setError(null);
    return Object.keys(problems).length === 0;
  }

  async function save() {
    setBusy(true);
    try {
      await onSave?.(value);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    // A form that asks first saves only through its confirmation, never on Enter.
    if (onSave && !confirmMessage && check()) await save();
  }

  return (
    <form
      aria-label={name}
      className={className ? `card ${className}` : "card"}
      noValidate
      onSubmit={submit}
    >
      {status && (
        <p className="form-status" data-state={status}>
          {status}
        </p>
      )}
      {fields.map((field) => {
        const message =
          invalid[field.name] ??
          // A field nested in the request, such as ["text", "title"], is named by its last segment.
          (error instanceof BackendError
            ? error.errors?.find((entry) => entry.path.at(-1) === field.name)
                ?.message
            : undefined) ??
          errors?.[field.name];
        const props = {
          id: `${id}-${field.name}-control`,
          value: value[field.name] ?? "",
          readOnly: readOnly || busy,
          "aria-invalid": message !== undefined,
          "aria-describedby":
            message === undefined ? undefined : `${id}-${field.name}`,
          onChange: (event: { target: { value: string } }) =>
            onChange({ ...value, [field.name]: event.target.value }),
        };
        return (
          <div key={field.name}>
            <label htmlFor={props.id}>
              {field.label}
              {field.kind === "textarea" ? (
                <textarea rows={12} {...props} />
              ) : (
                <input type={field.kind} {...props} />
              )}
            </label>
            {message !== undefined && (
              <span className="field-error" id={`${id}-${field.name}`}>
                {message}
              </span>
            )}
          </div>
        );
      })}
      {!readOnly &&
        onSave &&
        (confirmMessage ? (
          // Checked again on confirming, in case a field changed while it asked.
          <ConfirmButton
            disabled={busy}
            message={confirmMessage}
            confirmLabel={submitLabel}
            canOpen={check}
            onConfirm={() => (check() ? save() : undefined)}
          >
            {submitLabel}
          </ConfirmButton>
        ) : (
          <button type="submit" disabled={busy}>
            {submitLabel}
          </button>
        ))}
      {error !== null && <ErrorMessage error={error} />}
    </form>
  );
}
