import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  fcfundSql?: ReturnType<typeof postgres>;
};

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/fcfund";

const client =
  globalForDb.fcfundSql ??
  postgres(connectionString, {
    max: process.env.NODE_ENV === "production" ? 5 : 1,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
  });

if (process.env.NODE_ENV !== "production") globalForDb.fcfundSql = client;

export const db = drizzle(client, { schema });
export { client as sqlClient };
