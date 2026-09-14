"use client";

import { LiveSession } from "@/components/LiveSession";
import { Suspense, useState } from "react";
import Link from "next/link";
import { Mic, BrainCircuit, BarChart3, Briefcase, ArrowRight, UserCircle } from "lucide-react";

export default function Home() {
  const [showTraining, setShowTraining] = useState(false);

  if (showTraining) {
    return (
      <div className="h-full">
        <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading coaching session...</div>}>
          <LiveSession />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="min-h-full flex flex-col items-center py-16 px-4 sm:px-6 lg:px-8 bg-gray-950 text-gray-100">
      
      {/* Banner */}
      <Link href="/profile" className="mb-12 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-900 border border-gray-800 text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-800 transition-colors">
        <UserCircle className="w-4 h-4" />
        Set up your profile for personalized coaching <ArrowRight className="w-4 h-4" />
      </Link>

      {/* Hero Section */}
      <div className="text-center max-w-4xl mx-auto mb-20">
        <h1 className="text-5xl font-extrabold tracking-tight mb-6 bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
          AI Communication Coach
        </h1>
        <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto">
          Practice speaking, get instant AI feedback, and track your improvement.
        </p>
        
        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button 
            onClick={() => setShowTraining(true)}
            className="inline-flex items-center justify-center gap-2 px-8 py-4 text-base font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors shadow-lg shadow-amber-900/20"
          >
            <Mic className="w-5 h-5" />
            Start Communication Training
          </button>
          <Link 
            href="/interview"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 text-base font-semibold text-gray-300 bg-gray-900 border border-gray-700 rounded-lg hover:bg-gray-800 hover:text-white transition-colors"
          >
            <Briefcase className="w-5 h-5" />
            Prepare for Interview
          </Link>
        </div>
      </div>

      {/* 3-Step Guide */}
      <div className="max-w-6xl w-full mx-auto mb-24">
        <h2 className="text-2xl font-bold text-center mb-12 text-gray-200">How it works</h2>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-gray-900 border border-gray-800 flex items-center justify-center text-amber-500 font-bold mb-4">1</div>
            <h3 className="text-lg font-semibold mb-2">Set up your profile</h3>
            <p className="text-gray-400">Tell us about your background and goals for personalized coaching.</p>
          </div>
          <div className="flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-gray-900 border border-gray-800 flex items-center justify-center text-amber-500 font-bold mb-4">2</div>
            <h3 className="text-lg font-semibold mb-2">Practice with AI Coach</h3>
            <p className="text-gray-400">Have real-time conversations and get instant feedback on your delivery.</p>
          </div>
          <div className="flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-gray-900 border border-gray-800 flex items-center justify-center text-amber-500 font-bold mb-4">3</div>
            <h3 className="text-lg font-semibold mb-2">Review your insights</h3>
            <p className="text-gray-400">Track your progress over time and see areas for improvement.</p>
          </div>
        </div>
      </div>

      {/* Feature Cards */}
      <div className="max-w-6xl w-full mx-auto">
        <div className="grid md:grid-cols-3 gap-6">
          <button 
            onClick={() => setShowTraining(true)}
            className="flex flex-col items-start p-6 bg-gray-900 border border-gray-800 rounded-2xl hover:border-amber-500/50 transition-colors text-left"
          >
            <div className="p-3 bg-gray-950 rounded-lg text-amber-500 mb-4">
              <BrainCircuit className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold mb-2">Communication Coach</h3>
            <p className="text-gray-400">Practice with 6 different modes including casual chat, debate, and presentation prep.</p>
          </button>
          
          <Link href="/interview" className="flex flex-col items-start p-6 bg-gray-900 border border-gray-800 rounded-2xl hover:border-blue-500/50 transition-colors">
            <div className="p-3 bg-gray-950 rounded-lg text-blue-500 mb-4">
              <Briefcase className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold mb-2">Interview Prep</h3>
            <p className="text-gray-400">Upload a Job Description and practice answering tailored interview questions.</p>
          </Link>

          <Link href="/insights" className="flex flex-col items-start p-6 bg-gray-900 border border-gray-800 rounded-2xl hover:border-green-500/50 transition-colors">
            <div className="p-3 bg-gray-950 rounded-lg text-green-500 mb-4">
              <BarChart3 className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold mb-2">Insights Dashboard</h3>
            <p className="text-gray-400">Review your past sessions, get detailed analysis, and track your communication growth.</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
