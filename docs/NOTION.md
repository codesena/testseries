# Notion Import (Seeder Guide)

This repo can seed tests/questions from a Notion **database** using the script `npm run db:seed:notion`.

## Setup

1) Create a Notion internal integration and copy its token.

2) Share your Notion Questions database with that integration.

3) Add env vars to `.env`:

- `NOTION_TOKEN`
- `NOTION_DATABASE_ID`
  - Can be a database id, OR a page id that contains an embedded database
- `NOTION_DATABASE_TITLE` (optional)
  - Only needed if `NOTION_DATABASE_ID` points to a page with multiple embedded databases
- `NOTION_IMPORT_MODE`
  - `error` (default): fails if a test with the same title already exists
  - `replace`: overwrites an existing test with the same title
    - This will delete **all attempts** for that test (and cascades responses/activities/issue reports), then re-import questions

Run:

- Local import: `npm run db:seed:notion`

## Production import

There is a separate “prod safety” wrapper:

- `DATABASE_URL_PROD` (or `PROD_DATABASE_URL`)
- `CONFIRM_PROD_SEED=yes`

Run:

- `npm run db:seed:prod:notion`

## Notion Database Schema (Property Names)

Property names are case-insensitive in the importer (it normalizes name matching), but it’s best to keep them exact.

### Required

- `Test Title` (title or rich text)
- `Duration Minutes` (number; or rich text that parses as a number)
- `Advanced` (checkbox; or rich text like `true/false`)
- `Order` (number; or rich text integer)
- `Subject` (select or multi-select: Physics/Chemistry/Mathematics)
- `Topic` (rich text)
- `Type` (select or rich text: `MCQ` or `Numerical`)
- `Question` (rich text)

### MCQ-only

- `Option A`, `Option B`, `Option C`, `Option D` (rich text)
- `Option A Image URL`, `Option B Image URL`, `Option C Image URL`, `Option D Image URL`
  - Property type can be **url** or **rich text**
  - If there is no image, leave empty or write `null` (also accepts `none`, `na`, `n/a`, `-`)
  - Importer stores `imageUrl: null`
  - You can also provide multiple image URLs separated by commas/newlines/semicolons
- `Correct Option` (select or rich text: A/B/C/D)

### Numerical-only

- `Correct Integer` (number; must be an integer)

### Optional (Question images)

Use any ONE of these columns:

- Preferred: `Question URLs`
- Aliases supported: `Question URL`, `Question Image URLs`, `Question Image URL`, `Image URLs`, `Image URL`

Value format:

- You can put multiple image URLs separated by commas, newlines, or semicolons
- Tokens like `null` / `none` / `na` / `n/a` / `-` are ignored
- Example:
  - `https://.../q1.png, https://.../q1-2.png`

Importer stores this into the DB as:

- `Question.imageUrls: string[]`

### Optional

- `Difficulty` (number; or rich text that parses as a number)

## How data maps into the app

- Question text renders with MathJax; write LaTeX as `$...$`.
- Question images render above/below text depending on UI, sourced from `imageUrls`.
- Options store an object for each key:

```json
{
  "A": { "text": "...", "imageUrl": "https://..." },
  "B": { "text": "...", "imageUrl": null },
  "C": { "text": "...", "imageUrl": null },
  "D": { "text": "...", "imageUrl": "https://..." }
}
```

## Common import errors

- **Unbalanced `$`**: importer rejects question/options where `$` count is odd (broken LaTeX delimiter pairs). Fix the Notion cell so `$...$` pairs are complete.
- **MCQ requires 4 options**: for MCQ rows, each option must have either text, an image URL, or both.
- **Duplicate test title**: set `NOTION_IMPORT_MODE=replace` to overwrite.
