import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import { createLogger } from "../../src/config.js";
import { HEAVY_MARKERS, fixtureRouter, fixtureText, testConfig } from "./_helpers.js";

const logger = createLogger("silent");
const searchResults = fixtureText("search-results.xml");

async function connect(fetchImpl: typeof fetch): Promise<Client> {
  const server = createServer({ config: testConfig(), logger, fetchImpl });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

interface ToolCallResult {
  isError?: boolean;
  content?: { type: string; text?: string }[];
  structuredContent?: Record<string, unknown>;
}

async function call(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  return (await client.callTool({ name, arguments: args })) as ToolCallResult;
}

function textOf(result: ToolCallResult): string {
  return (result.content ?? []).map((part) => part.text ?? "").join("\n");
}

describe("tool registration", () => {
  it("exposes exactly the four documented tools", async () => {
    const client = await connect(fixtureRouter().impl);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "get_news",
      "get_title",
      "list_recent",
      "search_titles",
    ]);
  });

  it("declares every tool read-only", async () => {
    const client = await connect(fixtureRouter().impl);
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint, `${tool.name} readOnlyHint`).toBe(true);
      expect(tool.annotations?.destructiveHint ?? false, `${tool.name} destructiveHint`).toBe(
        false,
      );
    }
  });

  it("describes each tool and its inputs", async () => {
    const client = await connect(fixtureRouter().impl);
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.description ?? "", `${tool.name} description`).not.toBe("");
      expect(tool.inputSchema.type, `${tool.name} inputSchema`).toBe("object");
    }
  });
});

describe("search_titles", () => {
  it("hands back rows a model can act on", async () => {
    const client = await connect(fixtureRouter().impl);
    const result = await call(client, "search_titles", { query: "placeholder" });
    expect(result.isError ?? false).toBe(false);
    const structured = result.structuredContent as {
      results: Record<string, unknown>[];
      total_available: number;
    };
    expect(structured.total_available).toBe(5);
    expect(structured.results[0]).toMatchObject({
      id: 4241,
      kind: "anime",
      name: "Placeholder Drifters of the Void 1",
      source_url: "https://www.animenewsnetwork.com/encyclopedia/anime.php?id=4241",
    });
  });

  it("leaks no cast, staff, episode or news string anywhere in the result", async () => {
    // The upstream search response embeds the complete record of every match,
    // which is what makes an unfiltered search cost a context window.
    const client = await connect(fixtureRouter().impl);
    const result = await call(client, "search_titles", { query: "placeholder", limit: 50 });
    const serialized = JSON.stringify(result);

    for (const marker of HEAVY_MARKERS) {
      expect(searchResults, `"${marker}" is missing from the fixture`).toContain(marker);
      expect(serialized, `"${marker}" leaked into a search result`).not.toContain(marker);
    }
    expect(serialized.length).toBeLessThan(searchResults.length / 3);
  });

  it("filters to one kind when asked", async () => {
    const client = await connect(fixtureRouter().impl);
    const result = await call(client, "search_titles", { query: "placeholder", kind: "manga" });
    const rows = (result.structuredContent as { results: { kind: string }[] }).results;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.kind).toBe("manga");
    }
  });

  it("reports a search that matched nothing as a success with no rows", async () => {
    // The site answers an empty search with the same <warning> element it uses
    // for failures. Surfacing that as not_found told the model to call
    // search_titles, which is the tool that had just answered.
    const client = await connect(
      fixtureRouter({ "api.xml?title=": "warning-no-search-results.xml" }).impl,
    );
    const result = await call(client, "search_titles", { query: "zzqq" });

    expect(result.isError ?? false).toBe(false);
    const structured = result.structuredContent as {
      results: unknown[];
      total_available: number;
      notes: string[];
    };
    expect(structured.results).toEqual([]);
    expect(structured.total_available).toBe(0);
    expect(structured.notes.join(" "), "the model needs to be told what to try next").toMatch(
      /shorter fragment|title only/i,
    );
    expect(textOf(result)).not.toContain("not_found");
  });

  it("surfaces a non-XML body as a parse_failure error", async () => {
    const client = await connect(fixtureRouter({ "api.xml?title=": "html-page.html" }).impl);
    const result = await call(client, "search_titles", { query: "placeholder" });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("parse_failure");
  });
});

describe("get_title", () => {
  it("returns the basic section only, by default", async () => {
    // A full record runs to tens of thousands of tokens, most of it cast, staff
    // and linked news. Sections are opt-in for that reason.
    const client = await connect(fixtureRouter().impl);
    const result = await call(client, "get_title", { id: 4241, kind: "anime" });
    expect(result.isError ?? false).toBe(false);

    const structured = result.structuredContent as Record<string, unknown>;
    for (const key of ["cast", "staff", "companies", "episodes", "news", "reviews"]) {
      expect(structured, `${key} must be absent unless it was asked for`).not.toHaveProperty(key);
    }
    expect(structured.title).toMatchObject({ id: 4241, kind: "anime" });
    expect(structured.genres).toEqual(["action", "adventure"]);
  });

  it("returns a section when it is asked for", async () => {
    const client = await connect(fixtureRouter().impl);
    const result = await call(client, "get_title", {
      id: 4241,
      kind: "anime",
      sections: ["basic", "cast"],
    });
    const structured = result.structuredContent as Record<string, unknown>;
    expect(structured.cast).toBeDefined();
    expect(JSON.stringify(structured.cast)).toContain("Voice Fixture Person");
    expect(structured).not.toHaveProperty("episodes");
  });

  it("surfaces an unknown id as a not_found error", async () => {
    const client = await connect(fixtureRouter({ "api.xml?anime=": "warning-no-result.xml" }).impl);
    const result = await call(client, "get_title", { id: 99_999_999, kind: "anime" });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("not_found");
  });

  it("rejects a nonsensical id without calling upstream", async () => {
    const stub = fixtureRouter();
    const client = await connect(stub.impl);
    expect((await call(client, "get_title", { kind: "anime" })).isError).toBe(true);
    expect((await call(client, "get_title", { id: -1, kind: "anime" })).isError).toBe(true);
    expect(stub.calls).toHaveLength(0);
  });
});

describe("list_recent", () => {
  it("lists what was added lately, with a link on every row", async () => {
    const client = await connect(fixtureRouter().impl);
    const result = await call(client, "list_recent", { kind: "anime", limit: 3 });
    expect(result.isError ?? false).toBe(false);
    const rows = (result.structuredContent as { rows: Record<string, unknown>[] }).rows;
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.source_url, `row ${String(row.id)}`).not.toBeNull();
    }
  });

  it("pages by what the site sent, not by what could be read", async () => {
    // Paging by what could be read shortens the page on one unreadable entry,
    // which reads as the end of the catalogue and, when it is not, shifts every
    // later page by one.
    const client = await connect(
      fixtureRouter({ "reports.xml?id=148": "report-partial.xml" }).impl,
    );
    const result = await call(client, "list_recent", { kind: "anime", limit: 3, offset: 0 });

    expect(result.isError ?? false).toBe(false);
    const structured = result.structuredContent as {
      rows: unknown[];
      next_offset: number | null;
      notes: string[];
    };
    expect(structured.rows).toHaveLength(2);
    expect(structured.next_offset, "paging must advance by the full item count").toBe(3);
    expect(structured.notes.join(" "), "a dropped entry must be reported, not hidden").toMatch(
      /1 entr(y|ies).*(could not be read|skipped)/i,
    );
  });

  it("stops paging when the site sends a short page", async () => {
    const client = await connect(fixtureRouter().impl);
    const result = await call(client, "list_recent", { kind: "anime", limit: 20 });
    expect((result.structuredContent as { next_offset: number | null }).next_offset).toBeNull();
  });

  it("browses titles alphabetically when given a starting letter", async () => {
    const stub = fixtureRouter();
    const client = await connect(stub.impl);
    const result = await call(client, "list_recent", { kind: "anime", starts_with: "P" });
    expect(result.isError ?? false).toBe(false);
    expect((result.structuredContent as { mode: string }).mode).toBe("browse");
    expect(decodeURIComponent(stub.calls[0] as string)).toContain("id=155");
  });

  it("refuses to browse a catalogue that has no titles", async () => {
    const stub = fixtureRouter();
    const client = await connect(stub.impl);
    const result = await call(client, "list_recent", { kind: "person", starts_with: "P" });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("invalid_input");
    expect(stub.calls).toHaveLength(0);
  });
});

describe("get_news", () => {
  it("returns the wire with a link on every story", async () => {
    const client = await connect(fixtureRouter().impl);
    const result = await call(client, "get_news", {});
    expect(result.isError ?? false).toBe(false);
    const items = (result.structuredContent as { items: Record<string, unknown>[] }).items;
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(String(item.link)).toContain("animenewsnetwork.com");
    }
  });

  it("keeps only the stories tagged with the requested category", async () => {
    const client = await connect(fixtureRouter().impl);
    const result = await call(client, "get_news", { category: "anime" });
    const items = (result.structuredContent as { items: { category: string }[] }).items;
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.category).toBe("Anime");
    }
  });

  it("reads the edition asked for rather than following a redirect to find it", async () => {
    const stub = fixtureRouter();
    const client = await connect(stub.impl);
    await call(client, "get_news", { feed: "reviews", edition: "uk" });
    expect(stub.calls[0]).toContain("ann-edition=uk");
  });
});

describe("the server as a whole", () => {
  it("never sends a request without identifying itself", async () => {
    const seen: (RequestInit | undefined)[] = [];
    const router = fixtureRouter();
    const impl = (async (input: unknown, init?: RequestInit) => {
      seen.push(init);
      return (router.impl as unknown as (i: unknown, n?: RequestInit) => Promise<Response>)(
        input,
        init,
      );
    }) as unknown as typeof fetch;

    const client = await connect(impl);
    await call(client, "search_titles", { query: "placeholder" });
    const headers = new Headers((seen[0]?.headers ?? {}) as Record<string, string>);
    expect(headers.get("user-agent")).toBeTruthy();
  });

  it("only ever reads from Anime News Network", async () => {
    const methods: string[] = [];
    const router = fixtureRouter();
    const impl = (async (input: unknown, init?: RequestInit) => {
      methods.push((init?.method ?? "GET").toUpperCase());
      return (router.impl as unknown as (i: unknown, n?: RequestInit) => Promise<Response>)(
        input,
        init,
      );
    }) as unknown as typeof fetch;

    const client = await connect(impl);
    await call(client, "search_titles", { query: "placeholder" });
    await call(client, "get_title", { id: 4241, kind: "anime" });
    await call(client, "list_recent", { kind: "anime" });
    await call(client, "get_news", {});
    expect([...new Set(methods)]).toEqual(["GET"]);
  });
});
