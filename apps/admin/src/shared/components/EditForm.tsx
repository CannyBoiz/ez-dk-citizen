// The shared explicitly saved form behind every editable form in the Admin.
import { useId, useState, type SubmitEvent } from "react";

import { BffError } from "../lib/bff";
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

// One explicitly saved form: client-side validation first, then backend field errors.
export function EditForm({
  name,
  fields,
  value,
  onChange,
  onSave,
  validate,
  readOnly = false,
  submitLabel = "Save",
  status,
}: {
  name: string;
  fields: Field[];
  value: Values;
  onChange: (value: Values) => void;
  onSave: (value: Values) => Promise<void>;
  // Cross-field checks, run after each field's own check; returns messages by field name.
  validate?: (value: Values) => FieldErrors;
  readOnly?: boolean;
  submitLabel?: string;
  status?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [invalid, setInvalid] = useState<FieldErrors>({});
  const id = useId();

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    // A field's own check takes precedence over a cross-field message for that field.
    const problems: FieldErrors = { ...validate?.(value) };
    for (const { name, label, kind, optional } of fields) {
      const field = value[name] ?? "";
      if (optional && !field.trim()) continue;
      if (kind === "number" ? !/^[1-9]\d*$/.test(field) : !field.trim())
        problems[name] =
          kind === "number" ? `${label} must be a positive whole number.` : `${label} must not be blank.`;
    }
    setInvalid(problems);
    setError(null);
    if (Object.keys(problems).length) return;
    setBusy(true);
    try {
      await onSave(value);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form aria-label={name} noValidate onSubmit={submit}>
      {status && <p>{status}</p>}
      {fields.map((field) => {
        const message =
          invalid[field.name] ??
          (error instanceof BffError
            ? error.errors?.find((entry) => entry.path[0] === field.name)?.message
            : undefined);
        const props = {
          value: value[field.name] ?? "",
          readOnly: readOnly || busy,
          "aria-invalid": message !== undefined,
          "aria-describedby": message === undefined ? undefined : `${id}-${field.name}`,
          onChange: (event: { target: { value: string } }) =>
            onChange({ ...value, [field.name]: event.target.value }),
        };
        return (
          <div key={field.name}>
            <label>
              {field.label}
              {field.kind === "textarea" ? (
                <textarea rows={12} {...props} />
              ) : (
                <input type={field.kind} {...props} />
              )}
            </label>
            {message !== undefined && <span id={`${id}-${field.name}`}>{message}</span>}
          </div>
        );
      })}
      {!readOnly && (
        <button type="submit" disabled={busy}>
          {submitLabel}
        </button>
      )}
      {error !== null && <ErrorMessage error={error} />}
    </form>
  );
}
