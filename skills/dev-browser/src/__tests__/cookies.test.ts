import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import {
  parseKeyValueCookie,
  parseJsonCookies,
  parseNetscapeCookies,
  loadCookiesFromFile,
  parseCookieArg,
  parseAllCookies,
  cookieSummary,
  CookieParseError,
} from "../cookies.js";

// Temp directory for file-based tests
const tmpDir = join(import.meta.dirname, "..", "..", "tmp", "cookie-tests");

describe("parseKeyValueCookie", () => {
  it("parses minimal key-value cookie (name, value, domain)", () => {
    const cookie = parseKeyValueCookie("name=session;value=abc;domain=.example.com");
    expect(cookie).toEqual({
      name: "session",
      value: "abc",
      domain: ".example.com",
    });
  });

  it("parses all optional fields", () => {
    const cookie = parseKeyValueCookie(
      "name=token;value=xyz;domain=.example.com;path=/api;secure;httpOnly;sameSite=Strict;expires=1735689600"
    );
    expect(cookie).toEqual({
      name: "token",
      value: "xyz",
      domain: ".example.com",
      path: "/api",
      secure: true,
      httpOnly: true,
      sameSite: "Strict",
      expires: 1735689600,
    });
  });

  it("handles spaces around separators", () => {
    const cookie = parseKeyValueCookie(" name = session ; value = abc ; domain = .example.com ");
    expect(cookie.name).toBe("session");
    expect(cookie.value).toBe("abc");
    expect(cookie.domain).toBe(".example.com");
  });

  it("handles empty value", () => {
    const cookie = parseKeyValueCookie("name=session;value=;domain=.example.com");
    expect(cookie.value).toBe("");
  });

  it("handles value with equals sign", () => {
    const cookie = parseKeyValueCookie("name=token;value=abc=def;domain=.example.com");
    expect(cookie.value).toBe("abc=def");
  });

  it("throws on missing name", () => {
    expect(() => parseKeyValueCookie("value=abc;domain=.example.com")).toThrow(CookieParseError);
    expect(() => parseKeyValueCookie("value=abc;domain=.example.com")).toThrow("missing 'name'");
  });

  it("throws on missing value", () => {
    expect(() => parseKeyValueCookie("name=session;domain=.example.com")).toThrow(CookieParseError);
    expect(() => parseKeyValueCookie("name=session;domain=.example.com")).toThrow(
      "missing 'value'"
    );
  });

  it("throws on missing domain", () => {
    expect(() => parseKeyValueCookie("name=session;value=abc")).toThrow(CookieParseError);
    expect(() => parseKeyValueCookie("name=session;value=abc")).toThrow("requires a domain");
  });

  it("throws on invalid expires", () => {
    expect(() => parseKeyValueCookie("name=x;value=y;domain=.a.com;expires=notanumber")).toThrow(
      "invalid expires"
    );
  });

  it("throws on invalid sameSite", () => {
    expect(() => parseKeyValueCookie("name=x;value=y;domain=.a.com;sameSite=Invalid")).toThrow(
      "invalid sameSite"
    );
  });

  it("parses sameSite case-insensitively", () => {
    const cookie = parseKeyValueCookie("name=x;value=y;domain=.a.com;sameSite=strict");
    expect(cookie.sameSite).toBe("Strict");

    const cookie2 = parseKeyValueCookie("name=x;value=y;domain=.a.com;sameSite=NONE");
    expect(cookie2.sameSite).toBe("None");
  });
});

describe("parseJsonCookies", () => {
  it("parses single JSON cookie object", () => {
    const cookies = parseJsonCookies('{"name":"token","value":"abc","domain":".example.com"}');
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toEqual({
      name: "token",
      value: "abc",
      domain: ".example.com",
    });
  });

  it("parses JSON array of cookies", () => {
    const cookies = parseJsonCookies(
      '[{"name":"a","value":"1","domain":".x.com"},{"name":"b","value":"2","domain":".y.com"}]'
    );
    expect(cookies).toHaveLength(2);
    expect(cookies[0]!.name).toBe("a");
    expect(cookies[1]!.name).toBe("b");
  });

  it("parses all optional fields", () => {
    const cookies = parseJsonCookies(
      '{"name":"x","value":"y","domain":".a.com","path":"/api","expires":1735689600,"httpOnly":true,"secure":true,"sameSite":"Strict"}'
    );
    expect(cookies[0]).toEqual({
      name: "x",
      value: "y",
      domain: ".a.com",
      path: "/api",
      expires: 1735689600,
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
    });
  });

  it("throws on invalid JSON", () => {
    expect(() => parseJsonCookies("not json")).toThrow(CookieParseError);
    expect(() => parseJsonCookies("not json")).toThrow("Invalid JSON");
  });

  it("throws on empty array", () => {
    expect(() => parseJsonCookies("[]")).toThrow("empty");
  });

  it("throws on missing name", () => {
    expect(() => parseJsonCookies('{"value":"x","domain":".a.com"}')).toThrow(
      "missing or invalid 'name'"
    );
  });

  it("throws on missing value", () => {
    expect(() => parseJsonCookies('{"name":"x","domain":".a.com"}')).toThrow(
      "missing or invalid 'value'"
    );
  });

  it("throws on missing domain", () => {
    expect(() => parseJsonCookies('{"name":"x","value":"y"}')).toThrow("requires a domain");
  });

  it("throws on non-object item in array", () => {
    expect(() => parseJsonCookies('["not an object"]')).toThrow("not an object");
  });

  it("throws on invalid sameSite value", () => {
    expect(() =>
      parseJsonCookies('{"name":"x","value":"y","domain":".a.com","sameSite":"Invalid"}')
    ).toThrow("invalid 'sameSite'");
  });

  it("throws on invalid httpOnly type", () => {
    expect(() =>
      parseJsonCookies('{"name":"x","value":"y","domain":".a.com","httpOnly":"yes"}')
    ).toThrow("invalid 'httpOnly'");
  });

  it("throws on invalid secure type", () => {
    expect(() =>
      parseJsonCookies('{"name":"x","value":"y","domain":".a.com","secure":"yes"}')
    ).toThrow("invalid 'secure'");
  });

  it("throws on invalid expires type", () => {
    expect(() =>
      parseJsonCookies('{"name":"x","value":"y","domain":".a.com","expires":"abc"}')
    ).toThrow("invalid 'expires'");
  });

  it("throws on invalid path type", () => {
    expect(() => parseJsonCookies('{"name":"x","value":"y","domain":".a.com","path":123}')).toThrow(
      "invalid 'path'"
    );
  });
});

describe("parseNetscapeCookies", () => {
  it("parses a standard Netscape cookie line", () => {
    const content = ".example.com\tTRUE\t/\tFALSE\t0\tsession_token\tabc123";
    const cookies = parseNetscapeCookies(content);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toEqual({
      name: "session_token",
      value: "abc123",
      domain: ".example.com",
      path: "/",
    });
  });

  it("parses multiple lines with comments", () => {
    const content = [
      "# Netscape HTTP Cookie File",
      ".example.com\tTRUE\t/\tFALSE\t0\tsession\tabc",
      "",
      "# Another comment",
      ".other.com\tTRUE\t/api\tTRUE\t1735689600\tapi_key\txyz789",
    ].join("\n");

    const cookies = parseNetscapeCookies(content);
    expect(cookies).toHaveLength(2);
    expect(cookies[0]!.name).toBe("session");
    expect(cookies[0]!.domain).toBe(".example.com");
    expect(cookies[1]!.name).toBe("api_key");
    expect(cookies[1]!.domain).toBe(".other.com");
    expect(cookies[1]!.secure).toBe(true);
    expect(cookies[1]!.expires).toBe(1735689600);
    expect(cookies[1]!.path).toBe("/api");
  });

  it("skips empty lines and comments", () => {
    const content = ["# Comment", "", "  ", ".example.com\tTRUE\t/\tFALSE\t0\tname\tvalue"].join(
      "\n"
    );

    const cookies = parseNetscapeCookies(content);
    expect(cookies).toHaveLength(1);
  });

  it("handles empty value in cookie", () => {
    // 7 tab-separated fields: the value field is empty but present after the last tab
    const content = ".example.com\tTRUE\t/\tFALSE\t0\temptyval\t";
    // split("\t") on trailing tab gives 7 elements with last being ""
    const cookies = parseNetscapeCookies(content);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]!.value).toBe("");
    expect(cookies[0]!.name).toBe("emptyval");
  });

  it("throws on too few fields", () => {
    const content = ".example.com\tTRUE\t/\tFALSE";
    expect(() => parseNetscapeCookies(content)).toThrow("expected 7 tab-separated fields");
  });

  it("throws on empty file (no cookies)", () => {
    const content = "# Just comments\n# No actual cookies\n";
    expect(() => parseNetscapeCookies(content)).toThrow("no cookie entries");
  });
});

describe("loadCookiesFromFile", () => {
  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("loads a JSON file", () => {
    const filePath = join(tmpDir, "cookies.json");
    writeFileSync(
      filePath,
      JSON.stringify([
        { name: "a", value: "1", domain: ".x.com" },
        { name: "b", value: "2", domain: ".y.com" },
      ])
    );

    const cookies = loadCookiesFromFile(filePath);
    expect(cookies).toHaveLength(2);
    expect(cookies[0]!.name).toBe("a");
    expect(cookies[1]!.name).toBe("b");
  });

  it("loads a Netscape .txt file", () => {
    const filePath = join(tmpDir, "cookies.txt");
    writeFileSync(filePath, ".example.com\tTRUE\t/\tFALSE\t0\tsession\tabc\n");

    const cookies = loadCookiesFromFile(filePath);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]!.name).toBe("session");
  });

  it("falls back to JSON for .txt file with JSON content", () => {
    const filePath = join(tmpDir, "cookies.txt");
    writeFileSync(filePath, JSON.stringify({ name: "x", value: "y", domain: ".a.com" }));

    const cookies = loadCookiesFromFile(filePath);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]!.name).toBe("x");
  });

  it("throws on file not found", () => {
    expect(() => loadCookiesFromFile("/nonexistent/cookies.json")).toThrow("Cookie file not found");
  });

  it("throws on unparseable file", () => {
    const filePath = join(tmpDir, "bad.txt");
    writeFileSync(filePath, "this is not any known format");

    expect(() => loadCookiesFromFile(filePath)).toThrow("Could not parse cookie file");
  });
});

describe("parseCookieArg", () => {
  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("detects file reference with @", () => {
    const filePath = join(tmpDir, "cookies.json");
    writeFileSync(filePath, JSON.stringify({ name: "x", value: "y", domain: ".a.com" }));

    const cookies = parseCookieArg(`@${filePath}`);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]!.name).toBe("x");
  });

  it("detects JSON object", () => {
    const cookies = parseCookieArg('{"name":"x","value":"y","domain":".a.com"}');
    expect(cookies).toHaveLength(1);
    expect(cookies[0]!.name).toBe("x");
  });

  it("detects JSON array", () => {
    const cookies = parseCookieArg(
      '[{"name":"a","value":"1","domain":".x.com"},{"name":"b","value":"2","domain":".y.com"}]'
    );
    expect(cookies).toHaveLength(2);
  });

  it("detects key-value format", () => {
    const cookies = parseCookieArg("name=session;value=abc;domain=.example.com");
    expect(cookies).toHaveLength(1);
    expect(cookies[0]!.name).toBe("session");
  });
});

describe("parseAllCookies", () => {
  it("merges multiple cookie args", () => {
    const cookies = parseAllCookies([
      "name=a;value=1;domain=.x.com",
      '{"name":"b","value":"2","domain":".y.com"}',
    ]);
    expect(cookies).toHaveLength(2);
    expect(cookies.map((c) => c.name).sort()).toEqual(["a", "b"]);
  });

  it("deduplicates by name+domain (last wins)", () => {
    const cookies = parseAllCookies([
      "name=token;value=old;domain=.example.com",
      "name=token;value=new;domain=.example.com",
    ]);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]!.value).toBe("new");
  });

  it("allows same name on different domains", () => {
    const cookies = parseAllCookies([
      "name=token;value=a;domain=.x.com",
      "name=token;value=b;domain=.y.com",
    ]);
    expect(cookies).toHaveLength(2);
  });

  it("returns empty array for no args", () => {
    const cookies = parseAllCookies([]);
    expect(cookies).toEqual([]);
  });
});

describe("cookieSummary", () => {
  it("returns message for no cookies", () => {
    expect(cookieSummary([])).toBe("No cookies loaded.");
  });

  it("returns summary for single cookie", () => {
    const summary = cookieSummary([{ name: "session", value: "secret", domain: ".example.com" }]);
    expect(summary).toContain("Loaded 1 cookie for 1 domain");
    expect(summary).toContain("session (.example.com)");
    expect(summary).not.toContain("secret");
  });

  it("returns summary for multiple cookies on multiple domains", () => {
    const summary = cookieSummary([
      { name: "alpha", value: "secretA", domain: ".x.com" },
      { name: "beta", value: "secretB", domain: ".y.com" },
      { name: "gamma", value: "secretC", domain: ".x.com" },
    ]);
    expect(summary).toContain("Loaded 3 cookies for 2 domains");
    expect(summary).toContain("alpha (.x.com)");
    expect(summary).toContain("beta (.y.com)");
    expect(summary).toContain("gamma (.x.com)");
    // Must never leak values
    expect(summary).not.toContain("secretA");
    expect(summary).not.toContain("secretB");
    expect(summary).not.toContain("secretC");
  });
});
