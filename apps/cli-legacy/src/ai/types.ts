/**
 * Single quiz question with multiple choice answers
 */
export interface QuizQuestion {
  question: string;
  answers: QuizAnswer[];
}

/**
 * Single answer option for a quiz question
 */
export interface QuizAnswer {
  text: string;
  correct: boolean;
}

/**
 * Complete quiz content structure
 */
export interface QuizContent {
  questions: QuizQuestion[];
}

/**
 * H5P.MultipleChoice answer structure
 */
export interface H5pMultipleChoiceAnswer {
  text: string;
  correct?: boolean;
  tipsAndFeedback?: {
    tip?: string;
    chosenFeedback?: string;
    notChosenFeedback?: string;
  };
}

/**
 * H5P.MultipleChoice params structure
 */
export interface H5pMultipleChoiceParams {
  media?: {
    type?: {
      params?: any;
    };
  };
  answers: H5pMultipleChoiceAnswer[];
  overallFeedback?: Array<{
    from: number;
    to: number;
    feedback?: string;
  }>;
  behaviour?: {
    enableRetry?: boolean;
    enableSolutionsButton?: boolean;
    enableCheckButton?: boolean;
    type?: string;
    singlePoint?: boolean;
    randomAnswers?: boolean;
    showSolutionsRequiresInput?: boolean;
    confirmCheckDialog?: boolean;
    confirmRetryDialog?: boolean;
    autoCheck?: boolean;
    passPercentage?: number;
    showScorePoints?: boolean;
  };
  UI?: {
    checkAnswerButton?: string;
    submitAnswerButton?: string;
    showSolutionButton?: string;
    tryAgainButton?: string;
    tipsLabel?: string;
    scoreBarLabel?: string;
    tipAvailable?: string;
    feedbackAvailable?: string;
    readFeedback?: string;
    wrongAnswer?: string;
    correctAnswer?: string;
    shouldCheck?: string;
    shouldNotCheck?: string;
    noInput?: string;
    a11yCheck?: string;
    a11yShowSolution?: string;
    a11yRetry?: string;
  };
  confirmCheck?: {
    header?: string;
    body?: string;
    cancelLabel?: string;
    confirmLabel?: string;
  };
  confirmRetry?: {
    header?: string;
    body?: string;
    cancelLabel?: string;
    confirmLabel?: string;
  };
  question: string;
}

/**
 * Complete H5P.MultipleChoice content structure
 */
export interface H5pMultipleChoiceContent {
  library: string;
  params: H5pMultipleChoiceParams;
  metadata: {
    contentType: string;
    license: string;
    title: string;
  };
  subContentId?: string;
}
