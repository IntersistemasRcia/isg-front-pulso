"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatChart } from "@/components/chat/ChatChart/ChatChart";
import { ExcelDownload } from "@/components/chat/ExcelDownload/ExcelDownload";
import { parseAssistantBlocks } from "@/lib/chat/parseAssistantBlocks";
import { formatMetricCell } from "@/lib/chat/tabularSpec";

function extractText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return extractText(node.props.children);
  }
  return "";
}

function collectHeaderLabels(children: ReactNode): string[] {
  const headers: string[] = [];
  Children.forEach(children, (section) => {
    if (!isValidElement<{ children?: ReactNode }>(section)) return;
    if (section.type !== "thead") return;
    Children.forEach(section.props.children, (row) => {
      if (!isValidElement<{ children?: ReactNode }>(row)) return;
      Children.forEach(row.props.children, (cell) => {
        if (!isValidElement<{ children?: ReactNode }>(cell)) return;
        headers.push(extractText(cell.props.children).trim());
      });
    });
  });
  return headers;
}

function mapTableBody(children: ReactNode, headers: string[]): ReactNode {
  return Children.map(children, (section) => {
    if (!isValidElement<{ children?: ReactNode }>(section)) return section;
    if (section.type !== "tbody") return section;

    const rows = Children.map(section.props.children, (row) => {
      if (!isValidElement<{ children?: ReactNode }>(row)) return row;
      let colIdx = 0;
      const cells = Children.map(row.props.children, (cell) => {
        if (!isValidElement<{ children?: ReactNode }>(cell)) return cell;
        const c = colIdx;
        colIdx += 1;
        const text = extractText(cell.props.children).trim();
        const formatted = formatMetricCell(text, headers[c]);
        if (formatted == null) return cell;
        return cloneElement(cell as ReactElement<{ children?: ReactNode }>, {
          children: formatted,
        });
      });
      return cloneElement(row as ReactElement<{ children?: ReactNode }>, {
        children: cells,
      });
    });

    return cloneElement(section as ReactElement<{ children?: ReactNode }>, {
      children: rows,
    });
  });
}

function MarkdownTable({ children }: { children?: ReactNode }) {
  const headers = collectHeaderLabels(children);
  return (
    <div className="markdown-table-wrap">
      <table>{mapTableBody(children, headers)}</table>
    </div>
  );
}

const markdownComponents: Components = {
  table: ({ children }) => <MarkdownTable>{children}</MarkdownTable>,
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
