/**
 * Server-side NFT metadata validation.
 *
 * The upload route must accept only well-formed metadata documents; bad
 * input currently produces 400s but the rules live inline in the route.
 * This module declares the schema as data (JSON-Schema draft-07 style)
 * and runs a small self-contained validator over it, so the contract
 * between client and server is explicit, documented, and unit-testable.
 *
 * The validator implements the subset of JSON Schema the metadata uses
 * (type, required, properties, maxLength, minLength, items, enum,
 * additionalProperties) — no dependency needed.
 */

export interface SchemaNode {
  type?: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'integer' | 'null';
  required?: string[];
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
  maxLength?: number;
  minLength?: number;
  maximum?: number;
  minimum?: number;
  enum?: unknown[];
  additionalProperties?: boolean;
}

export type ValidationIssue = { path: string; message: string };

export const NFT_METADATA_SCHEMA: SchemaNode = {
  type: 'object',
  required: ['name'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 128 },
    description: { type: 'string', maxLength: 2000 },
    imageUri: { type: 'string', maxLength: 500 },
    animationUri: { type: 'string', maxLength: 500 },
    externalUrl: { type: 'string', maxLength: 500 },
    collectionId: { type: 'string', maxLength: 64 },
    royalties: { type: 'number', minimum: 0, maximum: 10000 },
    attributes: {
      type: 'array',
      items: {
        type: 'object',
        // A trait name may arrive as either camelCase or snake_case; only
        // value is strictly required (the server maps both spellings).
        required: ['value'],
        additionalProperties: true,
        properties: {
          traitType: { type: 'string', minLength: 1, maxLength: 64 },
          trait_type: { type: 'string', minLength: 1, maxLength: 64 },
          value: { type: 'string', minLength: 1, maxLength: 128 },
          displayType: { type: 'string', maxLength: 64 },
          display_type: { type: 'string', maxLength: 64 },
        },
      },
      // Bounded inline so a hostile payload cannot blow up memory later.
    },
  },
};

const MAX_ATTRIBUTE_ITEMS = 20;

function typeMatches(node: SchemaNode, value: unknown): boolean {
  switch (node.type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number';
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'object':
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
    case 'null':
      return value === null;
    default:
      return true;
  }
}

function validateNode(node: SchemaNode, value: unknown, path: string, issues: ValidationIssue[]) {
  if (value === undefined) {
    return; // Presence is governed by `required`.
  }

  if (node.type && !typeMatches(node, value)) {
    issues.push({ path, message: `expected ${node.type}` });
    return; // Stop: further checks assume the type.
  }

  if (typeof value === 'string') {
    if (node.minLength !== undefined && value.length < node.minLength) {
      issues.push({ path, message: `shorter than ${node.minLength} characters` });
    }
    if (node.maxLength !== undefined && value.length > node.maxLength) {
      issues.push({ path, message: `longer than ${node.maxLength} characters` });
    }
  }

  if (typeof value === 'number') {
    if (node.minimum !== undefined && value < node.minimum) {
      issues.push({ path, message: `less than ${node.minimum}` });
    }
    if (node.maximum !== undefined && value > node.maximum) {
      issues.push({ path, message: `greater than ${node.maximum}` });
    }
  }

  if (node.enum && !node.enum.includes(value)) {
    issues.push({ path, message: 'not in allowed values' });
  }

  if (node.type === 'object' && typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    if (node.properties) {
      for (const [key, child] of Object.entries(node.properties)) {
        validateNode(child, record[key], path ? `${path}.${key}` : key, issues);
      }
      if (node.additionalProperties === false) {
        for (const key of Object.keys(record)) {
          if (!node.properties[key]) {
            issues.push({ path: path ? `${path}.${key}` : key, message: 'unexpected property' });
          }
        }
      }
    }
    if (node.required) {
      for (const key of node.required) {
        if (record[key] === undefined) {
          issues.push({ path: path ? `${path}.${key}` : key, message: 'required' });
        }
      }
    }
  }

  if (node.type === 'array' && Array.isArray(value)) {
    if (node.items) {
      if (
        node.items === NFT_METADATA_SCHEMA.properties?.attributes?.items &&
        value.length > MAX_ATTRIBUTE_ITEMS
      ) {
        issues.push({ path, message: `more than ${MAX_ATTRIBUTE_ITEMS} items` });
      }
      value.forEach((item, index) => {
        validateNode(node.items!, item, `${path}[${index}]`, issues);
      });
    }
  }
}

/** Validate an unknown value against a schema node; returns all issues. */
export function validateAgainstSchema(schema: SchemaNode, value: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  validateNode(schema, value, '', issues);
  return issues;
}

/** Convenience: does the value conform to the NFT metadata schema? */
export function isValidNftMetadata(value: unknown): boolean {
  return validateAgainstSchema(NFT_METADATA_SCHEMA, value).length === 0;
}

/** Map schema issues onto a single human-readable message. */
export function formatIssues(issues: ValidationIssue[]): string {
  return issues
    .map((issue) => (issue.path ? `${issue.path}: ${issue.message}` : issue.message))
    .join('; ');
}
