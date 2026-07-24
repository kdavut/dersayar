/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
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
import {
  parseTeacherIds
} from "./scheduler/helpers";

import { detectConflicts } from "./scheduler/conflicts";
import { getTeacherGapsForDay } from "./scheduler/gaps";
import { preSolveFeasibilityCheck, FeasibilityIssue } from "./scheduler/feasibility";
import { 
  diagnoseUnplacedAssignment, 
  UnplacedReportItem, 
  SuggestionAction, 
  restoreMissingTeacherHours 
} from "./scheduler/diagnostics";
import { calculateScheduleScore, ScheduleScoreBreakdown } from "./scheduler/scoring_breakdown";
import { tryManualChainShift } from "./scheduler/validation";
import { runSolver } from "./scheduler/solveEngine";

export {
  parseTeacherIds,
  detectConflicts,
  getTeacherGapsForDay,
  preSolveFeasibilityCheck,
  diagnoseUnplacedAssignment,
  restoreMissingTeacherHours,
  calculateScheduleScore,
  tryManualChainShift
};

export type {
  FeasibilityIssue,
  UnplacedReportItem,
  SuggestionAction,
  ScheduleScoreBreakdown
};

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

interface BlockToPlace {
  assignment: LessonAssignment;
  size: number;
  id: string;
}

export function getDefaultMaxDepth(teacherCount: number): number {
  if (teacherCount < 20) return 8;
  if (teacherCount < 50) return 15;
  return 25;
}

/**
 * Checks if a specific block of lessons can be placed in a schedule without hard conflicts.
 */
export function isPlacementValid(
  state: {
    settings: AppState["settings"];
    teachers: Teacher[];
    classes: GradeClass[];
    classrooms: Classroom[];
    assignments: LessonAssignment[];
  },
  tempSchedule: ClassScheduleMap,
  assignment: LessonAssignment,
  dayIndex: number,
  startPeriod: number,
  blockSize: number
): boolean {
  return isPlacementValidEx(state, tempSchedule, assignment, dayIndex, startPeriod, blockSize);
}

/**
 * Advanced placement validation with class exclusion to prevent teacher overlap false-positives during local search swaps.
 */
export function isPlacementValidEx(
  state: {
    settings: AppState["settings"];
    teachers: Teacher[];
    classes: GradeClass[];
    classrooms: Classroom[];
    assignments: LessonAssignment[];
  },
  tempSchedule: ClassScheduleMap,
  assignment: LessonAssignment,
  dayIndex: number,
  startPeriod: number,
  blockSize: number,
  classIdToIgnoreTeacherCheck?: string
): boolean {
  const { settings, teachers, classrooms } = state;
  const numPeriods = settings.periodsPerDay;

  if (startPeriod + blockSize > numPeriods) return false;

  const classroom = assignment.classroomId
    ? classrooms.find(r => r.id === assignment.classroomId)
    : null;
  const classItem = state.classes.find(c => c.id === assignment.classId);

  // Strict different days constraint check - different blocks of same course must go to different days
  const classDaySched = tempSchedule[assignment.classId]?.[dayIndex];
  if (classDaySched) {
    const hasOtherAssignmentOfSameCourse = classDaySched.some(
      slot => slot !== null && slot.courseId === assignment.courseId
    );
    if (hasOtherAssignmentOfSameCourse) {
      return false;
    }
  }

  for (let offset = 0; offset < blockSize; offset++) {
    const p = startPeriod + offset;

    if (classItem && classItem.dailyPeriods) {
      const maxPeriodsThisDay = classItem.dailyPeriods[dayIndex];
      if (maxPeriodsThisDay !== undefined && p >= maxPeriodsThisDay) return false;
    }

    if (classItem?.unavailability[dayIndex]?.[p]) return false;

    if (assignment.teacherId) {
      const teacherIds = parseTeacherIds(assignment.teacherId);
      for (const tId of teacherIds) {
        const teacher = teachers.find(t => t.id === tId);
        if (teacher?.unavailability[dayIndex]?.[p]) return false;
      }
    }

    if (classroom?.unavailability[dayIndex]?.[p]) return false;

    // Only verify cell emptiness if checking without SA-driven swap replacements
    if (classIdToIgnoreTeacherCheck === undefined) {
      if (tempSchedule[assignment.classId]?.[dayIndex]?.[p] !== null) {
        return false;
      }
    } else {
      const existingSlot = tempSchedule[assignment.classId]?.[dayIndex]?.[p];
      if (existingSlot && existingSlot.isLocked === true) {
        return false;
      }
    }

    if (assignment.teacherId) {
      const teacherIds = parseTeacherIds(assignment.teacherId);
      for (const tId of teacherIds) {
        for (const cId of Object.keys(tempSchedule)) {
          if (classIdToIgnoreTeacherCheck && cId === classIdToIgnoreTeacherCheck) {
            continue;
          }
          const classSched = tempSchedule[cId];
          if (!classSched) continue;
          const slot = classSched[dayIndex]?.[p];
          if (slot && slot.teacherId) {
            const existingTeacherIds = parseTeacherIds(slot.teacherId);
            if (existingTeacherIds.includes(tId)) {
              return false;
            }
          }
        }
      }
    }

    if (assignment.classroomId) {
      for (const cId of Object.keys(tempSchedule)) {
        if (classIdToIgnoreTeacherCheck && cId === classIdToIgnoreTeacherCheck) {
          continue;
        }
        const classSched = tempSchedule[cId];
        if (!classSched) continue;
        const slot = classSched[dayIndex]?.[p];
        if (slot && slot.classroomId === assignment.classroomId) {
          return false;
        }
      }
    }
  }

  return true;
}

// Manage Web Worker background execution states
let activeWorker: Worker | null = null;
let activeResolve: any = null;
let lastProgressProgress: any = null;
let initialSchedule: ClassScheduleMap | null = null;
let initialAppState: AppState | null = null;
let mainThreadStopped = false;

export function stopActiveScheduler(): void {
  mainThreadStopped = true;
  if (activeWorker) {
    try {
      activeWorker.postMessage({ type: "stop" });
    } catch (e) {
      console.error("Error posting stop message to worker:", e);
    }
    const w = activeWorker;
    activeWorker = null;
    
    // Safety fallback: hard-terminate the worker after 1200ms if it fails to stop cleanly
    setTimeout(() => {
      try {
        w.terminate();
      } catch (e) {}

      if (activeResolve) {
        let lastSchedule = lastProgressProgress?.bestSchedule || initialSchedule || {};
        if (initialSchedule && initialAppState) {
          lastSchedule = restoreMissingTeacherHours(initialSchedule, lastSchedule, initialAppState);
        }
        const unplacedCount = lastProgressProgress?.unplacedHours ?? 0;
        activeResolve({
          success: false,
          schedule: lastSchedule,
          message: "Planlama kullanıcı tarafından durduruldu. Mevcut en iyi program yüklendi.",
          unplacedCount: unplacedCount,
          unplacedDetails: lastProgressProgress?.unplacedDetails || []
        });
        activeResolve = null;
        lastProgressProgress = null;
      }
    }, 1200);
  } else {
    if (activeResolve) {
      let lastSchedule = lastProgressProgress?.bestSchedule || initialSchedule || {};
      if (initialSchedule && initialAppState) {
        lastSchedule = restoreMissingTeacherHours(initialSchedule, lastSchedule, initialAppState);
      }
      const unplacedCount = lastProgressProgress?.unplacedHours ?? 0;
      activeResolve({
        success: false,
        schedule: lastSchedule,
        message: "Planlama durduruldu. Mevcut en iyi program yüklendi.",
        unplacedCount: unplacedCount,
        unplacedDetails: lastProgressProgress?.unplacedDetails || []
      });
      activeResolve = null;
      lastProgressProgress = null;
    }
  }
}

/**
 * Completely asynchronous scheduling solver combining Multi-Start Randomized CSP Backtracking
 * followed by Simulated Annealing local search. Never violates hard constraints.
 */
export async function generateStepByStepScheduleAsync(
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
  return new Promise((resolve) => {
    stopActiveScheduler();

    initialSchedule = state.schedule || {};
    initialAppState = state;
    mainThreadStopped = false;
    activeResolve = resolve;
    lastProgressProgress = null;

    const processSolverResult = (result: any) => {
      if (result && result.schedule) {
        const { settings, teachers, classes, assignments } = state;
        const numDays = settings.days.length;
        const numPeriods = settings.periodsPerDay;

        // Sanitize schedule: Ensure no assignment ever exceeds its assigned weeklyHours
        const assignmentsMap = new Map(assignments.map(a => [a.id, a]));
        const scheduledHoursCount: { [assignId: string]: number } = {};

        for (const cId of Object.keys(result.schedule)) {
          for (let d = 0; d < numDays; d++) {
            const daySlots = result.schedule[cId][d];
            if (daySlots) {
              for (let p = 0; p < numPeriods; p++) {
                const slot = daySlots[p];
                if (slot) {
                  const assign = assignmentsMap.get(slot.assignmentId);
                  const maxAllowed = assign ? assign.weeklyHours : 999;
                  const currentCount = (scheduledHoursCount[slot.assignmentId] || 0);

                  if (currentCount >= maxAllowed) {
                    // Remove excess slot
                    daySlots[p] = null;
                  } else {
                    scheduledHoursCount[slot.assignmentId] = currentCount + 1;
                  }
                }
              }
            }
          }
        }

        const unplacedReports: UnplacedReportItem[] = [];
        const unplacedDiagnosis: string[] = [];

        const targetTeacherIds = options?.targetTeacherIds;
        const targetClassIds = options?.targetClassIds;

        for (const assign of assignments) {
          if (targetTeacherIds && targetTeacherIds.length > 0) {
            if (!assign.teacherId) continue;
            const assignTeacherIds = parseTeacherIds(assign.teacherId);
            const hasTargetTeacher = assignTeacherIds.some(id => targetTeacherIds.includes(id));
            if (!hasTargetTeacher) continue;
          }

          if (targetClassIds && targetClassIds.length > 0) {
            if (!targetClassIds.includes(assign.classId)) continue;
          }

          const placed = scheduledHoursCount[assign.id] || 0;
          const remaining = assign.weeklyHours - placed;
          if (remaining > 0) {
            const diagnosis = diagnoseUnplacedAssignment(state, result.schedule, assign, remaining);
            unplacedDiagnosis.push(`❌ ${classes.find(c => c.id === assign.classId)?.name || 'Sınıf'} sınıfındaki "${state.courses.find(co => co.id === assign.courseId)?.name || 'Ders'}" dersi yerleştirilemedi. Neden: ${diagnosis.reason}`);
            const teacherNames = assign.teacherId
              ? parseTeacherIds(assign.teacherId).map(id => teachers.find(t => t.id === id)?.name || id).join(", ")
              : "Öğretmensiz";

            unplacedReports.push({
              id: assign.id,
              assignmentId: assign.id,
              classId: assign.classId,
              className: classes.find(c => c.id === assign.classId)?.name || assign.classId,
              courseId: assign.courseId,
              courseName: state.courses.find(c => c.id === assign.courseId)?.name || assign.courseId,
              teacherId: assign.teacherId || "",
              teacherName: teacherNames,
              size: remaining,
              reason: diagnosis.reason,
              suggestions: diagnosis.suggestions
            });
          }
        }

        if (unplacedDiagnosis.length > 0) {
          result.success = false;
          result.unplacedDetails = unplacedDiagnosis;
          result.unplacedReports = unplacedReports;
          result.message = `Ders programı yerleştirildi ancak ${unplacedDiagnosis.length} ders yerleştirilemedi. Lütfen kısıtları gevşetmeyi deneyin.`;
        } else {
          result.success = true;
          result.message = "Tüm haftalık ders programı başarıyla yerleştirildi ve optimize edildi!";
        }
      }
      return result;
    };

    const runMainThreadFallback = async () => {
      console.warn("Falling back to main-thread execution due to Web Worker absence or error.");
      const activeSeed = options?.randomSeed ?? 123456789;
      try {
        const result = await runSolver(
          state,
          options,
          activeSeed,
          (progress) => {
            if (mainThreadStopped) return;
            if (progress) {
              lastProgressProgress = progress;
            }
            if (onProgress && progress) {
              onProgress(progress);
            }
          },
          () => mainThreadStopped
        );

        if (mainThreadStopped) {
          let lastSchedule = lastProgressProgress?.bestSchedule || initialSchedule || {};
          if (initialSchedule && initialAppState) {
            lastSchedule = restoreMissingTeacherHours(initialSchedule, lastSchedule, initialAppState);
          }
          const unplacedCount = lastProgressProgress?.unplacedHours ?? 0;
          activeResolve = null;
          resolve({
            success: false,
            schedule: lastSchedule,
            message: "Planlama kullanıcı tarafından durduruldu. Mevcut en iyi program yüklendi.",
            unplacedCount: unplacedCount,
            unplacedDetails: lastProgressProgress?.unplacedDetails || []
          });
          return;
        }

        const processed = processSolverResult(result);
        activeResolve = null;
        resolve(processed);
      } catch (fallbackErr: any) {
        console.error("Main-thread fallback execution failed:", fallbackErr);
        activeResolve = null;
        resolve({
          success: false,
          schedule: state.schedule || {},
          unplacedCount: 999,
          message: `Planlama sırasında hata oluştu: ${fallbackErr.message || fallbackErr}`
        });
      }
    };

    try {
      const worker = new Worker(
        new URL("./scheduler.worker.ts", import.meta.url),
        { type: "module" }
      );
      activeWorker = worker;

      worker.onmessage = (event) => {
        if (mainThreadStopped) return;
        const { type, progress, result } = event.data;
        if (type === "progress") {
          if (progress) {
            lastProgressProgress = progress;
          }
          if (onProgress && progress) {
            onProgress(progress);
          }
        } else if (type === "result") {
          if (activeWorker === worker) {
            activeWorker = null;
          }
          activeResolve = null;
          worker.terminate();

          const processed = processSolverResult(result);
          resolve(processed);
        }
      };

      worker.onerror = (err) => {
        console.warn("Web Worker error caught, triggering main-thread fallback:", err);
        if (activeWorker === worker) {
          activeWorker = null;
        }
        worker.terminate();
        runMainThreadFallback();
      };

      worker.postMessage({
        state: {
          settings: state.settings,
          teachers: state.teachers,
          classes: state.classes,
          classrooms: state.classrooms,
          assignments: state.assignments,
          courses: state.courses,
          schedule: state.schedule
        },
        options
      });
    } catch (error) {
      console.warn("Could not start Web Worker, falling back to main-thread execution:", error);
      runMainThreadFallback();
    }
  });
}

export const generateAutomaticScheduleAsync = generateStepByStepScheduleAsync;

/**
 * Synchronous wrapper for automated timetabling solver, running a rapid pass of the engine.
 */
export function generateAutomaticSchedule(state: AppState): {
  success: boolean;
  schedule: ClassScheduleMap;
  message: string;
} {
  const { settings, teachers, classes, assignments } = state;
  const numDays = settings.days.length;
  const numPeriods = settings.periodsPerDay;

  const freshSchedule: ClassScheduleMap = {};
  for (const c of classes) {
    freshSchedule[c.id] = {};
    for (let d = 0; d < numDays; d++) {
      freshSchedule[c.id][d] = Array(numPeriods).fill(null);
      const existingDay = state.schedule[c.id]?.[d];
      if (existingDay) {
        for (let p = 0; p < numPeriods; p++) {
          const slot = existingDay[p];
          const isLocked = (c.unavailability[d]?.[p] === true) || (slot?.isLocked === true);
          if (slot && isLocked) {
            freshSchedule[c.id][d][p] = slot;
          }
        }
      }
    }
  }

  const coursesMap = new Map<string, Course>(state.courses.map((co) => [co.id, co]));

  const blocksToPlace: BlockToPlace[] = [];
  assignments.forEach((assign) => {
    let remainingHours = assign.weeklyHours;
    let blockCounter = 0;

    let parts: number[] = [];
    if (assign.customPlacementMode) {
      parts = assign.customPlacementMode.split("+").map((p: string) => parseInt(p.trim(), 10)).filter((p: number) => !isNaN(p) && p > 0);
    } else {
      const course = coursesMap.get(assign.courseId);
      if (course && course.placementMode) {
        parts = course.placementMode.split("+").map((p: string) => parseInt(p.trim(), 10)).filter((p: number) => !isNaN(p) && p > 0);
      }
    }

    if (parts.length > 0) {
      let tempRemaining = remainingHours;
      for (const partSize of parts) {
        if (tempRemaining <= 0) break;
        const size = Math.min(partSize, tempRemaining);
        blocksToPlace.push({
          assignment: assign,
          size: size,
          id: `${assign.id}-b${blockCounter++}`
        });
        tempRemaining -= size;
      }
      const prefBlock = assign.preferredBlockSize || 2;
      while (tempRemaining > 0) {
        const size = Math.min(prefBlock, tempRemaining);
        blocksToPlace.push({
          assignment: assign,
          size: size,
          id: `${assign.id}-b${blockCounter++}`
        });
        tempRemaining -= size;
      }
    } else {
      const prefBlock = assign.preferredBlockSize || 2;
      while (remainingHours > 0) {
        const size = Math.min(prefBlock, remainingHours);
        blocksToPlace.push({
          assignment: assign,
          size: size,
          id: `${assign.id}-b${blockCounter++}`
        });
        remainingHours -= size;
      }
    }
  });

  // Fast greedy pass
  let placedCount = 0;
  for (const block of blocksToPlace) {
    let placed = false;
    for (let d = 0; d < numDays && !placed; d++) {
      for (let p = 0; p <= numPeriods - block.size && !placed; p++) {
        if (isPlacementValidEx(state, freshSchedule, block.assignment, d, p, block.size)) {
          for (let offset = 0; offset < block.size; offset++) {
            freshSchedule[block.assignment.classId][d][p + offset] = {
              assignmentId: block.assignment.id,
              courseId: block.assignment.courseId,
              teacherId: block.assignment.teacherId,
              classroomId: block.assignment.classroomId
            };
          }
          placed = true;
          placedCount++;
        }
      }
    }
    if (!placed && block.size > 1) {
      let remainingSize = block.size;
      for (let d = 0; d < numDays && remainingSize > 0; d++) {
        for (let p = 0; p < numPeriods && remainingSize > 0; p++) {
          if (isPlacementValidEx(state, freshSchedule, block.assignment, d, p, 1)) {
            freshSchedule[block.assignment.classId][d][p] = {
              assignmentId: block.assignment.id,
              courseId: block.assignment.courseId,
              teacherId: block.assignment.teacherId,
              classroomId: block.assignment.classroomId
            };
            remainingSize--;
          }
        }
      }
      if (remainingSize === 0) placedCount++;
    }
  }

  const success = placedCount === blocksToPlace.length;
  return {
    success,
    schedule: freshSchedule,
    message: success
      ? "Çakışma ve kısıtlamalara %100 uyan eksiksiz ders programı otomatik olarak oluşturuldu."
      : `Kısıtlar nedeniyle tam çözüm bulunamadı (${placedCount}/${blocksToPlace.length} ders yerleştirildi). Kalanları manuel yerleştirebilirsiniz.`
  };
}

/**
 * Synchronous wrapper for partial timetabling solver, supporting targeted class/teacher runs.
 */
export function generatePartialSchedule(
  state: AppState,
  options: {
    targetClassIds?: string[];
    targetTeacherIds?: string[];
  }
): {
  success: boolean;
  schedule: ClassScheduleMap;
  message: string;
} {
  const { settings, teachers, classes, assignments } = state;
  const numDays = settings.days.length;
  const numPeriods = settings.periodsPerDay;

  const tempSchedule: ClassScheduleMap = JSON.parse(JSON.stringify(state.schedule || {}));
  for (const c of classes) {
    if (!tempSchedule[c.id]) {
      tempSchedule[c.id] = {};
    }
    for (let d = 0; d < numDays; d++) {
      if (!tempSchedule[c.id][d]) {
        tempSchedule[c.id][d] = Array(numPeriods).fill(null);
      }
    }
  }

  const targetsFilter = assignments.filter((assign) => {
    if (options.targetClassIds && options.targetClassIds.includes(assign.classId)) return true;
    if (options.targetTeacherIds && assign.teacherId) {
      const ids = parseTeacherIds(assign.teacherId);
      if (ids.some(id => options.targetTeacherIds!.includes(id))) return true;
    }
    return false;
  });

  if (targetsFilter.length === 0) {
    return {
      success: true,
      schedule: tempSchedule,
      message: "Planlanacak ders bulunamadı."
    };
  }

  const scheduledHoursCount: { [assignId: string]: number } = {};
  for (const cId of Object.keys(tempSchedule)) {
    for (let d = 0; d < numDays; d++) {
      const daySlots = tempSchedule[cId][d];
      if (daySlots) {
        for (let p = 0; p < numPeriods; p++) {
          const slot = daySlots[p];
          if (slot) {
            scheduledHoursCount[slot.assignmentId] = (scheduledHoursCount[slot.assignmentId] || 0) + 1;
          }
        }
      }
    }
  }

  const coursesMap = new Map<string, Course>(state.courses.map((co) => [co.id, co]));

  const blocksToPlace: BlockToPlace[] = [];
  targetsFilter.forEach((assign) => {
    const placedCount = scheduledHoursCount[assign.id] || 0;
    let remainingHours = assign.weeklyHours - placedCount;
    if (remainingHours < 0) remainingHours = 0;
    let blockCounter = 0;

    let parts: number[] = [];
    if (assign.customPlacementMode) {
      parts = assign.customPlacementMode.split("+").map((p: string) => parseInt(p.trim(), 10)).filter((p: number) => !isNaN(p) && p > 0);
    } else {
      const course = coursesMap.get(assign.courseId);
      if (course && course.placementMode) {
        parts = course.placementMode.split("+").map((p: string) => parseInt(p.trim(), 10)).filter((p: number) => !isNaN(p) && p > 0);
      }
    }

    if (parts.length > 0) {
      let tempRemaining = remainingHours;
      for (const partSize of parts) {
        if (tempRemaining <= 0) break;
        const size = Math.min(partSize, tempRemaining);
        blocksToPlace.push({
          assignment: assign,
          size: size,
          id: `${assign.id}-b${blockCounter++}`
        });
        tempRemaining -= size;
      }
      const prefBlock = assign.preferredBlockSize || 2;
      while (tempRemaining > 0) {
        const size = Math.min(prefBlock, tempRemaining);
        blocksToPlace.push({
          assignment: assign,
          size: size,
          id: `${assign.id}-b${blockCounter++}`
        });
        tempRemaining -= size;
      }
    } else {
      const prefBlock = assign.preferredBlockSize || 2;
      while (remainingHours > 0) {
        const size = Math.min(prefBlock, remainingHours);
        blocksToPlace.push({
          assignment: assign,
          size: size,
          id: `${assign.id}-b${blockCounter++}`
        });
        remainingHours -= size;
      }
    }
  });

  let placedCount = 0;
  for (const block of blocksToPlace) {
    let placed = false;
    for (let d = 0; d < numDays && !placed; d++) {
      for (let p = 0; p <= numPeriods - block.size && !placed; p++) {
        if (isPlacementValidEx(state, tempSchedule, block.assignment, d, p, block.size)) {
          for (let offset = 0; offset < block.size; offset++) {
            tempSchedule[block.assignment.classId][d][p + offset] = {
              assignmentId: block.assignment.id,
              courseId: block.assignment.courseId,
              teacherId: block.assignment.teacherId,
              classroomId: block.assignment.classroomId
            };
          }
          placed = true;
          placedCount++;
        }
      }
    }
    if (!placed && block.size > 1) {
      let remainingSize = block.size;
      for (let d = 0; d < numDays && remainingSize > 0; d++) {
        for (let p = 0; p < numPeriods && remainingSize > 0; p++) {
          if (isPlacementValidEx(state, tempSchedule, block.assignment, d, p, 1)) {
            tempSchedule[block.assignment.classId][d][p] = {
              assignmentId: block.assignment.id,
              courseId: block.assignment.courseId,
              teacherId: block.assignment.teacherId,
              classroomId: block.assignment.classroomId
            };
            remainingSize--;
          }
        }
      }
      if (remainingSize === 0) placedCount++;
    }
  }

  const success = placedCount === blocksToPlace.length;
  return {
    success,
    schedule: tempSchedule,
    message: success
      ? "Kısmi planlama başarıyla tamamlandı!"
      : `Hassas kurallar nedeniyle bazı dersler planlanamadı (${placedCount}/${blocksToPlace.length} ders bloğu yerleştirildi).`
  };
}
