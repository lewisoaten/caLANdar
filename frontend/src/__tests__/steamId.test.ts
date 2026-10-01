import { describe, expect, test } from "vitest";
import { isValidSteamIdInput, parseSteamIdInput } from "../utils/steamId";

// Mirrors the cases in api/src/controllers/profile.rs.
describe("parseSteamIdInput", () => {
  test("accepts a bare SteamID64", () => {
    expect(parseSteamIdInput(" 76561197960287930 ")).toEqual({
      kind: "id",
      steamId: "76561197960287930",
    });
  });

  test("accepts profile URLs with or without scheme and www", () => {
    for (const url of [
      "https://steamcommunity.com/profiles/76561197960287930",
      "http://www.steamcommunity.com/profiles/76561197960287930/",
      "steamcommunity.com/profiles/76561197960287930",
      "HTTPS://SteamCommunity.com/profiles/76561197960287930",
    ]) {
      expect(parseSteamIdInput(url)).toEqual({
        kind: "id",
        steamId: "76561197960287930",
      });
    }
  });

  test("accepts vanity URLs", () => {
    expect(
      parseSteamIdInput("https://steamcommunity.com/id/the_last-anomaly/"),
    ).toEqual({ kind: "vanity", vanity: "the_last-anomaly" });
  });

  test("rejects everything else", () => {
    for (const bad of [
      "",
      "1234",
      "765611979602879301",
      "7656119796028793a",
      "https://steamcommunity.com/profiles/notanumber",
      "https://steamcommunity.com/id/",
      "https://steamcommunity.com/id/a/b",
      "https://steamcommunity.com/groups/foo",
      "https://evil.example/id/foo",
      "https://steamcommunity.com.evil.example/id/foo",
      "steamcommunity.com",
    ]) {
      expect(isValidSteamIdInput(bad)).toBe(false);
    }
  });
});
