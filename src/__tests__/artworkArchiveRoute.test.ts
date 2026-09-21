import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArtworkArchiveError } from "@/lib/server/backup/archive";
const service = vi.hoisted(() => ({ exportArtworkArchive:vi.fn(), previewArtworkArchive:vi.fn(), restoreArtworkArchive:vi.fn() }));
vi.mock("@/lib/server/backup/service", () => service);
import { GET, POST } from "@/app/api/backup/archive/route";
import { readArchiveBody } from "@/lib/server/backup/http";
const url = "http://localhost:3000/api/backup/archive";
const revision = "a".repeat(64);
const request = (action="preview", headers: Record<string,string> = {}) => new Request(`${url}?action=${action}`, {method:"POST",headers:{"Content-Type":"application/zip","X-ComicPedia-Archive":"2",...headers},body:"ZIP"});
beforeEach(() => { vi.clearAllMocks(); delete process.env.ADMIN_TOKEN; service.exportArtworkArchive.mockResolvedValue(Buffer.from("ZIP")); service.previewArtworkArchive.mockResolvedValue({revision}); service.restoreArtworkArchive.mockResolvedValue({images:1}); });
afterEach(() => { delete process.env.ADMIN_TOKEN; });
describe("artwork archive HTTP boundary", () => {
  it("downloads ZIP without browser caching", async () => {
    const response = await GET(new Request(url));
    expect(response.status).toBe(200); expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("cache-control")).toContain("no-store"); expect(await response.text()).toBe("ZIP");
  });
  it("protects both reading and writing with the configured administrator token", async () => {
    process.env.ADMIN_TOKEN="fixture-only";
    expect((await GET(new Request(url))).status).toBe(401);
    expect((await POST(request())).status).toBe(401);
    expect(service.exportArtworkArchive).not.toHaveBeenCalled(); expect(service.previewArtworkArchive).not.toHaveBeenCalled();
    expect((await GET(new Request(url,{headers:{Authorization:"Bearer fixture-only"}}))).status).toBe(200);
  });
  it("rejects cross-origin requests and simple HTML form submissions before parsing", async () => {
    expect((await POST(request("preview",{Origin:"https://untrusted.example"}))).status).toBe(403);
    expect((await POST(request("preview",{"Sec-Fetch-Site":"cross-site"}))).status).toBe(403);
    expect((await POST(request("preview",{"Content-Type":"text/plain"}))).status).toBe(415);
    expect((await POST(request("preview",{"X-ComicPedia-Archive":""}))).status).toBe(400);
    expect(service.previewArtworkArchive).not.toHaveBeenCalled();
  });
  it("preview reads bytes but cannot commit; restore requires its exact revision", async () => {
    expect((await POST(request())).status).toBe(200); expect(service.previewArtworkArchive).toHaveBeenCalledWith(Buffer.from("ZIP"));
    expect(service.restoreArtworkArchive).not.toHaveBeenCalled();
    expect((await POST(request("restore"))).status).toBe(400);
    expect((await POST(request("restore",{"X-Archive-Revision":revision,"X-Archive-Replace":"true"}))).status).toBe(200);
    expect(service.restoreArtworkArchive).toHaveBeenCalledWith(Buffer.from("ZIP"),revision,true);
    expect((await POST(request("delete"))).status).toBe(400);
  });
  it("preserves actionable conflicts but never leaks internal exceptions", async () => {
    service.previewArtworkArchive.mockRejectedValueOnce(new ArtworkArchiveError("恢复预览已过期",409));
    expect((await POST(request())).status).toBe(409);
    service.previewArtworkArchive.mockRejectedValueOnce(new Error("private-path credential fixture"));
    const response=await POST(request()); expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private-path");
  });
  it("bounds the actual streamed upload, including when content-length lies", async () => {
    for (const length of [undefined,"1","1000"]) {
      const headers:Record<string,string> = length ? {"Content-Length":length} : {};
      await expect(readArchiveBody(new Request(url,{method:"POST",headers,body:"123456"}),4)).rejects.toMatchObject({status:413});
    }
    await expect(readArchiveBody(new Request(url,{method:"POST",body:"1234"}),4)).resolves.toEqual(Buffer.from("1234"));
  });
});

it("leaves download naming to the client to avoid attachment interception of fetch", async()=>{
  const response=await GET(new Request(url));
  expect(response.headers.get("content-disposition")).toBeNull();
});

it("accepts the browser Host after Next normalizes a loopback Request URL",async()=>{
  const req=new Request("http://localhost:3000/api/backup/archive?action=preview",{method:"POST",headers:{Host:"127.0.0.1:3000",Origin:"http://127.0.0.1:3000","Sec-Fetch-Site":"same-origin","Content-Type":"application/zip","X-ComicPedia-Archive":"2"},body:"ZIP"});
  expect((await POST(req)).status).toBe(200);
});
it("does not treat loopback aliases, ports or spoofed forwarded hosts as interchangeable origins",async()=>{
  for(const headers of [
    {Host:"127.0.0.1:3000",Origin:"http://localhost:3000"},
    {Host:"127.0.0.1:3000",Origin:"http://127.0.0.1:3001"},
    {Host:"127.0.0.1:3000",Origin:"https://127.0.0.1:3000"},
    {Host:"127.0.0.1:3000",Origin:"http://foreign.example","X-Forwarded-Host":"foreign.example"},
    {Host:"foreign.example@127.0.0.1:3000",Origin:"http://127.0.0.1:3000"},
  ] as Record<string,string>[]) expect((await POST(request("preview",headers))).status).toBe(403);
});
