"use client";

import React, { useState } from "react";
import { Briefcase, ChevronRight, Loader2, FileText, Settings } from "lucide-react";
import { useRouter } from "next/navigation";
import { generateInterviewQuestions } from "./actions";

export default function InterviewPrep() {
  const [jobDescription, setJobDescription] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [focus, setFocus] = useState("Mixed");
  const [isGenerating, setIsGenerating] = useState(false);
  const router = useRouter();

  React.useEffect(() => {
    const savedJD = localStorage.getItem("target_jd");
    const savedFocus = localStorage.getItem("target_focus");
    if (savedJD) setJobDescription(savedJD);
    if (savedFocus) setFocus(savedFocus);
  }, []);

  React.useEffect(() => {
    localStorage.setItem("target_jd", jobDescription);
    localStorage.setItem("target_focus", focus);
  }, [jobDescription, focus]);

  const handleStart = async () => {
    if (!jobDescription.trim()) return;
    setIsGenerating(true);
    try {
      const formData = new FormData();
      formData.append("jobDescription", jobDescription);
      formData.append("focus", focus);
      if (resumeFile) {
        formData.append("resumeFile", resumeFile);
      }

      const result = await generateInterviewQuestions(formData);
      if (result && !Array.isArray(result) && 'serverError' in result) {
         alert(result.serverError);
         setIsGenerating(false);
         return;
      }
      localStorage.setItem("interview_questions", JSON.stringify(result));
      router.push("/interview/live");
    } catch (error) {
      console.error("Failed to generate questions", error);
      alert("Failed to generate questions. Please try again.");
      setIsGenerating(false);
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto flex flex-col gap-8">
      <div>
        <h2 className="text-3xl font-semibold tracking-tight text-gray-900 dark:text-white flex items-center gap-3">
          <Briefcase size={28} className="text-blue-500" /> Interview Prep
        </h2>
        <p className="text-gray-500 mt-2">Paste a job description and your resume to generate targeted interview questions and start a mock interview.</p>
      </div>

      <div className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm flex flex-col gap-4">
        <label className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Briefcase size={18} /> Job Description
        </label>
        <textarea 
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          placeholder="Paste the job description here..."
          className="w-full h-48 p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 outline-none text-sm resize-none"
        />

        <label className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2 mt-4">
          <Settings size={18} /> Interview Focus
        </label>
        <div className="flex gap-4 items-center">
          {["Behavioral", "Technical", "Mixed"].map((option) => (
            <label key={option} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
              <input
                type="radio"
                name="focus"
                value={option}
                checked={focus === option}
                onChange={() => setFocus(option)}
                className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
              />
              {option}
            </label>
          ))}
        </div>

        <label className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2 mt-4">
          <FileText size={18} /> Resume (Optional, .pdf, .txt, .docx)
        </label>
        <input 
          type="file"
          accept=".pdf,.txt,.docx"
          onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
          className="w-full p-2 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
        />
        
        <div className="flex justify-end mt-4">
          <button 
            onClick={handleStart}
            disabled={!jobDescription.trim() || isGenerating}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {isGenerating ? (
              <><Loader2 size={18} className="animate-spin" /> Analyzing Role...</>
            ) : (
              <>Start Mock Interview <ChevronRight size={18} /></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
