import { describe, it, expect, vi } from "vitest";
import { fetchRsiStatus } from "@/lib/status";

describe("fetchRsiStatus", () => {
  it("is signed in when identify returns a handle", async () => {
    const send = vi.fn().mockResolvedValue(
      JSON.stringify({ code: 200, action: "identify", payload: { handle: "TestUser" } })
    );

    expect(await fetchRsiStatus(send)).toEqual({
      state: "signed-in",
      handle: "TestUser",
    });
    expect(JSON.parse(send.mock.calls[0]![0])).toEqual({ action: "identify" });
  });

  it("is signed out without a token", async () => {
    const send = vi.fn().mockResolvedValue(
      JSON.stringify({ code: 400, action: "identify", error: "Token not found" })
    );

    expect(await fetchRsiStatus(send)).toEqual({ state: "signed-out" });
  });

  it("is signed out when the token no longer identifies anyone", async () => {
    const send = vi.fn().mockResolvedValue(
      JSON.stringify({ code: 200, action: "identify", payload: {} })
    );

    expect(await fetchRsiStatus(send)).toEqual({ state: "signed-out" });
  });

  it("reports an error when the background does not answer", async () => {
    const send = vi.fn().mockRejectedValue(new Error("Receiving end does not exist"));

    expect(await fetchRsiStatus(send)).toEqual({ state: "error" });
  });
});
