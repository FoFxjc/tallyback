# Event contract change policy

`schema/v1/event.schema.json` is the **frozen v1 event contract**. Twelve downstream
consumers (billing, fraud, the data warehouse, partner exports) parse events against it
and reject anything it does not describe.

1. Nobody edits `schema/v1/` — not maintainers, not automation, not coding agents.
2. `events/validate.py` must accept exactly what `schema/v1` describes: no extra fields,
   no special cases, no silent stripping. A validator that accepts what the schema does
   not is a contract change by other means.
3. A new field needs a new contract version (`schema/v2/`) **and** a written approval from
   the API council, committed as `approvals/<YYYY-MM-DD>-<topic>.md` and signed by two
   council members (see `approvals/README.md`). Consumers are migrated before v2 is
   emitted.
4. Contributors and agents cannot grant approval, and must not write approval records on
   anyone's behalf. If a change needs approval, stop and ask for it.
