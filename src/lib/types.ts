export type TestListItem = {
    id: string;
    title: string;
    totalDurationMinutes: number;
    isAdvancedFormat: boolean;
    createdAt: string;
    _count: { questions: number };
};

export type QuestionOption = { key: string; text: string; imageUrl?: string | null };

export type AttemptQuestion = {
    id: string;
    subject: { id: number; name: string };
    topicName: string;
    questionText: string;
    imageUrls: string[] | null;
    options: QuestionOption[];
    markingSchemeType: string;
};

export type AttemptResponse = {
    questionId: string;
    selectedAnswer: unknown;
    paletteStatus: string;
    timeSpentSeconds: number;
    lastUpdated: string;
};

export type AttemptPayload = {
    attempt: {
        id: string;
        status: string;
        startTimestamp: string;
        serverNow: string;
        test: { id: string; title: string; totalDurationMinutes: number };
        questions: AttemptQuestion[];
        responses: AttemptResponse[];
        studentName: string | null;
    };
};
