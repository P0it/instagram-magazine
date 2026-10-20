import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockDriveClient } from "@/mocks/drive/MockDriveClient";
import { invalidateFolderCache } from "@/lib/drive/paths";

let drive: MockDriveClient;
vi.mock("@/lib/drive", async (orig) => ({ ...(await orig<typeof import("@/lib/drive")>()), getDrive: async () => drive }));

import { addLibraryPhoto, deleteLibraryPhoto, listLibraryPhotos, PhotoImageError, readLibraryPhoto } from "@/lib/photos";

/** 시그니처 + IHDR(폭·높이)만 있는 최소 PNG 헤더 */
function png(w: number, h: number): Uint8Array {
  const b = new Uint8Array(24);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
}
const file = (bytes: Uint8Array) => new File([bytes as BlobPart], "x.png", { type: "image/png" });
const META = { mood: "film", site: "Burst", pageUrl: "https://burst.shopify.com/photos/x", license: "Burst License" };

beforeEach(() => {
  invalidateFolderCache();
  drive = new MockDriveClient(MockDriveClient.createEmpty());
});

describe("photo library", () => {
  it("저장하면 크기·출처가 목록에 남고 바이트를 다시 읽을 수 있다", async () => {
    await addLibraryPhoto({ ...META, tags: ["grain"] }, file(png(1080, 1350)));
    const [p] = await listLibraryPhotos();
    expect(p).toMatchObject({ mood: "film", site: "Burst", width: 1080, height: 1350, tags: ["grain"] });
    const { bytes } = await readLibraryPhoto(p.id);
    expect(bytes.byteLength).toBe(24);
  });

  it("이미지가 아니면 거부하고, 지우면 목록에서 빠진다", async () => {
    await expect(addLibraryPhoto(META, new File(["nope"], "a.txt"))).rejects.toBeInstanceOf(PhotoImageError);
    const [p] = await addLibraryPhoto(META, file(png(10, 10)));
    expect(await deleteLibraryPhoto(p.id)).toHaveLength(0);
    expect(await listLibraryPhotos()).toHaveLength(0);
  });
});
