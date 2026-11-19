import test from "node:test";
import assert from "node:assert/strict";
import { paths, inspect, incidentBody } from "../scripts/quality-control-monitor.mjs";

const response = (status = 200) => new Response("<main>Public fixture</main>",{status,headers:{"Content-Type":"text/html"}});

test("only checks public GLOHAUS URLs via GET without credentials", async () => {
  const requests = [];
  const report = await inspect(async (url, options) => { requests.push([url, options]); return response(); }, async () => {});
  assert.equal(report.healthy, true);
  assert.deepEqual(report.checks.map(x => x.path), paths);
  for (const [url, opts] of requests) {
    assert.match(url, /^https:\/\/www\.glohaus\.shop\/(?:shop|discover)?$/);
    assert.equal(opts.method, "GET");
    assert.equal(opts.headers.Cookie, undefined);
    assert.equal(opts.headers.Authorization, undefined);
  }
});

test("retries transient failures before raising an alert", async () => {
  const calls = new Map();
  const report = await inspect(async url => {
    const attempt = (calls.get(url) || 0) + 1;
    calls.set(url, attempt);
    return response(attempt === 1 ? 503 : 200);
  }, async () => {});
  assert.equal(report.healthy, true);
  assert.ok(report.checks.every(x => x.attempts === 2));
});

test("persistent failure creates a safe incident summary", async () => {
  const report = await inspect(async url => {
    if (url.endsWith("/shop")) throw Error("sensitive network debug information");
    return response();
  }, async () => {});
  assert.equal(report.healthy, false);
  assert.deepEqual(report.checks.map(x => x.ok), [true, false, true]);
  assert.match(incidentBody(report), /\/shop: FAILED/);
  assert.doesNotMatch(incidentBody(report), /sensitive network debug/);
});


test("retries HTTP-200 streamed render failures and reports a fixed safe reason", async()=>{
 const report=await inspect(async url=>url.endsWith('/shop')?new Response('<main>Shell</main>1:E{"digest":"private-fixture-detail"}',{headers:{'Content-Type':'text/html'}}):response(),async()=>{});
 assert.equal(report.healthy,false);assert.equal(report.checks[1].status,200);assert.equal(report.checks[1].reason,'render_error');assert.equal(report.checks[1].attempts,2);
 assert.doesNotMatch(incidentBody(report),/private-fixture-detail|<main>/);
});
