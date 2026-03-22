"use client";

import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

interface MathTextProps {
  text: string;
  className?: string;
}

/** 将文本中的 $...$ 和 $$...$$ 渲染为 KaTeX HTML */
function renderMathSegments(text: string): string {
  // 先处理 $$...$$ (display math)，再处理 $...$ (inline math)
  let result = escapeHtml(text);

  // $$...$$ → display math (换行块级公式)
  result = result.replace(/\$\$([^$]+?)\$\$/g, (_, latex) => {
    try {
      return katex.renderToString(unescapeHtml(latex), {
        displayMode: true,
        throwOnError: false,
        output: "html",
      });
    } catch {
      return `<code>${latex}</code>`;
    }
  });

  // $...$ → inline math
  result = result.replace(/\$([^$]+?)\$/g, (_, latex) => {
    try {
      return katex.renderToString(unescapeHtml(latex), {
        displayMode: false,
        throwOnError: false,
        output: "html",
      });
    } catch {
      return `<code>${latex}</code>`;
    }
  });

  // 换行 → <br>
  result = result.replace(/\n/g, "<br>");

  return result;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function unescapeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** 渲染含 LaTeX 数学公式的文本。$...$ 为行内公式，$$...$$ 为块级公式。 */
export function MathText({ text, className }: MathTextProps) {
  const html = useMemo(() => renderMathSegments(text), [text]);

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
