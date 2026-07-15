# Test Factories

Store reusable builders for test data here.

Factories should create valid domain objects by default and expose overrides for the fields a test actually cares about.

Current shared builders:

- `smart-writer.ts`: project, chapter, entity, entity suggestion, relation suggestion, entity link builders for integration/e2e seed data.
