/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  School,
  Users,
  Layers,
  Wrench,
  BookOpen,
  GitCommit,
  Calendar,
  Undo2,
  Redo2,
  CloudLightning,
  CloudOff,
  Plus,
  Trash2,
  Edit3,
  Lock,
  Unlock,
  AlertTriangle,
  CheckCircle2,
  Settings,
  RefreshCw,
  Info,
  CalendarDays,
  FileSpreadsheet,
  ArrowUp,
  ArrowDown,
  ChevronUp,
  ChevronDown,
  Zap,
  UserCheck,
  User,
  Briefcase,
  Award,
  Menu,
  Activity,
  Printer,
  Search,
  Home,
  Sparkles,
  HelpCircle,
  Database,
  LogOut
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  AppState,
  FullHistoryState,
  Teacher,
  GradeClass,
  Classroom,
  Course,
  LessonAssignment,
  ScheduleSlot,
  ClassScheduleMap,
  ConflictInfo
} from "./types";
import { generateDemoState, createEmptyUnavailability, generateLargeDemoState } from "./utils/demoData";
import { generateAutomaticSchedule, detectConflicts, generatePartialSchedule, generateAutomaticScheduleAsync, ProgressUpdate } from "./utils/scheduler";
import { useAppStore } from "./store/useAppStore";
import BackupDeleteTab from "./components/BackupDeleteTab";
import SchoolSettingsTab from "./components/SchoolSettingsTab";
import TeachersTab from "./components/TeachersTab";
import ClassesTab from "./components/ClassesTab";
import ClassroomsTab from "./components/ClassroomsTab";
import CoursesTab from "./components/CoursesTab";
import AssignmentsTab from "./components/AssignmentsTab";
import TeacherAssignmentsTab from "./components/TeacherAssignmentsTab";
import RealtimeStatusTab from "./components/RealtimeStatusTab";
import PrintTab from "./components/PrintTab";
import ScheduleTab from "./components/ScheduleTab";
import {
  optimizeGapsForTeacher as runOptimizeGapsForTeacher,
  optimizeGapsForAllTeachers as runOptimizeGapsForAllTeachers,
  removeSingleLessonDays as runRemoveSingleLessonDays,
  removeSingleLessonDaysForTeacher as runRemoveSingleLessonDaysForTeacher
} from "./utils/gapOptimizer";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import Login from "./components/Login";

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

const triggerPrint = (title: string, orientation: 'portrait' | 'landscape') => {
  const originalTitle = document.title;
  document.title = title;

  const styleEl = document.createElement('style');
  styleEl.id = 'print-orientation-style';
  styleEl.innerHTML = `
    @page {
      size: ${orientation === 'landscape' ? 'A3 landscape' : 'A4 portrait'};
      margin: 10mm;
    }
  `;
  document.head.appendChild(styleEl);

  // Focus the window first to ensure iframes get correct print targeting
  window.focus();

  window.print();

  // Restore title and remove orientation style with a small delay so browser captures them
  setTimeout(() => {
    const el = document.getElementById('print-orientation-style');
    if (el) el.remove();
    document.title = originalTitle;
  }, 1500);
};

export default function App() {
  // -------------------------------------------------------------
  // STATE DEFINITIONS
  // -------------------------------------------------------------
  const {
    historyState,
    setHistoryState,
    activeTab, setActiveTab,
    assignmentTabTeacherId, setAssignmentTabTeacherId,
    assignmentTabCourseId, setAssignmentTabCourseId,
    teacherAssignTabSearch, setTeacherAssignTabSearch,
    courseAssignTabSearch, setCourseAssignTabSearch,
    selectedTeacherId, setSelectedTeacherId,
    selectedClassId, setSelectedClassId,
    selectedClassroomId, setSelectedClassroomId,
    scheduleViewMode, setScheduleViewMode,
    viewingEntityId, setViewingEntityId,
    focusedCell, setFocusedCell,
    editingCell, setEditingCell,
    selectedAssignmentId, setSelectedAssignmentId,
    isSidebarOpen, setIsSidebarOpen,
    isSchedulerSettingsOpen, setIsSchedulerSettingsOpen,
    isShortcutsOpen, setIsShortcutsOpen,
    newTeacher, setNewTeacher,
    editingTeacherId, setEditingTeacherId,
    newClass, setNewClass,
    editingClassId, setEditingClassId,
    newClassroom, setNewClassroom,
    editingClassroomId, setEditingClassroomId,
    newCourse, setNewCourse,
    editingCourseId, setEditingCourseId,
    newAssignment, setNewAssignment,
    copySourceClassId, setCopySourceClassId,
    isScheduling, setIsScheduling,
    schedulingProgress, setSchedulingProgress,
    isSchedulingOptionsOpen, setIsSchedulingOptionsOpen,
    schedulingKeepExisting, setSchedulingKeepExisting,
    deepSearch, setDeepSearch,
    numTrials, setNumTrials,
    unplacedReports, setUnplacedReports,
    activeClassroomTabId, setActiveClassroomTabId,
    isAnalysisOpen, setIsAnalysisOpen,
    selectedAssignmentToAssignRoom, setSelectedAssignmentToAssignRoom,
    searchQuery, setSearchQuery,
    toast, setToast,
    confirmModal, setConfirmModal,
    updateState,
    undo,
    redo,
    saveToCloud,
    handleClearAllData,
    handleClearConstraints,
    handleClearManualLocks,
    handleDownloadBackup,
    handleImportBackup,
    showToast,
    runAutomaticScheduler,
    handleAutoGenerateClick,
    handleScheduleSelectedTeacher,
    handleScheduleAllTeachers,
    user,
    userLoading,
    setUser,
    loadFromCloud,
  } = useAppStore();

  const { current: state, isSynced } = historyState;
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [showGuestBanner, setShowGuestBanner] = useState(true);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  useEffect(() => {
    if (!auth) {
      setUser(null);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      const isNewSession = !sessionStorage.getItem("dersayar_active_session");
      if (firebaseUser && isNewSession) {
        try {
          const { signOut } = await import("firebase/auth");
          await signOut(auth);
          setUser(null);
          setIsGuestMode(false);
        } catch (error) {
          console.error("Session logout error:", error);
        } finally {
          sessionStorage.setItem("dersayar_active_session", "true");
        }
      } else {
        sessionStorage.setItem("dersayar_active_session", "true");
        setUser(firebaseUser);
        if (firebaseUser) {
          setIsGuestMode(false);
        }
      }
    });

    return () => unsubscribe();
  }, [setUser]);

  useEffect(() => {
    if (user) {
      loadFromCloud();
    }
  }, [user, loadFromCloud]);

  // Auto-save to cloud every 20 minutes if there are unsaved changes
  useEffect(() => {
    if (!user || isSynced) return;

    const intervalId = setInterval(() => {
      const currentStore = useAppStore.getState();
      if (currentStore.user && !currentStore.historyState.isSynced) {
        currentStore.saveToCloud();
      }
    }, 20 * 60 * 1000); // 20 minutes

    return () => clearInterval(intervalId);
  }, [user, isSynced]);

  // Local schedule states moved to ScheduleTab.tsx
  const [showUnsavedLogoutModal, setShowUnsavedLogoutModal] = useState(false);
  const [isSavingAndExiting, setIsSavingAndExiting] = useState(false);

  const handleSaveAndExit = async () => {
    try {
      setIsSavingAndExiting(true);
      await saveToCloud();
      setShowUnsavedLogoutModal(false);
      const { signOut } = await import("firebase/auth");
      await signOut(auth!);
      showToast("Verileriniz buluta başarıyla kaydedildi ve güvenli çıkış yapıldı.", "success");
    } catch (error) {
      console.error("Save & Exit error:", error);
      showToast("Veriler kaydedilirken hata oluştu. Çıkış iptal edildi.", "error");
    } finally {
      setIsSavingAndExiting(false);
    }
  };

  const handleExitWithoutSaving = async () => {
    try {
      setShowUnsavedLogoutModal(false);
      const { signOut } = await import("firebase/auth");
      await signOut(auth!);
      showToast("Değişiklikler kaydedilmeden güvenli çıkış yapıldı.", "info");
    } catch (error) {
      console.error("Exit without saving error:", error);
      showToast("Çıkış yapılırken bir hata oluştu.", "error");
    }
  };

  // Realtime status selection states
  const [realtimeDaySel, setRealtimeDaySel] = useState<"now" | number>("now");
  const [realtimePeriodSel, setRealtimePeriodSel] = useState<"now" | number>("now");

  // Yazdır / Print selection & search states
  const [selectedPrintTeachers, setSelectedPrintTeachers] = useState<string[]>([]);
  const [selectedPrintClasses, setSelectedPrintClasses] = useState<string[]>([]);
  const [selectedPrintClassrooms, setSelectedPrintClassrooms] = useState<string[]>([]);
  const [printSearchTeacher, setPrintSearchTeacher] = useState("");
  const [printSearchClass, setPrintSearchClass] = useState("");
  const [printSearchClassroom, setPrintSearchClassroom] = useState("");
  const [printDocNo, setPrintDocNo] = useState(() => localStorage.getItem("print_doc_no") || "");
  const [printDocSubject, setPrintDocSubject] = useState(() => localStorage.getItem("print_doc_subject") || "Haftalık Ders Dağıtım Tebliği");

  const [activePrintJob, setActivePrintJob] = useState<{ type: string; ids: string[] } | null>(null);

  useEffect(() => {
    if (activePrintJob) {
      let title = "program";
      if (activePrintJob.type.includes("teacher")) {
        if (activePrintJob.ids.length === 1) {
          const tName = state.teachers.find(t => t.id === activePrintJob.ids[0])?.name || "ogretmen";
          title = `${tName}-${getFormattedDate()}`;
        } else {
          title = `ogretmenler-${getFormattedDate()}`;
        }
      } else if (activePrintJob.type.includes("class")) {
        if (activePrintJob.ids.length === 1) {
          const cName = state.classes.find(c => c.id === activePrintJob.ids[0])?.name || "sinif";
          title = `${cName}-${getFormattedDate()}`;
        } else {
          title = `siniflar-${getFormattedDate()}`;
        }
      } else if (activePrintJob.type.includes("classroom")) {
        if (activePrintJob.ids.length === 1) {
          const crName = state.classrooms.find(cr => cr.id === activePrintJob.ids[0])?.name || "atolye";
          title = `${crName}-${getFormattedDate()}`;
        } else {
          title = `atolyeler-${getFormattedDate()}`;
        }
      }
      
      const orientation = activePrintJob.type.includes("carsaf") ? "landscape" : "portrait";
      
      let clearTimer: NodeJS.Timeout;
      const timer = setTimeout(() => {
        triggerPrint(slugify(title), orientation);
        
        // Wait 3.5 seconds before resetting the active print job.
        // This is extremely important because window.print() can be asynchronous or non-blocking 
        // in nested iframe preview environments (like the Dev Link). 
        // If we unmount '#print-section' immediately, the print preview will be blank/empty!
        clearTimer = setTimeout(() => {
          setActivePrintJob(null);
        }, 3500);
      }, 300);
      
      return () => {
        clearTimeout(timer);
        if (clearTimer) clearTimeout(clearTimer);
      };
    }
  }, [activePrintJob]);

  // Whenever schedule tab is opened, always reset scheduleViewMode to "teacher"
  useEffect(() => {
    if (activeTab === "schedule") {
      setScheduleViewMode("teacher");
    }
  }, [activeTab]);

  // Sync printDocNo from state.settings.officialDocumentNo when loaded
  useEffect(() => {
    if (state.settings.officialDocumentNo && !printDocNo) {
      setPrintDocNo(state.settings.officialDocumentNo);
    }
  }, [state.settings.officialDocumentNo]);

  // Keep printDocSubject persisted in local storage
  useEffect(() => {
    localStorage.setItem("print_doc_subject", printDocSubject);
  }, [printDocSubject]);

  useEffect(() => {
    localStorage.setItem("print_doc_no", printDocNo);
  }, [printDocNo]);

  useEffect(() => {
    if (state.teachers.length > 0 && selectedPrintTeachers.length === 0) {
      setSelectedPrintTeachers(state.teachers.map(t => t.id));
    }
  }, [state.teachers]);

  useEffect(() => {
    if (state.classes.length > 0 && selectedPrintClasses.length === 0) {
      setSelectedPrintClasses(state.classes.map(c => c.id));
    }
  }, [state.classes]);

  useEffect(() => {
    if (state.classrooms.length > 0 && selectedPrintClassrooms.length === 0) {
      setSelectedPrintClassrooms(state.classrooms.map(cr => cr.id));
    }
  }, [state.classrooms]);

  // Helper to build teacher weekly schedule grid
  const getTeacherWeeklySchedule = (tId: string) => {
    const numDays = state.settings.days.length;
    const numPeriods = state.settings.periodsPerDay;
    const grid: any[][] = Array.from({ length: numDays }, () => Array(numPeriods).fill(null));

    Object.keys(state.schedule).forEach((classId) => {
      const classSchedules = state.schedule[classId];
      if (classSchedules) {
        for (let dIdx = 0; dIdx < numDays; dIdx++) {
          const daySchedule = classSchedules[dIdx];
          if (daySchedule) {
            daySchedule.forEach((slot, pIdx) => {
              if (slot && slot.teacherId) {
                const tIds = slot.teacherId.split(",");
                if (tIds.includes(tId)) {
                  if (!grid[dIdx][pIdx]) {
                    grid[dIdx][pIdx] = [];
                  }
                  grid[dIdx][pIdx].push({ slot, classId });
                }
              }
            });
          }
        }
      }
    });
    return grid;
  };

  // Helper to build class weekly schedule grid
  const getClassWeeklySchedule = (classId: string) => {
    const numDays = state.settings.days.length;
    const numPeriods = state.settings.periodsPerDay;
    const grid: any[] = Array.from({ length: numDays }, () => Array(numPeriods).fill(null));

    const classSchedules = state.schedule[classId];
    if (classSchedules) {
      for (let dIdx = 0; dIdx < numDays; dIdx++) {
        const daySchedule = classSchedules[dIdx];
        if (daySchedule) {
          daySchedule.forEach((slot, pIdx) => {
            if (slot) {
              grid[dIdx][pIdx] = slot;
            }
          });
        }
      }
    }
    return grid;
  };

  // Helper to build classroom weekly schedule grid
  const getClassroomWeeklySchedule = (classroomId: string) => {
    const numDays = state.settings.days.length;
    const numPeriods = state.settings.periodsPerDay;
    const grid: any[][] = Array.from({ length: numDays }, () => Array(numPeriods).fill(null));

    Object.keys(state.schedule).forEach((classId) => {
      const classSchedules = state.schedule[classId];
      if (classSchedules) {
        for (let dIdx = 0; dIdx < numDays; dIdx++) {
          const daySchedule = classSchedules[dIdx];
          if (daySchedule) {
            daySchedule.forEach((slot, pIdx) => {
              if (slot && slot.classroomId === classroomId) {
                if (!grid[dIdx][pIdx]) {
                  grid[dIdx][pIdx] = [];
                }
                grid[dIdx][pIdx].push({ slot, classId });
              }
            });
          }
        }
      }
    });
    return grid;
  };

  // Clear search query when schedule view mode changes
  useEffect(() => {
    setSearchQuery("");
  }, [scheduleViewMode]);

  // Auto-set initial selections when state is loaded
  useEffect(() => {
    if (state.teachers.length > 0 && !selectedTeacherId) {
      setSelectedTeacherId(state.teachers[0].id);
    }
    if (state.classes.length > 0 && !selectedClassId) {
      setSelectedClassId(state.classes[0].id);
    }
    if (state.classrooms.length > 0 && !selectedClassroomId) {
      setSelectedClassroomId(state.classrooms[0].id);
    }
    if (!viewingEntityId) {
      if (scheduleViewMode === "class" && state.classes.length > 0) {
        setViewingEntityId(state.classes[0].id);
      } else if (scheduleViewMode === "teacher" && state.teachers.length > 0) {
        setViewingEntityId(state.teachers[0].id);
      } else if (scheduleViewMode === "classroom" && state.classrooms.length > 0) {
        setViewingEntityId(state.classrooms[0].id);
      }
    }
  }, [state, scheduleViewMode]);

  // Auto-set teacher and course selections for the teacher assignments dashboard
  useEffect(() => {
    if (activeTab === "teacher_assignments") {
      if (!assignmentTabTeacherId && state.teachers.length > 0) {
        setAssignmentTabTeacherId(state.teachers[0].id);
      }
      if (!assignmentTabCourseId && state.courses.length > 0) {
        setAssignmentTabCourseId(state.courses[0].id);
      }
    }
  }, [activeTab, state.teachers, state.courses, assignmentTabTeacherId, assignmentTabCourseId]);

  // Toast self-dismiss
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Global Keyboard Shortcuts for schedule cells moved to ScheduleTab.tsx

  // -------------------------------------------------------------
  // STATE MUTATION & HISTORY ENGINE (DELEGATED TO ZUSTAND)
  // -------------------------------------------------------------


  // Run dynamic conflict detector
  const activeConflicts = detectConflicts(state);

  // Helper mapping maps with explicit types
  const teachersMap = new Map<string, Teacher>(state.teachers.map((t) => [t.id, t]));
  const classesMap = new Map<string, GradeClass>(state.classes.map((c) => [c.id, c]));
  const classroomsMap = new Map<string, Classroom>(state.classrooms.map((cr) => [cr.id, cr]));
  const coursesMap = new Map<string, Course>(state.courses.map((co) => [co.id, co]));
  const assignmentsMap = new Map<string, LessonAssignment>(state.assignments.map((as) => [as.id, as]));

  const handleSuggestionAction = (action: any, assignmentId?: string, blockSize: number = 2) => {
    if (action.type === "expand_teacher_availability") {
      updateState((draft) => {
        const teacher = draft.teachers.find(t => t.id === action.entityId);
        if (teacher) {
          if (action.dayIndex !== undefined && action.periodIndex !== undefined) {
            if (!teacher.unavailability[action.dayIndex]) {
              teacher.unavailability[action.dayIndex] = Array(draft.settings.periodsPerDay).fill(false);
            }
            teacher.unavailability[action.dayIndex][action.periodIndex] = false;

            // Remove the closure text if any
            if (teacher.closureNames && teacher.closureNames[action.dayIndex]) {
              teacher.closureNames[action.dayIndex][action.periodIndex] = "";
            }

            // ALSO, place the assignment directly in the schedule!
            if (assignmentId) {
              const assign = draft.assignments.find(a => a.id === assignmentId);
              if (assign) {
                const classId = assign.classId;
                if (!draft.schedule[classId]) {
                  draft.schedule[classId] = {};
                }
                if (!draft.schedule[classId][action.dayIndex]) {
                  draft.schedule[classId][action.dayIndex] = Array(draft.settings.periodsPerDay).fill(null);
                }

                // Place for the block size
                for (let b = 0; b < blockSize; b++) {
                  const pIdx = action.periodIndex + b;
                  if (pIdx < draft.settings.periodsPerDay) {
                    draft.schedule[classId][action.dayIndex][pIdx] = {
                      assignmentId: assign.id,
                      courseId: assign.courseId,
                      teacherId: assign.teacherId,
                      classroomId: assign.classroomId
                    };
                  }
                }
                showToast(`"${teacher.name}" öğretmeninin kısıtı kaldırıldı ve ders başarıyla ${draft.settings.days[action.dayIndex]} günü ${action.periodIndex + 1}. ders saatine yerleştirildi!`, "success");
                return;
              }
            }
            showToast(`"${teacher.name}" öğretmeninin kısıtı kaldırıldı!`, "success");
          } else {
            teacher.unavailability = {};
            showToast(`"${teacher.name}" öğretmeninin tüm kısıtları kaldırıldı!`, "success");
          }
        }
      });
      setScheduleViewMode("teacher");
      setSelectedTeacherId(action.entityId);
    } else if (action.type === "change_teacher") {
      updateState((draft) => {
        const assign = draft.assignments.find(a => a.id === action.entityId);
        if (assign) {
          const mainTId = assign.teacherId ? assign.teacherId.split(",")[0] : "";
          const mainT = draft.teachers.find(t => t.id === mainTId);
          if (mainT && mainT.branch) {
            const alt = draft.teachers.find(t => t.id !== mainT.id && t.branch === mainT.branch);
            if (alt) {
              assign.teacherId = alt.id;

              // ALSO place the assignment directly in the first available slot for this class/teacher!
              let placed = false;
              const numDays = draft.settings.days.length;
              const numPeriods = draft.settings.periodsPerDay;

              for (let d = 0; d < numDays && !placed; d++) {
                for (let p = 0; p <= numPeriods - blockSize && !placed; p++) {
                  let classEmpty = true;
                  let teacherAvailable = true;

                  for (let b = 0; b < blockSize; b++) {
                    const currentSlot = draft.schedule[assign.classId]?.[d]?.[p + b];
                    if (currentSlot !== null && currentSlot !== undefined) {
                      classEmpty = false;
                    }
                    const classObj = draft.classes.find(c => c.id === assign.classId);
                    if (classObj?.unavailability[d]?.[p + b]) {
                      classEmpty = false;
                    }
                    if (alt.unavailability[d]?.[p + b]) {
                      teacherAvailable = false;
                    }
                    Object.keys(draft.schedule).forEach(cId => {
                      const otherSlot = draft.schedule[cId]?.[d]?.[p + b];
                      if (otherSlot && otherSlot.teacherId && otherSlot.teacherId.split(",").includes(alt.id)) {
                        teacherAvailable = false;
                      }
                    });
                  }

                  if (classEmpty && teacherAvailable) {
                    if (!draft.schedule[assign.classId]) {
                      draft.schedule[assign.classId] = {};
                    }
                    if (!draft.schedule[assign.classId][d]) {
                      draft.schedule[assign.classId][d] = Array(numPeriods).fill(null);
                    }
                    for (let b = 0; b < blockSize; b++) {
                      draft.schedule[assign.classId][d][p + b] = {
                        assignmentId: assign.id,
                        courseId: assign.courseId,
                        teacherId: alt.id,
                        classroomId: assign.classroomId
                      };
                    }
                    placed = true;
                    showToast(`Dersin öğretmeni "${alt.name}" olarak güncellendi ve programda ${draft.settings.days[d]} günü ${p + 1}. ders saatine yerleştirildi!`, "success");
                  }
                }
              }

              if (!placed) {
                showToast(`Dersin öğretmeni "${alt.name}" olarak güncellendi! Sınıf programında çakışmayan boş yer olmadığı için lütfen el ile yerleştirin.`, "info");
              }
            }
          }
        }
      });
    } else if (action.type === "free_class_period") {
      updateState((draft) => {
        if (assignmentId) {
          const assign = draft.assignments.find(a => a.id === assignmentId);
          if (assign) {
            const classId = assign.classId;
            const numDays = draft.settings.days.length;
            const numPeriods = draft.settings.periodsPerDay;
            let placed = false;

            for (let d = 0; d < numDays && !placed; d++) {
              for (let p = 0; p <= numPeriods - blockSize && !placed; p++) {
                let classEmpty = true;
                let teacherAvailable = true;

                const tIds = assign.teacherId ? assign.teacherId.split(",") : [];

                for (let b = 0; b < blockSize; b++) {
                  const currentSlot = draft.schedule[classId]?.[d]?.[p + b];
                  if (currentSlot !== null && currentSlot !== undefined) {
                    classEmpty = false;
                  }
                  const classObj = draft.classes.find(c => c.id === classId);
                  if (classObj?.unavailability[d]?.[p + b]) {
                    classEmpty = false;
                  }

                  for (const tId of tIds) {
                    const teacher = draft.teachers.find(t => t.id === tId);
                    if (teacher) {
                      if (teacher.unavailability[d]?.[p + b]) {
                        teacherAvailable = false;
                      }
                      Object.keys(draft.schedule).forEach(otherClassId => {
                        const otherSlot = draft.schedule[otherClassId]?.[d]?.[p + b];
                        if (otherSlot && otherSlot.teacherId && otherSlot.teacherId.split(",").includes(tId)) {
                          teacherAvailable = false;
                        }
                      });
                    }
                  }
                }

                if (classEmpty && teacherAvailable) {
                  if (!draft.schedule[classId]) {
                    draft.schedule[classId] = {};
                  }
                  if (!draft.schedule[classId][d]) {
                    draft.schedule[classId][d] = Array(numPeriods).fill(null);
                  }
                  for (let b = 0; b < blockSize; b++) {
                    draft.schedule[classId][d][p + b] = {
                      assignmentId: assign.id,
                      courseId: assign.courseId,
                      teacherId: assign.teacherId,
                      classroomId: assign.classroomId
                    };
                  }
                  placed = true;
                  showToast(`Ders başarıyla boş olan ${draft.settings.days[d]} günü ${p + 1}. ders saatine yerleştirildi!`, "success");
                }
              }
            }

            if (!placed) {
              setScheduleViewMode("class");
              setSelectedClassId(action.entityId);
              showToast(`Sınıf programı açıldı. Yerleşmeyen dersleri program üzerine sürükleyebilirsiniz.`, "info");
            }
          }
        }
      });
    }
  };



  const generateAnalysisReport = () => {
    const reports: string[] = [];
    const suggestions: string[] = [];

    // 1. Check for Active Conflicts
    if (activeConflicts.length > 0) {
      // Group conflicts by type
      const teacherConflicts = activeConflicts.filter(c => c.type === "teacher_overlap");
      const classConflicts = activeConflicts.filter(c => c.type === "class_unavailable");
      const roomConflicts = activeConflicts.filter(c => c.type === "classroom_overlap");
      const unavailabilityConflicts = activeConflicts.filter(c => c.type === "class_unavailable" || c.type === "teacher_unavailable" || c.type === "classroom_unavailable");

      if (teacherConflicts.length > 0) {
        teacherConflicts.forEach(c => {
          const teacherObj = state.teachers.find(t => t.id === c.details.teacherId);
          const tName = teacherObj?.name || "Bilinmeyen Öğretmen";
          const dayName = state.settings.days[c.dayIndex];
          const periodName = `${c.periodIndex + 1}. Saat`;
          reports.push(`⚠️ ${tName} öğretmeni ${dayName} günü ${periodName} diliminde çakışıyor (Aynı saatte birden fazla sınıfa atanmış).`);
        });
        suggestions.push(`💡 Öğretmen çakışmasını düzeltmek için, çakışan derslerden birini fareyle sürükleyip boş bir güne/saate taşıyın.`);
      }

      if (classConflicts.length > 0) {
        classConflicts.forEach(c => {
          const classObj = state.classes.find(cl => cl.id === c.details.classId);
          const cName = classObj?.name || "Bilinmeyen Sınıf";
          const dayName = state.settings.days[c.dayIndex];
          const periodName = `${c.periodIndex + 1}. Saat`;
          reports.push(`⚠️ ${cName} sınıfının ${dayName} günü ${periodName} dersinde çift rezervasyon var veya çakışma mevcut.`);
        });
        suggestions.push(`💡 Sınıf çakışmasını çözmek için, o sınıftaki derslerden birini silip (çift tıklayarak) başka bir saate yerleştirin.`);
      }

      if (roomConflicts.length > 0) {
        roomConflicts.forEach(c => {
          const roomObj = state.classrooms.find(r => r.id === c.details.classroomId);
          const rName = roomObj?.name || "Bilinmeyen Atölye";
          const dayName = state.settings.days[c.dayIndex];
          const periodName = `${c.periodIndex + 1}. Saat`;
          reports.push(`⚠️ ${rName} atölyesi/laboratuvarı ${dayName} günü ${periodName} diliminde birden fazla ders için ayrılmış.`);
        });
        suggestions.push(`💡 Atölye çakışmasını çözmek için atölyeyi paylaşan derslerden birini başka bir dersliğe aktarın veya farklı bir saat dilimine sürükleyin.`);
      }

      if (unavailabilityConflicts.length > 0) {
        unavailabilityConflicts.forEach(c => {
          const classObj = state.classes.find(cl => cl.id === c.details.classId);
          const tObj = state.teachers.find(t => t.id === c.details.teacherId);
          const entName = classObj?.name || tObj?.name || "Bilinmeyen Kaynak";
          const dayName = state.settings.days[c.dayIndex];
          const periodName = `${c.periodIndex + 1}. Saat`;
          reports.push(`⚠️ ${entName} için ${dayName} günü ${periodName} kilitli (kapalı) olmasına rağmen ders yerleştirilmiş.`);
        });
        suggestions.push(`💡 Kilitli zaman dilimi çakışmasını çözmek için dersi başka bir saate taşıyın veya o günün kilidini F2 tuşuna basarak kaldırın.`);
      }
    }

    // 2. Check for Unplaced Lessons
    const placedHoursMap: { [assignId: string]: number } = {};
    Object.keys(state.schedule).forEach((classId) => {
      const classSched = state.schedule[classId];
      if (classSched) {
        Object.keys(classSched).forEach((dayKey) => {
          const dayIdx = parseInt(dayKey, 10);
          const periods = classSched[dayIdx];
          if (periods) {
            periods.forEach((slot) => {
              if (slot) {
                placedHoursMap[slot.assignmentId] = (placedHoursMap[slot.assignmentId] || 0) + 1;
              }
            });
          }
        });
      }
    });

    const unplacedAssignments = state.assignments.filter(a => {
      const placed = placedHoursMap[a.id] || 0;
      return placed < a.weeklyHours;
    });

    if (unplacedAssignments.length > 0) {
      unplacedAssignments.forEach(a => {
        const classObj = state.classes.find(cl => cl.id === a.classId);
        const courseObj = state.courses.find(co => co.id === a.courseId);
        const teacherNames = a.teacherId ? a.teacherId.split(",").map(id => state.teachers.find(t => t.id === id)?.name).filter(Boolean).join(", ") : "Bilinmiyor";
        const remaining = a.weeklyHours - (placedHoursMap[a.id] || 0);
        reports.push(`📋 ${classObj?.name || "Sınıf"} sınıfının ${courseObj?.name || "Ders"} dersi (${teacherNames}) için planlanan ${a.weeklyHours} saatten ${remaining} saati hala yerleştirilemedi.`);
      });

      suggestions.push(`💡 Yerleşmemiş dersleri tamamlamak için "Hepsini Yerleştir" (Akıllı Dağıtım) butonuna tıklayabilir veya çakışan öğretmenlerin kapalı günlerini esnetebilirsiniz.`);
      suggestions.push(`💡 Sınıflarınızın günlük ders saati sınırını (daily periods) kontrol edin. Eğer kısıtlı saat tanımladıysanız (örn: Çarşamba 6 ders), dersleri sığdırmak için limiti artırabilir veya diğer günlere kaydırabilirsiniz.`);
    }

    if (reports.length === 0) {
      reports.push("✅ Harika! Hiçbir çakışma bulunmuyor ve tüm dersler eksiksiz yerleştirilmiş.");
    }

    return { reports, suggestions };
  };

  // Extracted and moved to ScheduleTab.tsx: const getAssignmentPlacedHours =;

  const checkDragMoveConflicts = (
    slotToMove: ScheduleSlot,
    toClassId: string,
    toDay: number,
    toPeriod: number,
    ignoreFromDay?: number,
    ignoreFromPeriod?: number
  ) => {
    const conflicts: string[] = [];
    const assignment = state.assignments.find((a) => a.id === slotToMove.assignmentId);
    if (!assignment) return conflicts;

    // 1. Check daily periods limit for class
    const targetClassObj = classesMap.get(toClassId);
    if (targetClassObj && targetClassObj.dailyPeriods) {
      const maxPeriodsThisDay = targetClassObj.dailyPeriods[toDay];
      if (maxPeriodsThisDay !== undefined && toPeriod >= maxPeriodsThisDay) {
        conflicts.push("Sınıfın günlük ders saati sınırı dışında.");
      }
    }

    // 2. Unavailability locks
    const tIds = slotToMove.teacherId ? slotToMove.teacherId.split(",") : [];
    for (const tId of tIds) {
      const teacherObj = teachersMap.get(tId);
      if (teacherObj && teacherObj.unavailability?.[toDay]?.[toPeriod]) {
        conflicts.push(`Öğretmen (${teacherObj.name}) bu saatte kapalı/izinli.`);
      }
    }

    if (targetClassObj && targetClassObj.unavailability?.[toDay]?.[toPeriod]) {
      conflicts.push("Sınıf bu saatte kapalı.");
    }

    if (slotToMove.classroomId) {
      const classroomObj = classroomsMap.get(slotToMove.classroomId);
      if (classroomObj && classroomObj.unavailability?.[toDay]?.[toPeriod]) {
        conflicts.push("Atölye/derslik bu saatte kapalı.");
      }
    }

    // 3. Busy states (Teacher busy elsewhere)
    for (const tId of tIds) {
      for (const otherClassId of Object.keys(state.schedule)) {
        if (otherClassId === toClassId) continue;
        const otherSlot = state.schedule[otherClassId]?.[toDay]?.[toPeriod];
        if (otherSlot && otherSlot.teacherId) {
          const otherTIds = otherSlot.teacherId.split(",");
          if (otherTIds.includes(tId)) {
            if (toClassId === otherClassId && toDay === ignoreFromDay && toPeriod === ignoreFromPeriod) continue;
            const tName = teachersMap.get(tId)?.name || "Öğretmen";
            const otherClassName = classesMap.get(otherClassId)?.name || "başka sınıf";
            conflicts.push(`${tName} bu saatte ${otherClassName} sınıfında derste.`);
          }
        }
      }
    }

    // Classroom busy elsewhere
    if (slotToMove.classroomId) {
      for (const otherClassId of Object.keys(state.schedule)) {
        if (otherClassId === toClassId) continue;
        const otherSlot = state.schedule[otherClassId]?.[toDay]?.[toPeriod];
        if (otherSlot && otherSlot.classroomId === slotToMove.classroomId) {
          const rName = classroomsMap.get(slotToMove.classroomId)?.name || "Atölye";
          const otherClassName = classesMap.get(otherClassId)?.name || "başka sınıf";
          conflicts.push(`${rName} bu saatte ${otherClassName} tarafından kullanılıyor.`);
        }
      }
    }

    return conflicts;
  };

  // Extracted and moved to ScheduleTab.tsx: const handleDragStart =;

  // Extracted and moved to ScheduleTab.tsx: const handleDrop =;

  // Extracted and moved to ScheduleTab.tsx: const handleCellClick =;

  // Extracted and moved to ScheduleTab.tsx: const handleCellDoubleClick =;

  // --- GAP REDUCTION & OPTIMIZATION UTILITIES (DELEGATED TO UTILS) ---

  const optimizeGapsForTeacher = (teacherId: string) => {
    if (!user) {
      showToast("Değişiklik yapabilmek için lütfen geçerli bir lisansa sahip yönetici hesabı ile giriş yapın (SaaS Lisans Koruması).", "error");
      return;
    }
    const res = runOptimizeGapsForTeacher(state, teacherId);
    if (res.success && res.schedule) {
      updateState((draft) => {
        draft.schedule = res.schedule!;
      });
      showToast(res.message, "success");
    } else {
      showToast(res.message, res.type);
    }
  };

  const optimizeGapsForAllTeachers = () => {
    if (!user) {
      showToast("Değişiklik yapabilmek için lütfen geçerli bir lisansa sahip yönetici hesabı ile giriş yapın (SaaS Lisans Koruması).", "error");
      return;
    }
    const res = runOptimizeGapsForAllTeachers(state);
    if (res.success && res.schedule) {
      updateState((draft) => {
        draft.schedule = res.schedule!;
      });
      showToast(res.message, "success");
    } else {
      showToast(res.message, res.type);
    }
  };

  const removeSingleLessonDays = () => {
    if (!user) {
      showToast("Değişiklik yapabilmek için lütfen geçerli bir lisansa sahip yönetici hesabı ile giriş yapın (SaaS Lisans Koruması).", "error");
      return;
    }
    const res = runRemoveSingleLessonDays(state);
    if (res.success && res.schedule) {
      updateState((draft) => {
        draft.schedule = res.schedule!;
      });
      showToast(res.message, "success");
    } else {
      showToast(res.message, res.type);
    }
  };

  const removeSingleLessonDaysForTeacher = (teacherId: string) => {
    if (!user) {
      showToast("Değişiklik yapabilmek için lütfen geçerli bir lisansa sahip yönetici hesabı ile giriş yapın (SaaS Lisans Koruması).", "error");
      return;
    }
    const res = runRemoveSingleLessonDaysForTeacher(state, teacherId);
    if (res.success && res.schedule) {
      updateState((draft) => {
        draft.schedule = res.schedule!;
      });
      showToast(res.message, "success");
    } else {
      showToast(res.message, res.type);
    }
  };

  const handleAutoGenerate = () => {
    if (!user) {
      showToast("Değişiklik yapabilmek için lütfen geçerli bir lisansa sahip yönetici hesabı ile giriş yapın (SaaS Lisans Koruması).", "error");
      return;
    }
    handleAutoGenerateClick();
  };

  const handleClearTeacherLessons = (teacherId: string) => {
    if (!user) {
      showToast("Değişiklik yapabilmek için lütfen geçerli bir lisansa sahip yönetici hesabı ile giriş yapın (SaaS Lisans Koruması).", "error");
      return;
    }
    updateState((draft) => {
      for (const c of draft.classes) {
        if (!draft.schedule[c.id]) continue;
        for (let d = 0; d < draft.settings.days.length; d++) {
          if (!draft.schedule[c.id][d]) continue;
          for (let p = 0; p < draft.settings.periodsPerDay; p++) {
            const slot = draft.schedule[c.id][d][p];
            if (!slot) continue;
            const tIds = slot.teacherId ? slot.teacherId.split(",") : [];
            if (tIds.includes(teacherId)) {
              draft.schedule[c.id][d][p] = null;
            }
          }
        }
      }
    });
    showToast("Öğretmenin tüm dersleri programdan silindi.", "info");
  };

  const handleClearAllTeachersSchedule = () => {
    if (!user) {
      showToast("Değişiklik yapabilmek için lütfen geçerli bir lisansa sahip yönetici hesabı ile giriş yapın (SaaS Lisans Koruması).", "error");
      return;
    }
    setConfirmModal({
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
    });
  };

  const handleClearSchedule = () => {
    let confirmMsg = "Tüm ders programı çizelgesini temizlemek istediğinize emin misiniz? (Kilitli/kapalı hücreler korunacaktır)";
    let title = "Ders Programını Temizle";
    if (viewingEntityId) {
      if (scheduleViewMode === "teacher") {
        const teacher = state.teachers.find(t => t.id === viewingEntityId);
        confirmMsg = `Seçili öğretmenin (${teacher?.name || ""}) programını temizlemek istediğinize emin misiniz? (Sabit/kilitli dersler korunacaktır)`;
        title = "Öğretmen Programını Temizle";
      }
    }

    setConfirmModal({
      isOpen: true,
      title: title,
      message: confirmMsg,
      confirmText: "Evet, Temizle",
      isDangerous: true,
      action: () => {
        updateState((draft) => {
          const isSlotLocked = (slot: any, classObj: any, d: number, p: number) => {
            if (!slot) return false;
            const isClassUnavail = classObj.unavailability[d]?.[p] === true;
            return slot.isLocked === true || isClassUnavail;
          };

          for (const c of draft.classes) {
            if (!draft.schedule[c.id]) {
              draft.schedule[c.id] = {};
            }
            for (let d = 0; d < draft.settings.days.length; d++) {
              if (!draft.schedule[c.id][d]) {
                draft.schedule[c.id][d] = Array(draft.settings.periodsPerDay).fill(null);
                continue;
              }
              for (let p = 0; p < draft.settings.periodsPerDay; p++) {
                const slot = draft.schedule[c.id][d][p];
                if (!slot) continue;

                const locked = isSlotLocked(slot, c, d, p);
                if (locked) {
                  // Keep it, it is locked/frozen!
                  continue;
                }

                // Apply filtering based on selected entity
                let shouldClear = false;
                if (viewingEntityId) {
                  if (scheduleViewMode === "teacher" && slot.teacherId === viewingEntityId) {
                    shouldClear = true;
                  } else if (scheduleViewMode === "class" && c.id === viewingEntityId) {
                    shouldClear = true;
                  } else if (scheduleViewMode === "classroom" && slot.classroomId === viewingEntityId) {
                    shouldClear = true;
                  }
                } else {
                  // Global clear
                  shouldClear = true;
                }

                if (shouldClear) {
                  draft.schedule[c.id][d][p] = null;
                }
              }
            }
          }
        });
        setConfirmModal(null);
        showToast(
          viewingEntityId 
            ? "Seçili varlığın programı temizlendi (sabit/kilitli dersler hariç)." 
            : "Tüm ders programı temizlendi (sabit/kilitli dersler hariç).", 
          "info"
        );
      }
    });
  };

  const handleLoadLargeDemoData = () => {
    setConfirmModal({
      isOpen: true,
      title: "Büyük Deneme Verisi Yükle",
      message: "20 Öğretmen, 20 Sınıf ve 30'ar saatlik ders atamalarından oluşan büyük test verisini yüklemek istiyor musunuz? Mevcut verileriniz silinecektir.",
      isDangerous: true,
      confirmText: "Evet, Yükle",
      action: () => {
        const largeData = generateLargeDemoState();
        setHistoryState({
          current: largeData,
          past: [],
          future: [],
          isSynced: false
        });
        localStorage.setItem(
          LOCAL_STORAGE_KEY,
          JSON.stringify({ current: largeData, isSynced: false })
        );
        showToast("Büyük deneme verisi (20 Öğretmen, 20 Sınıf) başarıyla yüklendi!", "success");
        setViewingEntityId("");
        setConfirmModal(null);
      }
    });
  };

  const handleLoadStandardDemoData = () => {
    setConfirmModal({
      isOpen: true,
      title: "Standart Örnek Veri Yükle",
      message: "Standart örnek okul verilerini yüklemek istiyor musunuz? Mevcut verileriniz silinecektir.",
      isDangerous: true,
      confirmText: "Evet, Yükle",
      action: () => {
        const standardData = generateDemoState();
        setHistoryState({
          current: standardData,
          past: [],
          future: [],
          isSynced: false
        });
        localStorage.setItem(
          LOCAL_STORAGE_KEY,
          JSON.stringify({ current: standardData, isSynced: false })
        );
        showToast("Standart örnek veriler başarıyla yüklendi!", "success");
        setViewingEntityId("");
        setConfirmModal(null);
      }
    });
  };

  // -------------------------------------------------------------
  // MUTATION HANDLERS
  // -------------------------------------------------------------

  // Okul Bilgileri Güncelleme
  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    showToast("Okul bilgileri başarıyla güncellendi.", "success");
  };

  // Extracted and moved to ScheduleTab.tsx: const handleCellKeyDown =;

  const handleUpdateSchoolName = (name: string) => {
    updateState((draft) => {
      draft.settings.schoolName = name;
    });
  };

  const handleUpdatePrincipalName = (name: string) => {
    updateState((draft) => {
      draft.settings.principalName = name;
    });
  };

  const handleUpdateEffectiveDate = (date: string) => {
    updateState((draft) => {
      draft.settings.effectiveDate = date;
    });
  };

  const handleUpdateOfficialDocumentNo = (no: string) => {
    updateState((draft) => {
      draft.settings.officialDocumentNo = no;
    });
  };

  const handleUpdateLunchBreakAfter = (after: number) => {
    updateState((draft) => {
      draft.settings.lunchBreakAfter = after;
    });
  };

  const handleUpdateLunchBreakDuration = (duration: number) => {
    updateState((draft) => {
      draft.settings.lunchBreakDuration = duration;
    });
  };

  const handleUpdateSchoolSettings = (key: "groupLessonsMode" | "maxTeacherDailyGaps", value: any) => {
    updateState((draft) => {
      if (key === "groupLessonsMode") {
        draft.settings.groupLessonsMode = value;
      } else if (key === "maxTeacherDailyGaps") {
        draft.settings.maxTeacherDailyGaps = value;
      }
    });
  };

  const handleToggleDay = (day: string) => {
    const ALL_WEEK_DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
    updateState((draft) => {
      const oldDays = [...draft.settings.days];
      let newDays = [...oldDays];
      if (newDays.includes(day)) {
        if (newDays.length <= 1) {
          showToast("En az bir gün seçili olmalıdır.", "error");
          return;
        }
        newDays = newDays.filter(d => d !== day);
      } else {
        newDays.push(day);
      }
      
      newDays.sort((a, b) => ALL_WEEK_DAYS.indexOf(a) - ALL_WEEK_DAYS.indexOf(b));
      
      draft.settings.days = newDays;
      const count = newDays.length;

      const oldIndices = newDays.map(d => oldDays.indexOf(d));

      // 1. Teachers unavailability and closureNames
      draft.teachers.forEach((t) => {
        const oldUnavailability = { ...t.unavailability };
        const oldClosureNames = t.closureNames ? { ...t.closureNames } : {};
        
        t.unavailability = {};
        t.closureNames = {};
        
        newDays.forEach((_, newIdx) => {
          const oldIdx = oldIndices[newIdx];
          if (oldIdx !== -1) {
            t.unavailability[newIdx] = oldUnavailability[oldIdx] !== undefined ? oldUnavailability[oldIdx] : Array(draft.settings.periodsPerDay).fill(false);
            if (oldClosureNames[oldIdx]) {
              t.closureNames[newIdx] = oldClosureNames[oldIdx];
            }
          } else {
            t.unavailability[newIdx] = Array(draft.settings.periodsPerDay).fill(false);
          }
        });
      });

      // 2. Classes unavailability, closureNames, dailyPeriods
      draft.classes.forEach((c) => {
        const oldUnavailability = { ...c.unavailability };
        const oldClosureNames = c.closureNames ? { ...c.closureNames } : {};
        const oldDailyPeriods = c.dailyPeriods ? { ...c.dailyPeriods } : {};
        
        c.unavailability = {};
        c.closureNames = {};
        c.dailyPeriods = {};
        
        newDays.forEach((_, newIdx) => {
          const oldIdx = oldIndices[newIdx];
          if (oldIdx !== -1) {
            c.unavailability[newIdx] = oldUnavailability[oldIdx] !== undefined ? oldUnavailability[oldIdx] : Array(draft.settings.periodsPerDay).fill(false);
            if (oldClosureNames[oldIdx]) {
              c.closureNames[newIdx] = oldClosureNames[oldIdx];
            }
            c.dailyPeriods[newIdx] = oldDailyPeriods[oldIdx] !== undefined ? oldDailyPeriods[oldIdx] : draft.settings.periodsPerDay;
          } else {
            c.unavailability[newIdx] = Array(draft.settings.periodsPerDay).fill(false);
            c.dailyPeriods[newIdx] = draft.settings.periodsPerDay;
          }
        });
      });

      // 3. Classrooms unavailability and closureNames
      draft.classrooms.forEach((cr) => {
        const oldUnavailability = { ...cr.unavailability };
        const oldClosureNames = cr.closureNames ? { ...cr.closureNames } : {};
        
        cr.unavailability = {};
        cr.closureNames = {};
        
        newDays.forEach((_, newIdx) => {
          const oldIdx = oldIndices[newIdx];
          if (oldIdx !== -1) {
            cr.unavailability[newIdx] = oldUnavailability[oldIdx] !== undefined ? oldUnavailability[oldIdx] : Array(draft.settings.periodsPerDay).fill(false);
            if (oldClosureNames[oldIdx]) {
              cr.closureNames[newIdx] = oldClosureNames[oldIdx];
            }
          } else {
            cr.unavailability[newIdx] = Array(draft.settings.periodsPerDay).fill(false);
          }
        });
      });

      // 4. Schedule map
      const oldSchedule = { ...draft.schedule };
      draft.schedule = {};
      Object.keys(oldSchedule).forEach((cId) => {
        const classSchedules = oldSchedule[cId];
        if (classSchedules) {
          draft.schedule[cId] = {};
          newDays.forEach((_, newIdx) => {
            const oldIdx = oldIndices[newIdx];
            if (oldIdx !== -1 && classSchedules[oldIdx]) {
              draft.schedule[cId][newIdx] = classSchedules[oldIdx];
            }
          });
        }
      });
    });
  };

  const handleUpdatePeriodsCount = (count: number) => {
    if (count < 1 || count > 12) return;
    updateState((draft) => {
      const oldPeriods = draft.settings.periodsPerDay;
      draft.settings.periodsPerDay = count;

      // Adjust periodTimes list length
      if (count > oldPeriods) {
        for (let i = oldPeriods; i < count; i++) {
          draft.settings.periodTimes.push({ start: "08:00", end: "08:40" });
        }
      } else {
        draft.settings.periodTimes = draft.settings.periodTimes.slice(0, count);
      }

      // Re-initialize unavailability arrays size for all elements
      draft.teachers.forEach((t) => {
        Object.keys(t.unavailability).forEach((dayIdxStr) => {
          const dIdx = parseInt(dayIdxStr);
          const currentArr = t.unavailability[dIdx] || [];
          if (count > currentArr.length) {
            t.unavailability[dIdx] = [...currentArr, ...Array(count - currentArr.length).fill(false)];
          } else {
            t.unavailability[dIdx] = currentArr.slice(0, count);
          }
        });
      });

      draft.classes.forEach((c) => {
        Object.keys(c.unavailability).forEach((dayIdxStr) => {
          const dIdx = parseInt(dayIdxStr);
          const currentArr = c.unavailability[dIdx] || [];
          if (count > currentArr.length) {
            c.unavailability[dIdx] = [...currentArr, ...Array(count - currentArr.length).fill(false)];
          } else {
            c.unavailability[dIdx] = currentArr.slice(0, count);
          }
        });
      });

      draft.classrooms.forEach((cr) => {
        Object.keys(cr.unavailability).forEach((dayIdxStr) => {
          const dIdx = parseInt(dayIdxStr);
          const currentArr = cr.unavailability[dIdx] || [];
          if (count > currentArr.length) {
            cr.unavailability[dIdx] = [...currentArr, ...Array(count - currentArr.length).fill(false)];
          } else {
            cr.unavailability[dIdx] = currentArr.slice(0, count);
          }
        });
      });

      // Clean slots outside bounds in schedule
      Object.keys(draft.schedule).forEach((cId) => {
        const classSchedules = draft.schedule[cId];
        Object.keys(classSchedules).forEach((dayIdxStr) => {
          const dIdx = parseInt(dayIdxStr);
          if (classSchedules[dIdx]) {
            classSchedules[dIdx] = classSchedules[dIdx].slice(0, count);
          }
        });
      });
    });
  };

  const handleUpdatePeriodTime = (index: number, type: "start" | "end", val: string) => {
    updateState((draft) => {
      if (draft.settings.periodTimes[index]) {
        draft.settings.periodTimes[index][type] = val;
      }
    });
  };

  // Öğretmen İşlemleri
  const handleTeacherSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeacher.name.trim() || !newTeacher.branch.trim()) return;

    updateState((draft) => {
      if (editingTeacherId) {
        // Edit Mode
        const teacher = draft.teachers.find((t) => t.id === editingTeacherId);
        if (teacher) {
          teacher.name = newTeacher.name;
          teacher.branch = newTeacher.branch;
          teacher.shortName = newTeacher.shortName.trim().toUpperCase();
          teacher.homeroomClass = newTeacher.homeroomClass.trim();
        }
        setEditingTeacherId(null);
        showToast("Öğretmen bilgileri güncellendi.", "success");
      } else {
        // Add Mode
        const id = "t_" + Date.now();
        const teacher: Teacher = {
          id,
          name: newTeacher.name,
          branch: newTeacher.branch,
          shortName: newTeacher.shortName.trim().toUpperCase() || undefined,
          homeroomClass: newTeacher.homeroomClass.trim() || undefined,
          unavailability: createEmptyUnavailability(draft.settings.days.length, draft.settings.periodsPerDay)
        };
        draft.teachers.push(teacher);
        setSelectedTeacherId(id);
        showToast(`Öğretmen ${newTeacher.name} sisteme eklendi.`, "success");
      }
    });

    setNewTeacher({ name: "", branch: "", shortName: "", homeroomClass: "" });
  };

  const handleEditTeacher = (teacher: Teacher) => {
    setNewTeacher({
      name: teacher.name,
      branch: teacher.branch,
      shortName: teacher.shortName || "",
      homeroomClass: teacher.homeroomClass || ""
    });
    setEditingTeacherId(teacher.id);
  };

  const handleMoveTeacherUp = (index: number) => {
    if (index === 0) return;
    updateState((draft) => {
      const temp = draft.teachers[index];
      draft.teachers[index] = draft.teachers[index - 1];
      draft.teachers[index - 1] = temp;
    });
  };

  const handleMoveTeacherDown = (index: number) => {
    if (index === state.teachers.length - 1) return;
    updateState((draft) => {
      const temp = draft.teachers[index];
      draft.teachers[index] = draft.teachers[index + 1];
      draft.teachers[index + 1] = temp;
    });
  };

  const handleDeleteTeacher = (id: string) => {
    const teacher = state.teachers.find((t) => t.id === id);
    setConfirmModal({
      isOpen: true,
      title: "Öğretmeni Sil",
      message: `"${teacher?.name}" öğretmenini silmek istediğinize emin misiniz? Öğretmene bağlı tüm ders dağıtımları da silinecektir.`,
      isDangerous: true,
      confirmText: "Evet, Sil",
      action: () => {
        updateState((draft) => {
          draft.teachers = draft.teachers.filter((t) => t.id !== id);
          // Clean assignments teacherId
          draft.assignments.forEach((a) => {
            if (a.teacherId) {
              const currentIds = a.teacherId.split(",");
              const filteredIds = currentIds.filter(tId => tId !== id);
              a.teacherId = filteredIds.join(",");
            }
          });
          // Clean schedule slots referring to this teacher
          Object.keys(draft.schedule).forEach((cId) => {
            const classSchedules = draft.schedule[cId];
            Object.keys(classSchedules).forEach((dIdxStr) => {
              const dIdx = parseInt(dIdxStr);
              const periods = classSchedules[dIdx] || [];
              for (let p = 0; p < periods.length; p++) {
                if (periods[p]?.teacherId) {
                  const currentIds = periods[p].teacherId.split(",");
                  if (currentIds.includes(id)) {
                    const filteredIds = currentIds.filter(tId => tId !== id);
                    periods[p].teacherId = filteredIds.join(",");
                  }
                }
              }
            });
          });
        });
        if (selectedTeacherId === id) setSelectedTeacherId("");
        showToast("Öğretmen ve ilgili ders tanımları silindi.", "info");
        setConfirmModal(null);
      }
    });
  };

  const toggleTeacherUnavailability = (dayIdx: number, periodIdx: number) => {
    if (!selectedTeacherId) return;
    updateState((draft) => {
      const teacher = draft.teachers.find((t) => t.id === selectedTeacherId);
      if (teacher) {
        if (!teacher.unavailability[dayIdx]) {
          teacher.unavailability[dayIdx] = Array(draft.settings.periodsPerDay).fill(false);
        }
        teacher.unavailability[dayIdx][periodIdx] = !teacher.unavailability[dayIdx][periodIdx];
      }
    });
  };

  // Sınıf İşlemleri
  const handleClassSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClass.name.trim()) return;

    updateState((draft) => {
      if (editingClassId) {
        const item = draft.classes.find((c) => c.id === editingClassId);
        if (item) item.name = newClass.name;
        setEditingClassId(null);
        showToast("Sınıf adı güncellendi.", "success");
      } else {
        const id = "c_" + Date.now();
        const item: GradeClass = {
          id,
          name: newClass.name,
          unavailability: createEmptyUnavailability(draft.settings.days.length, draft.settings.periodsPerDay)
        };
        draft.classes.push(item);
        draft.schedule[id] = {};
        for (let d = 0; d < draft.settings.days.length; d++) {
          draft.schedule[id][d] = Array(draft.settings.periodsPerDay).fill(null);
        }
        setSelectedClassId(id);
        showToast(`Sınıf ${newClass.name} sisteme eklendi.`, "success");
      }
    });
    setNewClass({ name: "" });
  };

  const handleDeleteClass = (id: string) => {
    const item = state.classes.find((c) => c.id === id);
    setConfirmModal({
      isOpen: true,
      title: "Sınıfı Sil",
      message: `"${item?.name}" sınıfını silmek istediğinize emin misiniz? Sınıfa ait tüm ders programı ve ders dağıtımları da kaldırılacaktır.`,
      isDangerous: true,
      confirmText: "Evet, Sil",
      action: () => {
        updateState((draft) => {
          draft.classes = draft.classes.filter((c) => c.id !== id);
          draft.assignments = draft.assignments.filter((a) => a.classId !== id);
          delete draft.schedule[id];
        });
        if (selectedClassId === id) setSelectedClassId("");
        showToast("Sınıf ve bağlı ders programı silindi.", "info");
        setConfirmModal(null);
      }
    });
  };

  const handleUpdateClassDailyPeriods = (classId: string, dayIndex: number, periods: number) => {
    updateState((draft) => {
      const cls = draft.classes.find((c) => c.id === classId);
      if (cls) {
        if (!cls.dailyPeriods) {
          cls.dailyPeriods = {};
        }
        cls.dailyPeriods[dayIndex] = periods;
      }
    });
  };

  const toggleClassUnavailability = (dayIdx: number, periodIdx: number) => {
    if (!selectedClassId) return;
    updateState((draft) => {
      const item = draft.classes.find((c) => c.id === selectedClassId);
      if (item) {
        if (!item.unavailability[dayIdx]) {
          item.unavailability[dayIdx] = Array(draft.settings.periodsPerDay).fill(false);
        }
        item.unavailability[dayIdx][periodIdx] = !item.unavailability[dayIdx][periodIdx];
      }
    });
  };

  // Atölye/Derslik İşlemleri
  const handleClassroomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassroom.name.trim() || !newClassroom.shortName.trim()) {
      showToast("Lütfen atölye adı ve kısa adını doldurun!", "error");
      return;
    }

    updateState((draft) => {
      if (editingClassroomId) {
        const item = draft.classrooms.find((cr) => cr.id === editingClassroomId);
        if (item) {
          item.name = newClassroom.name;
          item.shortName = newClassroom.shortName.toUpperCase();
        }
        setEditingClassroomId(null);
        showToast("Atölye güncellendi.", "success");
      } else {
        const id = "cr_" + Date.now();
        const item: Classroom = {
          id,
          name: newClassroom.name,
          shortName: newClassroom.shortName.toUpperCase(),
          type: "workshop" as const,
          unavailability: createEmptyUnavailability(draft.settings.days.length, draft.settings.periodsPerDay)
        };
        draft.classrooms.push(item);
        setSelectedClassroomId(id);
        showToast(`Atölye ${newClassroom.name} sisteme kaydedildi.`, "success");
      }
    });
    setNewClassroom({ name: "", shortName: "" });
  };

  const handleEditClassroom = (cr: Classroom) => {
    setNewClassroom({ name: cr.name, shortName: cr.shortName });
    setEditingClassroomId(cr.id);
  };

  const handleDeleteClassroom = (id: string) => {
    const item = state.classrooms.find((cr) => cr.id === id);
    setConfirmModal({
      isOpen: true,
      title: "Atölyeyi/Laboratuvarı Sil",
      message: `"${item?.name}" atölyesini silmek istediğinize emin misiniz?`,
      isDangerous: true,
      confirmText: "Evet, Sil",
      action: () => {
        updateState((draft) => {
          draft.classrooms = draft.classrooms.filter((cr) => cr.id !== id);
          // Reset classroom requirements to null in assignments
          draft.assignments.forEach((a) => {
            if (a.classroomId === id) a.classroomId = null;
          });
          // Clear classroomId in scheduled slots
          Object.keys(draft.schedule).forEach((cId) => {
            const classSchedules = draft.schedule[cId];
            Object.keys(classSchedules).forEach((dIdxStr) => {
              const dIdx = parseInt(dIdxStr);
              const periods = classSchedules[dIdx] || [];
              for (let p = 0; p < periods.length; p++) {
                if (periods[p]?.classroomId === id) {
                  periods[p]!.classroomId = null;
                }
              }
            });
          });
        });
        if (selectedClassroomId === id) setSelectedClassroomId("");
        showToast("Atölye kaldırıldı.", "info");
        setConfirmModal(null);
      }
    });
  };

  const toggleClassroomUnavailability = (dayIdx: number, periodIdx: number) => {
    if (!selectedClassroomId) return;
    updateState((draft) => {
      const item = draft.classrooms.find((cr) => cr.id === selectedClassroomId);
      if (item) {
        if (!item.unavailability[dayIdx]) {
          item.unavailability[dayIdx] = Array(draft.settings.periodsPerDay).fill(false);
        }
        item.unavailability[dayIdx][periodIdx] = !item.unavailability[dayIdx][periodIdx];
      }
    });
  };

  // Ders Tanımları İşlemleri
  const handleCourseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourse.name.trim() || !newCourse.code.trim()) {
      showToast("Lütfen ders adı ve kısa adını doldurun!", "error");
      return;
    }

    const cleanPlacement = newCourse.placementMode.trim();
    if (!/^[1-9][0-9]*(\+[1-9][0-9]*)*$/.test(cleanPlacement)) {
      showToast("Yerleşme biçimi sadece rakamlardan ve aralarındaki '+' işaretlerinden oluşmalıdır! Örn: 2+2+2", "error");
      return;
    }

    const parts = cleanPlacement.split("+").map(p => parseInt(p.trim(), 10));
    const sum = parts.reduce((acc, curr) => acc + curr, 0);
    const weeklyHoursNum = Number(newCourse.weeklyHours);

    if (sum !== weeklyHoursNum) {
      showToast(`Girdiğiniz dağılım toplamı (${sum}) haftalık ders saatine (${weeklyHoursNum}) eşit olmalıdır!`, "error");
      return;
    }

    updateState((draft) => {
      if (editingCourseId) {
        const item = draft.courses.find((c) => c.id === editingCourseId);
        if (item) {
          item.name = newCourse.name;
          item.code = newCourse.code.toUpperCase();
          item.weeklyHours = weeklyHoursNum;
          item.placementMode = cleanPlacement;
        }
        setEditingCourseId(null);
        showToast("Ders tanımı güncellendi.", "success");
      } else {
        const id = "crs_" + Date.now();
        const item: Course = {
          id,
          name: newCourse.name,
          code: newCourse.code.toUpperCase(),
          weeklyHours: weeklyHoursNum,
          placementMode: cleanPlacement
        };
        draft.courses.push(item);
        showToast(`"${newCourse.name}" ders tanımı sisteme eklendi.`, "success");
      }
    });
    setNewCourse({ name: "", code: "", weeklyHours: 2, placementMode: "2" });
  };

  const handleEditCourse = (c: Course) => {
    setNewCourse({
      name: c.name,
      code: c.code,
      weeklyHours: c.weeklyHours,
      placementMode: c.placementMode
    });
    setEditingCourseId(c.id);
  };

  const handleDeleteCourse = (id: string) => {
    const item = state.courses.find((c) => c.id === id);
    setConfirmModal({
      isOpen: true,
      title: "Dersi Sil",
      message: `"${item?.name}" dersini silmek istediğinize emin misiniz? Bu derse bağlı tüm ders dağıtımları ve program yerleşimleri silinecektir.`,
      isDangerous: true,
      confirmText: "Evet, Sil",
      action: () => {
        updateState((draft) => {
          draft.courses = draft.courses.filter((c) => c.id !== id);
          draft.assignments = draft.assignments.filter((a) => a.courseId !== id);
          // Clean schedule
          Object.keys(draft.schedule).forEach((cId) => {
            const classSchedules = draft.schedule[cId];
            if (classSchedules) {
              Object.keys(classSchedules).forEach((dIdxStr) => {
                const dIdx = parseInt(dIdxStr, 10);
                if (Array.isArray(classSchedules[dIdx])) {
                  classSchedules[dIdx] = classSchedules[dIdx].map((slot) => {
                    return slot?.courseId === id ? null : slot;
                  });
                }
              });
            }
          });
        });
        showToast("Ders tanımı ve ilgili yerleşimleri silindi.", "info");
        setConfirmModal(null);
      }
    });
  };

  // Ders Dağıtım İşlemleri
  const handleAssignmentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const { classId, courseId, teacherId, weeklyHours, classroomId, preferredBlockSize } = newAssignment;
    if (!classId || !courseId || !teacherId) {
      showToast("Lütfen sınıf, ders ve öğretmen seçimlerini eksiksiz yapın!", "error");
      return;
    }

    updateState((draft) => {
      // Check if this lesson has already been assigned to this class
      const exists = draft.assignments.some(
        (a) => a.classId === classId && a.courseId === courseId
      );
      if (exists) {
        showToast("Bu ders zaten bu sınıfa atanmış! Mevcut atamayı silebilir veya düzenleyebilirsiniz.", "error");
        return;
      }

      const id = "as_" + Date.now();
      const item: LessonAssignment = {
        id,
        classId,
        courseId,
        teacherId,
        weeklyHours: Number(weeklyHours),
        classroomId: classroomId ? classroomId : null,
        preferredBlockSize: Number(preferredBlockSize)
      };
      draft.assignments.push(item);
      showToast("Ders ataması başarıyla tamamlandı.", "success");
    });

    setNewAssignment({
      classId: "",
      courseId: "",
      teacherId: "",
      weeklyHours: 2,
      classroomId: "",
      preferredBlockSize: 2
    });
  };

  const handleDeleteAssignment = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Ders Dağıtımını Sil",
      message: "Bu ders dağıtımını silmek istediğinize emin misiniz? Ders programındaki ilgili yerleşimler de boşaltılacaktır.",
      isDangerous: true,
      confirmText: "Evet, Sil",
      action: () => {
        updateState((draft) => {
          draft.assignments = draft.assignments.filter((a) => a.id !== id);
          // Clear from schedule
          Object.keys(draft.schedule).forEach((cId) => {
            const classSchedules = draft.schedule[cId];
            if (classSchedules) {
              Object.keys(classSchedules).forEach((dIdxStr) => {
                const dIdx = parseInt(dIdxStr, 10);
                if (Array.isArray(classSchedules[dIdx])) {
                  classSchedules[dIdx] = classSchedules[dIdx].map((slot) => {
                    return slot?.assignmentId === id ? null : slot;
                  });
                }
              });
            }
          });
        });
        showToast("Ders dağıtımı kaldırıldı.", "info");
        setConfirmModal(null);
      }
    });
  };

  const handleDirectCourseAssign = (classId: string, courseId: string) => {
    if (!classId) {
      showToast("Lütfen önce ders atamak istediğiniz sınıfı seçin!", "error");
      return;
    }
    const course = state.courses.find((c) => c.id === courseId);
    if (!course) return;

    updateState((draft) => {
      // Check if this lesson has already been assigned to this class
      const exists = draft.assignments.some(
        (a) => a.classId === classId && a.courseId === courseId
      );
      if (exists) {
        showToast("Bu ders zaten bu sınıfa atanmış!", "error");
        return;
      }

      const id = "as_" + Date.now();
      
      // Determine preferred block size from placementMode or weeklyHours
      let blockSize = 2;
      if (course.placementMode && course.placementMode.includes("1")) {
        blockSize = 1;
      } else if (course.weeklyHours === 1) {
        blockSize = 1;
      }

      const item: LessonAssignment = {
        id,
        classId,
        courseId,
        teacherId: "", // Öğretmen daha sonra atanacak
        weeklyHours: course.weeklyHours,
        classroomId: null,
        preferredBlockSize: blockSize
      };
      draft.assignments.push(item);
      const className = draft.classes.find((c) => c.id === classId)?.name || "Seçili Sınıf";
      showToast(`"${course.name}" dersi "${className}" sınıfına başarıyla atandı.`, "success");
    });
  };

  const handleAssignTeacherToClassCourse = (assignmentId: string, teacherId: string) => {
    updateState((draft) => {
      const assignment = draft.assignments.find((a) => a.id === assignmentId);
      if (assignment) {
        let finalTeacherId = "";
        if (!teacherId) {
          finalTeacherId = "";
        } else {
          const currentIds = assignment.teacherId ? assignment.teacherId.split(",").filter(Boolean) : [];
          if (currentIds.includes(teacherId)) {
            // Remove if already assigned
            const filteredIds = currentIds.filter(id => id !== teacherId);
            finalTeacherId = filteredIds.join(",");
          } else {
            // Add if not already assigned
            currentIds.push(teacherId);
            finalTeacherId = currentIds.join(",");
          }
        }

        assignment.teacherId = finalTeacherId;

        // Also update any schedule slots using this assignment to the new teacher!
        Object.keys(draft.schedule).forEach((cId) => {
          const classSchedules = draft.schedule[cId];
          Object.keys(classSchedules).forEach((dIdxStr) => {
            const dIdx = parseInt(dIdxStr);
            const periods = classSchedules[dIdx] || [];
            for (let p = 0; p < periods.length; p++) {
              if (periods[p]?.assignmentId === assignmentId) {
                periods[p].teacherId = finalTeacherId;
              }
            }
          });
        });

        const teacherNames = finalTeacherId ? finalTeacherId.split(",").map(id => draft.teachers.find((t) => t.id === id)?.name).filter(Boolean).join(", ") : "Hiçbiri";
        const className = draft.classes.find((c) => c.id === assignment.classId)?.name || "Sınıf";
        const courseName = draft.courses.find((c) => c.id === assignment.courseId)?.name || "Ders";
        showToast(`${className} sınıfının ${courseName} dersine öğretmen(ler) atandı: ${teacherNames}`, "success");
      }
    });
  };

  const handleRemoveTeacherFromAssignment = (assignmentId: string, teacherIdToRemove: string) => {
    updateState((draft) => {
      const assignment = draft.assignments.find((a) => a.id === assignmentId);
      if (assignment && assignment.teacherId) {
        const currentIds = assignment.teacherId.split(",").filter(Boolean);
        const filteredIds = currentIds.filter(id => id !== teacherIdToRemove);
        const finalTeacherId = filteredIds.join(",");
        assignment.teacherId = finalTeacherId;

        // Also update any schedule slots using this assignment
        Object.keys(draft.schedule).forEach((cId) => {
          const classSchedules = draft.schedule[cId];
          Object.keys(classSchedules).forEach((dIdxStr) => {
            const dIdx = parseInt(dIdxStr);
            const periods = classSchedules[dIdx] || [];
            for (let p = 0; p < periods.length; p++) {
              if (periods[p]?.assignmentId === assignmentId) {
                periods[p].teacherId = finalTeacherId;
              }
            }
          });
        });
      }
    });
    showToast("Öğretmen ataması kaldırıldı.", "info");
  };

  const handleCopyClassAssignments = (sourceClassId: string, targetClassId: string) => {
    if (!sourceClassId || !targetClassId) {
      showToast("Lütfen hem kaynak sınıfı hem de hedef sınıfı seçin!", "error");
      return;
    }
    const sourceClass = state.classes.find(c => c.id === sourceClassId);
    const targetClass = state.classes.find(c => c.id === targetClassId);
    if (!sourceClass || !targetClass) return;

    const sourceAssigns = state.assignments.filter(a => a.classId === sourceClassId);
    if (sourceAssigns.length === 0) {
      showToast(`Kaynak sınıfın (${sourceClass.name}) atanmış herhangi bir dersi bulunmuyor!`, "error");
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: "Sınıf Derslerini Kopyala",
      message: `${sourceClass.name} sınıfının tüm dersleri (${sourceAssigns.length} ders) ${targetClass.name} sınıfına kopyalanacaktır. Bu sınıftaki tüm mevcut dersler silinecektir. Onaylıyor musunuz?`,
      isDangerous: true,
      confirmText: "Evet, Kopyala",
      action: () => {
        updateState((draft) => {
          // 1. Remove existing assignments for target class
          draft.assignments = draft.assignments.filter(a => a.classId !== targetClassId);

          // 2. Clear old schedule slots for target class if any
          if (draft.schedule[targetClassId]) {
            Object.keys(draft.schedule[targetClassId]).forEach((dayKey) => {
              const dIdx = parseInt(dayKey);
              if (draft.schedule[targetClassId][dIdx]) {
                draft.schedule[targetClassId][dIdx] = draft.schedule[targetClassId][dIdx].map(() => null);
              }
            });
          }

          // 3. Clone and add assignments
          sourceAssigns.forEach((a, index) => {
            const newId = "as_" + Date.now() + "_" + Math.floor(Math.random() * 1000) + "_" + index;
            draft.assignments.push({
              ...a,
              id: newId,
              classId: targetClassId
            });
          });
        });
        showToast(`${sourceClass.name} sınıfındaki tüm dersler başarıyla ${targetClass.name} sınıfına kopyalandı!`, "success");
        setConfirmModal(null);
      }
    });
  };

  // -------------------------------------------------------------
  // HANDLERS FOR MANUALLY ADJUSTING SCHEDULE CELLS
  // -------------------------------------------------------------
  const handleSelectCellForEditing = (dayIndex: number, periodIndex: number, classId: string) => {
    setEditingCell({ dayIndex, periodIndex, classId });
  };

  // Extracted and moved to ScheduleTab.tsx: const handleApplyManualCellAssignment =;

  // Extracted and moved to ScheduleTab.tsx: const getSlotAt =;

  // Extracted and moved to ScheduleTab.tsx: const toggleLessonLockAt =;

  // Extracted and moved to ScheduleTab.tsx: const toggleCellUnavailabilityAt =;

  // Extracted and moved to ScheduleTab.tsx: const handleNavigateToClassFromCell =;

  // Extracted and moved to ScheduleTab.tsx: const handleNavigateToTeacherFromCell =;

  // Extracted and moved to ScheduleTab.tsx: const handleSetCustomClosureAt =;

  // Extracted and moved to ScheduleTab.tsx: const handleSetCustomDistribution =;

  // -------------------------------------------------------------
  // EXPORT SCHEDULE HTML TEMPLATE (PRETTY PRINT PRINT GÖRÜNÜMÜ)
  // -------------------------------------------------------------
  const printPage = () => {
    window.print();
  };

  // Compute stats helper
  const totalWeeklyHours = state.assignments.reduce((sum, current) => sum + current.weeklyHours, 0);
  let totalScheduledHours = 0;
  Object.keys(state.schedule).forEach((cId) => {
    const classSchedules = state.schedule[cId];
    if (classSchedules) {
      Object.keys(classSchedules).forEach((dIdxStr) => {
        const dIdx = parseInt(dIdxStr);
        const periods = classSchedules[dIdx] || [];
        periods.forEach((p) => {
          if (p !== null) totalScheduledHours++;
        });
      });
    }
  });

  // Extracted and moved to ScheduleTab.tsx: const getTeacherPlacedHours =;

  // Extracted and moved to ScheduleTab.tsx: const getClassPlacedHours =;

  // Extracted and moved to ScheduleTab.tsx: const getClassroomPlacedHours =;

  if (userLoading) {
    return (
      <div className="min-h-screen bg-[#070F22] flex flex-col justify-center items-center select-none">
        <div className="relative w-16 h-16 mb-4 flex items-center justify-center">
          <div className="absolute inset-0 border-2 border-slate-800 rounded-full"></div>
          <div className="absolute inset-0 border-2 border-t-cyan-400 rounded-full animate-spin"></div>
        </div>
        <p className="text-sm font-semibold tracking-widest text-slate-400 uppercase animate-pulse">
          DerSayar Yükleniyor...
        </p>
      </div>
    );
  }

  if (!user && !isGuestMode) {
    return (
      <Login
        onLoginSuccess={(usr) => {
          setUser(usr);
          setIsGuestMode(false);
        }}
        onContinueAsGuest={() => {
          setIsGuestMode(true);
          setShowGuestBanner(true);
        }}
      />
    );
  }

  return (
    <div id="school-scheduler" className="flex flex-col h-screen w-full bg-[#F1F5F9] text-slate-800 font-sans antialiased overflow-hidden">
      
      {/* -------------------------------------------------------------
          1. HEADER (CONTROL BAR)
         ------------------------------------------------------------- */}
      <header className="h-14 bg-[#0F172A] border-b border-slate-800/40 px-3 flex items-center justify-between shadow-md shrink-0 z-10">
        <div className="flex items-center space-x-2 select-none">
          {/* Beautiful and professional scheduler/timetable icon */}
          <div className="p-1.5 bg-gradient-to-tr from-blue-700 to-indigo-500 rounded-lg shadow-md shadow-blue-950/30 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M19 4H5C3.89543 4 3 4.89543 3 6V20C3 21.1046 3.89543 22 5 22H19C20.1046 22 21 21.1046 21 20V6C21 4.89543 20.1046 4 19 4Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M16 2V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M8 2V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 10H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <rect x="6" y="13" width="3" height="3" rx="0.5" fill="currentColor" opacity="0.9" />
              <rect x="10.5" y="13" width="3" height="3" rx="0.5" fill="currentColor" opacity="0.9" />
              <rect x="15" y="13" width="3" height="3" rx="0.5" fill="currentColor" opacity="0.4" />
              <rect x="6" y="17.5" width="3" height="3" rx="0.5" fill="currentColor" opacity="0.4" />
              <rect x="10.5" y="17.5" width="3" height="3" rx="0.5" fill="currentColor" opacity="0.9" />
              <rect x="15" y="17.5" width="3" height="3" rx="0.5" fill="currentColor" opacity="0.9" />
            </svg>
          </div>
          
          {/* Brand Name */}
          <div className="flex items-center text-lg tracking-tight">
            <span className="font-light text-white">Der</span>
            <span className="font-bold text-[#3B82F6]">Sayar</span>
          </div>
          
          <div className="h-6 w-px bg-slate-800/80 mx-1.5"></div>
          
          {/* Active School Block with Subtitle */}
          <div className="flex flex-col justify-center">
            <span className="text-[9px] font-extrabold text-[#3B82F6] uppercase tracking-widest block leading-none">AKTİF OKUL</span>
            <span className="text-xs font-bold text-white uppercase tracking-tight mt-0.5 leading-none">
              {state.settings.schoolName || "YENİ OKUL"}
            </span>
          </div>
        </div>

        {/* Right side controls: Undo, Redo, Sync statuses */}
        <div className="flex items-center space-x-3">
          
          {/* Geri Al / Yenile (Undo/Redo) */}
          <div className="flex items-center bg-slate-900/50 p-0.5 rounded-lg border border-slate-700/60 shadow-sm">
            <button
              onClick={undo}
              disabled={historyState.past.length === 0}
              title="Geri Al"
              className={`p-1.5 rounded transition-all ${
                historyState.past.length > 0
                  ? "text-white hover:bg-slate-800 hover:text-cyan-400 hover:shadow-sm cursor-pointer"
                  : "text-slate-600 cursor-not-allowed"
              }`}
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <div className="h-4 w-px bg-slate-700/60 mx-1"></div>
            <button
              onClick={redo}
              disabled={historyState.future.length === 0}
              title="Yenile (İleri Al)"
              className={`p-1.5 rounded transition-all ${
                historyState.future.length > 0
                  ? "text-white hover:bg-slate-800 hover:text-cyan-400 hover:shadow-sm cursor-pointer"
                  : "text-slate-600 cursor-not-allowed"
              }`}
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Sync warning and pulsing button */}
          <div className="flex flex-col items-end">
            {!isSynced ? (
              <>
                <button
                  onClick={saveToCloud}
                  className="flex items-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white px-2.5 py-1 rounded-full text-[10px] font-bold shadow-lg shadow-rose-950/40 ring-1 ring-rose-400/50 transition-all cursor-pointer"
                >
                  <div className="w-1.5 h-1.5 bg-white rounded-full animate-ping shrink-0"></div>
                  <span>KAYDET</span>
                </button>
              </>
            ) : (
              <div className="flex items-center gap-1.5 bg-emerald-950/40 text-emerald-300 border border-emerald-800/60 px-2.5 py-1 rounded-full text-[10px] font-bold shadow-sm">
                <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full shrink-0 animate-pulse"></div>
                <span>Senkronize</span>
              </div>
            )}
          </div>

          {/* User Profile info */}
          {user && (
            <div className="flex items-center gap-1.5 border-r border-slate-800 pr-3 mr-0.5">
              <div className="w-7 h-7 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center text-[10px] font-bold text-white shadow-md">
                {user.email?.substring(0, 2).toUpperCase() || "DS"}
              </div>
              <div className="hidden md:flex flex-col text-left">
                <span className="text-[10px] font-bold text-white leading-tight">Yönetici</span>
              </div>
            </div>
          )}

          {/* Güvenli Çıkış */}
          <button
            onClick={async () => {
              if (isGuestMode) {
                setIsGuestMode(false);
                setUser(null);
                showToast("Misafir modundan çıkış yapıldı.", "info");
                return;
              }

              if (!isSynced) {
                setShowUnsavedLogoutModal(true);
              } else {
                try {
                  setIsSavingAndExiting(true);
                  await saveToCloud();
                  const { signOut } = await import("firebase/auth");
                  await signOut(auth!);
                  showToast("Güvenli çıkış yapıldı.", "success");
                } catch (error) {
                  console.error("Signout error:", error);
                  showToast("Çıkış yapılırken bir hata oluştu.", "error");
                } finally {
                  setIsSavingAndExiting(false);
                }
              }
            }}
            className="flex items-center space-x-1.5 text-rose-300 hover:text-white hover:bg-rose-950/40 hover:border-rose-800 border border-slate-700 px-2.5 py-1 rounded-xl text-[10px] font-bold transition shadow-sm cursor-pointer"
            title="Sistemden Güvenli Çıkış"
          >
            {isSavingAndExiting ? (
              <div className="w-3 h-3 border-2 border-rose-400 border-t-transparent rounded-full animate-spin shrink-0"></div>
            ) : (
              <LogOut className="w-3.5 h-3.5 shrink-0 text-rose-400" />
            )}
            <span>{isSavingAndExiting ? "Çıkış..." : "Çıkış"}</span>
          </button>
        </div>
      </header>

      {isGuestMode && showGuestBanner && (
        <div className="relative bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 px-4 pr-10 py-1.5 flex flex-wrap items-center justify-between gap-2 text-white shadow-md shrink-0 z-20 text-[11px] font-semibold select-none">
          <div className="flex items-center space-x-2">
            <span className="text-sm">⚠️</span>
            <span>
              <strong>Görüntüleme Modu (Salt Okunur):</strong> Programı yerel hafızadan görüntülüyorsunuz. Programda düzenleme yapmak, kaydetmek ve tüm özellikleri kullanabilmek için lütfen Yönetici Girişi yapın.
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="file"
              id="guest-import-backup"
              accept=".json"
              className="hidden"
              onChange={handleImportBackup}
            />
            <button
              onClick={() => document.getElementById("guest-import-backup")?.click()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-lg text-[10px] font-bold transition-all duration-150 cursor-pointer shadow-sm"
              title="Yedek Yükle"
            >
              Bu Modda daha önce bilgisayara yüklediğiniz yedeği çekebilir ve programınıza kayıt olmadan bakabilirsiniz. Bunun için tıklayınız
            </button>
            <button
              onClick={async () => {
                if (deferredPrompt) {
                  deferredPrompt.prompt();
                  const { outcome } = await deferredPrompt.userChoice;
                  if (outcome === "accepted") {
                    setDeferredPrompt(null);
                  }
                } else {
                  showToast("Uygulamayı bilgisayarınıza veya telefonunuza indirmek (PWA) için tarayıcınızın adres çubuğundaki 'Yükle' (Ekran simgesi veya artı simgesi) butonunu kullanabilirsiniz. Bu işlem uygulamayı internet bağlantısı olmadan (çevrimdışı) açıp kullanmanızı sağlar.", "info");
                }
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded-lg text-[10px] font-bold transition-all duration-150 cursor-pointer shadow-sm flex items-center space-x-1"
              title="Uygulamayı Çevrimdışı Kullanmak İçin Cihaza İndir / Yükle"
            >
              <span>📥 UYGULAMAYI İNDİR (ÇEVRİMDIŞI)</span>
            </button>
            <button
              onClick={() => {
                setIsGuestMode(false);
                setUser(null);
              }}
              className="bg-white hover:bg-slate-100 text-orange-600 px-3 py-1 rounded-lg text-[10px] font-extrabold transition-all duration-150 cursor-pointer shadow-sm hover:scale-[1.02]"
            >
              YÖNETİCİ GİRİŞİ YAP
            </button>
          </div>
          <button
            onClick={() => setShowGuestBanner(false)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white hover:text-amber-200 transition font-black text-sm cursor-pointer p-1"
            title="Kapat"
          >
            ✕
          </button>
        </div>
      )}

      {/* -------------------------------------------------------------
          MAIN COMPONENT BODY (SIDEBAR + ACTIVE VIEWPORT)
         ------------------------------------------------------------- */}
      <div id="scheduler-body" className="flex flex-1 overflow-hidden">
        
        {/* -------------------------------------------------------------
            2. SIDEBAR NAVIGATION
           ------------------------------------------------------------- */}
        <aside className={`${isSidebarOpen ? "w-64" : "w-16"} bg-[#0F172A] text-slate-300 flex flex-col justify-between shrink-0 transition-all duration-300 ease-in-out border-r border-slate-800/40 overflow-hidden`}>
          
          {/* Sidebar Menu Items */}
          <nav className={`${isSidebarOpen ? "p-4" : "p-2"} space-y-1 overflow-y-auto overflow-x-hidden`}>
            
            {/* Header section with toggle button */}
            <div className={`flex items-center ${isSidebarOpen ? "justify-between" : "justify-center"} px-2 py-3 border-b border-slate-800/40 mb-3`}>
              {isSidebarOpen && (
                <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest px-1">
                  MENÜLER
                </span>
              )}
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer text-slate-400 hover:text-white focus:outline-none"
                title={isSidebarOpen ? "Menüyü Küçült" : "Menüyü Genişlet"}
              >
                <Menu className="w-4 h-4 shrink-0" />
              </button>
            </div>
            
            <button
              onClick={() => setActiveTab("school")}
              title="Ayarlar"
              className={`w-full flex items-center ${isSidebarOpen ? "justify-start space-x-3 px-4" : "justify-center px-0"} py-3 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer ${
                activeTab === "school"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-950/30 font-semibold"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
              }`}
            >
              <Settings className="w-4 h-4 shrink-0" />
              {isSidebarOpen && <span className="text-left leading-tight whitespace-normal break-words flex-1 text-sm font-medium">Ayarlar</span>}
            </button>

            <button
              onClick={() => setActiveTab("courses")}
              title="Dersler"
              className={`w-full flex items-center ${isSidebarOpen ? "justify-start space-x-3 px-4" : "justify-center px-0"} py-3 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer ${
                activeTab === "courses"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-950/30 font-semibold"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
              }`}
            >
              <BookOpen className="w-4 h-4 shrink-0" />
              {isSidebarOpen && <span className="text-left leading-tight whitespace-normal break-words flex-1 text-sm font-medium">Dersler</span>}
            </button>

            <button
              onClick={() => setActiveTab("classrooms")}
              title="Atölyeler"
              className={`w-full flex items-center ${isSidebarOpen ? "justify-start space-x-3 px-4" : "justify-center px-0"} py-3 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer ${
                activeTab === "classrooms"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-950/30 font-semibold"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
              }`}
            >
              <Wrench className="w-4 h-4 shrink-0" />
              {isSidebarOpen && <span className="text-left leading-tight whitespace-normal break-words flex-1 text-sm font-medium">Atölyeler</span>}
            </button>

            <button
              onClick={() => setActiveTab("classes")}
              title="Sınıflar"
              className={`w-full flex items-center ${isSidebarOpen ? "justify-start space-x-3 px-4" : "justify-center px-0"} py-3 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer ${
                activeTab === "classes"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-950/30 font-semibold"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
              }`}
            >
              <Layers className="w-4 h-4 shrink-0" />
              {isSidebarOpen && <span className="text-left leading-tight whitespace-normal break-words flex-1 text-sm font-medium">Sınıflar</span>}
            </button>

            <button
              onClick={() => setActiveTab("teachers")}
              title="Öğretmenler"
              className={`w-full flex items-center ${isSidebarOpen ? "justify-start space-x-3 px-4" : "justify-center px-0"} py-3 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer ${
                activeTab === "teachers"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-950/30 font-semibold"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
              }`}
            >
              <Users className="w-4 h-4 shrink-0" />
              {isSidebarOpen && <span className="text-left leading-tight whitespace-normal break-words flex-1 text-sm font-medium">Öğretmenler</span>}
            </button>

            <button
              onClick={() => {
                setActiveTab("assignments");
                if (state.classes.length > 0 && !selectedClassId) {
                  setSelectedClassId(state.classes[0].id);
                }
              }}
              title="Sınıflarda Okutulan Dersler"
              className={`w-full flex items-center ${isSidebarOpen ? "justify-start space-x-3 px-4" : "justify-center px-0"} py-3 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer ${
                activeTab === "assignments"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-950/30 font-semibold"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
              }`}
            >
              <GitCommit className="w-4 h-4 shrink-0" />
              {isSidebarOpen && <span className="text-left leading-tight whitespace-normal break-words flex-1 text-sm font-medium">Sınıflarda Okutulan Dersler</span>}
            </button>

            <button
              onClick={() => {
                setActiveTab("teacher_assignments");
                if (state.teachers.length > 0 && !assignmentTabTeacherId) {
                  setAssignmentTabTeacherId(state.teachers[0].id);
                }
                if (state.courses.length > 0 && !assignmentTabCourseId) {
                  setAssignmentTabCourseId(state.courses[0].id);
                }
              }}
              title="Öğretmenlere Ders Ataması"
              className={`w-full flex items-center ${isSidebarOpen ? "justify-start space-x-3 px-4" : "justify-center px-0"} py-3 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer ${
                activeTab === "teacher_assignments"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-950/30 font-semibold"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
              }`}
            >
              <UserCheck className="w-4 h-4 shrink-0" />
              {isSidebarOpen && <span className="text-left leading-tight whitespace-normal break-words flex-1 text-sm font-medium">Öğretmenlere Ders Ataması</span>}
            </button>

            <button
              onClick={() => {
                setActiveTab("schedule");
                setScheduleViewMode("teacher");
              }}
              title="Ders Programı"
              className={`w-full flex items-center ${isSidebarOpen ? "justify-start space-x-3 px-4" : "justify-center px-0"} py-3 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer ${
                activeTab === "schedule"
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-950/30 font-bold"
                  : "text-emerald-400 hover:bg-slate-800/60 hover:text-emerald-300"
              }`}
            >
              <CalendarDays className={`w-4 h-4 shrink-0 ${activeTab === "schedule" ? "text-white" : "text-emerald-400"}`} />
              {isSidebarOpen && (
                <span className="text-left leading-tight whitespace-normal break-words flex-1 text-sm font-semibold">
                  Ders Programı
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("realtime_status")}
              title="Anlık Durum"
              className={`w-full flex items-center ${isSidebarOpen ? "justify-start space-x-3 px-4" : "justify-center px-0"} py-3 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer ${
                activeTab === "realtime_status"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-950/30 font-semibold"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
              }`}
            >
              <Activity className="w-4 h-4 shrink-0" />
              {isSidebarOpen && <span className="text-left leading-tight whitespace-normal break-words flex-1 text-sm font-medium">Anlık Durum</span>}
            </button>

            <button
              onClick={() => setActiveTab("print")}
              title="Yazdır / İndir"
              className={`w-full flex items-center ${isSidebarOpen ? "justify-start space-x-3 px-4" : "justify-center px-0"} py-3 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer ${
                activeTab === "print"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-950/30 font-semibold"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
              }`}
            >
              <Printer className="w-4 h-4 shrink-0" />
              {isSidebarOpen && <span className="text-left leading-tight whitespace-normal break-words flex-1 text-sm font-medium">Yazdır / İndir</span>}
            </button>

            <button
              onClick={() => setActiveTab("backup_delete")}
              title="Yedekle / Sil"
              className={`w-full flex items-center ${isSidebarOpen ? "justify-start space-x-3 px-4" : "justify-center px-0"} py-3 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer ${
                activeTab === "backup_delete"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-950/30 font-semibold"
                  : "text-slate-400 hover:bg-[#1E293B] hover:text-white"
              }`}
            >
              <Database className="w-4 h-4 shrink-0" />
              {isSidebarOpen && <span className="text-left leading-tight whitespace-normal break-words flex-1 text-sm font-medium">Yedekle / Sil</span>}
            </button>

          </nav>
        </aside>

        {/* -------------------------------------------------------------
            3. MAIN ACTIVE VIEWPORT
           ------------------------------------------------------------- */}
        <main id="scheduler-main" className="flex-1 flex flex-col min-w-0 bg-[#F1F5F9] overflow-hidden relative">
          
          {/* Toast Notification popover */}
          <AnimatePresence>
            {toast && (
              <motion.div
                initial={{ opacity: 0, y: -20, x: "-50%" }}
                animate={{ opacity: 1, y: 0, x: "-50%" }}
                exit={{ opacity: 0, y: -20, x: "-50%" }}
                className={`fixed top-24 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-2xl flex items-center space-x-2 text-sm font-semibold border ${
                  toast.type === "success"
                    ? "bg-white text-emerald-800 border-emerald-100 shadow-emerald-100/40"
                    : toast.type === "error"
                    ? "bg-white text-rose-800 border-rose-100 shadow-rose-100/40"
                    : "bg-white text-blue-800 border-blue-100 shadow-blue-100/40"
                }`}
              >
                {toast.type === "success" && <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-500" />}
                {toast.type === "error" && <AlertTriangle className="w-5 h-5 shrink-0 text-rose-500" />}
                {toast.type === "info" && <Info className="w-5 h-5 shrink-0 text-blue-500" />}
                <span>{toast.message}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Render Active View Container */}
          <div id="active-tab-container" className="flex-1 flex flex-col min-h-0 p-1.5 overflow-y-auto">
            
            {/* -------------------------------------------------------------
                BACKUP & DELETE TAB (YEDEKLE VE SİL SEKMESİ)
               ------------------------------------------------------------- */}
            {activeTab === "backup_delete" && (
              <BackupDeleteTab />
            )}

            {/* -------------------------------------------------------------
                A. OKUL BİLGİLERİ (SCHOOL SETTINGS TAB)
               ------------------------------------------------------------- */}
            {activeTab === "school" && (
              <SchoolSettingsTab
                state={state}
                handleUpdateSchoolName={handleUpdateSchoolName}
                handleUpdatePrincipalName={handleUpdatePrincipalName}
                handleToggleDay={handleToggleDay}
                handleUpdatePeriodsCount={handleUpdatePeriodsCount}
                handleUpdateLunchBreakAfter={handleUpdateLunchBreakAfter}
                handleUpdateLunchBreakDuration={handleUpdateLunchBreakDuration}
                handleUpdatePeriodTime={handleUpdatePeriodTime}
              />
            )}

            {/* -------------------------------------------------------------
                B. ÖĞRETMENLER (TEACHERS TAB)
               ------------------------------------------------------------- */}
            {activeTab === "teachers" && (
              <TeachersTab />
            )}

            {/* -------------------------------------------------------------
                C. SINIFLAR (CLASSES TAB)
               ------------------------------------------------------------- */}
            {activeTab === "classes" && (
              <ClassesTab />
            )}

            {/* -------------------------------------------------------------
                D. ATÖLYE & DERSLİKLER (WORKSHOPS TAB)
               ------------------------------------------------------------- */}
            {activeTab === "classrooms" && (
              <ClassroomsTab />
            )}

            {/* -------------------------------------------------------------
                E. DERS TANIMLARI (COURSE DEFINITIONS TAB)
               ------------------------------------------------------------- */}
            {activeTab === "courses" && (
              <CoursesTab />
            )}

            {/* -------------------------------------------------------------
                F. DERS DAĞITIMI (LESSON ASSIGNMENTS TAB)
               ------------------------------------------------------------- */}
            {activeTab === "assignments" && (
              <AssignmentsTab />
            )}

            {/* -------------------------------------------------------------
                H. ÖĞRETMENLERE DERS ATAMASI (TEACHER ASSIGNMENT DASHBOARD)
               ------------------------------------------------------------- */}
            {activeTab === "teacher_assignments" && (
              <TeacherAssignmentsTab />
            )}

            {/* -------------------------------------------------------------
                H. ANLIK DURUM (REAL-TIME STATUS TAB)
               ------------------------------------------------------------- */}
            {activeTab === "realtime_status" && (
              <RealtimeStatusTab />
            )}

            {/* -------------------------------------------------------------
                PRINT & REPORTING CENTER VIEW (YAZDIR / İNDİR TAB)
               ------------------------------------------------------------- */}
            {activeTab === "print" && (
              <PrintTab
                printSearchTeacher={printSearchTeacher}
                setPrintSearchTeacher={setPrintSearchTeacher}
                printSearchClass={printSearchClass}
                setPrintSearchClass={setPrintSearchClass}
                printSearchClassroom={printSearchClassroom}
                setPrintSearchClassroom={setPrintSearchClassroom}
                selectedPrintTeachers={selectedPrintTeachers}
                setSelectedPrintTeachers={setSelectedPrintTeachers}
                selectedPrintClasses={selectedPrintClasses}
                setSelectedPrintClasses={setSelectedPrintClasses}
                selectedPrintClassrooms={selectedPrintClassrooms}
                setSelectedPrintClassrooms={setSelectedPrintClassrooms}
                printDocNo={printDocNo}
                setPrintDocNo={setPrintDocNo}
                printDocSubject={printDocSubject}
                setPrintDocSubject={setPrintDocSubject}
                setActivePrintJob={setActivePrintJob}
              />
            )}

            {/* -------------------------------------------------------------
                G. DERS PROGRAMI OLUŞTURUCU (TIMETABLE GENERATOR TAB - MAIN MENU)
               ------------------------------------------------------------- */}
            {activeTab === "schedule" && (
              <ScheduleTab
                getTeacherWeeklySchedule={getTeacherWeeklySchedule}
                getClassWeeklySchedule={getClassWeeklySchedule}
                getClassroomWeeklySchedule={getClassroomWeeklySchedule}
                optimizeGapsForTeacher={optimizeGapsForTeacher}
                optimizeGapsForAllTeachers={optimizeGapsForAllTeachers}
                removeSingleLessonDays={removeSingleLessonDays}
                removeSingleLessonDaysForTeacher={removeSingleLessonDaysForTeacher}
                handleClearSchedule={handleClearSchedule}
                handleClearAllTeachersSchedule={handleClearAllTeachersSchedule}
                handleClearTeacherLessons={handleClearTeacherLessons}
              />
            )}
          </div> {/* Close #active-tab-container */}

          {/* -------------------------------------------------------------
              PRINT ENGINE CONTAINER (ONLY VISIBLE IN BROWSER PRINT DIALOG)
             ------------------------------------------------------------- */}
          <div id="print-section">
            {activePrintJob && (() => {
              const { type, ids } = activePrintJob;
              const numDays = state.settings.days.length;
              const numPeriods = state.settings.periodsPerDay;

              // Helper to get day name
              const getDayName = (dIdx: number) => state.settings.days[dIdx] || "";

              const getAbbreviatedTeacherName = (name: string) => {
                if (!name) return "";
                const parts = name.trim().split(/\s+/);
                if (parts.length <= 1) return name;
                const lastName = parts[parts.length - 1];
                const initials = parts.slice(0, -1).map(p => p[0].toUpperCase() + ".").join(" ");
                return `${initials} ${lastName}`;
              };

              // Render individual Portrait A4 page for teacher(s)
              if (type.startsWith("teacher") && !type.includes("carsaf")) {
                return ids.map((tId) => {
                  const teacher = state.teachers.find(t => t.id === tId);
                  if (!teacher) return null;

                  // Build teacher weekly schedule matrix
                  const grid = getTeacherWeeklySchedule(tId);

                  return (
                    <div key={tId} className="print-page flex flex-col justify-between" style={{ minHeight: "240mm" }}>
                      <div>
                        {/* Official header */}
                        <div className="official-header uppercase">
                          <div>T.C.</div>
                          <div className="mt-1">{state.settings.schoolName || "OKUL ADI BELİRTİLMEDİ"}</div>
                          <div className="text-xs font-semibold mt-2 tracking-wide text-slate-600">HAFTALIK DERS PROGRAMI TEBLİĞ BELGESİ</div>
                        </div>

                        {/* Official Meta Info */}
                        <div className="official-meta flex justify-between border-b border-slate-300 pb-2 mb-4 font-mono text-xs">
                          <div className="space-y-1">
                            <div><strong>Sayı:</strong> {printDocNo || "Belirtilmedi"}</div>
                            <div><strong>Konu:</strong> {printDocSubject || "Belirtilmedi"}</div>
                          </div>
                          <div className="text-right">
                            <div><strong>Tarih:</strong> {state.settings.effectiveDate ? new Date(state.settings.effectiveDate).toLocaleDateString('tr-TR') : getFormattedDate()}</div>
                            <div><strong>Tebliğ Edilen:</strong> {teacher.name}</div>
                          </div>
                        </div>

                        {/* Short Sade Resmi Tebliğ Yazısı */}
                        <div className="official-text mt-4 text-justify">
                          Sayın <strong>{teacher.name}</strong> ({teacher.branch || "Öğretmen"}),
                          <br /><br />
                          {state.settings.effectiveDate ? <strong>{new Date(state.settings.effectiveDate).toLocaleDateString('tr-TR')}</strong> : "Belirtilen"} tarihinden itibaren geçerli olmak üzere ders yükünüz ve haftalık ders programınız aşağıda belirtilmiştir. Bilgilerinizi, tebliğ edilen program doğrultusunda ders görevlerinizi yerine getirmenizi ve gereğini tebliğen rica ederim.
                        </div>

                        {/* Schedule Table */}
                        <table className="print-table">
                          <thead>
                            <tr>
                              <th style={{ width: "14%" }}>Ders Saati</th>
                              {state.settings.days.map((day, dIdx) => (
                                <th key={dIdx} style={{ width: `${86 / numDays}%` }}>{day}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {Array.from({ length: numPeriods }).map((_, pIdx) => {
                              const periodTime = state.settings.periodTimes?.[pIdx];
                              const timeStr = periodTime ? `${periodTime.start} - ${periodTime.end}` : "";
                              return (
                                <tr key={pIdx}>
                                  <td className="font-bold">
                                    <div className="font-black">{pIdx + 1}. Ders</div>
                                    <div className="text-[8px] font-medium text-slate-500">{timeStr}</div>
                                  </td>
                                  {state.settings.days.map((_, dIdx) => {
                                    const teacherSlots = grid[dIdx][pIdx]; // Array of { slot, classId }
                                    const isLocked = teacher.unavailability?.[dIdx]?.[pIdx];
                                    const closureName = teacher.closureNames?.[dIdx]?.[pIdx] || "";
                                    const isSpecialClosure = !!(closureName && closureName.trim() !== "" && closureName.trim().toUpperCase() !== "KAPALI");

                                    if (isLocked) {
                                      if (isSpecialClosure) {
                                        return (
                                          <td key={dIdx} className="bg-amber-50/60 p-1 text-center font-extrabold text-[8.5px] text-amber-800 uppercase border border-slate-300">
                                            {closureName}
                                          </td>
                                        );
                                      }
                                      return (
                                        <td key={dIdx}></td>
                                      );
                                    }

                                    if (!teacherSlots || teacherSlots.length === 0) {
                                      return <td key={dIdx}></td>;
                                    }

                                    return (
                                      <td key={dIdx} className="p-1">
                                        {teacherSlots.map((ts, index) => {
                                          const course = coursesMap.get(ts.slot.courseId);
                                          const classObj = classesMap.get(ts.classId);
                                          const roomObj = ts.slot.classroomId ? classroomsMap.get(ts.slot.classroomId) : null;
                                          return (
                                            <div key={index} className="leading-tight py-0.5">
                                              <div className="font-extrabold text-slate-900 text-[9px] uppercase leading-tight">{classObj?.name || "Sınıf"}</div>
                                              <div className="font-bold text-blue-700 text-[8px] mt-0.5 leading-tight">{course?.code || course?.name || "Ders"}</div>
                                              {roomObj && (
                                                <div className="text-[7.5px] font-medium text-purple-600 mt-0.5 leading-tight">🛠️ {roomObj.shortName || roomObj.name}</div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>

                        {/* Teacher Course/Class Table Summary */}
                        {(() => {
                          const teacherAssignments = state.assignments.filter(a => {
                            if (!a.teacherId) return false;
                            return a.teacherId.split(",").map(id => id.trim()).includes(tId);
                          });

                          if (teacherAssignments.length === 0) return null;

                          return (
                            <div className="mt-5 border-t border-slate-300 pt-3">
                              <h4 className="text-[9px] font-black uppercase text-slate-800 tracking-wider mb-1.5 text-center">
                                GİRDİĞİ SINIFLAR VE HAFTALIK DERS SAATLERİ (HDS) İSTATİSTİKLERİ
                              </h4>
                              <table className="print-table" style={{ marginTop: "2px", width: "100%" }}>
                                <thead>
                                  <tr>
                                    <th style={{ width: "8%", fontSize: "8.5px", padding: "3px 2px" }}>S.No</th>
                                    <th style={{ width: "25%", fontSize: "8.5px", padding: "3px 2px", textAlign: "left" }}>Sınıf</th>
                                    <th style={{ width: "15%", fontSize: "8.5px", padding: "3px 2px" }}>Ders Kodu</th>
                                    <th style={{ width: "42%", fontSize: "8.5px", padding: "3px 2px", textAlign: "left" }}>Ders Adı</th>
                                    <th style={{ width: "10%", fontSize: "8.5px", padding: "3px 2px" }}>HDS</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {teacherAssignments.map((a, index) => {
                                    const course = coursesMap.get(a.courseId);
                                    const classObj = classesMap.get(a.classId);
                                    return (
                                      <tr key={a.id}>
                                        <td style={{ fontSize: "8px", padding: "2px" }}>{index + 1}</td>
                                        <td style={{ fontSize: "8px", padding: "2px", textAlign: "left" }} className="font-extrabold">{classObj?.name || "-"}</td>
                                        <td style={{ fontSize: "8px", padding: "2px" }} className="font-bold">{course?.code || "-"}</td>
                                        <td style={{ fontSize: "8px", padding: "2px", textAlign: "left" }}>{course?.name || "-"}</td>
                                        <td style={{ fontSize: "8px", padding: "2px" }} className="font-bold">{a.weeklyHours}</td>
                                      </tr>
                                    );
                                  })}
                                  {/* Total HDS row */}
                                  <tr className="font-extrabold bg-slate-50">
                                    <td colSpan={4} style={{ textAlign: "right", fontSize: "8px", padding: "2px" }} className="pr-4 font-black">TOPLAM HAFTALIK DERS SAATİ:</td>
                                    <td style={{ fontSize: "8px", padding: "2px" }} className="font-black">
                                      {teacherAssignments.reduce((acc, a) => acc + a.weeklyHours, 0)}
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Signature block with Tebliğ Eden & Tebellüğ Eden */}
                      <div className="mt-4 pt-3 border-t border-slate-300 w-full">
                        <div className="grid grid-cols-2 gap-4 text-center">
                          {/* Tebellüğ Eden (Left) */}
                          <div className="flex flex-col items-center">
                            <span className="text-[10px] font-extrabold text-slate-800 tracking-wider">TEBELLÜĞ EDEN</span>
                            <span className="text-[10px] font-bold text-slate-700 mt-1.5">{teacher.name}</span>
                            <span className="text-[9px] text-slate-500 font-semibold">{teacher.branch || "Öğretmen"}</span>
                            <span className="text-[8px] font-mono text-slate-400 mt-5 border-b border-dashed border-slate-300 w-28 pb-0.5">Tarih / İmza</span>
                          </div>

                          {/* Tebliğ Eden (Right) */}
                          <div className="flex flex-col items-center">
                            <span className="text-[10px] font-extrabold text-slate-800 tracking-wider">TEBLİĞ EDEN</span>
                            <span className="text-[10px] font-bold text-slate-700 mt-1.5">{state.settings.principalName || "Okul Müdürü"}</span>
                            <span className="text-[9px] text-slate-500 font-semibold">Okul Müdürü</span>
                            <span className="text-[8px] font-mono text-slate-400 mt-5 border-b border-dashed border-slate-300 w-28 pb-0.5">İmza</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                });
              }

              // Render individual Portrait A4 page for class(es)
              if (type.startsWith("class") && !type.startsWith("classroom") && !type.includes("carsaf")) {
                return ids.map((cId) => {
                  const classObj = state.classes.find(c => c.id === cId);
                  if (!classObj) return null;

                  // Build class weekly schedule matrix
                  const grid = getClassWeeklySchedule(cId);
                  
                  // Get assignments for this class
                  const classAssignments = state.assignments.filter(a => a.classId === cId);

                  return (
                    <div key={cId} className="print-page flex flex-col justify-between" style={{ minHeight: "240mm" }}>
                      <div>
                        {/* Official header */}
                        <div className="official-header uppercase">
                          <div>T.C.</div>
                          <div className="mt-1">{state.settings.schoolName || "OKUL ADI BELİRTİLMEDİ"}</div>
                          <div className="text-xs font-semibold mt-2 tracking-wide text-slate-600">SINIF HAFTALIK DERS PROGRAMI ÇIKTISI</div>
                        </div>

                        {/* Official Meta Info */}
                        <div className="official-meta flex justify-between border-b border-slate-300 pb-2 mb-4 font-mono text-xs">
                          <div>
                            <div><strong>Sınıf:</strong> {classObj.name}</div>
                          </div>
                          <div className="text-right">
                            <div><strong>Tarih:</strong> {state.settings.effectiveDate ? new Date(state.settings.effectiveDate).toLocaleDateString('tr-TR') : getFormattedDate()}</div>
                          </div>
                        </div>

                        {/* Schedule Table */}
                        <table className="print-table">
                          <thead>
                            <tr>
                              <th style={{ width: "14%" }}>Ders Saati</th>
                              {state.settings.days.map((day, dIdx) => (
                                <th key={dIdx} style={{ width: `${86 / numDays}%` }}>{day}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {Array.from({ length: numPeriods }).map((_, pIdx) => {
                              const periodTime = state.settings.periodTimes?.[pIdx];
                              const timeStr = periodTime ? `${periodTime.start} - ${periodTime.end}` : "";
                              return (
                                <tr key={pIdx}>
                                  <td className="font-bold">
                                    <div className="font-black">{pIdx + 1}. Ders</div>
                                    <div className="text-[8px] font-medium text-slate-500">{timeStr}</div>
                                  </td>
                                  {state.settings.days.map((_, dIdx) => {
                                    const slot = grid[dIdx][pIdx];
                                    const isLocked = classObj.unavailability?.[dIdx]?.[pIdx];
                                    const closureName = classObj.closureNames?.[dIdx]?.[pIdx] || "";
                                    const isSpecialClosure = !!(closureName && closureName.trim() !== "" && closureName.trim().toUpperCase() !== "KAPALI");

                                    if (isLocked) {
                                      if (isSpecialClosure) {
                                        return (
                                          <td key={dIdx} className="bg-amber-50/60 p-1 text-center font-extrabold text-[8.5px] text-amber-800 uppercase border border-slate-300">
                                            {closureName}
                                          </td>
                                        );
                                      }
                                      return (
                                        <td key={dIdx}></td>
                                      );
                                    }

                                    if (!slot) {
                                      return <td key={dIdx}>-</td>;
                                    }

                                    const course = coursesMap.get(slot.courseId);
                                    const assignedTeachers = slot.teacherId ? slot.teacherId.split(",").map(id => teachersMap.get(id)).filter(Boolean) : [];
                                    const roomObj = slot.classroomId ? classroomsMap.get(slot.classroomId) : null;

                                    return (
                                      <td key={dIdx} className="p-1">
                                        <div className="font-extrabold text-slate-900 text-[9px] uppercase leading-tight">{course?.code || course?.name || "Ders"}</div>
                                        <div className="text-[8px] font-semibold text-slate-600 mt-0.5 leading-tight">
                                          {assignedTeachers.map(t => getAbbreviatedTeacherName(t?.name || "")).join(", ")}
                                        </div>
                                        {roomObj && (
                                          <div className="text-[7.5px] font-medium text-purple-600 mt-0.5 leading-tight">🛠 {roomObj.shortName || roomObj.name}</div>
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>

                        {/* Class Teacher/Course Table Summary */}
                        <div className="mt-5 border-t border-slate-300 pt-3">
                          <h4 className="text-[9px] font-black uppercase text-slate-800 tracking-wider mb-1.5 text-center">
                            DERSİ OKUTAN ÖĞRETMENLER VE HAFTALIK SAATLERİ (HDS)
                          </h4>
                          <table className="print-table" style={{ marginTop: "2px", width: "100%" }}>
                            <thead>
                              <tr>
                                <th style={{ width: "8%", fontSize: "8.5px", padding: "3px 2px" }}>S.No</th>
                                <th style={{ width: "15%", fontSize: "8.5px", padding: "3px 2px" }}>Ders Kodu</th>
                                <th style={{ width: "42%", fontSize: "8.5px", padding: "3px 2px", textAlign: "left" }}>Ders Adı</th>
                                <th style={{ width: "25%", fontSize: "8.5px", padding: "3px 2px", textAlign: "left" }}>Öğretmen</th>
                                <th style={{ width: "10%", fontSize: "8.5px", padding: "3px 2px" }}>HDS</th>
                              </tr>
                            </thead>
                            <tbody>
                              {classAssignments.map((a, index) => {
                                const course = coursesMap.get(a.courseId);
                                const assignedTeachers = a.teacherId ? a.teacherId.split(",").map(id => teachersMap.get(id)).filter(Boolean) : [];
                                const teacherNames = assignedTeachers.map(t => t ? t.name : "").join(", ");
                                return (
                                  <tr key={a.id}>
                                    <td style={{ fontSize: "8px", padding: "2px" }}>{index + 1}</td>
                                    <td style={{ fontSize: "8px", padding: "2px" }} className="font-extrabold">{course?.code || "-"}</td>
                                    <td style={{ fontSize: "8px", padding: "2px", textAlign: "left" }}>{course?.name || "-"}</td>
                                    <td style={{ fontSize: "8px", padding: "2px", textAlign: "left" }}>{teacherNames || "Atanmamış"}</td>
                                    <td style={{ fontSize: "8px", padding: "2px" }} className="font-bold">{a.weeklyHours}</td>
                                  </tr>
                                );
                              })}
                              {/* Total HDS row */}
                              <tr className="font-extrabold bg-slate-50">
                                <td colSpan={4} style={{ textAlign: "right", fontSize: "8px", padding: "2px" }} className="pr-4 font-black">TOPLAM HAFTALIK DERS SAATİ:</td>
                                <td style={{ fontSize: "8px", padding: "2px" }} className="font-black">
                                  {classAssignments.reduce((acc, a) => acc + a.weeklyHours, 0)}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Signature block */}
                      <div className="official-signature flex flex-col items-center">
                        <div className="text-sm font-semibold">{state.settings.principalName || "Okul Müdürü"}</div>
                        <div className="text-xs text-slate-500 mt-1">Okul Müdürü</div>
                      </div>
                    </div>
                  );
                });
              }

              // Render individual Portrait A4 page for classroom(s)
              if (type.startsWith("classroom") && !type.includes("carsaf")) {
                return ids.map((crId) => {
                  const classroom = state.classrooms.find(cr => cr.id === crId);
                  if (!classroom) return null;

                  // Build classroom weekly schedule matrix
                  const grid = getClassroomWeeklySchedule(crId);

                  return (
                    <div key={crId} className="print-page flex flex-col justify-between" style={{ minHeight: "240mm" }}>
                      <div>
                        {/* Official header */}
                        <div className="official-header uppercase">
                          <div>T.C.</div>
                          <div className="mt-1">{state.settings.schoolName || "OKUL ADI BELİRTİLMEDİ"}</div>
                          <div className="text-xs font-semibold mt-2 tracking-wide text-slate-600">ATÖLYE HAFTALIK KULLANIM VE DERS PROGRAMI</div>
                        </div>

                        {/* Official Meta Info */}
                        <div className="official-meta flex justify-between border-b border-slate-300 pb-2 mb-4 font-mono text-xs">
                          <div>
                            <div><strong>Atölye/Salon:</strong> {classroom.name} ({classroom.shortName || "Atölye"})</div>
                          </div>
                          <div className="text-right">
                            <div><strong>Tarih:</strong> {state.settings.effectiveDate ? new Date(state.settings.effectiveDate).toLocaleDateString('tr-TR') : getFormattedDate()}</div>
                          </div>
                        </div>

                        {/* Schedule Table */}
                        <table className="print-table">
                          <thead>
                            <tr>
                              <th style={{ width: "14%" }}>Ders Saati</th>
                              {state.settings.days.map((day, dIdx) => (
                                <th key={dIdx} style={{ width: `${86 / numDays}%` }}>{day}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {Array.from({ length: numPeriods }).map((_, pIdx) => {
                              const periodTime = state.settings.periodTimes?.[pIdx];
                              const timeStr = periodTime ? `${periodTime.start} - ${periodTime.end}` : "";
                              return (
                                <tr key={pIdx}>
                                  <td className="font-bold">
                                    <div className="font-black">{pIdx + 1}. Ders</div>
                                    <div className="text-[8px] font-medium text-slate-500">{timeStr}</div>
                                  </td>
                                  {state.settings.days.map((_, dIdx) => {
                                    const slots = grid[dIdx][pIdx]; // Array of { slot, classId }
                                    const isLocked = classroom.unavailability?.[dIdx]?.[pIdx];
                                    const closureName = classroom.closureNames?.[dIdx]?.[pIdx] || "";
                                    const isSpecialClosure = !!(closureName && closureName.trim() !== "" && closureName.trim().toUpperCase() !== "KAPALI");

                                    if (isLocked) {
                                      if (isSpecialClosure) {
                                        return (
                                          <td key={dIdx} className="bg-amber-50/60 p-1 text-center font-extrabold text-[8.5px] text-amber-800 uppercase border border-slate-300">
                                            {closureName}
                                          </td>
                                        );
                                      }
                                      return (
                                        <td key={dIdx}></td>
                                      );
                                    }

                                    if (!slots || slots.length === 0) {
                                      return <td key={dIdx}>-</td>;
                                    }

                                    return (
                                      <td key={dIdx} className="p-1">
                                        {slots.map((sObj, sIdx) => {
                                          const course = coursesMap.get(sObj.slot.courseId);
                                          const classObj = classesMap.get(sObj.classId);
                                          const assignedTeachers = sObj.slot.teacherId ? sObj.slot.teacherId.split(",").map(id => teachersMap.get(id)).filter(Boolean) : [];
                                          return (
                                            <div key={sIdx} className="leading-tight py-0.5">
                                              <div className="font-extrabold text-slate-900 text-[9px] uppercase leading-tight">{classObj?.name || "Sınıf"}</div>
                                              <div className="font-bold text-blue-700 text-[8px] leading-tight mt-0.5">{course?.code || course?.name || "Ders"}</div>
                                              <div className="text-[7.5px] text-slate-600 mt-0.5 leading-tight">
                                                {assignedTeachers.map(t => getAbbreviatedTeacherName(t?.name || "")).join(", ")}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Signature block */}
                      <div className="official-signature flex flex-col items-center">
                        <div className="text-sm font-semibold">{state.settings.principalName || "Okul Müdürü"}</div>
                        <div className="text-xs text-slate-500 mt-1">Okul Müdürü</div>
                      </div>
                    </div>
                  );
                });
              }

              // Render Çarşaf (landscape) view for Teachers
              if (type === "teacher_carsaf") {
                return (
                  <div className="print-carsaf-page w-full">
                    <div className="official-header uppercase text-center mb-4">
                      <div className="text-base font-black">T.C.</div>
                      <div className="text-base font-black mt-1">{state.settings.schoolName || "OKUL ADI BELİRTİLMEDİ"}</div>
                      <div className="text-xs font-bold mt-1">ÖĞRETMENLER HAFTALIK DERS DAĞITIM PLANI ÇARŞAF LİSTESİ</div>
                    </div>
                    <div className="text-right text-[9px] font-mono mb-2">
                      <strong>Tarih:</strong> {state.settings.effectiveDate ? new Date(state.settings.effectiveDate).toLocaleDateString('tr-TR') : getFormattedDate()}
                    </div>
                    <table className="print-carsaf-table">
                      <thead>
                        <tr>
                          <th rowSpan={2} style={{ width: "12%" }}>Öğretmen / Branş</th>
                          {state.settings.days.map((day, dIdx) => (
                            <th key={dIdx} colSpan={numPeriods} className="bg-slate-100 font-bold text-[9px] uppercase border border-black">{day}</th>
                          ))}
                        </tr>
                        <tr>
                          {state.settings.days.map(() => 
                            Array.from({ length: numPeriods }).map((_, pIdx) => (
                              <th key={pIdx} className="font-extrabold text-[8px] bg-slate-50 border border-black">{pIdx + 1}</th>
                            ))
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {state.teachers.map((teacher) => {
                          const grid = getTeacherWeeklySchedule(teacher.id);
                          return (
                            <tr key={teacher.id}>
                              <td className="font-extrabold text-left px-1.5 text-[9px] border border-black">
                                <div className="font-black text-slate-900 leading-tight uppercase">{teacher.name}</div>
                                <div className="text-[7.5px] font-medium text-slate-500 mt-0.5">{teacher.branch || "-"}</div>
                              </td>
                              {state.settings.days.map((_, dIdx) => 
                                Array.from({ length: numPeriods }).map((_, pIdx) => {
                                  const slots = grid[dIdx][pIdx];
                                  const isLocked = teacher.unavailability?.[dIdx]?.[pIdx];
                                  const closureName = teacher.closureNames?.[dIdx]?.[pIdx] || "";
                                  const isSpecialClosure = !!(closureName && closureName.trim() !== "" && closureName.trim().toUpperCase() !== "KAPALI");

                                  if (isLocked) {
                                    if (isSpecialClosure) {
                                      return (
                                        <td key={pIdx} className="border border-black text-center font-extrabold text-[7.5px] bg-amber-50 text-amber-900 uppercase">
                                          {closureName}
                                        </td>
                                      );
                                    }
                                    return (
                                      <td key={pIdx} className="border border-black text-center"></td>
                                    );
                                  }

                                  if (!slots || slots.length === 0) {
                                    return <td key={pIdx} className="border border-black text-center">-</td>;
                                  }

                                  return (
                                    <td key={pIdx} className="border border-black text-center leading-tight px-0.5">
                                      {slots.map((ts, index) => {
                                        const classObj = classesMap.get(ts.classId);
                                        const course = coursesMap.get(ts.slot.courseId);
                                        return (
                                          <div key={index}>
                                            <span className="font-black text-slate-900 text-[8px]">{classObj?.name || "Sınıf"}</span>
                                            <span className="text-slate-500 text-[7px] font-semibold block">({course?.code || course?.name || "Drs"})</span>
                                          </div>
                                        );
                                      })}
                                    </td>
                                  );
                                })
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              }

              // Render Çarşaf (landscape) view for Classes
              if (type === "class_carsaf") {
                return (
                  <div className="print-carsaf-page w-full">
                    <div className="official-header uppercase text-center mb-4">
                      <div className="text-base font-black">T.C.</div>
                      <div className="text-base font-black mt-1">{state.settings.schoolName || "OKUL ADI BELİRTİLMEDİ"}</div>
                      <div className="text-xs font-bold mt-1">SINIFLAR HAFTALIK DERS DAĞITIM PLANI ÇARŞAF LİSTESİ</div>
                    </div>
                    <div className="text-right text-[9px] font-mono mb-2">
                      <strong>Tarih:</strong> {state.settings.effectiveDate ? new Date(state.settings.effectiveDate).toLocaleDateString('tr-TR') : getFormattedDate()}
                    </div>
                    <table className="print-carsaf-table">
                      <thead>
                        <tr>
                          <th rowSpan={2} style={{ width: "10%" }}>Sınıf</th>
                          {state.settings.days.map((day, dIdx) => (
                            <th key={dIdx} colSpan={numPeriods} className="bg-slate-100 font-bold text-[9px] uppercase border border-black">{day}</th>
                          ))}
                        </tr>
                        <tr>
                          {state.settings.days.map(() => 
                            Array.from({ length: numPeriods }).map((_, pIdx) => (
                              <th key={pIdx} className="font-extrabold text-[8px] bg-slate-50 border border-black">{pIdx + 1}</th>
                            ))
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {state.classes.map((classObj) => {
                          const grid = getClassWeeklySchedule(classObj.id);
                          return (
                            <tr key={classObj.id}>
                              <td className="font-black px-1.5 text-[9.5px] border border-black text-center text-slate-900 bg-slate-50 uppercase">
                                {classObj.name}
                              </td>
                              {state.settings.days.map((_, dIdx) => 
                                Array.from({ length: numPeriods }).map((_, pIdx) => {
                                  const slot = grid[dIdx][pIdx];
                                  const isLocked = classObj.unavailability?.[dIdx]?.[pIdx];
                                  const closureName = classObj.closureNames?.[dIdx]?.[pIdx] || "";
                                  const isSpecialClosure = !!(closureName && closureName.trim() !== "" && closureName.trim().toUpperCase() !== "KAPALI");

                                  if (isLocked) {
                                    if (isSpecialClosure) {
                                      return (
                                        <td key={pIdx} className="border border-black text-center font-extrabold text-[7.5px] bg-amber-50 text-amber-900 uppercase">
                                          {closureName}
                                        </td>
                                      );
                                    }
                                    return (
                                      <td key={pIdx} className="border border-black text-center"></td>
                                    );
                                  }

                                  if (!slot) {
                                    return <td key={pIdx} className="border border-black text-center">-</td>;
                                  }

                                  const course = coursesMap.get(slot.courseId);
                                  const assignedTeachers = slot.teacherId ? slot.teacherId.split(",").map(id => teachersMap.get(id)).filter(Boolean) : [];
                                  const teacherInitials = assignedTeachers.map(t => getAbbreviatedTeacherName(t?.name || "")).join(", ");

                                  return (
                                    <td key={pIdx} className="border border-black text-center leading-tight px-0.5">
                                      <div className="font-black text-slate-900 text-[8px]">{course?.code || course?.name}</div>
                                      <div className="text-slate-500 text-[7px] truncate font-medium block">{teacherInitials || "Atanmamış"}</div>
                                    </td>
                                  );
                                })
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              }

              // Render Çarşaf (landscape) view for Classrooms/Ateliers
              if (type === "classroom_carsaf") {
                return (
                  <div className="print-carsaf-page w-full">
                    <div className="official-header uppercase text-center mb-4">
                      <div className="text-base font-black">T.C.</div>
                      <div className="text-base font-black mt-1">{state.settings.schoolName || "OKUL ADI BELİRTİLMEDİ"}</div>
                      <div className="text-xs font-bold mt-1">ATÖLYE VE SALONLAR KULLANIM PLANI ÇARŞAF LİSTESİ</div>
                    </div>
                    <div className="text-right text-[9px] font-mono mb-2">
                      <strong>Tarih:</strong> {state.settings.effectiveDate ? new Date(state.settings.effectiveDate).toLocaleDateString('tr-TR') : getFormattedDate()}
                    </div>
                    <table className="print-carsaf-table">
                      <thead>
                        <tr>
                          <th rowSpan={2} style={{ width: "12%" }}>Atölye / Salon</th>
                          {state.settings.days.map((day, dIdx) => (
                            <th key={dIdx} colSpan={numPeriods} className="bg-slate-100 font-bold text-[9px] uppercase border border-black">{day}</th>
                          ))}
                        </tr>
                        <tr>
                          {state.settings.days.map(() => 
                            Array.from({ length: numPeriods }).map((_, pIdx) => (
                              <th key={pIdx} className="font-extrabold text-[8px] bg-slate-50 border border-black">{pIdx + 1}</th>
                            ))
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {state.classrooms.map((classroom) => {
                          const grid = getClassroomWeeklySchedule(classroom.id);
                          return (
                            <tr key={classroom.id}>
                              <td className="font-extrabold px-1.5 text-[9px] border border-black leading-tight uppercase text-slate-900 bg-slate-50">
                                <div>{classroom.name}</div>
                              </td>
                              {state.settings.days.map((_, dIdx) => 
                                Array.from({ length: numPeriods }).map((_, pIdx) => {
                                  const slots = grid[dIdx][pIdx];
                                  const isLocked = classroom.unavailability?.[dIdx]?.[pIdx];
                                  const closureName = classroom.closureNames?.[dIdx]?.[pIdx] || "";
                                  const isSpecialClosure = !!(closureName && closureName.trim() !== "" && closureName.trim().toUpperCase() !== "KAPALI");

                                  if (isLocked) {
                                    if (isSpecialClosure) {
                                      return (
                                        <td key={pIdx} className="border border-black text-center font-extrabold text-[7.5px] bg-amber-50 text-amber-900 uppercase">
                                          {closureName}
                                        </td>
                                      );
                                    }
                                    return (
                                      <td key={pIdx} className="border border-black text-center"></td>
                                    );
                                  }

                                  if (!slots || slots.length === 0) {
                                    return <td key={pIdx} className="border border-black text-center">-</td>;
                                  }

                                  return (
                                    <td key={pIdx} className="border border-black text-center leading-tight px-0.5">
                                      {slots.map((sObj, index) => {
                                        const classObj = classesMap.get(sObj.classId);
                                        const course = coursesMap.get(sObj.slot.courseId);
                                        return (
                                          <div key={index}>
                                            <span className="font-black text-slate-900 text-[8px]">{classObj?.name || "Sınıf"}</span>
                                            <span className="text-slate-500 text-[7px] font-semibold block">({course?.code || course?.name || "Drs"})</span>
                                          </div>
                                        );
                                      })}
                                    </td>
                                  );
                                })
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              }

              return null;
            })()}
          </div>

        </main>
      </div>
      {/* Modern Confirmation Modal with Blurred Background */}
      <AnimatePresence>
        {confirmModal && confirmModal.isOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-100 text-left"
            >
              <div className="p-6 space-y-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${confirmModal.isDangerous ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'}`}>
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">{confirmModal.title}</h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed font-medium">{confirmModal.message}</p>
                </div>
              </div>
              <div className="bg-slate-50 px-6 py-4 flex items-center justify-end space-x-3 border-t border-slate-100">
                <button
                  onClick={() => setConfirmModal(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-800 transition cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  onClick={confirmModal.action}
                  className={`px-4 py-2 rounded-xl text-xs font-bold text-white transition cursor-pointer shadow-lg ${confirmModal.isDangerous ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-200' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'}`}
                >
                  {confirmModal.confirmText || 'Evet, Devam Et'}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showUnsavedLogoutModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4 select-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-100 text-left"
            >
              <div className="p-8 space-y-5">
                <div className="w-14 h-14 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
                  <AlertTriangle className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-slate-800 tracking-tight">Buluta Kaydedilmemiş Veri Var!</h3>
                  <p className="text-sm text-slate-500 mt-2 leading-relaxed font-semibold">
                    DerSayar üzerinde yaptığınız bazı değişiklikler henüz buluta kaydedilmemiş. Güvenli çıkış yapmadan önce bu verileri bulut veritabanınıza yedeklemek ister misiniz?
                  </p>
                </div>
              </div>
              
              <div className="bg-slate-50 px-8 py-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 border-t border-slate-100">
                <button
                  disabled={isSavingAndExiting}
                  onClick={() => setShowUnsavedLogoutModal(false)}
                  className="px-5 py-3 rounded-2xl text-xs font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-800 border border-slate-200 bg-white transition cursor-pointer disabled:opacity-50"
                >
                  Geri Dön (Vazgeç)
                </button>
                <button
                  disabled={isSavingAndExiting}
                  onClick={handleExitWithoutSaving}
                  className="px-5 py-3 rounded-2xl text-xs font-bold text-rose-600 hover:bg-rose-100 border border-rose-200 bg-white transition cursor-pointer disabled:opacity-50"
                >
                  Yedeklemeden Çık
                </button>
                <button
                  disabled={isSavingAndExiting}
                  onClick={handleSaveAndExit}
                  className="px-5 py-3 rounded-2xl text-xs font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 transition cursor-pointer shadow-lg shadow-emerald-200 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSavingAndExiting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>Kaydediliyor...</span>
                    </>
                  ) : (
                    <span>Buluta Kaydet ve Çık</span>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
