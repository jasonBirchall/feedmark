// Feedmark background — iteration 0: do-nothing.
//
// This exists only so the extension has a loadable background context and the
// build/lint/typecheck loop has something real to compile. It performs no
// fetches and holds no state. Alarm-driven polling (with all poll state in
// storage.local, never in memory across wakes) arrives in iteration 2.

console.debug("feedmark: background context loaded");

export {};
