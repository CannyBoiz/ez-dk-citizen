// A button replaced by what it opens, such as a confirmation or a form, gets focus back when that
// closes, as after a browser dialog.
import { useRef } from "react";
import { flushSync } from "react-dom";

export function useReturnFocus() {
  const opener = useRef<HTMLButtonElement>(null);

  // Closes synchronously, so the button is in the page again before it takes focus.
  function returnFocus(close: () => void) {
    flushSync(close);
    opener.current?.focus();
  }

  return { opener, returnFocus };
}
