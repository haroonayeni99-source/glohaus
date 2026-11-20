import { expect, it } from "vitest";
import { ourWorkImmersiveEnabled } from "@/lib/our-work-immersive-rollout";
it("keeps the approved production view until an explicit rollout",()=>{
 expect(ourWorkImmersiveEnabled("test",{VERCEL_ENV:"production"})).toBe(false);
 expect(ourWorkImmersiveEnabled("test",{})).toBe(false);
 expect(ourWorkImmersiveEnabled("test",{VERCEL_ENV:"preview"})).toBe(true);
});
it("canaries only the exact selected public profile",()=>{
 const env={VERCEL_ENV:"production",OUR_WORK_IMMERSIVE_TEST_SLUGS:" test-studio, other "};
 expect(ourWorkImmersiveEnabled("test-studio",env)).toBe(true);
 expect(ourWorkImmersiveEnabled("test-studio-other",env)).toBe(false);
 expect(ourWorkImmersiveEnabled("other",env)).toBe(true);
 expect(ourWorkImmersiveEnabled("",env)).toBe(false);
});
it("allows rollout and an immediate kill switch without touching provider flags",()=>{
 expect(ourWorkImmersiveEnabled("any",{VERCEL_ENV:"production",OUR_WORK_IMMERSIVE_ENABLED:"true"})).toBe(true);
 expect(ourWorkImmersiveEnabled("test",{VERCEL_ENV:"production",OUR_WORK_IMMERSIVE_ENABLED:"false",OUR_WORK_IMMERSIVE_TEST_SLUGS:"test"})).toBe(false);
 expect(ourWorkImmersiveEnabled("test",{VERCEL_ENV:"preview",OUR_WORK_IMMERSIVE_ENABLED:"false"})).toBe(false);
});
