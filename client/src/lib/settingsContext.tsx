import { createContext, useContext, useState, ReactNode, useEffect } from "react";

export interface StaffMember {
  id: string;
  name: string;
  role: "sales" | "production" | "install";
  dailyCapacityHours: number;
  skills: ("posts" | "panels" | "production")[];
  color: string;
  active: boolean;
}

export interface PipelineColumn {
  id: string;
  title: string;
  color?: string;
}

export interface PipelineConfig {
  leads: PipelineColumn[];
  quotes: PipelineColumn[];
  production: PipelineColumn[];
}

export interface InstallStage {
  id: string;
  title: string;
  order: number;
}

export interface AppSettings {
  companyName: string;
  defaultWorkHoursPerDay: number;
  installStages: InstallStage[];
}

interface SettingsContextType {
  staff: StaffMember[];
  setStaff: (staff: StaffMember[]) => void;
  addStaff: (member: StaffMember) => void;
  updateStaff: (member: StaffMember) => void;
  deleteStaff: (id: string) => void;
  
  pipelines: PipelineConfig;
  setPipelines: (pipelines: PipelineConfig) => void;
  addPipelineColumn: (pipelineType: keyof PipelineConfig, column: PipelineColumn) => void;
  updatePipelineColumn: (pipelineType: keyof PipelineConfig, column: PipelineColumn) => void;
  deletePipelineColumn: (pipelineType: keyof PipelineConfig, columnId: string) => void;
  reorderPipelineColumns: (pipelineType: keyof PipelineConfig, columns: PipelineColumn[]) => void;
  
  appSettings: AppSettings;
  setAppSettings: (settings: AppSettings) => void;
  
  getDailyInstallCapacity: () => number;
}

const STORAGE_KEY = "probuild_settings";

const DEFAULT_STAFF: StaffMember[] = [
  { id: "all", name: "All Staff", role: "sales", dailyCapacityHours: 0, skills: [], color: "bg-gray-500", active: true },
  { id: "wayne", name: "Wayne", role: "sales", dailyCapacityHours: 8, skills: [], color: "bg-blue-500", active: true },
  { id: "bradley", name: "Bradley", role: "sales", dailyCapacityHours: 8, skills: [], color: "bg-blue-500", active: true },
  { id: "dave_turner", name: "Dave Turner", role: "sales", dailyCapacityHours: 8, skills: [], color: "bg-blue-500", active: true },
  { id: "david_rees", name: "David Rees", role: "sales", dailyCapacityHours: 8, skills: [], color: "bg-blue-500", active: true },
];

const DEFAULT_PIPELINES: PipelineConfig = {
  leads: [
    { id: "new_lead", title: "New Lead", color: "bg-slate-500" },
    { id: "contacted", title: "Contacted/Waiting", color: "bg-blue-500" },
    { id: "need_quote", title: "Need to Quote", color: "bg-amber-500" },
    { id: "book_inspection", title: "Book Inspection", color: "bg-purple-500" },
    { id: "quote_sent", title: "Quote Sent", color: "bg-cyan-500" },
    { id: "deposit_paid", title: "Deposit Paid", color: "bg-green-500" },
  ],
  quotes: [
    { id: "fresh", title: "Fresh (0-3 Days)", color: "bg-green-500" },
    { id: "in_discussion", title: "In Discussion", color: "bg-blue-500" },
    { id: "awaiting_reply", title: "Awaiting Reply", color: "bg-amber-500" },
    { id: "follow_up", title: "Follow Up Required", color: "bg-orange-500" },
    { id: "hot", title: "Hot Lead", color: "bg-red-500" },
    { id: "revision", title: "Revision Requested", color: "bg-purple-500" },
    { id: "on_hold", title: "On Hold", color: "bg-slate-500" },
    { id: "lost", title: "Lost", color: "bg-gray-500" },
  ],
  production: [
    { id: "man_posts", title: "Manufacture Posts", color: "bg-amber-500" },
    { id: "inst_posts", title: "Install Posts", color: "bg-blue-500" },
    { id: "man_panels", title: "Manufacture Panels", color: "bg-purple-500" },
    { id: "inst_panels", title: "Install Panels", color: "bg-cyan-500" },
    { id: "complete", title: "Complete", color: "bg-green-500" },
  ],
};

const DEFAULT_INSTALL_STAGES: InstallStage[] = [
  { id: "pending_posts", title: "Pending Posts", order: 1 },
  { id: "posts_scheduled", title: "Posts Scheduled", order: 2 },
  { id: "measuring", title: "Measuring", order: 3 },
  { id: "manufacturing_panels", title: "Manufacturing Panels", order: 4 },
  { id: "pending_panels", title: "Pending Panels", order: 5 },
  { id: "panels_scheduled", title: "Panels Scheduled", order: 6 },
  { id: "completed", title: "Completed", order: 7 },
];

const DEFAULT_APP_SETTINGS: AppSettings = {
  companyName: "PROBUILD",
  defaultWorkHoursPerDay: 8,
  installStages: DEFAULT_INSTALL_STAGES,
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [staff, setStaffState] = useState<StaffMember[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.staff || DEFAULT_STAFF;
      }
    } catch (e) {
      console.error("Failed to load staff from storage:", e);
    }
    return DEFAULT_STAFF;
  });

  const [pipelines, setPipelinesState] = useState<PipelineConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.pipelines || DEFAULT_PIPELINES;
      }
    } catch (e) {
      console.error("Failed to load pipelines from storage:", e);
    }
    return DEFAULT_PIPELINES;
  });

  const [appSettings, setAppSettingsState] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.appSettings || DEFAULT_APP_SETTINGS;
      }
    } catch (e) {
      console.error("Failed to load app settings from storage:", e);
    }
    return DEFAULT_APP_SETTINGS;
  });

  const [isLoaded, setIsLoaded] = useState(false);

  // Load settings from database on mount
  useEffect(() => {
    const loadFromServer = async () => {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const serverSettings = await res.json();
          if (serverSettings.staff) setStaffState(serverSettings.staff);
          if (serverSettings.pipelines) setPipelinesState(serverSettings.pipelines);
          if (serverSettings.appSettings) setAppSettingsState(serverSettings.appSettings);
        }
      } catch (e) {
        console.error("Failed to load settings from server:", e);
      }
      setIsLoaded(true);
    };
    loadFromServer();
  }, []);

  // Save settings to both localStorage and database when they change
  useEffect(() => {
    if (!isLoaded) return; // Don't save until we've loaded from server
    
    const settingsData = { staff, pipelines, appSettings };
    
    // Save to localStorage for fast local access
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settingsData));
    } catch (e) {
      console.error("Failed to save settings to localStorage:", e);
    }
    
    // Debounced save to database
    const saveToServer = async () => {
      try {
        await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settingsData),
        });
      } catch (e) {
        console.error("Failed to save settings to server:", e);
      }
    };
    
    const timeoutId = setTimeout(saveToServer, 1000); // Debounce 1 second
    return () => clearTimeout(timeoutId);
  }, [staff, pipelines, appSettings, isLoaded]);

  const setStaff = (newStaff: StaffMember[]) => setStaffState(newStaff);
  
  const addStaff = (member: StaffMember) => {
    setStaffState(prev => [...prev, member]);
  };

  const updateStaff = (member: StaffMember) => {
    setStaffState(prev => prev.map(s => s.id === member.id ? member : s));
  };

  const deleteStaff = (id: string) => {
    setStaffState(prev => prev.filter(s => s.id !== id));
  };

  const setPipelines = (newPipelines: PipelineConfig) => setPipelinesState(newPipelines);

  const addPipelineColumn = (pipelineType: keyof PipelineConfig, column: PipelineColumn) => {
    setPipelinesState(prev => ({
      ...prev,
      [pipelineType]: [...prev[pipelineType], column],
    }));
  };

  const updatePipelineColumn = (pipelineType: keyof PipelineConfig, column: PipelineColumn) => {
    setPipelinesState(prev => ({
      ...prev,
      [pipelineType]: prev[pipelineType].map(c => c.id === column.id ? column : c),
    }));
  };

  const deletePipelineColumn = (pipelineType: keyof PipelineConfig, columnId: string) => {
    setPipelinesState(prev => ({
      ...prev,
      [pipelineType]: prev[pipelineType].filter(c => c.id !== columnId),
    }));
  };

  const reorderPipelineColumns = (pipelineType: keyof PipelineConfig, columns: PipelineColumn[]) => {
    setPipelinesState(prev => ({
      ...prev,
      [pipelineType]: columns,
    }));
  };

  const setAppSettings = (settings: AppSettings) => setAppSettingsState(settings);

  const getDailyInstallCapacity = () => {
    return staff
      .filter(s => s.role === "install" && s.active && s.id !== "all")
      .reduce((sum, s) => sum + s.dailyCapacityHours, 0);
  };

  return (
    <SettingsContext.Provider value={{
      staff,
      setStaff,
      addStaff,
      updateStaff,
      deleteStaff,
      pipelines,
      setPipelines,
      addPipelineColumn,
      updatePipelineColumn,
      deletePipelineColumn,
      reorderPipelineColumns,
      appSettings,
      setAppSettings,
      getDailyInstallCapacity,
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}
