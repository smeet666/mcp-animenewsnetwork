/**
 * XML reading, kept free of any knowledge about the encyclopedia.
 *
 * This is the only module that touches the parser, and the only place a parser
 * error becomes an `AnnError`. That matters because a reports.xml id the site
 * does not recognise is answered with a full HTML page under HTTP 200: a strict
 * parser refuses it, and refusing loudly is what stops the server reporting a
 * failure as "nothing found".
 */

import { parseXml, XmlElement } from "@rgrove/parse-xml";
import { parseFailure } from "../errors.js";

/**
 * Parse a document and return its root element.
 *
 * Undefined named entities are left as literal text rather than raising. The
 * RSS descriptions occasionally carry HTML entities that XML does not define,
 * and a headline is not worth failing a whole feed over.
 */
export function parseDocument(xml: string, url: string): XmlElement {
  let root: XmlElement | null;
  try {
    root = parseXml(xml, { ignoreUndefinedEntities: true }).root;
  } catch (error) {
    const first = error instanceof Error ? error.message.split("\n")[0]?.trim() : String(error);
    throw parseFailure(url, first || "the body is not well-formed XML");
  }

  if (!root) {
    throw parseFailure(url, "the document has no root element");
  }
  return root;
}

/** Assert the root element, so a feed handed to a title parser fails clearly. */
export function expectRoot(root: XmlElement, name: string, url: string): XmlElement {
  if (root.name !== name) {
    throw parseFailure(url, `expected a <${name}> root, found <${root.name}>`);
  }
  return root;
}

export function isElement(node: unknown): node is XmlElement {
  return node instanceof XmlElement;
}

/** Direct element children, optionally filtered by name. */
export function children(parent: XmlElement, name?: string): XmlElement[] {
  const found: XmlElement[] = [];
  for (const node of parent.children) {
    if (!isElement(node)) {
      continue;
    }
    if (name === undefined || node.name === name) {
      found.push(node);
    }
  }
  return found;
}

export function firstChild(parent: XmlElement, name: string): XmlElement | null {
  for (const node of parent.children) {
    if (isElement(node) && node.name === name) {
      return node;
    }
  }
  return null;
}

/** An attribute, with empty strings normalised to null. */
export function attr(element: XmlElement, name: string): string | null {
  const value = element.attributes[name];
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function intAttr(element: XmlElement, name: string): number | null {
  const raw = attr(element, name);
  if (raw === null) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function floatAttr(element: XmlElement, name: string): number | null {
  const raw = attr(element, name);
  if (raw === null) {
    return null;
  }
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Text content of an element and its descendants, or null when blank. */
export function textOf(element: XmlElement | null): string | null {
  if (!element) {
    return null;
  }
  const text = element.text.trim();
  return text === "" ? null : text;
}

export function childText(parent: XmlElement, name: string): string | null {
  return textOf(firstChild(parent, name));
}
