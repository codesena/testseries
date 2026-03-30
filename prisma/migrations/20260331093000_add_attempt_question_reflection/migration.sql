-- CreateTable
CREATE TABLE "AttemptQuestionReflections" (
    "attemptId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "wrongReason" TEXT,
    "leftReason" TEXT,
    "slowReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttemptQuestionReflections_pkey" PRIMARY KEY ("attemptId","questionId")
);

-- CreateIndex
CREATE INDEX "AttemptQuestionReflections_questionId_updatedAt_idx" ON "AttemptQuestionReflections"("questionId", "updatedAt");

-- AddForeignKey
ALTER TABLE "AttemptQuestionReflections" ADD CONSTRAINT "AttemptQuestionReflections_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "StudentAttempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptQuestionReflections" ADD CONSTRAINT "AttemptQuestionReflections_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill from legacy ActivityLogs payload-based reflections (latest per attempt/question)
WITH ranked AS (
    SELECT
        a."attemptId",
        a."questionId",
        NULLIF(BTRIM(a."payload"->>'wrongReason'), '') AS "wrongReason",
        NULLIF(BTRIM(a."payload"->>'leftReason'), '') AS "leftReason",
        NULLIF(BTRIM(a."payload"->>'slowReason'), '') AS "slowReason",
        a."createdAt",
        ROW_NUMBER() OVER (
            PARTITION BY a."attemptId", a."questionId"
            ORDER BY a."createdAt" DESC, a."id" DESC
        ) AS rn
    FROM "ActivityLogs" a
    WHERE a."type" = 'SUBMIT'
      AND a."questionId" IS NOT NULL
      AND a."payload"->>'kind' = 'REPORT_REFLECTION'
)
INSERT INTO "AttemptQuestionReflections" (
    "attemptId",
    "questionId",
    "wrongReason",
    "leftReason",
    "slowReason",
    "createdAt",
    "updatedAt"
)
SELECT
    r."attemptId",
    r."questionId",
    r."wrongReason",
    r."leftReason",
    r."slowReason",
    r."createdAt",
    NOW()
FROM ranked r
WHERE r.rn = 1
  AND (r."wrongReason" IS NOT NULL OR r."leftReason" IS NOT NULL OR r."slowReason" IS NOT NULL)
ON CONFLICT ("attemptId", "questionId") DO NOTHING;
