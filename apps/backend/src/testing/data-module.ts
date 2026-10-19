import type { DataModule } from "@ez-dk-citizen/data";

// Every operation throws unless overridden.
export function createTestDataModule(
  overrides: Partial<DataModule>,
): DataModule {
  return new Proxy(overrides as DataModule, {
    get: (target, name) =>
      Reflect.get(target, name) ??
      (() => Promise.reject(new Error("not used"))),
  });
}
