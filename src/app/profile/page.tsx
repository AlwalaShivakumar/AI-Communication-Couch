"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { UserCircle, Save, Loader2, Target, Briefcase, Award, TrendingUp, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { getGuestId } from "@/lib/auth";

export default function ProfilePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  
  const [profile, setProfile] = useState({
    preferred_name: "",
    target_role: "",
    career_goal: "",
    experience_level: ""
  });
  
  const [pacingProfile, setPacingProfile] = useState("Normal (4s)");
  
  const [stats, setStats] = useState({
    totalSessions: 0,
    avgScore: 0
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    async function checkAuthAndLoadProfile() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const activeUserId = user?.id || getGuestId();
        setUserId(activeUserId);

        // Fetch Profile
        const { data: profileData, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', activeUserId)
          .single();

        if (profileData) {
          setProfile({
            preferred_name: profileData.preferred_name || "",
            target_role: profileData.target_role || "",
            career_goal: profileData.career_goal || "",
            experience_level: profileData.experience_level || "Entry Level"
          });
        }

        // Fetch Stats
        const { data: sessionData } = await supabase
          .from('sessions')
          .select('id, session_feedbacks(overall_score)')
          .eq('user_id', activeUserId);

        if (sessionData && sessionData.length > 0) {
          let totalScore = 0;
          let scoredSessions = 0;
          
          sessionData.forEach(session => {
             const feedback = session.session_feedbacks?.[0];
             if (feedback && feedback.overall_score) {
               totalScore += feedback.overall_score;
               scoredSessions++;
             }
          });

          setStats({
            totalSessions: sessionData.length,
            avgScore: scoredSessions > 0 ? Math.round(totalScore / scoredSessions) : 0
          });
        }

      } catch (err) {
        console.error("Error loading profile:", err);
      } finally {
        setLoadingAuth(false);
      }
    }

    checkAuthAndLoadProfile();
    const savedPacing = localStorage.getItem("pacing_profile");
    if (savedPacing) setPacingProfile(savedPacing);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setProfile(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    setIsSaving(true);
    setSaveMessage("");

    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({ 
          id: userId,
          ...profile,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });

      if (error) throw error;
      
      localStorage.setItem("pacing_profile", pacingProfile);
      setSaveMessage("Profile saved successfully!");
      setTimeout(() => setSaveMessage(""), 3000);
    } catch (err: any) {
      console.error("Failed to save profile:", err);
      setSaveMessage("Failed to save profile. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  if (loadingAuth) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-500" size={40} />
      </div>
    );
  }

  // Get initial for Avatar
  const initial = profile.preferred_name ? profile.preferred_name.charAt(0).toUpperCase() : "U";

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-950 p-4 md:p-8 text-gray-200">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row gap-8">
        
        {/* LEFT COLUMN: Profile Card & Stats */}
        <div className="w-full md:w-1/3 flex flex-col gap-6">
          
          {/* Avatar Card */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 flex flex-col items-center text-center shadow-lg relative overflow-hidden">
            {/* Decorative background blur */}
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />

            <div className="w-28 h-28 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-4xl font-black text-white shadow-xl mb-4 border-4 border-gray-900">
              {initial}
            </div>
            
            <h2 className="text-2xl font-bold text-white mb-1">
              {profile.preferred_name || "Anonymous User"}
            </h2>
            <p className="text-blue-400 font-medium flex items-center justify-center gap-2">
              <Briefcase size={16} />
              {profile.target_role || "Target Role Not Set"}
            </p>
            
            <div className="w-full h-px bg-gray-800 my-6" />
            
            {/* Quick Stats */}
            <div className="w-full grid grid-cols-2 gap-4">
              <div className="bg-gray-950 border border-gray-800 p-4 rounded-xl flex flex-col items-center">
                <Calendar size={20} className="text-gray-400 mb-2" />
                <span className="text-2xl font-black text-white">{stats.totalSessions}</span>
                <span className="text-xs text-gray-500 font-medium uppercase tracking-wider mt-1">Sessions</span>
              </div>
              <div className="bg-gray-950 border border-gray-800 p-4 rounded-xl flex flex-col items-center">
                <TrendingUp size={20} className="text-green-500 mb-2" />
                <span className="text-2xl font-black text-white">{stats.avgScore || "-"}</span>
                <span className="text-xs text-gray-500 font-medium uppercase tracking-wider mt-1">Avg Score</span>
              </div>
            </div>
          </div>

          {/* Info Card */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-lg">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4 flex items-center gap-2">
              <Award size={16} /> Why complete this?
            </h3>
            <p className="text-gray-400 text-sm leading-relaxed mb-4">
              The AI Coach uses your profile context to tailor its feedback. A Senior Engineer will be graded much more rigorously than an Entry Level applicant.
            </p>
            <div className="w-full bg-gray-800 rounded-full h-2">
              <div 
                className="bg-blue-500 h-2 rounded-full transition-all duration-1000" 
                style={{ width: ([profile.preferred_name, profile.target_role, profile.career_goal].filter(Boolean).length * 33) + '%' }}
              />
            </div>
            <p className="text-xs text-gray-500 text-right mt-2 font-medium">Profile Completeness</p>
          </div>
        </div>

        {/* RIGHT COLUMN: Settings Form */}
        <div className="w-full md:w-2/3">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl shadow-lg overflow-hidden flex flex-col h-full">
            
            <div className="p-6 border-b border-gray-800 bg-gray-900/50">
              <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                <UserCircle size={28} className="text-blue-500" /> 
                Profile Settings
              </h2>
              <p className="text-gray-400 mt-1">Manage your professional identity and coaching goals.</p>
            </div>

            <form onSubmit={handleSave} className="p-6 md:p-8 flex-1 flex flex-col gap-8">
              
              {/* Personal Details Section */}
              <div className="space-y-6">
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2 border-b border-gray-800 pb-2">
                  <UserCircle size={16} /> Personal Details
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold text-gray-300">Preferred Name</label>
                    <input 
                      type="text"
                      name="preferred_name"
                      value={profile.preferred_name}
                      onChange={handleChange}
                      placeholder="e.g. Alex"
                      className="w-full p-3.5 rounded-xl border border-gray-800 bg-gray-950 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-100 transition-shadow"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold text-gray-300">Target Role</label>
                    <input 
                      type="text"
                      name="target_role"
                      value={profile.target_role}
                      onChange={handleChange}
                      placeholder="e.g. Product Manager"
                      className="w-full p-3.5 rounded-xl border border-gray-800 bg-gray-950 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-100 transition-shadow"
                    />
                  </div>
                </div>
              </div>

              {/* Coaching Context Section */}
              <div className="space-y-6">
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2 border-b border-gray-800 pb-2">
                  <Target size={16} /> Coaching Context
                </h3>
                
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-gray-300">Experience Level</label>
                  <select
                    name="experience_level"
                    value={profile.experience_level}
                    onChange={handleChange}
                    className="w-full p-3.5 rounded-xl border border-gray-800 bg-gray-950 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-100 appearance-none transition-shadow"
                  >
                    <option value="Entry Level">Entry Level (0-2 years)</option>
                    <option value="Mid Level">Mid Level (3-5 years)</option>
                    <option value="Senior">Senior (5-8+ years)</option>
                    <option value="Staff/Principal">Staff/Principal</option>
                    <option value="Executive">Executive / C-Suite</option>
                  </select>
                </div>
                
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-gray-300 flex justify-between items-center">
                    <span>Pacing Profile (Silence Timeout)</span>
                  </label>
                  <select
                    value={pacingProfile}
                    onChange={(e) => setPacingProfile(e.target.value)}
                    className="w-full p-3.5 rounded-xl border border-gray-800 bg-gray-950 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-100 appearance-none transition-shadow"
                  >
                    <option value="Fast (2.5s)">Fast (2.5s) - Best for rapid Q&A</option>
                    <option value="Normal (4s)">Normal (4s) - Default pacing</option>
                    <option value="Deliberate (7s)">Deliberate (7s) - Best for thoughtful or complex answers</option>
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-gray-300 flex justify-between items-center">
                    <span>Career & Communication Goals</span>
                    <span className="text-xs font-normal text-gray-500">Used by the AI to grade you</span>
                  </label>
                  <textarea 
                    name="career_goal"
                    value={profile.career_goal}
                    onChange={handleChange}
                    placeholder="e.g. I tend to ramble when asked open-ended questions. I want to learn to use the STAR method natively and project more confidence."
                    className="w-full h-32 p-4 rounded-xl border border-gray-800 bg-gray-950 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none text-gray-100 transition-shadow leading-relaxed"
                  />
                </div>
              </div>

              {/* Action Footer */}
              <div className="mt-auto pt-6 flex items-center justify-between border-t border-gray-800">
                <span className={cn("text-sm font-bold px-4 py-2 rounded-lg transition-all duration-300", 
                  saveMessage ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2", 
                  saveMessage.includes("Failed") ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400")}>
                  {saveMessage}
                </span>
                <button 
                  type="submit"
                  disabled={isSaving}
                  className="px-8 py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-900/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-0.5"
                >
                  {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  {isSaving ? "Saving..." : "Save Profile"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
