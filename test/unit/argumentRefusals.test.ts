/**
 * The code a refused argument opens with.
 *
 * A caller branches on that code, and the schema refuses along several paths:
 * an argument that is not declared, one written outside its bounds, one of
 * another type, a value outside the set a tool reads. A code carried by one
 * path and missing from the others is a vocabulary a caller finds one time out
 * of two, which is worse than one it never finds.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { strictInput } from "../../src/tools/arguments.js";

const declared = strictInput({
  limit: z.number().int().min(1).max(50).default(10),
  query: z.string().min(2),
  kind: z.enum(["one", "two"]).optional(),
});

/**
 * Containers, owned by this file.
 *
 * The agreement this file states holds for the shapes a declaration can take,
 * so it is stated over shapes this file owns. A tool that changes which
 * arguments it takes leaves the coverage where it is.
 */
const nested = strictInput({
  sections: z.array(z.enum(["one", "two"])).default(["one"]),
  ids: z.array(z.number().int().min(1)).optional(),
});

/** What a caller is told, for an input a declaration cannot accept. */
function refusalFrom(schema: { safeParse: (input: unknown) => unknown }, input: unknown): string {
  const outcome = schema.safeParse(input) as
    | { success: true }
    | { success: false; error: { issues: { message: string }[] } };
  if (outcome.success) {
    throw new Error(`${JSON.stringify(input)} was accepted, so it refuses nothing to read`);
  }
  return outcome.error.issues.map((issue) => issue.message).join(" ");
}

function refusalOf(input: unknown): string {
  return refusalFrom(declared, input);
}

describe("the code a refused argument opens with", () => {
  it("names it on an argument the tool does not declare", () => {
    expect(refusalOf({ query: "written", nope: 1 })).toContain("[invalid_input]");
  });

  it("names it on an argument written outside its bounds", () => {
    expect(refusalOf({ query: "written", limit: 500 })).toContain("[invalid_input]");
  });

  it("names it on an argument written as another type", () => {
    expect(refusalOf({ query: 5 })).toContain("[invalid_input]");
  });

  it("names it on a value outside the set the argument reads", () => {
    expect(refusalOf({ query: "written", kind: "three" })).toContain("[invalid_input]");
  });

  it("names it on an argument left out", () => {
    expect(refusalOf({ limit: 3 })).toContain("[invalid_input]");
  });

  it("keeps the validator's own wording behind the code", () => {
    // Rewriting these sentences by hand would freeze them to the version
    // installed the day they were written.
    expect(refusalOf({ query: "written", limit: 500 })).toContain("Too big");
  });
});

describe("the code a refusal from inside a container opens with", () => {
  it("names it on a value outside the set an element reads", () => {
    // The set is declared on the element, so the refusal is raised by a schema
    // one level below the argument. A caller reading the vocabulary has no way
    // to know which level answered.
    expect(refusalFrom(nested, { sections: ["three"] })).toContain("[invalid_input]");
  });

  it("names it on an element written as another type", () => {
    expect(refusalFrom(nested, { sections: [5] })).toContain("[invalid_input]");
  });

  it("names it on an element written outside its bounds", () => {
    expect(refusalFrom(nested, { ids: [0] })).toContain("[invalid_input]");
  });

  it("names it on a container written as another type", () => {
    expect(refusalFrom(nested, { sections: "one" })).toContain("[invalid_input]");
  });

  it("points at the element that was refused", () => {
    // A caller fixing the call needs to know which member of the list is wrong.
    const outcome = nested.safeParse({ sections: ["one", "three"] });

    expect(outcome.success).toBe(false);
    if (!outcome.success) {
      expect(outcome.error.issues[0]?.path).toEqual(["sections", 1]);
    }
  });

  it("keeps the validator's own wording behind the code there too", () => {
    expect(refusalFrom(nested, { ids: [0] })).toContain("Too small");
  });
});
