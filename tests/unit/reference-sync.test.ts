import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockDriveClient } from "@/mocks/drive/MockDriveClient";
import { invalidateFolderCache } from "@/lib/drive/paths";

let drive: MockDriveClient;
vi.mock("@/lib/drive", async (orig) => ({ ...(await orig<typeof import("@/lib/drive")>()), getDrive: async () => drive }));

import { deleteReference, listReferences, syncDriveReferences } from "@/lib/references";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

beforeEach(() => {
  invalidateFolderCache();
  drive = new MockDriveClient(MockDriveClient.createEmpty());
  delete (globalThis as { __magazineDeskRefSync?: unknown }).__magazineDeskRefSync;
});

describe("syncDriveReferences", () => {
  it("imports subfolders as carousels and loose images as single refs, in name order", async () => {
    const inbox = await drive.ensureFolder(drive.rootFolderId(), ["references"]);
    const set = await drive.createFolder(inbox.id, "카페 캐러셀");
    await drive.uploadBytes(set.id, "10.png", PNG, "image/png");
    await drive.uploadBytes(set.id, "2.png", PNG, "image/png");
    await drive.writeText(set.id, "note.txt", "여백이 좋음", "text/plain");
    await drive.uploadBytes(inbox.id, "포스터.png", PNG, "image/png");
    await drive.createFolder(inbox.id, "빈 폴더");

    const refs = await listReferences();
    expect(refs).toHaveLength(2);
    const carousel = refs.find((r) => r.title === "카페 캐러셀")!;
    expect(carousel.images.map((i) => i.name)).toEqual(["2.png", "10.png"]);
    expect(carousel.note).toBe("여백이 좋음");
    expect(refs.find((r) => r.title === "포스터")!.images).toHaveLength(1);
  });

  it("keeps user metadata, follows Drive changes, hides without deleting Drive files", async () => {
    const inbox = await drive.ensureFolder(drive.rootFolderId(), ["references"]);
    const set = await drive.createFolder(inbox.id, "세트");
    await drive.uploadBytes(set.id, "1.png", PNG, "image/png");
    const [first] = await listReferences();
    expect(first!.images).toHaveLength(1);

    await drive.uploadBytes(set.id, "2.png", PNG, "image/png");
    await syncDriveReferences({ force: true });
    expect((await listReferences())[0]!.images).toHaveLength(2);

    await deleteReference(first!.id);
    await syncDriveReferences({ force: true });
    expect(await listReferences()).toHaveLength(0);
    expect((await drive.listChildren(set.id)).length).toBe(2); // 원본은 그대로

    await drive.deleteFile(set.id);
    await syncDriveReferences({ force: true });
    expect(await listReferences()).toHaveLength(0);
  });
});
