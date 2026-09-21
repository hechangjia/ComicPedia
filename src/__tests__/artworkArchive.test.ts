import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildArtworkArchive, readArtworkArchive, type ArtworkRecords } from "@/lib/server/backup/archive";
const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY9sAAAAASUVORK5CYII=", "base64");
const records = (): ArtworkRecords => ({ tasks: [{ id: "task", status: "completed", script: { panels: [{ imageUrl: "file://picture", imageVersions: [{ imageUrl: "/api/images/picture" }] }] }, metadata: { generationConfig: { apiKey: "secret-fixture", model: "QA" } } }], characters: [], series: [], character_relations: [] });
const load = async () => ({ bytes: image, mime: "image/png" });
describe("portable artwork archive", () => {
  it("packs image bytes once, preserves nested references and removes credential fields", async () => {
    const source = records(); const before = JSON.stringify(source);
    const bytes = await buildArtworkArchive(source, load);
    const restored = await readArtworkArchive(bytes);
    expect(restored.assets.size).toBe(1);
    expect([...restored.assets.values()][0].bytes).toEqual(image);
    const text = JSON.stringify(restored.manifest);
    expect(text).not.toContain("file://picture");
    expect(text).not.toContain("/api/images/picture");
    expect(text).not.toContain("secret-fixture");
    expect(text).toContain("asset://");
    expect(JSON.stringify(source)).toBe(before);
  });
  it("refuses a missing local image rather than exporting a broken archive", async () => {
    await expect(buildArtworkArchive(records(), async () => null)).rejects.toThrow("图片");
  });
  it("does not silently call an external server or claim its image is included", async () => {
    const data = records(); data.tasks[0].script = { panels: [{ imageUrl: "https://external.example/private.png" }] };
    await expect(buildArtworkArchive(data, load)).rejects.toThrow("外部");
  });
  it("rejects a changed asset with an unchanged manifest digest", async () => {
    const zip = await JSZip.loadAsync(await buildArtworkArchive(records(), load));
    const asset = Object.keys(zip.files).find(name => name.startsWith("assets/") && !zip.files[name].dir)!;
    zip.file(asset, Buffer.from("changed"));
    await expect(readArtworkArchive(await zip.generateAsync({ type: "nodebuffer" }))).rejects.toThrow();
  });
  it("rejects a missing listed asset", async () => {
    const zip = await JSZip.loadAsync(await buildArtworkArchive(records(), load));
    const asset = Object.keys(zip.files).find(name => name.startsWith("assets/") && !zip.files[name].dir)!;
    zip.remove(asset);
    await expect(readArtworkArchive(await zip.generateAsync({ type: "nodebuffer" }))).rejects.toThrow();
  });
  it("rejects unknown entries and unsafe paths even when ZIP sanitizes them", async () => {
    for (const name of ["extra.txt", "../outside.txt", "assets/../escape.png"]) {
      const zip = await JSZip.loadAsync(await buildArtworkArchive(records(), load)); zip.file(name, "QA");
      await expect(readArtworkArchive(await zip.generateAsync({ type: "nodebuffer" }))).rejects.toThrow();
    }
  });
  it("bounds decompressed metadata instead of trusting compressed size", async () => {
    const zip = new JSZip(); zip.file("manifest.json", " ".repeat(4096));
    await expect(readArtworkArchive(await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }), { metadataBytes: 128 })).rejects.toThrow("限制");
  });
  it("rejects unsupported versions and duplicate entity IDs before restoration", async () => {
    const zip = await JSZip.loadAsync(await buildArtworkArchive(records(), load));
    const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
    manifest.version = 999; zip.file("manifest.json", JSON.stringify(manifest));
    await expect(readArtworkArchive(await zip.generateAsync({ type: "nodebuffer" }))).rejects.toThrow();
    const duplicate = records(); duplicate.tasks.push({ ...duplicate.tasks[0] });
    await expect(buildArtworkArchive(duplicate, load)).rejects.toThrow();
  });
  it("rejects an undeclared asset reference in otherwise valid records", async () => {
    const zip = await JSZip.loadAsync(await buildArtworkArchive(records(), load));
    const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
    manifest.records.tasks[0].script.panels[0].imageUrl = "asset://missing";
    zip.file("manifest.json", JSON.stringify(manifest));
    await expect(readArtworkArchive(await zip.generateAsync({ type: "nodebuffer" }))).rejects.toThrow();
  });
});

it("rejects external raw-column avatars instead of exporting a nonportable archive", async () => {
  const data = records(); data.characters = [{id:"char", avatar_url:"https://external.example/avatar.png"}];
  await expect(buildArtworkArchive(data, load)).rejects.toThrow("外部");
});
it("treats a missing asset MIME as a validation error rather than an internal exception", async () => {
  const zip = await JSZip.loadAsync(await buildArtworkArchive(records(), load));
  const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
  delete manifest.assets[0].mime; zip.file("manifest.json", JSON.stringify(manifest));
  await expect(readArtworkArchive(await zip.generateAsync({type:"nodebuffer"}))).rejects.toMatchObject({status:400});
});

it("does not export opaque execution replay payloads which can embed workflow credentials",async()=>{
  const data=records();data.tasks[0].metadata={serverScriptReplay:{image:{fallback:{comfyuiWorkflow:'{"token":"workflow-fixture"}'}}},extensionData:{retained:true}};
  const parsed=await readArtworkArchive(await buildArtworkArchive(data,load));
  expect(JSON.stringify(parsed.manifest)).not.toContain("workflow-fixture");
  expect(JSON.stringify(parsed.manifest)).toContain("retained");
});
it("rejects ZIPs with conflicting central and local entry names",async()=>{
  const bytes=Buffer.from(await buildArtworkArchive(records(),load));
  expect(bytes.subarray(30,43).toString()).toBe("manifest.json");
  bytes.write("../evil..json",30,"utf8");
  await expect(readArtworkArchive(bytes)).rejects.toMatchObject({status:400});
});
