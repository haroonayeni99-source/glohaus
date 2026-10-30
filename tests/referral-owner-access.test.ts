import {beforeEach,describe,expect,it,vi} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
const mocks=vi.hoisted(()=>({access:vi.fn(),owner:vi.fn()}));
vi.mock("@/lib/page-access",()=>({pageAccount:mocks.access}));
vi.mock("@/modules/admin/repository",()=>({withOwner:mocks.owner}));
import Page from "@/app/admin/referrals/page";
beforeEach(()=>vi.resetAllMocks());
describe("referral dashboard permission boundary",()=>{
 it("does not fetch or render private data for a non-Owner",async()=>{mocks.access.mockResolvedValue({account:{roles:["customer"]}});const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({})}));expect(html).toContain("Owner access required");expect(mocks.owner).not.toHaveBeenCalled();});
 it("reports unavailable data rather than displaying estimated or zero performance figures",async()=>{mocks.access.mockResolvedValue({account:{roles:["owner"]}});mocks.owner.mockRejectedValue(new Error("database unavailable"));const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({})}));expect(html).toContain("No figures have been estimated");expect(html).not.toContain("<table");expect(html).not.toContain("database unavailable");});
});
