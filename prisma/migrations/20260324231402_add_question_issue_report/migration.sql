-- CreateTable
CREATE TABLE "QuestionIssueReports" (
    "id" BIGSERIAL NOT NULL,
    "attemptId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "issue" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionIssueReports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuestionIssueReports_attemptId_createdAt_idx" ON "QuestionIssueReports"("attemptId", "createdAt");

-- CreateIndex
CREATE INDEX "QuestionIssueReports_questionId_createdAt_idx" ON "QuestionIssueReports"("questionId", "createdAt");

-- CreateIndex
CREATE INDEX "QuestionIssueReports_userId_createdAt_idx" ON "QuestionIssueReports"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "QuestionIssueReports" ADD CONSTRAINT "QuestionIssueReports_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "StudentAttempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionIssueReports" ADD CONSTRAINT "QuestionIssueReports_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionIssueReports" ADD CONSTRAINT "QuestionIssueReports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
