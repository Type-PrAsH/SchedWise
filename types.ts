

export type AppView = 
  | 'splash' 
  | 'auth' 
  | 'onboarding-l1' 
  | 'onboarding-l2' 
  | 'onboarding-l3' 
  | 'schedule-input' 
  | 'slot-review' 
  | 'home' 
  | 'suggestions' 
  | 'focus' 
  | 'progress' 
  | 'chat' 
  | 'settings';

export type Priority = 'Low' | 'Medium' | 'High';

export interface Skill {
  name: string;
  category: string;
  subCategory: string;
  priority: Priority;
}

export interface ScheduleEntry {
  id: string;
  from: string; // HH:mm
  to: string;   // HH:mm
  status: 'Busy' | 'Free';
}

export interface TimeSlot {
  id: string;
  from: string;
  to: string;
  durationMinutes: number;
}

export interface Suggestion {
  id: string;
  title: string;
  description: string;
  duration: number;
  type: 'light' | 'practice' | 'deep';
  skill: string;
  recommended?: boolean;
}

export interface UserProfile {
  name: string;
  selectedCategories: string[];
  skills: Skill[];
  isCompletedOnboarding: boolean;
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

// Added GeneratedAsset for Imagine and Video views
export interface GeneratedAsset {
  id: string;
  type: 'image' | 'video';
  url: string;
  prompt: string;
  timestamp: number;
}