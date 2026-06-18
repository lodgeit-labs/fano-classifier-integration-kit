# CI workflows

CI hygiene (per Lesson #29: "Kit deserves the same CI hygiene as the Brain") ships alongside η.1+ when the TypeScript SDK lands. At minimum:

- TypeScript compile check on PR
- Linting (eslint / prettier)
- Unit tests (vitest)
- Example fixture validation against the published schema

Empty at η.0 by design.
