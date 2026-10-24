// @vitest-environment jsdom
import {afterEach,expect,it,vi} from "vitest";
import {createClient} from "@/lib/supabase/client";
const factory=vi.hoisted(()=>vi.fn(()=>({auth:{}})));
vi.mock("@supabase/ssr",()=>({createBrowserClient:factory}));
afterEach(()=>{document.getElementById("glohaus-public-configuration")?.remove();factory.mockClear();});
it.each(["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY","NEXT_PUBLIC_SUPABASE_ANON_KEY"])("creates the browser client from runtime URL and %s",key=>{const element=document.createElement("script");element.type="application/json";element.id="glohaus-public-configuration";element.textContent=JSON.stringify({NEXT_PUBLIC_SUPABASE_URL:"https://runtime-fixture.invalid",[key]:"public-fixture-not-a-secret"});document.head.append(element);createClient();expect(factory).toHaveBeenCalledWith("https://runtime-fixture.invalid","public-fixture-not-a-secret");});
