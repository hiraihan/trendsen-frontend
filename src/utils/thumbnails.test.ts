import { describe, expect, it } from "vitest";
import { thumbnailUrlOf } from "./thumbnails";

describe("thumbnailUrlOf", () => {
  it("returns the https url stored by the backend extraction", () => {
    expect(thumbnailUrlOf({ thumbnail_url: "https://cdn.test/a.jpg" })).toBe(
      "https://cdn.test/a.jpg",
    );
  });

  it("trims surrounding whitespace", () => {
    expect(
      thumbnailUrlOf({ thumbnail_url: "  https://cdn.test/a.jpg  " }),
    ).toBe("https://cdn.test/a.jpg");
  });

  const refused: ReadonlyArray<[unknown, string]> = [
    [undefined, "key absent"],
    [{}, "empty metadata"],
    [null, "explicit null (the no-image case)"],
    [42, "not a string"],
    ["", "empty string"],
    ["   ", "whitespace only"],
    ["http://cdn.test/a.jpg", "insecure scheme"],
    ["data:image/png;base64,AAAA", "data url"],
    ["blob:https://cdn.test/x", "blob url"],
    ["javascript:alert(1)", "script url"],
    ["//cdn.test/a.jpg", "protocol-relative url"],
    ["not a url", "not a url"],
  ];

  it.each(refused)("refuses %s (%s)", (value) => {
    expect(thumbnailUrlOf({ thumbnail_url: value as unknown })).toBeNull();
  });
});
