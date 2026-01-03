
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  AppView, 
  UserProfile, 
  Skill, 
  ScheduleEntry, 
  TimeSlot, 
  Suggestion, 
  Priority,
  Message,
  CompletedSession
} from './types';
import Sidebar from './components/Sidebar';
import ChatView from './views/ChatView';
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "./services/firebase";
import { loginWithGoogle } from "./services/auth";
import { geminiService } from "./services/gemini";
import { httpsCallable } from "firebase/functions";
import { functions } from "./services/firebase.ts";
import { parseTimetablePDF } from "./services/timetable";


type TimetableParseResult = {
  schedule: ScheduleEntry[];
  freeSlots: TimeSlot[];
  warnings?: string[];
};


// --- Onboarding Data ---
const SKILL_TREE: Record<string, Record<string, string[]>> = {
  Academics: {
    "Medical Studies": ["Biology", "Human Physiology", "Anatomy", "Biochemistry", "Microbiology", "Biotechnology", "Clinical Concepts", "Medical Aptitude"],
    "Engineering & Technology": ["Engineering Mathematics", "Engineering Physics", "Programming Fundamentals", "Data Structures & Algorithms", "Web Development", "Database Management Systems", "Operating Systems", "Computer Networks"],
    "High School Studies": ["Mathematics", "Physics", "Chemistry", "Biology", "Accountancy", "Business Studies", "Economics", "English"],
    "Commerce & Management": ["Accountancy", "Economics", "Business Studies", "Financial Management", "Marketing Fundamentals", "Human Resource Management", "Entrepreneurship", "Business Analytics"],
    "Arts & Humanities": ["History", "Geography", "Political Science", "Sociology", "Psychology", "Philosophy", "English Literature", "Creative Writing"],
    "Exams & Career Prep": ["NEET Preparation", "JEE Preparation", "GATE Preparation", "CAT Preparation", "UPSC Basics", "GRE / GMAT", "Coding Interviews", "Placement Aptitude"]
  },
  Sports: {
    "Fitness & Conditioning": ["Strength Training", "Yoga", "Endurance", "Mobility"],
    "Team Sports": ["Basketball", "Football", "Volleyball", "Cricket"],
    "Individual Sports": ["Tennis", "Badminton", "Swimming", "Athletics"],
    "Sports Intelligence": ["Game Strategy", "Video Analysis", "Sports Psychology", "Tactical Theory"]
  },
  Music: {
    "Instruments": ["Piano", "Guitar", "Violin", "Drums"],
    "Music Theory": ["Composition", "Notation", "Ear Training", "Harmony"],
    "Performance & Production": ["Vocals", "DAW Production", "Sound Design", "Mixing"]
  },
  Personal: {
    "Mental & Emotional": ["Meditation", "Journaling", "Therapy Concepts", "Stress Mgmt"],
    "Communication": ["Public Speaking", "Debate", "Technical Writing", "Negotiation"],
    "Productivity & Life": ["Time Management", "Financial Literacy", "Cooking", "Organization"],
    "Career & Professional": ["Resume Building", "Networking", "Interview Prep", "Soft Skills"]
  }
};

const App: React.FC = () => {

  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // --- State ---
  const [view, setView] = useState<AppView>('splash');
  const [profile, setProfile] = useState<UserProfile>({
    name: 'Scholar',
    selectedCategories: [],
    skills: [],
    isCompletedOnboarding: false
  });
  
  const [onboardingContext, setOnboardingContext] = useState<{
    category?: string;
    subCategory?: string;
  }>({});

  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [freeSlots, setFreeSlots] = useState<TimeSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);
  
  // Persistent Focus States
  const [activeTask, setActiveTask] = useState<Suggestion | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [timer, setTimer] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // YouTube Session State
  const [activeYoutubeSession, setActiveYoutubeSession] = useState<{
    startTime: number;
    skill: string;
    title: string;
  } | null>(null);

  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [completedSessions, setCompletedSessions] = useState<CompletedSession[]>([]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAnalyzingPDF, setIsAnalyzingPDF] = useState(false);
  const [pdfStatus, setPdfStatus] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);

  // Settings / Account Modal States
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Persistence ---
  useEffect(() => {
    const saved = localStorage.getItem('lumina_planner_data');
    if (saved) {
      const data = JSON.parse(saved);
      setProfile(data.profile);
      setSchedule(data.schedule || []);
      setFreeSlots(data.freeSlots || []);
      setCompletedSessions(data.completedSessions || []);
      
      // Restore Session Continuity
      if (data.activeTask) {
        setActiveTask(data.activeTask);
        setActiveSessionId(data.activeSessionId);
        setTimer(data.timer || 0);
        setIsPaused(data.isPaused || false);
      }

      if (data.activeYoutubeSession) {
        setActiveYoutubeSession(data.activeYoutubeSession);
      }

      if (firebaseUser && data.profile.isCompletedOnboarding) setView('home');
    }
  }, []);

  useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    setFirebaseUser(user);
    setAuthLoading(false);

    if (user) {
      setView(profile.isCompletedOnboarding ? "home" : "onboarding-l1");
    } else {
      setView("splash");
    }
  });

  return () => unsubscribe();
}, []);


  const saveToDisk = (updates: any) => {
    const current = { profile, schedule, freeSlots, completedSessions, activeTask, activeSessionId, timer, isPaused, activeYoutubeSession };
    const merged = { ...current, ...updates };
    localStorage.setItem('lumina_planner_data', JSON.stringify(merged));
  };

  // --- Dashboard Computations ---
  const stats = useMemo(() => {
    if (completedSessions.length === 0) {
      return {
        totalFocusTime: "0h 0m",
        streak: 0,
        score: 0,
        mvpSkill: "No data yet",
        totalMinutes: 0,
        skillMinutes: {} as Record<string, number>
      };
    }

    const totalMinutes = completedSessions.reduce((acc, s) => acc + s.duration, 0);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;

    const minutesPerDay: Record<string, number> = {};
    const skillMap: Record<string, number> = {};
    completedSessions.forEach(s => {
      const dateKey = new Date(s.timestamp).toDateString();
      minutesPerDay[dateKey] = (minutesPerDay[dateKey] || 0) + s.duration;
      skillMap[s.skillName] = (skillMap[s.skillName] || 0) + s.duration;
    });

    let streak = 0;
    const checkDate = new Date();
    if ((minutesPerDay[checkDate.toDateString()] || 0) < 1) { // 1 min for streak
        checkDate.setDate(checkDate.getDate() - 1);
    }
    while ((minutesPerDay[checkDate.toDateString()] || 0) >= 1) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent = completedSessions.filter(s => s.timestamp >= sevenDaysAgo);
    const recentSkillMap: Record<string, number> = {};
    recent.forEach(s => {
      recentSkillMap[s.skillName] = (recentSkillMap[s.skillName] || 0) + s.duration;
    });
    
    let mvpSkill = "No data yet";
    let maxTime = 0;
    Object.entries(recentSkillMap).forEach(([name, time]) => {
      if (time > maxTime) {
        maxTime = time;
        mvpSkill = name;
      }
    });

    const last14Days = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const consistencyCount = new Set(completedSessions.filter(s => s.timestamp >= last14Days).map(s => new Date(s.timestamp).toDateString())).size;
    const avgDuration = completedSessions.reduce((acc, s) => acc + s.duration, 0) / completedSessions.length;
    
    const consistencyScore = (consistencyCount / 14) * 40;
    const intensityScore = (Math.min(avgDuration, 60) / 60) * 30;
    const volumeScore = (Math.min(totalMinutes / 60, 100) / 100) * 30;
    const score = Math.round(consistencyScore + intensityScore + volumeScore);

    return {
      totalFocusTime: `${hours}h ${mins}m`,
      streak,
      score,
      mvpSkill,
      totalMinutes,
      skillMinutes: skillMap
    };
  }, [completedSessions]);

  const skillProgress = useMemo(() => {
    const goalMinutes = 300;
    const progressMap: Record<string, number> = {};
    profile.skills.forEach(s => {
        const mins = stats.skillMinutes[s.name] || 0;
        progressMap[s.name] = Math.min(Math.round((mins / goalMinutes) * 100), 100);
    });
    return progressMap;
  }, [profile.skills, stats.skillMinutes]);

  // Unified suggestion loader for better responsiveness
  const loadSuggestions = async (slot: TimeSlot) => {
    setIsSuggestionsLoading(true);
    setSuggestions([]);
    try {
      const res = await geminiService.getSuggestions(slot, profile.skills);
      setSuggestions(res);
    } catch (e) {
      console.error("Suggestions fetch error", e);
    } finally {
      setIsSuggestionsLoading(false);
    }
  };

  // --- Background Timer Logic ---
  const recordMinute = () => {
    if (!activeTask || !activeSessionId) return;

    setCompletedSessions(prev => {
        const index = prev.findIndex(s => s.id === activeSessionId);
        let next: CompletedSession[];
        if (index === -1) {
            next = [...prev, { id: activeSessionId, skillName: activeTask.skill, duration: 1, timestamp: Date.now(), type: 'focus' }];
        } else {
            next = prev.map((s, i) => i === index ? { ...s, duration: s.duration + 1 } : s);
        }
        saveToDisk({ completedSessions: next, timer: Math.max(0, timer - 1) });
        return next;
    });
  };

  useEffect(() => {
    let interval: any;
    if (activeTask && timer > 0 && !isPaused) {
      interval = setInterval(() => {
        setTimer(t => {
            if (t > 0) {
                recordMinute();
                return t - 1;
            }
            return 0;
        });
      }, 60000);
    }
    return () => clearInterval(interval);
  }, [activeTask, isPaused, activeSessionId, timer > 0]);

  useEffect(() => {
    if (activeTask || activeYoutubeSession) {
        saveToDisk({ timer, isPaused, activeTask, activeSessionId, activeYoutubeSession });
    }
  }, [timer, isPaused, activeTask, activeSessionId, activeYoutubeSession]);

  // --- Chat Auto Scroll ---
  useEffect(() => {
    if (view === 'chat' && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, view]);

  useEffect(() => {
    setSearchTerm('');
  }, [view]);

  // --- Handlers ---
  const handleLogOut = async () => {
  await auth.signOut();
  localStorage.clear();
  setFirebaseUser(null);
  setView("splash");
};

  const handleDeleteAccount = () => {
    localStorage.clear();
    window.location.reload();
  };

  const handleSendMessage = async (text: string) => {
  if (!text.trim()) return;

  const userMsg: Message = {
    id: Date.now().toString(),
    role: "user",
    text,
    timestamp: Date.now()
  };

  // 1️⃣ Add user message immediately
  setChatMessages(prev => [...prev, userMsg]);
  setChatLoading(true);

  try {
    // 2️⃣ Build history MANUALLY (critical fix)
    const history = [
      ...chatMessages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      })),
      {
        role: "user",
        parts: [{ text }]
      }
    ];

    // 3️⃣ Call Gemini
    const responseText = await geminiService.chatAssistant(
      text,
      profile,
      history
    );

    // 4️⃣ Append AI message
    const aiMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: "model",
      text: responseText,
      timestamp: Date.now()
    };

    setChatMessages(prev => [...prev, aiMsg]);
  } catch (error) {
    console.error("Chat error:", error);

    setChatMessages(prev => [
      ...prev,
      {
        id: (Date.now() + 1).toString(),
        role: "model",
        text: "My neural link is currently unstable. Please try again in a moment.",
        timestamp: Date.now()
      }
    ]);
  } finally {
    setChatLoading(false);
  }
};

  const startFocusSession = (suggestion: Suggestion) => {
    const id = `session-${Date.now()}`;
    setActiveTask(suggestion);
    setActiveSessionId(id);
    setTimer(suggestion.duration);
    setIsPaused(false);
    saveToDisk({ activeTask: suggestion, activeSessionId: id, timer: suggestion.duration, isPaused: false });
    setView('focus');
  };

  const handleWatchYoutube = (s: Suggestion) => {
    const query = encodeURIComponent(s.youtubeSearchQuery || s.title);
    window.open(`https://www.youtube.com/results?search_query=${query}`, '_blank');
    const ytSession = {
      startTime: Date.now(),
      skill: s.skill,
      title: s.title
    };
    setActiveYoutubeSession(ytSession);
    saveToDisk({ activeYoutubeSession: ytSession });
    setView('home');
  };

  const finishYoutubeSession = () => {
    if (!activeYoutubeSession) return;
    const duration = Math.max(1, Math.round((Date.now() - activeYoutubeSession.startTime) / 60000));
    const newSession: CompletedSession = {
      id: `yt-${Date.now()}`,
      skillName: activeYoutubeSession.skill,
      duration,
      timestamp: Date.now(),
      type: 'youtube'
    };
    const nextSessions = [...completedSessions, newSession];
    setCompletedSessions(nextSessions);
    saveToDisk({ completedSessions: nextSessions, activeYoutubeSession: null });
    setActiveYoutubeSession(null);
  };

  const handleTaskEnd = (isComplete: boolean) => {
    setView('home');
    setActiveTask(null);
    setActiveSessionId(null);
    setTimer(0);
    setSuggestions([]);
    saveToDisk({ activeTask: null, activeSessionId: null, timer: 0 });
  };

  const handleSkillToggle = (skillName: string, sub: string, cat: string) => {
    const isSelected = profile.skills.some(s => s.name === skillName);
    let nextSkills: Skill[];
    if (isSelected) {
      nextSkills = profile.skills.filter(s => s.name !== skillName);
    } else {
      nextSkills = [...profile.skills, { name: skillName, category: cat, subCategory: sub, priority: 'Medium' }];
    }
    const nextProfile = { ...profile, skills: nextSkills };
    setProfile(nextProfile);
    saveToDisk({ profile: nextProfile });
  };

  const updateSkillPriority = (skillName: string, priority: Priority) => {
    const nextSkills = profile.skills.map(s => 
      s.name === skillName ? { ...s, priority } : s
    );
    const nextProfile = { ...profile, skills: nextSkills };
    setProfile(nextProfile);
    saveToDisk({ profile: nextProfile });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') { alert("Please upload a PDF file."); return; }
    setIsAnalyzingPDF(true);
    setPdfStatus('Reading your timetable...');
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = (event.target?.result as string).split(',')[1];
      try {
        setPdfStatus('Neural engine decoding schedule...');
        const parseTimetable = httpsCallable<
            { pdfBase64: string },
            TimetableParseResult
          >(functions, "parseTimetable");

          const result = await parseTimetable({ pdfBase64: base64 });

          if (!result.data.schedule.length) {
            setPdfStatus("No timetable detected. Please add manually.");
            setShowManualInput(true);
            return;
          }

          setSchedule(result.data.schedule);
          setFreeSlots(result.data.freeSlots);

          // Persist immediately
          saveToDisk({
            schedule: result.data.schedule,
            freeSlots: result.data.freeSlots
          });



          if (result.data.warnings?.length) {
            console.warn("Timetable warnings:", result.data.warnings);
          }

          setPdfStatus(
            `Extracted ${result.data.schedule.length} classes · ${result.data.freeSlots.length} free slots`
          );

          setShowManualInput(true);
          setTimeout(() => setPdfStatus(""), 5000);

        setTimeout(() => setPdfStatus(''), 5000);
      } catch (error) {
        console.error(error);
        setPdfStatus('Tricky timetable detected. Try manual input.');
      } finally { setIsAnalyzingPDF(false); }
    };
    reader.readAsDataURL(file);
  };

      const calculateFreeSlots = () => {
        setView("slot-review");
      };

  const renderSearchInput = (placeholder: string) => (
    <div className="relative group max-w-xl">
      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
        <svg className="h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      <input type="text" placeholder={placeholder} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="block w-full pl-11 pr-12 py-4 glass border border-border/50 rounded-2xl text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition-all text-sm" />
      {searchTerm && (
        <button onClick={() => setSearchTerm('')} className="absolute inset-y-0 right-0 pr-4 flex items-center text-muted-foreground hover:text-white">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      )}
    </div>
  );

  const renderScreen = () => {
    if (authLoading) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-white font-black text-xl animate-pulse">
        Initializing Secure Session...
      </div>
    </div>
  );
}
    switch (view) {
      case 'splash':
        return (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-8 max-w-2xl mx-auto">
            <div className="w-24 h-24 bg-primary rounded-[2rem] flex items-center justify-center shadow-2xl animate-float"><svg className="w-12 h-12 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
            <div className="space-y-4"><h1 className="text-6xl font-black text-white tracking-tight">SchedWise</h1><p className="text-3xl font-bold text-primary italic leading-tight">“We don’t ask you to find time — we unlock it for you.”</p><p className="text-xl text-muted-foreground">AI-powered student planner</p></div>
            <button onClick={() => setView('auth')} className="px-12 py-5 bg-primary text-black font-black text-xl rounded-2xl shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all">Get Started</button>
          </div>
        );

      case 'auth':
        return (
          <div className="max-w-md mx-auto flex flex-col justify-center h-full space-y-10">
            <div className="text-center space-y-2"><h2 className="text-4xl font-black text-white">Unlock Your Day</h2><p className="text-muted-foreground">Log in to sync your neural schedule.</p></div>
            <div className="space-y-4">
              <button
                onClick={async () => {
                  try {
                    await loginWithGoogle();
                    // onAuthStateChanged will handle navigation
                  } catch (e) {
                    console.error("Google login failed", e);
                    alert("Google sign-in failed");
                  }
                }}
                className="w-full py-4 bg-white text-black font-black rounded-2xl flex items-center justify-center gap-3 hover:bg-gray-100 transition-colors shadow-xl"
              >

                <svg className="w-6 h-6" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg> 
                Continue with Google
              </button>
              <div className="relative"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border"></div></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-4 text-muted-foreground">Or</span></div></div>
              <input type="email" placeholder="Student Email" className="w-full bg-card border border-border p-4 rounded-xl text-white focus:ring-2 focus:ring-primary outline-none" />
              <input type="password" placeholder="Password" className="w-full bg-card border border-border p-4 rounded-xl text-white focus:ring-2 focus:ring-primary outline-none" />
              <button diabled className="w-full py-4 bg-primary text-black font-black rounded-2xl shadow-lg shadow-primary/20 hover:brightness-110 active:scale-[0.99] transition-all">Email login coming soon</button>
            </div>
            <p className="text-center text-xs text-muted-foreground">Your academic data is encrypted and private. 🔒</p>
          </div>
        );

      case 'onboarding-l1':
        return (
          <div className="max-w-3xl mx-auto space-y-12">
            <div className="text-center space-y-2"><h2 className="text-5xl font-black text-white">What's the vibe?</h2><p className="text-xl text-muted-foreground">Pick a main focus area to start exploring.</p></div>
            <div className="grid grid-cols-2 gap-6">
              {Object.keys(SKILL_TREE).map(cat => (
                <button key={cat} onClick={() => { setOnboardingContext({ category: cat }); setView('onboarding-l2'); }} className="group glass p-8 rounded-[2.5rem] border-2 border-border hover:border-primary transition-all text-left space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-muted group-hover:bg-primary transition-colors flex items-center justify-center"><svg className="w-6 h-6 text-white group-hover:text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg></div>
                  <span className="block text-2xl font-black text-white group-hover:text-primary">{cat}</span>
                </button>
              ))}
            </div>
            {profile.skills.length > 0 && <button onClick={() => setView('schedule-input')} className="w-full py-5 bg-white text-black font-black rounded-2xl">Continue with {profile.skills.length} skills</button>}
          </div>
        );

      case 'onboarding-l2':
        const currentCat = onboardingContext.category;
        if (!currentCat) return null;
        return (
          <div className="max-w-3xl mx-auto space-y-12">
            <button onClick={() => setView('onboarding-l1')} className="text-primary font-bold flex items-center gap-2 hover:underline"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg> Back to Categories</button>
            <div className="space-y-2"><h2 className="text-4xl font-black text-white">{currentCat}</h2><p className="text-xl text-muted-foreground">Choose a sub-category to refine your goals.</p></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.keys(SKILL_TREE[currentCat]).map(sub => (
                <button key={sub} onClick={() => { setOnboardingContext({ ...onboardingContext, subCategory: sub }); setView('onboarding-l3'); }} className="p-6 bg-card border border-border rounded-3xl text-left hover:border-primary transition-all flex items-center justify-between group">
                  <span className="text-lg font-bold text-white group-hover:text-primary">{sub}</span>
                  <svg className="w-5 h-5 text-muted-foreground group-hover:text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                </button>
              ))}
            </div>
          </div>
        );

      case 'onboarding-l3':
        const { category: c, subCategory: s } = onboardingContext;
        if (!c || !s) return null;
        const skills = SKILL_TREE[c][s];
        const filteredSkills = skills.filter(skillName => skillName.toLowerCase().includes(searchTerm.toLowerCase()));
        return (
          <div className="max-w-3xl mx-auto space-y-8 pb-32">
            <button onClick={() => setView('onboarding-l2')} className="text-primary font-bold flex items-center gap-2 hover:underline"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg> Back to {c}</button>
            <div className="space-y-2"><h2 className="text-4xl font-black text-white">{s}</h2><p className="text-xl text-muted-foreground">Select your skills and set their priority.</p></div>
            {renderSearchInput("Find specific skills...")}
            <div className="space-y-4">
              {filteredSkills.map(skillName => {
                const isSelected = profile.skills.some(sk => sk.name === skillName);
                return (
                  <div key={skillName} className={`glass p-6 rounded-3xl flex items-center justify-between transition-all ${isSelected ? 'border-primary bg-primary/5' : 'border-border'}`}>
                    <div className="flex items-center gap-4">
                      <button onClick={() => handleSkillToggle(skillName, s, c)} className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${isSelected ? 'bg-primary text-black' : 'bg-muted border border-border'}`}>{isSelected && <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}</button>
                      <span className="text-lg font-bold text-white">{skillName}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="fixed bottom-0 left-0 right-0 p-8 glass-strong border-t border-border z-50"><div className="max-w-3xl mx-auto flex items-center justify-between"><p className="text-white font-bold">{profile.skills.length} Skills Selected</p><button disabled={profile.skills.length === 0} onClick={() => setView('schedule-input')} className="px-12 py-4 bg-primary text-black font-black rounded-2xl shadow-lg disabled:opacity-50">Confirm Skills</button></div></div>
          </div>
        );

      case 'schedule-input':
        return (
          <div className="max-w-3xl mx-auto space-y-12 pb-40">
            <div className="space-y-4 text-center"><h2 className="text-6xl font-black text-white tracking-tight">Setup Your Timetable</h2><p className="text-xl text-muted-foreground italic">Add your classes (Busy) and we'll unlock the gaps for focus.</p></div>
            <div onClick={() => fileInputRef.current?.click()} className={`group glass border-4 border-dashed rounded-[3.5rem] p-12 flex flex-col items-center text-center space-y-6 cursor-pointer transition-all ${isAnalyzingPDF ? 'border-accent bg-accent/5' : 'border-accent/40 hover:border-accent shadow-xl'}`}>
              <div className="w-20 h-20 rounded-[2rem] bg-accent/20 flex items-center justify-center text-accent shadow-2xl relative z-10">{isAnalyzingPDF ? <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin"></div> : <span className="text-4xl">📄</span>}</div>
              <div className="relative z-10 space-y-2"><h3 className="text-3xl font-black text-white">Magic Upload</h3><p className="text-base text-muted-foreground/80 font-medium italic">We'll scan your PDF for busy slots automatically.</p></div>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".pdf" className="hidden" />
              <button disabled={isAnalyzingPDF} className="px-10 py-4 bg-accent text-white font-black text-lg rounded-2xl shadow-lg shadow-accent/20 relative z-10 disabled:opacity-50">{isAnalyzingPDF ? 'Analyzing...' : 'Upload & Analyze'}</button>
            </div>
            <div className="flex flex-col items-center space-y-8">
              {!showManualInput ? <button onClick={() => setShowManualInput(true)} className="px-10 py-4 glass border border-border rounded-2xl text-white font-black hover:bg-white/5 transition-all">Manual Entry Mode</button> : 
              <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between px-2"><h4 className="text-2xl font-black text-white">Manual Timetable</h4><button onClick={() => setSchedule([])} className="text-xs text-destructive font-black uppercase tracking-widest hover:underline px-4 py-2 rounded-xl bg-destructive/10">Clear List</button></div>
                <div className="space-y-4">{schedule.map(entry => (
                  <div key={entry.id} className="glass p-6 rounded-3xl flex flex-col md:flex-row gap-6 items-center border border-border/50 transition-all shadow-xl">
                    <div className="flex-1 grid grid-cols-2 gap-6 w-full"><div className="space-y-1"><p className="text-[10px] font-black uppercase text-primary tracking-widest pl-1">Start</p><input type="time" value={entry.from} onChange={(e) => setSchedule(schedule.map(s => s.id === entry.id ? { ...s, from: e.target.value } : s))} className="w-full bg-muted/50 p-4 rounded-2xl text-white outline-none font-bold" /></div><div className="space-y-1"><p className="text-[10px] font-black uppercase text-primary tracking-widest pl-1">End</p><input type="time" value={entry.to} onChange={(e) => setSchedule(schedule.map(s => s.id === entry.id ? { ...s, to: e.target.value } : s))} className="w-full bg-muted/50 p-4 rounded-2xl text-white outline-none font-bold" /></div></div>
                    <div className="flex items-center gap-4 w-full md:w-auto pt-2 md:pt-0"><button onClick={() => setSchedule(schedule.map(s => s.id === entry.id ? { ...s, status: s.status === 'Busy' ? 'Free' : 'Busy' } : s))} className={`flex-1 md:w-28 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${entry.status === 'Busy' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-primary/20 text-primary'}`}>{entry.status}</button><button onClick={() => setSchedule(schedule.filter(s => s.id !== entry.id))} className="w-14 h-14 bg-destructive/10 text-destructive rounded-2xl flex items-center justify-center hover:bg-destructive hover:text-white transition-all"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button></div>
                  </div>
                ))}
                <button onClick={() => setSchedule([...schedule, { id: `manual-${Date.now()}`, from: '09:00', to: '10:00', status: 'Busy' }])} className="w-full py-8 border-2 border-dashed border-border rounded-3xl text-muted-foreground font-black hover:text-white transition-all flex items-center justify-center gap-3 uppercase text-xs tracking-widest"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg> Add Entry</button></div></div>}
            </div>
            <div className="fixed bottom-0 left-0 right-0 p-8 glass-strong border-t border-border z-50"><div className="max-w-3xl mx-auto"><button disabled={schedule.length === 0 || isAnalyzingPDF} onClick={calculateFreeSlots} className="w-full py-6 bg-primary text-black font-black text-2xl rounded-2xl shadow-xl shadow-primary/20 transition-all disabled:opacity-50 active:scale-95">Analyze & Reveal Potential</button></div></div>
          </div>
        );

      case 'slot-review':
        return (
          <div className="max-w-3xl mx-auto space-y-12">
            <div className="space-y-2"><h2 className="text-5xl font-black text-white tracking-tight leading-tight">Timeline Unlocked.</h2><p className="text-xl text-muted-foreground font-medium">We identified {freeSlots.length} free periods for your growth profile.</p></div>
            <div className="space-y-6">{freeSlots.map(slot => (
              <div key={slot.id} className="glass p-8 rounded-[2.5rem] flex items-center justify-between border-l-8 border-primary shadow-xl animate-in fade-in slide-in-from-left-4">
                <div><p className="text-3xl font-black text-white tabular-nums tracking-tighter">{slot.from} - {slot.to}</p><p className="text-primary font-black uppercase text-xs tracking-widest mt-1">{slot.durationMinutes} Minutes Unlocked</p></div>
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary"><svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
              </div>
            ))}</div>
            <div className="flex flex-col md:flex-row gap-4 pt-10"><button onClick={() => setView('schedule-input')} className="flex-1 py-5 border-2 border-border text-white font-black rounded-2xl hover:bg-white/5 transition-all text-lg">Adjust Timetable</button><button onClick={() => { setProfile({ ...profile, isCompletedOnboarding: true }); saveToDisk({ profile: { ...profile, isCompletedOnboarding: true } }); setView('home'); }} className="flex-1 py-5 bg-primary text-black font-black text-xl rounded-2xl shadow-lg hover:scale-105 transition-all">Confirm & Finalize</button></div>
          </div>
        );

      case 'home':
        const filteredTimeline = schedule.filter(item => item.status.toLowerCase().includes(searchTerm.toLowerCase()));
        return (
          <div className="space-y-12">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div className="space-y-4 w-full"><p className="text-xs font-black uppercase text-primary tracking-widest">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p><h2 className="text-5xl font-black text-white">What can you do right now?</h2>{renderSearchInput("Search schedule, skills, or status...")}</div>
            </div>

            {/* DashBoard Continuity: Active Session Card */}
            {activeTask && (
                <div className="glass-strong p-8 rounded-[3rem] border-2 border-primary bg-primary/5 flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl animate-float">
                    <div className="flex items-center gap-6"><div className="w-16 h-16 rounded-[2rem] bg-primary flex items-center justify-center animate-pulse"><svg className="w-8 h-8 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
                    <div className="space-y-1"><h3 className="text-2xl font-black text-white">Focus Session Active</h3><p className="text-primary font-bold">{activeTask.title} • {timer}m remaining</p></div></div>
                    <button onClick={() => setView('focus')} className="px-10 py-4 bg-primary text-black font-black rounded-2xl shadow-xl hover:scale-105 transition-all">Resume Session</button>
                </div>
            )}

            {activeYoutubeSession && !activeTask && (
                <div className="glass-strong p-8 rounded-[3rem] border-2 border-accent bg-accent/5 flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl animate-float">
                    <div className="flex items-center gap-6"><div className="w-16 h-16 rounded-[2rem] bg-accent flex items-center justify-center"><svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
                    <div className="space-y-1"><h3 className="text-2xl font-black text-white">YouTube Session Active</h3><p className="text-accent font-bold">Learning {activeYoutubeSession.title}</p></div></div>
                    <button onClick={finishYoutubeSession} className="px-10 py-4 bg-accent text-white font-black rounded-2xl shadow-xl hover:scale-105 transition-all">Finish Learning</button>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
               <div className="lg:col-span-2 space-y-8"><div className="flex items-center justify-between"><h3 className="text-2xl font-black text-white">Daily Timeline</h3><button onClick={() => setView('schedule-input')} className="text-xs font-black text-primary uppercase tracking-widest bg-primary/10 px-4 py-2 rounded-xl">Edit Day</button></div>
                  <div className="relative pl-8 space-y-12 border-l-2 border-border/30 py-4">
                     {filteredTimeline.map(item => (
                       <div key={item.id} className="relative">
                          <div className={`absolute -left-[41px] w-5 h-5 rounded-full border-4 border-background ${item.status === 'Free' ? 'bg-primary shadow-[0_0_10px_rgba(162,240,126,0.5)]' : 'bg-muted'}`}></div>
                          <div className={`glass p-6 rounded-3xl flex items-center justify-between border transition-all ${item.status === 'Free' ? 'border-primary/30 hover:border-primary cursor-pointer' : 'border-border/50 opacity-60'}`}
                               onClick={() => { 
                                 if(item.status === 'Free' && !activeTask && !activeYoutubeSession) { 
                                   const slot = freeSlots.find(f => f.from === item.from) || null;
                                   if (slot) {
                                     setSelectedSlot(slot); 
                                     setSuggestions([]); // Immediately clear old ones
                                     setIsSuggestionsLoading(true); // Force loader logic to true synchronously
                                     setView('suggestions'); 
                                     loadSuggestions(slot); // Trigger fetch
                                   }
                                 } else if(activeTask) { 
                                   setView('focus'); 
                                 } 
                               }}>
                             <div><p className="text-sm font-bold text-muted-foreground uppercase">{item.from} - {item.to}</p><h4 className="text-2xl font-black text-white">{item.status === 'Free' ? 'Unlocked Slot' : 'Busy Block'}</h4></div>
                             {item.status === 'Free' && <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center"><svg className="w-5 h-5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg></div>}
                          </div>
                       </div>
                     ))}
                  </div>
               </div>
               <div className="space-y-8"><h3 className="text-2xl font-black text-white">Focus Mastery</h3><div className="glass p-8 rounded-[2.5rem] space-y-10 shadow-2xl">
                     {profile.skills.map(skill => (
                       <div key={skill.name} className="space-y-4"><div className="flex items-center justify-between"><div><h4 className="font-black text-white">{skill.name}</h4><span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${skill.priority === 'High' ? 'bg-red-500/20 text-red-400' : 'bg-primary/20 text-primary'}`}>{skill.priority}</span></div><span className="text-xl font-black text-white">{skillProgress[skill.name] || 0}%</span></div><div className="h-2 w-full bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary" style={{ width: `${skillProgress[skill.name] || 0}%`, transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)' }}></div></div></div>
                     ))}
               </div></div>
            </div>
          </div>
        );

      case 'suggestions':
        if (isSuggestionsLoading || suggestions.length === 0) {
          return (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] space-y-8 animate-in fade-in duration-500">
              <div className="relative w-20 h-20">
                <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-black text-white">Finding the best use of your time...</h2>
                <p className="text-muted-foreground italic text-lg">SchedWise is analyzing your growth profile.</p>
              </div>
            </div>
          );
        }
        return (
          <div className="max-w-4xl mx-auto space-y-12">
            <div className="flex items-center gap-6"><button onClick={() => { setView('home'); setSuggestions([]); }} className="p-4 bg-muted rounded-2xl text-white"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg></button><h2 className="text-5xl font-black text-white tracking-tight">Suggestions</h2></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{suggestions.map((s, idx) => (
              <div key={idx} className={`glass p-8 rounded-[2.5rem] flex flex-col justify-between border-2 transition-all hover:scale-[1.03] relative ${s.recommended ? 'border-primary' : 'border-border/50'}`}>
                {s.recommended && <div className="absolute top-0 right-8 -translate-y-1/2 bg-primary text-black font-black px-4 py-1 rounded-full text-[10px] uppercase tracking-widest shadow-lg shadow-primary/20">Recommended</div>}
                <div className="space-y-4"><span className="text-[10px] font-black text-primary uppercase tracking-widest">{s.skill} • {s.duration}m</span><h4 className="text-2xl font-black text-white">{s.title}</h4><p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">{s.description}</p></div>
                <div className="mt-8 flex flex-col gap-3">
                   <button onClick={() => startFocusSession(s)} className="w-full py-4 bg-primary text-black font-black rounded-2xl shadow-lg hover:brightness-110">Start Session</button>
                   <button onClick={() => handleWatchYoutube(s)} className="w-full py-4 bg-muted text-white font-bold rounded-2xl hover:bg-white/10 flex items-center justify-center gap-2">
                     <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 24 24"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/></svg>
                     Watch on YouTube
                   </button>
                </div>
              </div>
            ))}</div>
          </div>
        );

      case 'focus':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 items-center gap-16 h-full max-w-5xl mx-auto px-6 animate-in fade-in duration-700">
            <div className="space-y-10 text-center lg:text-left">
              <div className="space-y-4">
                <div className="flex items-center justify-center lg:justify-start gap-3"><span className="px-4 py-1.5 bg-primary/10 text-primary border border-primary/20 rounded-full text-[10px] font-black uppercase tracking-[0.25em]">{activeTask?.skill}</span><span className="text-muted-foreground font-bold text-xs tracking-widest uppercase opacity-40">Session Active</span></div>
                <h2 className="text-4xl md:text-5xl font-black text-white leading-tight max-w-xl">{activeTask?.title}</h2>
              </div>
              <div className="max-w-md glass p-7 rounded-3xl border border-border/40 shadow-xl mx-auto lg:mx-0"><p className="text-base text-muted-foreground italic leading-relaxed font-medium">“Excellence is not an act, but a habit. You are becoming what you repeatedly do.”</p></div>
              <div className="flex flex-col gap-4 max-w-md mx-auto lg:mx-0">
                <div className="flex gap-4"><button onClick={() => handleTaskEnd(true)} className="flex-[2] py-5 bg-primary text-black font-black text-lg rounded-2xl shadow-xl shadow-primary/20 transition-all">Complete Session</button><button onClick={() => setIsPaused(!isPaused)} className="flex-1 py-5 glass text-white/70 font-bold text-base rounded-2xl border border-border/50 hover:bg-white/5 active:scale-[0.98] transition-all">{isPaused ? 'Resume' : 'Pause'}</button></div>
                <button onClick={() => handleTaskEnd(false)} className="text-muted-foreground/40 text-[9px] font-black uppercase tracking-[0.5em] hover:text-red-500 transition-colors pt-4">Abandon Flow</button>
              </div>
            </div>
            <div className="flex justify-center lg:justify-end">
              <div className="relative w-48 h-48 flex items-center justify-center">
                <svg className="absolute inset-0 w-full h-full transform -rotate-90" viewBox="0 0 200 200">
                  <circle cx="100" cy="100" r="88" fill="none" stroke="currentColor" strokeWidth="4" className="text-muted/20" />
                  <circle cx="100" cy="100" r="88" fill="none" stroke="currentColor" strokeWidth="6" strokeDasharray={2 * Math.PI * 88} strokeDashoffset={2 * Math.PI * 88 - (2 * Math.PI * 88 * (timer / (activeTask?.duration || 1)))} strokeLinecap="round" className="text-primary transition-all duration-700 ease-out" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-5xl font-black text-white tabular-nums tracking-tighter">{timer}<span className="text-xl font-bold text-muted-foreground ml-1">m</span></span><span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em] opacity-50 mt-1">Remaining</span></div>
              </div>
            </div>
          </div>
        );

      case 'progress':
        return (
          <div className="space-y-12">
            <h2 className="text-5xl font-black text-white">Your Growth</h2>
            {completedSessions.length === 0 ? (
              <div className="py-24 text-center glass rounded-[3rem] border border-dashed border-border flex flex-col items-center gap-4"><h3 className="text-2xl font-black text-white">No focus sessions yet</h3><p className="text-muted-foreground">Complete your first session to see real-time metrics.</p><button onClick={() => setView('home')} className="mt-4 px-8 py-3 bg-primary text-black font-black rounded-xl">Unlock My Time</button></div>
            ) : (
              <><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="glass p-8 rounded-[2.5rem] border border-primary/20 bg-primary/5 space-y-2"><p className="text-[10px] font-black uppercase text-primary tracking-widest">Current MVP Skill</p><h4 className="text-2xl font-black text-white">{stats.mvpSkill}</h4></div>
                <div className="glass p-8 rounded-[2.5rem] border border-border space-y-2"><p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Total Focus Time</p><h4 className="text-2xl font-black text-white">{stats.totalFocusTime}</h4></div>
                <div className="glass p-8 rounded-[2.5rem] border border-border space-y-2"><p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Deep Work Score</p><h4 className="text-2xl font-black text-white">{stats.score} / 100</h4></div>
                <div className="glass p-8 rounded-[2.5rem] border border-border space-y-2"><p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Daily Streak</p><h4 className={`text-2xl font-black ${stats.streak > 0 ? 'text-orange-400' : 'text-white'}`}>{stats.streak} Days {stats.streak > 0 && "🔥"}</h4></div>
              </div>
              <div className="glass p-10 rounded-[3rem] space-y-12">{profile.skills.map(skill => (
                <div key={skill.name} className="space-y-6"><div className="flex justify-between items-end"><div className="space-y-1"><h4 className="text-2xl font-black text-white">{skill.name}</h4><p className="text-xs font-black uppercase text-muted-foreground tracking-widest">{skill.category}</p></div><div className="text-right"><span className="block text-3xl font-black text-primary">{skillProgress[skill.name] || 0}%</span><span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Neural Level {Math.floor((skillProgress[skill.name] || 0) / 20) + 1}</span></div></div><div className="h-6 w-full bg-muted rounded-2xl overflow-hidden p-1"><div className="h-full bg-gradient-to-r from-primary/50 to-primary rounded-xl shadow-[0_0_15px_rgba(162,240,126,0.3)] transition-all duration-1000" style={{ width: `${skillProgress[skill.name] || 0}%` }}></div></div></div>
              ))}</div></>
            )}
          </div>
        );

      case 'chat':
  return (
    <ChatView
      messages={chatMessages}
      onSend={handleSendMessage}
      loading={chatLoading}
    />
  );


      case 'settings':
        return (
          <div className="max-w-3xl mx-auto space-y-12">
            <h2 className="text-5xl font-black text-white">Neural Settings</h2>
            <div className="space-y-6">
              <div className="glass p-10 rounded-[3rem] space-y-10 border border-border/50 shadow-2xl">
                 <div className="space-y-6">
                    <h4 className="text-xs font-black uppercase text-primary tracking-widest">Knowledge Profile</h4>
                    <div onClick={() => setView('onboarding-l1')} className="flex items-center justify-between p-6 bg-muted/30 rounded-[2rem] border border-border hover:border-primary transition-all cursor-pointer group"><div className="flex items-center gap-4"><div className="w-12 h-12 bg-primary/20 rounded-2xl flex items-center justify-center group-hover:bg-primary transition-colors"><svg className="w-6 h-6 text-primary group-hover:text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg></div><div><p className="text-white font-black text-lg">Manage Skills & Priorities</p></div></div></div>
                    <div onClick={() => setView('schedule-input')} className="flex items-center justify-between p-6 bg-muted/30 rounded-[2rem] border border-border hover:border-primary transition-all cursor-pointer group"><div className="flex items-center gap-4"><div className="w-12 h-12 bg-primary/20 rounded-2xl flex items-center justify-center group-hover:bg-primary transition-colors"><svg className="w-6 h-6 text-primary group-hover:text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div><div><p className="text-white font-black text-lg">Recalibrate Daily Schedule</p></div></div></div>
                 </div>
                 <div className="space-y-10 pt-10 border-t border-border">
                    <h4 className="text-xs font-black uppercase text-muted-foreground tracking-widest">Environment</h4>
                    <div className="p-6 rounded-2xl border border-border bg-white/[0.02] flex flex-col md:flex-row md:items-center justify-between gap-6"><div className="space-y-1"><p className="text-white font-black">Log Out</p><p className="text-sm text-muted-foreground">Sign out of this device.</p></div><button onClick={handleLogOut} className="px-6 py-2 border border-border text-muted-foreground hover:text-white rounded-lg text-sm font-bold">Log Out</button></div>
                    <div className="p-6 rounded-2xl border border-red-500/20 bg-red-500/[0.02] flex flex-col md:flex-row md:items-center justify-between gap-6"><div className="space-y-1"><p className="text-red-400 font-black">Delete Account & Wipe Data</p><p className="text-sm text-muted-foreground">Permanently delete sessions and progress.</p></div><button onClick={() => setIsDeleteModalOpen(true)} className="px-6 py-2 bg-red-500/20 text-red-400 rounded-lg text-sm font-bold">Wipe Account</button></div>
                 </div>
              </div>
            </div>
          </div>
        );

      default: return null;
    }
  };

  const showSidebar = ['home', 'progress', 'chat', 'settings', 'suggestions', 'focus'].includes(view);

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden font-sans text-foreground">
      {/* Continuity Overlay: Persistent Return to Focus Indicator */}
      {activeTask && view !== 'focus' && (
          <div className="fixed bottom-32 md:bottom-auto md:top-8 right-8 z-50 animate-bounce-subtle pointer-events-none">
              <button onClick={() => setView('focus')} className="pointer-events-auto flex items-center gap-3 glass p-4 rounded-2xl border-2 border-primary shadow-2xl hover:scale-105 transition-all">
                  <div className="w-3 h-3 rounded-full bg-primary animate-pulse"></div>
                  <div className="text-left"><p className="text-[10px] font-black uppercase text-primary tracking-widest leading-none mb-1">In Focus</p><p className="text-sm font-bold text-white leading-tight">{timer}m left</p></div>
              </button>
          </div>
      )}

      {/* Continuity Overlay: Active YouTube Session */}
      {activeYoutubeSession && !activeTask && (
          <div className="fixed bottom-32 md:bottom-auto md:top-8 right-8 z-50 animate-bounce-subtle pointer-events-none">
              <button onClick={finishYoutubeSession} className="pointer-events-auto flex items-center gap-3 glass p-4 rounded-2xl border-2 border-accent shadow-2xl hover:scale-105 transition-all">
                  <div className="w-3 h-3 rounded-full bg-accent animate-pulse"></div>
                  <div className="text-left"><p className="text-[10px] font-black uppercase text-accent tracking-widest leading-none mb-1">Learning</p><p className="text-sm font-bold text-white leading-tight">Finish Session</p></div>
              </button>
          </div>
      )}

      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
          <div className="glass max-w-md w-full p-8 rounded-3xl border border-red-500/30 shadow-2xl space-y-6">
            <h3 className="text-2xl font-black text-white">Are you absolutely sure?</h3>
            <div className="space-y-3"><p className="text-[10px] font-black uppercase text-red-400 tracking-widest">Type DELETE to confirm</p><input type="text" value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder="DELETE" className="w-full bg-black/40 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 font-black focus:outline-none focus:ring-2 focus:ring-red-500/50" /></div>
            <div className="flex gap-4"><button onClick={() => { setIsDeleteModalOpen(false); setDeleteConfirmText(''); }} className="flex-1 py-3 glass rounded-xl text-white font-bold text-sm">Cancel</button><button disabled={deleteConfirmText !== 'DELETE'} onClick={handleDeleteAccount} className="flex-1 py-3 bg-red-500 text-white rounded-xl font-black text-sm disabled:opacity-30 shadow-lg shadow-red-500/20">Purge All Data</button></div>
          </div>
        </div>
      )}

      {showSidebar && (
        <div className={`hidden lg:block transition-all duration-300 ${isSidebarCollapsed ? 'w-24' : 'w-72'} h-full z-20`}>
          <aside className="h-full border-r border-border bg-card/50 flex flex-col relative">
             <div className="p-8 flex items-center gap-4"><div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20 shrink-0"><svg className="w-6 h-6 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>{!isSidebarCollapsed && <span className="text-2xl font-black text-white tracking-tight">SchedWise</span>}</div>
             <nav className="flex-1 px-4 space-y-3 mt-8 overflow-y-auto hide-scrollbar">
                {[
                  { id: 'home', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
                  { id: 'progress', label: 'Growth Tree', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
                  { id: 'chat', label: 'Intelligence', icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
                  { id: 'settings', label: 'Control', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' }
                ].map(item => (
                  <button key={item.id} onClick={() => setView(item.id as AppView)} className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all group ${view === item.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-white/5 hover:text-white'}`}>
                   <svg
                      className="w-6 h-6 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d={item.icon}
                      />
                    </svg>
                    {!isSidebarCollapsed && (
                      <span className="font-black uppercase text-[10px] tracking-widest whitespace-nowrap">
                        {item.label}
                      </span>
                    )}
                  </button>
                ))}
             </nav>
             <button onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} className="absolute top-1/2 -right-3 w-6 h-6 bg-border border border-muted rounded-full flex items-center justify-center text-white hover:bg-primary transition-colors z-30"><svg className={`w-4 h-4 transition-transform ${isSidebarCollapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg></button>
          </aside>
        </div>
      )}
      
      <div className="flex-1 flex flex-col min-w-0 h-full relative z-10">
        <main className={`flex-1 overflow-y-auto p-6 md:p-16 lg:p-24 transition-all duration-500 ${showSidebar ? 'pb-32 lg:pb-24' : ''}`}><div className="max-w-7xl mx-auto h-full">{renderScreen()}</div></main>
        {showSidebar && (
          <div className="lg:hidden fixed bottom-0 left-0 right-0 glass-strong border-t border-border px-8 py-5 flex justify-around items-center z-50 safe-bottom">
            {[
              { id: 'home', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
              { id: 'progress', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
              { id: 'chat', icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
              { id: 'settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' }
            ].map(item => (<button key={item.id} onClick={() => setView(item.id as AppView)} className={`p-3 rounded-2xl transition-all ${view === item.id ? 'bg-primary/20 text-primary shadow-xl scale-110' : 'text-muted-foreground'}`}><svg
                className="w-7 h-7"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d={item.icon}
                />
              </svg>
            </button>))}
          </div>
        )}
        <div className="fixed bottom-[-15%] right-[-10%] w-[60%] h-[60%] bg-primary/10 rounded-full blur-[160px] pointer-events-none -z-10"></div>
        <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-accent/5 rounded-full blur-[120px] pointer-events-none -z-10"></div>
      </div>
    </div>
  );
};

export default App;
