"use client";

import { FileSearchIcon } from "lucide-react";
import { Conversation, ConversationContent, ConversationEmptyState } from "@/components/ai-elements/conversation";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";

export function FoundationScreen() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main-content" className="sr-only fixed start-4 top-4 z-50 rounded-md bg-background px-4 py-3 focus:not-sr-only focus:outline-2 focus:outline-ring">
        Skip to content
      </a>
      <header className="flex items-center justify-between border-b px-5 py-3 sm:px-8">
        <div className="flex items-center gap-2.5">
          <FileSearchIcon className="size-5 text-primary" aria-hidden="true" />
          <span className="text-lg font-semibold tracking-tight">DocLens</span>
        </div>
        <ThemeToggle />
      </header>
      <main id="main-content" className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 py-16 sm:px-8" tabIndex={-1}>
        <Conversation className="flex min-h-80 flex-1 flex-col" aria-label="Document workspace">
          <ConversationContent className="flex flex-1 justify-center">
            <ConversationEmptyState className="mx-auto max-w-xl gap-5 py-12 text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl border bg-card">
                <FileSearchIcon className="size-7 text-primary" strokeWidth={1.5} aria-hidden="true" />
              </div>
              <Badge variant="secondary">Coming soon</Badge>
              <h1 className="text-balance font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
                Your documents.<br />Grounded answers.
              </h1>
              <p className="max-w-md text-base leading-relaxed text-muted-foreground">
                A focused space to ask questions about one document at a time.
                Document uploads and answers are coming next.
              </p>
              <p lang="fa" dir="rtl" className="text-base leading-loose text-muted-foreground">
                اسناد شما، پاسخ‌های مستند.
              </p>
            </ConversationEmptyState>
          </ConversationContent>
        </Conversation>
      </main>
    </div>
  );
}
