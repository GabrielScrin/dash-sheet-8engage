

# Fix Build Errors in DashboardView.tsx

## Problem
TypeScript build errors at lines 2175-2181 where `reduce` accumulator properties `sum` and `count` are inferred as `unknown` instead of `number`.

## Root Cause
The `reduce` call returns `acc` directly when `!hasValue`, and TypeScript widens the accumulator type. The initial value `{ sum: 0, count: 0 }` needs an explicit type annotation.

## Fix
Add a type annotation to the `reduce` initial value:

```typescript
const { sum, count } = rows.reduce<{ sum: number; count: number }>(
  (acc, row) => {
    ...
  },
  { sum: 0, count: 0 },
);
```

This is a single-line change that resolves all 5 TS errors (lines 2175, 2176, 2181) since they all stem from the same untyped accumulator.

