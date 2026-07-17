import React from 'react';
import { create } from 'zustand';
import { AppState, FullHistoryState } from '../types';
import { generateDemoState, createEmptyUnavailability } from '../utils/demoData';
import { ProgressUpdate, generateAutomaticScheduleAsync, stopActiveScheduler, getDefaultMaxDepth, preSolveFeasibilityCheck } from '../utils/scheduler';
import { loadScheduleFromCloud, saveScheduleToCloud } from '../firebase';

const LOCAL_STORAGE_KEY = "okul_ders_programi_state";

const getFormattedDate = () => {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
};

const slugify = (text: string) => {
  const turkishChars: { [key: string]: string } = {
    'ç': 'c', 'Ç': 'C',
    'ğ': 'g', 'Ğ': 'G',
    'ı': 'i', 'İ': 'I',
    'ö': 'o', 'Ö': 'O',
    'ş': 's', 'Ş': 'S',
    'ü': 'u', 'Ü': 'U',
    ' ': '-'
  };
  return text
    .split('')
    .map(char => turkishChars[char] || char)
    .join('')
    .replace(/[^a-zA-Z0-9\-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

interface UIState {
  activeTab: "school" | "courses" | "classrooms" | "classes" | "teachers" | "assignments" | "teacher_assignments" | "schedule" | "realtime_status" | "print" | "backup_delete";
  assignmentTabTeacherId: string;
  assignmentTabCourseId: string;
  teacherAssignTabSearch: string;
  courseAssignTabSearch: string;
  selectedTeacherId: string;
  selectedClassId: string;
  selectedClassroomId: string;
  scheduleViewMode: "class" | "teacher" | "classroom";
  viewingEntityId: string;
  focusedCell: { dIdx: number; pIdx: number } | null;
  editingCell: {
    classId: string;
    dayIndex: number;
    periodIndex: number;
  } | null;
  selectedAssignmentId: string;
  contextMenu: {
    x: number;
    y: number;
    classId: string;
    dayIndex: number;
    periodIndex: number;
  } | null;
  teacherContextMenu: {
    x: number;
    y: number;
    teacherId: string;
    dayIndex: number;
    periodIndex: number;
    classId: string;
  } | null;
  isSidebarOpen: boolean;
  isSchedulerSettingsOpen: boolean;
  isShortcutsOpen: boolean;
  newTeacher: {
    name: string;
    branch: string;
    shortName: string;
    homeroomClass: string;
  };
  editingTeacherId: string | null;
  newClass: { name: string };
  editingClassId: string | null;
  newClassroom: { name: string; shortName: string };
  editingClassroomId: string | null;
  newCourse: { name: string; code: string; weeklyHours: number; placementMode: string };
  editingCourseId: string | null;
  newAssignment: {
    classId: string;
    courseId: string;
    teacherId: string;
    weeklyHours: number;
    classroomId: string | null;
    preferredBlockSize: number;
    customPlacementMode: string;
  };
  copySourceClassId: string;
  isScheduling: boolean;
  schedulingProgress: ProgressUpdate | null;
  isSchedulingOptionsOpen: boolean;
  schedulingKeepExisting: boolean;
  deepSearch: boolean;
  numTrials: number;
  unplacedReports: any[];
  activeClassroomTabId: string;
  isAnalysisOpen: boolean;
  selectedAssignmentToAssignRoom: string;
  searchQuery: string;
  toast: { message: string; type: "success" | "error" | "info" } | null;
  confirmModal: {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    isDangerous?: boolean;
    action: () => void;
  } | null;
  user: any | null;
  userLoading: boolean;
}

interface AppStoreActions {
  setHistoryState: (historyState: FullHistoryState) => void;
  updateState: (updater: (draft: AppState) => void) => void;
  undo: () => void;
  redo: () => void;
  saveToCloud: () => void | Promise<void>;
  setUser: (user: any | null) => void;
  loadFromCloud: () => Promise<void>;
  setToast: (toast: { message: string; type: "success" | "error" | "info" } | null) => void;
  showToast: (message: string, type: "success" | "error" | "info") => void;
  setConfirmModal: (modal: UIState["confirmModal"]) => void;
  handleClearAllData: () => void;
  handleClearConstraints: () => void;
  handleClearManualLocks: () => void;
  handleClearAllTeachersSchedule: () => void;
  handleDownloadBackup: () => void;
  handleImportBackup: (event: React.ChangeEvent<HTMLInputElement>) => void;
  
  // Setters for UI state
  setActiveTab: (tab: UIState["activeTab"]) => void;
  setAssignmentTabTeacherId: (id: string) => void;
  setAssignmentTabCourseId: (id: string) => void;
  setTeacherAssignTabSearch: (search: string) => void;
  setCourseAssignTabSearch: (search: string) => void;
  setSelectedTeacherId: (id: string) => void;
  setSelectedClassId: (id: string) => void;
  setSelectedClassroomId: (id: string) => void;
  setScheduleViewMode: (mode: UIState["scheduleViewMode"]) => void;
  setViewingEntityId: (id: string) => void;
  setFocusedCell: (cell: UIState["focusedCell"]) => void;
  setEditingCell: (cell: UIState["editingCell"]) => void;
  setSelectedAssignmentId: (id: string) => void;
  setContextMenu: (menu: UIState["contextMenu"]) => void;
  setTeacherContextMenu: (menu: UIState["teacherContextMenu"]) => void;
  setIsSidebarOpen: (isOpen: boolean) => void;
  setIsSchedulerSettingsOpen: (isOpen: boolean) => void;
  setIsShortcutsOpen: (isOpen: boolean) => void;
  setNewTeacher: (teacher: Partial<UIState["newTeacher"]> | ((prev: UIState["newTeacher"]) => UIState["newTeacher"])) => void;
  setEditingTeacherId: (id: string | null) => void;
  setNewClass: (cls: Partial<UIState["newClass"]> | ((prev: UIState["newClass"]) => UIState["newClass"])) => void;
  setEditingClassId: (id: string | null) => void;
  setNewClassroom: (classroom: Partial<UIState["newClassroom"]> | ((prev: UIState["newClassroom"]) => UIState["newClassroom"])) => void;
  setEditingClassroomId: (id: string | null) => void;
  setNewCourse: (course: Partial<UIState["newCourse"]> | ((prev: UIState["newCourse"]) => UIState["newCourse"])) => void;
  setEditingCourseId: (id: string | null) => void;
  setNewAssignment: (assignment: Partial<UIState["newAssignment"]> | ((prev: UIState["newAssignment"]) => UIState["newAssignment"])) => void;
  setCopySourceClassId: (id: string) => void;
  setIsScheduling: (isScheduling: boolean) => void;
  setSchedulingProgress: (progress: ProgressUpdate | null) => void;
  setIsSchedulingOptionsOpen: (isOpen: boolean) => void;
  setSchedulingKeepExisting: (keep: boolean) => void;
  setDeepSearch: (deep: boolean) => void;
  setNumTrials: (trials: number) => void;
  setUnplacedReports: (reports: any[]) => void;
  setActiveClassroomTabId: (id: string) => void;
  setIsAnalysisOpen: (isOpen: boolean) => void;
  setSelectedAssignmentToAssignRoom: (id: string) => void;
  setSearchQuery: (query: string) => void;
  verileri_hazırla: () => Promise<AppState>;
  dersleri_yerleştir: (preparedState: AppState, keepExisting: boolean, targets?: { classIds?: string[], teacherIds?: string[] }) => Promise<any>;
  stopAutomaticScheduler: () => void;
  runAutomaticScheduler: (keepExisting: boolean, targets?: { classIds?: string[], teacherIds?: string[] }, bypassFeasibilityCheck?: boolean) => Promise<void>;
  handleAutoGenerateClick: () => void;
  handleScheduleSelectedTeacher: () => void;
  handleScheduleAllTeachers: () => void;
}

export type AppStore = {
  historyState: FullHistoryState;
} & UIState & AppStoreActions;

const initialUIState: UIState = {
  activeTab: "school",
  assignmentTabTeacherId: "",
  assignmentTabCourseId: "",
  teacherAssignTabSearch: "",
  courseAssignTabSearch: "",
  selectedTeacherId: "",
  selectedClassId: "",
  selectedClassroomId: "",
  scheduleViewMode: "class",
  viewingEntityId: "",
  focusedCell: null,
  editingCell: null,
  selectedAssignmentId: "",
  contextMenu: null,
  teacherContextMenu: null,
  isSidebarOpen: true,
  isSchedulerSettingsOpen: false,
  isShortcutsOpen: false,
  newTeacher: {
    name: "",
    branch: "",
    shortName: "",
    homeroomClass: ""
  },
  editingTeacherId: null,
  newClass: { name: "" },
  editingClassId: null,
  newClassroom: { name: "", shortName: "" },
  editingClassroomId: null,
  newCourse: { name: "", code: "", weeklyHours: 2, placementMode: "2" },
  editingCourseId: null,
  newAssignment: {
    classId: "",
    courseId: "",
    teacherId: "",
    weeklyHours: 2,
    classroomId: null,
    preferredBlockSize: 2,
    customPlacementMode: "2"
  },
  copySourceClassId: "",
  isScheduling: false,
  schedulingProgress: null,
  isSchedulingOptionsOpen: false,
  schedulingKeepExisting: false,
  deepSearch: false,
  numTrials: 8,
  unplacedReports: [],
  activeClassroomTabId: "",
  isAnalysisOpen: false,
  selectedAssignmentToAssignRoom: "",
  searchQuery: "",
  toast: null,
  confirmModal: null,
  user: null,
  userLoading: true,
};

const getInitialHistoryState = (): FullHistoryState => {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.current) {
        return {
          current: parsed.current,
          past: [],
          future: [],
          isSynced: parsed.isSynced ?? true
        };
      }
    }
  } catch (e) {
    console.error("Local storage load failed:", e);
  }

  return {
    current: generateDemoState(),
    past: [],
    future: [],
    isSynced: true
  };
};

export const useAppStore = create<AppStore>((set) => ({
  historyState: getInitialHistoryState(),
  ...initialUIState,

  setHistoryState: (historyState) => set({ historyState }),

  updateState: (updater) => set((store) => {
    if (!store.user) {
      return {
        toast: { message: "Değişiklik yapabilmek için lütfen geçerli bir lisansa sahip yönetici hesabı ile giriş yapın (SaaS Lisans Koruması).", type: "error" }
      };
    }
    const { historyState } = store;
    const { current: state } = historyState;
    const clonedState = JSON.parse(JSON.stringify(state)) as AppState;
    updater(clonedState);

    const updatedHistory = {
      current: clonedState,
      past: [state, ...historyState.past].slice(0, 30),
      future: [],
      isSynced: false
    };

    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({ current: clonedState, isSynced: false })
    );

    return { historyState: updatedHistory };
  }),

  undo: () => set((store) => {
    if (!store.user) {
      return {
        toast: { message: "Değişiklik yapabilmek için lütfen geçerli bir lisansa sahip yönetici hesabı ile giriş yapın (SaaS Lisans Koruması).", type: "error" }
      };
    }
    const { historyState } = store;
    if (historyState.past.length === 0) return {};
    
    const previous = historyState.past[0];
    const newPast = historyState.past.slice(1);
    const newFuture = [historyState.current, ...historyState.future];

    const updatedHistory = {
      current: previous,
      past: newPast,
      future: newFuture,
      isSynced: false
    };

    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({ current: previous, isSynced: false })
    );

    return {
      historyState: updatedHistory,
      toast: { message: "Son değişiklik geri alındı.", type: "info" }
    };
  }),

  redo: () => set((store) => {
    if (!store.user) {
      return {
        toast: { message: "Değişiklik yapabilmek için lütfen geçerli bir lisansa sahip yönetici hesabı ile giriş yapın (SaaS Lisans Koruması).", type: "error" }
      };
    }
    const { historyState } = store;
    if (historyState.future.length === 0) return {};

    const next = historyState.future[0];
    const newFuture = historyState.future.slice(1);
    const newPast = [historyState.current, ...historyState.past];

    const updatedHistory = {
      current: next,
      past: newPast,
      future: newFuture,
      isSynced: false
    };

    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({ current: next, isSynced: false })
    );

    return {
      historyState: updatedHistory,
      toast: { message: "Geri alınan değişiklik tekrar uygulandı.", type: "info" }
    };
  }),

  saveToCloud: async () => {
    const store = useAppStore.getState();
    const { historyState, user } = store;
    
    if (!user) {
      set({
        toast: { message: "Verileri buluta kaydetmek için lütfen giriş yapın.", type: "error" }
      });
      return;
    }

    try {
      // Clean undefined values for Firestore compatibility by serializing and parsing
      const cleanedState = JSON.parse(JSON.stringify(historyState.current));
      await saveScheduleToCloud(user.uid, cleanedState, cleanedState.settings?.schoolName || "Ders Programı");

      const updatedHistory = {
        ...historyState,
        isSynced: true
      };

      localStorage.setItem(
        LOCAL_STORAGE_KEY,
        JSON.stringify({ current: historyState.current, isSynced: true })
      );

      set({
        historyState: updatedHistory,
        toast: { message: "Harika! Tüm ders programı verileri bulut sunucusuna başarıyla kaydedildi.", type: "success" }
      });
    } catch (error: any) {
      console.error("Buluta kaydetme hatası:", error);
      let errorMessage = "Buluta kaydetme sırasında bir hata oluştu. Lütfen bağlantınızı kontrol edin.";
      if (error && error.code) {
        if (error.code === "permission-denied") {
          errorMessage = "Yetki Hatası (Erişim Engellendi). Lütfen oturum yetkinizi kontrol edin veya tekrar giriş yapın.";
        } else if (error.code === "unavailable") {
          errorMessage = "Bulut Servislerine Ulaşılamıyor. Lütfen internet bağlantınızı kontrol edin veya veri tabanının etkinleştirildiğinden emin olun.";
        } else if (error.code === "not-found") {
          errorMessage = "Bulut Veritabanı Bulunamadı. Veri tabanının oluşturulduğundan emin olun.";
        } else {
          errorMessage = `Buluta kaydetme hatası [${error.code}]: ${error.message || error}`;
        }
      } else if (error && error.message) {
        errorMessage = `Buluta kaydetme hatası: ${error.message}`;
      }
      set({
        toast: { message: errorMessage, type: "error" }
      });
    }
  },

  setUser: (user) => set({ user, userLoading: false }),

  loadFromCloud: async () => {
    const store = useAppStore.getState();
    const { user } = store;
    if (!user) return;

    try {
      const data = await loadScheduleFromCloud(user.uid);

      if (data && data.state) {
        const loadedHistory = {
          current: data.state,
          past: [],
          future: [],
          isSynced: true
        };

        localStorage.setItem(
          LOCAL_STORAGE_KEY,
          JSON.stringify({ current: data.state, isSynced: true })
        );

        set({
          historyState: loadedHistory,
          toast: { message: "Ders programınız buluttan başarıyla yüklendi.", type: "success" }
        });
      } else {
        console.log("No cloud data found. Saving local state to cloud.");
        await store.saveToCloud();
      }
    } catch (error: any) {
      console.error("Buluttan yükleme hatası:", error);
      set({
        toast: { 
          message: `Veriler buluttan yüklenirken bir hata oluştu: ${error?.message || error}`, 
          type: "error" 
        }
      });
    }
  },

  setToast: (toast) => set({ toast }),
  
  showToast: (message, type) => set((store) => {
    if (!store.user) {
      const allowedMessages = [
        "Tüm veriler başarıyla indirildi.",
        "Yedek başarıyla yüklendi",
        "Geçersiz yedek",
        "Dosya okunurken",
        "Misafir modundan çıkış",
        "Güvenli çıkış",
        "Giriş yapıldı",
        "oturum"
      ];
      const isAllowed = allowedMessages.some(m => message.toLowerCase().includes(m.toLowerCase()));
      if (type === "success" && !isAllowed) {
        return {};
      }
      if (type === "info" && !isAllowed) {
        return {};
      }
    }
    return { toast: { message, type } };
  }),

  setConfirmModal: (confirmModal) => set({ confirmModal }),

  handleClearAllData: () => set((store) => {
    if (!store.user) {
      return {
        toast: { message: "Değişiklik yapabilmek için lütfen geçerli bir lisansa sahip yönetici hesabı ile giriş yapın (SaaS Lisans Koruması).", type: "error" }
      };
    }
    const setConfirmModal = (modal: any) => set({ confirmModal: modal });
    const setHistoryState = store.setHistoryState;
    const showToast = store.showToast;
    
    return {
      confirmModal: {
        isOpen: true,
        title: "Tüm Verileri Kalıcı Olarak Sil",
        message: "Okulunuz, dersleriniz, sınıflarınız, öğretmenleriniz, atölyeleriniz ve tüm ders programınız dahil olmak üzere sistemdeki BÜTÜN veriler temizlenecektir. Bu işlem geri alınamaz. Devam etmek istiyor musunuz?",
        confirmText: "Evet, Tümünü Sil",
        isDangerous: true,
        action: () => {
          const emptyState = {
            settings: {
              schoolName: "",
              principalName: "",
              effectiveDate: "",
              officialDocumentNo: "",
              days: ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma"],
              periodsPerDay: 8,
              periodTimes: [
                { start: "08:30", end: "09:10" },
                { start: "09:20", end: "10:00" },
                { start: "10:10", end: "10:50" },
                { start: "11:00", end: "11:40" },
                { start: "11:50", end: "12:30" },
                { start: "13:30", end: "14:10" },
                { start: "14:20", end: "15:00" },
                { start: "15:10", end: "15:50" }
              ],
              lunchBreakAfter: 5,
              lunchBreakDuration: 60
            },
            teachers: [],
            classes: [],
            classrooms: [],
            courses: [],
            assignments: [],
            schedule: {}
          };
          
          setHistoryState({
            current: emptyState as any,
            past: [store.historyState.current, ...store.historyState.past].slice(0, 30),
            future: [],
            isSynced: false
          });
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ current: emptyState, isSynced: false }));
          setConfirmModal(null);
          showToast("Tüm okul verileri tamamen silindi.", "success");
        }
      }
    };
  }),

  handleClearConstraints: () => set((store) => {
    if (!store.user) {
      return {
        toast: { message: "Değişiklik yapabilmek için lütfen geçerli bir lisansa sahip yönetici hesabı ile giriş yapın (SaaS Lisans Koruması).", type: "error" }
      };
    }
    const setConfirmModal = (modal: any) => set({ confirmModal: modal });
    const updateState = store.updateState;
    const showToast = store.showToast;
    
    return {
      confirmModal: {
        isOpen: true,
        title: "Tüm Zaman Kısıtlarını Sil",
        message: "Öğretmenlerin, sınıfların ve atölyelerin ders programındaki tüm kapalı gün/saat (unavailability) kısıtları ve özel kapatma etiketleri temizlenecektir. Devam etmek istiyor musunuz?",
        confirmText: "Evet, Tüm Kısıtları Sil",
        isDangerous: true,
        action: () => {
          updateState((draft) => {
            draft.teachers.forEach((t) => {
              t.unavailability = createEmptyUnavailability(draft.settings.days.length, draft.settings.periodsPerDay);
              if (t.closureNames) t.closureNames = {};
            });
            draft.classes.forEach((c) => {
              c.unavailability = createEmptyUnavailability(draft.settings.days.length, draft.settings.periodsPerDay);
              if (c.closureNames) c.closureNames = {};
            });
            draft.classrooms.forEach((r) => {
              r.unavailability = createEmptyUnavailability(draft.settings.days.length, draft.settings.periodsPerDay);
              if (r.closureNames) r.closureNames = {};
            });
          });
          setConfirmModal(null);
          showToast("Tüm zaman ve engel kısıtları sıfırlandı.", "success");
        }
      }
    };
  }),

  handleClearManualLocks: () => set((store) => {
    if (!store.user) {
      return {
        toast: { message: "Değişiklik yapabilmek için lütfen geçerli bir lisansa sahip yönetici hesabı ile giriş yapın (SaaS Lisans Koruması).", type: "error" }
      };
    }
    const setConfirmModal = (modal: any) => set({ confirmModal: modal });
    const updateState = store.updateState;
    const showToast = store.showToast;
    
    return {
      confirmModal: {
        isOpen: true,
        title: "Tüm Elle Çakılanları (Kilitleri) Kaldır",
        message: "Ders programı hücresinde elle sabitlediğiniz (kilitlediğiniz) tüm derslerin kilitleri açılacaktır. Ders yerleşimleri silinmez, sadece serbest bırakılır. Devam etmek istiyor musunuz?",
        confirmText: "Evet, Kilitleri Kaldır",
        isDangerous: true,
        action: () => {
          updateState((draft) => {
            Object.keys(draft.schedule).forEach((classId) => {
              const classSched = draft.schedule[classId];
              if (classSched) {
                 Object.keys(classSched).forEach((dayIdxKey) => {
                   const periods = classSched[parseInt(dayIdxKey, 10)];
                   if (periods) {
                     periods.forEach((slot) => {
                       if (slot) {
                         delete slot.isLocked;
                       }
                     });
                   }
                 });
              }
            });
          });
          setConfirmModal(null);
          showToast("Tüm elle sabitlenmiş ders kilitleri kaldırıldı.", "success");
        }
      }
    };
  }),

  handleClearAllTeachersSchedule: () => set((store) => {
    if (!store.user) {
      return {
        toast: { message: "Değişiklik yapabilmek için lütfen geçerli bir lisansa sahip yönetici hesabı ile giriş yapın (SaaS Lisans Koruması).", type: "error" }
      };
    }
    const setConfirmModal = (modal: any) => set({ confirmModal: modal });
    const updateState = store.updateState;
    const showToast = store.showToast;
    return {
      confirmModal: {
        isOpen: true,
        title: "Tüm Programı Temizle",
        message: "Tüm öğretmenlerin programı silinecek emin misiniz?",
        confirmText: "Evet, Sil",
        isDangerous: true,
        action: () => {
          updateState((draft) => {
            draft.schedule = {};
            for (const c of draft.classes) {
               draft.schedule[c.id] = {};
               for (let d = 0; d < draft.settings.days.length; d++) {
                 draft.schedule[c.id][d] = Array(draft.settings.periodsPerDay).fill(null);
               }
            }
          });
          setConfirmModal(null);
          showToast("Tüm öğretmenlerin programı tamamen silindi.", "success");
        }
      }
    };
  }),

  handleDownloadBackup: () => set((store) => {
    const state = store.historyState.current;
    const showToast = store.showToast;
    try {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `${slugify(state.settings.schoolName || "okul")}-yedek-${getFormattedDate()}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showToast("Tüm veriler başarıyla indirildi.", "success");
    } catch (e) {
      showToast("Yedek dosyası oluşturulurken bir hata oluştu.", "error");
    }
    return {};
  }),

  handleImportBackup: (event) => set((store) => {
    const file = event.target.files?.[0];
    if (!file) return {};

    const showToast = store.showToast;
    const setHistoryState = store.setHistoryState;
    const hasUser = !!store.user;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        if (json && typeof json === "object" && "settings" in json && "teachers" in json && "classes" in json) {
          setHistoryState({
            current: json,
            past: hasUser ? [store.historyState.current, ...store.historyState.past].slice(0, 30) : [],
            future: [],
            isSynced: !hasUser // If no user, it is considered synced (or rather, irrelevant to cloud sync)
          });
          if (hasUser) {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ current: json, isSynced: false }));
            showToast("Yedek veriler başarıyla yüklendi ve geri alındı.", "success");
          } else {
            showToast("Yedek başarıyla yüklendi (Salt Okunur Mod). Düzenleme yapılamaz, sadece inceleyebilirsiniz.", "info");
          }
        } else {
          showToast("Geçersiz yedek dosyası formatı. Dosya geçerli bir yedek JSON olmalıdır.", "error");
        }
      } catch (error) {
        showToast("Dosya okunurken veya çözümlenirken hata oluştu.", "error");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
    return {};
  }),

  // UI state setters
  setActiveTab: (activeTab) => set({ activeTab }),
  setAssignmentTabTeacherId: (assignmentTabTeacherId) => set({ assignmentTabTeacherId }),
  setAssignmentTabCourseId: (assignmentTabCourseId) => set({ assignmentTabCourseId }),
  setTeacherAssignTabSearch: (teacherAssignTabSearch) => set({ teacherAssignTabSearch }),
  setCourseAssignTabSearch: (courseAssignTabSearch) => set({ courseAssignTabSearch }),
  setSelectedTeacherId: (selectedTeacherId) => set({ selectedTeacherId }),
  setSelectedClassId: (selectedClassId) => set({ selectedClassId }),
  setSelectedClassroomId: (selectedClassroomId) => set({ selectedClassroomId }),
  setScheduleViewMode: (scheduleViewMode) => set({ scheduleViewMode }),
  setViewingEntityId: (viewingEntityId) => set({ viewingEntityId }),
  setFocusedCell: (focusedCell) => set({ focusedCell }),
  setEditingCell: (editingCell) => set({ editingCell }),
  setSelectedAssignmentId: (selectedAssignmentId) => set({ selectedAssignmentId }),
  setContextMenu: (contextMenu) => set({ contextMenu }),
  setTeacherContextMenu: (teacherContextMenu) => set({ teacherContextMenu }),
  setIsSidebarOpen: (isSidebarOpen) => set({ isSidebarOpen }),
  setIsSchedulerSettingsOpen: (isSchedulerSettingsOpen) => set({ isSchedulerSettingsOpen }),
  setIsShortcutsOpen: (isShortcutsOpen) => set({ isShortcutsOpen }),
  setNewTeacher: (val) => set((store) => ({
    newTeacher: typeof val === 'function' ? val(store.newTeacher) : { ...store.newTeacher, ...val }
  })),
  setEditingTeacherId: (editingTeacherId) => set({ editingTeacherId }),
  setNewClass: (val) => set((store) => ({
    newClass: typeof val === 'function' ? val(store.newClass) : { ...store.newClass, ...val }
  })),
  setEditingClassId: (editingClassId) => set({ editingClassId }),
  setNewClassroom: (val) => set((store) => ({
    newClassroom: typeof val === 'function' ? val(store.newClassroom) : { ...store.newClassroom, ...val }
  })),
  setEditingClassroomId: (editingClassroomId) => set({ editingClassroomId }),
  setNewCourse: (val) => set((store) => ({
    newCourse: typeof val === 'function' ? val(store.newCourse) : { ...store.newCourse, ...val }
  })),
  setEditingCourseId: (editingCourseId) => set({ editingCourseId }),
  setNewAssignment: (val) => set((store) => ({
    newAssignment: typeof val === 'function' ? val(store.newAssignment) : { ...store.newAssignment, ...val }
  })),
  setCopySourceClassId: (copySourceClassId) => set({ copySourceClassId }),
  setIsScheduling: (isScheduling) => set({ isScheduling }),
  setSchedulingProgress: (schedulingProgress) => set({ schedulingProgress }),
  setIsSchedulingOptionsOpen: (isSchedulingOptionsOpen) => set({ isSchedulingOptionsOpen }),
  setSchedulingKeepExisting: (schedulingKeepExisting) => set({ schedulingKeepExisting }),
  setDeepSearch: (deepSearch) => set({ deepSearch }),
  setNumTrials: (numTrials) => set({ numTrials }),
  setUnplacedReports: (unplacedReports) => set({ unplacedReports }),
  setActiveClassroomTabId: (activeClassroomTabId) => set({ activeClassroomTabId }),
  setIsAnalysisOpen: (isAnalysisOpen) => set({ isAnalysisOpen }),
  setSelectedAssignmentToAssignRoom: (selectedAssignmentToAssignRoom) => set({ selectedAssignmentToAssignRoom }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),

  verileri_hazırla: async () => {
    // Wait briefly for any React renders or state flushes
    await new Promise(resolve => setTimeout(resolve, 50));
    const store = useAppStore.getState();
    // If user is logged in and state is completely empty, try to load from cloud first
    if (store.user && store.historyState.current.assignments.length === 0) {
      await store.loadFromCloud();
    }
    return useAppStore.getState().historyState.current;
  },

  dersleri_yerleştir: async (preparedState, keepExisting, targets) => {
    const store = useAppStore.getState();

    // Determine target teacher or class names for the progress dialog
    let targetTeacherName = "";
    let targetClassName = "";
    if (targets?.teacherIds && targets.teacherIds.length > 0) {
      if (targets.teacherIds.length === 1) {
        const teacher = preparedState.teachers.find(t => t.id === targets.teacherIds![0]);
        if (teacher) {
          targetTeacherName = teacher.name;
        }
      } else if (targets.teacherIds.length === preparedState.teachers.length) {
        targetTeacherName = "Tüm Öğretmenler";
      } else {
        targetTeacherName = "Seçili Öğretmenler";
      }
    } else if (targets?.classIds && targets.classIds.length > 0) {
      if (targets.classIds.length === 1) {
        const clazz = preparedState.classes.find(c => c.id === targets.classIds![0]);
        if (clazz) {
          targetClassName = clazz.name;
        }
      } else {
        targetClassName = "Seçili Sınıflar";
      }
    } else if (store.scheduleViewMode === "teacher" && store.viewingEntityId) {
      const teacher = preparedState.teachers.find(t => t.id === store.viewingEntityId);
      if (teacher) {
        targetTeacherName = teacher.name;
      }
    } else if (store.scheduleViewMode === "class" && store.viewingEntityId) {
      const clazz = preparedState.classes.find(c => c.id === store.viewingEntityId);
      if (clazz) {
        targetClassName = clazz.name;
      }
    }

    const result = await generateAutomaticScheduleAsync(preparedState, (progress) => {
      store.setSchedulingProgress({
        ...progress,
        targetTeacherName: targetTeacherName || progress.targetTeacherName,
        targetClassName: targetClassName || progress.targetClassName
      });
    }, {
      keepExisting,
      targetClassIds: targets?.classIds,
      targetTeacherIds: targets?.teacherIds,
      deepSearch: store.deepSearch,
      numTrials: store.numTrials
    });
    return result;
  },

  stopAutomaticScheduler: () => {
    const store = useAppStore.getState();
    
    // Stop the active worker (soft-stop)
    stopActiveScheduler();
    
    // Immediately close the progress overlay/modal for instant visual response
    store.setIsScheduling(false);
    store.setSchedulingProgress(null);
    
    store.showToast("Planlama durduruluyor... Mevcut en iyi program kaydediliyor.", "info");
  },

  runAutomaticScheduler: async (keepExisting, targets, bypassFeasibilityCheck) => {
    const store = useAppStore.getState();
    if (!store.user) {
      store.showToast("Değişiklik yapabilmek için lütfen geçerli bir lisansa sahip yönetici hesabı ile giriş yapın (SaaS Lisans Koruması).", "error");
      return;
    }

    // Pre-Solve Feasibility Check (Feature 5)
    if (!bypassFeasibilityCheck) {
      const state = store.historyState.current;
      let feasibilityIssues = preSolveFeasibilityCheck(state);
      
      // If we are targeting specific teachers or classes, only alert about issues that affect those targets
      if (targets?.teacherIds && targets.teacherIds.length > 0) {
        feasibilityIssues = feasibilityIssues.filter(issue => {
          const matchedTeacher = state.teachers.find(t => t.name === issue.entityName);
          return issue.entityType === "teacher" && matchedTeacher && targets.teacherIds!.includes(matchedTeacher.id);
        });
      } else if (targets?.classIds && targets.classIds.length > 0) {
        feasibilityIssues = feasibilityIssues.filter(issue => {
          const matchedClass = state.classes.find(c => c.name === issue.entityName);
          return issue.entityType === "class" && matchedClass && targets.classIds!.includes(matchedClass.id);
        });
      }

      if (feasibilityIssues.length > 0) {
        const errorMessage = feasibilityIssues.map(issue => `• ${issue.message}`).join("\n\n");
        store.setConfirmModal({
          isOpen: true,
          title: "Matematiksel İmtiyazsızlık Tespit Edildi (Tam Çözüm İmkânsız!)",
          message: `Ders programında çözülemeyecek kısıtlar tespit edildi:\n\n${errorMessage}\n\nYine de planlama motorunu çalıştırmak ve mümkün olan en iyi kısmı çözümü üretmek istiyor musunuz?`,
          confirmText: "Yine de Çalıştır",
          isDangerous: true,
          action: () => {
            store.setConfirmModal(null);
            store.runAutomaticScheduler(keepExisting, targets, true);
          }
        });
        return;
      }
    }
    
    // Determine target teacher or class names early
    let targetTeacherName = "";
    let targetClassName = "";
    if (targets?.teacherIds && targets.teacherIds.length > 0) {
      if (targets.teacherIds.length === 1) {
        const teacher = store.historyState.current.teachers?.find((t: any) => t.id === targets.teacherIds![0]);
        if (teacher) {
          targetTeacherName = teacher.name;
        }
      } else if (targets.teacherIds.length === store.historyState.current.teachers?.length) {
        targetTeacherName = "Tüm Öğretmenler";
      } else {
        targetTeacherName = "Seçili Öğretmenler";
      }
    } else if (targets?.classIds && targets.classIds.length > 0) {
      if (targets.classIds.length === 1) {
        const clazz = store.historyState.current.classes?.find((c: any) => c.id === targets.classIds![0]);
        if (clazz) {
          targetClassName = clazz.name;
        }
      } else {
        targetClassName = "Seçili Sınıflar";
      }
    } else if (store.scheduleViewMode === "teacher" && store.viewingEntityId) {
      const teacher = store.historyState.current.teachers?.find((t: any) => t.id === store.viewingEntityId);
      if (teacher) {
        targetTeacherName = teacher.name;
      }
    } else if (store.scheduleViewMode === "class" && store.viewingEntityId) {
      const clazz = store.historyState.current.classes?.find((c: any) => c.id === store.viewingEntityId);
      if (clazz) {
        targetClassName = clazz.name;
      }
    }

    store.setIsScheduling(true);
    store.setSchedulingProgress({
      phase: "backtracking",
      percent: 5,
      message: "Veriler hazırlanıyor...",
      steps: 0,
      targetTeacherName,
      targetClassName
    });
    store.setUnplacedReports([]);
    store.setIsSchedulingOptionsOpen(false);

    try {
      // 1. Prepare data
      const preparedState = await store.verileri_hazırla();
      
      // Calculate totalHours targeted or global
      let totalHours = 0;
      if (targets?.teacherIds && targets.teacherIds.length > 0) {
        const targetAssignments = preparedState.assignments.filter((a: any) => {
          if (!a.teacherId) return false;
          const tIds = a.teacherId.split(",");
          return tIds.some((id: string) => targets.teacherIds!.includes(id));
        });
        totalHours = targetAssignments.reduce((sum, a) => sum + a.weeklyHours, 0);
      } else if (targets?.classIds && targets.classIds.length > 0) {
        const targetAssignments = preparedState.assignments.filter((a: any) => targets.classIds!.includes(a.classId));
        totalHours = targetAssignments.reduce((sum, a) => sum + a.weeklyHours, 0);
      } else {
        totalHours = preparedState.assignments.reduce((sum, a) => sum + a.weeklyHours, 0);
      }

      store.setSchedulingProgress({
        phase: "backtracking",
        percent: 10,
        message: "Ders programı çözücü başlatılıyor...",
        steps: 0,
        totalHours,
        placedHours: 0,
        unplacedHours: totalHours,
        targetTeacherName,
        targetClassName
      });

      // 2. Run placement
      const result = await store.dersleri_yerleştir(preparedState, keepExisting, targets);

      store.updateState((draft) => {
        draft.schedule = result.schedule;
      });

      if (result.unplacedReports) {
        store.setUnplacedReports(result.unplacedReports);
      }

      const hasUnplaced = result.unplacedReports && result.unplacedReports.length > 0;

      if (result.success || !hasUnplaced) {
        store.showToast(result.message || "Tüm dersler başarıyla yerleştirildi!", "success");
        store.setIsAnalysisOpen(false);
      } else {
        // Check if we were targeting a specific teacher (Öğretmen bazlı yerleştirme)
        const targetedTeacherIds = targets?.teacherIds;
        const isTeacherTargeted = targetedTeacherIds && targetedTeacherIds.length > 0;
        let targetedTeacherFullyPlaced = false;

        if (isTeacherTargeted) {
          const teacherId = targetedTeacherIds[0];
          const teacherHasUnplaced = result.unplacedReports?.some((report: any) => {
            const ids = report.teacherId ? report.teacherId.split(",").map((s: string) => s.trim()) : [];
            return ids.includes(teacherId);
          });
          if (!teacherHasUnplaced) {
            targetedTeacherFullyPlaced = true;
          }
        }

        // Check if we were targeting specific classes (Sınıf bazlı yerleştirme)
        const targetedClassIds = targets?.classIds;
        const isClassTargeted = targetedClassIds && targetedClassIds.length > 0;
        let targetedClassFullyPlaced = false;

        if (isClassTargeted) {
          const classHasUnplaced = result.unplacedReports?.some((report: any) => {
            return targetedClassIds.includes(report.classId);
          });
          if (!classHasUnplaced) {
            targetedClassFullyPlaced = true;
          }
        }

        if (targetedTeacherFullyPlaced) {
          const teacherName = preparedState.teachers.find(t => t.id === targetedTeacherIds[0])?.name || "Öğretmen";
          store.showToast(`"${teacherName}" isimli öğretmenin tüm dersleri başarıyla yerleştirildi!`, "success");
          store.setIsAnalysisOpen(false);
        } else if (targetedClassFullyPlaced) {
          const className = preparedState.classes.find(c => c.id === targetedClassIds[0])?.name || "Sınıf";
          store.showToast(`"${className}" sınıfının tüm dersleri başarıyla yerleştirildi!`, "success");
          store.setIsAnalysisOpen(false);
        } else {
          if (result.unplacedDetails && result.unplacedDetails.length > 0) {
            store.setIsAnalysisOpen(true);
          }
          store.showToast(result.message, "info");
        }
      }
    } catch (err) {
      console.error(err);
      store.showToast("Ders programı yerleştirilirken beklenmedik bir hata oluştu!", "error");
    } finally {
      if (useAppStore.getState().isScheduling) {
        store.setIsScheduling(false);
        store.setSchedulingProgress(null);
      }
    }
  },

  handleAutoGenerateClick: () => {
    const store = useAppStore.getState();
    if (!store.user) {
      store.showToast("Değişiklik yapabilmek için lütfen geçerli bir lisansa sahip yönetici hesabı ile giriş yapın (SaaS Lisans Koruması).", "error");
      return;
    }
    const state = store.historyState.current;
    
    if (state.assignments.length === 0) {
      store.showToast("Öncelikle 'Ders Dağıtımı' menüsünden sınıflara ders atamalısınız!", "error");
      return;
    }
    
    let hasPlacedLessons = false;
    for (const cId of Object.keys(state.schedule)) {
      const classSched = state.schedule[cId];
      if (classSched) {
        for (const day of Object.keys(classSched)) {
          if (classSched[parseInt(day)]?.some(slot => slot !== null)) {
            hasPlacedLessons = true;
            break;
          }
        }
      }
      if (hasPlacedLessons) break;
    }

    if (hasPlacedLessons) {
      store.setIsSchedulingOptionsOpen(true);
    } else {
      store.runAutomaticScheduler(false);
    }
  },

  handleScheduleSelectedTeacher: () => {
    const store = useAppStore.getState();
    if (!store.user) {
      store.showToast("Değişiklik yapabilmek için lütfen geçerli bir lisansa sahip yönetici hesabı ile giriş yapın (SaaS Lisans Koruması).", "error");
      return;
    }
    const { viewingEntityId, scheduleViewMode } = store;
    
    if (!viewingEntityId || scheduleViewMode !== "teacher") {
      store.showToast("Lütfen önce listeden planlanacak bir öğretmen seçin!", "error");
      return;
    }
    store.runAutomaticScheduler(true, { teacherIds: [viewingEntityId] });
  },

  handleScheduleAllTeachers: () => {
    const store = useAppStore.getState();
    if (!store.user) {
      store.showToast("Değişiklik yapabilmek için lütfen geçerli bir lisansa sahip yönetici hesabı ile giriş yapın (SaaS Lisans Koruması).", "error");
      return;
    }
    const state = store.historyState.current;
    const tIds = state.teachers.map((t) => t.id);
    
    if (tIds.length === 0) {
      store.showToast("Öncelikle sisteme öğretmen tanımlamalısınız!", "error");
      return;
    }
    store.runAutomaticScheduler(true, { teacherIds: tIds });
  },
}));
