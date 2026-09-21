import { describe, expect, it } from "vitest";
import { readArchiveDownload } from "@/lib/backupClient";
describe("backup download validation",()=>{
  it("cannot report an empty successful response as a downloadable archive",async()=>{
    await expect(readArchiveDownload(new Response(null,{status:204}))).rejects.toThrow();
  });
  it("rejects HTML error pages even when returned with HTTP 200",async()=>{
    await expect(readArchiveDownload(new Response('<html>sign in</html>',{headers:{'Content-Type':'text/html'}}))).rejects.toThrow();
  });
  it("requires ZIP magic rather than trusting a content-type alone",async()=>{
    await expect(readArchiveDownload(new Response('not a zip'.repeat(5),{headers:{'Content-Type':'application/zip'}}))).rejects.toThrow();
  });
  it("returns the binary response without turning it into JSON or text",async()=>{
    const bytes=new Uint8Array(30);bytes.set([80,75,3,4]);
    expect((await readArchiveDownload(new Response(bytes,{headers:{'Content-Type':'application/zip'}}))).size).toBe(30);
  });
});
