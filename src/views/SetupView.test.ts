import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import SetupView from "./SetupView.vue";

vi.mock("@/api/credentials", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/api/credentials")>();
  return {
    ...original,
    getCredentialStatus: vi.fn(),
    postSourceCredentials: vi.fn(),
  };
});

import {
  getCredentialStatus,
  postSourceCredentials,
  type CredentialStatus,
} from "@/api/credentials";
import { ApiError, NetworkError } from "@/api/client";
import { useAdminKey } from "@/composables/useAdminKey";

const STATUS: { sources: CredentialStatus[] } = {
  sources: [
    {
      source_key: "reddit_technology",
      name: "Reddit r/technology",
      collector_key: "reddit",
      required_keys: [
        "reddit_client_id",
        "reddit_client_secret",
        "reddit_user_agent",
      ],
      keys: {
        reddit_client_id: false,
        reddit_client_secret: false,
        reddit_user_agent: false,
      },
    },
    {
      source_key: "x_trendsentinel",
      name: "X (trendsentinel query)",
      collector_key: "x",
      required_keys: ["x_bearer_token"],
      keys: { x_bearer_token: true },
    },
  ],
};

function mountView() {
  return mount(SetupView, {
    global: {
      stubs: {
        RouterLink: { template: "<a><slot /></a>" },
      },
    },
  });
}

beforeEach(() => {
  vi.mocked(getCredentialStatus).mockResolvedValue(STATUS);
  const { clear } = useAdminKey();
  clear();
});

afterEach(() => {
  sessionStorage.clear();
  vi.mocked(getCredentialStatus).mockReset();
  vi.mocked(postSourceCredentials).mockReset();
});

async function unlock(wrapper: ReturnType<typeof mountView>, key = "good-key") {
  await wrapper.find('input[type="password"]').setValue(key);
  await wrapper.find(".setup-key__form").trigger("submit");
  await flushPromises();
}

describe("SetupView", () => {
  it("loads nothing and shows only the unlock panel until a key exists", async () => {
    const wrapper = mountView();
    await flushPromises();

    // The status endpoint is admin-key-guarded (ADR-0006, amended): without a key
    // there is no call at all — the 401 would be a lie about the operator's intent.
    expect(getCredentialStatus).not.toHaveBeenCalled();
    expect(wrapper.find(".setup-key__form").exists()).toBe(true);
    expect(wrapper.find(".setup-source").exists()).toBe(false);
    // The key panel is not mistaken for the whole page: the three platforms it
    // provisions are named before the unlock.
    const platforms = wrapper.findAll(".setup-platforms__item");
    expect(platforms.map((node) => node.text())).toEqual([
      "Redditreddit.com/prefs/apps — script appclient id · client secret · user agent",
      "XX developer portalapp-only bearer token",
      "ThreadsMeta app dashboardlong-lived access token",
    ]);
  });

  it("rejects a wrong key without adopting it", async () => {
    vi.mocked(getCredentialStatus).mockRejectedValue(
      new ApiError(
        "unauthorized",
        "A valid X-API-Key header is required",
        null,
        401,
      ),
    );
    const wrapper = mountView();
    await flushPromises();

    await unlock(wrapper, "wrong-key");

    // The unlock call itself carried the candidate key and got the 401.
    expect(getCredentialStatus).toHaveBeenCalledWith("wrong-key");
    // The key was NOT adopted: the panel is still there and the draft survives.
    const { hasKey } = useAdminKey();
    expect(hasKey.value).toBe(false);
    expect(wrapper.find(".setup-key__form").exists()).toBe(true);
    expect(wrapper.text()).toContain("rejected");
    // Nothing else leaked the draft value into the page.
    expect(wrapper.text()).not.toContain("wrong-key");
  });

  it("lets the operator type a new key after a wrong one, without a reload", async () => {
    // Regression: a rejected key used to leave the submit button stuck on "Checking…",
    // so the only way to try again was a full page reload.
    vi.mocked(getCredentialStatus).mockRejectedValue(
      new ApiError(
        "unauthorized",
        "A valid X-API-Key header is required",
        null,
        401,
      ),
    );
    const wrapper = mountView();
    await flushPromises();

    await unlock(wrapper, "wrong-key");

    const submit = wrapper.find(".setup-key__form button[type='submit']");
    expect((submit.element as HTMLButtonElement).disabled).toBe(false);
    expect(wrapper.find(".setup-key__form button[type='submit']").text()).toBe(
      "Unlock setup",
    );

    // The second attempt goes through with the new key and unlocks the page.
    vi.mocked(getCredentialStatus).mockResolvedValue(STATUS);
    await unlock(wrapper, "good-key");

    expect(getCredentialStatus).toHaveBeenLastCalledWith("good-key");
    expect(wrapper.find(".setup-key__form").exists()).toBe(false);
    expect(wrapper.find(".setup-source").exists()).toBe(true);
  });

  it("clears the previous error when a new attempt starts", async () => {
    vi.mocked(getCredentialStatus).mockRejectedValue(
      new ApiError(
        "unauthorized",
        "A valid X-API-Key header is required",
        null,
        401,
      ),
    );
    const wrapper = mountView();
    await flushPromises();

    await unlock(wrapper, "wrong-key");
    expect(wrapper.find(".error-state").exists()).toBe(true);

    vi.mocked(getCredentialStatus).mockResolvedValue(STATUS);
    await unlock(wrapper, "good-key");

    // The stale rejection message must not linger next to the unlocked forms.
    expect(wrapper.find(".error-state").exists()).toBe(false);
  });

  it("distinguishes an unreachable API from a rejected key", async () => {
    vi.mocked(getCredentialStatus).mockRejectedValue(
      new NetworkError(new TypeError("fetch failed")),
    );
    const wrapper = mountView();
    await flushPromises();

    await unlock(wrapper, "any-key");
    expect(wrapper.text()).toContain("Cannot reach the API");
    expect(wrapper.text()).not.toContain("rejected");
    const { hasKey } = useAdminKey();
    expect(hasKey.value).toBe(false);
  });

  it("adopts a verified key, loads status, and reveals the forms", async () => {
    const wrapper = mountView();
    await flushPromises();

    await unlock(wrapper, "good-key");

    // One call: the verification *is* the load — its answer is the status map, so the
    // screen does not immediately repeat the same request with the same key.
    expect(getCredentialStatus).toHaveBeenCalledTimes(1);
    expect(getCredentialStatus).toHaveBeenCalledWith("good-key");
    expect(wrapper.find(".setup-key__form").exists()).toBe(false);
    expect(wrapper.find(".setup-source").exists()).toBe(true);
    // The key input itself is gone from the DOM after adoption (the forms' own
    // password inputs remain — those are for credentials, not for the admin key).
    expect(wrapper.find("#setup-admin-key").exists()).toBe(false);
  });

  it("sends exactly the filled fields and clears them after saving", async () => {
    vi.mocked(postSourceCredentials).mockResolvedValue({
      source_key: "reddit_technology",
      configured_keys: ["reddit_client_id", "reddit_client_secret"],
      is_active: true,
    });
    const wrapper = mountView();
    await flushPromises();
    await unlock(wrapper);

    const redditForm = wrapper.findAll(".setup-source")[0].find(".setup-form");
    const inputs = redditForm.findAll("input");
    await inputs[0].setValue("my-client-id");
    await inputs[1].setValue("my-client-secret");
    await redditForm.trigger("submit");
    await flushPromises();

    expect(postSourceCredentials).toHaveBeenCalledWith(
      "reddit_technology",
      {
        reddit_client_id: "my-client-id",
        reddit_client_secret: "my-client-secret",
      },
      true,
      "good-key",
    );
    // The pasted values are cleared; nothing of them remains in the DOM.
    expect((inputs[0].element as HTMLInputElement).value).toBe("");
    expect(wrapper.text()).not.toContain("my-client-secret");
  });

  it("surfaces an API error without leaking the value", async () => {
    vi.mocked(postSourceCredentials).mockRejectedValue(
      new ApiError(
        "validation_error",
        "unknown keys: [x_bearer_token]",
        null,
        422,
      ),
    );
    const wrapper = mountView();
    await flushPromises();
    await unlock(wrapper);

    const redditForm = wrapper.findAll(".setup-source")[0].find(".setup-form");
    await redditForm.findAll("input")[0].setValue("my-client-id");
    await redditForm.trigger("submit");
    await flushPromises();

    expect(wrapper.text()).toContain("unknown keys");
  });

  it("drops a stale key on 401 and returns to the unlock panel", async () => {
    // A key set on another screen (in-memory only) that the server no longer accepts.
    const { set } = useAdminKey();
    set("stale-key", false);

    vi.mocked(getCredentialStatus).mockRejectedValue(
      new ApiError(
        "unauthorized",
        "A valid X-API-Key header is required",
        null,
        401,
      ),
    );
    const wrapper = mountView();
    await flushPromises();

    expect(getCredentialStatus).toHaveBeenCalledWith("stale-key");
    const { hasKey } = useAdminKey();
    expect(hasKey.value).toBe(false);
    // The unlock panel is its own message: no duplicated error state on top of it.
    expect(wrapper.find(".setup-key__form").exists()).toBe(true);
    expect(wrapper.find(".error-state").exists()).toBe(false);
  });

  it("reports a ready source as ready without asking for values again", async () => {
    const wrapper = mountView();
    await flushPromises();
    await unlock(wrapper);

    const xSection = wrapper.findAll(".setup-source")[1];
    expect(xSection.text()).toContain("ready");
    expect(xSection.text()).toContain("set");

    // The stored-value placeholder replaces an empty required field.
    const bearer = xSection
      .findAll("input")
      .find((node) => node.attributes("type") === "password");
    expect(bearer?.attributes("placeholder")).toBe("••••••••");
    expect(xSection.text()).toContain("a value is stored");
  });
});
