import { beforeEach, describe, expect, it, vi } from "vitest";

const getAllTasksMock = vi.fn();
const getAllCharactersMock = vi.fn();
const getAllSeriesListMock = vi.fn();

vi.mock("@/lib/server/db", () => ({
  getAllTasks: getAllTasksMock,
  getAllCharacters: getAllCharactersMock,
  getAllSeriesList: getAllSeriesListMock,
}));

describe("/api/backup/export GET", () => {
  beforeEach(() => {
    getAllTasksMock.mockReset();
    getAllCharactersMock.mockReset();
    getAllSeriesListMock.mockReset();
  });

  it("exports all tasks, characters, and series by default", async () => {
    getAllTasksMock.mockReturnValue([{ id: "task-1", status: "completed" }]);
    getAllCharactersMock.mockReturnValue([{ id: "char-1", name: "Hero" }]);
    getAllSeriesListMock.mockReturnValue([{ id: "series-1", title: "Thunder" }]);

    const { GET } = await import("@/app/api/backup/export/route");
    const response = await GET(new Request("http://localhost:3000/api/backup/export"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      version: "1.0.0",
      exportedAt: expect.any(String),
      tasks: [{ id: "task-1", status: "completed" }],
      characters: [{ id: "char-1", name: "Hero" }],
      series: [{ id: "series-1", title: "Thunder" }],
    });
  });

  it("strips base64 images while preserving non-base64 refs", async () => {
    getAllTasksMock.mockReturnValue([
      {
        id: "task-1",
        status: "completed",
        script: {
          referenceImage: "data:image/png;base64,cover",
          referenceImages: ["data:image/png;base64,ref"],
          referenceEntries: [
            {
              imageUrl: "data:image/png;base64,entry",
              versions: [
                { imageUrl: "data:image/png;base64,entry-v1" },
                { imageUrl: "file://task-1_ref1_v1" },
              ],
            },
          ],
          panels: [
            {
              imageUrl: "data:image/png;base64,panel",
              referenceImage: "data:image/png;base64,panel-ref",
              referenceImages: ["data:image/png;base64,panel-ref-2"],
              imageVersions: [
                { imageUrl: "data:image/png;base64,panel-v1" },
                { imageUrl: "/api/images/task-1_panel0_v2" },
              ],
            },
          ],
        },
      },
    ]);
    getAllCharactersMock.mockReturnValue([
      {
        id: "char-1",
        name: "Hero",
        avatarUrl: "data:image/png;base64,avatar",
        referenceEntries: [
          {
            imageUrl: "data:image/png;base64,char-ref",
            versions: [
              { imageUrl: "data:image/png;base64,char-ref-v1" },
              { imageUrl: "file://char-1_ref0_v2" },
            ],
          },
        ],
      },
    ]);
    getAllSeriesListMock.mockReturnValue([]);

    const { GET } = await import("@/app/api/backup/export/route");
    const response = await GET(new Request("http://localhost:3000/api/backup/export?strip_images=true"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.tasks[0].script.referenceImage).toBeUndefined();
    expect(body.tasks[0].script.referenceImages).toBeUndefined();
    expect(body.tasks[0].script.referenceEntries[0].imageUrl).toBe("");
    expect(body.tasks[0].script.referenceEntries[0].versions).toEqual([
      { imageUrl: "" },
      { imageUrl: "file://task-1_ref1_v1" },
    ]);
    expect(body.tasks[0].script.panels[0]).toEqual({
      imageUrl: undefined,
      referenceImage: undefined,
      referenceImages: undefined,
      imageVersions: [
        { imageUrl: "" },
        { imageUrl: "/api/images/task-1_panel0_v2" },
      ],
    });
    expect(body.characters[0].avatarUrl).toBeUndefined();
    expect(body.characters[0].referenceEntries[0].versions).toEqual([
      { imageUrl: "" },
      { imageUrl: "file://char-1_ref0_v2" },
    ]);
  });
});
