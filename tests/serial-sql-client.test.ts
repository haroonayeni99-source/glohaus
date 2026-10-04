import { describe, expect, it, vi } from "vitest";
import type { SqlClient } from "@/modules/accounts/repository";
import { serialSqlClient } from "@/lib/serial-sql-client";

describe("transaction query serialization",()=>{
  it("keeps concurrent callers in order with at most one active query",async()=>{
    let active=0;let max=0;const order:string[]=[];
    const client:SqlClient={async query<T extends Record<string,unknown>>(sql:string){
      active++;max=Math.max(max,active);order.push(sql);
      await new Promise(resolve=>setTimeout(resolve,5));active--;
      return {rows:[{value:sql} as unknown as T]};
    }};
    const sql=serialSqlClient(client);
    const results=await Promise.all([sql.query("first"),sql.query("second"),sql.query("third")]);
    await sql.drain();
    expect(max).toBe(1);expect(order).toEqual(["first","second","third"]);
    expect(results[2].rows).toEqual([{value:"third"}]);
  });
  it("drains in-flight work before commit or rollback even if the caller forgets to await",async()=>{
    const query=vi.fn(async()=>{await new Promise(resolve=>setTimeout(resolve,10));return{rows:[]};});
    const sql=serialSqlClient({query} as SqlClient);
    void sql.query("pending");await sql.drain();expect(query).toHaveBeenCalledTimes(1);
  });
  it("fails closed and skips queued queries after the first database error",async()=>{
    const error=new Error("transaction failed");const query=vi.fn().mockRejectedValue(error);
    const sql=serialSqlClient({query});
    const results=await Promise.allSettled([sql.query("failure"),sql.query("skip")]);
    expect(results.every(result=>result.status==="rejected")).toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
    await expect(sql.drain()).rejects.toBe(error);
  });
});
