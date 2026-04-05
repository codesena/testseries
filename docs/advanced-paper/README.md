# JEE Advanced Paper Schema (V2)

This README defines the authoring schema for JEE Advanced style papers in this project, based on the V2 exam model.

It is compatible with the V2 admin upsert payload accepted by the backend.

## 1) Paper Set Shape

Use two papers in one set:

- Paper 1
- Paper 2

```ts
export type AdvancedPaperSet = {
  papers: [ExamV2UpsertInput, ExamV2UpsertInput];
};
```

`ExamV2UpsertInput` structure:

```ts
type ExamV2UpsertInput = {
  code: string; // 3..64, [A-Za-z0-9_-]
  title: string; // 3..256
  durationMinutes: number; // 1..720
  instructionsRichText?: string;
  isActive?: boolean;
  subjects: SubjectInput[]; // at least 1
};

type SubjectInput = {
  subject: "PHYSICS" | "CHEMISTRY" | "MATHEMATICS";
  sections: SectionInput[]; // at least 1
};

type SectionInput = {
  sectionCode: string; // 1..32
  title: string; // 1..256
  instructionsRich?: string;
  config?: unknown;
  blocks: BlockInput[]; // at least 1
};

type BlockInput = {
  blockType: "QUESTION" | "PARAGRAPH";
  paragraphRich?: string;
  paragraphAssets?: unknown;
  questions: QuestionInput[];
};

type QuestionInput = {
  questionType: "SINGLE_CORRECT" | "MULTI_CORRECT" | "MATCHING_LIST" | "NAT_INTEGER" | "NAT_DECIMAL";
  stemRich: string;
  stemAssets?: unknown;
  payload?: unknown;
  difficultyRank?: number | null;
  markingSchemeName?: string;
  options?: {
    optionKey: string; // 1..16
    labelRich: string;
    assets?: unknown;
    isCorrect?: boolean;
  }[];
  matchItems?: {
    listName: string; // 1..64
    itemKey: string; // 1..32
    labelRich: string;
  }[];
};
```

## 2) Recommended Advanced Section Layout

Per subject, use all sections below:

- Section A: Single Correct
- Section B: Multi Correct
- Section C: Matching List
- Section D: Numerical (Integer/Decimal)

Recommended `sectionCode` convention:

- PHY-A, PHY-B, PHY-C, PHY-D
- CHE-A, CHE-B, CHE-C, CHE-D
- MAT-A, MAT-B, MAT-C, MAT-D

## 3) Correct Answer Payload Rules

Store answer keys in `question.payload.correctAnswer`:

- SINGLE_CORRECT: string option key, e.g. `"B"`
- MULTI_CORRECT: string array, e.g. `["A", "C"]`
- MATCHING_LIST: currently evaluated as normalized string in the current engine
- NAT_INTEGER / NAT_DECIMAL: numeric value, e.g. `42` or `3.14`

Note: if `payload.correctAnswer` is missing for single/multi, the engine can infer from options marked with `isCorrect`.

## 4) Marking Schemes

Set `markingSchemeName` to an existing scheme name from the database.

Examples already used in this project:

- V2_MAINS_SINGLE_4N1
- V2_ADV_MULTI_PARTIAL
- V2_NAT_STANDARD

If a scheme name does not exist, upsert fails.

## 5) Template

Use this file as a starting point:

- docs/advanced-paper/advanced-paper-set.template.json

## 6) Suggested Codes

- ADVANCE-PAPER-1
- ADVANCE-PAPER-2

These two papers together form one Advanced test set.

## 7) Seeding Into V2

Command:

- `npm run db:seed:v2-paper12`

Source priority:

- If `NOTION_TOKEN` and `NOTION_DATABASE_ID` are set: seeds from Notion
- Otherwise: seeds from `docs/advanced-paper/advanced-paper-set.template.json`

### Notion format for v2 paper seeding

Create a Notion database and add one row per payload (or a single row). Add a rich text/title property with one of these names:

- `Paper Set JSON` (recommended)
- `Paper JSON`
- `JSON`
- `Payload`
- `Schema`

Put either:

- full paper set JSON: `{ "papers": [ ... ] }`
- or a single paper JSON object

You can paste raw JSON or fenced JSON code blocks.
