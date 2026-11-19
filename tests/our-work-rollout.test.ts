import { expect, it } from "vitest";
import { ourWorkViewerEnabled } from "@/lib/our-work-rollout";
it("keeps the approved production view until an explicit rollout",()=>{
 expect(ourWorkViewerEnabled("test",{VERCEL_ENV:"production"})).toBe(false);
 expect(ourWorkViewerEnabled("test",{})).toBe(false);
 expect(ourWorkViewerEnabled("test",{VERCEL_ENV:"preview"})).toBe(true);
});
it("canaries only the exact selected public profile",()=>{
 const env={VERCEL_ENV:"production",OUR_WORK_VIEWER_TEST_SLUGS:" test-studio, other "};
 expect(ourWorkViewerEnabled("test-studio",env)).toBe(true);
 expect(ourWorkViewerEnabled("test-studio-other",env)).toBe(false);
 expect(ourWorkViewerEnabled("other",env)).toBe(true);
 expect(ourWorkViewerEnabled("",env)).toBe(false);
});
it("allows rollout and an immediate kill switch without touching provider flags",()=>{
 expect(ourWorkViewerEnabled("any",{VERCEL_ENV:"production",OUR_WORK_VIEWER_ENABLED:"true"})).toBe(true);
 expect(ourWorkViewerEnabled("test",{VERCEL_ENV:"production",OUR_WORK_VIEWER_ENABLED:"false",OUR_WORK_VIEWER_TEST_SLUGS:"test"})).toBe(false);
 expect(ourWorkViewerEnabled("test",{VERCEL_ENV:"preview",OUR_WORK_VIEWER_ENABLED:"false"})).toBe(false);
});
