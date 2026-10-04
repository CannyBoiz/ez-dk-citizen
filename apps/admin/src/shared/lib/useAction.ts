// One action at a time over a list of items: which item is in flight and which one last failed.
import { useState } from "react";

export function useAction<Key>() {
  const [pending, setPending] = useState<Key | null>(null);
  const [failure, setFailure] = useState<{ key: Key; error: unknown } | null>(null);

  async function run(key: Key, action: () => Promise<void>) {
    setFailure(null);
    setPending(key);
    try {
      await action();
    } catch (error) {
      setFailure({ key, error });
    } finally {
      setPending(null);
    }
  }

  return { pending, failure, run };
}
