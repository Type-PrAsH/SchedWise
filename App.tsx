
import React, { useState, useEffect, useRef } from 'react';
import { 
  AppView, 
  UserProfile, 
  Skill, 
  ScheduleEntry, 
  TimeSlot, 
  Suggestion, 
  Priority,
  Message
} from './types';
import Sidebar from './components/Sidebar';
import { geminiService } from './services/gemini';

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
  const [activeTask, setActiveTask] = useState<Suggestion | null>(null);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAnalyzingPDF, setIsAnalyzingPDF] = useState(false);
  const [pdfStatus, setPdfStatus] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);

  // Focus Timer States
  const [timer, setTimer] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
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
      setProgress(data.progress || {});
      if (data.profile.isCompletedOnboarding) setView('home');
    }
  }, []);

  const saveToDisk = (updates: any) => {
    const current = { profile, schedule, freeSlots, progress };
    const merged = { ...current, ...updates };
    localStorage.setItem('lumina_planner_data', JSON.stringify(merged));
  };

  // --- Suggestion Loading Logic ---
  useEffect(() => {
    if (view === 'suggestions' && selectedSlot && suggestions.length === 0) {
      const load = async () => {
        const res = await geminiService.getSuggestions(selectedSlot, profile.skills);
        setSuggestions(res);
      };
      load();
    }
  }, [view, selectedSlot, suggestions.length, profile.skills]);

  // --- Focus Timer Logic ---
  useEffect(() => {
    if (activeTask) {
      setTimer(activeTask.duration);
      setIsPaused(false);
    }
  }, [activeTask]);

  useEffect(() => {
    let interval: any;
    if (view === 'focus' && timer > 0 && !isPaused) {
      interval = setInterval(() => setTimer(t => Math.max(0, t - 1)), 60000);
    }
    return () => clearInterval(interval);
  }, [view, timer, isPaused]);

  // --- Chat Auto Scroll ---
  useEffect(() => {
    if (view === 'chat' && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, view]);

  // Reset search term when switching views
  useEffect(() => {
    setSearchTerm('');
  }, [view]);

  // --- Handlers ---
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

    if (file.type !== 'application/pdf') {
      alert("Please upload a PDF file.");
      return;
    }

    setIsAnalyzingPDF(true);
    setPdfStatus('Reading your timetable...');

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = (event.target?.result as string).split(',')[1];
      try {
        setPdfStatus('Neural engine decoding schedule...');
        const entries = await geminiService.analyzeTimetableFile(base64, file.type);
        setSchedule(prev => [...prev, ...entries]);
        setPdfStatus(`Found ${entries.length} slots. Review below.`);
        setShowManualInput(true); // Show the results in manual list for verification
        setTimeout(() => setPdfStatus(''), 5000);
      } catch (error) {
        console.error(error);
        setPdfStatus('Tricky timetable detected. Try manual input.');
      } finally {
        setIsAnalyzingPDF(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const calculateFreeSlots = () => {
    const slots = schedule
      .filter(s => s.status === 'Free')
      .map(s => {
        const [h1, m1] = s.from.split(':').map(Number);
        const [h2, m2] = s.to.split(':').map(Number);
        const duration = (h2 * 60 + m2) - (h1 * 60 + m1);
        return { id: s.id, from: s.from, to: s.to, durationMinutes: duration };
      });
    setFreeSlots(slots);
    saveToDisk({ freeSlots: slots });
    setView('slot-review');
  };

  const handleSendMessage = async (text: string) => {
    if (!text.trim()) return;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', text, timestamp: Date.now() };
    setChatMessages(prev => [...prev, userMsg]);
    setChatLoading(true);
    
    try {
      const history = chatMessages.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
      const response = await geminiService.chatAssistant(text, profile, history);
      const modelMsg: Message = { id: (Date.now() + 1).toString(), role: 'model', text: response, timestamp: Date.now() };
      setChatMessages(prev => [...prev, modelMsg]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleTaskEnd = (isComplete: boolean) => {
    if (isComplete && activeTask) {
       const sName = activeTask.skill;
       const nextProgress = { ...progress, [sName]: Math.min((progress[sName] || 0) + 10, 100) };
       setProgress(nextProgress);
       saveToDisk({ progress: nextProgress });
    }
    setView('home');
    setActiveTask(null);
    setSuggestions([]);
  };

  const renderSearchInput = (placeholder: string) => (
    <div className="relative group max-w-xl">
      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
        <svg className="h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      <input
        type="text"
        placeholder={placeholder}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="block w-full pl-11 pr-12 py-4 glass border border-border/50 rounded-2xl text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition-all text-sm"
      />
      {searchTerm && (
        <button 
          onClick={() => setSearchTerm('')}
          className="absolute inset-y-0 right-0 pr-4 flex items-center text-muted-foreground hover:text-white"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );

  // --- Render Components ---

  const renderScreen = () => {
    switch (view) {
      case 'splash':
        return (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-8 max-w-2xl mx-auto">
            <div className="w-24 h-24 bg-primary rounded-[2rem] flex items-center justify-center shadow-2xl animate-float">
              <svg className="w-12 h-12 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="space-y-4">
              <h1 className="text-6xl font-black text-white tracking-tight">SchedWise</h1>
              <p className="text-3xl font-bold text-primary italic leading-tight">
                “We don’t ask you to find time — we unlock it for you.”
              </p>
              <p className="text-xl text-muted-foreground">AI-powered student planner</p>
            </div>
            <button 
              onClick={() => setView('auth')}
              className="px-12 py-5 bg-primary text-black font-black text-xl rounded-2xl shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
            >
              Get Started
            </button>
          </div>
        );

      case 'auth':
        return (
          <div className="max-w-md mx-auto flex flex-col justify-center h-full space-y-10">
            <div className="text-center space-y-2">
              <h2 className="text-4xl font-black text-white">Unlock Your Day</h2>
              <p className="text-muted-foreground">Log in to sync your neural schedule.</p>
            </div>
            <div className="space-y-4">
              <button className="w-full py-4 bg-white text-black font-black rounded-2xl flex items-center justify-center gap-3 hover:bg-gray-100 transition-colors">
                <svg className="w-6 h-6" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Continue with Google
              </button>
              <div className="relative"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border"></div></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-4 text-muted-foreground">Or</span></div></div>
              <input type="email" placeholder="Student Email" className="w-full bg-card border border-border p-4 rounded-xl text-white focus:ring-2 focus:ring-primary outline-none" />
              <input type="password" placeholder="Password" className="w-full bg-card border border-border p-4 rounded-xl text-white focus:ring-2 focus:ring-primary outline-none" />
              <button onClick={() => setView('onboarding-l1')} className="w-full py-4 bg-primary text-black font-black rounded-2xl shadow-lg shadow-primary/20 hover:brightness-110">Sign In</button>
            </div>
            <p className="text-center text-xs text-muted-foreground">Your academic data is encrypted and private. 🔒</p>
          </div>
        );

      case 'onboarding-l1':
        return (
          <div className="max-w-3xl mx-auto space-y-12">
            <div className="text-center space-y-2">
              <h2 className="text-5xl font-black text-white">What's the vibe?</h2>
              <p className="text-xl text-muted-foreground">Pick a main focus area to start exploring.</p>
            </div>
            <div className="grid grid-cols-2 gap-6">
              {Object.keys(SKILL_TREE).map(cat => (
                <button
                  key={cat}
                  onClick={() => { setOnboardingContext({ category: cat }); setView('onboarding-l2'); }}
                  className="group glass p-8 rounded-[2.5rem] border-2 border-border hover:border-primary transition-all text-left space-y-4"
                >
                  <div className="w-12 h-12 rounded-2xl bg-muted group-hover:bg-primary transition-colors flex items-center justify-center">
                    <svg className="w-6 h-6 text-white group-hover:text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <span className="block text-2xl font-black text-white group-hover:text-primary">{cat}</span>
                </button>
              ))}
            </div>
            <div className="flex justify-center pt-8">
               <p className="text-sm text-muted-foreground font-medium">Selected Skills: {profile.skills.length}</p>
            </div>
            {profile.skills.length > 0 && (
              <button onClick={() => setView('schedule-input')} className="w-full py-5 bg-white text-black font-black rounded-2xl">Continue with {profile.skills.length} skills</button>
            )}
          </div>
        );

      case 'onboarding-l2':
        const currentCat = onboardingContext.category;
        if (!currentCat) return null;
        const subs = Object.keys(SKILL_TREE[currentCat]);
        return (
          <div className="max-w-3xl mx-auto space-y-12">
            <button onClick={() => setView('onboarding-l1')} className="text-primary font-bold flex items-center gap-2 hover:underline">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              Back to Categories
            </button>
            <div className="space-y-2">
              <h2 className="text-4xl font-black text-white">{currentCat}</h2>
              <p className="text-xl text-muted-foreground">Choose a sub-category to refine your goals.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {subs.map(sub => (
                <button
                  key={sub}
                  onClick={() => { setOnboardingContext({ ...onboardingContext, subCategory: sub }); setView('onboarding-l3'); }}
                  className="p-6 bg-card border border-border rounded-3xl text-left hover:border-primary transition-all flex items-center justify-between group"
                >
                  <span className="text-lg font-bold text-white group-hover:text-primary">{sub}</span>
                  <svg className="w-5 h-5 text-muted-foreground group-hover:text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
              ))}
            </div>
          </div>
        );

      case 'onboarding-l3':
        const { category: c, subCategory: s } = onboardingContext;
        if (!c || !s) return null;
        const skills = SKILL_TREE[c][s];
        const filteredSkills = skills.filter(skillName => 
          skillName.toLowerCase().includes(searchTerm.toLowerCase())
        );

        return (
          <div className="max-w-3xl mx-auto space-y-8 pb-32">
            <button onClick={() => setView('onboarding-l2')} className="text-primary font-bold flex items-center gap-2 hover:underline">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              Back to {c}
            </button>
            <div className="space-y-2">
              <h2 className="text-4xl font-black text-white">{s}</h2>
              <p className="text-xl text-muted-foreground">Select your skills and set their priority.</p>
            </div>

            {renderSearchInput("Find specific skills...")}

            <div className="space-y-4">
              {filteredSkills.length > 0 ? filteredSkills.map(skillName => {
                const skillData = profile.skills.find(sk => sk.name === skillName);
                const isSelected = !!skillData;
                return (
                  <div key={skillName} className={`glass p-6 rounded-3xl flex items-center justify-between transition-all ${isSelected ? 'border-primary bg-primary/5' : 'border-border'}`}>
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => handleSkillToggle(skillName, s, c)}
                        className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${isSelected ? 'bg-primary text-black' : 'bg-muted border border-border'}`}
                      >
                        {isSelected && <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                      </button>
                      <span className="text-lg font-bold text-white">{skillName}</span>
                    </div>
                    {isSelected && (
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-black uppercase text-muted-foreground">Priority</span>
                        <select 
                          value={skillData.priority}
                          onChange={(e) => updateSkillPriority(skillName, e.target.value as Priority)}
                          className="bg-card border border-border rounded-xl px-4 py-2 text-sm text-white focus:ring-1 focus:ring-primary outline-none"
                        >
                          <option>Low</option>
                          <option>Medium</option>
                          <option>High</option>
                        </select>
                      </div>
                    )}
                  </div>
                );
              }) : (
                <div className="py-12 text-center text-muted-foreground border-2 border-dashed border-border rounded-3xl">
                  No skills found matching "{searchTerm}"
                </div>
              )}
            </div>
            <div className="fixed bottom-0 left-0 right-0 p-8 glass-strong border-t border-border z-50">
               <div className="max-w-3xl mx-auto flex items-center justify-between">
                  <p className="text-white font-bold">{profile.skills.length} Skills Selected</p>
                  <button 
                    disabled={profile.skills.length === 0}
                    onClick={() => setView('schedule-input')}
                    className="px-12 py-4 bg-primary text-black font-black rounded-2xl shadow-lg disabled:opacity-50"
                  >
                    Confirm Skills
                  </button>
               </div>
            </div>
          </div>
        );

      case 'schedule-input':
        return (
          <div className="max-w-3xl mx-auto space-y-16 pb-40">
            <div className="space-y-4 text-center">
              <h2 className="text-6xl font-black text-white tracking-tight">Setup Your Timetable</h2>
              <p className="text-xl text-muted-foreground italic">Subject names don’t matter — only time matters.</p>
            </div>

            {/* HERO SECTION: PDF UPLOAD (PDF-FIRST) */}
            <div className="space-y-6">
              <div 
                onClick={() => fileInputRef.current?.click()}
                className={`group glass border-4 border-dashed relative overflow-hidden transition-all duration-500 rounded-[3.5rem] p-16 flex flex-col items-center text-center space-y-8 cursor-pointer ${
                  isAnalyzingPDF ? 'border-accent animate-pulse-glow bg-accent/5' : 'border-accent/40 hover:border-accent hover:bg-accent/10 shadow-xl'
                }`}
              >
                <div className="w-24 h-24 rounded-[2rem] bg-accent/20 flex items-center justify-center text-accent shadow-2xl shadow-accent/20 relative z-10">
                   {isAnalyzingPDF ? (
                     <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
                   ) : (
                     <span className="text-5xl">📄</span>
                   )}
                </div>
                <div className="relative z-10 space-y-3">
                   <h3 className="text-4xl font-black text-white">Upload Your Timetable PDF</h3>
                   <p className="text-lg text-muted-foreground/80 font-medium">We’ll read the time for you. Drag & drop or click to browse.</p>
                </div>
                
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  accept=".pdf" 
                  className="hidden" 
                />

                <button 
                  disabled={isAnalyzingPDF}
                  className="px-12 py-4 bg-accent text-white font-black text-xl rounded-2xl shadow-lg shadow-accent/20 hover:scale-105 active:scale-95 transition-all relative z-10 disabled:opacity-50"
                >
                  {isAnalyzingPDF ? 'Analyzing...' : 'Upload & Analyze'}
                </button>

                {pdfStatus && (
                  <div className="absolute bottom-6 left-0 right-0 flex justify-center px-8">
                    <div className="bg-accent/20 border border-accent/30 rounded-full px-6 py-2 backdrop-blur-md">
                      <p className="text-sm text-accent font-black uppercase tracking-widest">{pdfStatus}</p>
                    </div>
                  </div>
                )}
                
                <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-accent/10 rounded-full blur-[100px] pointer-events-none"></div>
              </div>
            </div>

            {/* SECONDARY OPTION: MANUAL ENTRY (DE-EMPHASIZED) */}
            <div className="flex flex-col items-center space-y-6">
              {!showManualInput ? (
                <div className="text-center space-y-4">
                  <p className="text-muted-foreground font-bold text-lg">Don’t have a PDF?</p>
                  <button 
                    onClick={() => setShowManualInput(true)}
                    className="px-8 py-3 glass border border-border rounded-xl text-white font-bold hover:bg-white/5 transition-all"
                  >
                    Enter Manually
                  </button>
                </div>
              ) : (
                <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="flex items-center justify-between">
                    <h4 className="text-2xl font-black text-white">Refine Schedule</h4>
                    <button onClick={() => setSchedule([])} className="text-xs text-destructive font-black uppercase tracking-widest hover:underline">Clear All</button>
                  </div>

                  <div className="space-y-4">
                    {schedule.map(entry => (
                      <div key={entry.id} className="glass p-6 rounded-3xl grid grid-cols-1 md:grid-cols-4 gap-6 items-center border border-border/50 hover:border-primary/30 transition-all">
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-black uppercase text-primary tracking-widest">Start Time</span>
                          <input type="time" value={entry.from} onChange={(e) => setSchedule(schedule.map(s => s.id === entry.id ? { ...s, from: e.target.value } : s))} className="bg-muted/50 p-3 rounded-xl text-white outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-black uppercase text-primary tracking-widest">End Time</span>
                          <input type="time" value={entry.to} onChange={(e) => setSchedule(schedule.map(s => s.id === entry.id ? { ...s, to: e.target.value } : s))} className="bg-muted/50 p-3 rounded-xl text-white outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-black uppercase text-primary tracking-widest">Status</span>
                          <select value={entry.status} onChange={(e) => setSchedule(schedule.map(s => s.id === entry.id ? { ...s, status: e.target.value as any } : s))} className="bg-muted/50 p-3 rounded-xl text-white outline-none focus:ring-2 focus:ring-primary">
                            <option>Busy</option>
                            <option>Free</option>
                          </select>
                        </div>
                        <button onClick={() => setSchedule(schedule.filter(s => s.id !== entry.id))} className="text-destructive font-bold text-sm hover:underline mt-4 md:mt-0">Delete Block</button>
                      </div>
                    ))}
                    
                    <button 
                      onClick={() => setSchedule([...schedule, { id: Date.now().toString(), from: '09:00', to: '10:00', status: 'Busy' }])}
                      className="w-full py-8 border-2 border-dashed border-border rounded-3xl text-muted-foreground font-bold hover:text-white hover:border-primary/50 transition-all flex flex-col items-center gap-2"
                    >
                      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                      Add Another Entry
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="fixed bottom-0 left-0 right-0 p-8 glass-strong border-t border-border z-50">
               <div className="max-w-3xl mx-auto">
                  <button 
                    disabled={schedule.length === 0 || isAnalyzingPDF}
                    onClick={calculateFreeSlots}
                    className="w-full py-6 bg-primary text-black font-black text-2xl rounded-2xl shadow-xl shadow-primary/20 hover:scale-[1.01] transition-all disabled:opacity-50"
                  >
                    Analyze Schedule
                  </button>
               </div>
            </div>
          </div>
        );

      case 'slot-review':
        return (
          <div className="max-w-3xl mx-auto space-y-12">
            <div className="space-y-2">
              <h2 className="text-5xl font-black text-white">Here’s what we found.</h2>
              <p className="text-xl text-muted-foreground">Want to tweak anything before we finalize your day?</p>
            </div>
            <div className="space-y-6">
              {freeSlots.length === 0 ? (
                <div className="text-center py-20 bg-muted/20 rounded-3xl border border-dashed border-border">
                   <p className="text-muted-foreground">No free slots detected. Busy day? Try adding a manual slot.</p>
                </div>
              ) : freeSlots.map(slot => (
                <div key={slot.id} className="glass p-8 rounded-[2.5rem] flex items-center justify-between border-l-8 border-primary shadow-xl">
                  <div>
                    <p className="text-3xl font-black text-white">{slot.from} - {slot.to}</p>
                    <p className="text-primary font-bold text-lg">{slot.durationMinutes} minutes of potential</p>
                  </div>
                  <div className="flex gap-4">
                    <button onClick={() => setView('schedule-input')} className="p-3 bg-muted rounded-2xl text-white hover:bg-muted/80">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button onClick={() => setFreeSlots(freeSlots.filter(s => s.id !== slot.id))} className="p-3 bg-destructive/10 text-destructive rounded-2xl hover:bg-destructive/20">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-col md:flex-row gap-4 pt-10">
              <button onClick={() => setView('schedule-input')} className="flex-1 py-5 border-2 border-border text-white font-bold rounded-2xl hover:bg-white/5">Edit Slots</button>
              <button onClick={() => { setProfile({ ...profile, isCompletedOnboarding: true }); saveToDisk({ profile: { ...profile, isCompletedOnboarding: true } }); setView('home'); }} className="flex-1 py-5 bg-primary text-black font-black text-xl rounded-2xl shadow-lg">Confirm Slots</button>
            </div>
          </div>
        );

      case 'home':
        const filteredTimeline = schedule.filter(item => 
          item.status.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.from.includes(searchTerm) ||
          item.to.includes(searchTerm)
        );

        const filteredMasterySkills = profile.skills.filter(skill =>
          skill.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          skill.category.toLowerCase().includes(searchTerm.toLowerCase())
        );

        return (
          <div className="space-y-12">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div className="space-y-4 w-full">
                <div className="space-y-1">
                  <p className="text-xs font-black uppercase text-primary tracking-widest">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                  <h2 className="text-5xl font-black text-white">What can you do right now?</h2>
                </div>
                {renderSearchInput("Search schedule, skills, or status...")}
              </div>
              <div className="flex items-center gap-4 bg-card/50 p-4 rounded-3xl border border-border shrink-0">
                <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center">
                  <svg className="w-6 h-6 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <div>
                   <p className="text-xs text-muted-foreground font-bold uppercase">Next Slot In</p>
                   <p className="text-xl font-black text-white">{freeSlots[0]?.from || '--:--'}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
               <div className="lg:col-span-2 space-y-8">
                  <div className="flex items-center justify-between">
                     <h3 className="text-2xl font-black text-white">Daily Timeline</h3>
                     <button onClick={() => setView('schedule-input')} className="text-primary text-sm font-bold hover:underline">Edit Day</button>
                  </div>
                  <div className="relative pl-8 space-y-12 border-l-2 border-border/30 py-4">
                     {filteredTimeline.length === 0 ? (
                       <p className="text-muted-foreground italic">No schedule entries found matching your search.</p>
                     ) : filteredTimeline.map(item => (
                       <div key={item.id} className="relative">
                          <div className={`absolute -left-[41px] w-5 h-5 rounded-full border-4 border-background ${item.status === 'Free' ? 'bg-primary shadow-[0_0_10px_rgba(162,240,126,0.5)]' : 'bg-muted'}`}></div>
                          <div className={`glass p-6 rounded-3xl flex items-center justify-between border transition-all ${item.status === 'Free' ? 'border-primary/30 hover:border-primary cursor-pointer' : 'border-border/50 opacity-60'}`}
                               onClick={() => { if(item.status === 'Free') { setSelectedSlot(freeSlots.find(f => f.id === item.id) || null); setView('suggestions'); } }}>
                             <div>
                                <p className="text-sm font-bold text-muted-foreground uppercase">{item.from} - {item.to}</p>
                                <h4 className="text-2xl font-black text-white">{item.status === 'Free' ? 'Unlocked Slot' : 'Busy Block'}</h4>
                             </div>
                             {item.status === 'Free' && (
                               <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                                  <svg className="w-5 h-5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                               </div>
                             )}
                          </div>
                       </div>
                     ))}
                  </div>
               </div>
               
               <div className="space-y-8">
                  <h3 className="text-2xl font-black text-white">Focus Mastery</h3>
                  <div className="glass p-8 rounded-[2.5rem] space-y-10 shadow-2xl">
                     {filteredMasterySkills.length === 0 ? (
                       <p className="text-sm text-muted-foreground italic">No matching skills found.</p>
                     ) : filteredMasterySkills.map(skill => (
                       <div key={skill.name} className="space-y-4">
                          <div className="flex items-center justify-between">
                             <div>
                                <h4 className="font-black text-white">{skill.name}</h4>
                                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${skill.priority === 'High' ? 'bg-red-500/20 text-red-400' : skill.priority === 'Medium' ? 'bg-primary/20 text-primary' : 'bg-blue-500/20 text-blue-400'}`}>{skill.priority}</span>
                             </div>
                             <span className="text-xl font-black text-white">{progress[skill.name] || 0}%</span>
                          </div>
                          <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                             <div className="h-full bg-primary shadow-[0_0_10px_rgba(162,240,126,0.3)]" style={{ width: `${progress[skill.name] || 0}%`, transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)' }}></div>
                          </div>
                       </div>
                     ))}
                     <button onClick={() => setView('progress')} className="w-full py-4 bg-muted rounded-2xl text-sm font-bold text-white hover:bg-white/10 transition-colors">Insights Dashboard</button>
                  </div>
                  
                  <div className="bg-primary/5 border border-primary/20 p-8 rounded-[2.5rem] space-y-4">
                     <p className="text-sm text-primary font-bold italic">“SchedWise Insight: You are most productive between 10:00 AM and 12:00 PM. Keep it up!”</p>
                  </div>
               </div>
            </div>
          </div>
        );

      case 'suggestions':
        const filteredSuggestions = suggestions.filter(s => 
          s.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.skill.toLowerCase().includes(searchTerm.toLowerCase())
        );

        return (
          <div className="max-w-4xl mx-auto space-y-12">
            <div className="flex flex-col gap-8">
              <div className="flex items-center gap-6">
                <button onClick={() => { setView('home'); setSuggestions([]); }} className="p-4 bg-muted rounded-2xl text-white hover:scale-105 transition-all">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <div className="space-y-1">
                  <h2 className="text-5xl font-black text-white tracking-tight">Suggestions</h2>
                  <p className="text-xl text-primary font-bold">Optimizing {selectedSlot?.durationMinutes} minutes of free time</p>
                </div>
              </div>

              {renderSearchInput("Search suggestions by keyword or skill...")}
            </div>

            {suggestions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 space-y-6">
                <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin shadow-[0_0_20px_rgba(162,240,126,0.2)]"></div>
                <p className="text-xl text-muted-foreground font-medium animate-pulse italic">Synthesizing personalized focus paths...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredSuggestions.length > 0 ? filteredSuggestions.map((s, idx) => (
                  <div key={idx} className={`glass p-8 rounded-[2.5rem] flex flex-col justify-between border-2 transition-all hover:scale-[1.03] group relative overflow-hidden ${s.recommended ? 'border-primary' : 'border-border/50'}`}>
                    {s.recommended && <div className="absolute top-0 right-8 -translate-y-1/2 bg-primary text-black font-black px-4 py-1 rounded-full text-[10px] uppercase tracking-widest shadow-lg shadow-primary/20">Recommended</div>}
                    <div className="space-y-4 relative z-10">
                       <div className="flex justify-between items-start">
                          <span className="text-[10px] font-black text-primary uppercase tracking-widest">{s.skill} • {s.duration}m</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${s.type === 'light' ? 'bg-blue-500/20 text-blue-400' : s.type === 'practice' ? 'bg-orange-500/20 text-orange-400' : 'bg-red-500/20 text-red-400'}`}>{s.type}</span>
                       </div>
                       <h4 className="text-2xl font-black text-white group-hover:text-primary transition-colors">{s.title}</h4>
                       <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">{s.description}</p>
                    </div>
                    <div className="mt-8 flex flex-col gap-3 relative z-10">
                       <button onClick={() => { setActiveTask(s); setView('focus'); }} className="w-full py-4 bg-primary text-black font-black rounded-2xl shadow-lg hover:brightness-110 transition-all">Start Now</button>
                       <button className="w-full py-4 bg-muted text-white font-bold rounded-2xl hover:bg-white/10">Archive</button>
                    </div>
                    <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-primary/5 blur-3xl rounded-full"></div>
                  </div>
                )) : (
                  <div className="col-span-full py-20 text-center border-2 border-dashed border-border rounded-3xl text-muted-foreground">
                    No suggestions match your search criteria.
                  </div>
                )}
              </div>
            )}
          </div>
        );

      case 'focus':
        return (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-12">
            <div className="space-y-4">
              <h2 className="text-6xl font-black text-white tracking-tighter animate-float">{activeTask?.title}</h2>
              <div className="flex items-center justify-center gap-3">
                 <span className="px-4 py-1 bg-primary/20 text-primary rounded-full text-sm font-black uppercase tracking-widest">{activeTask?.skill}</span>
                 <span className="text-muted-foreground font-bold">• Deep Work Session</span>
              </div>
            </div>

            <div className="relative w-80 h-80 group">
               <svg className="w-full h-full transform -rotate-90 scale-110">
                 <circle cx="160" cy="160" r="145" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-muted/30" />
                 <circle cx="160" cy="160" r="145" stroke="currentColor" strokeWidth="12" fill="transparent" strokeDasharray="911" strokeDashoffset={911 - (911 * (timer / (activeTask?.duration || 1)))} className="text-primary transition-all duration-1000 shadow-[0_0_20px_rgba(162,240,126,0.3)]" />
               </svg>
               <div className="absolute inset-0 flex flex-col items-center justify-center">
                 <span className="text-7xl font-black text-white">{timer}m</span>
                 <span className="text-xs font-black text-muted-foreground uppercase tracking-widest">Time Remaining</span>
               </div>
            </div>

            <div className="max-w-md bg-card/50 p-6 rounded-3xl border border-border shadow-xl">
               <p className="text-lg text-muted-foreground italic leading-relaxed">“SchedWise Focus: Excellence is not an act, but a habit. You are becoming what you repeatedly do.”</p>
            </div>

            <div className="flex gap-6 w-full max-w-lg">
               <button onClick={() => handleTaskEnd(true)} className="flex-1 py-6 bg-primary text-black font-black text-xl rounded-3xl shadow-2xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all">Complete Session</button>
               <button onClick={() => setIsPaused(!isPaused)} className="flex-1 py-6 bg-muted text-white font-black text-xl rounded-3xl border border-border hover:bg-white/5 transition-all">{isPaused ? 'Resume' : 'Pause'}</button>
            </div>
          </div>
        );

      case 'progress':
        return (
          <div className="space-y-12">
            <div className="space-y-2">
              <h2 className="text-5xl font-black text-white">Your Growth</h2>
              <p className="text-xl text-muted-foreground">Every session is a neural upgrade.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
               <div className="glass p-8 rounded-[2.5rem] border border-primary/20 bg-primary/5 space-y-2">
                  <p className="text-[10px] font-black uppercase text-primary tracking-widest">Current MVP Skill</p>
                  <h4 className="text-2xl font-black text-white">Programming</h4>
                  <p className="text-xs text-muted-foreground font-medium">Top 2% efficiency reached this week.</p>
               </div>
               <div className="glass p-8 rounded-[2.5rem] border border-border space-y-2">
                  <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Total Focus Time</p>
                  <h4 className="text-2xl font-black text-white">42h 15m</h4>
                  <p className="text-xs text-muted-foreground font-medium">+12% vs last week.</p>
               </div>
               <div className="glass p-8 rounded-[2.5rem] border border-border space-y-2">
                  <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Deep Work Score</p>
                  <h4 className="text-2xl font-black text-white">92 / 100</h4>
                  <p className="text-xs text-muted-foreground font-medium">Exceptional mental resilience.</p>
               </div>
               <div className="glass p-8 rounded-[2.5rem] border border-border space-y-2">
                  <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Daily Streak</p>
                  <h4 className="text-2xl font-black text-white text-orange-400">7 Days 🔥</h4>
                  <p className="text-xs text-muted-foreground font-medium">Keep the momentum alive.</p>
               </div>
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-black text-white">Skill Proficiency Tree</h3>
                <div className="flex bg-muted p-1 rounded-xl">
                  <button className="px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest bg-card text-white shadow-lg">Weekly</button>
                  <button className="px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest text-muted-foreground">Monthly</button>
                </div>
              </div>
              <div className="glass p-10 rounded-[3rem] space-y-12">
                {profile.skills.length === 0 ? (
                  <p className="text-muted-foreground text-center py-20 italic">No skill data available. Complete sessions to see growth.</p>
                ) : profile.skills.map(skill => (
                  <div key={skill.name} className="space-y-6">
                    <div className="flex justify-between items-end">
                      <div className="space-y-1">
                        <h4 className="text-2xl font-black text-white">{skill.name}</h4>
                        <p className="text-xs font-black uppercase text-muted-foreground tracking-widest">{skill.category} • {skill.subCategory}</p>
                      </div>
                      <div className="text-right">
                        <span className="block text-3xl font-black text-primary">{progress[skill.name] || 0}%</span>
                        <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Level 2 Scholar</span>
                      </div>
                    </div>
                    <div className="h-6 w-full bg-muted rounded-2xl overflow-hidden p-1">
                      <div className="h-full bg-gradient-to-r from-primary/50 to-primary rounded-xl shadow-[0_0_15px_rgba(162,240,126,0.3)] transition-all duration-1000" style={{ width: `${progress[skill.name] || 0}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 'chat':
        return (
          <div className="h-full flex flex-col glass rounded-[3rem] overflow-hidden shadow-2xl border border-border/50">
            <div className="p-8 border-b border-border bg-card/50 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20">
                  <svg className="w-8 h-8 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                </div>
                <div>
                  <h3 className="text-xl font-black text-white">SchedWise Assistant</h3>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-success animate-pulse"></div>
                    <span className="text-[10px] font-black uppercase text-success tracking-widest">Active Intelligence</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8 hide-scrollbar">
              {chatMessages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-4">
                   <p className="text-lg text-muted-foreground italic font-medium">“Class cancelled? Feeling uninspired? Or just want to recalibrate today's schedule? Talk to me.”</p>
                </div>
              )}
              {chatMessages.map(m => (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] p-6 rounded-[2rem] shadow-xl ${m.role === 'user' ? 'bg-primary text-black font-bold rounded-tr-none' : 'bg-muted/40 text-white border border-border rounded-tl-none'}`}>
                    <p className="text-sm leading-relaxed">{m.text}</p>
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-muted/20 p-6 rounded-[2rem] rounded-tl-none border border-border animate-pulse flex items-center gap-3">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 rounded-full bg-primary animate-bounce"></div>
                      <div className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:-0.1s]"></div>
                      <div className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:-0.2s]"></div>
                    </div>
                    <span className="text-[10px] font-black uppercase text-muted-foreground">SchedWise is typing...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="p-8 border-t border-border bg-background/50">
              <form 
                onSubmit={(e) => { e.preventDefault(); const input = (e.target as any).msg.value; handleSendMessage(input); (e.target as any).msg.value = ''; }}
                className="flex gap-3 max-w-4xl mx-auto"
              >
                <input name="msg" autoComplete="off" type="text" placeholder="Explain your situation..." className="flex-1 bg-muted/40 border border-border rounded-2xl px-6 py-4 text-white placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/50 transition-all" />
                <button type="submit" className="w-16 h-16 bg-primary text-black rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                </button>
              </form>
            </div>
          </div>
        );

      case 'settings':
        return (
          <div className="max-w-3xl mx-auto space-y-12">
            <h2 className="text-5xl font-black text-white">Neural Settings</h2>
            <div className="space-y-6">
              <div className="glass p-10 rounded-[3rem] space-y-10 border border-border/50 shadow-2xl">
                 <div className="space-y-6">
                    <h4 className="text-xs font-black uppercase text-primary tracking-widest">Knowledge Profile</h4>
                    <div onClick={() => setView('onboarding-l1')} className="flex items-center justify-between p-6 bg-muted/30 rounded-[2rem] border border-border hover:border-primary transition-all cursor-pointer group">
                       <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-primary/20 rounded-2xl flex items-center justify-center group-hover:bg-primary transition-colors">
                             <svg className="w-6 h-6 text-primary group-hover:text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                          </div>
                          <div>
                             <p className="text-white font-black text-lg">Manage Skills & Priorities</p>
                             <p className="text-xs text-muted-foreground font-medium">Currently optimized for {profile.skills.length} skills.</p>
                          </div>
                       </div>
                       <svg className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </div>

                    <div onClick={() => setView('schedule-input')} className="flex items-center justify-between p-6 bg-muted/30 rounded-[2rem] border border-border hover:border-primary transition-all cursor-pointer group">
                       <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-primary/20 rounded-2xl flex items-center justify-center group-hover:bg-primary transition-colors">
                             <svg className="w-6 h-6 text-primary group-hover:text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          </div>
                          <div>
                             <p className="text-white font-black text-lg">Recalibrate Daily Schedule</p>
                             <p className="text-xs text-muted-foreground font-medium">Update busy blocks and class times.</p>
                          </div>
                       </div>
                       <svg className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </div>
                 </div>

                 <div className="space-y-6 pt-6 border-t border-border">
                    <h4 className="text-xs font-black uppercase text-muted-foreground tracking-widest">Environment</h4>
                    <div className="flex items-center justify-between p-3">
                       <span className="text-white font-bold">Witty AI Responses</span>
                       <div className="w-12 h-6 bg-primary rounded-full relative shadow-inner"><div className="absolute right-1 top-1 w-4 h-4 bg-black rounded-full shadow-md"></div></div>
                    </div>
                    <div className="flex items-center justify-between p-3">
                       <span className="text-white font-bold">Deep Work Notifications</span>
                       <div className="w-12 h-6 bg-primary rounded-full relative shadow-inner"><div className="absolute right-1 top-1 w-4 h-4 bg-black rounded-full shadow-md"></div></div>
                    </div>
                    <button 
                      onClick={() => { localStorage.clear(); window.location.reload(); }}
                      className="w-full py-4 text-destructive font-black text-sm border-2 border-destructive/20 rounded-2xl hover:bg-destructive hover:text-white transition-all"
                    >
                      Log Out & Wipe Data
                    </button>
                 </div>
              </div>
              <p className="text-center text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em]">SchedWise Studia • Advanced Temporal Optimization Platform v4.2.0</p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const showSidebar = ['home', 'progress', 'chat', 'settings', 'suggestions', 'focus'].includes(view);

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden font-sans text-foreground">
      {showSidebar && (
        <div className={`hidden lg:block transition-all duration-300 ${isSidebarCollapsed ? 'w-24' : 'w-72'} h-full z-20`}>
          <aside className="h-full border-r border-border bg-card/50 flex flex-col relative">
             <div className="p-8 flex items-center gap-4">
                <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20 shrink-0">
                   <svg className="w-6 h-6 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                {!isSidebarCollapsed && <span className="text-2xl font-black text-white tracking-tight">SchedWise</span>}
             </div>
             
             <nav className="flex-1 px-4 space-y-3 mt-8">
                {[
                  { id: 'home', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
                  { id: 'progress', label: 'Insights', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
                  { id: 'chat', label: 'Assistant', icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
                  { id: 'settings', label: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' }
                ].map(item => (
                  <button
                    key={item.id}
                    onClick={() => setView(item.id as AppView)}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all group ${view === item.id ? 'bg-primary/10 text-primary shadow-inner shadow-primary/5' : 'text-muted-foreground hover:bg-white/5 hover:text-white'}`}
                  >
                    <svg className="w-6 h-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} /></svg>
                    {!isSidebarCollapsed && <span className="font-black uppercase text-[10px] tracking-widest">{item.label}</span>}
                  </button>
                ))}
             </nav>

             <button 
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                className="absolute top-1/2 -right-3 w-6 h-6 bg-border border border-muted rounded-full flex items-center justify-center text-white hover:bg-primary hover:text-black transition-colors z-30"
             >
                <svg className={`w-4 h-4 transition-transform ${isSidebarCollapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg>
             </button>

             <div className="p-8 border-t border-border mt-auto">
                <div className={`p-4 bg-muted/20 rounded-2xl flex items-center gap-4 ${isSidebarCollapsed ? 'justify-center' : ''}`}>
                   <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center font-black text-white">S</div>
                   {!isSidebarCollapsed && (
                     <div className="overflow-hidden">
                        <p className="text-xs font-black text-white truncate">Scholar Tier</p>
                        <p className="text-[10px] text-muted-foreground truncate uppercase tracking-widest">Efficiency 88%</p>
                     </div>
                   )}
                </div>
             </div>
          </aside>
        </div>
      )}
      
      <div className="flex-1 flex flex-col min-w-0 h-full relative z-10">
        <main className={`flex-1 overflow-y-auto p-6 md:p-16 lg:p-24 transition-all duration-500 ${showSidebar ? 'pb-32 lg:pb-24' : ''}`}>
          <div className="max-w-7xl mx-auto h-full">
            {renderScreen()}
          </div>
        </main>

        {showSidebar && (
          <div className="lg:hidden fixed bottom-0 left-0 right-0 glass-strong border-t border-border px-8 py-5 flex justify-around items-center z-50 safe-bottom">
            {[
              { id: 'home', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
              { id: 'chat', icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
              { id: 'progress', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
              { id: 'settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' }
            ].map(item => (
              <button key={item.id} onClick={() => setView(item.id as AppView)} className={`p-3 rounded-2xl transition-all ${view === item.id ? 'bg-primary/20 text-primary shadow-xl scale-110' : 'text-muted-foreground'}`}>
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} /></svg>
              </button>
            ))}
          </div>
        )}

        {/* Dynamic Glow Backgrounds */}
        <div className="fixed bottom-[-15%] right-[-10%] w-[60%] h-[60%] bg-primary/10 rounded-full blur-[160px] pointer-events-none -z-10"></div>
        <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-accent/5 rounded-full blur-[120px] pointer-events-none -z-10"></div>
      </div>
    </div>
  );
};

export default App;
