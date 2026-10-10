import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createTestDatabase } from "./test-database";
import { migrationPlan } from "../scripts/migration-plan.mjs";
import { enrolAccount, type SqlClient } from "@/modules/accounts/repository";
const db = await createTestDatabase();
const ids: Record<string,string> = {};
const migration = "20261010205110_timed_feature_votes.sql";
let legacyId: string;
async function asUser<T>(authId: string, work: (sql: SqlClient) => Promise<T>, verified = true) {
  return db.transaction(async sql => {
    await sql.exec("SET LOCAL ROLE beauty_app");
    await sql.query("SELECT set_config('app.auth_id',$1,true)", [authId]);
    if (verified) await sql.query("SELECT set_config('app.admin_verified','true',true)");
    return work(sql);
  });
}
async function create(days = 7) {
  return asUser("owner", async sql => (await sql.query<{id:string}>("SELECT beauty.owner_create_feature_request('all','Clearer booking','Make booking easier for everyone.',$1) AS id", [days])).rows[0].id);
}
async function vote(id: string, choice: string, who = "customer") {
  return asUser(who, async sql => (await sql.query<{result:{vote_count:number;dislike_count:number;total_count:number;my_choice:string|null;my_vote:boolean}}>("SELECT beauty.set_feature_vote($1,$2) AS result", [id,choice])).rows[0].result);
}
beforeAll(async () => {
  for (const item of await migrationPlan()) if (item.name !== migration) await db.exec(await readFile(item.url,"utf8"));
  for (const authId of ["owner","admin","customer","professional"]) {
    ids[authId] = (await asUser(authId, sql => enrolAccount(sql,{authId,email:`${authId}@example.test`,displayName:authId,secondFactorAge:null},"customer"),false)).id;
  }
  await db.query("INSERT INTO beauty.user_roles(user_id,role) VALUES($1,'owner'),($2,'admin'),($3,'professional')", [ids.owner,ids.admin,ids.professional]);
  legacyId=(await db.query<{id:string}>("INSERT INTO beauty.feature_requests(audience,title,description,created_at) VALUES('all','Existing idea','Preserve the existing vote totals.',now()-interval '1 day') RETURNING id")).rows[0].id;
  await db.query("INSERT INTO beauty.feature_votes(feature_id,user_id) VALUES($1,$2)", [legacyId,ids.customer]);
  await db.exec(await readFile(new URL(`../db/migrations/${migration}`,import.meta.url),"utf8"));
});
afterAll(() => db.close());
it("retains existing votes as Likes and gives existing ideas seven days from publication", async () => {
  const result=await asUser("customer",async sql=>(await sql.query("SELECT * FROM beauty.feature_vote_results() WHERE id=$1",[legacyId])).rows[0]);
  expect(result).toMatchObject({vote_count:1,dislike_count:0,total_count:1,my_choice:"like",voting_open:true});
  expect((await db.query<{days:number}>("SELECT (extract(epoch FROM closes_at-created_at)/86400)::integer AS days FROM beauty.feature_requests WHERE id=$1",[legacyId])).rows[0].days).toBe(7);
});
it("counts both choices, switches without double counting, and unselects without deleting rows", async () => {
  const id=await create();
  expect(await vote(id,"like")).toMatchObject({vote_count:1,dislike_count:0,total_count:1,my_choice:"like"});
  expect(await vote(id,"dislike","professional")).toMatchObject({vote_count:1,dislike_count:1,total_count:2,my_choice:"dislike",my_vote:false});
  expect(await vote(id,"dislike")).toMatchObject({vote_count:0,dislike_count:2,total_count:2});
  expect(await vote(id,"none")).toMatchObject({vote_count:0,dislike_count:1,total_count:1,my_choice:null});
  expect((await db.query("SELECT * FROM beauty.feature_votes WHERE feature_id=$1",[id])).rows).toHaveLength(2);
});
it("makes repeated explicit votes idempotent and never returns other voter identities", async () => {
  const id=await create(); await vote(id,"like"); expect(await vote(id,"like")).toMatchObject({vote_count:1,total_count:1});
  const rows=await asUser("professional",sql=>sql.query("SELECT * FROM beauty.feature_vote_results() WHERE id=$1",[id]));
  expect(rows.rows[0]).toMatchObject({vote_count:1,my_choice:null});
  expect(JSON.stringify(rows.rows)).not.toContain(ids.customer);
});
it("uses chosen duration and keeps the old three-argument publisher compatible", async () => {
  const id=await create(14);
  expect((await db.query<{days:number}>("SELECT (extract(epoch FROM closes_at-created_at)/86400)::integer AS days FROM beauty.feature_requests WHERE id=$1",[id])).rows[0].days).toBe(14);
  const old=await asUser("owner",sql=>sql.query("SELECT beauty.owner_create_feature_request('customer','Old client idea','Published from the previous release.') AS id"));
  expect(old.rows[0].id).toBeTruthy();
});
it.each([0,91,-1,1.5])( "rejects invalid duration %s", async days => { await expect(create(days)).rejects.toThrow(); });
it.each([["admin",true],["customer",true],["owner",false]] as const)("preserves Owner/MFA publishing protection for %s verified=%s", async (who,verified) => {
  await expect(asUser(who,sql=>sql.query("SELECT beauty.owner_create_feature_request('all','Denied idea','Must not publish without permission.',7)"),verified)).rejects.toThrow("FORBIDDEN");
});
it("blocks expired voting, including legacy toggles, and preserves the final results", async () => {
  const id=await create(); await vote(id,"dislike");
  await db.query("UPDATE beauty.feature_requests SET closes_at=clock_timestamp()-interval '1 second' WHERE id=$1",[id]);
  await expect(vote(id,"like")).rejects.toThrow("VOTING_CLOSED");
  await expect(asUser("customer",sql=>sql.query("SELECT beauty.toggle_feature_vote($1)",[id]))).rejects.toThrow("VOTING_CLOSED");
  expect((await asUser("customer",sql=>sql.query("SELECT * FROM beauty.feature_vote_results() WHERE id=$1",[id]))).rows[0]).toMatchObject({voting_open:false,dislike_count:1,total_count:1,my_choice:"dislike"});
});
it("blocks inactive and manually closed ideas and invalid choices", async () => {
  const id=await create(); await expect(vote(id,"invalid")).rejects.toThrow("INVALID_REQUEST");
  await db.query("UPDATE beauty.feature_requests SET status='closed' WHERE id=$1",[id]); await expect(vote(id,"like")).rejects.toThrow("VOTING_CLOSED");
  await db.query("UPDATE beauty.feature_requests SET active=false WHERE id=$1",[id]); await expect(vote(id,"like")).rejects.toThrow("NOT_FOUND");
});
it("supports old toggle clients while counting only Likes in their response", async () => {
  const id=await create(); await vote(id,"dislike");
  expect((await asUser("customer",sql=>sql.query("SELECT beauty.toggle_feature_vote($1) AS voted",[id]))).rows[0].voted).toBe(true);
  expect((await asUser("customer",sql=>sql.query("SELECT beauty.toggle_feature_vote($1) AS voted",[id]))).rows[0].voted).toBe(false);
});
it("denies unauthenticated calls and keeps tables and functions inaccessible to public API roles", async () => {
  await expect(vote(legacyId,"like","unknown")).rejects.toThrow("UNAUTHENTICATED");
  const acl=await db.query<{allowed:boolean}>("SELECT has_function_privilege('anon','beauty.set_feature_vote(uuid,text)','EXECUTE') OR has_function_privilege('authenticated','beauty.feature_vote_results()','EXECUTE') OR has_table_privilege('anon','beauty.feature_votes','SELECT') AS allowed");
  expect(acl.rows[0].allowed).toBe(false);
});
