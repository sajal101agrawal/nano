type QuestionOption = { value: string; label: string };

type AnswerQuestion = {
  question_type: string;
  options?: QuestionOption[];
};

export function formatScreeningAnswer(
  value: unknown,
  question: AnswerQuestion
): string {
  if (value === null || value === undefined || value === "") return "—";

  if (question.question_type === "boolean") {
    return value === true || value === "true" ? "Yes" : "No";
  }

  const str = String(value);

  if (question.question_type === "select" && question.options?.length) {
    return question.options.find((o) => o.value === str)?.label ?? str;
  }

  if (question.question_type === "multiselect" && question.options?.length) {
    return str
      .split(",")
      .filter(Boolean)
      .map((v) => question.options!.find((o) => o.value === v)?.label ?? v)
      .join(", ");
  }

  return str;
}
