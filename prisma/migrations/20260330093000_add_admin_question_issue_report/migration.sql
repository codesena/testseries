-- CreateTable
CREATE TABLE "AdminQuestionIssueReports" (
    "id" BIGSERIAL NOT NULL,
    "questionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "issue" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminQuestionIssueReports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminQuestionIssueReports_questionId_createdAt_idx" ON "AdminQuestionIssueReports"("questionId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminQuestionIssueReports_userId_createdAt_idx" ON "AdminQuestionIssueReports"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "AdminQuestionIssueReports" ADD CONSTRAINT "AdminQuestionIssueReports_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminQuestionIssueReports" ADD CONSTRAINT "AdminQuestionIssueReports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
