# Vendor upstream

- Source: `../scxml-creator/src/core`
- Commit: `6b5cfb6` (2026-11-01)
- License: MIT (donor LICENSE; see ../scxml-creator/LICENSE)
- Synced by: `npm run sync:vendor`

Files: `model.ts`, `serializer.ts`, `action-parse.ts`, `validator.ts`, `naming.ts`, `scxml-import.ts`.

Do not edit these files by hand. Update the donor and re-run the sync script.
Local patch: validator.ts uses dynamic import so Node 22.9 CJS does not require() an ESM entry.
