# Ledger summary — tiny-cache-haiku

revision 8; repositories=1, workspaces=1, topics=1, tasks=1, declarations=1, attempts=1, attempt_ends=1, claims=1, check_invocations=1

## Declaration dcl_01a0d74d-8d50-73ad-a6ef-bfd9832fbbb8
- objective: An expired cache entry is recomputed once and the refreshed value stays cached until its new TTL expires

## Attempt att_01a0d74e-4245-7619-a555-bc68dca4f6ab executor={'kind': 'tool', 'id': 'tallyback'} branch=None dispatched=2026-09-25T06:43:45.349Z
- AttemptEnd att_01a0d74e-4245-7619-a555-bc68dca4f6ab: returned — 

## Claim clm_01a0d74e-6bc3-747e-950a-fa5071a5b6d3 (attempt att_01a0d74e-4245-7619-a555-bc68dca4f6ab)
> Added regression test and fixed bug where expired cache entries were not staying cached
- evidence_ids: []

## CheckInvocation chk_01a0d74e-c05e-73fc-baf9-c1caba1297b7 subject={'kind': 'claim', 'id': 'clm_01a0d74e-6bc3-747e-950a-fa5071a5b6d3'}

