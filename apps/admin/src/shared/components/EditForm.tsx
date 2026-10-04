// The shared explicitly saved form behind every editable form in the Admin.
import { useId, useState, type SubmitEvent } from "react";

import { BffError } from "../lib/bff";
import { ErrorMessage } from "./ErrorMessage";

export type Values = Record<string, string>;
type Field = { name: string; label: string; kind: "number" | "text" | "textarea" };

// One explicitly saved form: client-side validation first, then backend field errors.
export function EditForm({
  name,
  fields,
  value,
  onChange,
  onSave,
  readOnly = false,
  submitLabel = "Save",
  status,
}: {
  name: string;
  fields: Field[];
  value: Values;
  onChange: (value: Values) => void;
  onSave: (value: Values) => Promise<void>;
  readOnly?: boolean;
  submitLabel?: string;
  status?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [invalid, setInvalid] = useState<Values>({});
  const id = useId();

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    const problems: Values = {};
    for (const { name, label, kind } of fields) {
      const field = value[name] ?? "";
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
