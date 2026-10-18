import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  config: vi.fn(),
  attach: vi.fn(),
}));
vi.mock("pg", () => ({
  Pool: class {
    waitingCount = 0;
    on = vi.fn();
    connect = mocks.connect;
    constructor(config: unknown) {
      mocks.config(config);
    }
  },
}));
vi.mock("@vercel/functions", () => ({ attachDatabasePool: mocks.attach }));
import { withIdentity } from "@/lib/db";

function client() {
  return {
    on: vi.fn(),
    removeListener: vi.fn(),
    release: vi.fn(),
    query: vi.fn(async (sql: string) => ({
      rows: sql.includes("AS unsafe") ? [{ unsafe: false }] : [{ value: 1 }],
    })),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubEnv("DATABASE_URL", "postgres://test-only.invalid/database");
  delete (globalThis as { beautyPool?: unknown }).beautyPool;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it("reuses successful clients with a fresh transaction-local identity for each request", async () => {
  const connection = client();
  mocks.connect.mockResolvedValue(connection);
  await withIdentity("alice", (db) => db.query("SELECT 1"));
  await withIdentity("bob", (db) => db.query("SELECT 1"));
  expect(connection.release.mock.calls).toEqual([[false], [false]]);
  expect(connection.query).toHaveBeenCalledWith(
    "SELECT set_config('app.auth_id', $1, true)",
    ["alice"],
  );
  expect(connection.query).toHaveBeenCalledWith(
    "SELECT set_config('app.auth_id', $1, true)",
    ["bob"],
  );
  expect(
    connection.query.mock.calls.filter(([sql]) => sql === "BEGIN"),
  ).toHaveLength(2);
  expect(
    connection.query.mock.calls.filter(([sql]) => sql === "COMMIT"),
  ).toHaveLength(2);
  expect(mocks.config).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      max: 3,
      idleTimeoutMillis: 5000,
      connectionTimeoutMillis: 5000,
    }),
  );
  expect(mocks.attach).toHaveBeenCalledOnce();
});

it("discards failed clients after rollback and never retries an ordinary query failure", async () => {
  const connection = client();
  mocks.connect.mockResolvedValue(connection);
  const work = vi.fn(async () => {
    throw Object.assign(new Error("duplicate"), { code: "23505" });
  });
  await expect(withIdentity("alice", work)).rejects.toMatchObject({
    code: "23505",
  });
  expect(connection.query).toHaveBeenCalledWith("ROLLBACK");
  expect(connection.release).toHaveBeenCalledWith(true);
  expect(work).toHaveBeenCalledOnce();
});

it("recovers a timeout without logging it as a permanent outage", async () => {
  mocks.connect
    .mockRejectedValueOnce(new Error("timeout exceeded when trying to connect"))
    .mockResolvedValueOnce(client());
  const pending = withIdentity("alice", (db) => db.query("SELECT 1"));
  await vi.runAllTimersAsync();
  await pending;
  expect(mocks.connect).toHaveBeenCalledTimes(2);
  expect(console.warn).toHaveBeenCalledWith(
    "Database connection retry scheduled",
    expect.objectContaining({ reason: "TIMEOUT", attempt: 1 }),
  );
  expect(console.info).toHaveBeenCalledWith(
    "Database connection recovered",
    expect.objectContaining({ attempts: 2 }),
  );
  expect(console.error).not.toHaveBeenCalled();
});

it("stops after three failed connection attempts and returns a safe unavailable error", async () => {
  mocks.connect.mockRejectedValue(
    Object.assign(new Error("connect postgres://private:secret@host"), {
      code: "ECONNRESET",
    }),
  );
  const pending = expect(withIdentity("alice", vi.fn())).rejects.toMatchObject({
    code: "UNAVAILABLE",
    status: 503,
  });
  await vi.runAllTimersAsync();
  await pending;
  expect(mocks.connect).toHaveBeenCalledTimes(3);
  expect(console.error).toHaveBeenCalledWith(
    "Database connection unavailable",
    expect.objectContaining({ reason: "CONNECTION_CLOSED", attempt: 3 }),
  );
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
    "secret",
  );
});

it("does not retry rejected credentials or expose the provider message", async () => {
  mocks.connect.mockRejectedValue(
    Object.assign(new Error("password failed for private-user"), {
      code: "28P01",
    }),
  );
  await expect(withIdentity("alice", vi.fn())).rejects.toMatchObject({
    code: "UNAVAILABLE",
  });
  expect(mocks.connect).toHaveBeenCalledOnce();
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
    "private-user",
  );
});

it("does not replay a write when the connection drops during commit", async () => {
  const connection = client();
  const query = connection.query.getMockImplementation()!;
  connection.query.mockImplementation(async (sql: string) => {
    if (sql === "COMMIT")
      throw Object.assign(new Error("connection terminated"), {
        code: "08006",
      });
    return query(sql);
  });
  mocks.connect.mockResolvedValue(connection);
  const work = vi.fn(async () => "written");
  await expect(withIdentity("alice", work)).rejects.toMatchObject({
    code: "UNAVAILABLE",
  });
  expect(work).toHaveBeenCalledOnce();
  expect(connection.release).toHaveBeenCalledWith(true);
});

it("discards a client whose runtime role safety check fails", async () => {
  const connection = client();
  connection.query.mockResolvedValue({ rows: [{ unsafe: true }] });
  mocks.connect.mockResolvedValue(connection);
  const work = vi.fn();
  await expect(withIdentity("alice", work)).rejects.toMatchObject({
    code: "UNAVAILABLE",
  });
  expect(work).not.toHaveBeenCalled();
  expect(connection.release).toHaveBeenCalledWith(true);
});
