import type { AttemptOutcome, AttemptRecorder } from "../../src/llm/types.js";
import type { ImportStore } from "../../src/store/types.js";

export class CrashError extends Error { constructor(method: string, nth: number) { super(`simulated crash before ${method} call ${nth}`); this.name = "CrashError"; } }

type Method = { [K in keyof ImportStore]: ImportStore[K] extends (...args: never[]) => unknown ? K : never }[keyof ImportStore];

/**
 * Wraps a store so that the nth matching call of `method` never runs and the process is "dead" from then on:
 * that call and every later store call throw CrashError. Resume tests then reopen the inner store.
 */
export function crashBefore<K extends Method>(inner: ImportStore, method: K, nth: number, matches: (args: Parameters<ImportStore[K]>) => boolean = () => true): ImportStore {
  let seen = 0; let dead = false;
  return new Proxy(inner, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (typeof value !== "function") return value;
      const fn = value as (...args: unknown[]) => unknown;
      return (...args: unknown[]) => {
        if (dead) throw new CrashError(String(prop), nth);
        if (prop === method && matches(args as Parameters<ImportStore[K]>)) { seen += 1; if (seen === nth) { dead = true; throw new CrashError(String(prop), nth); } }
        return fn.apply(target, args);
      };
    }
  });
}

export class StorageError extends Error { constructor(method: string) { super(`simulated storage failure in ${method}`); this.name = "StorageError"; } }

/** Wraps a store so the first matching call of `method` fails (the write does not happen) while the process stays alive and every later call works: a transient storage failure, not a crash. */
export function failOnce<K extends Method>(inner: ImportStore, method: K, matches: (args: Parameters<ImportStore[K]>) => boolean = () => true): ImportStore {
  let failed = false;
  return new Proxy(inner, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (typeof value !== "function") return value;
      const fn = value as (...args: unknown[]) => unknown;
      return (...args: unknown[]) => {
        if (!failed && prop === method && matches(args as Parameters<ImportStore[K]>)) { failed = true; throw new StorageError(String(prop)); }
        return fn.apply(target, args);
      };
    }
  });
}

/**
 * Wraps a store so the first attempt outcome matching `matches` fails to record while the process stays
 * alive: a transient storage failure on the ledger write itself, not a crash. Only `recorderFor` is
 * intercepted; every other method, and every attempt start, is the inner store's.
 */
export function failOutcomeOnce(inner: ImportStore, matches: (outcome: AttemptOutcome) => boolean = () => true): ImportStore {
  let failed = false;
  return new Proxy(inner, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (typeof value !== "function") return value;
      const fn = value as (...args: unknown[]) => unknown;
      if (prop !== "recorderFor") return (...args: unknown[]) => fn.apply(target, args);

      return (...args: unknown[]): AttemptRecorder => {
        const recorder = fn.apply(target, args) as AttemptRecorder;
        return {
          recordStart: (start) => recorder.recordStart(start),
          recordOutcome: async (outcome) => {
            if (!failed && matches(outcome)) { failed = true; throw new StorageError("recordOutcome"); }

            await recorder.recordOutcome(outcome);
          }
        };
      };
    }
  });
}
