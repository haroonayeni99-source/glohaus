// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProfessionalPolicyEditor } from "@/components/professional-policy-editor";
import { BookingPicker } from "@/components/booking-picker";
import { ProfessionalPolicySummary } from "@/components/professional-policy-summary";
import { AdminProfessionalPolicies } from "@/components/admin-professional-policies";
import {
  defaultPolicy,
  type PolicyPreview,
  type PolicyWorkspace,
} from "@/modules/policies/domain";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    React.createElement("a", props, children),
}));
vi.mock("next/image", () => ({
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) =>
    React.createElement("img", { ...props, alt }),
}));
let root: Root;
let container: HTMLDivElement;
const fetchMock = vi.fn();
const serviceId = "11111111-1111-4111-8111-111111111111";
const workspace: PolicyWorkspace = {
  scopes: [],
  versions: [],
  services: [{ id: serviceId, name: "Manicure" }],
};
const policy: PolicyPreview = {
  token: "a".repeat(32),
  generalVersionId: null,
  serviceVersionId: null,
  rules: defaultPolicy,
  generalCustomRules: "",
  serviceCustomRules: "",
  timezone: "Europe/London",
  pricePence: 5000,
  depositPence: 1500,
  bookingFeePence: 100,
  fullPrepayment: false,
  publishedAt: null,
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock
    .mockReset()
    .mockImplementation(async () => Response.json({ saved: true }));
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function render(node: React.ReactNode) {
  await act(async () => root.render(node));
}
async function click(text: string) {
  const button = [...container.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === text,
  )!;
  expect(button).toBeTruthy();
  await act(async () => button.click());
}
async function select(element: HTMLSelectElement, value: string) {
  await act(async () => {
    element.value = value;
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
it("warns before discarding an unsaved policy and removes the warning after a successful save", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  await render(
    React.createElement(ProfessionalPolicyEditor, { data: workspace }),
  );
  const grace = container.querySelectorAll("select")[1];
  await select(grace, "15");
  expect(container.textContent).toContain("You have unsaved changes.");
  const unload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  await select(container.querySelector("select")!, serviceId);
  expect(confirm).toHaveBeenCalled();
  expect(grace.value).toBe("15");
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
    serviceId: null,
    action: "save",
    expectedRevision: 0,
    policy: { graceMinutes: 15 },
  });
  expect(container.textContent).toContain("Draft saved.");
  expect(container.textContent).not.toContain("You have unsaved changes.");
});
it("requires the publication dialog and creates no request when publication is cancelled", async () => {
  await render(
    React.createElement(ProfessionalPolicyEditor, { data: workspace }),
  );
  await click("Publish policies");
  expect(container.querySelector("dialog")?.hasAttribute("open")).toBe(true);
  expect(fetchMock).not.toHaveBeenCalled();
  await click("Cancel");
  expect(container.querySelector("dialog")?.hasAttribute("open")).toBe(false);
  expect(fetchMock).not.toHaveBeenCalled();
});
it("shows accepted policies with unchecked acknowledgements and resets them on a stale checkout", async () => {
  const startsAt = new Date(Date.now() + 3 * 86400000).toISOString();
  const earlyServiceBefore = new Date(Date.now() + 15 * 86400000).toISOString();
  fetchMock.mockImplementation(async (url: string) =>
    url.includes("/policies?")
      ? Response.json({ policy, earlyServiceBefore })
      : url.includes("/availability?")
        ? Response.json({ slots: [startsAt] })
        : Response.json(
            {
              error: {
                code: "POLICY_CHANGED",
                message: "Review the latest booking terms.",
              },
            },
            { status: 409 },
          ),
  );
  await render(
    React.createElement(BookingPicker, {
      services: [
        {
          id: serviceId,
          professional_id: "pro",
          name: "Manicure",
          description: "",
          duration_minutes: 60,
          price_pence: 5000,
          deposit_pence: 2000,
        },
      ],
      ready: true,
      returnPath: "/p/studio",
      professionalName: "Studio",
      bookingFeePence: 100,
      verificationStatus: "verified",
      initialSelection: { serviceId, date: startsAt.slice(0, 10), startsAt },
    }),
  );
  await click("Continue");
  const checkboxes = [
    ...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
  ];
  expect(checkboxes).toHaveLength(2);
  expect(checkboxes.every((c) => !c.checked)).toBe(true);
  const pay = container.querySelector<HTMLButtonElement>(
    ".booking-pay-button",
  )!;
  expect(pay.disabled).toBe(true);
  expect(pay.textContent).toContain("£16.00");
  await act(async () => checkboxes[0].click());
  expect(pay.disabled).toBe(true);
  await act(async () => checkboxes[1].click());
  expect(pay.disabled).toBe(false);
  await act(async () => pay.click());
  expect(
    container.querySelector<HTMLButtonElement>(".booking-pay-button")!.disabled,
  ).toBe(true);
  expect(
    [
      ...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ].every((c) => !c.checked),
  ).toBe(true);
  const post = fetchMock.mock.calls.find((call) => call[1]?.method === "POST")!;
  expect(JSON.parse(post[1].body)).toMatchObject({
    policyToken: policy.token,
    acceptPolicy: true,
    earlyServiceRequested: true,
  });
});
it("requires an Admin review reason before opening a consequential confirmation", async () => {
  await render(
    React.createElement(AdminProfessionalPolicies, {
      initial: {
        versions: [
          {
            id: "v1",
            scope_id: "scope",
            version: 1,
            content: defaultPolicy,
            created_at: "2026-10-14T10:00:00Z",
            published_at: null,
            review_status: "pending",
            review_reason: null,
            professional_id: "pro",
            professional_name: "Studio",
            service_name: null,
            current: false,
          },
        ],
        bookings: [],
        retentions: [],
        audit: [],
        disputes: [],
      },
    }),
  );
  await click("Approve publication");
  expect(container.textContent).toContain("Enter a review reason");
  expect(container.querySelector("dialog")?.hasAttribute("open")).toBe(false);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("updates full-payment totals, clears acceptance and submits the chosen mode",async()=>{
 const startsAt=new Date(Date.now()+20*86400000).toISOString();
 let resolveFull:((r:Response)=>void)|undefined;
 fetchMock.mockImplementation(async(url:string)=>{
   if(url.includes("/availability?"))return Response.json({slots:[startsAt]});
   if(url.includes("/policies?")){
     if(url.includes("paymentChoice=full"))return new Promise<Response>(resolve=>{resolveFull=resolve;});
     return Response.json({policy:{...policy,paymentChoice:"deposit",paymentRequirement:"deposit_or_full",requiredDepositPence:1500},earlyServiceBefore:new Date().toISOString()});
   }
   return Response.json({error:{message:"Isolated checkout captured"}},{status:409});
 });
 await render(React.createElement(BookingPicker,{services:[{id:serviceId,professional_id:"pro",name:"Manicure",description:"",duration_minutes:60,price_pence:5000,deposit_pence:1500}],ready:true,returnPath:"/p/studio",professionalName:"Studio",bookingFeePence:100,verificationStatus:"verified",initialSelection:{serviceId,date:startsAt.slice(0,10),startsAt}}));
 await click("Continue");
 await act(async()=>container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
 await act(async()=>container.querySelector<HTMLInputElement>('input[value="full"]')!.click());
 expect(container.querySelector<HTMLButtonElement>('.booking-pay-button')!.disabled).toBe(true);
 expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false);
 await act(async()=>resolveFull!(Response.json({policy:{...policy,depositPence:5000,fullPrepayment:true,paymentChoice:"full",paymentRequirement:"deposit_or_full",requiredDepositPence:1500,fullPaymentReason:"customer"},earlyServiceBefore:new Date().toISOString()})));
 expect(container.querySelector('.booking-pay-button')!.textContent).toContain("£51.00");
 expect(container.querySelector('.payment-summary-balance')!.textContent).toContain("£0.00");
 await act(async()=>container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
 await act(async()=>container.querySelector<HTMLButtonElement>('.booking-pay-button')!.click());
 const post=fetchMock.mock.calls.find(c=>c[1]?.method==="POST")!;expect(JSON.parse(post[1].body)).toMatchObject({paymentChoice:"full",policyToken:policy.token});
});

it("shows the full-payment requirement when Admin previews a published policy version",async()=>{
 await render(React.createElement(ProfessionalPolicySummary,{showPrice:false,policy:{...policy,rules:{...defaultPolicy,paymentRequirement:"full"}}}));
 expect(container.textContent).toContain("Full payment online is required before the appointment.");
});
