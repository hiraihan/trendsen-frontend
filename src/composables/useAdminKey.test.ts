import { beforeEach, describe, expect, it } from "vitest";
import { useAdminKey } from "./useAdminKey";

describe("useAdminKey", () => {
  beforeEach(() => {
    sessionStorage.clear();
    const { clear } = useAdminKey();
    clear();
  });

  it("starts empty", () => {
    const { key, hasKey } = useAdminKey();
    expect(key.value).toBeNull();
    expect(hasKey.value).toBe(false);
  });

  it("keeps the key in memory when remember is false", () => {
    const { key, hasKey, set } = useAdminKey();
    set("secret", false);
    expect(key.value).toBe("secret");
    expect(hasKey.value).toBe(true);
    // localStorage is forbidden; sessionStorage must stay untouched without the opt-in.
    expect(sessionStorage.getItem("trendsentinel.admin_key")).toBeNull();
  });

  it("persists to sessionStorage only behind the explicit opt-in", () => {
    const { set } = useAdminKey();
    set("secret", true);
    expect(sessionStorage.getItem("trendsentinel.admin_key")).toBe("secret");
  });

  it("clear removes both memory and storage", () => {
    const { set, clear, hasKey } = useAdminKey();
    set("secret", true);
    clear();
    expect(hasKey.value).toBe(false);
    expect(sessionStorage.getItem("trendsentinel.admin_key")).toBeNull();
  });
});
