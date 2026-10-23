// The form behind Create draft and Create new version: nothing reaches the Backend until the
// admin confirms, and then it creates the Lesson and opens its editor. The caller gives the
// chapter, as a field to type or shown fixed, and what is said below it.
import {
  type CreateLessonRequest,
  lessonDetailSchema,
} from "@ez-dk-citizen/api-contracts/schemas";
import { type ReactNode, useEffect, useRef } from "react";

import {
  EditForm,
  type Field,
  type Values,
} from "../../../shared/components/EditForm";
import type { Call } from "../../../shared/lib/backend";

export function CreateLessonForm({
  call,
  request,
  onOpen,
  onClose,
  name,
  submitLabel,
  confirmMessage,
  fields = [],
  value = {},
  onChange = () => undefined,
  cancelMessage = null,
  children,
}: {
  call: Call;
  // What to create, from the typed values once the admin confirms; a refusal is shown in the form.
  request: (value: Values) => CreateLessonRequest;
  // Opens the created Lesson's editor.
  onOpen: (lessonId: number) => void;
  // Cancel, once nothing typed is left to lose or the admin agreed to discard it.
  onClose: () => void;
  name: string;
  submitLabel: string;
  confirmMessage: string;
  // The fields the admin types, if any, with their values held by the caller.
  fields?: Field[];
  value?: Values;
  onChange?: (value: Values) => void;
  // What Cancel would discard of the typed values; null closes at once.
  cancelMessage?: string | null;
  // Shown below the fields, such as where a typed chapter stands or what a new version copies.
  children: ReactNode;
}) {
  const form = useRef<HTMLFormElement>(null);

  // Starts on the first control the admin can use: a field, or else the submit.
  useEffect(
    () =>
      form.current
        ?.querySelector<HTMLElement>("input:not([readonly]), button")
        ?.focus(),
    [],
  );

  return (
    <EditForm
      ref={form}
      name={name}
      fields={fields}
      value={value}
      onChange={onChange}
      submitLabel={submitLabel}
      confirmMessage={confirmMessage}
      onSave={async (submitted) => {
        const created = await call(
          {
            method: "POST",
            path: "/api/admin/lessons",
            body: request(submitted),
          },
          lessonDetailSchema,
        );
        onOpen(created.id);
      }}
      onCancel={onClose}
      cancelMessage={cancelMessage}
    >
      {children}
    </EditForm>
  );
}
