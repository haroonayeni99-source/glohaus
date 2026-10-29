import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { ProfessionalPolicySummary } from "@/components/professional-policy-summary";
import { defaultPolicy, type PolicyPreview } from "@/modules/policies/domain";
afterEach(()=>vi.unstubAllGlobals());
it("itemises the referral discount alongside the exact fee and total due",()=>{
 vi.stubGlobal("React",React);
 const policy:PolicyPreview={token:"fixture",generalVersionId:null,serviceVersionId:null,rules:defaultPolicy,generalCustomRules:"",serviceCustomRules:"",timezone:"Europe/London",pricePence:5000,depositPence:1500,bookingFeePence:100,standardFeePence:150,referralDiscountPence:50,referralPromotionEligible:true,fullPrepayment:false,publishedAt:null};
 const html=renderToStaticMarkup(React.createElement(ProfessionalPolicySummary,{policy}));
 expect(html).toContain("First-booking referral discount −£0.50");
 expect(html).toContain("Your booking fee £1.00");
 expect(html).toContain("£16.00");
 expect(html).toContain("Standard booking fee £1.50");
});
