#!/usr/bin/env node
/**
 * MCP Server for Google Stitch — UI generation via AI.
 *
 * Proxies all Stitch tools through StitchToolClient so any
 * future tool additions from Google are automatically available.
 *
 * Required env: STITCH_API_KEY
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StitchToolClient } from "@google/stitch-sdk";
import { z } from "zod";

// ─── Validation ───────────────────────────────────────────────────────────────

const apiKey = process.env.STITCH_API_KEY;
if (!apiKey) {
  console.error("ERROR: STITCH_API_KEY environment variable is required");
  process.exit(1);
}

// ─── Clients ──────────────────────────────────────────────────────────────────

const stitchClient = new StitchToolClient({ apiKey });

const server = new McpServer({
  name: "stitch-mcp-server",
  version: "1.0.0",
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Converts a JSON Schema object into a flat Zod object schema.
 * Only handles top-level string/number/boolean/array/object properties
 * since Zod needs static types and Stitch schemas are simple.
 */
function jsonSchemaToZod(schema: Record<string, unknown>): Record<string, z.ZodTypeAny> {
  const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
  const required = (schema.required ?? []) as string[];
  const zodShape: Record<string, z.ZodTypeAny> = {};

  for (const [key, prop] of Object.entries(props)) {
    const isRequired = required.includes(key);
    let zodType: z.ZodTypeAny;

    if (prop.enum) {
      const values = prop.enum as [string, ...string[]];
      zodType = z.enum(values).describe((prop.description as string) ?? key);
    } else if (prop.type === "string") {
      zodType = z.string().describe((prop.description as string) ?? key);
    } else if (prop.type === "integer" || prop.type === "number") {
      zodType = z.number().describe((prop.description as string) ?? key);
    } else if (prop.type === "boolean") {
      zodType = z.boolean().describe((prop.description as string) ?? key);
    } else if (prop.type === "array") {
      zodType = z.array(z.unknown()).describe((prop.description as string) ?? key);
    } else {
      // object or $ref → accept anything
      zodType = z.unknown().describe((prop.description as string) ?? key);
    }

    zodShape[key] = isRequired ? zodType : zodType.optional();
  }

  return zodShape;
}

function handleError(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message;
    if (msg.includes("401") || msg.includes("403")) {
      return "Error: Authentication failed. Check your STITCH_API_KEY.";
    }
    if (msg.includes("404")) {
      return "Error: Resource not found. Check the project/screen ID.";
    }
    if (msg.includes("429")) {
      return "Error: Rate limit exceeded. Wait before retrying.";
    }
    return `Error: ${msg}`;
  }
  return `Error: ${String(error)}`;
}

// ─── Dynamic Tool Registration ────────────────────────────────────────────────

async function registerTools(): Promise<void> {
  await stitchClient.connect();

  // toolMap ships with the SDK — no network call needed
  const { toolDefinitions } = await import("@google/stitch-sdk");

  for (const toolDef of toolDefinitions) {
    const inputSchema = toolDef.inputSchema as Record<string, unknown>;
    const zodShape = jsonSchemaToZod(inputSchema);

    server.registerTool(
      `stitch_${toolDef.name}`,
      {
        title: toolDef.name
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase()),
        description: (toolDef.description as string) ?? toolDef.name,
        inputSchema: zodShape,
        annotations: {
          readOnlyHint: ["list_projects", "get_project", "list_screens", "get_screen", "list_design_systems"].includes(toolDef.name),
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      async (params: Record<string, unknown>) => {
        try {
          const result = await stitchClient.callTool(toolDef.name, params);
          const text = typeof result === "string"
            ? result
            : JSON.stringify(result, null, 2);
          return { content: [{ type: "text", text }] };
        } catch (error) {
          return {
            isError: true,
            content: [{ type: "text", text: handleError(error) }],
          };
        }
      }
    );
  }

  console.error(`✅ Registered ${toolDefinitions.length} Stitch tools`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  await registerTools();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("🎨 Stitch MCP server running via stdio");
}

main().catch((error: unknown) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
