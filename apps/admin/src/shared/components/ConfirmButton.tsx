// A button whose action first asks in the page, in the button's place, whenever there is
// something at stake to say. Cancel or Escape puts the button back and does nothing. An action
// that answers with a promise keeps the confirmation open until it settles, and a refusal is
// shown inside it, so the admin can retry or cancel.
import {
  type ComponentProps,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";

import { BffError } from "../lib/bff";
import { ErrorMessage } from "./ErrorMessage";

export function ConfirmButton({
  message,
  details,
  confirmLabel,
  confirmDisabled = false,
  canOpen,
  onOpen,
  onConfirm,
  ...button
}: Omit<ComponentProps<"button">, "type" | "onClick"> & {
  // What confirming would lose or change; null acts at once.
  message: string | null;
  // Shown below the message, such as a choice the action needs.
  details?: ReactNode;
  confirmLabel: string;
  // Holds the confirm button back, such as until a choice is made.
  confirmDisabled?: boolean;
  // Asked before the confirmation opens; false leaves the button, as when a form fails its checks.
  canOpen?: () => boolean;
  // Runs each time the confirmation opens, such as to read what it shows afresh.
  onOpen?: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const messageId = useId();
  // Nothing at stake any more, say once the edits were saved: the button comes back.
  if (asking && message === null) setAsking(false);

  // Starts on Cancel, the choice that loses nothing.
  useEffect(() => {
    if (asking) cancelButton.current?.focus();
  }, [asking]);

  function open() {
    if (canOpen?.() === false) return;
    if (message === null) return void onConfirm();
    setFailure(null);
    setAsking(true);
    onOpen?.();
  }

  // The button comes back with focus, as after a browser dialog. Synchronously, so it is in
  // the page again before it takes focus.
  function close() {
    flushSync(() => setAsking(false));
    trigger.current?.focus();
  }

  async function confirm() {
    setFailure(null);
    setPending(true);
    try {
      // A plain action puts the button back at once; one that answers with a promise keeps
      // the confirmation open while it runs.
      const outcome = onConfirm();
      if (outcome === undefined) return close();
      await outcome;
      close();
    } catch (error) {
      setFailure(error);
    } finally {
      setPending(false);
    }
  }

  if (!asking)
    return <button type="button" ref={trigger} {...button} onClick={open} />;
  return (
    <div
      role="alertdialog"
      aria-labelledby={messageId}
      onKeyDown={(event) => event.key === "Escape" && !pending && close()}
    >
      <p id={messageId}>{message}</p>
      {details}
      {failure !== null && (
        <ErrorMessage error={failure}>
          {/* The backend's reasons, such as each unmet publication prerequisite. */}
          {failure instanceof BffError && !!failure.errors?.length && (
            <ul>
              {failure.errors.map((entry) => (
                <li key={entry.path.join(".")}>{entry.message}</li>
              ))}
            </ul>
          )}
        </ErrorMessage>
      )}
      {/* Disabled whenever the button it stands in for would be, until the caller allows
          confirming, and while the action runs. */}
      <button
        type="button"
        className={button.className}
        disabled={button.disabled || confirmDisabled || pending}
        onClick={() => void confirm()}
      >
        {confirmLabel}
      </button>
      <button
        type="button"
        ref={cancelButton}
        disabled={pending}
        onClick={close}
      >
        Cancel
      </button>
    </div>
  );
}
