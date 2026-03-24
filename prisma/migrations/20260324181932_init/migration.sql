-- CreateEnum
CREATE TYPE "MarkingSchemeType" AS ENUM ('MAINS_SINGLE', 'MAINS_NUMERICAL', 'ADV_MULTI_CORRECT', 'ADV_NAT');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED');

-- CreateEnum
CREATE TYPE "PaletteStatus" AS ENUM ('NOT_VISITED', 'VISITED_NOT_ANSWERED', 'ANSWERED_SAVED', 'MARKED_FOR_REVIEW', 'ANSWERED_MARKED_FOR_REVIEW');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('QUESTION_LOAD', 'NAVIGATE', 'SAVE_NEXT', 'MARK_REVIEW_NEXT', 'CLEAR_RESPONSE', 'PALETTE_CLICK', 'IDLE_START', 'IDLE_END', 'TAB_HIDDEN', 'TAB_VISIBLE', 'FULLSCREEN_ENTER', 'FULLSCREEN_EXIT', 'HEARTBEAT', 'SUBMIT');

-- CreateTable
CREATE TABLE "SubjectCategories" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "SubjectCategories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Questions" (
    "id" UUID NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "topicName" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "imageUrls" JSONB,
    "options" JSONB NOT NULL,
    "correctAnswer" JSONB NOT NULL,
    "markingSchemeType" "MarkingSchemeType" NOT NULL,
    "difficultyRank" INTEGER,

    CONSTRAINT "Questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestSeries" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "totalDurationMinutes" INTEGER NOT NULL DEFAULT 180,
    "isAdvancedFormat" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestQuestions" (
    "testId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "orderIndex" INTEGER NOT NULL,

    CONSTRAINT "TestQuestions_pkey" PRIMARY KEY ("testId","questionId")
);

-- CreateTable
CREATE TABLE "Users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentAttempts" (
    "id" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "testId" UUID NOT NULL,
    "startTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTimestamp" TIMESTAMP(3),
    "overallScore" DOUBLE PRECISION,
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "questionOrder" JSONB NOT NULL,
    "optionOrders" JSONB NOT NULL,

    CONSTRAINT "StudentAttempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionResponses" (
    "id" BIGSERIAL NOT NULL,
    "attemptId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "selectedAnswer" JSONB,
    "paletteStatus" "PaletteStatus" NOT NULL,
    "timeSpentSeconds" INTEGER NOT NULL DEFAULT 0,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionResponses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLogs" (
    "id" BIGSERIAL NOT NULL,
    "attemptId" UUID NOT NULL,
    "questionId" UUID,
    "type" "ActivityType" NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLogs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubjectCategories_name_key" ON "SubjectCategories"("name");

-- CreateIndex
CREATE INDEX "Questions_subjectId_idx" ON "Questions"("subjectId");

-- CreateIndex
CREATE INDEX "TestQuestions_testId_orderIndex_idx" ON "TestQuestions"("testId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "Users_username_key" ON "Users"("username");

-- CreateIndex
CREATE INDEX "StudentAttempts_studentId_idx" ON "StudentAttempts"("studentId");

-- CreateIndex
CREATE INDEX "StudentAttempts_testId_idx" ON "StudentAttempts"("testId");

-- CreateIndex
CREATE INDEX "QuestionResponses_attemptId_idx" ON "QuestionResponses"("attemptId");

-- CreateIndex
CREATE INDEX "QuestionResponses_questionId_idx" ON "QuestionResponses"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionResponses_attemptId_questionId_key" ON "QuestionResponses"("attemptId", "questionId");

-- CreateIndex
CREATE INDEX "ActivityLogs_attemptId_createdAt_idx" ON "ActivityLogs"("attemptId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLogs_questionId_idx" ON "ActivityLogs"("questionId");

-- AddForeignKey
ALTER TABLE "Questions" ADD CONSTRAINT "Questions_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "SubjectCategories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestQuestions" ADD CONSTRAINT "TestQuestions_testId_fkey" FOREIGN KEY ("testId") REFERENCES "TestSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestQuestions" ADD CONSTRAINT "TestQuestions_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentAttempts" ADD CONSTRAINT "StudentAttempts_testId_fkey" FOREIGN KEY ("testId") REFERENCES "TestSeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionResponses" ADD CONSTRAINT "QuestionResponses_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "StudentAttempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionResponses" ADD CONSTRAINT "QuestionResponses_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLogs" ADD CONSTRAINT "ActivityLogs_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "StudentAttempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLogs" ADD CONSTRAINT "ActivityLogs_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
