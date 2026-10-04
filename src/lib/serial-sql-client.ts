import type { SqlClient } from "@/modules/accounts/repository";

/** Serialize queries on one transaction connection; unrelated pools can run in parallel. */
export function serialSqlClient(client: SqlClient): SqlClient & { drain(): Promise<void> } {
  let tail: Promise<void> = Promise.resolve();
  let failed = false;
  let failure: unknown;
  return {
    query<T extends Record<string, unknown>>(sql: string, params?: unknown[]) {
      const result = tail.then(() => {
        if (failed) throw failure;
        return client.query<T>(sql, params);
      });
      tail = result.then(() => undefined, (error: unknown) => {
        failed = true;
        failure = error;
      });
      return result;
    },
    async drain() {
      await tail;
      if (failed) throw failure;
    },
  };
}
