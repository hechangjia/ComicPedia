import { afterEach, describe, expect, it, vi } from "vitest";
const writes = vi.hoisted(() => ({batchUpsertTasks:vi.fn(),batchUpsertCharacters:vi.fn(),batchUpsertSeries:vi.fn()}));
vi.mock("@/lib/server/db",()=>writes);
import { POST } from "@/app/api/backup/import/route";
afterEach(()=>{delete process.env.ADMIN_TOKEN;vi.clearAllMocks();});
describe("legacy JSON import retirement",()=>{
  it("still requires administrator authorization",async()=>{
    process.env.ADMIN_TOKEN="fixture-only";
    const response=await POST(new Request("http://localhost/api/backup/import",{method:"POST",body:'{}'}));
    expect(response.status).toBe(401);
  });
  it("cannot bypass archive preview, transaction checks or replacement confirmation",async()=>{
    const response=await POST(new Request("http://localhost/api/backup/import",{method:"POST",body:JSON.stringify({version:"1.0.0",tasks:[],characters:[],series:[]})}));
    expect(response.status).toBe(410); expect((await response.json()).error).toContain("ZIP");
    for(const write of Object.values(writes)) expect(write).not.toHaveBeenCalled();
  });
});
