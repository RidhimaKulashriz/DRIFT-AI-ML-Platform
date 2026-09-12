import { describe, expect, it } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";
import { askDriftAi } from "./driftAi";
import { rankApprovedKnowledge, tokenizeKnowledgeQuery } from "./rag";

describe("approved-source RAG safeguards", () => {
  it("normalizes a bounded keyword query and ranks the strongest approved chunk first", () => {
    expect(tokenizeKnowledgeQuery("What is the contractor SLA for bridge closure?")).toEqual(expect.arrayContaining(["contractor", "sla", "bridge", "closure"]));
    const ranked = rankApprovedKnowledge("bridge contractor closure SLA", [
      { chunkId: 2, documentId: 2, title: "Landscape plan", version: "1", sourceReference: null, sectionReference: "Chunk 1", content: "Vegetation inspection cadence." },
      { chunkId: 1, documentId: 1, title: "Bridge contractor SLA", version: "v2", sourceReference: "project://sla/bridge", sectionReference: "Closure target", content: "Contractor closure proof is followed by engineer verification under this SLA." },
    ]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]).toMatchObject({ chunkId: 1, documentId: 1, score: expect.any(Number) });
  });

  it("refuses a project-specific answer when no approved citation packet exists", async () => {
    const response = await askDriftAi("Can I close this bridge ticket?", {}, [], { sourceOnly: true, citations: [] });
    expect(response.source).toBe("approved-source-refusal");
    expect(response.answer).toMatch(/no approved, role-permitted source excerpt/i);
    expect(response.citations).toEqual([]);
  });

  it("blocks citizen accounts from registering knowledge content before any persistence mutation", async () => {
    const ctx = { user: { id: 5, role: "citizen" }, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] } as TrpcContext;
    await expect(appRouter.createCaller(ctx).drift.accountability.knowledge.registerDraft({ projectScope: "bridge-01", title: "Unauthorized source", documentType: "note", version: "v1", permittedRoles: ["citizen"], content: "This is deliberately long enough to satisfy validation, but a citizen account cannot register project knowledge for approval in the contractor knowledge base." })).rejects.toThrow(/does not permit/);
  });
});
