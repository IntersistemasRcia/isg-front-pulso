"use client";

import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatChart } from "@/components/chat/ChatChart/ChatChart";
import { ExcelDownload } from "@/components/chat/ExcelDownload/ExcelDownload";
import { parseAssistantBlocks } from "@/lib/chat/parseAssistantBlocks";

const markdownComponents: Components = {
  table: ({ children }) => (
    <div className="markdown-table-wrap">
      <table>{children}</table>
    </div>
  ),
};

export function AssistantRichBody({ text }: { text: string }) {
  const blocks = parseAssistantBlocks(text);

  return (
    <>
      {blocks.map((block, index) => {
        if (block.kind === "chart") {
          return <ChatChart key={`chart-${index}`} spec={block.spec} />;
        }
        if (block.kind === "excel") {
          return <ExcelDownload key={`excel-${index}`} spec={block.spec} />;
        }
        if (!block.text.trim()) return null;
        return (
          <div key={`md-${index}`} className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {block.text}
            </ReactMarkdown>
          </div>
        );
      })}
    </>
  );
}
