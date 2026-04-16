"use client";

import { useState, useCallback } from "react";
import { ComicScript, DifficultyLevel, QuizQuestion, PartialLLMConfig } from "@/lib/types";
import { generateQuiz } from "@/lib/quizGenerator";
import { Spinner } from "@/components/ui/Spinner";
import { ClipboardList } from "lucide-react";


interface QuizPanelProps {
  script: ComicScript;
  difficulty?: DifficultyLevel;
  llmConfig?: PartialLLMConfig;
  onQuizGenerated?: (questions: QuizQuestion[]) => void;
}

function QuizCard({
  question,
  index,
  selectedOption,
  revealed,
  onSelect,
  onReveal,
}: {
  question: QuizQuestion;
  index: number;
  selectedOption: number | undefined;
  revealed: boolean;
  onSelect: (optionIndex: number) => void;
  onReveal: () => void;
}) {
  return (
    <div className="p-4 rounded-lg border bg-card space-y-3">
      <p className="text-sm font-medium">
        <span className="text-muted-foreground mr-2">Q{index + 1}.</span>
        {question.question}
      </p>
      <div className="space-y-2">
        {question.options.map((option, i) => {
          const isSelected = selectedOption === i;
          const isCorrect = i === question.correctIndex;
          let optionClass = "border hover:border-primary/50";
          if (revealed) {
            if (isCorrect) optionClass = "border-success bg-success/10";
            else if (isSelected) optionClass = "border-error bg-error/10";
            else optionClass = "border opacity-60";
          } else if (isSelected) {
            optionClass = "border-primary bg-primary/10 ring-2 ring-primary/30";
          }
          return (
            <button
              key={i}
              type="button"
              onClick={() => !revealed && onSelect(i)}
              disabled={revealed}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all min-h-[44px] flex items-center gap-2 ${optionClass}`}
            >
              <span className="shrink-0 w-6 h-6 rounded-full border flex items-center justify-center text-xs font-medium">
                {String.fromCharCode(65 + i)}
              </span>
              <span className="flex-1">{option}</span>
              {revealed && isCorrect && <span className="text-success shrink-0">✓</span>}
              {revealed && isSelected && !isCorrect && <span className="text-error shrink-0">✗</span>}
            </button>
          );
        })}
      </div>
      {!revealed && selectedOption !== undefined && (
        <button
          onClick={onReveal}
          className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity min-h-[40px]"
        >
          查看答案
        </button>
      )}
      {revealed && (
        <div className="mt-2 p-3 bg-muted rounded-lg text-sm text-muted-foreground">
          <span className="font-medium text-foreground">解析：</span>{question.explanation}
        </div>
      )}
    </div>
  );
}

export function QuizPanel({ script, difficulty = "medium", llmConfig, onQuizGenerated }: QuizPanelProps) {
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(script.quiz ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [answers, setAnswers] = useState<Map<number, number>>(new Map());
  const [revealed, setRevealed] = useState<Set<number>>(new Set());

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setError("");
    setAnswers(new Map());
    setRevealed(new Set());
    try {
      const result = await generateQuiz(script, difficulty, llmConfig);
      setQuestions(result);
      onQuizGenerated?.(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setLoading(false);
    }
  }, [script, difficulty, llmConfig, onQuizGenerated]);

  const handleSelect = (qIndex: number, optIndex: number) => {
    setAnswers((prev) => new Map(prev).set(qIndex, optIndex));
  };

  const handleReveal = (qIndex: number) => {
    setRevealed((prev) => new Set(prev).add(qIndex));
  };

  const allRevealed = questions ? revealed.size === questions.length : false;
  const correctCount = questions
    ? questions.filter((q, i) => answers.get(i) === q.correctIndex && revealed.has(i)).length
    : 0;

  return (
    <div className="p-4 rounded-xl border bg-card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-primary" />
          知识测验
        </h3>
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="px-3 py-1.5 text-xs border rounded-lg hover:bg-accent transition-colors disabled:opacity-50 flex items-center gap-1.5 min-h-[36px]"
        >
          {loading ? <><Spinner size="sm" /> 出题中...</> : questions ? "重新出题" : "生成测验题"}
        </button>
      </div>

      {error && (
        <p className="text-sm text-error">{error}</p>
      )}

      {questions && (
        <div className="space-y-3">
          {questions.map((q, i) => (
            <QuizCard
              key={i}
              question={q}
              index={i}
              selectedOption={answers.get(i)}
              revealed={revealed.has(i)}
              onSelect={(optIdx) => handleSelect(i, optIdx)}
              onReveal={() => handleReveal(i)}
            />
          ))}
        </div>
      )}

      {allRevealed && questions && (
        <div className={`p-3 rounded-lg text-center text-sm font-medium ${
          correctCount === questions.length
            ? "bg-success/10 text-success"
            : "bg-info/10 text-info"
        }`}>
          {correctCount === questions.length
            ? `🎉 ${correctCount}/${questions.length} 全对！`
            : `答对 ${correctCount}/${questions.length} 题`}
        </div>
      )}
    </div>
  );
}
