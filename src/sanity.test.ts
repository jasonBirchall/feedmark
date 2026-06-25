import { test } from "node:test";
import assert from "node:assert/strict";

test("harness runs and strips type annotations", () => {
  const x: number = 2;
  assert.equal(x + 2, 4);
});
