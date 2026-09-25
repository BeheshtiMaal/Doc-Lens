import assert from "node:assert/strict";
import { test } from "node:test";
import { rerankEvidence } from "../src/lib/chat/rerank";

test("hybrid reranking promotes a precise lexical match within the vector candidate pool", () => {
  const candidates = [
    { id: "v1", content: "An annual travel corridor used by these ocean mammals.", distance: 0.05 },
    { id: "v2", content: "Marine mammals navigate long routes through the Pacific.", distance: 0.08 },
    { id: "v3", content: "Seasonal migration routes are tracked by researchers.", distance: 0.11 },
    { id: "v4", content: "Satellite tagging reveals movement patterns over time.", distance: 0.14 },
    { id: "v5", content: "The blue whale migration route follows the western coast.", distance: 0.17 },
  ];
  const reranked = rerankEvidence("blue whale migration route", candidates, 3);
  assert.equal(reranked[0].id, "v5");
  assert.equal(reranked.length, 3);
});

test("hybrid reranking preserves vector order when lexical terms do not overlap", () => {
  const candidates = [
    { id: "nearest", content: "The first passage.", distance: 0.04 },
    { id: "next", content: "A different passage.", distance: 0.12 },
  ];
  assert.deepEqual(rerankEvidence("Persian query terms", candidates, 2), candidates);
});
