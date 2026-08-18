/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ders Programı Yerleştirme Motoru (Yeni Baştan Tasarlanacak Çerçeve)
 */

import {
  AppState,
  ConflictInfo,
  LessonAssignment,
  ScheduleSlot,
  ClassScheduleMap,
  Teacher,
  GradeClass,
  Classroom,
  Course
} from "../types";

export interface ProgressUpdate {
  phase: "backtracking" | "optimizing" | "completed" | "failed";
  percent: number;
  message: string;
  steps: number;
  currentScore?: number;
  unplacedCount?: number;
  reports?: string[];
  bestSchedule?: ClassScheduleMap;
  totalHours?: number;
  placedHours?: number;
  unplacedHours?: number;
  globalTotalHours?: number;
  globalPlacedHours?: number;
  globalUnplacedHours?: number;
  targetTeacherName?: string;
  targetClassName?: string;
  elapsedSeconds?: number;
  unplacedDetails?: any;
}

export interface FeasibilityIssue {
  type: "error" | "warning";
  entityType: "teacher" | "class" | "classroom";
  entityName: string;
  assignedHours: number;
  availableHours: number;
  message: string;
}

export interface UnplacedReportItem {
  id: string;
  assignmentId: string;
  classId: string;
  className: string;
  courseId: string;
  courseName: string;
  teacherId: string;
  teacherName: string;
  size: number;
  reason: string;
  suggestions?: string[];
}

export interface ScheduleScoreBreakdown {
  teacherGapsPenalty: number;
  classGapsPenalty: number;
  distributionPenalty: number;
  balancePenalty: number;
  periodPriorityPenalty: number;
  totalPenalty: number;
}

export function parseTeacherIds(teacherIdStr?: string): string[] {
  if (!teacherIdStr) return [];
  return teacherIdStr
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getDefaultMaxDepth(teacherCount: number): number {
  if (teacherCount < 20) return 8;
  if (teacherCount < 50) return 15;
  return 25;
}

/**
 * Fizibilite Ön Kontrolü: Öğretmen, sınıf ve dersliklerin toplam ders yükü ile müsaitliklerini karşılaştırır.
 */
export function preSolveFeasibilityCheck(state: AppState): FeasibilityIssue[] {
  const { settings, teachers, classes, classrooms, assignments } = state;
  const numDays = settings.days.length;
  const numPeriods = settings.periodsPerDay;
  const totalSlotsPerEntity = numDays * numPeriods;
  const issues: FeasibilityIssue[] = [];

  const countAvailableSlots = (unavailability: any) => {
    let unavail = 0;
    for (let d = 0; d < numDays; d++) {
      if (unavailability && unavailability[d]) {
        for (let p = 0; p < numPeriods; p++) {
          if (unavailability[d][p]) {
            unavail++;
          }
        }
      }
    }
    return totalSlotsPerEntity - unavail;
  };

  teachers.forEach((t) => {
    const teacherAssignments = assignments.filter((a) => {
      if (!a.teacherId) return false;
      return parseTeacherIds(a.teacherId).includes(t.id);
    });
    const totalHours = teacherAssignments.reduce((sum, a) => sum + (a.weeklyHours || 0), 0);
    const available = countAvailableSlots(t.unavailability);

    if (totalHours > available) {
      issues.push({
        type: "error",
        entityType: "teacher",
        entityName: t.name,
        assignedHours: totalHours,
        availableHours: available,
        message: `${t.name} öğretmeninin haftalık ${totalHours} saat dersi var ancak sadece ${available} saat müsaitliği bulunuyor.`
      });
    }
  });

  classes.forEach((c) => {
    const classAssignments = assignments.filter((a) => a.classId === c.id);
    const totalHours = classAssignments.reduce((sum, a) => sum + (a.weeklyHours || 0), 0);
    const available = countAvailableSlots(c.unavailability);

    if (totalHours > available) {
      issues.push({
        type: "error",
        entityType: "class",
        entityName: c.name,
        assignedHours: totalHours,
        availableHours: available,
        message: `${c.name} sınıfının haftalık ${totalHours} saat dersi var ancak sadece ${available} saat müsaitliği bulunuyor.`
      });
    }
  });

  classrooms.forEach((cr) => {
    const crAssignments = assignments.filter((a) => a.classroomId === cr.id);
    const totalHours = crAssignments.reduce((sum, a) => sum + (a.weeklyHours || 0), 0);
    const available = countAvailableSlots(cr.unavailability);

    if (totalHours > available) {
      issues.push({
        type: "error",
        entityType: "classroom",
        entityName: cr.name,
        assignedHours: totalHours,
        availableHours: available,
        message: `${cr.name} dersliğinin haftalık ${totalHours} saatlik talebi var ancak sadece ${available} saat müsaitliği bulunuyor.`
      });
    }
  });

  return issues;
}

/**
 * Mevcut ders programındaki çakışmaları ve kısıt ihlallerini tespit eder.
 */
export function detectConflicts(state: AppState): ConflictInfo[] {
  const conflicts: ConflictInfo[] = [];
  const { schedule, settings, teachers, classes, classrooms, courses } = state;
  if (!schedule) return conflicts;

  const numDays = settings.days.length;
  const numPeriods = settings.periodsPerDay;

  const teacherMap = new Map(teachers.map((t) => [t.id, t]));
  const classMap = new Map(classes.map((c) => [c.id, c]));
  const classroomMap = new Map(classrooms.map((cr) => [cr.id, cr]));
  const courseMap = new Map(courses.map((co) => [co.id, co]));

  for (let d = 0; d < numDays; d++) {
    for (let p = 0; p < numPeriods; p++) {
      const teacherSlots: { [tId: string]: string[] } = {};
      const classroomSlots: { [crId: string]: string[] } = {};

      for (const classId of Object.keys(schedule)) {
        const slot = schedule[classId]?.[d]?.[p];
        if (!slot) continue;

        const classObj = classMap.get(classId);
        const courseObj = courseMap.get(slot.courseId);

        // 1. Sınıf Müsaitlik İhlali
        if (classObj?.unavailability?.[d]?.[p]) {
          conflicts.push({
            type: "class_unavailable",
            dayIndex: d,
            periodIndex: p,
            details: { classId, courseId: slot.courseId },
            message: `${classObj.name} sınıfının kapalı olduğu saate ders atanmış (${courseObj?.name || 'Ders'}).`
          });
        }

        // 2. Öğretmen Doluluk ve Müsaitlik Kontrolü
        if (slot.teacherId) {
          const tIds = parseTeacherIds(slot.teacherId);
          for (const tId of tIds) {
            const tObj = teacherMap.get(tId);
            if (tObj?.unavailability?.[d]?.[p]) {
              conflicts.push({
                type: "teacher_unavailable",
                dayIndex: d,
                periodIndex: p,
                details: { teacherId: tId, classId, courseId: slot.courseId },
                message: `${tObj.name} öğretmeninin kapalı olduğu saate ders atanmış.`
              });
            }

            if (!teacherSlots[tId]) teacherSlots[tId] = [];
            teacherSlots[tId].push(classId);
          }
        }

        // 3. Derslik Doluluk ve Müsaitlik Kontrolü
        if (slot.classroomId) {
          const crObj = classroomMap.get(slot.classroomId);
          if (crObj?.unavailability?.[d]?.[p]) {
            conflicts.push({
              type: "classroom_unavailable",
              dayIndex: d,
              periodIndex: p,
              details: { classroomId: slot.classroomId, classId },
              message: `${crObj.name} dersliğinin kapalı olduğu saate ders atanmış.`
            });
          }

          if (!classroomSlots[slot.classroomId]) classroomSlots[slot.classroomId] = [];
          classroomSlots[slot.classroomId].push(classId);
        }
      }

      // Öğretmen Çift Rezervasyon (Aynı saatte birden fazla sınıfta olma)
      for (const [tId, cIds] of Object.entries(teacherSlots)) {
        if (cIds.length > 1) {
          const tObj = teacherMap.get(tId);
          const classNames = cIds.map((cid) => classMap.get(cid)?.name || cid).join(", ");
          conflicts.push({
            type: "teacher_overlap",
            dayIndex: d,
            periodIndex: p,
            details: { teacherId: tId },
            message: `${tObj?.name || 'Öğretmen'} aynı saatte birden fazla sınıfta (${classNames}) ders verilmiş.`
          });
        }
      }

      // Derslik Çift Rezervasyon
      for (const [crId, cIds] of Object.entries(classroomSlots)) {
        if (cIds.length > 1) {
          const crObj = classroomMap.get(crId);
          const classNames = cIds.map((cid) => classMap.get(cid)?.name || cid).join(", ");
          conflicts.push({
            type: "classroom_overlap",
            dayIndex: d,
            periodIndex: p,
            details: { classroomId: crId },
            message: `${crObj?.name || 'Derslik'} aynı saatte birden fazla sınıf (${classNames}) tarafından kullanılıyor.`
          });
        }
      }
    }
  }

  return conflicts;
}

export function getTeacherGapsForDay(
  schedule: ClassScheduleMap,
  teacherId: string,
  dayIndex: number,
  periodsPerDay: number
): number {
  const activePeriods: number[] = [];
  for (let p = 0; p < periodsPerDay; p++) {
    let isTeaching = false;
    for (const classId of Object.keys(schedule)) {
      const slot = schedule[classId]?.[dayIndex]?.[p];
      if (slot && slot.teacherId && parseTeacherIds(slot.teacherId).includes(teacherId)) {
        isTeaching = true;
        break;
      }
    }
    if (isTeaching) {
      activePeriods.push(p);
    }
  }

  if (activePeriods.length <= 1) return 0;
  const minP = Math.min(...activePeriods);
  const maxP = Math.max(...activePeriods);
  let gaps = 0;
  for (let p = minP + 1; p < maxP; p++) {
    if (!activePeriods.includes(p)) {
      gaps++;
    }
  }
  return gaps;
}

export function calculateScheduleScore(
  schedule: ClassScheduleMap,
  state: AppState
): ScheduleScoreBreakdown {
  return {
    teacherGapsPenalty: 0,
    classGapsPenalty: 0,
    distributionPenalty: 0,
    balancePenalty: 0,
    periodPriorityPenalty: 0,
    totalPenalty: 0
  };
}

/**
 * Manuel sürükle-bırak takası için yardımcı fonksiyon.
 */
export function tryManualChainShift(
  state: AppState,
  assignmentId: string,
  targetD: number,
  targetP: number,
  sourceD: number = -1,
  sourceP: number = -1,
  maxDepth: number = 8
): ClassScheduleMap | null {
  const currentSchedule = state.schedule ? JSON.parse(JSON.stringify(state.schedule)) : {};
  const assignment = state.assignments.find((a) => a.id === assignmentId);
  if (!assignment) return null;

  const classId = assignment.classId;
  if (!currentSchedule[classId]) currentSchedule[classId] = {};
  if (!currentSchedule[classId][targetD]) {
    currentSchedule[classId][targetD] = Array(state.settings.periodsPerDay).fill(null);
  }

  // Kaynak hücreyi temizle
  if (sourceD !== -1 && sourceP !== -1 && currentSchedule[classId]?.[sourceD]?.[sourceP]?.assignmentId === assignmentId) {
    currentSchedule[classId][sourceD][sourceP] = null;
  }

  // Hedef hücreye yerleştir
  currentSchedule[classId][targetD][targetP] = {
    assignmentId: assignment.id,
    courseId: assignment.courseId,
    teacherId: assignment.teacherId,
    classroomId: assignment.classroomId
  };

  return currentSchedule;
}

let activeAbort = false;

export function stopActiveScheduler(): void {
  activeAbort = true;
}

/**
 * Otomatik ders yerleştirme fonksiyonu (Yeni baştan yazılacak motor giriş noktası).
 */
export async function generateAutomaticScheduleAsync(
  state: AppState,
  onProgress?: (progress: ProgressUpdate) => void,
  options?: {
    keepExisting?: boolean;
    targetClassIds?: string[];
    targetTeacherIds?: string[];
    priorityAssignmentIds?: string[];
    numTrials?: number;
    deepSearch?: boolean;
    maxDurationMs?: number;
    maxDepth?: number;
    stepByStep?: boolean;
    randomSeed?: number;
  }
): Promise<{
  success: boolean;
  schedule: ClassScheduleMap;
  message: string;
  unplacedDetails?: string[];
  unplacedReports?: UnplacedReportItem[];
  usedSeed?: number;
  unplacedCount?: number;
}> {
  activeAbort = false;
  const numDays = state.settings.days.length;
  const numPeriods = state.settings.periodsPerDay;

  // Yeni temiz program şablonu oluştur
  const schedule: ClassScheduleMap = options?.keepExisting && state.schedule
    ? JSON.parse(JSON.stringify(state.schedule))
    : {};

  for (const cls of state.classes) {
    if (!schedule[cls.id]) {
      schedule[cls.id] = {};
    }
    for (let d = 0; d < numDays; d++) {
      if (!schedule[cls.id][d]) {
        schedule[cls.id][d] = Array(numPeriods).fill(null);
      }
    }
  }

  onProgress?.({
    phase: "completed",
    percent: 100,
    message: "Yerleştirme motoru sıfırlandı. Yeni algoritma geliştirilmeye hazır.",
    steps: 1,
    unplacedCount: 0,
    bestSchedule: schedule
  });

  return {
    success: true,
    schedule,
    message: "Yerleştirme motoru sıfırlandı. Yeni algoritma geliştirilmeye hazır.",
    unplacedCount: 0,
    unplacedDetails: []
  };
}

export const generateStepByStepScheduleAsync = generateAutomaticScheduleAsync;

export function generateAutomaticSchedule(state: AppState): {
  success: boolean;
  schedule: ClassScheduleMap;
  message: string;
} {
  const numDays = state.settings.days.length;
  const numPeriods = state.settings.periodsPerDay;
  const schedule: ClassScheduleMap = {};

  for (const cls of state.classes) {
    schedule[cls.id] = {};
    for (let d = 0; d < numDays; d++) {
      schedule[cls.id][d] = Array(numPeriods).fill(null);
    }
  }

  return {
    success: true,
    schedule,
    message: "Yerleştirme motoru sıfırlandı."
  };
}

export function generatePartialSchedule(
  state: AppState,
  options: { targetClassIds?: string[]; targetTeacherIds?: string[] }
): {
  success: boolean;
  schedule: ClassScheduleMap;
  message: string;
} {
  return generateAutomaticSchedule(state);
}

export function optimizeGapsForTeacher(
  state: AppState,
  teacherId: string
): { success: boolean; schedule?: ClassScheduleMap; message: string; type: "success" | "info" | "error" } {
  return {
    success: false,
    message: "Boşluk optimizasyonu motoru yeni algoritma için hazır bekletiliyor.",
    type: "info"
  };
}

export function optimizeGapsForAllTeachers(
  state: AppState
): { success: boolean; schedule?: ClassScheduleMap; message: string; type: "success" | "info" | "error" } {
  return {
    success: false,
    message: "Tüm öğretmenler için boşluk optimizasyonu motoru yeni algoritma için hazır bekletiliyor.",
    type: "info"
  };
}

export function removeSingleLessonDays(
  state: AppState
): { success: boolean; schedule?: ClassScheduleMap; message: string; type: "success" | "info" | "error" } {
  return {
    success: false,
    message: "Tek ders günlerini kaldırma motoru yeni algoritma için hazır bekletiliyor.",
    type: "info"
  };
}

export function removeSingleLessonDaysForTeacher(
  state: AppState,
  teacherId: string
): { success: boolean; schedule?: ClassScheduleMap; message: string; type: "success" | "info" | "error" } {
  return {
    success: false,
    message: "Seçili öğretmen için tek ders günlerini kaldırma motoru yeni algoritma için hazır bekletiliyor.",
    type: "info"
  };
}

