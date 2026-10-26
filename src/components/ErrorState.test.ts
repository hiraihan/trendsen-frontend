import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import ErrorState from "./ErrorState.vue";
import { ApiError } from "@/api/client";

describe("ErrorState", () => {
  it("maps the API error code to a human message", () => {
    const wrapper = mount(ErrorState, {
      props: { error: new ApiError("internal_error", "boom", null, 500) },
    });
    expect(wrapper.text()).toContain("Something went wrong");
  });

  it("offers a retry only when the caller supplies one", async () => {
    const retry = vi.fn();
    const wrapper = mount(ErrorState, {
      props: { error: new Error("offline"), retry },
    });
    const button = wrapper.get("button");
    expect(button.text()).toBe("Try again");
    await button.trigger("click");
    expect(retry).toHaveBeenCalledOnce();
  });

  it("renders no dead button when the failure is not retryable", () => {
    const wrapper = mount(ErrorState, {
      props: { error: new ApiError("not_found", "gone", null, 404) },
    });
    expect(wrapper.find("button").exists()).toBe(false);
  });
});
