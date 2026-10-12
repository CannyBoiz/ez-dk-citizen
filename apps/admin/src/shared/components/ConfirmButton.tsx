// A button whose action first asks in the page, in the button's place, whenever there is
// something at stake to say. Cancel or Escape puts the button back and does nothing.
import { type ComponentProps, useEffect, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";

export function ConfirmButton({
  message,
  confirmLabel,
  onConfirm,
  ...button
}: Omit<ComponentProps<"button">, "type" | "onClick"> & {
  // What confirming would lose or change; null acts at once.
  message: string | null;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const messageId = useId();
  // Nothing at stake any more, say once the edits were saved: the button comes back.
  if (asking && message === null) setAsking(false);

  // Starts on Cancel, the choice that loses nothing.
  useEffect(() => {
    if (asking) cancelButton.current?.focus();
  }, [asking]);

  // The button comes back with focus, as after a browser dialog. Synchronously, so it is in
  // the page again before it takes focus.
  function close() {
    flushSync(() => setAsking(false));
    trigger.current?.focus();
  }

  if (!asking)
    return (
      <button
        type="button"
        ref={trigger}
        {...button}
        onClick={() => (message === null ? onConfirm() : setAsking(true))}
      />
    );
  return (
    <div
      role="alertdialog"
      aria-labelledby={messageId}
      onKeyDown={(event) => event.key === "Escape" && close()}
    >
      <p id={messageId}>{message}</p>
      {/* Disabled whenever the button it stands in for would be. */}
      <button
        type="button"
        className={button.className}
        disabled={button.disabled}
        onClick={() => {
          close();
          onConfirm();
        }}
      >
        {confirmLabel}
      </button>
      <button type="button" ref={cancelButton} onClick={close}>
        Cancel
      </button>
    </div>
  );
}
