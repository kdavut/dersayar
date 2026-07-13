import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  CalendarDays,
  Layers,
  Search,
  Users,
  Wrench,
  Sparkles,
  Lock,
  Unlock,
  Plus,
  Trash2,
  RefreshCw,
  Info,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  HelpCircle,
  Zap,
  Activity,
  UserCheck,
  Award,
  Briefcase
} from "lucide-react";
import { detectConflicts, generateAutomaticScheduleAsync, parseTeacherIds, getDefaultMaxDepth, isChefOrCoordinatorCourse } from "../utils/scheduler";
import {
  Home,
  Settings,
  Edit3,
  School,
  User,
  Link,
  Flame,
  Scissors
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { ScheduleSlot, Teacher, GradeClass, Classroom, Course, LessonAssignment } from "../types";

interface ScheduleTabProps {
  getTeacherWeeklySchedule: (tId: string) => any[][];
  getClassWeeklySchedule: (classId: string) => any[];
  getClassroomWeeklySchedule: (classroomId: string) => any[][];
  optimizeGapsForTeacher: (teacherId: string) => void;
  optimizeGapsForAllTeachers: () => void;
  removeSingleLessonDays: () => void;
  removeSingleLessonDaysForTeacher: (teacherId: string) => void;
  handleClearSchedule: () => void;
  handleClearAllTeachersSchedule: () => void;
  handleClearTeacherLessons: (tId: string) => void;
}

export default function ScheduleTab({
  getTeacherWeeklySchedule,
  getClassWeeklySchedule,
  getClassroomWeeklySchedule,
  optimizeGapsForTeacher,
  optimizeGapsForAllTeachers,
  removeSingleLessonDays,
  removeSingleLessonDaysForTeacher,
  handleClearSchedule,
  handleClearAllTeachersSchedule,
  handleClearTeacherLessons
}: ScheduleTabProps) {
  const {
    historyState,
    scheduleViewMode, setScheduleViewMode,
    viewingEntityId, setViewingEntityId,
    focusedCell, setFocusedCell,
    editingCell, setEditingCell,
    selectedAssignmentId, setSelectedAssignmentId,
    isSchedulerSettingsOpen, setIsSchedulerSettingsOpen,
    isShortcutsOpen, setIsShortcutsOpen,
    isScheduling, setIsScheduling,
    schedulingProgress, setSchedulingProgress,
    isSchedulingOptionsOpen, setIsSchedulingOptionsOpen,
    deepSearch, setDeepSearch,
    numTrials, setNumTrials,
    unplacedReports,
    isAnalysisOpen, setIsAnalysisOpen,
    searchQuery, setSearchQuery,
    confirmModal, setConfirmModal,
    updateState,
    showToast,
    runAutomaticScheduler,
    stopAutomaticScheduler,
    handleAutoGenerateClick,
    handleScheduleSelectedTeacher,
    handleScheduleAllTeachers,
  } = useAppStore();

  const { current: state } = historyState;
  const activeConflicts = detectConflicts(state);

  // Re-declare maps
  const teachersMap = new Map<string, Teacher>(state.teachers.map((t) => [t.id, t]));
  const classesMap = new Map<string, GradeClass>(state.classes.map((c) => [c.id, c]));
  const classroomsMap = new Map<string, Classroom>(state.classrooms.map((cr) => [cr.id, cr]));
  const coursesMap = new Map<string, Course>(state.courses.map((co) => [co.id, co]));

  const handleSelectCellForEditing = (dayIndex: number, periodIndex: number, classId: string) => {
    setEditingCell({ dayIndex, periodIndex, classId });
  };

  const handleUpdateSchoolSettings = (key: "groupLessonsMode" | "maxTeacherDailyGaps" | "maxDepth", value: any) => {
    updateState((draft) => {
      if (key === "groupLessonsMode") {
        draft.settings.groupLessonsMode = value;
      } else if (key === "maxTeacherDailyGaps") {
        draft.settings.maxTeacherDailyGaps = value;
      } else if (key === "maxDepth") {
        draft.settings.maxDepth = value;
      }
    });
  };

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
    const tIds = parseTeacherIds(slotToMove.teacherId);
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
          const otherTIds = parseTeacherIds(otherSlot.teacherId);
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
  const assignmentsMap = new Map<string, LessonAssignment>(state.assignments.map((as) => [as.id, as]));

  // Local context and dialog states (extracted from App.tsx to localize state and lighten App.tsx)
  const [kbdFocusArea, setKbdFocusArea] = useState<'entities' | 'assignments'>('entities');
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    dIdx: number;
    pIdx: number;
  } | null>(null);

  const [teacherContextMenu, setTeacherContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    teacherId: string;
    teacherName: string;
  } | null>(null);

  const [assignmentContextMenu, setAssignmentContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    assignmentId: string;
  } | null>(null);

  const [draggedSource, setDraggedSource] = useState<{ dIdx: number; pIdx: number; classId: string } | null>(null);
  const [draggedOverCell, setDraggedOverCell] = useState<{ dIdx: number; pIdx: number } | null>(null);

  const [f3ClosureName, setF3ClosureName] = useState(() => localStorage.getItem("f3_closure_name") || "NÖBET");
  const [closureDialog, setClosureDialog] = useState<{ dIdx: number; pIdx: number } | null>(null);
  const [closureNameInput, setClosureNameInput] = useState("");
  const [teacherStatusDialog, setTeacherStatusDialog] = useState<{ dIdx: number; pIdx: number } | null>(null);
  const [teacherStatusSearch, setTeacherStatusSearch] = useState("");
  const [distributionDialog, setDistributionDialog] = useState<{ assignmentId: string; current: string } | null>(null);
  const [distributionInput, setDistributionInput] = useState("");

  // --- EXTRACTED GRID HANDLERS & HELPERS (MOVED FROM APP.TSX) ---

  const getSmartAutoFixSuggestions = (): {
    id: string;
    type: string;
    message: string;
    action: {
      type: "move" | "swap";
      classId: string;
      fromDay: number;
      fromPeriod: number;
      toDay: number;
      toPeriod: number;
      otherClassId?: string;
    };
  }[] => {
    const activeConflicts = detectConflicts(state);
    const suggestionsList: any[] = [];
    if (activeConflicts.length === 0) return [];

    const numDays = state.settings.days.length;
    const numPeriods = state.settings.periodsPerDay;

    activeConflicts.forEach((c, idx) => {
      const d1 = c.dayIndex;
      const p1 = c.periodIndex;
      const dayName1 = state.settings.days[d1];
      const periodName1 = `${p1 + 1}. Saat`;

      if (c.type === "teacher_overlap") {
        const teacherId = c.details.teacherId;
        const teacherObj = state.teachers.find(t => t.id === teacherId);
        const tName = teacherObj?.name || "Öğretmen";

        const involvedClasses: { classId: string; slot: any }[] = [];
        Object.keys(state.schedule).forEach(cId => {
          const slot = state.schedule[cId]?.[d1]?.[p1];
          if (slot && slot.teacherId === teacherId) {
            involvedClasses.push({ classId: cId, slot });
          }
        });

        involvedClasses.forEach(({ classId, slot }) => {
          const classObj = state.classes.find(cl => cl.id === classId);
          if (!classObj) return;
          const courseObj = state.courses.find(co => co.id === slot.courseId);
          const courseName = courseObj?.name || "Ders";

          let found = false;
          for (let d2 = 0; d2 < numDays && !found; d2++) {
            for (let p2 = 0; p2 < numPeriods && !found; p2++) {
              if (d2 === d1 && p2 === p1) continue;

              const isClassFree = !state.schedule[classId]?.[d2]?.[p2];
              const isTeacherFree = !Object.keys(state.schedule).some(otherCId => 
                state.schedule[otherCId]?.[d2]?.[p2]?.teacherId === teacherId
              );
              const isClassAvail = classObj.unavailability[d2]?.[p2] !== true;
              const isTeacherAvail = teacherObj?.unavailability[d2]?.[p2] !== true;

              if (isClassFree && isTeacherFree && isClassAvail && isTeacherAvail) {
                const dayName2 = state.settings.days[d2];
                const periodName2 = `${p2 + 1}. Saat`;

                suggestionsList.push({
                  id: `fix-teacher-overlap-${classId}-${d1}-${p1}-${d2}-${p2}-${idx}`,
                  type: "teacher_overlap",
                  message: `${tName} öğretmeninin ${classObj.name} sınıfındaki ${courseName} dersini (${dayName1} ${periodName1}), her ikisinin de boş olduğu ${dayName2} günü ${periodName2} dilimine taşıyın.`,
                  action: {
                    type: "move",
                    classId,
                    fromDay: d1,
                    fromPeriod: p1,
                    toDay: d2,
                    toPeriod: p2
                  }
                });
                found = true;
              }
            }
          }
        });
      }

      else if (c.type === "classroom_overlap") {
        const classroomId = c.details.classroomId;
        const roomObj = state.classrooms.find(r => r.id === classroomId);
        const rName = roomObj?.name || "Atölye";

        const involvedClasses: { classId: string; slot: any }[] = [];
        Object.keys(state.schedule).forEach(cId => {
          const slot = state.schedule[cId]?.[d1]?.[p1];
          if (slot && slot.classroomId === classroomId) {
            involvedClasses.push({ classId: cId, slot });
          }
        });

        involvedClasses.forEach(({ classId, slot }) => {
          const classObj = state.classes.find(cl => cl.id === classId);
          if (!classObj) return;
          const courseObj = state.courses.find(co => co.id === slot.courseId);
          const courseName = courseObj?.name || "Ders";

          let found = false;
          for (let d2 = 0; d2 < numDays && !found; d2++) {
            for (let p2 = 0; p2 < numPeriods && !found; p2++) {
              if (d2 === d1 && p2 === p1) continue;

              const isClassFree = !state.schedule[classId]?.[d2]?.[p2];
              const isRoomFree = !Object.keys(state.schedule).some(otherCId => 
                state.schedule[otherCId]?.[d2]?.[p2]?.classroomId === classroomId
              );
              const isClassAvail = classObj.unavailability[d2]?.[p2] !== true;

              if (isClassFree && isRoomFree && isClassAvail) {
                const dayName2 = state.settings.days[d2];
                const periodName2 = `${p2 + 1}. Saat`;

                suggestionsList.push({
                  id: `fix-room-overlap-${classId}-${d1}-${p1}-${d2}-${p2}-${idx}`,
                  type: "classroom_overlap",
                  message: `${rName} atölyesindeki ${classObj.name} sınıfının ${courseName} dersini (${dayName1} ${periodName1}), boş olan ${dayName2} günü ${periodName2} dilimine aktarın.`,
                  action: {
                    type: "move",
                    classId,
                    fromDay: d1,
                    fromPeriod: p1,
                    toDay: d2,
                    toPeriod: p2
                  }
                });
                found = true;
              }
            }
          }
        });
      }

      else if (c.type === "class_unavailable" || c.type === "teacher_unavailable" || c.type === "classroom_unavailable") {
        const classId = c.details.classId;
        const classObj = state.classes.find(cl => cl.id === classId);
        const slot = state.schedule[classId]?.[d1]?.[p1];

        if (classObj && slot) {
          const courseObj = state.courses.find(co => co.id === slot.courseId);
          const courseName = courseObj?.name || "Ders";
          const teacherObj = state.teachers.find(t => t.id === slot.teacherId);

          let found = false;
          for (let d2 = 0; d2 < numDays && !found; d2++) {
            for (let p2 = 0; p2 < numPeriods && !found; p2++) {
              if (d2 === d1 && p2 === p1) continue;

              const isClassFree = !state.schedule[classId]?.[d2]?.[p2];
              const isTeacherFree = !slot.teacherId || !Object.keys(state.schedule).some(otherCId => 
                state.schedule[otherCId]?.[d2]?.[p2]?.teacherId === slot.teacherId
              );
              const isClassAvail = classObj.unavailability[d2]?.[p2] !== true;
              const isTeacherAvail = !slot.teacherId || teacherObj?.unavailability[d2]?.[p2] !== true;

              if (isClassFree && isTeacherFree && isClassAvail && isTeacherAvail) {
                const dayName2 = state.settings.days[d2];
                const periodName2 = `${p2 + 1}. Saat`;

                suggestionsList.push({
                  id: `fix-unavail-${classId}-${d1}-${p1}-${d2}-${p2}-${idx}`,
                  type: "unavailability",
                  message: `Kapalı hücreye yerleşen ${classObj.name} sınıfının ${courseName} dersini (${dayName1} ${periodName1}), uygun olan ${dayName2} günü ${periodName2} dilimine kaydırın.`,
                  action: {
                    type: "move",
                    classId,
                    fromDay: d1,
                    fromPeriod: p1,
                    toDay: d2,
                    toPeriod: p2
                  }
                });
                found = true;
              }
            }
          }
        }
      }
    });

    return suggestionsList;
  };

const getAssignmentPlacedHours = (assignId: string) => {
    let count = 0;
    Object.keys(state.schedule).forEach((cId) => {
      const classS = state.schedule[cId];
      if (classS) {
        Object.keys(classS).forEach((dayIdxStr) => {
          const dIdx = parseInt(dayIdxStr, 10);
          const dayS = classS[dIdx];
          if (dayS) {
            dayS.forEach((slot) => {
              if (slot && slot.assignmentId === assignId) {
                count++;
              }
            });
          }
        });
      }
    });
    return count;
  }

const getTeacherPlacedHours = (teacherId: string) => {
    let count = 0;
    Object.keys(state.schedule).forEach((cId) => {
      const classSched = state.schedule[cId];
      if (classSched) {
        Object.keys(classSched).forEach((dIdxKey) => {
          const periods = classSched[parseInt(dIdxKey, 10)];
          if (periods) {
            periods.forEach((slot) => {
              if (slot && slot.teacherId) {
                const ids = slot.teacherId.split(",");
                if (ids.includes(teacherId)) {
                  count++;
                }
              }
            });
          }
        });
      }
    });
    return count;
  }

const getClassPlacedHours = (classId: string) => {
    let count = 0;
    const classSched = state.schedule[classId];
    if (classSched) {
      Object.keys(classSched).forEach((dIdxKey) => {
        const periods = classSched[parseInt(dIdxKey, 10)];
        if (periods) {
          periods.forEach((slot) => {
            if (slot) {
              count++;
            }
          });
        }
      });
    }
    return count;
  }

const getClassroomPlacedHours = (classroomId: string) => {
    let count = 0;
    Object.keys(state.schedule).forEach((cId) => {
      const classSched = state.schedule[cId];
      if (classSched) {
        Object.keys(classSched).forEach((dIdxKey) => {
          const periods = classSched[parseInt(dIdxKey, 10)];
          if (periods) {
            periods.forEach((slot) => {
              if (slot && slot.classroomId === classroomId) {
                count++;
              }
            });
          }
        });
      }
    });
    return count;
  }

const handleCellClick = (dIdx: number, pIdx: number) => {
    setFocusedCell({ dIdx, pIdx });

    // Determine if there is a slot in this cell to select it and highlight alternatives
    let slot: ScheduleSlot | null = null;
    if (scheduleViewMode === "class" && viewingEntityId) {
      slot = state.schedule[viewingEntityId]?.[dIdx]?.[pIdx] || null;
    } else if (scheduleViewMode === "teacher" && viewingEntityId) {
      for (const cId of Object.keys(state.schedule)) {
        const classS = state.schedule[cId];
        const sl = classS?.[dIdx]?.[pIdx];
        if (sl && sl.teacherId && sl.teacherId.split(",").includes(viewingEntityId)) {
          slot = sl;
          break;
        }
      }
    } else if (scheduleViewMode === "classroom" && viewingEntityId) {
      for (const cId of Object.keys(state.schedule)) {
        const classS = state.schedule[cId];
        const sl = classS?.[dIdx]?.[pIdx];
        if (sl && sl.classroomId === viewingEntityId) {
          slot = sl;
          break;
        }
      }
    }

    if (slot) {
      setSelectedAssignmentId(slot.assignmentId);
      showToast(`"${coursesMap.get(slot.courseId)?.name || 'Ders'}" seçildi. Alternatif uygun saatler yeşil renk ile vurgulandı.`, "info");
    }
  }

const handleCellDoubleClick = (dIdx: number, pIdx: number) => {
    // Check if cell is unavailability locked
    let cellIsUnavailabilityLocked = false;
    if (scheduleViewMode === "class" && viewingEntityId) {
      cellIsUnavailabilityLocked = classesMap.get(viewingEntityId)?.unavailability[dIdx]?.[pIdx] || false;
    } else if (scheduleViewMode === "teacher" && viewingEntityId) {
      cellIsUnavailabilityLocked = teachersMap.get(viewingEntityId)?.unavailability[dIdx]?.[pIdx] || false;
    } else if (scheduleViewMode === "classroom" && viewingEntityId) {
      cellIsUnavailabilityLocked = classroomsMap.get(viewingEntityId)?.unavailability[dIdx]?.[pIdx] || false;
    }

    if (cellIsUnavailabilityLocked) {
      showToast("Bu hücre kilitli veya kapalı zaman diliminde!", "error");
      return;
    }

    // Determine current slot and activeClassId
    let slot: ScheduleSlot | null = null;
    let activeClassId = "";

    if (scheduleViewMode === "class" && viewingEntityId) {
      activeClassId = viewingEntityId;
      slot = state.schedule[viewingEntityId]?.[dIdx]?.[pIdx] || null;
    } else if (scheduleViewMode === "teacher" && viewingEntityId) {
      for (const cId of Object.keys(state.schedule)) {
        const classS = state.schedule[cId];
        const sl = classS?.[dIdx]?.[pIdx];
        if (sl && sl.teacherId && sl.teacherId.split(",").includes(viewingEntityId)) {
          slot = sl;
          activeClassId = cId;
          break;
        }
      }
    } else if (scheduleViewMode === "classroom" && viewingEntityId) {
      for (const cId of Object.keys(state.schedule)) {
        const classS = state.schedule[cId];
        const sl = classS?.[dIdx]?.[pIdx];
        if (sl && sl.classroomId === viewingEntityId) {
          slot = sl;
          activeClassId = cId;
          break;
        }
      }
    }

    if (slot) {
      // Cell is filled -> Directly remove it on double click!
      if (slot.isLocked) {
        showToast("Sabitlenmiş/kilitlenmiş dersleri doğrudan silemezsiniz. Önce sağ tıklayıp kilidini açınız.", "error");
        return;
      }
      updateState((draft) => {
        if (draft.schedule[activeClassId]) {
          draft.schedule[activeClassId][dIdx][pIdx] = null;
        }
      });
      showToast("Hücredeki ders kaldırıldı.", "success");
    } else {
      // Cell is empty -> Place a lesson on double click
      const currentActiveAssignment = state.assignments.find(a => a.id === selectedAssignmentId) || (() => {
        if (scheduleViewMode === "class" && viewingEntityId) {
          const classAss = state.assignments.filter(a => a.classId === viewingEntityId);
          return classAss.find(a => getAssignmentPlacedHours(a.id) < a.weeklyHours) || classAss[0];
        } else if (scheduleViewMode === "teacher" && viewingEntityId) {
          const teachAss = state.assignments.filter(a => a.teacherId && a.teacherId.split(",").includes(viewingEntityId));
          return teachAss.find(a => getAssignmentPlacedHours(a.id) < a.weeklyHours) || teachAss[0];
        } else if (scheduleViewMode === "classroom" && viewingEntityId) {
          const roomAss = state.assignments.filter(a => a.classroomId === viewingEntityId);
          return roomAss.find(a => getAssignmentPlacedHours(a.id) < a.weeklyHours) || roomAss[0];
        }
        return undefined;
      })();

      if (currentActiveAssignment) {
        // Check weekly hours limit
        const placed = getAssignmentPlacedHours(currentActiveAssignment.id);
        if (placed >= currentActiveAssignment.weeklyHours) {
          showToast(`Atanamaz: "${coursesMap.get(currentActiveAssignment.courseId)?.name || "Ders"}" haftalık ders saati sınırı (${currentActiveAssignment.weeklyHours} saat) doldu.`, "error");
          return;
        }

        // Check daily periods limit for the class of the assignment
        const targetClassObj = classesMap.get(currentActiveAssignment.classId);
        if (targetClassObj && targetClassObj.dailyPeriods) {
          const maxPeriodsThisDay = targetClassObj.dailyPeriods[dIdx];
          if (maxPeriodsThisDay !== undefined && pIdx >= maxPeriodsThisDay) {
            showToast("Bu hücre sınıfın günlük ders saati sınırı dışında!", "error");
            return;
          }
        }

        // Check unavailability of teachers
        const tIds = currentActiveAssignment.teacherId ? currentActiveAssignment.teacherId.split(",") : [];
        for (const tId of tIds) {
          const teacherObj = teachersMap.get(tId);
          if (teacherObj && teacherObj.unavailability?.[dIdx]?.[pIdx]) {
            showToast(`Atanamaz: Öğretmen (${teacherObj.name}) bu saatte kapalı/izinli.`, "error");
            return;
          }
        }

        // Check unavailability of class
        if (targetClassObj && targetClassObj.unavailability?.[dIdx]?.[pIdx]) {
          showToast("Atanamaz: Sınıf bu saatte kapalı.", "error");
          return;
        }

        // Check unavailability of classroom
        if (currentActiveAssignment.classroomId) {
          const classroomObj = classroomsMap.get(currentActiveAssignment.classroomId);
          if (classroomObj && classroomObj.unavailability?.[dIdx]?.[pIdx]) {
            showToast("Atanamaz: Atölye/Derslik bu saatte kapalı.", "error");
            return;
          }
        }

        // 1. Class conflict (if class already has a lesson at dIdx, pIdx)
        const targetClassId = currentActiveAssignment.classId;
        const existingClassSlot = state.schedule[targetClassId]?.[dIdx]?.[pIdx];
        if (existingClassSlot) {
          const courseName = coursesMap.get(existingClassSlot.courseId)?.name || "Ders";
          showToast(`Çakışma: Sınıfın bu saatte zaten bir dersi var (${courseName}). Çakışma nedeniyle yeni ders yerleştirilemedi!`, "error");
          return;
        }

        // 2. Teacher conflict (if any of the teachers are busy in another class at dIdx, pIdx)
        for (const tId of tIds) {
          for (const otherClassId of Object.keys(state.schedule)) {
            if (otherClassId === targetClassId) continue;
            const otherSlot = state.schedule[otherClassId]?.[dIdx]?.[pIdx];
            if (otherSlot && otherSlot.teacherId) {
              const otherTIds = otherSlot.teacherId.split(",");
              if (otherTIds.includes(tId)) {
                const tName = teachersMap.get(tId)?.name || "Öğretmen";
                const otherClassName = classesMap.get(otherClassId)?.name || "başka sınıf";
                const otherCourseName = coursesMap.get(otherSlot.courseId)?.name || "Ders";
                showToast(`Çakışma: ${tName} öğretmeni bu saatte ${otherClassName} sınıfında derste (${otherCourseName})! Yeni ders yerleştirilemedi.`, "error");
                return;
              }
            }
          }
        }

        // Perform state updates since no conflicts were found
        updateState((draft) => {
          // Place the new one
          if (!draft.schedule[targetClassId]) {
            draft.schedule[targetClassId] = {};
          }
          if (!draft.schedule[targetClassId][dIdx]) {
            draft.schedule[targetClassId][dIdx] = Array(draft.settings.periodsPerDay).fill(null);
          }
          draft.schedule[targetClassId][dIdx][pIdx] = {
            assignmentId: currentActiveAssignment.id,
            courseId: currentActiveAssignment.courseId,
            teacherId: currentActiveAssignment.teacherId,
            classroomId: currentActiveAssignment.classroomId
          };
        });

        showToast(`"${coursesMap.get(currentActiveAssignment.courseId)?.name || "Ders"}" başarıyla yerleştirildi.`, "success");
      } else {
        showToast("Seçili veya atanabilir ders dağıtımı bulunamadı.", "error");
      }
    }
  }

const handleCellKeyDown = (e: React.KeyboardEvent, dIdx: number, pIdx: number) => {
    let nextDIdx = dIdx;
    let nextPIdx = pIdx;
    if (e.key === "ArrowUp") {
      nextDIdx = (dIdx - 1 + state.settings.days.length) % state.settings.days.length;
      e.preventDefault();
    } else if (e.key === "ArrowDown") {
      nextDIdx = (dIdx + 1) % state.settings.days.length;
      e.preventDefault();
    } else if (e.key === "ArrowLeft") {
      nextPIdx = (pIdx - 1 + state.settings.periodsPerDay) % state.settings.periodsPerDay;
      e.preventDefault();
    } else if (e.key === "ArrowRight") {
      nextPIdx = (pIdx + 1) % state.settings.periodsPerDay;
      e.preventDefault();
    } else if (e.key === "Enter" || e.key === " ") {
      if (scheduleViewMode === "class" && viewingEntityId) {
        handleSelectCellForEditing(dIdx, pIdx, viewingEntityId);
      }
      e.preventDefault();
      return;
    } else {
      return;
    }

    setFocusedCell({ dIdx: nextDIdx, pIdx: nextPIdx });
    setTimeout(() => {
      const el = document.getElementById(`cell-${nextDIdx}-${nextPIdx}`);
      if (el) {
        (el as HTMLElement).focus();
      }
    }, 0);
  }

const handleDragStart = (e: React.DragEvent, fromDay: number, fromPeriod: number, fromClassId: string) => {
    e.dataTransfer.setData("text/plain", JSON.stringify({ fromDay, fromPeriod, fromClassId }));
    e.dataTransfer.effectAllowed = "move";
    setDraggedSource({ dIdx: fromDay, pIdx: fromPeriod, classId: fromClassId });
  }

const handleDrop = (e: React.DragEvent, toDay: number, toPeriod: number, toClassId: string) => {
    e.preventDefault();
    setDraggedOverCell(null);
    setDraggedSource(null);
    try {
      const dataStr = e.dataTransfer.getData("text/plain");
      if (!dataStr) return;
      const data = JSON.parse(dataStr);

      // 1. Dragging from the left sidebar assignment list
      if (data.assignmentId) {
        const assign = state.assignments.find(x => x.id === data.assignmentId);
        if (!assign) return;

        const targetClassId = assign.classId;

        // Check weekly hours limit
        const placed = getAssignmentPlacedHours(assign.id);
        if (placed >= assign.weeklyHours) {
          showToast(`Atanamaz: "${coursesMap.get(assign.courseId)?.name || "Ders"}" haftalık ders saati sınırı (${assign.weeklyHours} saat) doldu.`, "error");
          return;
        }

        // Check daily periods limit for the class of the assignment
        const targetClassObj = classesMap.get(targetClassId);
        if (targetClassObj && targetClassObj.dailyPeriods) {
          const maxPeriodsThisDay = targetClassObj.dailyPeriods[toDay];
          if (maxPeriodsThisDay !== undefined && toPeriod >= maxPeriodsThisDay) {
            showToast("Bu hücre sınıfın günlük ders saati sınırı dışında!", "error");
            return;
          }
        }

        // Check unavailability of teachers
        const tIds = parseTeacherIds(assign.teacherId);
        for (const tId of tIds) {
          const teacherObj = teachersMap.get(tId);
          if (teacherObj && teacherObj.unavailability?.[toDay]?.[toPeriod]) {
            showToast(`Atanamaz: Öğretmen (${teacherObj.name}) bu saatte kapalı/izinli.`, "error");
            return;
          }
        }

        // Check unavailability of class
        if (targetClassObj && targetClassObj.unavailability?.[toDay]?.[toPeriod]) {
          showToast("Atanamaz: Sınıf bu saatte kapalı.", "error");
          return;
        }

        // Check unavailability of classroom
        if (assign.classroomId) {
          const classroomObj = classroomsMap.get(assign.classroomId);
          if (classroomObj && classroomObj.unavailability?.[toDay]?.[toPeriod]) {
            showToast("Atanamaz: Atölye/Derslik bu saatte kapalı.", "error");
            return;
          }
        }

        // 1. Class conflict (if class already has a lesson at toDay, toPeriod)
        const existingClassSlot = state.schedule[targetClassId]?.[toDay]?.[toPeriod];
        if (existingClassSlot) {
          const courseName = coursesMap.get(existingClassSlot.courseId)?.name || "Ders";
          showToast(`Çakışma: Sınıfın bu saatte zaten bir dersi var (${courseName}). Çakışma nedeniyle yeni ders yerleştirilemedi!`, "error");
          return;
        }

        // 2. Teacher conflict (if any of the teachers are busy in another class at toDay, toPeriod)
        for (const tId of tIds) {
          for (const otherClassId of Object.keys(state.schedule)) {
            if (otherClassId === targetClassId) continue;
            const otherSlot = state.schedule[otherClassId]?.[toDay]?.[toPeriod];
            if (otherSlot && otherSlot.teacherId) {
              const otherTIds = parseTeacherIds(otherSlot.teacherId);
              if (otherTIds.includes(tId)) {
                const tName = teachersMap.get(tId)?.name || "Öğretmen";
                const otherClassName = classesMap.get(otherClassId)?.name || "başka sınıf";
                const otherCourseName = coursesMap.get(otherSlot.courseId)?.name || "Ders";
                showToast(`Çakışma: ${tName} öğretmeni bu saatte ${otherClassName} sınıfında derste (${otherCourseName})! Yeni ders yerleştirilemedi.`, "error");
                return;
              }
            }
          }
        }

        // Perform state updates since no conflicts were found
        updateState((draft) => {
          // Place the new one
          if (!draft.schedule[targetClassId]) {
            draft.schedule[targetClassId] = {};
          }
          if (!draft.schedule[targetClassId][toDay]) {
            draft.schedule[targetClassId][toDay] = Array(draft.settings.periodsPerDay).fill(null);
          }
          draft.schedule[targetClassId][toDay][toPeriod] = {
            assignmentId: assign.id,
            courseId: assign.courseId,
            teacherId: assign.teacherId,
            classroomId: assign.classroomId
          };
        });

        showToast(`${coursesMap.get(assign.courseId)?.name || "Ders"} sürüklenerek başarıyla yerleştirildi.`, "success");
        return;
      }

      // 2. Existing drag/move behavior
      const { fromDay, fromPeriod, fromClassId } = data;
      const targetClassId = toClassId || fromClassId;

      if (fromDay === toDay && fromPeriod === toPeriod && fromClassId === targetClassId) {
        return; // same place
      }

      // Check if source slot has a lesson
      const slotToMove = state.schedule[fromClassId]?.[fromDay]?.[fromPeriod];
      if (!slotToMove) return;

      // Check for hard constraint violations!
      const conflicts = checkDragMoveConflicts(slotToMove, targetClassId, toDay, toPeriod, fromDay, fromPeriod);
      if (conflicts.length > 0) {
        showToast(`Sert Kısıt İhlali! Taşıma engellendi:\n${conflicts.join("\n")}`, "error");
        return;
      }

      // Check if target cell has any limits or locks (unavailability)
      let targetLocked = classesMap.get(targetClassId)?.unavailability[toDay]?.[toPeriod] || false;
      const targetClassSlot = state.schedule[targetClassId]?.[toDay]?.[toPeriod] || null;

      if (targetLocked || targetClassSlot?.isLocked) {
        showToast("Kilitli veya kapalı bir zaman dilimine ders taşıyamazsınız!", "error");
        return;
      }

      // Update state
      updateState((draft) => {
        if (!draft.schedule[targetClassId]) {
          draft.schedule[targetClassId] = {};
        }
        if (!draft.schedule[targetClassId][toDay]) {
          draft.schedule[targetClassId][toDay] = Array(draft.settings.periodsPerDay).fill(null);
        }
        if (!draft.schedule[fromClassId]) {
          draft.schedule[fromClassId] = {};
        }
        if (!draft.schedule[fromClassId][fromDay]) {
          draft.schedule[fromClassId][fromDay] = Array(draft.settings.periodsPerDay).fill(null);
        }

        // SWAP slots
        draft.schedule[targetClassId][toDay][toPeriod] = slotToMove;
        draft.schedule[fromClassId][fromDay][fromPeriod] = targetClassSlot;
      });

      showToast("Ders başarıyla taşındı. Çakışma kontrolü otomatik yapıldı.", "success");
    } catch (err) {
      console.error(err);
      showToast("Taşıma işlemi gerçekleştirilemedi.", "error");
    }
  }

const handleApplyManualCellAssignment = (assignmentId: string | "clear") => {
    if (!editingCell) return;
    const { dayIndex, periodIndex, classId } = editingCell;

    if (assignmentId === "clear") {
      updateState((draft) => {
        if (!draft.schedule[classId]) {
          draft.schedule[classId] = {};
        }
        if (!draft.schedule[classId][dayIndex]) {
          draft.schedule[classId][dayIndex] = Array(draft.settings.periodsPerDay).fill(null);
        }
        draft.schedule[classId][dayIndex][periodIndex] = null;
      });
      showToast("Ders hücresi boşaltıldı.", "info");
      setEditingCell(null);
      return;
    }

    const assign = state.assignments.find((a) => a.id === assignmentId);
    if (!assign) {
      setEditingCell(null);
      return;
    }

    // 1. Check daily periods limit for the class of the assignment
    const targetClassObj = classesMap.get(classId);
    if (targetClassObj && targetClassObj.dailyPeriods) {
      const maxPeriodsThisDay = targetClassObj.dailyPeriods[dayIndex];
      if (maxPeriodsThisDay !== undefined && periodIndex >= maxPeriodsThisDay) {
        showToast("Atanamaz: Sınıfın günlük ders saati sınırı dışında.", "error");
        return;
      }
    }

    // 2. Check unavailability locks
    // a) Teacher unavailability
    const tIds = parseTeacherIds(assign.teacherId);
    for (const tId of tIds) {
      const teacherObj = teachersMap.get(tId);
      if (teacherObj && teacherObj.unavailability?.[dayIndex]?.[periodIndex]) {
        showToast(`Atanamaz: Öğretmen (${teacherObj.name}) bu saatte kapalı/izinli.`, "error");
        return;
      }
    }

    // b) Class unavailability
    if (targetClassObj && targetClassObj.unavailability?.[dayIndex]?.[periodIndex]) {
      showToast("Atanamaz: Sınıf bu saatte kapalı.", "error");
      return;
    }

    // c) Classroom unavailability
    if (assign.classroomId) {
      const classroomObj = classroomsMap.get(assign.classroomId);
      if (classroomObj && classroomObj.unavailability?.[dayIndex]?.[periodIndex]) {
        showToast("Atanamaz: Atölye/Derslik bu saatte kapalı.", "error");
        return;
      }
    }

    // 3. Busy states
    // a) Teacher busy elsewhere
    for (const tId of tIds) {
      for (const otherClassId of Object.keys(state.schedule)) {
        if (otherClassId === classId) continue;
        const otherSlot = state.schedule[otherClassId]?.[dayIndex]?.[periodIndex];
        if (otherSlot && otherSlot.teacherId) {
          const otherTIds = parseTeacherIds(otherSlot.teacherId);
          if (otherTIds.includes(tId)) {
            const tName = teachersMap.get(tId)?.name || "Öğretmen";
            const otherClassName = classesMap.get(otherClassId)?.name || "başka sınıf";
            showToast(`Çakışma: ${tName} bu saatte ${otherClassName} sınıfında derste!`, "error");
            return;
          }
        }
      }
    }

    // b) Classroom busy elsewhere (ATÖLYE ÇAKIŞMASI - İMKANSIZ KIL) (Allowed to overlap per user request: "Atölyeler paylaşılabilir")
    /*
    if (assign.classroomId) {
      for (const otherClassId of Object.keys(state.schedule)) {
        if (otherClassId === classId) continue;
        const otherSlot = state.schedule[otherClassId]?.[dayIndex]?.[periodIndex];
        if (otherSlot && otherSlot.classroomId === assign.classroomId) {
          const rName = classroomsMap.get(assign.classroomId)?.name || "Atölye";
          const otherClassName = classesMap.get(otherClassId)?.name || "başka sınıf";
          showToast(`Çakışma: ${rName} bu saatte ${otherClassName} tarafından kullanılıyor! Atama engellendi.`, "error");
          return;
        }
      }
    }
    */

    // 4. Weekly hours limit check
    const placed = getAssignmentPlacedHours(assign.id);
    const currentSlot = state.schedule[classId]?.[dayIndex]?.[periodIndex];
    if (currentSlot && currentSlot.assignmentId !== assign.id) {
      const courseName = coursesMap.get(currentSlot.courseId)?.name || "Ders";
      showToast(`Çakışma: Sınıfın bu saatte zaten bir dersi var (${courseName}). Çakışma nedeniyle yeni ders yerleştirilemedi!`, "error");
      return;
    }
    const isSameAssignment = currentSlot && currentSlot.assignmentId === assign.id;
    if (!isSameAssignment && placed >= assign.weeklyHours) {
      showToast(`Haftalık ders saati sınırı (${assign.weeklyHours} saat) zaten dolmuş!`, "error");
      return;
    }

    // All checks passed! Apply assignment
    updateState((draft) => {
      if (!draft.schedule[classId]) {
        draft.schedule[classId] = {};
      }
      if (!draft.schedule[classId][dayIndex]) {
        draft.schedule[classId][dayIndex] = Array(draft.settings.periodsPerDay).fill(null);
      }
      draft.schedule[classId][dayIndex][periodIndex] = {
        assignmentId: assign.id,
        courseId: assign.courseId,
        teacherId: assign.teacherId,
        classroomId: assign.classroomId
      };
    });

    showToast(`${coursesMap.get(assign.courseId)?.name || "Ders"} başarıyla yerleştirildi.`, "success");
    setEditingCell(null);
  }

const getSlotAt = (dIdx: number, pIdx: number) => {
    let slot: ScheduleSlot | null = null;
    let classId = "";

    if (scheduleViewMode === "class" && viewingEntityId) {
      classId = viewingEntityId;
      slot = state.schedule[viewingEntityId]?.[dIdx]?.[pIdx] || null;
    } else if (scheduleViewMode === "teacher" && viewingEntityId) {
      for (const cId of Object.keys(state.schedule)) {
        const classS = state.schedule[cId];
        const sl = classS?.[dIdx]?.[pIdx];
        if (sl && sl.teacherId && sl.teacherId.split(",").includes(viewingEntityId)) {
          slot = sl;
          classId = cId;
          break;
        }
      }
    } else if (scheduleViewMode === "classroom" && viewingEntityId) {
      for (const cId of Object.keys(state.schedule)) {
        const classS = state.schedule[cId];
        const sl = classS?.[dIdx]?.[pIdx];
        if (sl && sl.classroomId === viewingEntityId) {
          slot = sl;
          classId = cId;
          break;
        }
      }
    }
    return { slot, classId };
  }

const toggleLessonLockAt = (dIdx: number, pIdx: number) => {
    const { slot, classId } = getSlotAt(dIdx, pIdx);
    if (!slot || !classId) {
      showToast("Bu hücrede sabitlenecek bir ders bulunmuyor!", "error");
      return;
    }

    updateState((draft) => {
      const targetSlot = draft.schedule[classId]?.[dIdx]?.[pIdx];
      if (targetSlot) {
        targetSlot.isLocked = !targetSlot.isLocked;
        showToast(
          `Ders sabitleme: "${coursesMap.get(targetSlot.courseId)?.name || "Ders"}" hücresi ${
            targetSlot.isLocked ? "sabitlendi (çakıldı)" : "serbest bırakıldı"
          }.`,
          "success"
        );
      }
    });
  }

const toggleCellUnavailabilityAt = (dIdx: number, pIdx: number) => {
    if (!viewingEntityId) return;
    updateState((draft) => {
      if (scheduleViewMode === "class") {
        const item = draft.classes.find((c) => c.id === viewingEntityId);
        if (item) {
          if (!item.unavailability[dIdx]) {
            item.unavailability[dIdx] = Array(draft.settings.periodsPerDay).fill(false);
          }
          item.unavailability[dIdx][pIdx] = !item.unavailability[dIdx][pIdx];
          showToast(`Sınıf hücresi ${item.unavailability[dIdx][pIdx] ? "kilitlendi" : "kilidi açıldı"}.`, "success");
        }
      } else if (scheduleViewMode === "teacher") {
        const item = draft.teachers.find((t) => t.id === viewingEntityId);
        if (item) {
          if (!item.unavailability[dIdx]) {
            item.unavailability[dIdx] = Array(draft.settings.periodsPerDay).fill(false);
          }
          item.unavailability[dIdx][pIdx] = !item.unavailability[dIdx][pIdx];
          showToast(`Öğretmen hücresi ${item.unavailability[dIdx][pIdx] ? "kilitlendi" : "kilidi açıldı"}.`, "success");
        }
      } else if (scheduleViewMode === "classroom") {
        const item = draft.classrooms.find((cr) => cr.id === viewingEntityId);
        if (item) {
          if (!item.unavailability[dIdx]) {
            item.unavailability[dIdx] = Array(draft.settings.periodsPerDay).fill(false);
          }
          item.unavailability[dIdx][pIdx] = !item.unavailability[dIdx][pIdx];
          showToast(`Atölye hücresi ${item.unavailability[dIdx][pIdx] ? "kilitlendi" : "kilidi açıldı"}.`, "success");
        }
      }
    });
  }

const handleNavigateToClassFromCell = (dIdx: number, pIdx: number) => {
    let classId = "";
    if (scheduleViewMode === "class" && viewingEntityId) {
      classId = viewingEntityId;
    } else {
      if (scheduleViewMode === "teacher" && viewingEntityId) {
        for (const cId of Object.keys(state.schedule)) {
          const slot = state.schedule[cId]?.[dIdx]?.[pIdx];
          if (slot && slot.teacherId && slot.teacherId.split(",").includes(viewingEntityId)) {
            classId = cId;
            break;
          }
        }
      } else if (scheduleViewMode === "classroom" && viewingEntityId) {
        for (const cId of Object.keys(state.schedule)) {
          const slot = state.schedule[cId]?.[dIdx]?.[pIdx];
          if (slot && slot.classroomId === viewingEntityId) {
            classId = cId;
            break;
          }
        }
      }
    }
    if (classId) {
      setScheduleViewMode("class");
      setViewingEntityId(classId);
      showToast(`${classesMap.get(classId)?.name || "Sınıf"} programına geçildi.`, "success");
    } else {
      showToast("Bu hücrede tanımlı bir sınıf bulunamadı.", "info");
    }
  }

const handleNavigateToTeacherFromCell = (dIdx: number, pIdx: number) => {
    let teacherId = "";
    if (scheduleViewMode === "teacher" && viewingEntityId) {
      teacherId = viewingEntityId;
    } else {
      let slot: ScheduleSlot | null = null;
      if (scheduleViewMode === "class" && viewingEntityId) {
        slot = state.schedule[viewingEntityId]?.[dIdx]?.[pIdx] || null;
      } else if (scheduleViewMode === "classroom" && viewingEntityId) {
        for (const cId of Object.keys(state.schedule)) {
          const sl = state.schedule[cId]?.[dIdx]?.[pIdx];
          if (sl && sl.classroomId === viewingEntityId) {
            slot = sl;
            break;
          }
        }
      }
      if (slot && slot.teacherId) {
        teacherId = slot.teacherId.split(",")[0];
      }
    }
    if (teacherId) {
      setScheduleViewMode("teacher");
      setViewingEntityId(teacherId);
      showToast(`${teachersMap.get(teacherId)?.name || "Öğretmen"} programına geçildi.`, "success");
    } else {
      showToast("Bu hücrede tanımlı bir öğretmen bulunamadı.", "info");
    }
  }

  const countPlacedHoursOfAssignment = (sch: any, assignId: string, daysCount: number, periodsCount: number) => {
    let count = 0;
    for (const cId of Object.keys(sch)) {
      const classS = sch[cId];
      if (classS) {
        for (let d = 0; d < daysCount; d++) {
          const dayS = classS[d];
          if (dayS) {
            for (let p = 0; p < periodsCount; p++) {
              if (dayS[p]?.assignmentId === assignId) {
                count++;
              }
            }
          }
        }
      }
    }
    return count;
  };

  const handleSplitAndPlaceLesson = async (dIdx: number, pIdx: number) => {
    const { slot } = getSlotAt(dIdx, pIdx);
    if (!slot) {
      showToast("Bu hücrede bölünecek bir ders bulunamadı!", "error");
      return;
    }

    const assignmentId = slot.assignmentId;
    const assign = state.assignments.find((a) => a.id === assignmentId);
    if (!assign) {
      showToast("Ders ataması bulunamadı!", "error");
      return;
    }

    const H = assign.weeklyHours;
    if (H <= 1) {
      showToast("Bu ders 1 saatlik olduğundan daha fazla bölünemez!", "info");
      return;
    }

    const partiallySplit = ["2", ...Array(H - 2).fill("1")].join("+");
    const fullySplit = Array(H).fill("1").join("+");

    const clearedSchedule = JSON.parse(JSON.stringify(state.schedule));
    const numDays = state.settings.days.length;
    const numPeriods = state.settings.periodsPerDay;

    for (const cId of Object.keys(clearedSchedule)) {
      const classSched = clearedSchedule[cId];
      if (classSched) {
        for (let d = 0; d < numDays; d++) {
          const daySched = classSched[d];
          if (daySched) {
            for (let p = 0; p < numPeriods; p++) {
              if (daySched[p]?.assignmentId === assignmentId) {
                daySched[p] = null;
              }
            }
          }
        }
      }
    }

    showToast("Ders bölünerek yerleştirilmeye çalışılıyor, lütfen bekleyin...", "info");
    setIsScheduling(true);
    setSchedulingProgress({
      phase: "backtracking",
      percent: 10,
      message: `Birinci aşama deneniyor (Kısmi Bölüm: ${partiallySplit})...`,
      steps: 0
    });

    try {
      const stateWithPartialSplit = {
        ...state,
        schedule: clearedSchedule,
        assignments: state.assignments.map((a) =>
          a.id === assignmentId ? { ...a, customPlacementMode: partiallySplit } : a
        )
      };

      const result1 = await generateAutomaticScheduleAsync(stateWithPartialSplit, (prog) => {
        setSchedulingProgress({
          phase: prog.phase,
          percent: Math.min(48, Math.round(prog.percent * 0.5)),
          message: `Kısmi Bölüm Deneniyor (${partiallySplit}): ${prog.message}`,
          steps: prog.steps
        });
      }, {
        keepExisting: true,
        deepSearch: true,
        numTrials: 2
      });

      const placedCount1 = countPlacedHoursOfAssignment(result1.schedule, assignmentId, numDays, numPeriods);

      if (result1.success && placedCount1 === H) {
        updateState((draft) => {
          draft.schedule = result1.schedule;
          const targetAssign = draft.assignments.find((a) => a.id === assignmentId);
          if (targetAssign) {
            targetAssign.customPlacementMode = partiallySplit;
          }
        });
        showToast(`Ders başarıyla ${partiallySplit} şeklinde bölünerek yerleştirildi!`, "success");
        return;
      }

      setSchedulingProgress({
        phase: "backtracking",
        percent: 50,
        message: `İkinci aşama deneniyor (Tam Bölüm: ${fullySplit})...`,
        steps: 0
      });

      const stateWithFullSplit = {
        ...state,
        schedule: clearedSchedule,
        assignments: state.assignments.map((a) =>
          a.id === assignmentId ? { ...a, customPlacementMode: fullySplit } : a
        )
      };

      const result2 = await generateAutomaticScheduleAsync(stateWithFullSplit, (prog) => {
        setSchedulingProgress({
          phase: prog.phase,
          percent: 50 + Math.min(48, Math.round(prog.percent * 0.5)),
          message: `Tam Bölüm Deneniyor (${fullySplit}): ${prog.message}`,
          steps: prog.steps
        });
      }, {
        keepExisting: true,
        deepSearch: true,
        numTrials: 3
      });

      const placedCount2 = countPlacedHoursOfAssignment(result2.schedule, assignmentId, numDays, numPeriods);

      if (placedCount2 === H) {
        updateState((draft) => {
          draft.schedule = result2.schedule;
          const targetAssign = draft.assignments.find((a) => a.id === assignmentId);
          if (targetAssign) {
            targetAssign.customPlacementMode = fullySplit;
          }
        });
        showToast(`Ders başarıyla ${fullySplit} şeklinde bölünerek yerleştirildi!`, "success");
      } else {
        const currentPlaced = countPlacedHoursOfAssignment(state.schedule, assignmentId, numDays, numPeriods);
        if (placedCount2 > currentPlaced) {
          updateState((draft) => {
            draft.schedule = result2.schedule;
            const targetAssign = draft.assignments.find((a) => a.id === assignmentId);
            if (targetAssign) {
              targetAssign.customPlacementMode = fullySplit;
            }
          });
          showToast(`Ders ${fullySplit} şeklinde bölündü ve kısmen yerleştirildi (${placedCount2}/${H} saat).`, "info");
        } else {
          showToast("Ders bölünmesine rağmen yerleştirilecek uygun boşluk bulunamadı!", "error");
        }
      }
    } catch (error) {
      console.error("Ders bölünürken hata:", error);
      showToast("Ders bölünürken bir hata oluştu!", "error");
    } finally {
      setIsScheduling(false);
      setSchedulingProgress(null);
    }
  };

  const handleForceLesson = async (assignmentId: string) => {
    const assign = state.assignments.find((a) => a.id === assignmentId);
    if (!assign) {
      showToast("Ders ataması bulunamadı!", "error");
      return;
    }

    const tIds = assign.teacherId ? assign.teacherId.split(",").map(id => id.trim()).filter(Boolean) : [];
    const numDays = state.settings.days.length;
    const numPeriods = state.settings.periodsPerDay;

    // Find all assignments belonging to the same teacher(s)
    const teacherAssigns = state.assignments.filter(a => 
      a.teacherId && a.teacherId.split(',').map(x => x.trim()).some(id => tIds.includes(id))
    );
    const teacherAssignIds = new Set([assignmentId, ...teacherAssigns.map(a => a.id)]);

    // Clone the current schedule
    const clearedSchedule = JSON.parse(JSON.stringify(state.schedule));

    // Clear all slots of this teacher (or this assignment) to give the solver freedom to rearrange
    for (const cId of Object.keys(clearedSchedule)) {
      const classSched = clearedSchedule[cId];
      if (classSched) {
        for (let d = 0; d < numDays; d++) {
          const daySched = classSched[d];
          if (daySched) {
            for (let p = 0; p < numPeriods; p++) {
              const slot = daySched[p];
              if (slot && teacherAssignIds.has(slot.assignmentId)) {
                daySched[p] = null;
              }
            }
          }
        }
      }
    }

    const courseName = coursesMap.get(assign.courseId)?.name || "Ders";
    const targetTeacherName = tIds.map(id => state.teachers.find(t => t.id === id)?.name).filter(Boolean).join(", ");
    showToast(`"${courseName}" dersi zorlanarak tüm saatleri yerleştirilmeye çalışılıyor...`, "info");
    setIsScheduling(true);
    setSchedulingProgress({
      phase: "backtracking",
      percent: 15,
      message: `Öğretmenin dersleri temizlendi, yeniden çözülüyor...`,
      steps: 0,
      targetTeacherName
    });

    try {
      const stateWithClearedSlots = {
        ...state,
        schedule: clearedSchedule
      };

      // Run automatic scheduler specifically for this teacher, with target assignment prioritized
      const result = await generateAutomaticScheduleAsync(stateWithClearedSlots, (prog) => {
        setSchedulingProgress({
          phase: prog.phase,
          percent: Math.min(95, Math.round(15 + prog.percent * 0.8)),
          message: `Ders yerleştiriliyor: ${prog.message}`,
          steps: prog.steps,
          targetTeacherName
        });
      }, {
        keepExisting: true,
        targetTeacherIds: tIds.length > 0 ? tIds : undefined,
        targetClassIds: tIds.length === 0 ? [assign.classId] : undefined,
        priorityAssignmentIds: [assignmentId],
        deepSearch: true,
        numTrials: 5 // Try harder to find a valid arrangement
      });

      const placedCount = countPlacedHoursOfAssignment(result.schedule, assignmentId, numDays, numPeriods);

      if (placedCount === assign.weeklyHours) {
        updateState((draft) => {
          draft.schedule = result.schedule;
        });
        showToast(`"${courseName}" dersinin tüm saatleri (${placedCount}/${assign.weeklyHours}) başarıyla yerleştirildi!`, "success");
      } else {
        const currentPlaced = countPlacedHoursOfAssignment(state.schedule, assignmentId, numDays, numPeriods);
        if (placedCount > currentPlaced) {
          updateState((draft) => {
            draft.schedule = result.schedule;
          });
          showToast(`"${courseName}" dersi kısmen yerleştirilebildi (${placedCount}/${assign.weeklyHours} saat).`, "info");
        } else {
          showToast(`"${courseName}" dersi için uygun yerleşim bulunamadı! Çakışan öğretmen saatlerini veya sınıf kapalılıklarını kontrol edin.`, "error");
        }
      }
    } catch (error) {
      console.error("Ders zorlanırken hata:", error);
      showToast("Ders zorlanırken bir hata oluştu!", "error");
    } finally {
      setIsScheduling(false);
      setSchedulingProgress(null);
    }
  };

  const handleForceLessonAt = (dIdx: number, pIdx: number) => {
    const { slot } = getSlotAt(dIdx, pIdx);
    if (!slot) {
      showToast("Bu hücrede zorlanacak bir ders bulunamadı!", "error");
      return;
    }
    handleForceLesson(slot.assignmentId);
  };

const handleSetCustomClosureAt = (dIdx: number, pIdx: number, label: string) => {
    updateState((draft) => {
      const isClosed = label.trim() !== "";

      if (scheduleViewMode === "class") {
        const cls = draft.classes.find(c => c.id === viewingEntityId);
        if (cls) {
          if (!cls.unavailability[dIdx]) {
            cls.unavailability[dIdx] = Array(draft.settings.periodsPerDay).fill(false);
          }
          cls.unavailability[dIdx][pIdx] = isClosed;

          if (!cls.closureNames) cls.closureNames = {};
          if (!cls.closureNames[dIdx]) {
            cls.closureNames[dIdx] = Array(draft.settings.periodsPerDay).fill("");
          }
          cls.closureNames[dIdx][pIdx] = label;
        }
      } else if (scheduleViewMode === "teacher") {
        const teacher = draft.teachers.find(t => t.id === viewingEntityId);
        if (teacher) {
          if (!teacher.unavailability[dIdx]) {
            teacher.unavailability[dIdx] = Array(draft.settings.periodsPerDay).fill(false);
          }
          teacher.unavailability[dIdx][pIdx] = isClosed;

          if (!teacher.closureNames) teacher.closureNames = {};
          if (!teacher.closureNames[dIdx]) {
            teacher.closureNames[dIdx] = Array(draft.settings.periodsPerDay).fill("");
          }
          teacher.closureNames[dIdx][pIdx] = label;
        }
      } else if (scheduleViewMode === "classroom") {
        const room = draft.classrooms.find(r => r.id === viewingEntityId);
        if (room) {
          if (!room.unavailability[dIdx]) {
            room.unavailability[dIdx] = Array(draft.settings.periodsPerDay).fill(false);
          }
          room.unavailability[dIdx][pIdx] = isClosed;

          if (!room.closureNames) room.closureNames = {};
          if (!room.closureNames[dIdx]) {
            room.closureNames[dIdx] = Array(draft.settings.periodsPerDay).fill("");
          }
          room.closureNames[dIdx][pIdx] = label;
        }
      }
    });

    if (label.trim() !== "") {
      showToast(`Hücre "${label}" etiketiyle kapatıldı.`, "success");
    } else {
      showToast("Hücre kapatması kaldırıldı.", "info");
    }
  }

const handleSetCustomDistribution = (assignmentId: string, distribution: string) => {
    updateState((draft) => {
      const assign = draft.assignments.find(a => a.id === assignmentId);
      if (assign) {
        assign.customPlacementMode = distribution.trim() || undefined;
      }
    });
    if (distribution.trim() !== "") {
      showToast(`Derse özel haftalık dağılım "${distribution}" olarak kaydedildi.`, "success");
    } else {
      showToast("Derse özel dağılım sıfırlandı.", "info");
    }
  }


  // Clear search query when schedule view mode changes
  useEffect(() => {
    setSearchQuery("");
  }, [scheduleViewMode, setSearchQuery]);

  // Automatically close analysis panel when there are no conflicts and no unplaced reports
  useEffect(() => {
    if (activeConflicts.length === 0 && unplacedReports.length === 0 && isAnalysisOpen) {
      setIsAnalysisOpen(false);
    }
  }, [activeConflicts.length, unplacedReports.length, isAnalysisOpen, setIsAnalysisOpen]);

  // Automatically select the first assignment of the selected teacher or class
  useEffect(() => {
    if (scheduleViewMode === "teacher" && viewingEntityId) {
      const teacherAssignments = state.assignments.filter(a => a.teacherId && a.teacherId.split(",").includes(viewingEntityId));
      if (teacherAssignments.length > 0) {
        setSelectedAssignmentId(teacherAssignments[0].id);
      } else {
        setSelectedAssignmentId("");
      }
    } else if (scheduleViewMode === "class" && viewingEntityId) {
      const classAssignments = state.assignments.filter(a => a.classId === viewingEntityId);
      if (classAssignments.length > 0) {
        setSelectedAssignmentId(classAssignments[0].id);
      } else {
        setSelectedAssignmentId("");
      }
    }
  }, [viewingEntityId, scheduleViewMode, state.assignments, setSelectedAssignmentId]);

  // Handle outside click to dismiss context menus
  useEffect(() => {
    const handleOutsideClick = () => {
      setContextMenu(null);
      setTeacherContextMenu(null);
      setAssignmentContextMenu(null);
    };
    window.addEventListener("click", handleOutsideClick);
    return () => window.removeEventListener("click", handleOutsideClick);
  }, []);

  // Sync F3 closure name
  useEffect(() => {
    localStorage.setItem("f3_closure_name", f3ClosureName);
  }, [f3ClosureName]);

  // Global Keyboard Shortcuts (F keys & Arrow key navigation) for schedule cells and lists
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      const activeEl = document.activeElement;
      const isCellActive = activeEl && activeEl.id && activeEl.id.startsWith("cell-");

      if (isCellActive && focusedCell) {
        const { dIdx, pIdx } = focusedCell;

        if (e.key === "F2") {
          e.preventDefault();
          toggleCellUnavailabilityAt(dIdx, pIdx);
        } else if (e.key === "F3") {
          e.preventDefault();
          // If already has custom closure label, remove it! Otherwise, use preconfigured name
          let existingClosure = "";
          if (scheduleViewMode === "class" && viewingEntityId) {
            existingClosure = classesMap.get(viewingEntityId)?.closureNames?.[dIdx]?.[pIdx] || "";
          } else if (scheduleViewMode === "teacher" && viewingEntityId) {
            existingClosure = teachersMap.get(viewingEntityId)?.closureNames?.[dIdx]?.[pIdx] || "";
          } else if (scheduleViewMode === "classroom" && viewingEntityId) {
            existingClosure = classroomsMap.get(viewingEntityId)?.closureNames?.[dIdx]?.[pIdx] || "";
          }

          if (existingClosure) {
            handleSetCustomClosureAt(dIdx, pIdx, "");
          } else {
            const activeF3Name = f3ClosureName === "custom" ? "KAPALI" : f3ClosureName;
            handleSetCustomClosureAt(dIdx, pIdx, activeF3Name || "KAPALI");
          }
        } else if (e.key === "F4") {
          e.preventDefault();
          // Toggle custom teacher status presence dialog
          if (teacherStatusDialog) {
            setTeacherStatusDialog(null);
          } else {
            setTeacherStatusDialog({ dIdx, pIdx });
            setTeacherStatusSearch("");
          }
        }
      } else {
        // If no schedule cell is focused, handle ArrowUp / ArrowDown to navigate lists based on kbdFocusArea
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          if (kbdFocusArea === "entities") {
            if (scheduleViewMode === "teacher") {
              const filtered = state.teachers.filter(t =>
                t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (t.branch && t.branch.toLowerCase().includes(searchQuery.toLowerCase()))
              );
              if (filtered.length > 0) {
                const currentIdx = filtered.findIndex(t => t.id === viewingEntityId);
                let nextIdx = 0;
                if (currentIdx !== -1) {
                  if (e.key === "ArrowUp") {
                    nextIdx = currentIdx === 0 ? filtered.length - 1 : currentIdx - 1;
                  } else {
                    nextIdx = currentIdx === filtered.length - 1 ? 0 : currentIdx + 1;
                  }
                }
                const nextEntity = filtered[nextIdx];
                if (nextEntity) setViewingEntityId(nextEntity.id);
              }
            } else if (scheduleViewMode === "class") {
              const filtered = state.classes.filter(c =>
                c.name.toLowerCase().includes(searchQuery.toLowerCase())
              );
              if (filtered.length > 0) {
                const currentIdx = filtered.findIndex(c => c.id === viewingEntityId);
                let nextIdx = 0;
                if (currentIdx !== -1) {
                  if (e.key === "ArrowUp") {
                    nextIdx = currentIdx === 0 ? filtered.length - 1 : currentIdx - 1;
                  } else {
                    nextIdx = currentIdx === filtered.length - 1 ? 0 : currentIdx + 1;
                  }
                }
                const nextEntity = filtered[nextIdx];
                if (nextEntity) setViewingEntityId(nextEntity.id);
              }
            } else if (scheduleViewMode === "classroom") {
              const filtered = state.classrooms.filter(cr =>
                cr.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (cr.type && cr.type.toLowerCase().includes(searchQuery.toLowerCase()))
              );
              if (filtered.length > 0) {
                const currentIdx = filtered.findIndex(cr => cr.id === viewingEntityId);
                let nextIdx = 0;
                if (currentIdx !== -1) {
                  if (e.key === "ArrowUp") {
                    nextIdx = currentIdx === 0 ? filtered.length - 1 : currentIdx - 1;
                  } else {
                    nextIdx = currentIdx === filtered.length - 1 ? 0 : currentIdx + 1;
                  }
                }
                const nextEntity = filtered[nextIdx];
                if (nextEntity) setViewingEntityId(nextEntity.id);
              }
            }
          } else if (kbdFocusArea === "assignments") {
            let activeAssigns: LessonAssignment[] = [];
            if (scheduleViewMode === "teacher") {
              activeAssigns = state.assignments.filter(a => a.teacherId && a.teacherId.split(",").includes(viewingEntityId));
            } else if (scheduleViewMode === "class") {
              activeAssigns = state.assignments.filter(a => a.classId === viewingEntityId);
            } else if (scheduleViewMode === "classroom") {
              activeAssigns = state.assignments.filter(a => a.classroomId === viewingEntityId);
            }

            if (activeAssigns.length > 0) {
              const currentIdx = activeAssigns.findIndex(a => a.id === selectedAssignmentId);
              let nextIdx = 0;
              if (currentIdx !== -1) {
                if (e.key === "ArrowUp") {
                  nextIdx = currentIdx === 0 ? activeAssigns.length - 1 : currentIdx - 1;
                } else {
                  nextIdx = currentIdx === activeAssigns.length - 1 ? 0 : currentIdx + 1;
                }
              } else {
                nextIdx = e.key === "ArrowUp" ? activeAssigns.length - 1 : 0;
              }
              const nextAssign = activeAssigns[nextIdx];
              if (nextAssign) setSelectedAssignmentId(nextAssign.id);
            }
          }
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [focusedCell, scheduleViewMode, viewingEntityId, state, searchQuery, f3ClosureName, teacherStatusDialog, toggleCellUnavailabilityAt, handleSetCustomClosureAt, setViewingEntityId, kbdFocusArea, selectedAssignmentId, setSelectedAssignmentId]);

  // Return the main schedule view logic
  const totalAssignedHours = state.assignments.reduce((sum, a) => sum + a.weeklyHours, 0);
              let totalPlacedHours = 0;
              Object.keys(state.schedule).forEach((classId) => {
                const classSched = state.schedule[classId];
                if (classSched) {
                  Object.keys(classSched).forEach((dayIdxKey) => {
                    const periods = classSched[parseInt(dayIdxKey, 10)];
                    if (periods) {
                      periods.forEach((slot) => {
                        if (slot) {
                          totalPlacedHours++;
                        }
                      });
                    }
                  });
                }
              });

              // Helper to identify selected active assignment
              const currentActiveAssignment = selectedAssignmentId ? state.assignments.find(a => a.id === selectedAssignmentId) : undefined;

              const getCellStatusForActiveAssignment = (dIdx: number, pIdx: number) => {
                if (!currentActiveAssignment) {
                  return { isImpossible: false, isSuitable: false, reason: "" };
                }

                // 0. Check weekly hours limit - Bypassed for visual suitability highlighting as requested
                // to allow users to see alternative placement solutions even if all hours are already placed.

                // 1. Check daily periods limit for the class of the assignment
                const targetClassObj = classesMap.get(currentActiveAssignment.classId);
                if (targetClassObj && targetClassObj.dailyPeriods) {
                  const maxPeriodsThisDay = targetClassObj.dailyPeriods[dIdx];
                  if (maxPeriodsThisDay !== undefined && pIdx >= maxPeriodsThisDay) {
                    return { isImpossible: true, isSuitable: false, reason: "Sınıfın günlük ders saati sınırı dışında." };
                  }
                }

                // 2. Check unavailability locks
                // a) Teacher unavailability
                const tIds = parseTeacherIds(currentActiveAssignment.teacherId);
                for (const tId of tIds) {
                  const teacherObj = teachersMap.get(tId);
                  if (teacherObj && teacherObj.unavailability?.[dIdx]?.[pIdx]) {
                    return { isImpossible: true, isSuitable: false, reason: `Öğretmen (${teacherObj.name}) bu saatte kapalı.` };
                  }
                }

                // b) Class unavailability
                if (targetClassObj && targetClassObj.unavailability?.[dIdx]?.[pIdx]) {
                  return { isImpossible: true, isSuitable: false, reason: "Sınıf bu saatte kapalı." };
                }

                // c) Classroom unavailability
                if (currentActiveAssignment.classroomId) {
                  const classroomObj = classroomsMap.get(currentActiveAssignment.classroomId);
                  if (classroomObj && classroomObj.unavailability?.[dIdx]?.[pIdx]) {
                    return { isImpossible: true, isSuitable: false, reason: "Atölye bu saatte kapalı." };
                  }
                }

                // 3. Check busy states (Teacher busy elsewhere, Class busy elsewhere, Classroom busy elsewhere)
                // a) Teacher busy elsewhere
                for (const tId of tIds) {
                  for (const otherClassId of Object.keys(state.schedule)) {
                    if (otherClassId === currentActiveAssignment.classId) continue;
                    const otherSlot = state.schedule[otherClassId]?.[dIdx]?.[pIdx];
                    if (otherSlot && otherSlot.teacherId) {
                      const otherTIds = parseTeacherIds(otherSlot.teacherId);
                      if (otherTIds.includes(tId)) {
                        const tName = teachersMap.get(tId)?.name || "Öğretmen";
                        const otherClassName = classesMap.get(otherClassId)?.name || "başka sınıf";
                        return { isImpossible: true, isSuitable: false, reason: `${tName} bu saatte ${otherClassName} sınıfında derste.` };
                      }
                    }
                  }
                }

                // b) Class busy elsewhere
                const classSlot = state.schedule[currentActiveAssignment.classId]?.[dIdx]?.[pIdx];
                if (classSlot && classSlot.assignmentId !== currentActiveAssignment.id) {
                  return { isImpossible: true, isSuitable: false, reason: "Sınıfın bu saatte başka bir dersi var." };
                }

                // c) Classroom busy elsewhere
                if (currentActiveAssignment.classroomId) {
                  for (const otherClassId of Object.keys(state.schedule)) {
                    if (otherClassId === currentActiveAssignment.classId) continue;
                    const otherSlot = state.schedule[otherClassId]?.[dIdx]?.[pIdx];
                    if (otherSlot && otherSlot.classroomId === currentActiveAssignment.classroomId) {
                      const rName = classroomsMap.get(currentActiveAssignment.classroomId)?.name || "Atölye";
                      const otherClassName = classesMap.get(otherClassId)?.name || "başka sınıf";
                      return { isImpossible: true, isSuitable: false, reason: `${rName} bu saatte ${otherClassName} tarafından kullanılıyor.` };
                    }
                  }
                }

                // 4. Check if currently empty in the active view
                let cellIsCurrentlyEmpty = true;
                if (scheduleViewMode === "class" && viewingEntityId) {
                  cellIsCurrentlyEmpty = !state.schedule[viewingEntityId]?.[dIdx]?.[pIdx];
                } else if (scheduleViewMode === "teacher" && viewingEntityId) {
                  let teacherIsEmpty = true;
                  for (const cId of Object.keys(state.schedule)) {
                    const classS = state.schedule[cId];
                    const sl = classS?.[dIdx]?.[pIdx];
                    if (sl && sl.teacherId && sl.teacherId.split(",").includes(viewingEntityId)) {
                      teacherIsEmpty = false;
                      break;
                    }
                  }
                  cellIsCurrentlyEmpty = teacherIsEmpty;
                } else if (scheduleViewMode === "classroom" && viewingEntityId) {
                  let classroomIsEmpty = true;
                  for (const cId of Object.keys(state.schedule)) {
                    const classS = state.schedule[cId];
                    const sl = classS?.[dIdx]?.[pIdx];
                    if (sl && sl.classroomId === viewingEntityId) {
                      classroomIsEmpty = false;
                      break;
                    }
                  }
                  cellIsCurrentlyEmpty = classroomIsEmpty;
                }

                return { isImpossible: false, isSuitable: cellIsCurrentlyEmpty, reason: "" };
              };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col flex-1 text-slate-800"
      >
                  {/* 2. Alt Gövde: Dikey akışlı tam genişlikte yerleşim */}
                  <div className="flex flex-col gap-2.5 pb-1">
                  
                  {/* PROGRAM TABLOSU (Tam Genişlikte, Sağında ve Solunda Yer Kaplanmaz) */}
                  <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col">
                    
                    {/* Header: Title & Görünüm Sekmeleri (Above the table) */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between pb-0 mb-0 shrink-0 gap-2 border-b-0">
                      <div className="flex items-center space-x-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                          {scheduleViewMode === "teacher" && viewingEntityId && (
                            <span>👨‍🏫 {teachersMap.get(viewingEntityId)?.name} • HAFTALIK DERS PROGRAMI</span>
                          )}
                          {scheduleViewMode === "class" && viewingEntityId && (
                            <span>🏫 {classesMap.get(viewingEntityId)?.name} Sınıfı • HAFTALIK DERS PROGRAMI</span>
                          )}
                          {scheduleViewMode === "classroom" && viewingEntityId && (
                            <span>🛠️ {classroomsMap.get(viewingEntityId)?.name} Atölyesi • HAFTALIK PROGRAM</span>
                          )}
                          {!viewingEntityId && <span>DERS PROGRAMI MATRİSİ</span>}
                        </h3>
                      </div>

                      {/* GÖRÜNÜM SEKMELERİ (Sekmeler Programın Üstünde - Daha Büyük Yapıldı) */}
                      <div className="flex items-center gap-3 shrink-0 m-0">
                        <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest hidden sm:inline m-0">
                          GÖRÜNÜM SEKMELERİ:
                        </span>
                        <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 shadow-inner m-0">
                          <button
                            onClick={() => {
                              setScheduleViewMode("teacher");
                              if (state.teachers.length > 0) {
                                setViewingEntityId(state.teachers[0].id);
                              } else {
                                setViewingEntityId("");
                              }
                            }}
                            className={`py-2.5 px-6 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all duration-200 text-center cursor-pointer ${
                              scheduleViewMode === "teacher"
                                ? "bg-white text-blue-700 shadow-md transform scale-105"
                                : "text-slate-600 hover:text-slate-900"
                            }`}
                          >
                            Öğretmen
                          </button>
                          <button
                            onClick={() => {
                              setScheduleViewMode("class");
                              if (state.classes.length > 0) {
                                setViewingEntityId(state.classes[0].id);
                              } else {
                                setViewingEntityId("");
                              }
                            }}
                            className={`py-2.5 px-6 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all duration-200 text-center cursor-pointer ${
                              scheduleViewMode === "class"
                                ? "bg-white text-blue-700 shadow-md transform scale-105"
                                : "text-slate-600 hover:text-slate-900"
                            }`}
                          >
                            Sınıf
                          </button>
                          <button
                            onClick={() => {
                              setScheduleViewMode("classroom");
                              if (state.classrooms.length > 0) {
                                setViewingEntityId(state.classrooms[0].id);
                              } else {
                                setViewingEntityId("");
                              }
                            }}
                            className={`py-2.5 px-6 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all duration-200 text-center cursor-pointer ${
                              scheduleViewMode === "classroom"
                                ? "bg-white text-blue-700 shadow-md transform scale-105"
                                : "text-slate-600 hover:text-slate-900"
                            }`}
                          >
                            Atölye
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Matrix Grid Container - Set with high-density view to fit perfectly without forcing viewport locks */}
                    <div className="overflow-x-auto border border-slate-100 rounded-xl bg-slate-50/30 p-1">
                      <table className="w-full table-fixed border-collapse text-left text-xs text-slate-400">
                        <thead>
                          <tr className="border-b border-slate-200/80 text-[8.5px] text-slate-500 uppercase tracking-wider bg-slate-50/50">
                            <th className="py-1 px-1 font-extrabold text-slate-600 w-10 text-center bg-slate-50/50">GÜN</th>
                            {Array.from({ length: state.settings.periodsPerDay }).map((_, i) => {
                              const isLunchBreakAfter = state.settings.lunchBreakAfter === i + 1;
                              return (
                                <React.Fragment key={i}>
                                  <th className="py-1 px-0.5 text-center font-extrabold text-slate-600 bg-slate-50/50">
                                    {i + 1}. Ders
                                    <span className="block text-[7px] text-slate-400 font-normal mt-0 font-mono">
                                      {state.settings.periodTimes[i]?.start} - {state.settings.periodTimes[i]?.end}
                                    </span>
                                  </th>
                                  {isLunchBreakAfter && (
                                    <th className="w-5 py-1 px-0 text-center font-black text-[7px] text-amber-800 bg-yellow-50 border-l border-r border-yellow-200/40 uppercase tracking-tight">
                                      Ö
                                    </th>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {state.settings.days.map((day, dIdx) => (
                            <tr key={dIdx} className="hover:bg-slate-50/50 transition-colors">
                              <td className="py-0.5 px-0.5 font-bold text-slate-700 uppercase bg-slate-50/30 text-center text-[9px] border-r border-slate-100 font-sans tracking-tight">
                                {day.substring(0, 3)}
                              </td>
                              
                              {Array.from({ length: state.settings.periodsPerDay }).map((_, pIdx) => {
                                let slot: ScheduleSlot | null = null;
                                let activeClassId = "";
                                let cellIsUnavailabilityLocked = false;
                                let cellIsImpossiblePeriod = false;
                                let closureName = "";
                                let classroomSlots: Array<{ slot: ScheduleSlot; classId: string }> = [];

                                if (scheduleViewMode === "class" && viewingEntityId) {
                                  activeClassId = viewingEntityId;
                                  slot = state.schedule[viewingEntityId]?.[dIdx]?.[pIdx] || null;
                                  cellIsUnavailabilityLocked = classesMap.get(viewingEntityId)?.unavailability[dIdx]?.[pIdx] || false;
                                  closureName = classesMap.get(viewingEntityId)?.closureNames?.[dIdx]?.[pIdx] || "";
                                  
                                  const currentClassObj = classesMap.get(viewingEntityId);
                                  if (currentClassObj && currentClassObj.dailyPeriods) {
                                    const maxPeriodsThisDay = currentClassObj.dailyPeriods[dIdx];
                                    if (maxPeriodsThisDay !== undefined && pIdx >= maxPeriodsThisDay) {
                                      cellIsImpossiblePeriod = true;
                                    }
                                  }
                                } 
                                else if (scheduleViewMode === "teacher" && viewingEntityId) {
                                  cellIsUnavailabilityLocked = teachersMap.get(viewingEntityId)?.unavailability[dIdx]?.[pIdx] || false;
                                  closureName = teachersMap.get(viewingEntityId)?.closureNames?.[dIdx]?.[pIdx] || "";
                                  for (const cId of Object.keys(state.schedule)) {
                                    const classS = state.schedule[cId];
                                    const sl = classS?.[dIdx]?.[pIdx];
                                    if (sl && sl.teacherId && sl.teacherId.split(",").includes(viewingEntityId)) {
                                      slot = sl;
                                      activeClassId = cId;
                                      break;
                                    }
                                  }
                                } 
                                else if (scheduleViewMode === "classroom" && viewingEntityId) {
                                  cellIsUnavailabilityLocked = classroomsMap.get(viewingEntityId)?.unavailability[dIdx]?.[pIdx] || false;
                                  closureName = classroomsMap.get(viewingEntityId)?.closureNames?.[dIdx]?.[pIdx] || "";
                                  for (const cId of Object.keys(state.schedule)) {
                                    const classS = state.schedule[cId];
                                    const sl = classS?.[dIdx]?.[pIdx];
                                    if (sl && sl.classroomId === viewingEntityId) {
                                      classroomSlots.push({ slot: sl, classId: cId });
                                    }
                                  }
                                  if (classroomSlots.length > 0) {
                                    slot = classroomSlots[0].slot;
                                    activeClassId = classroomSlots[0].classId;
                                  }
                                }

                                const isSpecialClosure = !!(closureName && closureName.trim() !== "" && closureName.trim().toUpperCase() !== "KAPALI");

                                const cellConflicts = activeConflicts.filter(
                                  (conf) => conf.dayIndex === dIdx && conf.periodIndex === pIdx && (
                                    (scheduleViewMode === "class" && conf.details.classId === viewingEntityId) ||
                                    (scheduleViewMode === "teacher" && conf.details.teacherId === viewingEntityId) ||
                                    (scheduleViewMode === "classroom" && conf.details.classroomId === viewingEntityId)
                                  )
                                );

                                const hasConflict = cellConflicts.length > 0;

                                // Check if coordination or headship course (koordinatörlük veya şeflik)
                                const isSefflikOrKoordinatorluk = (() => {
                                  if (!slot) return false;
                                  const course = coursesMap.get(slot.courseId);
                                  if (!course) return false;
                                  return isChefOrCoordinatorCourse(course.name, course.code);
                                })();

                                // Determine active status and color coding
                                const activeStatus = getCellStatusForActiveAssignment(dIdx, pIdx);

                                const isAssignmentPartiallyPlaced = !!(currentActiveAssignment && getAssignmentPlacedHours(currentActiveAssignment.id) < currentActiveAssignment.weeklyHours);

                                const canAssignToCell = (() => {
                                  if (!currentActiveAssignment) return false;
                                  const isAlreadyAssignedInThisCell = slot && slot.assignmentId === currentActiveAssignment.id;
                                  if (isAlreadyAssignedInThisCell) return false;

                                  // 1. Daily periods limit for the class of the assignment
                                  const targetClassObj = classesMap.get(currentActiveAssignment.classId);
                                  if (targetClassObj && targetClassObj.dailyPeriods) {
                                    const maxPeriodsThisDay = targetClassObj.dailyPeriods[dIdx];
                                    if (maxPeriodsThisDay !== undefined && pIdx >= maxPeriodsThisDay) {
                                      return false;
                                    }
                                  }

                                  // 2. Unavailability locks
                                  // a) Teacher unavailability
                                  const tIds = currentActiveAssignment.teacherId 
                                    ? currentActiveAssignment.teacherId.split(",").map(id => id.trim()).filter(Boolean) 
                                    : [];
                                  for (const tId of tIds) {
                                    const teacherObj = teachersMap.get(tId);
                                    if (teacherObj && teacherObj.unavailability?.[dIdx]?.[pIdx]) {
                                      return false;
                                    }
                                  }

                                  // b) Class unavailability
                                  if (targetClassObj && targetClassObj.unavailability?.[dIdx]?.[pIdx]) {
                                    return false;
                                  }

                                  // c) Classroom unavailability
                                  if (currentActiveAssignment.classroomId) {
                                    const classroomObj = classroomsMap.get(currentActiveAssignment.classroomId);
                                    if (classroomObj && classroomObj.unavailability?.[dIdx]?.[pIdx]) {
                                      return false;
                                    }
                                  }

                                  // 3. Busy states (Teacher busy elsewhere in another class)
                                  for (const tId of tIds) {
                                    for (const otherClassId of Object.keys(state.schedule)) {
                                      if (otherClassId === currentActiveAssignment.classId) continue;
                                      const otherSlot = state.schedule[otherClassId]?.[dIdx]?.[pIdx];
                                      if (otherSlot && otherSlot.teacherId) {
                                        const otherTIds = otherSlot.teacherId.split(",").map(id => id.trim()).filter(Boolean);
                                        if (otherTIds.includes(tId)) {
                                          return false;
                                        }
                                      }
                                    }
                                  }

                                  return true;
                                })();

                                let cellStyle = "";

                                if (cellIsImpossiblePeriod) {
                                  // Ders saati mümkün olmayan kutular koyu gri / füme
                                  cellStyle = "bg-slate-700 text-slate-500 font-medium cursor-not-allowed select-none opacity-85 border border-slate-800";
                                } else if (slot) {
                                  const isMultiTeacher = slot.teacherId && slot.teacherId.split(",").length > 1;

                                  if (slot.isLocked) {
                                    // Kilitlenmiş / sabitlenmiş ders kırmızı (per user request!)
                                    cellStyle = "bg-rose-600 text-white font-extrabold border border-rose-700 shadow-sm cursor-pointer";
                                  } else if (hasConflict) {
                                    // çakışan veya yerleştirilemeyen dersler kırmızı/uyarı rengi (per user request!)
                                    cellStyle = "bg-red-500 text-white font-bold border border-red-600 hover:bg-red-600 cursor-pointer animate-pulse-subtle";
                                  } else if (isSefflikOrKoordinatorluk) {
                                    // koordinatörlük veya şeflik görevi verilen kutular pembe (per user request!)
                                    cellStyle = "bg-pink-100 text-pink-850 font-bold border border-pink-200";
                                  } else if (isMultiTeacher) {
                                    // bir derse birden fazla öğretmen giriyorsa o ders yerleştirildiğinde açık mor
                                    cellStyle = "bg-purple-100 text-purple-850 font-bold border border-purple-200";
                                  } else {
                                    // normal yerleşen hücre & atölye dersleri: soluk mavi
                                    cellStyle = "bg-blue-100 text-blue-850 font-bold border border-blue-200";
                                  }

                                  // If an assignment is selected, and this cell has no collision elsewhere (open/available slot)
                                  // and the slot is locked, show thick green border
                                  if (selectedAssignmentId && !activeStatus.isImpossible && slot.isLocked) {
                                    cellStyle += " highlight-green-border";
                                  }
                                } else if (cellIsUnavailabilityLocked) {
                                  if (isSpecialClosure) {
                                    // özel kapatma ile kapatılmışsa turuncu olsun!
                                    cellStyle = "bg-orange-100 text-orange-950 border border-orange-200 cursor-not-allowed select-none";
                                  } else {
                                    // normal kapatılmışsa tam kırmızı olsun! (per user request!)
                                    cellStyle = "bg-red-600 text-white font-extrabold border border-red-700 cursor-not-allowed select-none shadow-sm";
                                  }

                                  // If an assignment is selected, and this cell has no collision elsewhere (open/available slot)
                                  // then show thick green border even if it is unavailability locked
                                  if (selectedAssignmentId && !activeStatus.isImpossible) {
                                    cellStyle += " highlight-green-border";
                                  }
                                } else if (selectedAssignmentId && activeStatus.isImpossible) {
                                  // Atanamayacak çakışmalı kutular kırmızı gölgeli
                                  cellStyle = "bg-red-50 text-red-500 border border-red-200/50 cursor-not-allowed select-none";
                                } else if (selectedAssignmentId && activeStatus.isSuitable) {
                                  // Atanabilir uygun kutular açık yeşil (soluk yeşil per user request!)
                                  cellStyle = "bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-extrabold border border-emerald-300 cursor-pointer transition-all duration-100";
                                } else {
                                  // boş kutular nötr gri tonla (per user request!)
                                  if (viewingEntityId) {
                                    cellStyle = "bg-slate-50 border border-dashed border-slate-200 hover:bg-slate-100 hover:text-blue-700 text-slate-400 cursor-pointer transition-colors";
                                  } else {
                                    cellStyle = "bg-slate-100/60 text-slate-400 border border-dashed border-slate-200/80";
                                  }
                                }

                                if (slot && selectedAssignmentId === slot.assignmentId) {
                                  cellStyle += " highlight-yellow-border ring-2 ring-yellow-400/80 z-30 shadow-lg shadow-yellow-200/40 scale-[1.02]";
                                } else if (selectedAssignmentId && isAssignmentPartiallyPlaced && canAssignToCell) {
                                  cellStyle += " highlight-orange-border ring-2 ring-orange-500/80 z-30 shadow-lg shadow-orange-200/40 scale-[1.01]";
                                }

                                // Define typography colors depending on background
                                let textClass = "text-slate-700";
                                let badgeClass = "bg-slate-200 text-slate-800";
                                let roomBadgeClass = "bg-slate-200/70 text-slate-700";

                                if (cellIsImpossiblePeriod) {
                                  textClass = "text-slate-500";
                                } else if (slot) {
                                  const isMultiTeacher = slot.teacherId && slot.teacherId.split(",").length > 1;

                                  if (slot.isLocked) {
                                    textClass = "text-white";
                                    badgeClass = "bg-white/20 text-white";
                                    roomBadgeClass = "bg-white/10 text-white";
                                  } else if (hasConflict) {
                                    textClass = "text-white";
                                    badgeClass = "bg-white/20 text-white";
                                    roomBadgeClass = "bg-white/10 text-white";
                                  } else if (isSefflikOrKoordinatorluk) {
                                    textClass = "text-pink-900";
                                    badgeClass = "bg-pink-200 text-pink-900";
                                    roomBadgeClass = "bg-pink-200/70 text-pink-900";
                                  } else if (isMultiTeacher) {
                                    textClass = "text-purple-900";
                                    badgeClass = "bg-purple-200 text-purple-900";
                                    roomBadgeClass = "bg-purple-200/70 text-purple-900";
                                  } else {
                                    textClass = "text-blue-900";
                                    badgeClass = "bg-blue-200 text-blue-900";
                                    roomBadgeClass = "bg-blue-200/70 text-blue-900";
                                  }
                                }

                                const isLunchBreakAfter = state.settings.lunchBreakAfter === pIdx + 1;
                                return (
                                  <React.Fragment key={pIdx}>
                                    <td className="p-0 border border-slate-200">
                                      <div
                                        id={`cell-${dIdx}-${pIdx}`}
                                        tabIndex={cellIsImpossiblePeriod ? -1 : 0}
                                        onKeyDown={(e) => {
                                          if (cellIsImpossiblePeriod) return;
                                          handleCellKeyDown(e, dIdx, pIdx);
                                        }}
                                        onFocus={() => {
                                          if (cellIsImpossiblePeriod) return;
                                          setFocusedCell({ dIdx, pIdx });
                                        }}
                                        onContextMenu={(e) => {
                                          if (cellIsImpossiblePeriod) return;
                                          e.preventDefault();
                                          setContextMenu({
                                            visible: true,
                                            x: e.clientX,
                                            y: e.clientY,
                                            dIdx,
                                            pIdx
                                          });
                                          setFocusedCell({ dIdx, pIdx });
                                        }}
                                        onDoubleClick={() => {
                                          if (cellIsImpossiblePeriod) return;
                                          handleCellDoubleClick(dIdx, pIdx);
                                        }}
                                        onClick={() => {
                                          if (cellIsImpossiblePeriod) return;
                                          handleCellClick(dIdx, pIdx);
                                        }}
                                        draggable={slot !== null && !cellIsUnavailabilityLocked && !cellIsImpossiblePeriod}
                                        onDragStart={(e) => {
                                          if (slot) {
                                            handleDragStart(e, dIdx, pIdx, activeClassId);
                                          }
                                        }}
                                        onDragOver={(e) => {
                                          if (!cellIsImpossiblePeriod && !cellIsUnavailabilityLocked) {
                                            e.preventDefault();
                                          }
                                        }}
                                        onDrop={(e) => {
                                          if (!cellIsImpossiblePeriod && !cellIsUnavailabilityLocked) {
                                            handleDrop(e, dIdx, pIdx, activeClassId);
                                          }
                                        }}
                                        className={`w-full h-[50px] m-0 p-0 flex flex-col justify-center items-center text-center relative shrink-0 rounded-none leading-none transition-all duration-100 select-none focus:outline-none focus:ring-2 focus:ring-blue-600 focus:z-10 hover:brightness-95 hover:scale-[1.01] ${
                                          viewingEntityId && !cellIsImpossiblePeriod ? "cursor-pointer" : "cursor-default"
                                        } ${cellStyle}`}
                                      >
                                        {cellIsImpossiblePeriod ? (
                                          null
                                        ) : slot ? (
                                          <div className="w-full h-full flex flex-col justify-center items-center p-0.5 leading-tight">
                                            {/* Content based on the selected tab */}
                                            {scheduleViewMode === "teacher" ? (
                                              <>
                                                <span
                                                  className={`text-[10px] font-black tracking-tight truncate max-w-full uppercase px-1.5 py-0.5 rounded transition ${badgeClass}`}
                                                >
                                                  {classesMap.get(activeClassId)?.name || "SINIF"}
                                                </span>
                                                <span className={`text-[9px] font-semibold tracking-normal truncate max-w-full mt-1 flex items-center gap-0.5 justify-center ${textClass}`}>
                                                  {slot.isLocked && <Lock className="w-2.5 h-2.5 shrink-0" />}
                                                  <span>{coursesMap.get(slot.courseId)?.name || "DERS"}</span>
                                                </span>
                                                {slot.classroomId && (() => {
                                                  const roomObj = classroomsMap.get(slot.classroomId);
                                                  if (!roomObj) return null;
                                                  return (
                                                    <span
                                                      className={`text-[8px] font-bold px-1 py-0.2 rounded transition mt-0.5 inline-flex items-center gap-0.5 ${roomBadgeClass}`}
                                                    >
                                                      <Home className="w-2 h-2" />
                                                      <span>{roomObj.shortName || roomObj.name}</span>
                                                    </span>
                                                  );
                                                })()}
                                              </>
                                            ) : scheduleViewMode === "class" ? (
                                              <>
                                                {(() => {
                                                  const assignedTeachers = slot.teacherId ? slot.teacherId.split(",").map(id => teachersMap.get(id)).filter(Boolean) : [];
                                                  return (
                                                    <div className="flex flex-wrap gap-0.5 justify-center max-w-full">
                                                      {assignedTeachers.map((t) => (
                                                        <span
                                                          key={t.id}
                                                          className={`text-[9px] font-black tracking-tight truncate max-w-[80px] uppercase px-1 py-0.5 rounded transition ${badgeClass}`}
                                                        >
                                                          {t.name.split(" ")[0]}
                                                        </span>
                                                      ))}
                                                    </div>
                                                  );
                                                })()}
                                                <span className={`text-[9px] font-semibold tracking-normal truncate max-w-full mt-1 flex items-center gap-0.5 justify-center ${textClass}`}>
                                                  {slot.isLocked && <Lock className="w-2.5 h-2.5 shrink-0" />}
                                                  <span>{coursesMap.get(slot.courseId)?.name || "DERS"}</span>
                                                </span>
                                                {slot.classroomId && (() => {
                                                  const roomObj = classroomsMap.get(slot.classroomId);
                                                  if (!roomObj) return null;
                                                  return (
                                                    <span
                                                      className={`text-[8px] font-bold px-1 py-0.2 rounded transition mt-0.5 inline-flex items-center gap-0.5 ${roomBadgeClass}`}
                                                    >
                                                      <Home className="w-2 h-2" />
                                                      <span>{roomObj.shortName || roomObj.name}</span>
                                                    </span>
                                                  );
                                                })()}
                                              </>
                                            ) : scheduleViewMode === "classroom" ? (
                                              <div className="flex flex-col gap-0.5 w-full max-h-full overflow-y-auto p-0.5 leading-none">
                                                {classroomSlots.map((item, idx) => {
                                                  const sl = item.slot;
                                                  const clsObj = classesMap.get(item.classId);
                                                  const assignedTeachers = sl.teacherId ? sl.teacherId.split(",").map(id => teachersMap.get(id)).filter(Boolean) : [];
                                                  return (
                                                    <div key={idx} className="flex flex-col items-center bg-white/60 px-1 py-0.5 rounded border border-slate-200 text-slate-800 w-full mb-0.5 last:mb-0 shadow-[0_1px_2px_rgba(0,0,0,0.03)] leading-none">
                                                      {clsObj && (
                                                        <span className="text-[7.5px] font-black text-blue-900 bg-blue-100 px-1 py-0.1 rounded uppercase tracking-wide leading-none">
                                                          {clsObj.name}
                                                        </span>
                                                      )}
                                                      <span className="text-[8px] font-bold text-slate-900 truncate max-w-full mt-0.5 leading-none">
                                                        {coursesMap.get(sl.courseId)?.name || "DERS"}
                                                      </span>
                                                      {assignedTeachers.length > 0 && (
                                                        <span className="text-[7px] text-slate-500 font-medium truncate max-w-full leading-none mt-0.5">
                                                          {assignedTeachers.map(t => t.name.split(" ")[0]).join(", ")}
                                                        </span>
                                                      )}
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            ) : (
                                              <>
                                                {(() => {
                                                  const assignedTeachers = slot.teacherId ? slot.teacherId.split(",").map(id => teachersMap.get(id)).filter(Boolean) : [];
                                                  const clsObj = classesMap.get(activeClassId);
                                                  return (
                                                    <div className="flex flex-col items-center gap-0.5 w-full">
                                                      {clsObj && (
                                                        <span
                                                          className={`text-[9px] font-black tracking-tight truncate max-w-full uppercase px-1.5 py-0.5 rounded transition ${badgeClass}`}
                                                        >
                                                          {clsObj.name}
                                                        </span>
                                                      )}
                                                      <div className="flex flex-wrap gap-0.5 justify-center max-w-full mt-0.5">
                                                        {assignedTeachers.map((t) => (
                                                          <span
                                                            key={t.id}
                                                            className={`text-[8px] font-bold px-1 py-0.2 rounded transition ${roomBadgeClass}`}
                                                          >
                                                            {t.name.split(" ")[0]}
                                                          </span>
                                                        ))}
                                                      </div>
                                                    </div>
                                                  );
                                                })()}
                                                <span className={`text-[9px] font-semibold tracking-normal truncate max-w-full mt-1 flex items-center gap-0.5 justify-center ${textClass}`}>
                                                  {slot.isLocked && <Lock className="w-2.5 h-2.5 shrink-0" />}
                                                  <span>{coursesMap.get(slot.courseId)?.name || "DERS"}</span>
                                                </span>
                                              </>
                                            )}

                                            {hasConflict && !slot.isLocked && (
                                              <div className="absolute top-0.5 right-0.5 bg-rose-600 rounded-full p-0.5 border border-white">
                                                <AlertTriangle className="w-1.5 h-1.5 text-white" />
                                              </div>
                                            )}
                                          </div>
                                        ) : cellIsUnavailabilityLocked ? (
                                          <div className="flex flex-col items-center justify-center">
                                            <Lock className={`w-2.5 h-2.5 ${isSpecialClosure ? "text-orange-700" : "text-red-100"} shrink-0 mb-0.5`} />
                                            <span className={`text-[7.5px] font-extrabold tracking-tight uppercase truncate max-w-[65px] ${isSpecialClosure ? "text-orange-950" : "text-white"} font-black`}>{closureName || "KAPALI"}</span>
                                          </div>
                                        ) : selectedAssignmentId && activeStatus.isImpossible ? (
                                          <div className="flex flex-col items-center justify-center p-0.5 text-center" title={activeStatus.reason}>
                                            <AlertTriangle className="w-3 h-3 text-red-500 mb-0.5" />
                                            <span className="text-[6.5px] font-black tracking-wider uppercase text-red-400">ENGEL</span>
                                            <span className="text-[5.5px] font-bold text-slate-400 leading-tight truncate max-w-[65px] mt-0.5 block">
                                              {activeStatus.reason.split(" ")[0]}
                                            </span>
                                          </div>
                                        ) : (
                                          <div className="flex flex-col items-center justify-center">
                                            {selectedAssignmentId && activeStatus.isSuitable ? (
                                              <>
                                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 animate-bounce" />
                                                <span className="text-[6.5px] font-black tracking-wider uppercase text-emerald-700 mt-0.5 animate-pulse">UYGUN</span>
                                              </>
                                            ) : scheduleViewMode === "class" && viewingEntityId ? (
                                              <>
                                                <Plus className="w-2.5 h-2.5 text-emerald-100 opacity-80" />
                                                <span className="text-[6.5px] font-black tracking-wider uppercase text-emerald-100 opacity-80">BOŞ</span>
                                              </>
                                            ) : (
                                              <span className="text-[6.5px] font-black tracking-wider uppercase opacity-60">BOŞ</span>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                    {isLunchBreakAfter && (
                                      <td className="p-0 border border-slate-200 bg-yellow-50/50 select-none w-5" title={`Öğle Arası (${state.settings.lunchBreakDuration || 45} dk)`}>
                                        <div className="flex flex-col items-center justify-center h-[56px] text-[7px] text-amber-800/80 font-black leading-none py-1 space-y-0.5">
                                          <span>Ö</span>
                                          <span>Ğ</span>
                                          <span>L</span>
                                          <span>E</span>
                                        </div>
                                      </td>
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* AKILLI ÇİZELGELEME VE OTOMASYON (Sade & Az Yer Kaplayan Tasarım) */}
                    <div className="mt-3 p-2 bg-slate-50 border border-slate-200/60 rounded-xl flex items-center justify-between gap-2 flex-wrap shrink-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {scheduleViewMode === "teacher" && (
                          <>
                            {viewingEntityId && (
                              <button
                                onClick={handleScheduleSelectedTeacher}
                                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                              >
                                Öğretmeni Yerleştir (önerilir)
                              </button>
                            )}
                            <button
                              onClick={handleAutoGenerateClick}
                              className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-bold text-[11px] px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                            >
                              Hepsini Yerleştir
                            </button>
                            <button
                              onClick={handleClearSchedule}
                              className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-[11px] px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                            >
                              Temizle
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => setIsSchedulerSettingsOpen(!isSchedulerSettingsOpen)}
                          className={`font-bold text-[11px] px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1 border ${
                            isSchedulerSettingsOpen 
                              ? "bg-blue-600 border-blue-700 text-white" 
                              : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300"
                          }`}
                        >
                          <Settings className="w-3.5 h-3.5 shrink-0" />
                          <span>Algoritma Ayarları</span>
                        </button>
                        <button
                          onClick={() => setIsShortcutsOpen(!isShortcutsOpen)}
                          className={`font-bold text-[11px] px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1 border ${
                            isShortcutsOpen 
                              ? "bg-blue-600 border-blue-700 text-white" 
                              : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300"
                          }`}
                        >
                          <Info className="w-3.5 h-3.5 shrink-0" />
                          <span>Kısayollar & Mouse Kontrolleri</span>
                        </button>
                      </div>

                      {/* Sağ Kısım: Akıllı Otomasyon Doluluk İstatistiği */}
                      <div className="flex items-center space-x-2 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-xs shrink-0 self-center">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                        </span>
                        <span className="text-[10px] font-black text-slate-700 uppercase tracking-wider">
                          DOLULUK:
                        </span>
                        <span className="text-[10px] font-extrabold text-blue-600 font-mono">
                          %{totalAssignedHours > 0 ? Math.round((totalPlacedHours / totalAssignedHours) * 100) : 0}
                        </span>
                        <span className="text-[9px] text-slate-400 font-bold">
                          ({totalPlacedHours}/{totalAssignedHours} Saat)
                        </span>
                      </div>
                    </div>

                    {/* COLLAPSIBLE ALGORİTMA AYARLARI PANELİ */}
                    <AnimatePresence>
                      {isSchedulerSettingsOpen && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-3 p-4 bg-white border border-slate-200 rounded-xl shadow-sm text-xs text-slate-800 space-y-4 overflow-hidden shrink-0"
                        >
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <span className="font-bold text-slate-900 uppercase tracking-wide flex items-center gap-1.5 text-blue-700">
                              <Settings className="w-4 h-4 text-blue-600 shrink-0" />
                              Ders Programı Algoritma ve Dağıtım Ayarları
                            </span>
                            <button 
                              onClick={() => setIsSchedulerSettingsOpen(false)}
                              className="text-slate-400 hover:text-slate-600 font-bold px-1.5 py-0.5 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            >
                              ✕
                            </button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Option 1: Group lessons mode */}
                            <div className="flex flex-col gap-1.5 col-span-1 md:col-span-2">
                              <span className="font-bold text-slate-700 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                Ders Dağıtım Biçimi (Aynı Güne Toplama / Farklı Günlere Yayma):
                              </span>
                              <div className="flex flex-wrap items-center gap-2 mt-1">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateSchoolSettings("groupLessonsMode", "different_days_strict")}
                                  className={`px-3 py-1.5 rounded-xl text-[11px] font-black transition-all cursor-pointer border ${
                                    state.settings.groupLessonsMode === "different_days_strict"
                                      ? "bg-blue-600 border-blue-700 text-white shadow-md transform scale-[1.02]"
                                      : "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200"
                                  }`}
                                >
                                  Ayrı Güne Kesinlikle Yerleştir
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateSchoolSettings("groupLessonsMode", "different_days_flexible")}
                                  className={`px-3 py-1.5 rounded-xl text-[11px] font-black transition-all cursor-pointer border ${
                                    state.settings.groupLessonsMode === "different_days_flexible" || !state.settings.groupLessonsMode
                                      ? "bg-blue-600 border-blue-700 text-white shadow-md transform scale-[1.02]"
                                      : "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200"
                                  }`}
                                >
                                  Gerekirse Aynı Güne Yerleşebilir
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateSchoolSettings("groupLessonsMode", "same_day")}
                                  className={`px-3 py-1.5 rounded-xl text-[11px] font-black transition-all cursor-pointer border ${
                                    state.settings.groupLessonsMode === "same_day"
                                      ? "bg-blue-600 border-blue-700 text-white shadow-md transform scale-[1.02]"
                                      : "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200"
                                  }`}
                                >
                                  Aynı Güne Yerleştir (Blok/Ardışık)
                                </button>
                              </div>
                              <span className="text-[10px] text-slate-400 font-semibold mt-1 leading-relaxed">
                                <strong>Ayrı Güne Kesinlikle Yerleştir:</strong> Bir derse ait farklı ders gruplarının (örn. 2+2) kesinlikle farklı günlere dağıtılmasını zorunlu kılar.<br />
                                <strong>Gerekirse Aynı Güne Yerleşebilir:</strong> Öncelikli olarak farklı günlere yaymaya çalışır, fakat sıkışık programlarda aynı güne de yerleşim yapabilir.<br />
                                <strong>Aynı Güne Yerleştir (Blok/Ardışık):</strong> Bölünmüş dersleri öncelikle aynı güne yan yana yerleştirmeyi dener.
                              </span>
                            </div>

                            {/* Option 2: Max daily gaps */}
                            <div className="flex flex-col gap-1.5 col-span-1">
                              <span className="font-bold text-slate-700 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                Öğretmen günlük en fazla boşluk:
                              </span>
                              <div className="flex items-center gap-2 mt-1">
                                <input
                                  type="number"
                                  min="0"
                                  max="8"
                                  value={state.settings.maxTeacherDailyGaps ?? 1}
                                  onChange={(e) => handleUpdateSchoolSettings("maxTeacherDailyGaps", parseInt(e.target.value, 10) || 0)}
                                  className="w-24 bg-slate-50 border border-slate-200 rounded-xl px-4 py-1.5 text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition"
                                />
                                <span className="text-xs text-slate-600 font-black">boş ders saati</span>
                              </div>
                              <span className="text-[10px] text-slate-400 font-semibold mt-1 leading-relaxed">
                                Otomatik dağıtımda öğretmenlerin programlarında gün içinde en fazla bu kadar ders saati pencere/boşluk kalmasına izin verilir.
                              </span>
                            </div>

                            {/* Option 3: Max Depth Slider */}
                            <div className="flex flex-col gap-1.5 col-span-1 md:col-span-3 border-t border-slate-100 pt-3">
                              <span className="font-bold text-slate-700 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                Çözüm Derinliği (Arama Derinliği):
                              </span>
                              <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 mt-1 bg-slate-50 p-3 rounded-xl border border-slate-200/60">
                                <div className="flex items-center gap-3 flex-1">
                                  <input
                                    type="range"
                                    min="5"
                                    max="30"
                                    value={state.settings.maxDepth ?? getDefaultMaxDepth(state.teachers.length)}
                                    onChange={(e) => handleUpdateSchoolSettings("maxDepth", parseInt(e.target.value, 10))}
                                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                  />
                                  <span className="text-sm font-extrabold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100 font-mono w-12 text-center">
                                    {state.settings.maxDepth ?? getDefaultMaxDepth(state.teachers.length)}
                                  </span>
                                </div>
                                <span className="text-[10px] text-slate-500 font-semibold leading-relaxed md:max-w-md">
                                  <strong>Çözüm Derinliği:</strong> Algoritmanın karmaşık çakışmaları çözmek için yapacağı arama derinliğini belirler. maxDepth parametresiyle entegre arama döngüsü sayesinde, arama derinliği arttıkça algoritma öğretmen boşluklarını kapatmak ve tek kalan dersleri birleştirmek için daha fazla yer değiştirme ve swap denemesi yapabilir.
                                </span>
                              </div>
                            </div>

                            {/* Ek Algoritma Optimizasyonları */}
                            <div className="col-span-1 md:col-span-3 border-t border-slate-100 pt-3 flex flex-col gap-2">
                              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                                <Sparkles className="w-4 h-4 text-amber-500" />
                                Ek Algoritma Optimizasyon ve Düzeltme Araçları:
                              </span>
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (scheduleViewMode === "teacher" && viewingEntityId) {
                                      optimizeGapsForTeacher(viewingEntityId);
                                    } else {
                                      showToast("Seçili öğretmenin boşluğunu azaltmak için lütfen önce Ders Programı tablosunda bir öğretmeni seçin.", "info");
                                    }
                                  }}
                                  className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-amber-100 cursor-pointer"
                                >
                                  <UserCheck className="w-3.5 h-3.5" />
                                  Seçili Öğretmenin Boşluğunu Azalt
                                </button>

                                <button
                                  type="button"
                                  onClick={() => optimizeGapsForAllTeachers()}
                                  className="px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-teal-100 cursor-pointer"
                                >
                                  <Users className="w-3.5 h-3.5" />
                                  Tüm Öğretmenlerin Boşluğunu Azalt
                                </button>

                                <button
                                  type="button"
                                  onClick={() => removeSingleLessonDays()}
                                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-indigo-100 cursor-pointer"
                                >
                                  <CalendarDays className="w-3.5 h-3.5" />
                                  Öğretmenin Tek Dersini Kaldır
                                </button>
                              </div>
                              <span className="text-[10px] text-slate-400 font-semibold leading-relaxed">
                                Bu işlemler mevcut ders dağılımlarını ve derslerin tamamlanış durumunu bozmadan (boş olan uygun saatlere kaydırarak) programı daha kompakt hale getirir. Herhangi bir çakışmaya izin verilmez.
                              </span>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* BİLGİLENDİRME & KISAYOL KILAVUZU (F tuşları ve Çift Tıklama Açıklamaları) */}
                    <AnimatePresence>
                      {isShortcutsOpen && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-2.5 p-3 bg-blue-50/50 border border-blue-200/50 rounded-xl text-[11px] text-slate-700 space-y-2 shrink-0 overflow-hidden"
                        >
                          <div className="flex items-center gap-1.5 border-b border-blue-100 pb-1.5">
                            <Info className="w-4 h-4 text-blue-600" />
                            <span className="font-extrabold text-blue-900 uppercase tracking-wide">Hızlı Çizelgeleme Kısayol Tuşları & Mouse Kontrolleri</span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 font-medium">
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 text-[9.5px] font-mono bg-white border border-slate-300 rounded shadow-sm text-slate-800 font-black">F2</kbd> <span>Seçili Hücreyi Kilitle / Aç</span></span>
                                <span className="text-[10px] text-slate-400 italic">Unavailability</span>
                              </div>
                              <div className="flex items-center justify-between gap-2 py-0.5">
                                <span className="flex items-center gap-1">
                                  <kbd className="px-1.5 py-0.5 text-[9.5px] font-mono bg-white border border-slate-300 rounded shadow-sm text-slate-800 font-black">F3</kbd> 
                                  <span>Özel Kapatma (Hızlı Toggle):</span>
                                </span>
                                <div className="flex items-center gap-1 shrink-0">
                                  <select
                                    value={["NÖBET", "REHBERLİK", "DERS DIŞI", "KAPALI", "KOOR", "ŞEFLİK", "Atö", "İBE", "Reh", "Drs"].includes(f3ClosureName) ? f3ClosureName : "custom"}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      if (val !== "custom") {
                                        setF3ClosureName(val);
                                        localStorage.setItem("f3_closure_name", val);
                                      } else {
                                        setF3ClosureName("");
                                      }
                                    }}
                                    className="bg-white border border-slate-300 text-[11px] text-slate-800 font-bold rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                                  >
                                    <option value="NÖBET">NÖBET</option>
                                    <option value="REHBERLİK">REHBERLİK</option>
                                    <option value="DERS DIŞI">DERS DIŞI</option>
                                    <option value="KAPALI">KAPALI</option>
                                    <option value="KOOR">KOOR</option>
                                    <option value="ŞEFLİK">ŞEFLİK</option>
                                    <option value="Atö">Atö</option>
                                    <option value="İBE">İBE</option>
                                    <option value="Reh">Reh</option>
                                    <option value="Drs">Drs</option>
                                    <option value="custom">Özel Etiket...</option>
                                  </select>
                                  {(!["NÖBET", "REHBERLİK", "DERS DIŞI", "KAPALI", "KOOR", "ŞEFLİK", "Atö", "İBE", "Reh", "Drs"].includes(f3ClosureName) || f3ClosureName === "") && (
                                    <input
                                      type="text"
                                      placeholder="Etiket..."
                                      value={f3ClosureName}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setF3ClosureName(val);
                                        localStorage.setItem("f3_closure_name", val);
                                      }}
                                      className="bg-white border border-slate-300 text-[11px] text-slate-800 font-bold rounded px-1.5 py-0.5 w-16 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    />
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 text-[9.5px] font-mono bg-white border border-slate-300 rounded shadow-sm text-slate-800 font-black">F4</kbd> <span>Okuldaki Boş/Doluluğu Göster</span></span>
                                <span className="text-[10px] text-slate-400 italic">Öğretmen Listesi</span>
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between border-t border-blue-100/60 pt-1.5 mt-1 col-span-1 md:col-span-2 text-slate-800 font-medium">
                                <span className="flex items-center gap-1.5">
                                  <span className="text-blue-700 font-extrabold">Hücre Etkileşimi:</span>
                                  <span>Sınıflar görünümünde <strong>Tek Tıklama</strong>, diğer görünümlerde ise <strong>Çift Tıklama</strong> boş hücreye seçili dersi yerleştirir, dolu hücreyi temizler.</span>
                                </span>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                  </div>

                  {/* ÖĞRETMEN, SINIF VE ATÖLYE DURUM VE SEÇİM LİSTELERİ & SAĞ PANEL DETAYLARI (2 Kolonlu Kompakt Tasarım) */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 shrink-0 overflow-hidden">
                    
                    {/* SOL KOLON: DURUM VE SEÇİM TABLOSU */}
                    <div 
                      onClick={() => setKbdFocusArea('entities')}
                      className={`bg-white p-2.5 rounded-2xl border transition-all duration-200 shadow-sm flex flex-col gap-2 overflow-hidden cursor-pointer ${
                        kbdFocusArea === 'entities' 
                          ? "ring-2 ring-indigo-500/10 border-indigo-400" 
                          : "border-slate-200/80"
                      }`}
                    >
                      <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 shrink-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-slate-800 uppercase tracking-widest block">
                            {scheduleViewMode === "teacher"
                              ? "👨‍🏫 ÖĞRETMEN DURUM VE SEÇİM TABLOSU"
                              : scheduleViewMode === "class"
                              ? "🏫 SINIF DURUM VE SEÇİM TABLOSU"
                              : "🛠️ ATÖLYE DURUM VE SEÇİM TABLOSU"}
                          </span>
                          {kbdFocusArea === 'entities' && (
                            <span className="inline-flex items-center gap-1 text-[9px] bg-emerald-50 text-emerald-700 font-black px-1.5 py-0.5 rounded border border-emerald-200 animate-pulse">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              KLAVYE OK TUŞLARI ETKİN
                            </span>
                          )}
                        </div>
                        {kbdFocusArea !== 'entities' && (
                          <span className="text-[10px] text-slate-400 font-bold bg-slate-50 border border-slate-200/40 px-2 py-0.5 rounded-full">
                            Seçim için satıra tıklayın
                          </span>
                        )}
                      </div>

                      {/* Arama/Filtreleme Kutusu */}
                      {scheduleViewMode !== "teacher" && (
                        <div className="relative shrink-0 mb-1">
                          <input
                            type="text"
                            placeholder={
                              scheduleViewMode === "class"
                                ? "Sınıf adına göre hızlı ara..."
                                : "Atölye/derslik adına göre hızlı ara..."
                            }
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-slate-50 text-xs text-slate-800 placeholder-slate-400 pl-8 pr-3.5 py-1.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all font-medium"
                          />
                          <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
                        </div>
                      )}

                      {/* Dikey Tablo Alanı */}
                      <div className="overflow-y-auto max-h-[330px] w-full border border-slate-200/80 rounded-xl scrollbar-thin scrollbar-thumb-slate-200 bg-white">
                        <table className="w-full text-left text-xs text-slate-600 border-collapse">
                          <thead>
                            <tr className="bg-slate-50 text-[10px] text-slate-700 font-extrabold uppercase tracking-wider sticky top-0 z-10 border-b border-slate-200">
                              {scheduleViewMode === "teacher" && (
                                <>
                                  <th className="py-1 px-2 font-black border border-slate-200 bg-slate-50">Öğretmen Adı</th>
                                  <th className="py-1 px-2 font-black border border-slate-200 bg-slate-50">Branşı</th>
                                  <th className="py-1 px-2 font-black text-center w-14 border border-slate-200 bg-slate-50">Atn.</th>
                                  <th className="py-1 px-2 font-black text-center w-14 border border-slate-200 bg-slate-50">Yrl.</th>
                                </>
                              )}
                              {scheduleViewMode === "class" && (
                                <>
                                  <th className="py-1 px-2 font-black border border-slate-200 bg-slate-50">Sınıf Adı</th>
                                  <th className="py-1 px-2 font-black text-center w-14 border border-slate-200 bg-slate-50">Atn.</th>
                                  <th className="py-1 px-2 font-black text-center w-14 border border-slate-200 bg-slate-50">Yrl.</th>
                                </>
                              )}
                              {scheduleViewMode === "classroom" && (
                                <>
                                  <th className="py-1 px-2 font-black border border-slate-200 bg-slate-50">Atölye/Derslik Adı</th>
                                  <th className="py-1 px-2 font-black border border-slate-200 bg-slate-50">Kullanım Türü</th>
                                  <th className="py-1 px-2 font-black text-center w-14 border border-slate-200 bg-slate-50">Yrl.</th>
                                </>
                              )}
                            </tr>
                          </thead>
                          <tbody className="bg-white">
                            {scheduleViewMode === "teacher" && (() => {
                              const filteredTeachers = state.teachers.filter(t =>
                                t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                (t.branch && t.branch.toLowerCase().includes(searchQuery.toLowerCase()))
                              );
                              return filteredTeachers.length === 0 ? (
                                <tr>
                                  <td colSpan={4} className="text-center py-6 text-slate-400 text-xs font-semibold border border-slate-200">Öğretmen bulunmuyor.</td>
                                </tr>
                              ) : (
                                filteredTeachers.map((t) => {
                                  const assigned = state.assignments.filter(a => a.teacherId && a.teacherId.split(",").includes(t.id)).reduce((sum, a) => sum + a.weeklyHours, 0);
                                  const placed = getTeacherPlacedHours(t.id);
                                  const isComplete = assigned === placed;
                                  const isSelected = viewingEntityId === t.id;

                                  return (
                                    <tr 
                                      key={t.id} 
                                      onClick={() => setViewingEntityId(t.id)}
                                      onContextMenu={(e) => {
                                        e.preventDefault();
                                        setViewingEntityId(t.id);
                                        setTeacherContextMenu({
                                          visible: true,
                                          x: e.clientX,
                                          y: e.clientY,
                                          teacherId: t.id,
                                          teacherName: t.name
                                        });
                                      }}
                                      className={`hover:bg-blue-50/40 cursor-pointer transition-colors ${
                                        isSelected ? "bg-blue-600 text-white font-extrabold" : "text-slate-700 bg-white"
                                      }`}
                                    >
                                      <td className={`py-1 px-2 font-bold border border-slate-200 ${isSelected ? "text-white" : "text-slate-800"} flex items-center gap-1.5`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-white" : "bg-blue-500"}`}></span>
                                        {t.name}
                                      </td>
                                      <td className={`py-1 px-2 border border-slate-200 ${isSelected ? "text-blue-100" : "text-slate-600"}`}>{t.branch}</td>
                                      <td className={`py-1 px-2 text-center font-mono font-bold border border-slate-200 ${isSelected ? "text-white" : "text-slate-700"}`}>{assigned} s</td>
                                      <td className={`py-1 px-2 text-center font-mono font-bold border border-slate-200 ${isSelected ? "text-emerald-100" : isComplete ? "text-emerald-600" : "text-rose-600"}`}>
                                        {placed} s
                                      </td>
                                    </tr>
                                  );
                                })
                              );
                            })()}

                            {scheduleViewMode === "class" && (() => {
                              const filteredClasses = state.classes.filter(c =>
                                c.name.toLowerCase().includes(searchQuery.toLowerCase())
                              );
                              return filteredClasses.length === 0 ? (
                                <tr>
                                  <td colSpan={3} className="text-center py-6 text-slate-400 text-xs font-semibold border border-slate-200">Sınıf bulunmuyor.</td>
                                </tr>
                              ) : (
                                filteredClasses.map((c) => {
                                  const assigned = state.assignments.filter(a => a.classId === c.id).reduce((sum, a) => sum + a.weeklyHours, 0);
                                  const placed = getClassPlacedHours(c.id);
                                  const isComplete = assigned === placed;
                                  const isSelected = viewingEntityId === c.id;

                                  return (
                                    <tr 
                                      key={c.id} 
                                      onClick={() => setViewingEntityId(c.id)}
                                      className={`hover:bg-blue-50/40 cursor-pointer transition-colors ${
                                        isSelected ? "bg-blue-600 text-white font-extrabold" : "text-slate-700 bg-white"
                                      }`}
                                    >
                                      <td className={`py-1 px-2 font-bold border border-slate-200 ${isSelected ? "text-white" : "text-slate-800"} flex items-center gap-1.5`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-white" : "bg-indigo-500"}`}></span>
                                        {c.name}
                                      </td>
                                      <td className={`py-1 px-2 text-center font-mono font-bold border border-slate-200 ${isSelected ? "text-white" : "text-slate-700"}`}>{assigned} s</td>
                                      <td className={`py-1 px-2 text-center font-mono font-bold border border-slate-200 ${isSelected ? "text-emerald-100" : isComplete ? "text-emerald-600" : "text-rose-600"}`}>
                                        {placed} s
                                      </td>
                                    </tr>
                                  );
                                })
                              );
                            })()}

                            {scheduleViewMode === "classroom" && (() => {
                              const filteredClassrooms = state.classrooms.filter(cr =>
                                cr.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                (cr.type && cr.type.toLowerCase().includes(searchQuery.toLowerCase()))
                              );
                              return filteredClassrooms.length === 0 ? (
                                <tr>
                                  <td colSpan={3} className="text-center py-6 text-slate-400 text-xs font-semibold border border-slate-200">Atölye bulunmuyor.</td>
                                </tr>
                              ) : (
                                filteredClassrooms.map((cr) => {
                                  const placed = getClassroomPlacedHours(cr.id);
                                  const isSelected = viewingEntityId === cr.id;

                                  return (
                                    <tr 
                                      key={cr.id} 
                                      onClick={() => setViewingEntityId(cr.id)}
                                      className={`hover:bg-blue-50/40 cursor-pointer transition-colors ${
                                        isSelected ? "bg-blue-600 text-white font-extrabold" : "text-slate-700 bg-white"
                                      }`}
                                    >
                                      <td className={`py-1 px-2 font-bold border border-slate-200 ${isSelected ? "text-white" : "text-slate-800"} flex items-center gap-1.5`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-white" : "bg-amber-500"}`}></span>
                                        {cr.name}
                                      </td>
                                      <td className={`py-1 px-2 border border-slate-200 ${isSelected ? "text-blue-100" : "text-slate-600"}`}>
                                        {cr.type === "workshop" ? "Uygulama Atölyesi" : "Standart Derslik"}
                                      </td>
                                      <td className={`py-1 px-2 text-center font-mono font-bold border border-slate-200 ${isSelected ? "text-emerald-100" : "text-emerald-600"}`}>{placed} s</td>
                                    </tr>
                                  );
                                })
                              );
                            })()}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* SAĞ KOLON: ÜZERİNE TIKLANAN ELEMANIN DETAYLI DERS YERLEŞİM BİLGİSİ */}
                    <div 
                      onClick={() => setKbdFocusArea('assignments')}
                      className={`bg-white p-2.5 rounded-2xl border transition-all duration-200 shadow-sm flex flex-col gap-2 overflow-hidden cursor-pointer ${
                        kbdFocusArea === 'assignments' 
                          ? "ring-2 ring-indigo-500/10 border-indigo-400" 
                          : "border-slate-200/80"
                      }`}
                    >
                      {(() => {
                        if (!viewingEntityId) {
                          return (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-xs font-medium py-12">
                              <span>Detayları görmek için sol taraftan bir eleman seçin.</span>
                            </div>
                          );
                        }

                        // Helper calculation
                        const getAssignmentPlacedHours = (assignId: string) => {
                          let count = 0;
                          Object.keys(state.schedule).forEach(cId => {
                            const classS = state.schedule[cId];
                            if (classS) {
                              Object.keys(classS).forEach(dayIdxStr => {
                                const dIdx = parseInt(dayIdxStr, 10);
                                const dayS = classS[dIdx];
                                if (dayS) {
                                  dayS.forEach(slot => {
                                    if (slot && slot.assignmentId === assignId) {
                                      count++;
                                    }
                                  });
                                }
                              });
                            }
                          });
                          return count;
                        };

                        if (scheduleViewMode === "teacher") {
                          const teacher = teachersMap.get(viewingEntityId);
                          if (!teacher) return null;
                          const teacherAssignments = state.assignments.filter(a => a.teacherId && a.teacherId.split(",").includes(teacher.id));

                          return (
                            <div className="flex flex-col h-full overflow-hidden">
                              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 shrink-0">
                                <div className="flex items-center gap-2">
                                  <h4 className="text-xs font-black text-blue-800 uppercase flex items-center gap-1.5">
                                    <span>👨‍🏫 {teacher.name} Atama Detayları</span>
                                  </h4>
                                  {kbdFocusArea === 'assignments' && (
                                    <span className="inline-flex items-center gap-1 text-[9px] bg-emerald-50 text-emerald-700 font-black px-1.5 py-0.5 rounded border border-emerald-200 animate-pulse">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                      KLAVYE OK TUŞLARI ETKİN
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] bg-blue-50 text-blue-700 font-extrabold px-2 py-0.5 rounded border border-blue-100">
                                  {teacherAssignments.length} Farklı Atama
                                </span>
                              </div>

                              <div className="overflow-y-auto max-h-[350px] min-h-[280px] bg-white border border-slate-200 rounded-xl mt-1 scrollbar-thin">
                                {teacherAssignments.length === 0 ? (
                                  <div className="text-center py-8 text-slate-400 text-xs italic">
                                    Öğretmene atanmış ders bulunmuyor.
                                  </div>
                                ) : (
                                  <table className="w-full text-left text-[11px] text-slate-700 border-collapse">
                                    <thead>
                                      <tr className="bg-slate-100 text-[10px] text-slate-700 font-extrabold uppercase tracking-wider sticky top-0 z-10 border-b border-slate-200">
                                        <th className="py-1 px-2 border border-slate-200">Ders (Sınıf)</th>
                                        <th className="py-1 px-2 text-center w-12 border border-slate-200">Atn.</th>
                                        <th className="py-1 px-2 text-center w-12 border border-slate-200">Yrl.</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {teacherAssignments.map(a => {
                                        const placedHours = getAssignmentPlacedHours(a.id);
                                        const isComplete = placedHours === a.weeklyHours;
                                        const course = coursesMap.get(a.courseId);
                                        const className = classesMap.get(a.classId)?.name || "Bilinmeyen Sınıf";
                                        const isSelected = selectedAssignmentId === a.id;

                                        return (
                                          <tr 
                                            key={a.id} 
                                            onClick={() => setSelectedAssignmentId(a.id)}
                                            onContextMenu={(e) => {
                                              e.preventDefault();
                                              setSelectedAssignmentId(a.id);
                                              setAssignmentContextMenu({
                                                visible: true,
                                                x: e.clientX,
                                                y: e.clientY,
                                                assignmentId: a.id
                                              });
                                            }}
                                            draggable={true}
                                            onDragStart={(e) => {
                                              e.dataTransfer.setData("text/plain", JSON.stringify({ assignmentId: a.id }));
                                              e.dataTransfer.effectAllowed = "copy";
                                            }}
                                            className={`hover:bg-blue-50/50 cursor-pointer transition-colors border-b border-slate-200/60 ${
                                              isSelected 
                                                ? "bg-blue-100/70 font-semibold text-blue-900" 
                                                : "text-slate-700 bg-white"
                                            }`}
                                          >
                                            <td className="py-1 px-2 border border-slate-200">
                                              <div className="flex items-center gap-1">
                                                <span>{course?.name} ({className})</span>
                                                <span className="text-[9px] text-slate-400 font-mono font-medium">({course?.code})</span>
                                                {isSelected && (
                                                  <span className="text-[8px] bg-blue-100 text-blue-800 font-black px-1 rounded">AKTİF</span>
                                                )}
                                              </div>
                                            </td>
                                            <td className="py-1 px-2 text-center font-mono font-bold border border-slate-200">{a.weeklyHours}</td>
                                            <td className={`py-1 px-2 text-center font-mono font-bold border border-slate-200 ${
                                              isComplete ? "text-emerald-600 bg-emerald-50/30" : "text-rose-600 bg-rose-50/30"
                                            }`}>
                                              {placedHours}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            </div>
                          );
                        }

                        if (scheduleViewMode === "class") {
                          const cls = classesMap.get(viewingEntityId);
                          if (!cls) return null;
                          const classAssignments = state.assignments.filter(a => a.classId === cls.id);

                          return (
                            <div className="flex flex-col h-full overflow-hidden">
                              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 shrink-0">
                                <div className="flex items-center gap-2">
                                  <h4 className="text-xs font-black text-indigo-800 uppercase flex items-center gap-1.5">
                                    <span>🏫 {cls.name} Sınıf Atama Detayları</span>
                                  </h4>
                                  {kbdFocusArea === 'assignments' && (
                                    <span className="inline-flex items-center gap-1 text-[9px] bg-emerald-50 text-emerald-700 font-black px-1.5 py-0.5 rounded border border-emerald-200 animate-pulse">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                      KLAVYE OK TUŞLARI ETKİN
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] bg-indigo-50 text-indigo-700 font-extrabold px-2 py-0.5 rounded border border-indigo-100">
                                  {classAssignments.length} Farklı Atama
                                </span>
                              </div>

                              <div className="overflow-y-auto max-h-[350px] min-h-[280px] bg-white border border-slate-200 rounded-xl mt-1 scrollbar-thin">
                                {classAssignments.length === 0 ? (
                                  <div className="text-center py-8 text-slate-400 text-xs italic">
                                    Sınıfa tanımlanmış ders bulunmuyor.
                                  </div>
                                ) : (
                                  <table className="w-full text-left text-[11px] text-slate-700 border-collapse">
                                    <thead>
                                      <tr className="bg-slate-100 text-[10px] text-slate-700 font-extrabold uppercase tracking-wider sticky top-0 z-10 border-b border-slate-200">
                                        <th className="py-1 px-2 border border-slate-200">Ders (Öğretmen)</th>
                                        <th className="py-1 px-2 text-center w-12 border border-slate-200">Atn.</th>
                                        <th className="py-1 px-2 text-center w-12 border border-slate-200">Yrl.</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {classAssignments.map(a => {
                                        const placedHours = getAssignmentPlacedHours(a.id);
                                        const isComplete = placedHours === a.weeklyHours;
                                        const course = coursesMap.get(a.courseId);
                                        const teacherName = teachersMap.get(a.teacherId)?.name || "Bilinmeyen Öğretmen";
                                        const isSelected = selectedAssignmentId === a.id;

                                        return (
                                          <tr 
                                            key={a.id} 
                                            onClick={() => setSelectedAssignmentId(a.id)}
                                            onContextMenu={(e) => {
                                              e.preventDefault();
                                              setSelectedAssignmentId(a.id);
                                              setAssignmentContextMenu({
                                                visible: true,
                                                x: e.clientX,
                                                y: e.clientY,
                                                assignmentId: a.id
                                              });
                                            }}
                                            draggable={true}
                                            onDragStart={(e) => {
                                              e.dataTransfer.setData("text/plain", JSON.stringify({ assignmentId: a.id }));
                                              e.dataTransfer.effectAllowed = "copy";
                                            }}
                                            className={`hover:bg-blue-50/50 cursor-pointer transition-colors border-b border-slate-200/60 ${
                                              isSelected 
                                                ? "bg-blue-100/70 font-semibold text-blue-900" 
                                                : "text-slate-700 bg-white"
                                            }`}
                                          >
                                            <td className="py-1 px-2 border border-slate-200">
                                              <div className="flex items-center gap-1">
                                                <span>{course?.name} ({teacherName})</span>
                                                <span className="text-[9px] text-slate-400 font-mono font-medium">({course?.code})</span>
                                                {isSelected && (
                                                  <span className="text-[8px] bg-blue-100 text-blue-800 font-black px-1 rounded">AKTİF</span>
                                                )}
                                              </div>
                                            </td>
                                            <td className="py-1 px-2 text-center font-mono font-bold border border-slate-200">{a.weeklyHours}</td>
                                            <td className={`py-1 px-2 text-center font-mono font-bold border border-slate-200 ${
                                              isComplete ? "text-emerald-600 bg-emerald-50/30" : "text-rose-600 bg-rose-50/30"
                                            }`}>
                                              {placedHours}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            </div>
                          );
                        }

                        if (scheduleViewMode === "classroom") {
                          const cr = classroomsMap.get(viewingEntityId);
                          if (!cr) return null;

                          // Find all assignments that are designated to use this classroom
                          const classroomAssignments = state.assignments.filter(a => a.classroomId === cr.id);

                          // Find placements
                          const classroomPlacements: Array<{ dayIdx: number; periodIdx: number; className: string; teacherName: string; courseName: string }> = [];
                          Object.keys(state.schedule).forEach(cId => {
                            const classS = state.schedule[cId];
                            const className = classesMap.get(cId)?.name || cId;
                            if (classS) {
                              Object.keys(classS).forEach(dayIdxStr => {
                                const dI = parseInt(dayIdxStr, 10);
                                const dayS = classS[dI];
                                if (dayS) {
                                  dayS.forEach((slot, pI) => {
                                    if (slot && slot.classroomId === cr.id) {
                                      classroomPlacements.push({
                                        dayIdx: dI,
                                        periodIdx: pI,
                                        className,
                                        teacherName: slot.teacherId ? slot.teacherId.split(",").map(id => teachersMap.get(id)?.name).filter(Boolean).join(", ") : "Bilinmeyen Öğretmen",
                                        courseName: coursesMap.get(slot.courseId)?.name || "Bilinmeyen Ders"
                                      });
                                    }
                                  });
                                }
                              });
                            }
                          });

                          return (
                            <div className="flex flex-col h-full overflow-hidden gap-4">
                              {/* SECTION 1: Atölyeye Atanmış Dersler (Ders Planlama) */}
                              <div className="flex flex-col h-full overflow-hidden">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 shrink-0">
                                  <div className="flex items-center gap-2">
                                    <h4 className="text-xs font-black text-amber-800 uppercase flex items-center gap-1.5">
                                      <span>🛠️ {cr.name} Atama ve Planlama</span>
                                    </h4>
                                    {kbdFocusArea === 'assignments' && (
                                      <span className="inline-flex items-center gap-1 text-[9px] bg-emerald-50 text-emerald-700 font-black px-1.5 py-0.5 rounded border border-emerald-200 animate-pulse">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                        KLAVYE OK TUŞLARI ETKİN
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[10px] bg-amber-50 text-amber-700 font-extrabold px-2 py-0.5 rounded border border-amber-100">
                                    {classroomAssignments.length} Atama
                                  </span>
                                </div>
                                <div className="overflow-y-auto max-h-[350px] bg-white border border-slate-200 rounded-xl mt-1 scrollbar-thin font-semibold">
                                  {classroomAssignments.length === 0 ? (
                                    <div className="text-center py-6 text-slate-400 text-xs italic">
                                      Atölye tanımlanmış planlanabilir ders bulunmuyor.
                                    </div>
                                  ) : (
                                    <table className="w-full text-left text-[11px] text-slate-700 border-collapse">
                                      <thead>
                                        <tr className="bg-slate-100 text-[10px] text-slate-700 font-extrabold uppercase tracking-wider sticky top-0 z-10 border-b border-slate-200">
                                          <th className="py-1 px-2 border border-slate-200">Ders (Sınıf / Öğr.)</th>
                                          <th className="py-1 px-2 text-center w-12 border border-slate-200">Atn.</th>
                                          <th className="py-1 px-2 text-center w-12 border border-slate-200">Yrl.</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {classroomAssignments.map(a => {
                                          const placedHours = getAssignmentPlacedHours(a.id);
                                          const isComplete = placedHours === a.weeklyHours;
                                          const course = coursesMap.get(a.courseId);
                                          const className = classesMap.get(a.classId)?.name || "Bilinmeyen Sınıf";
                                          const teacherName = a.teacherId ? a.teacherId.split(",").map(id => teachersMap.get(id)?.name).filter(Boolean).join(", ") : "Bilinmeyen Öğretmen";
                                          const isSelected = selectedAssignmentId === a.id;

                                          return (
                                            <tr 
                                              key={a.id} 
                                              onClick={() => setSelectedAssignmentId(a.id)}
                                              onContextMenu={(e) => {
                                                e.preventDefault();
                                                setSelectedAssignmentId(a.id);
                                                setAssignmentContextMenu({
                                                  visible: true,
                                                  x: e.clientX,
                                                  y: e.clientY,
                                                  assignmentId: a.id
                                                });
                                              }}
                                              draggable={true}
                                              onDragStart={(e) => {
                                                e.dataTransfer.setData("text/plain", JSON.stringify({ assignmentId: a.id }));
                                                e.dataTransfer.effectAllowed = "copy";
                                              }}
                                              className={`hover:bg-blue-50/50 cursor-pointer transition-colors border-b border-slate-200/60 ${
                                                isSelected 
                                                  ? "bg-blue-100/70 font-semibold text-blue-900" 
                                                  : "text-slate-700 bg-white"
                                              }`}
                                            >
                                              <td className="py-1 px-2 border border-slate-200">
                                                <div className="flex items-center gap-1">
                                                  <span>{course?.name} ({className} - {teacherName})</span>
                                                  {isSelected && (
                                                    <span className="text-[8px] bg-blue-100 text-blue-800 font-black px-1 rounded">AKTİF</span>
                                                  )}
                                                </div>
                                              </td>
                                              <td className="py-1 px-2 text-center font-mono font-bold border border-slate-200">{a.weeklyHours}</td>
                                              <td className={`py-1 px-2 text-center font-mono font-bold border border-slate-200 ${
                                                isComplete ? "text-emerald-600 bg-emerald-50/30" : "text-rose-600 bg-rose-50/30"
                                              }`}>
                                                {placedHours}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        }

                        return null;
                      })()}
                    </div>

                  </div>

                  {/* Akıllı Çakışma Analiz Paneli */}
                  {(() => {
                    const entityAssignedHours = (() => {
                      if (!viewingEntityId) return totalAssignedHours;
                      if (scheduleViewMode === "class") {
                        return state.assignments.filter(a => a.classId === viewingEntityId).reduce((sum, a) => sum + a.weeklyHours, 0);
                      } else if (scheduleViewMode === "teacher") {
                        return state.assignments.filter(a => a.teacherId && a.teacherId.split(",").includes(viewingEntityId)).reduce((sum, a) => sum + a.weeklyHours, 0);
                      } else if (scheduleViewMode === "classroom") {
                        return state.assignments.filter(a => a.classroomId === viewingEntityId).reduce((sum, a) => sum + a.weeklyHours, 0);
                      }
                      return totalAssignedHours;
                    })();

                    const entityPlacedHours = (() => {
                      if (!viewingEntityId) return totalPlacedHours;
                      let count = 0;
                      Object.keys(state.schedule).forEach((cId) => {
                        const classSched = state.schedule[cId];
                        if (classSched) {
                          Object.keys(classSched).forEach((dayIdxKey) => {
                            const periods = classSched[parseInt(dayIdxKey, 10)];
                            if (periods) {
                              periods.forEach((slot) => {
                                if (slot) {
                                  if (scheduleViewMode === "class" && cId === viewingEntityId) {
                                    count++;
                                  } else if (scheduleViewMode === "teacher" && slot.teacherId && slot.teacherId.split(",").includes(viewingEntityId)) {
                                    count++;
                                  } else if (scheduleViewMode === "classroom" && slot.classroomId === viewingEntityId) {
                                    count++;
                                  }
                                }
                              });
                            }
                          });
                        }
                      });
                      return count;
                    })();

                    const entityConflicts = activeConflicts.filter((conf) => {
                      if (!viewingEntityId) return true;
                      if (scheduleViewMode === "class") {
                        return conf.details.classId === viewingEntityId;
                      } else if (scheduleViewMode === "teacher") {
                        return conf.details.teacherId === viewingEntityId;
                      } else if (scheduleViewMode === "classroom") {
                        return conf.details.classroomId === viewingEntityId;
                      }
                      return true;
                    });

                    const entityUnplacedReports = unplacedReports.filter((item) => {
                      if (!viewingEntityId) return true;
                      if (scheduleViewMode === "class") {
                        return item.classId === viewingEntityId;
                      } else if (scheduleViewMode === "teacher") {
                        if (!item.teacherId) return false;
                        return item.teacherId.split(",").includes(viewingEntityId);
                      } else if (scheduleViewMode === "classroom") {
                        const assign = state.assignments.find(a => a.id === item.assignmentId);
                        return assign?.classroomId === viewingEntityId;
                      }
                      return true;
                    });

                    const isAllPlacedNoConflicts = entityPlacedHours === entityAssignedHours && entityConflicts.length === 0 && entityUnplacedReports.length === 0;

                    return (
                      <div className="mt-4 shrink-0 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm text-left">
                        <button
                          onClick={() => setIsAnalysisOpen(!isAnalysisOpen)}
                          disabled={isAllPlacedNoConflicts}
                          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                            isAllPlacedNoConflicts
                              ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
                              : "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100/70"
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <Activity className="w-4 h-4 text-blue-500 animate-pulse" />
                            <span>Akıllı Çakışma & Hata Analiz Paneli</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            {isAllPlacedNoConflicts ? (
                              <span className="text-[9px] bg-slate-200/60 text-slate-500 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider">ANALİZ GEREKSİZ</span>
                            ) : (
                              <span className="text-[9px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider">SORUNLARI ANALİZ ET</span>
                            )}
                            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isAnalysisOpen ? "rotate-180" : ""}`} />
                          </div>
                        </button>

                        <AnimatePresence>
                          {isAnalysisOpen && !isAllPlacedNoConflicts && (() => {
                            return (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="mt-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-700 space-y-3.5 shadow-inner overflow-hidden"
                              >
                                {(() => {
                                  const unifiedConflicts = (() => {
                                    const list: {
                                      id: string;
                                      problem: string;
                                      suggestion: string;
                                      action: any | null;
                                    }[] = [];

                                    const smartSuggestions = getSmartAutoFixSuggestions();

                                    entityConflicts.forEach((c, idx) => {
                                      const d = c.dayIndex;
                                      const p = c.periodIndex;
                                      const dayName = state.settings.days[d] || `${d + 1}. Gün`;
                                      const periodName = `${p + 1}. Saat`;

                                      let problem = "";
                                      if (c.type === "teacher_overlap") {
                                        const teacherObj = state.teachers.find(t => t.id === c.details.teacherId);
                                        const tName = teacherObj?.name || "Bilinmeyen Öğretmen";
                                        problem = `${tName} öğretmeni ${dayName} günü ${periodName} diliminde çakışıyor (Aynı saatte birden fazla sınıfa atanmış).`;
                                      } else if (c.type === "classroom_overlap") {
                                        const roomObj = state.classrooms.find(r => r.id === c.details.classroomId);
                                        const rName = roomObj?.name || "Bilinmeyen Atölye";
                                        problem = `${rName} atölyesi/laboratuvarı ${dayName} günü ${periodName} diliminde birden fazla ders için ayrılmış.`;
                                      } else {
                                        const classObj = state.classes.find(cl => cl.id === c.details.classId);
                                        const tObj = state.teachers.find(t => t.id === c.details.teacherId);
                                        const entName = classObj?.name || tObj?.name || "Bilinmeyen Kaynak";
                                        problem = `${entName} için ${dayName} günü ${periodName} kilitli (kapalı) olmasına rağmen ders yerleştirilmiş.`;
                                      }

                                      // Find corresponding auto-fix suggestion
                                      const matchingSug = smartSuggestions.find(sug => 
                                        sug.action.fromDay === d && 
                                        sug.action.fromPeriod === p
                                      );

                                      let suggestion = "";
                                      let action = null;

                                      if (matchingSug) {
                                        suggestion = matchingSug.message;
                                        action = matchingSug.action;
                                      } else {
                                        if (c.type === "teacher_overlap") {
                                          suggestion = "Öğretmen çakışmasını düzeltmek için, çakışan derslerden birini fareyle sürükleyip boş bir güne/saate taşıyın.";
                                        } else if (c.type === "classroom_overlap") {
                                          suggestion = "Atölye çakışmasını çözmek için atölyeyi paylaşan derslerden birini başka bir dersliğe aktarın veya farklı bir saat dilimine sürükleyin.";
                                        } else {
                                          suggestion = "Kilitli zaman dilimi çakışmasını çözmek için dersi başka bir saate taşıyın veya o günün kilidini F2 tuşuyla kaldırın.";
                                        }
                                      }

                                      list.push({
                                        id: `unified-conflict-${idx}-${d}-${p}`,
                                        problem,
                                        suggestion,
                                        action
                                      });
                                    });

                                    return list;
                                  })();

                                  if (unifiedConflicts.length === 0) return null;

                                  return (
                                    <div className="space-y-3.5">
                                      <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Tespit Edilen Çakışmalar ve Çözüm Önerileri ({unifiedConflicts.length})</h4>
                                      <div className="space-y-2.5 max-h-[250px] overflow-y-auto pr-1">
                                        {unifiedConflicts.map((item) => (
                                          <div key={item.id} className="p-3 bg-white border border-slate-200/80 rounded-xl shadow-sm flex flex-col gap-2">
                                            <div className="flex items-start gap-1.5">
                                              <span className="text-red-500 mt-0.5 shrink-0 text-xs">⚠️</span>
                                              <span className="text-[11px] font-bold text-slate-800 leading-normal">
                                                {item.problem}
                                              </span>
                                            </div>
                                            <div className="p-2.5 bg-blue-50/50 border border-blue-100/40 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                              <div className="flex items-start gap-1.5">
                                                <span className="text-blue-600 shrink-0">💡</span>
                                                <span className="text-[10.5px] font-semibold text-blue-900 leading-relaxed">
                                                  {item.suggestion}
                                                </span>
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                })()}

                                {entityUnplacedReports.length > 0 && (
                                  <div className="pt-3 border-t border-slate-200/60 space-y-2">
                                    <h4 className="text-[10px] font-black text-rose-500 uppercase tracking-wider mb-2">Otomatik Dağıtım Analiz Raporu ({entityUnplacedReports.length} Sorun)</h4>
                                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                                      {entityUnplacedReports.map((item, i) => (
                                        <div key={item.id || i} className="p-3 bg-rose-50/40 border border-rose-100 rounded-xl space-y-2.5">
                                          <div className="flex justify-between items-start">
                                            <div>
                                              <span className="font-bold text-slate-800 text-xs block">{item.className} - {item.courseName}</span>
                                              <span className="text-[10px] text-slate-500 font-semibold">Öğretmen: {item.teacherName} | Blok: {item.size} Saat</span>
                                            </div>
                                            <span className="bg-rose-100 text-rose-800 text-[9px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider shrink-0">YERLEŞMEDİ</span>
                                          </div>
                                          
                                          <p className="text-[10px] text-rose-900 leading-normal font-bold bg-white p-2 rounded-lg border border-rose-100/60 shadow-sm">
                                            {item.reason}
                                          </p>

                                          <div className="space-y-1.5">
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Önerilen Çözüm Adımları:</span>
                                            {item.suggestions.map((sug: any, sIdx: number) => (
                                              <div key={sIdx} className="flex items-center justify-between gap-2 p-2 bg-white rounded-lg border border-slate-100 shadow-sm hover:border-blue-300 transition-colors">
                                                <span className="text-[10px] font-bold text-slate-700 leading-relaxed">{sug.text}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </motion.div>
                            );
                          })()}
                        </AnimatePresence>
                      </div>
                    );
                  })()}

                </div>

                {/* Real-time cell edit popover modal */}
                  <AnimatePresence>
                    {editingCell && (
                      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="bg-white rounded-2xl border border-slate-200 shadow-xl p-6 max-w-sm w-full space-y-4"
                        >
                          <h3 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2 flex justify-between items-center">
                            <span>Manuel Ders Hücre Düzenleme</span>
                            <button
                              onClick={() => setEditingCell(null)}
                              className="text-slate-400 hover:text-slate-800 font-bold"
                            >
                              ✕
                            </button>
                          </h3>
                          <div className="text-xs text-slate-600 space-y-1 bg-slate-50 p-3 rounded-lg border border-slate-200">
                            <p>
                              <strong className="text-slate-800">Sınıf:</strong>{" "}
                              {classesMap.get(editingCell.classId)?.name}
                            </p>
                            <p>
                              <strong className="text-slate-800">Gün:</strong>{" "}
                              {state.settings.days[editingCell.dayIndex]}
                            </p>
                            <p>
                              <strong className="text-slate-800">Saat:</strong>{" "}
                              {editingCell.periodIndex + 1}. Ders (
                              {state.settings.periodTimes[editingCell.periodIndex]?.start} -{" "}
                              {state.settings.periodTimes[editingCell.periodIndex]?.end})
                            </p>
                          </div>

                          <div className="space-y-2">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                              Yerleştirilecek Dersi Seçin
                            </label>
                            
                            {/* Filter only assignments belonging to this class */}
                            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                              {state.assignments.filter((a) => a.classId === editingCell.classId).length === 0 ? (
                                <p className="text-xs text-rose-600 py-2 font-semibold">
                                  Bu sınıf için tanımlanmış ders dağıtımı bulunmuyor!
                                </p>
                              ) : (
                                state.assignments
                                  .filter((a) => a.classId === editingCell.classId)
                                  .map((assign) => {
                                    const course = coursesMap.get(assign.courseId);
                                    const teacherNames = assign.teacherId ? assign.teacherId.split(",").map(id => teachersMap.get(id)?.name).filter(Boolean).join(", ") : "Atanmamış";
                                    return (
                                      <button
                                        key={assign.id}
                                        onClick={() => handleApplyManualCellAssignment(assign.id)}
                                        className="w-full text-left p-2.5 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-lg text-xs text-slate-700 hover:text-slate-900 transition-all flex justify-between items-center cursor-pointer"
                                      >
                                        <div>
                                          <p className="font-bold">
                                            {course?.code} - {course?.name}
                                          </p>
                                          <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                                            Öğretmen: {teacherNames}
                                          </p>
                                        </div>
                                        <Plus className="w-4 h-4 text-blue-600" />
                                      </button>
                                    );
                                  })
                              )}

                              <div className="h-px bg-slate-200 my-2"></div>

                              <button
                                onClick={() => handleApplyManualCellAssignment("clear")}
                                className="w-full text-center p-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg text-xs text-rose-700 font-bold transition cursor-pointer"
                              >
                                Hücreyi Temizle (Boşalt)
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      </div>
                    )}
                  </AnimatePresence>

                  {/* Real-time right click context menu */}
                  {contextMenu && contextMenu.visible && (
                    <div
                      style={{ top: contextMenu.y, left: contextMenu.x }}
                      className="fixed z-[999] min-w-[240px] bg-white border border-slate-200 rounded-xl shadow-2xl p-1.5 flex flex-col gap-0.5 divide-y divide-slate-100 font-sans"
                      onClick={(e) => e.stopPropagation()} // Prevent auto close when clicking options
                    >
                      <div className="px-2.5 py-1 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Hücre İşlemleri ({state.settings.days[contextMenu.dIdx]} {contextMenu.pIdx + 1}. Ders)
                      </div>
                      <div className="py-1 space-y-0.5">
                        {(() => {
                          const { slot } = getSlotAt(contextMenu.dIdx, contextMenu.pIdx);
                          if (slot) {
                            return (
                              <button
                                onClick={() => {
                                  toggleLessonLockAt(contextMenu.dIdx, contextMenu.pIdx);
                                  setContextMenu(null);
                                }}
                                className="w-full text-left px-2.5 py-1.5 hover:bg-slate-50 rounded-lg text-xs font-bold text-red-600 flex items-center justify-between transition cursor-pointer border border-red-100 bg-red-50/50 mb-1"
                              >
                                <span className="flex items-center gap-2">
                                  <Lock className="w-3.5 h-3.5 text-red-600 animate-pulse" />
                                  <span>{slot.isLocked ? "Sabitlemeyi Kaldır (Serbest Bırak)" : "Dersi Buraya Sabitle (Kitle)"}</span>
                                </span>
                                <kbd className="px-1 bg-red-100 border border-red-200 text-[8px] rounded text-red-600 font-mono font-bold">PIN</kbd>
                              </button>
                            );
                          }
                          return null;
                        })()}

                        <button
                          onClick={() => {
                            toggleCellUnavailabilityAt(contextMenu.dIdx, contextMenu.pIdx);
                            setContextMenu(null);
                          }}
                          className="w-full text-left px-2.5 py-1.5 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 flex items-center justify-between transition cursor-pointer"
                        >
                          <span className="flex items-center gap-2">
                            <Lock className="w-3.5 h-3.5 text-slate-500" />
                            <span>Seçili Hücreyi Kilitle / Aç</span>
                          </span>
                          <kbd className="px-1 bg-slate-100 border border-slate-200 text-[8px] rounded text-slate-500 font-mono font-bold">F2</kbd>
                        </button>

                        <button
                          onClick={() => {
                            setClosureDialog({ dIdx: contextMenu.dIdx, pIdx: contextMenu.pIdx });
                            setClosureNameInput("");
                            setContextMenu(null);
                          }}
                          className="w-full text-left px-2.5 py-1.5 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 flex items-center justify-between transition cursor-pointer"
                        >
                          <span className="flex items-center gap-2">
                            <HelpCircle className="w-3.5 h-3.5 text-amber-500" />
                            <span>Özel Kapatma Ekle / Düzenle</span>
                          </span>
                          <kbd className="px-1 bg-slate-100 border border-slate-200 text-[8px] rounded text-slate-500 font-mono font-bold">F3</kbd>
                        </button>

                        <button
                          onClick={() => {
                            setTeacherStatusDialog({ dIdx: contextMenu.dIdx, pIdx: contextMenu.pIdx });
                            setTeacherStatusSearch("");
                            setContextMenu(null);
                          }}
                          className="w-full text-left px-2.5 py-1.5 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 flex items-center justify-between transition cursor-pointer"
                        >
                          <span className="flex items-center gap-2">
                            <Info className="w-3.5 h-3.5 text-teal-500" />
                            <span>Okulda Olan Öğretmenleri Göster</span>
                          </span>
                          <kbd className="px-1 bg-slate-100 border border-slate-200 text-[8px] rounded text-slate-500 font-mono font-bold">F4</kbd>
                        </button>

                        {(() => {
                          const { slot } = getSlotAt(contextMenu.dIdx, contextMenu.pIdx);
                          if (slot) {
                            const assignment = state.assignments.find(a => a.id === slot.assignmentId);
                            if (assignment) {
                              return (
                                <button
                                  onClick={() => {
                                    setDistributionDialog({
                                      assignmentId: slot.assignmentId,
                                      current: assignment.customPlacementMode || ""
                                    });
                                    setDistributionInput(assignment.customPlacementMode || "");
                                    setContextMenu(null);
                                  }}
                                  className="w-full text-left px-2.5 py-1.5 hover:bg-blue-50 text-blue-700 border border-blue-100 bg-blue-50/20 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer mt-1"
                                >
                                  <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                                  <span>Bu Derse Özel Dağılım Belirle</span>
                                </button>
                              );
                            }
                          }
                          return null;
                        })()}

                        {(() => {
                          const { slot } = getSlotAt(contextMenu.dIdx, contextMenu.pIdx);
                          if (slot) {
                            const assignment = state.assignments.find(a => a.id === slot.assignmentId);
                            const showSplit = assignment && assignment.weeklyHours > 1;
                            return (
                              <div className="space-y-1 mt-1 border-t border-slate-100 pt-1">
                                {showSplit && (
                                  <button
                                    onClick={() => {
                                      handleSplitAndPlaceLesson(contextMenu.dIdx, contextMenu.pIdx);
                                      setContextMenu(null);
                                    }}
                                    className="w-full text-left px-2.5 py-1.5 hover:bg-indigo-50 text-indigo-700 border border-indigo-100 bg-indigo-50/20 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer"
                                  >
                                    <Scissors className="w-3.5 h-3.5 text-indigo-600" />
                                    <span>Gerekirse Bu Dersi Böl</span>
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    handleForceLessonAt(contextMenu.dIdx, contextMenu.pIdx);
                                    setContextMenu(null);
                                  }}
                                  className="w-full text-left px-2.5 py-1.5 hover:bg-amber-50 text-amber-700 border border-amber-100 bg-amber-50/20 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer"
                                >
                                  <Flame className="w-3.5 h-3.5 text-amber-600 fill-amber-100" />
                                  <span>Bu Dersi Zorla</span>
                                </button>
                              </div>
                            );
                          }
                          return null;
                        })()}

                        <button
                          onClick={() => {
                            handleNavigateToClassFromCell(contextMenu.dIdx, contextMenu.pIdx);
                            setContextMenu(null);
                          }}
                          className="w-full text-left px-2.5 py-1.5 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-2 transition cursor-pointer"
                        >
                          <School className="w-3.5 h-3.5 text-slate-500" />
                          <span>Bu Sınıfı Bağla (Sınıf Programına Git)</span>
                        </button>

                        <button
                          onClick={() => {
                            handleNavigateToTeacherFromCell(contextMenu.dIdx, contextMenu.pIdx);
                            setContextMenu(null);
                          }}
                          className="w-full text-left px-2.5 py-1.5 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-2 transition cursor-pointer"
                        >
                          <User className="w-3.5 h-3.5 text-slate-500" />
                          <span>Öğretmene Bağlan (Öğretmen Programına Git)</span>
                        </button>
                      </div>

                      <div className="pt-1">
                        <button
                          onClick={() => setContextMenu(null)}
                          className="w-full text-center py-1 hover:bg-rose-50 text-rose-600 rounded-lg text-[10px] font-bold transition cursor-pointer"
                        >
                          Kapat
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Teacher right click context menu */}
                  {teacherContextMenu && teacherContextMenu.visible && (
                    <div
                      style={{ top: teacherContextMenu.y, left: teacherContextMenu.x }}
                      className="fixed z-[999] min-w-[260px] bg-white border border-slate-200 rounded-xl shadow-2xl p-1.5 flex flex-col gap-0.5 divide-y divide-slate-100 font-sans"
                      onClick={(e) => e.stopPropagation()} // Prevent auto close when clicking options
                    >
                      <div className="px-2.5 py-1 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        👨‍🏫 {teacherContextMenu.teacherName} İşlemleri
                      </div>
                      <div className="py-1 space-y-0.5">
                        <button
                          onClick={() => {
                            runAutomaticScheduler(true, { teacherIds: [teacherContextMenu.teacherId] });
                            setTeacherContextMenu(null);
                          }}
                          className="w-full text-left px-2.5 py-1.5 hover:bg-blue-50 hover:text-blue-700 text-blue-600 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-blue-500 animate-pulse" />
                          <span>Derslerini Otomatik Yerleştir</span>
                        </button>

                        <button
                          onClick={() => {
                            optimizeGapsForTeacher(teacherContextMenu.teacherId);
                            setTeacherContextMenu(null);
                          }}
                          className="w-full text-left px-2.5 py-1.5 hover:bg-amber-50 hover:text-amber-700 text-amber-600 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer"
                        >
                          <UserCheck className="w-3.5 h-3.5 text-amber-500" />
                          <span>Bu Öğretmenin Boşluğunu Azalt</span>
                        </button>

                        <button
                          onClick={() => {
                            removeSingleLessonDaysForTeacher(teacherContextMenu.teacherId);
                            setTeacherContextMenu(null);
                          }}
                          className="w-full text-left px-2.5 py-1.5 hover:bg-indigo-50 hover:text-indigo-700 text-indigo-600 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer"
                        >
                          <CalendarDays className="w-3.5 h-3.5 text-indigo-500" />
                          <span>Bu Öğretmenin Tek Dersini Kaldır</span>
                        </button>

                        <button
                          onClick={() => {
                            setConfirmModal({
                              isOpen: true,
                              title: "Tüm Dersleri Sil",
                              message: `"${teacherContextMenu.teacherName}" isimli öğretmenin tüm yerleştirilmiş derslerini programdan silmek istediğinize emin misiniz?`,
                              confirmText: "Evet, Sil",
                              isDangerous: true,
                              action: () => {
                                handleClearTeacherLessons(teacherContextMenu.teacherId);
                                setConfirmModal(null);
                              }
                            });
                            setTeacherContextMenu(null);
                          }}
                          className="w-full text-left px-2.5 py-1.5 hover:bg-rose-50 hover:text-rose-700 text-rose-600 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                          <span>Öğretmenin Tüm Derslerini Sil</span>
                        </button>
                      </div>

                      <div className="pt-1">
                        <button
                          onClick={() => setTeacherContextMenu(null)}
                          className="w-full text-center py-1 hover:bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold transition cursor-pointer"
                        >
                          Kapat
                        </button>
                      </div>
                    </div>
                  )}

              </motion.div>

          {/* Progress Overlay for Automated Scheduling */}
          {isScheduling && schedulingProgress && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-100 text-left"
              >
                <div className="p-6 text-center space-y-5">
                  <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  </div>
                  
                  <div className="space-y-1 animate-pulse">
                    <h3 className="text-base font-bold text-slate-800 tracking-tight">DerSayar Algoritması hesaplamalar yapıyor...</h3>
                    <p className="text-xs text-slate-400">Kısıtlar optimize ediliyor</p>
                  </div>

                  {schedulingProgress.targetTeacherName && (
                    <div className="bg-blue-50 border border-blue-100/60 rounded-xl py-2.5 px-3.5 flex flex-col items-center justify-center gap-0.5 max-w-xs mx-auto shadow-sm">
                      <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest">İşlem Yapılan Öğretmen</span>
                      <span className="text-sm font-extrabold text-blue-800 truncate max-w-full">👨‍🏫 {schedulingProgress.targetTeacherName}</span>
                    </div>
                  )}

                  {schedulingProgress.targetClassName && (
                    <div className="bg-purple-50 border border-purple-100/60 rounded-xl py-2.5 px-3.5 flex flex-col items-center justify-center gap-0.5 max-w-xs mx-auto shadow-sm">
                      <span className="text-[9px] font-black text-purple-500 uppercase tracking-widest">İşlem Yapılan Sınıf</span>
                      <span className="text-sm font-extrabold text-purple-800 truncate max-w-full">🏫 {schedulingProgress.targetClassName}</span>
                    </div>
                  )}

                  {/* Minimalist Live Counters Grid */}
                  <div className="grid grid-cols-3 gap-2 bg-slate-50 border border-slate-100 rounded-xl p-3">
                    <div className="text-center space-y-0.5">
                      <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Atanan Ders</span>
                      <span className="block text-base font-extrabold text-slate-700">
                        {schedulingProgress.totalHours ?? state.assignments.reduce((sum, a) => sum + a.weeklyHours, 0)}
                      </span>
                    </div>
                    <div className="text-center space-y-0.5 border-x border-slate-200/60">
                      <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Yerleşen</span>
                      <span className="block text-base font-extrabold text-emerald-600">
                        {schedulingProgress.placedHours ?? 0}
                      </span>
                    </div>
                    <div className="text-center space-y-0.5">
                      <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Kalan Ders</span>
                      <span className="block text-base font-extrabold text-rose-500">
                        {schedulingProgress.unplacedHours ?? 0}
                      </span>
                    </div>
                  </div>

                  <div className="pt-1">
                    <button
                      onClick={() => {
                        stopAutomaticScheduler();
                      }}
                      className="w-full py-2.5 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-600 font-bold text-xs rounded-xl transition-all cursor-pointer shadow-sm hover:shadow"
                    >
                      Durdur
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}

          {/* Options Dialog Modal */}
          {isSchedulingOptionsOpen && (
            <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 text-left">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-100"
              >
                <div className="p-6 space-y-4">
                  <div className="flex items-center space-x-3 text-blue-600">
                    <CalendarDays className="w-5 h-5" />
                    <h3 className="text-base font-bold text-slate-800">Ders Programı Seçenekleri</h3>
                  </div>
                  
                  <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                    Mevcut ders programınızda yerleştirilmiş bazı dersler bulunuyor. Planlama motorunu nasıl çalıştırmak istersiniz?
                  </p>

                  <div className="grid grid-cols-1 gap-3 pt-1">
                    <button
                      onClick={() => {
                        runAutomaticScheduler(false);
                      }}
                      className="flex items-start text-left p-4 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50/50 transition cursor-pointer group"
                    >
                      <div className="p-2 bg-blue-50 text-blue-600 rounded-lg mr-3 group-hover:bg-blue-100 transition shrink-0">
                        <RefreshCw className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-800">Sıfırdan Yeni Program Çıkar</div>
                        <div className="text-[10px] text-slate-400 mt-1 font-semibold leading-normal">
                          Mevcut tüm yerleşimleri siler (kilitli/kapalı çakılı dersler hariç) ve sıfırdan tam kapasiteli optimizasyon yapar. Önerilir!
                        </div>
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        runAutomaticScheduler(true);
                      }}
                      className="flex items-start text-left p-4 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/50 transition cursor-pointer group"
                    >
                      <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg mr-3 group-hover:bg-emerald-100 transition shrink-0">
                        <Lock className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-800">Mevcutları Koru, Kalanları Planla</div>
                        <div className="text-[10px] text-slate-400 mt-1 font-semibold leading-normal">
                          Halihazırda yerleşmiş olan derslerinize kesinlikle dokunmaz. Sadece henüz yerleşmemiş olan ders saatlerini kalan boşluklara planlar.
                        </div>
                      </div>
                    </button>
                  </div>

                  {/* Gelişmiş Dağıtım Ayarları (Multi-Start & Deep Search) */}
                  <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">Daha Fazla Dene / Derinlemesine Ara</span>
                        <span className="text-[10px] text-slate-500 font-semibold leading-normal">Kısıtları zorlayarak çok yönlü tarama gerçekleştirir.</span>
                      </div>
                      <button
                        onClick={() => {
                          const nextVal = !deepSearch;
                          setDeepSearch(nextVal);
                          setNumTrials(nextVal ? 20 : 8);
                        }}
                        className={`w-10 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer shrink-0 ${
                          deepSearch ? "bg-blue-600" : "bg-slate-300"
                        }`}
                      >
                        <div
                          className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                            deepSearch ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-slate-200/50">
                      <div className="flex justify-between text-[10px] font-bold text-slate-500">
                        <span>Çoklu Başlangıç (Multi-Start) Deneme Sayısı:</span>
                        <span className="text-blue-600 font-extrabold">{numTrials} Deneme</span>
                      </div>
                      <input
                        type="range"
                        min="2"
                        max="50"
                        value={numTrials}
                        onChange={(e) => setNumTrials(Number(e.target.value))}
                        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                      <p className="text-[9px] text-slate-400 font-medium leading-relaxed">
                        Her denemede farklı ders yerleşim sırası seçilerek kilitli kısıtlar aşılmaya çalışılır. Sayı arttıkça çözüm oranı %100'e yaklaşır.
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-end pt-1 gap-2">
                    <button
                      onClick={() => setIsSchedulingOptionsOpen(false)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-lg transition cursor-pointer"
                    >
                      Vazgeç
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}

          {/* F3 Özel Kapatma Modal */}
          {closureDialog && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 text-left">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-100"
              >
                <div className="p-6 space-y-4">
                  <div className="flex items-center space-x-2.5 text-amber-600">
                    <Lock className="w-5 h-5" />
                    <h3 className="text-base font-extrabold text-slate-800">Özel Kapatma Belirle</h3>
                  </div>

                  <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                    Seçili hücreyi ({state.settings.days[closureDialog.dIdx]} Günü, {closureDialog.pIdx + 1}. Ders Saati) kapatmak için bir etiket girin veya hızlıca seçim yapın.
                  </p>

                  <div className="space-y-3">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Kapatma İsmi / Etiketi</label>
                    <input
                      type="text"
                      value={closureNameInput}
                      onChange={(e) => setClosureNameInput(e.target.value)}
                      placeholder="Örn: Reh, Drs, koor, Atö, alan, İBE, Nöbet"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 focus:bg-white transition"
                    />

                    <div className="space-y-1.5">
                      <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Hızlı Seçim Etiketleri</span>
                      <div className="flex flex-wrap gap-1.5">
                        {["Reh", "Drs", "koor", "Atö", "alan", "İBE", "Nöbet"].map((preset) => (
                          <button
                            key={preset}
                            onClick={() => {
                              handleSetCustomClosureAt(closureDialog.dIdx, closureDialog.pIdx, preset);
                              setClosureDialog(null);
                            }}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-amber-100 hover:text-amber-800 text-slate-700 text-[10px] font-bold rounded-lg transition-all cursor-pointer"
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                    <button
                      onClick={() => {
                        handleSetCustomClosureAt(closureDialog.dIdx, closureDialog.pIdx, "");
                        setClosureDialog(null);
                      }}
                      className="px-3 py-2 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-bold transition cursor-pointer"
                    >
                      Kapatmayı Temizle
                    </button>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setClosureDialog(null)}
                        className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-lg transition cursor-pointer"
                      >
                        Vazgeç
                      </button>
                      <button
                        onClick={() => {
                          handleSetCustomClosureAt(closureDialog.dIdx, closureDialog.pIdx, closureNameInput || "KAPALI");
                          setClosureDialog(null);
                        }}
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition cursor-pointer shadow-md shadow-amber-100"
                      >
                        Kaydet
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          )}

          {/* F4 Okuldaki Öğretmen Durumları Modal */}
          {teacherStatusDialog && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 text-left">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-100 flex flex-col max-h-[85vh]"
              >
                <div className="p-5 border-b border-slate-100 shrink-0 flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-teal-600">
                    <UserCheck className="w-5 h-5" />
                    <div>
                      <h3 className="text-sm font-extrabold text-slate-800">Ders Saatindeki Öğretmen Durumları</h3>
                      <p className="text-[10px] text-slate-400 mt-0.5 font-semibold">
                        {state.settings.days[teacherStatusDialog.dIdx]} Günü, {teacherStatusDialog.pIdx + 1}. Ders Saati için genel tablo
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setTeacherStatusDialog(null)}
                    className="text-slate-400 hover:text-slate-600 font-bold px-2 py-1 rounded hover:bg-slate-50 transition cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <div className="p-4 bg-slate-50 border-b border-slate-100 shrink-0 flex items-center gap-2">
                  <Search className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    value={teacherStatusSearch}
                    onChange={(e) => setTeacherStatusSearch(e.target.value)}
                    placeholder="Öğretmen adı veya branş ile ara..."
                    className="w-full bg-transparent border-none text-xs font-bold text-slate-700 placeholder-slate-400 focus:outline-none"
                  />
                  {teacherStatusSearch && (
                    <button
                      onClick={() => setTeacherStatusSearch("")}
                      className="text-slate-400 hover:text-slate-600 text-xs font-bold"
                    >
                      Temizle
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {(() => {
                    const filtered = state.teachers.filter(t =>
                      t.name.toLowerCase().includes(teacherStatusSearch.toLowerCase()) ||
                      t.branch.toLowerCase().includes(teacherStatusSearch.toLowerCase())
                    );

                    if (filtered.length === 0) {
                      return <p className="text-center py-8 text-xs text-slate-400 font-semibold">Aranan kriterlere uygun öğretmen bulunamadı.</p>;
                    }

                    return (
                      <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                        <table className="w-full text-xs text-left text-slate-700 border-collapse">
                          <thead>
                            <tr className="bg-slate-100 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                              <th className="py-2 px-3 font-extrabold">Öğretmen Adı / Branş</th>
                              <th className="py-2 px-3 font-extrabold text-right">Mevcut Durum</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {filtered.map((teacher) => {
                              const isUnavailable = teacher.unavailability[teacherStatusDialog.dIdx]?.[teacherStatusDialog.pIdx] === true;
                              const closureLabel = teacher.closureNames?.[teacherStatusDialog.dIdx]?.[teacherStatusDialog.pIdx];
                              
                              let teachingInClass = "";
                              let teachingCourseName = "";
                              for (const cId of Object.keys(state.schedule)) {
                                const s = state.schedule[cId]?.[teacherStatusDialog.dIdx]?.[teacherStatusDialog.pIdx];
                                if (s && s.teacherId && s.teacherId.split(",").includes(teacher.id)) {
                                  teachingInClass = classesMap.get(cId)?.name || cId;
                                  teachingCourseName = coursesMap.get(s.courseId)?.name || "Ders";
                                  break;
                                }
                              }

                              let statusBadge = null;
                              if (isUnavailable) {
                                statusBadge = (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-50 text-rose-700 rounded-full text-[10px] font-extrabold border border-rose-100">
                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
                                    <span>Bu derste kapalı {closureLabel ? `(${closureLabel})` : ""}</span>
                                  </span>
                                );
                              } else if (teachingInClass) {
                                statusBadge = (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full text-[10px] font-bold border border-amber-100">
                                    <span>Derste ({teachingInClass} - {teachingCourseName})</span>
                                  </span>
                                );
                              } else {
                                statusBadge = (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-black border border-emerald-100">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                    <span>Okulda ve Boşta</span>
                                  </span>
                                );
                              }

                              return (
                                <tr key={teacher.id} className="hover:bg-slate-50/50 transition-colors">
                                  <td className="py-2.5 px-3">
                                    <div className="font-bold text-slate-800">{teacher.name}</div>
                                    <div className="text-[10px] text-slate-400 font-semibold mt-0.5">{teacher.branch}</div>
                                  </td>
                                  <td className="py-2.5 px-3 text-right">
                                    {statusBadge}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </div>

                <div className="p-4 border-t border-slate-100 bg-slate-50/50 shrink-0 text-right">
                  <button
                    onClick={() => setTeacherStatusDialog(null)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition cursor-pointer"
                  >
                    Kapat
                  </button>
                </div>
              </motion.div>
            </div>
          )}

          {/* Ders Dağılım Dialog */}
          {distributionDialog && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 text-left">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-100"
              >
                <div className="p-6 space-y-4">
                  <div className="flex items-center space-x-2 text-blue-600">
                    <Edit3 className="w-5 h-5" />
                    <h3 className="text-base font-extrabold text-slate-800">Derse Özel Dağılım Belirle</h3>
                  </div>

                  {(() => {
                    const assign = state.assignments.find(a => a.id === distributionDialog.assignmentId);
                    if (!assign) return null;
                    const course = coursesMap.get(assign.courseId);
                    const classObj = classesMap.get(assign.classId);
                    const teacherNames = assign.teacherId ? assign.teacherId.split(",").map(id => teachersMap.get(id)?.name).filter(Boolean).join(", ") : "Atanmamış";

                    // Compute sum of current input
                    const parts = distributionInput.trim() ? distributionInput.split("+").map(p => parseInt(p.trim(), 10)).filter(p => !isNaN(p)) : [];
                    const partsSum = parts.reduce((sum, p) => sum + p, 0);
                    const isValidSum = partsSum === assign.weeklyHours;

                    return (
                      <div className="space-y-4">
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-700 space-y-1">
                          <p><strong className="text-slate-800">Ders:</strong> {course?.name} ({course?.code})</p>
                          <p><strong className="text-slate-800">Sınıf:</strong> {classObj?.name}</p>
                          <p><strong className="text-slate-800">Öğretmen:</strong> {teacherNames}</p>
                          <p><strong className="text-slate-800">Haftalık Toplam Saat:</strong> <span className="font-bold text-blue-600">{assign.weeklyHours} Saat</span></p>
                        </div>

                        <div className="space-y-2">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Haftalık Gün Dağılım Formatı</label>
                          <input
                            type="text"
                            value={distributionInput}
                            onChange={(e) => setDistributionInput(e.target.value)}
                            placeholder="Örn: 2+2+2 veya 3+3 veya 4+2"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition"
                          />
                          <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">
                            Dağılım saatlerini aralarında '+' karakteri olacak şekilde yazın.
                          </p>
                        </div>

                        {distributionInput.trim() && (
                          <div className={`p-3 rounded-xl border text-xs font-semibold ${isValidSum ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-800"}`}>
                            {isValidSum ? (
                              <p className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                Dağılım geçerli! Toplam: {partsSum} saat (Haftalık saate tam uyuyor).
                              </p>
                            ) : (
                              <p className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                                Dağılım geçersiz: Girdiğiniz dağılım toplamı {partsSum} saat, fakat haftalık ders saati {assign.weeklyHours} saattir!
                              </p>
                            )}
                          </div>
                        )}

                        <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                          <button
                            onClick={() => {
                              handleSetCustomDistribution(distributionDialog.assignmentId, "");
                              setDistributionDialog(null);
                            }}
                            className="px-3 py-2 text-slate-600 hover:bg-slate-50 rounded-lg text-xs font-bold transition cursor-pointer"
                          >
                            Varsayılana Dön
                          </button>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setDistributionDialog(null)}
                              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-lg transition cursor-pointer"
                            >
                              İptal
                            </button>
                            <button
                              disabled={distributionInput.trim() !== "" && !isValidSum}
                              onClick={() => {
                                handleSetCustomDistribution(distributionDialog.assignmentId, distributionInput);
                                setDistributionDialog(null);
                              }}
                              className={`px-4 py-2 text-white text-xs font-bold rounded-lg transition cursor-pointer ${
                                distributionInput.trim() !== "" && !isValidSum
                                  ? "bg-slate-300 cursor-not-allowed text-slate-500"
                                  : "bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-100"
                              }`}
                            >
                              Kaydet
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </motion.div>
            </div>
          )}

          {/* Assignment right-click context menu */}
          {assignmentContextMenu && assignmentContextMenu.visible && (() => {
            const assign = state.assignments.find(a => a.id === assignmentContextMenu.assignmentId);
            if (!assign) return null;
            const course = coursesMap.get(assign.courseId);
            const classObj = classesMap.get(assign.classId);

            return (
              <div
                style={{ top: assignmentContextMenu.y, left: assignmentContextMenu.x }}
                className="fixed z-[999] min-w-[260px] bg-white border border-slate-200 rounded-xl shadow-2xl p-1.5 flex flex-col gap-0.5 divide-y divide-slate-100 font-sans"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-2.5 py-1 text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">
                  📚 {course?.name || "Ders"} İşlemleri
                </div>
                <div className="py-1 space-y-0.5 text-left">
                  <button
                    onClick={() => {
                      setDistributionDialog({
                        assignmentId: assign.id,
                        current: assign.customPlacementMode || ""
                      });
                      setDistributionInput(assign.customPlacementMode || "");
                      setAssignmentContextMenu(null);
                    }}
                    className="w-full text-left px-2.5 py-1.5 hover:bg-blue-50 hover:text-blue-700 text-blue-600 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer border-none bg-transparent"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-blue-500" />
                    <span>Bu Derse Özel Dağıtım Belirle</span>
                  </button>

                  {assign.teacherId && (
                    <>
                      <button
                        onClick={() => {
                          const firstTId = assign.teacherId!.split(",")[0].trim();
                          setScheduleViewMode("teacher");
                          setViewingEntityId(firstTId);
                          showToast(`${teachersMap.get(firstTId)?.name || "Öğretmen"} programına geçildi.`, "success");
                          setAssignmentContextMenu(null);
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-teal-50 hover:text-teal-700 text-teal-600 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer border-none bg-transparent"
                      >
                        <User className="w-3.5 h-3.5 text-teal-500" />
                        <span>Öğretmene Bağlan</span>
                      </button>

                      <button
                        onClick={() => {
                          const firstTId = assign.teacherId!.split(",")[0].trim();
                          optimizeGapsForTeacher(firstTId);
                          setAssignmentContextMenu(null);
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-amber-50 hover:text-amber-700 text-amber-600 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer border-none bg-transparent"
                      >
                        <UserCheck className="w-3.5 h-3.5 text-amber-500" />
                        <span>Bu Öğretmenin Boşluğunu Azalt</span>
                      </button>

                      <button
                        onClick={() => {
                          const firstTId = assign.teacherId!.split(",")[0].trim();
                          removeSingleLessonDaysForTeacher(firstTId);
                          setAssignmentContextMenu(null);
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-indigo-50 hover:text-indigo-700 text-indigo-600 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer border-none bg-transparent"
                      >
                        <CalendarDays className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Bu Öğretmenin Tek Dersini Kaldır</span>
                      </button>
                    </>
                  )}

                  {assign.classId && (
                    <button
                      onClick={() => {
                        setScheduleViewMode("class");
                        setViewingEntityId(assign.classId);
                        showToast(`${classesMap.get(assign.classId)?.name || "Sınıf"} programına geçildi.`, "success");
                        setAssignmentContextMenu(null);
                      }}
                      className="w-full text-left px-2.5 py-1.5 hover:bg-indigo-50 hover:text-indigo-700 text-indigo-600 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer border-none bg-transparent"
                    >
                      <School className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Sınıfa Bağlan</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      handleForceLesson(assign.id);
                      setAssignmentContextMenu(null);
                    }}
                    className="w-full text-left px-2.5 py-1.5 hover:bg-amber-50 hover:text-amber-700 text-amber-600 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer border-none bg-transparent"
                  >
                    <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-100/35" />
                    <span>Bu Dersi Zorla</span>
                  </button>
                </div>

                <div className="pt-1">
                  <button
                    onClick={() => setAssignmentContextMenu(null)}
                    className="w-full text-center py-1 hover:bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold transition cursor-pointer border-none bg-transparent"
                  >
                    Kapat
                  </button>
                </div>
              </div>
            );
          })()}
      </>
    );
}
