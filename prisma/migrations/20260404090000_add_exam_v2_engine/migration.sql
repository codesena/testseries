-- CreateEnum
CREATE TYPE "ExamV2SubjectCode" AS ENUM ('PHYSICS', 'CHEMISTRY', 'MATHEMATICS');

-- CreateEnum
CREATE TYPE "ExamV2BlockType" AS ENUM ('QUESTION', 'PARAGRAPH');

-- CreateEnum
CREATE TYPE "ExamV2QuestionType" AS ENUM ('SINGLE_CORRECT', 'MULTI_CORRECT', 'MATCHING_LIST', 'NAT_INTEGER', 'NAT_DECIMAL');

-- CreateEnum
CREATE TYPE "ExamV2AttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "ExamV2AnswerState" AS ENUM ('NOT_VISITED', 'VISITED_NOT_ANSWERED', 'ANSWERED_SAVED', 'MARKED_FOR_REVIEW', 'ANSWERED_MARKED_FOR_REVIEW');

-- CreateEnum
CREATE TYPE "ExamV2RuleKind" AS ENUM ('FULL', 'PARTIAL', 'NEGATIVE', 'ZERO');

-- CreateTable
CREATE TABLE "ExamV2" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructionsRichText" TEXT,
    "durationMinutes" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamV2_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamV2Subjects" (
    "id" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "subject" "ExamV2SubjectCode" NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "ExamV2Subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamV2Sections" (
    "id" UUID NOT NULL,
    "examSubjectId" UUID NOT NULL,
    "sectionCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructionsRich" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "config" JSONB,

    CONSTRAINT "ExamV2Sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamV2Blocks" (
    "id" UUID NOT NULL,
    "sectionId" UUID NOT NULL,
    "blockType" "ExamV2BlockType" NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "paragraphRich" TEXT,
    "paragraphAssets" JSONB,

    CONSTRAINT "ExamV2Blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamV2MarkingSchemes" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "questionType" "ExamV2QuestionType" NOT NULL,
    "unattemptedScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamV2MarkingSchemes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamV2MarkingRules" (
    "id" UUID NOT NULL,
    "schemeId" UUID NOT NULL,
    "ruleKind" "ExamV2RuleKind" NOT NULL,
    "priority" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "minCorrectSelected" INTEGER,
    "maxCorrectSelected" INTEGER,
    "minIncorrectSelected" INTEGER,
    "maxIncorrectSelected" INTEGER,
    "requireAllCorrect" BOOLEAN NOT NULL DEFAULT false,
    "requireZeroIncorrect" BOOLEAN NOT NULL DEFAULT false,
    "requireUnattempted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ExamV2MarkingRules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamV2Questions" (
    "id" UUID NOT NULL,
    "blockId" UUID NOT NULL,
    "questionType" "ExamV2QuestionType" NOT NULL,
    "stemRich" TEXT NOT NULL,
    "stemAssets" JSONB,
    "payload" JSONB,
    "difficultyRank" INTEGER,
    "marksSchemeId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamV2Questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamV2QuestionOptions" (
    "id" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "optionKey" TEXT NOT NULL,
    "labelRich" TEXT NOT NULL,
    "assets" JSONB,
    "sortOrder" INTEGER NOT NULL,
    "isCorrect" BOOLEAN,

    CONSTRAINT "ExamV2QuestionOptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamV2QuestionMatchItems" (
    "id" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "listName" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "labelRich" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "ExamV2QuestionMatchItems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamV2Attempts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "status" "ExamV2AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledEndAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "lastHeartbeatAt" TIMESTAMP(3),
    "clientOffsetMs" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ExamV2Attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamV2Responses" (
    "attemptId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "responseJson" JSONB,
    "numericValue" DECIMAL(12,2),
    "answerState" "ExamV2AnswerState" NOT NULL DEFAULT 'NOT_VISITED',
    "timeSpentSeconds" INTEGER NOT NULL DEFAULT 0,
    "marksAwarded" DOUBLE PRECISION,
    "evaluatedAt" TIMESTAMP(3),
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamV2Responses_pkey" PRIMARY KEY ("attemptId","questionId")
);

-- CreateTable
CREATE TABLE "ExamV2AttemptEvents" (
    "id" BIGSERIAL NOT NULL,
    "attemptId" UUID NOT NULL,
    "clientEventId" TEXT NOT NULL,
    "questionId" UUID,
    "eventType" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamV2AttemptEvents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExamV2_code_key" ON "ExamV2"("code");

-- CreateIndex
CREATE INDEX "ExamV2_isActive_createdAt_idx" ON "ExamV2"("isActive", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExamV2Subjects_examId_subject_key" ON "ExamV2Subjects"("examId", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "ExamV2Subjects_examId_sortOrder_key" ON "ExamV2Subjects"("examId", "sortOrder");

-- CreateIndex
CREATE INDEX "ExamV2Subjects_examId_sortOrder_idx" ON "ExamV2Subjects"("examId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ExamV2Sections_examSubjectId_sectionCode_key" ON "ExamV2Sections"("examSubjectId", "sectionCode");

-- CreateIndex
CREATE UNIQUE INDEX "ExamV2Sections_examSubjectId_sortOrder_key" ON "ExamV2Sections"("examSubjectId", "sortOrder");

-- CreateIndex
CREATE INDEX "ExamV2Sections_examSubjectId_sortOrder_idx" ON "ExamV2Sections"("examSubjectId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ExamV2Blocks_sectionId_sortOrder_key" ON "ExamV2Blocks"("sectionId", "sortOrder");

-- CreateIndex
CREATE INDEX "ExamV2Blocks_sectionId_sortOrder_idx" ON "ExamV2Blocks"("sectionId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ExamV2MarkingSchemes_name_key" ON "ExamV2MarkingSchemes"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ExamV2MarkingRules_schemeId_priority_key" ON "ExamV2MarkingRules"("schemeId", "priority");

-- CreateIndex
CREATE INDEX "ExamV2MarkingRules_schemeId_priority_idx" ON "ExamV2MarkingRules"("schemeId", "priority");

-- CreateIndex
CREATE INDEX "ExamV2Questions_blockId_idx" ON "ExamV2Questions"("blockId");

-- CreateIndex
CREATE INDEX "ExamV2Questions_questionType_idx" ON "ExamV2Questions"("questionType");

-- CreateIndex
CREATE UNIQUE INDEX "ExamV2QuestionOptions_questionId_optionKey_key" ON "ExamV2QuestionOptions"("questionId", "optionKey");

-- CreateIndex
CREATE UNIQUE INDEX "ExamV2QuestionOptions_questionId_sortOrder_key" ON "ExamV2QuestionOptions"("questionId", "sortOrder");

-- CreateIndex
CREATE INDEX "ExamV2QuestionOptions_questionId_sortOrder_idx" ON "ExamV2QuestionOptions"("questionId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ExamV2QuestionMatchItems_questionId_listName_itemKey_key" ON "ExamV2QuestionMatchItems"("questionId", "listName", "itemKey");

-- CreateIndex
CREATE UNIQUE INDEX "ExamV2QuestionMatchItems_questionId_listName_sortOrder_key" ON "ExamV2QuestionMatchItems"("questionId", "listName", "sortOrder");

-- CreateIndex
CREATE INDEX "ExamV2QuestionMatchItems_questionId_listName_sortOrder_idx" ON "ExamV2QuestionMatchItems"("questionId", "listName", "sortOrder");

-- CreateIndex
CREATE INDEX "ExamV2Attempts_userId_status_idx" ON "ExamV2Attempts"("userId", "status");

-- CreateIndex
CREATE INDEX "ExamV2Attempts_examId_status_idx" ON "ExamV2Attempts"("examId", "status");

-- CreateIndex
CREATE INDEX "ExamV2Responses_attemptId_lastUpdated_idx" ON "ExamV2Responses"("attemptId", "lastUpdated");

-- CreateIndex
CREATE UNIQUE INDEX "ExamV2AttemptEvents_attemptId_clientEventId_key" ON "ExamV2AttemptEvents"("attemptId", "clientEventId");

-- CreateIndex
CREATE INDEX "ExamV2AttemptEvents_attemptId_createdAt_idx" ON "ExamV2AttemptEvents"("attemptId", "createdAt");

-- AddForeignKey
ALTER TABLE "ExamV2Subjects" ADD CONSTRAINT "ExamV2Subjects_examId_fkey" FOREIGN KEY ("examId") REFERENCES "ExamV2"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamV2Sections" ADD CONSTRAINT "ExamV2Sections_examSubjectId_fkey" FOREIGN KEY ("examSubjectId") REFERENCES "ExamV2Subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamV2Blocks" ADD CONSTRAINT "ExamV2Blocks_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "ExamV2Sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamV2MarkingRules" ADD CONSTRAINT "ExamV2MarkingRules_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "ExamV2MarkingSchemes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamV2Questions" ADD CONSTRAINT "ExamV2Questions_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "ExamV2Blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamV2Questions" ADD CONSTRAINT "ExamV2Questions_marksSchemeId_fkey" FOREIGN KEY ("marksSchemeId") REFERENCES "ExamV2MarkingSchemes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamV2QuestionOptions" ADD CONSTRAINT "ExamV2QuestionOptions_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "ExamV2Questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamV2QuestionMatchItems" ADD CONSTRAINT "ExamV2QuestionMatchItems_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "ExamV2Questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamV2Attempts" ADD CONSTRAINT "ExamV2Attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamV2Attempts" ADD CONSTRAINT "ExamV2Attempts_examId_fkey" FOREIGN KEY ("examId") REFERENCES "ExamV2"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamV2Responses" ADD CONSTRAINT "ExamV2Responses_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ExamV2Attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamV2Responses" ADD CONSTRAINT "ExamV2Responses_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "ExamV2Questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamV2AttemptEvents" ADD CONSTRAINT "ExamV2AttemptEvents_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ExamV2Attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamV2AttemptEvents" ADD CONSTRAINT "ExamV2AttemptEvents_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "ExamV2Questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
