"use client";

import React, { useEffect, useState } from "react";
import { InterviewLiveSession } from "@/components/InterviewLiveSession";
import Link from "next/link";
import { AlertCircle } from "lucide-react";

export default function InterviewLivePage() {
  const [hasQuestions, setHasQuestions] = useState<boolean | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("interview_questions");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setHasQuestions(true);
          return;
        }
      } catch (e) {
        console.error("Failed to parse interview questions");
      }
    }
    setHasQuestions(false);
  }, []);

  if (hasQuestions === null) {
    return null; // Loading state
  }

  if (!hasQuestions) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] p-4 text-center bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-200">
        <AlertCircle size={64} className="text-red-500 mb-6" />
        <h1 className="text-2xl font-bold mb-4">No interview questions loaded</h1>
        <p className="text-gray-500 mb-8 max-w-md">Go back to set up your interview with a job description</p>
        <Link href="/interview" className="px-6 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition">
          Set Up Interview
        </Link>
      </div>
    );
  }

  return <InterviewLiveSession />;
}
