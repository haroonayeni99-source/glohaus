import { afterAll, beforeAll, expect, it } from "vitest";
import { createTestDatabase, applyTestMigrations } from "./test-database";
const db=await createTestDatabase();
beforeAll(()=>applyTestMigrations(db));afterAll(()=>db.close());
it("adds category, speciality and service-template definitions without assigning professional specialities",async()=>{
 const result=await db.query<{name:string;template:string}>("SELECT s.name,t.name AS template FROM beauty.specialities s JOIN beauty.service_templates t ON t.speciality_id=s.id JOIN beauty.platform_categories c ON c.id=s.category_id WHERE c.taxonomy_key='hair' AND t.slug IN('knotless-braids','retwist') ORDER BY t.slug");
 expect(result.rows).toEqual([{name:"Braiding",template:"Knotless Braids"},{name:"Locs",template:"Retwist"}]);
 expect((await db.query("SELECT * FROM beauty.professional_specialities")).rows).toHaveLength(0);
});
