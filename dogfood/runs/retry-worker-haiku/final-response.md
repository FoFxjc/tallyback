## Summary

**What Changed:**

Fixed a critical bug in `batcher/chunk.py` where the `chunk()` function was dropping oversized items (items larger than `max_bytes`). The bug was caused by a `continue` statement that skipped adding the oversized item to any batch.

**The Fix:**
1. **Reordered logic** to check for oversized items first (before checking byte/item limits)
2. **Proper handling of oversized items**: When an item exceeds `max_bytes`:
   - Emit any current batch (if non-empty) 
   - Emit the oversized item in its own batch
   - Skip to the next item (continue)
3. **Improved clarity** by changing `next_size` calculation to inline `current_size + size`
4. **Added comments** explaining the three checks: oversized items, byte limit, max items

**Verification:**

All 9 tests pass, including the 2 previously failing tests:
- ✅ `test_oversized_item_is_emitted_alone` - now passes
- ✅ `test_oversized_first_item` - now passes
- ✅ All other 7 existing tests continue to pass

**Acceptance Criteria Met:**

1. ✅ A batch contains at most `max_items` items
2. ✅ A batch of normal items contains at most `max_bytes` bytes total
3. ✅ An item larger than `max_bytes` is never dropped; emitted alone in its own batch
4. ✅ No empty batches are produced
5. ✅ Order is preserved: concatenating batches yields input items in order
6. ✅ All tests pass (9/9)

**Tallyback Task State:**
- ✅ Declared: "Fix the chunk() function to properly handle oversized items"
- ✅ Dispatched: Attempt created and completed
- ✅ Claim recorded: "All acceptance criteria are satisfied"
- ✅ Commit: `4a9ff99` - "Fix chunk batching bug: handle oversized items"
- Status: Awaiting verification step (begin-check)