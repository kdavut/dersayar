/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AppState,
  ClassScheduleMap,
  LessonAssignment,
  ScheduleSlot,
  Teacher,
  GradeClass,
  Classroom,
  Course
} from "../types";

export interface BlockToPlace {
  assignment: LessonAssignment;
  size: number;
  id: string;
}

export interface ProgressUpdate {
  phase: "backtracking" | "optimizing" | "completed" | "failed";
  percent: number;
  message: string;
  steps: number;
  currentScore?: number;
  unplacedCount?: number;
}

/**
 * Checks placement validity inside the worker with O(1) occupancy lookups.
 */
function isPlacementValidEx(
  state: {
    settings: AppState["settings"];
    teachers: Teacher[];
    classes: GradeClass[];
    classrooms: Classroom[];
    assignments: LessonAssignment[];
    courses: Course[];
  },
  teachersMap: Map<string, Teacher>,
  classesMap: Map<string, GradeClass>,
  classroomsMap: Map<string, Classroom>,
  tempSchedule: ClassScheduleMap,
  teacherOccupancy: Record<string, (string | null)[][]>,
  classroomOccupancy: Record<string, (string | null)[][]>,
  assignment: LessonAssignment,
  dayIndex: number,
  startPeriod: number,
  blockSize: number,
  classIdToIgnoreTeacherCheck?: string
): boolean {
  const { settings } = state;
  const numPeriods = settings.periodsPerDay;

  if (startPeriod + blockSize > numPeriods) return false;

  const classItem = classesMap.get(assignment.classId);

  // Strict different days constraint check
  if (settings.groupLessonsMode === 'different_days_strict') {
    const classDaySched = tempSchedule[assignment.classId]?.[dayIndex];
    if (classDaySched) {
      for (let p = 0; p < numPeriods; p++) {
        const slot = classDaySched[p];
        if (slot !== null && slot.courseId === assignment.courseId && slot.assignmentId !== assignment.id) {
          return false;
        }
      }
    }
  }

  for (let offset = 0; offset < blockSize; offset++) {
    const p = startPeriod + offset;

    // Class daily period limits
    if (classItem && classItem.dailyPeriods) {
      const maxPeriodsThisDay = classItem.dailyPeriods[dayIndex];
      if (maxPeriodsThisDay !== undefined && p >= maxPeriodsThisDay) return false;
    }

    // Class unavailability
    if (classItem?.unavailability[dayIndex]?.[p]) return false;

    // Teacher unavailability and O(1) collision check
    if (assignment.teacherId) {
      const teacherIds = assignment.teacherId.split(",");
      for (let i = 0; i < teacherIds.length; i++) {
        const tId = teacherIds[i];
        
        // 1. Unavailability Check
        const teacher = teachersMap.get(tId);
        if (teacher?.unavailability[dayIndex]?.[p]) return false;

        // 2. Teacher Occupancy Check (O(1))
        const occupiedByClassId = teacherOccupancy[tId]?.[dayIndex]?.[p];
        if (occupiedByClassId && occupiedByClassId !== assignment.classId && occupiedByClassId !== classIdToIgnoreTeacherCheck) {
          return false;
        }

        // 3. Direct Teacher Occupancy Scan (Guarantees zero double-booking)
        for (const cId of Object.keys(tempSchedule)) {
          if (cId === assignment.classId || (classIdToIgnoreTeacherCheck && cId === classIdToIgnoreTeacherCheck)) {
            continue;
          }
          const classSched = tempSchedule[cId];
          if (!classSched) continue;
          const slot = classSched[dayIndex]?.[p];
          if (slot && slot.teacherId) {
            const existingTeacherIds = slot.teacherId.split(",");
            if (existingTeacherIds.includes(tId)) {
              return false;
            }
          }
        }
      }
    }

    // Classroom unavailability and O(1) collision check
    if (assignment.classroomId) {
      const classroom = classroomsMap.get(assignment.classroomId);
      
      // 1. Unavailability Check
      if (classroom?.unavailability[dayIndex]?.[p]) return false;

      // 2. Classroom Occupancy Check (O(1))
      const occupiedByClassId = classroomOccupancy[assignment.classroomId]?.[dayIndex]?.[p];
      if (occupiedByClassId && occupiedByClassId !== assignment.classId && occupiedByClassId !== classIdToIgnoreTeacherCheck) {
        return false;
      }
    }

    // Direct Class overlap check (if not ignoring self-class during swaps)
    if (classIdToIgnoreTeacherCheck === undefined) {
      if (tempSchedule[assignment.classId]?.[dayIndex]?.[p] !== null) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Calculates soft constraints penalties with Map lookups for performance.
 */
function calculateScheduleScore(
  schedule: ClassScheduleMap,
  state: {
    settings: AppState["settings"];
    teachers: Teacher[];
    classes: GradeClass[];
    classrooms: Classroom[];
    assignments: LessonAssignment[];
    courses: Course[];
  },
  teachersMap: Map<string, Teacher>,
  classesMap: Map<string, GradeClass>,
  classroomsMap: Map<string, Classroom>,
  coursesMap: Map<string, Course>
): number {
  const { settings, teachers, classes } = state;
  const numDays = settings.days.length;
  const numPeriods = settings.periodsPerDay;

  let teacherGapsPenalty = 0;
  let classGapsPenalty = 0;
  let distributionPenalty = 0;
  let balancePenalty = 0;

  const teacherDayPeriods: Record<string, Set<number>[]> = {};
  const classCourseDayPeriods: Record<string, Record<string, Record<number, number[]>>> = {};

  const teacherDailyHours: Record<string, number[]> = {};
  const classDailyHours: Record<string, number[]> = {};

  for (let i = 0; i < teachers.length; i++) {
    const tId = teachers[i].id;
    teacherDailyHours[tId] = Array(numDays).fill(0);
    const daySets: Set<number>[] = [];
    for (let d = 0; d < numDays; d++) {
      daySets.push(new Set<number>());
    }
    teacherDayPeriods[tId] = daySets;
  }

  for (let i = 0; i < classes.length; i++) {
    const cId = classes[i].id;
    classDailyHours[cId] = Array(numDays).fill(0);
    classCourseDayPeriods[cId] = {};
  }

  const classIds = Object.keys(schedule);
  for (let cIdx = 0; cIdx < classIds.length; cIdx++) {
    const classId = classIds[cIdx];
    const classSched = schedule[classId];
    if (!classSched) continue;

    for (let d = 0; d < numDays; d++) {
      const daySlots = classSched[d];
      if (!daySlots) continue;

      for (let p = 0; p < numPeriods; p++) {
        const slot = daySlots[p];
        if (!slot) continue;

        if (classDailyHours[classId]) {
          classDailyHours[classId][d]++;
        }

        if (!classCourseDayPeriods[classId][slot.courseId]) {
          classCourseDayPeriods[classId][slot.courseId] = {};
        }
        if (!classCourseDayPeriods[classId][slot.courseId][d]) {
          classCourseDayPeriods[classId][slot.courseId][d] = [];
        }
        classCourseDayPeriods[classId][slot.courseId][d].push(p);

        if (slot.teacherId) {
          const tIds = slot.teacherId.split(",");
          for (let i = 0; i < tIds.length; i++) {
            const tId = tIds[i];
            if (teacherDayPeriods[tId]) {
              teacherDayPeriods[tId][d].add(p);
              teacherDailyHours[tId][d]++;
            }
          }
        }
      }
    }
  }

  // Teacher gaps calculations
  for (let i = 0; i < teachers.length; i++) {
    const tId = teachers[i].id;
    const daySets = teacherDayPeriods[tId];
    for (let d = 0; d < numDays; d++) {
      const periods = daySets[d];
      if (periods.size >= 2) {
        let minP = Infinity;
        let maxP = -Infinity;
        periods.forEach(p => {
          if (p < minP) minP = p;
          if (p > maxP) maxP = p;
        });
        let gaps = 0;
        for (let p = minP; p <= maxP; p++) {
          if (!periods.has(p)) gaps++;
        }
        teacherGapsPenalty += gaps * 15;
      }
    }
  }

  // Class gaps calculations
  for (let i = 0; i < classes.length; i++) {
    const cId = classes[i].id;
    const classSched = schedule[cId];
    if (!classSched) continue;

    for (let d = 0; d < numDays; d++) {
      const daySlots = classSched[d];
      if (!daySlots) continue;

      let minP = Infinity;
      let maxP = -Infinity;
      let hasLessons = false;
      for (let p = 0; p < numPeriods; p++) {
        if (daySlots[p]) {
          if (p < minP) minP = p;
          if (p > maxP) maxP = p;
          hasLessons = true;
        }
      }

      if (hasLessons && minP < maxP) {
        let gaps = 0;
        for (let p = minP; p <= maxP; p++) {
          if (!daySlots[p]) gaps++;
        }
        classGapsPenalty += gaps * 10;
      }
    }
  }

  // Distribution & spread penalty calculations
  const schedClassIds = Object.keys(classCourseDayPeriods);
  for (let i = 0; i < schedClassIds.length; i++) {
    const classId = schedClassIds[i];
    const courseMap = classCourseDayPeriods[classId];
    const courseIds = Object.keys(courseMap);
    for (let j = 0; j < courseIds.length; j++) {
      const courseId = courseIds[j];
      const dayMap = courseMap[courseId];
      
      let daysWithCourse = 0;
      let totalLessons = 0;

      const dayKeys = Object.keys(dayMap);
      for (let k = 0; k < dayKeys.length; k++) {
        const d = parseInt(dayKeys[k], 10);
        const periods = dayMap[d].sort((a, b) => a - b);
        daysWithCourse++;
        totalLessons += periods.length;

        if (periods.length >= 2) {
          for (let idx = 0; idx < periods.length - 1; idx++) {
            if (periods[idx + 1] - periods[idx] > 1) {
              distributionPenalty += 25;
            }
          }
          if (periods.length > 2) {
            distributionPenalty += (periods.length - 2) * 20;
          }
        }
      }

      const mode = settings.groupLessonsMode || "different_days_flexible";
      if (mode === "same_day") {
        if (daysWithCourse > 1 && totalLessons > 1) {
          distributionPenalty += (daysWithCourse - 1) * 30;
        }
      } else {
        if (daysWithCourse === 1 && totalLessons >= 3) {
          distributionPenalty += 40;
        }
      }
    }
  }

  const calculateBalanceScore = (hours: number[]) => {
    const activeDays = hours.filter(h => h > 0);
    if (activeDays.length <= 1) return 0;
    const mean = activeDays.reduce((a, b) => a + b, 0) / activeDays.length;
    let sumOfDiffs = 0;
    for (let idx = 0; idx < activeDays.length; idx++) {
      sumOfDiffs += Math.abs(activeDays[idx] - mean);
    }
    return sumOfDiffs * 12;
  };

  for (let i = 0; i < teachers.length; i++) {
    balancePenalty += calculateBalanceScore(teacherDailyHours[teachers[i].id]);
  }

  for (let i = 0; i < classes.length; i++) {
    balancePenalty += calculateBalanceScore(classDailyHours[classes[i].id]);
  }

  return teacherGapsPenalty + classGapsPenalty + distributionPenalty + balancePenalty;
}

/**
 * Fast deep cloning helper for schedules. Avoids expensive JSON conversions.
 */
function cloneSchedule(src: ClassScheduleMap): ClassScheduleMap {
  const dst: ClassScheduleMap = {};
  const classIds = Object.keys(src);
  for (let i = 0; i < classIds.length; i++) {
    const cId = classIds[i];
    const srcClass = src[cId];
    const dstClass: Record<number, (ScheduleSlot | null)[]> = {};
    const days = Object.keys(srcClass);
    for (let j = 0; j < days.length; j++) {
      const d = parseInt(days[j], 10);
      const daySlots = srcClass[d];
      if (daySlots) {
        dstClass[d] = [...daySlots]; // shallow copy of slots array
      }
    }
    dst[cId] = dstClass;
  }
  return dst;
}

/**
 * Fast deep cloning helper for occupancy records.
 */
function cloneOccupancy(src: Record<string, (string | null)[][]>, numDays: number): Record<string, (string | null)[][]> {
  const dst: Record<string, (string | null)[][]> = {};
  const keys = Object.keys(src);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const grid = src[key];
    const newGrid: (string | null)[][] = [];
    for (let d = 0; d < numDays; d++) {
      newGrid.push([...grid[d]]);
    }
    dst[key] = newGrid;
  }
  return dst;
}

/**
 * Register occupancy records for rapid O(1) validation.
 */
function registerOccupancy(
  classId: string,
  d: number,
  p: number,
  slot: ScheduleSlot,
  teacherOccupancy: Record<string, (string | null)[][]>,
  classroomOccupancy: Record<string, (string | null)[][]>
) {
  if (slot.teacherId) {
    const tIds = slot.teacherId.split(",");
    for (let i = 0; i < tIds.length; i++) {
      const tId = tIds[i];
      if (!teacherOccupancy[tId]) {
        teacherOccupancy[tId] = [];
        for (let j = 0; j < 7; j++) teacherOccupancy[tId].push(Array(16).fill(null));
      }
      teacherOccupancy[tId][d][p] = classId;
    }
  }
  if (slot.classroomId) {
    if (!classroomOccupancy[slot.classroomId]) {
      classroomOccupancy[slot.classroomId] = [];
      for (let j = 0; j < 7; j++) classroomOccupancy[slot.classroomId].push(Array(16).fill(null));
    }
    classroomOccupancy[slot.classroomId][d][p] = classId;
  }
}

/**
 * Unregister occupancy records.
 */
function clearOccupancy(
  classId: string,
  d: number,
  p: number,
  slot: ScheduleSlot,
  teacherOccupancy: Record<string, (string | null)[][]>,
  classroomOccupancy: Record<string, (string | null)[][]>
) {
  if (slot.teacherId) {
    const tIds = slot.teacherId.split(",");
    for (let i = 0; i < tIds.length; i++) {
      const tId = tIds[i];
      if (teacherOccupancy[tId]?.[d]?.[p] === classId) {
        teacherOccupancy[tId][d][p] = null;
      }
    }
  }
  if (slot.classroomId) {
    if (classroomOccupancy[slot.classroomId]?.[d]?.[p] === classId) {
      classroomOccupancy[slot.classroomId][d][p] = null;
    }
  }
}

/**
 * Highly optimized Backtracking swap mechanism using constant-time occupancy maps.
 */
function tryBacktrackingSwap(
  state: {
    settings: AppState["settings"];
    teachers: Teacher[];
    classes: GradeClass[];
    classrooms: Classroom[];
    assignments: LessonAssignment[];
    courses: Course[];
  },
  teachersMap: Map<string, Teacher>,
  classesMap: Map<string, GradeClass>,
  classroomsMap: Map<string, Classroom>,
  coursesMap: Map<string, Course>,
  schedule: ClassScheduleMap,
  teacherOccupancy: Record<string, (string | null)[][]>,
  classroomOccupancy: Record<string, (string | null)[][]>,
  block: BlockToPlace,
  numDays: number,
  numPeriods: number,
  assignments: LessonAssignment[],
  priorityAssignmentIds?: string[]
): boolean {
  const classId = block.assignment.classId;
  const classObj = classesMap.get(classId);
  if (!classObj) return false;

  const candidates: { d: number; p: number; ejected: { slot: ScheduleSlot; periodOffset: number }[] }[] = [];

  for (let d = 0; d < numDays; d++) {
    for (let p = 0; p <= numPeriods - block.size; p++) {
      let canPlaceHere = true;
      const ejectedSlots: { slot: ScheduleSlot; periodOffset: number }[] = [];

      for (let offset = 0; offset < block.size; offset++) {
        const period = p + offset;
        if (classObj.unavailability[d]?.[period] === true) {
          canPlaceHere = false;
          break;
        }
        if (classObj.dailyPeriods && classObj.dailyPeriods[d] !== undefined && period >= classObj.dailyPeriods[d]) {
          canPlaceHere = false;
          break;
        }

        const slot = schedule[classId]?.[d]?.[period];
        if (slot) {
          const isLocked = slot.isLocked === true || (() => {
            const course = coursesMap.get(slot.courseId);
            if (!course) return false;
            const nameLower = (course.name || "").toLowerCase();
            const codeLower = (course.code || "").toLowerCase();
            return nameLower.includes("şef") || nameLower.includes("sef") || nameLower.includes("koor") || nameLower.includes("koordinatör") || codeLower.includes("şef") || codeLower.includes("sef") || codeLower.includes("koor");
          })() || !!(priorityAssignmentIds && priorityAssignmentIds.includes(slot.assignmentId));

          if (isLocked) {
            canPlaceHere = false;
            break;
          }
          ejectedSlots.push({ slot, periodOffset: offset });
        }
      }

      if (canPlaceHere) {
        candidates.push({ d, p, ejected: ejectedSlots });
      }
    }
  }

  // Sort candidates so we prefer "fewer ejected slots" (strictly prioritize empty spaces)
  candidates.sort((a, b) => a.ejected.length - b.ejected.length);

  for (const cand of candidates) {
    const { d, p, ejected: ejectedSlots } = cand;

    // Temporarily clear ejected cells from both schedule and occupancy grids
    ejectedSlots.forEach(e => {
      const period = p + e.periodOffset;
      schedule[classId][d][period] = null;
      clearOccupancy(classId, d, period, e.slot, teacherOccupancy, classroomOccupancy);
    });

    if (isPlacementValidEx(state, teachersMap, classesMap, classroomsMap, schedule, teacherOccupancy, classroomOccupancy, block.assignment, d, p, block.size, classId)) {
      // Place the primary block
      for (let offset = 0; offset < block.size; offset++) {
        const period = p + offset;
        const newSlot = {
          assignmentId: block.assignment.id,
          courseId: block.assignment.courseId,
          teacherId: block.assignment.teacherId,
          classroomId: block.assignment.classroomId
        };
        schedule[classId][d][period] = newSlot;
        registerOccupancy(classId, d, period, newSlot, teacherOccupancy, classroomOccupancy);
      }

      // Try to place the ejected single-hour lessons elsewhere
      let allEjectedPlaced = true;
      const placedEjected: { classId: string; d: number; p: number; slot: ScheduleSlot }[] = [];

      for (const e of ejectedSlots) {
        const ejectedAssign = assignments.find(a => a.id === e.slot.assignmentId);
        if (!ejectedAssign) {
          allEjectedPlaced = false;
          break;
        }

        let foundNewPlace = false;
        for (let nd = 0; nd < numDays; nd++) {
          for (let np = 0; np < numPeriods; np++) {
            if (isPlacementValidEx(state, teachersMap, classesMap, classroomsMap, schedule, teacherOccupancy, classroomOccupancy, ejectedAssign, nd, np, 1, classId)) {
              schedule[classId][nd][np] = e.slot;
              registerOccupancy(classId, nd, np, e.slot, teacherOccupancy, classroomOccupancy);
              placedEjected.push({ classId, d: nd, p: np, slot: e.slot });
              foundNewPlace = true;
              break;
            }
          }
          if (foundNewPlace) break;
        }

        if (!foundNewPlace) {
          allEjectedPlaced = false;
          break;
        }
      }

      if (allEjectedPlaced) {
        return true; // Successfully swapped!
      }

      // Revert placing ejected
      placedEjected.forEach(pe => {
        schedule[pe.classId][pe.d][pe.p] = null;
        clearOccupancy(pe.classId, pe.d, pe.p, pe.slot, teacherOccupancy, classroomOccupancy);
      });
      
      // Revert primary block placement
      for (let offset = 0; offset < block.size; offset++) {
        const period = p + offset;
        const placedSlot = schedule[classId][d][period];
        schedule[classId][d][period] = null;
        if (placedSlot) {
          clearOccupancy(classId, d, period, placedSlot, teacherOccupancy, classroomOccupancy);
        }
      }
    }

    // Restore original ejected
    ejectedSlots.forEach(e => {
      const period = p + e.periodOffset;
      schedule[classId][d][period] = e.slot;
      registerOccupancy(classId, d, period, e.slot, teacherOccupancy, classroomOccupancy);
    });
  }

  return false;
}

// Listen to message from the main thread
let stopped = false;

function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function isSlotLocked(slot: ScheduleSlot | null, coursesMap: Map<string, Course>): boolean {
  if (!slot) return false;
  if (slot.isLocked === true) return true;
  const course = coursesMap.get(slot.courseId);
  if (!course) return false;
  const nameLower = (course.name || "").toLowerCase();
  const codeLower = (course.code || "").toLowerCase();
  return nameLower.includes("şef") || nameLower.includes("sef") || nameLower.includes("koor") || nameLower.includes("koordinatör") || codeLower.includes("şef") || codeLower.includes("sef") || codeLower.includes("koor");
}

self.onmessage = async (e: MessageEvent) => {
  const { type, state, options } = e.data;
  
  if (type === "stop") {
    stopped = true;
    return;
  }

  // Start Solver
  stopped = false;
  const { settings, teachers, classes, classrooms, assignments, courses } = state;
  const numDays = settings.days.length;
  const numPeriods = settings.periodsPerDay;
  const keepExisting = options?.keepExisting ?? false;

  // Build quick O(1) Maps for indexing and lookup
  const teachersMap = new Map<string, Teacher>(teachers.map((t: Teacher) => [t.id, t]));
  const classesMap = new Map<string, GradeClass>(classes.map((c: GradeClass) => [c.id, c]));
  const classroomsMap = new Map<string, Classroom>(classrooms.map((r: Classroom) => [r.id, r]));
  const coursesMap = new Map<string, Course>(courses.map((co: Course) => [co.id, co]));

  const baseSchedule: ClassScheduleMap = {};

  // Setup schedule layout
  for (const c of classes) {
    baseSchedule[c.id] = {};
    for (let d = 0; d < numDays; d++) {
      baseSchedule[c.id][d] = Array(numPeriods).fill(null);
    }
  }

  // Load existing schedule if requested
  if (keepExisting && state.schedule) {
    for (const cId of Object.keys(state.schedule)) {
      if (baseSchedule[cId]) {
        for (let d = 0; d < numDays; d++) {
          const daySched = state.schedule[cId][d];
          if (daySched) {
            for (let p = 0; p < numPeriods; p++) {
              baseSchedule[cId][d][p] = daySched[p] || null;
            }
          }
        }
      }
    }
  } else {
    // Greedy Pass 1: Place constants / locked cells / KOOR & SEFLIK first
    for (const c of classes) {
      const existingDay = state.schedule?.[c.id];
      if (existingDay) {
        for (let d = 0; d < numDays; d++) {
          const daySlots = existingDay[d];
          if (daySlots) {
            for (let p = 0; p < numPeriods; p++) {
              const slot = daySlots[p];
              const isKoorOrSef = slot && (() => {
                const course = coursesMap.get(slot.courseId);
                if (!course) return false;
                const nameLower = (course.name || "").toLowerCase();
                const codeLower = (course.code || "").toLowerCase();
                return nameLower.includes("şef") || nameLower.includes("sef") || nameLower.includes("koor") || nameLower.includes("koordinatör") || codeLower.includes("şef") || codeLower.includes("sef") || codeLower.includes("koor");
              })();
              const isLocked = (c.unavailability[d]?.[p] === true) || (slot?.isLocked === true) || !!isKoorOrSef;
              if (slot && isLocked) {
                baseSchedule[c.id][d][p] = slot;
              }
            }
          }
        }
      }
    }
  }

  // Determine target assignments
  let targetAssignments = [...assignments];
  if (options?.targetClassIds) {
    targetAssignments = targetAssignments.filter((a: LessonAssignment) => options.targetClassIds!.includes(a.classId));
  }
  if (options?.targetTeacherIds) {
    targetAssignments = targetAssignments.filter((a: LessonAssignment) => {
      if (!a.teacherId) return false;
      const tIds = a.teacherId.split(",");
      return tIds.some((id: string) => options.targetTeacherIds!.includes(id));
    });
  }

  // Count already scheduled hours
  const scheduledHoursCount: { [assignId: string]: number } = {};
  for (const cId of Object.keys(baseSchedule)) {
    for (let d = 0; d < numDays; d++) {
      const daySlots = baseSchedule[cId][d];
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

  // Segment unplaced hours into blocks
  const blocksToPlace: BlockToPlace[] = [];
  targetAssignments.forEach((assign: LessonAssignment) => {
    const placedCount = scheduledHoursCount[assign.id] || 0;
    let remainingHours = assign.weeklyHours - placedCount;
    if (remainingHours < 0) remainingHours = 0;
    
    let blockCounter = 0;
    
    let parts: number[] = [];
    if (assign.customPlacementMode) {
      parts = assign.customPlacementMode.split("+").map((p: string) => parseInt(p.trim(), 10)).filter((p: number) => !isNaN(p) && p > 0);
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

  if (blocksToPlace.length === 0) {
    self.postMessage({
      type: "result",
      result: {
        success: true,
        schedule: baseSchedule,
        message: "Zaten tüm dersler planlanmış durumdaydı!"
      }
    });
    return;
  }

  // Precalculate teacher metrics for sorting priority
  const teacherTotalHours: Record<string, number> = {};
  const teacherConstraints: Record<string, number> = {};

  teachers.forEach((t: Teacher) => {
    const tAss = assignments.filter((a: LessonAssignment) => a.teacherId && a.teacherId.split(",").map(id => id.trim()).includes(t.id));
    teacherTotalHours[t.id] = tAss.reduce((sum: number, a: LessonAssignment) => sum + a.weeklyHours, 0);

    let unavailCount = 0;
    if (t.unavailability) {
      Object.keys(t.unavailability).forEach((dayKey) => {
        const day = t.unavailability[Number(dayKey)];
        if (day) {
          day.forEach((p: boolean) => {
            if (p) unavailCount++;
          });
        }
      });
    }
    teacherConstraints[t.id] = unavailCount;
  });

  // Setup global trackers
  let bestGlobalSchedule = cloneSchedule(baseSchedule);
  let bestGlobalUnplaced: BlockToPlace[] = [...blocksToPlace];
  let bestGlobalPenalty = Infinity;
  let bestGlobalUnplacedHours = blocksToPlace.reduce((sum, b) => sum + b.size, 0);

  const startTime = Date.now();
  let lastRestartTime = Date.now();
  let totalIterations = 0;
  let restartCount = 0;

  // Infinite Solver & Randomized Restart Loop
  while (!stopped) {
    totalIterations++;

    const currentSchedule = cloneSchedule(baseSchedule);

    // Initialize high-performance occupancy grids for this trial
    const currentTeacherOccupancy: Record<string, (string | null)[][]> = {};
    const currentClassroomOccupancy: Record<string, (string | null)[][]> = {};

    for (const t of teachers) {
      currentTeacherOccupancy[t.id] = [];
      for (let d = 0; d < numDays; d++) {
        currentTeacherOccupancy[t.id].push(Array(numPeriods).fill(null));
      }
    }
    for (const r of classrooms) {
      currentClassroomOccupancy[r.id] = [];
      for (let d = 0; d < numDays; d++) {
        currentClassroomOccupancy[r.id].push(Array(numPeriods).fill(null));
      }
    }

    // Load initial occupancies
    for (const cId of Object.keys(currentSchedule)) {
      for (let d = 0; d < numDays; d++) {
        for (let p = 0; p < numPeriods; p++) {
          const slot = currentSchedule[cId][d][p];
          if (slot) {
            registerOccupancy(cId, d, p, slot, currentTeacherOccupancy, currentClassroomOccupancy);
          }
        }
      }
    }

    // Shuffle and apply Tiered Priority Logic Heuristic sorting
    const randomizedBlocks = shuffle([...blocksToPlace]);

    randomizedBlocks.sort((a, b) => {
      // Priority 1: Multi-teacher lessons get absolute priority
      const isMultiA = a.assignment.teacherId && a.assignment.teacherId.split(",").length > 1;
      const isMultiB = b.assignment.teacherId && b.assignment.teacherId.split(",").length > 1;
      if (isMultiA !== isMultiB) {
        return isMultiA ? -1 : 1;
      }

      // Priority 2: Sınıflar staja çıkıyorsa veya yüksek unavailability varsa
      const classA = classesMap.get(a.assignment.classId);
      const classB = classesMap.get(b.assignment.classId);
      
      const unavailDaysA = classA?.unavailability ? Object.values(classA.unavailability).filter(day => day && day.every(p => p === true)).length : 0;
      const unavailDaysB = classB?.unavailability ? Object.values(classB.unavailability).filter(day => day && day.every(p => p === true)).length : 0;
      
      if (unavailDaysA !== unavailDaysB) {
        return unavailDaysB - unavailDaysA;
      }

      // Priority 3: Teachers with high constraints
      const teacherIdsA = a.assignment.teacherId ? a.assignment.teacherId.split(",") : [];
      const teacherIdsB = b.assignment.teacherId ? b.assignment.teacherId.split(",") : [];
      
      const teacherUnavailA = teacherIdsA.reduce((sum, id) => sum + (teacherConstraints[id] || 0), 0);
      const teacherUnavailB = teacherIdsB.reduce((sum, id) => sum + (teacherConstraints[id] || 0), 0);
      
      if (teacherUnavailA !== teacherUnavailB) {
        return teacherUnavailB - teacherUnavailA;
      }

      // Priority 4: Larger block size first
      if (a.size !== b.size) {
        return b.size - a.size;
      }

      return Math.random() - 0.5;
    });

    // Deep Backtracking Depth Limit
    let maxBacktrackDepth = Math.min(10, 3 + restartCount);
    let lastYieldTime = Date.now();

    const solveStateSpace = async (
      blocks: BlockToPlace[],
      depth: number
    ): Promise<boolean> => {
      if (stopped) return false;

      // Yield periodically to allow stop signal and GUI updates
      if (Date.now() - lastYieldTime > 50) {
        await new Promise(resolve => setTimeout(resolve, 0));
        lastYieldTime = Date.now();

        const currentTotalUnplaced = blocks.reduce((sum, b) => sum + b.size, 0);
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        const totalHours = blocksToPlace.reduce((sum, b) => sum + b.size, 0);
        const placedHours = totalHours - currentTotalUnplaced;

        self.postMessage({
          type: "progress",
          progress: {
            phase: "backtracking",
            percent: Math.round(Math.min(99, (placedHours / totalHours) * 100)),
            message: `Sert kısıtlar sezgisel olarak çözülüyor... Geri izleme derinliği: ${depth}/${maxBacktrackDepth}, Yeniden başlatma: ${restartCount}`,
            steps: totalIterations,
            unplacedCount: currentTotalUnplaced,
            elapsedSeconds: elapsed,
            totalHours,
            placedHours,
            unplacedHours: currentTotalUnplaced,
            bestSchedule: bestGlobalSchedule,
            unplacedDetails: blocks.map(b => `${classesMap.get(b.assignment.classId)?.name || b.assignment.classId} sınıfının ${b.size} saatlik dersi yerleştirilemedi.`)
          }
        });
      }

      if (blocks.length === 0) {
        return true;
      }

      const block = blocks[0];
      const classId = block.assignment.classId;
      const classObj = classesMap.get(classId);
      if (!classObj) {
        return await solveStateSpace(blocks.slice(1), depth);
      }

      const candidates: { d: number; p: number; conflicts: { slot: ScheduleSlot; d: number; p: number }[] }[] = [];

      for (let d = 0; d < numDays; d++) {
        if (classObj.unavailability[d]?.every(p => p === true)) continue;

        for (let p = 0; p <= numPeriods - block.size; p++) {
          let canPlace = true;
          const conflicts: { slot: ScheduleSlot; d: number; p: number }[] = [];

          for (let offset = 0; offset < block.size; offset++) {
            const period = p + offset;

            if (classObj.unavailability[d]?.[period] === true) {
              canPlace = false;
              break;
            }

            if (classObj.dailyPeriods) {
              const maxPeriods = classObj.dailyPeriods[d];
              if (maxPeriods !== undefined && period >= maxPeriods) {
                canPlace = false;
                break;
              }
            }

            if (settings.groupLessonsMode === 'different_days_strict') {
              const classDaySched = currentSchedule[classId]?.[d];
              if (classDaySched) {
                const hasOtherSameCourse = classDaySched.some((s, sIdx) => 
                  s !== null && 
                  s.courseId === block.assignment.courseId && 
                  s.assignmentId !== block.assignment.id &&
                  (sIdx < p || sIdx >= p + block.size)
                );
                if (hasOtherSameCourse) {
                  canPlace = false;
                  break;
                }
              }
            }

            const existingSlot = currentSchedule[classId]?.[d]?.[period];
            if (existingSlot) {
              if (isSlotLocked(existingSlot, coursesMap) || (options?.priorityAssignmentIds && options.priorityAssignmentIds.includes(existingSlot.assignmentId))) {
                canPlace = false;
                break;
              }
              conflicts.push({ slot: existingSlot, d, p: period });
            }

            if (block.assignment.teacherId) {
              const tIds = block.assignment.teacherId.split(",");
              for (const tId of tIds) {
                const teacher = teachersMap.get(tId);
                if (teacher?.unavailability[d]?.[period] === true) {
                  canPlace = false;
                  break;
                }

                let occupiedByClassId = currentTeacherOccupancy[tId]?.[d]?.[period];
                if (!occupiedByClassId) {
                  // Direct scan fallback to make sure we find any other class where the teacher is teaching at this period
                  for (const cId of Object.keys(currentSchedule)) {
                    if (cId === classId) continue;
                    const slot = currentSchedule[cId]?.[d]?.[period];
                    if (slot && slot.teacherId) {
                      const otherTIds = slot.teacherId.split(",");
                      if (otherTIds.includes(tId)) {
                        occupiedByClassId = cId;
                        break;
                      }
                    }
                  }
                }

                if (occupiedByClassId && occupiedByClassId !== classId) {
                  const occupiedSlot = currentSchedule[occupiedByClassId]?.[d]?.[period];
                  if (occupiedSlot) {
                    if (isSlotLocked(occupiedSlot, coursesMap) || (options?.priorityAssignmentIds && options.priorityAssignmentIds.includes(occupiedSlot.assignmentId))) {
                      canPlace = false;
                      break;
                    }
                    if (!conflicts.some(c => c.slot.assignmentId === occupiedSlot.assignmentId)) {
                      conflicts.push({ slot: occupiedSlot, d, p: period });
                    }
                  }
                }
              }
              if (!canPlace) break;
            }

            if (block.assignment.classroomId) {
              const classroom = classroomsMap.get(block.assignment.classroomId);
              if (classroom?.unavailability[d]?.[period] === true) {
                canPlace = false;
                break;
              }

              const occupiedByClassId = currentClassroomOccupancy[block.assignment.classroomId]?.[d]?.[period];
              if (occupiedByClassId && occupiedByClassId !== classId) {
                const occupiedSlot = currentSchedule[occupiedByClassId]?.[d]?.[period];
                if (occupiedSlot) {
                  if (isSlotLocked(occupiedSlot, coursesMap) || (options?.priorityAssignmentIds && options.priorityAssignmentIds.includes(occupiedSlot.assignmentId))) {
                    canPlace = false;
                    break;
                  }
                  if (!conflicts.some(c => c.slot.assignmentId === occupiedSlot.assignmentId)) {
                    conflicts.push({ slot: occupiedSlot, d, p: period });
                  }
                }
              }
              if (!canPlace) break;
            }
          }

          if (canPlace) {
            candidates.push({ d, p, conflicts });
          }
        }
      }

      candidates.sort((a, b) => a.conflicts.length - b.conflicts.length);

      for (const cand of candidates) {
        const { d, p, conflicts } = cand;

        if (conflicts.length > 0 && depth >= maxBacktrackDepth) {
          continue;
        }

        const backupEjected: { slot: ScheduleSlot; classId: string; d: number; p: number }[] = [];
        for (const c of conflicts) {
          let conflictClassId = "";
          for (const cid of Object.keys(currentSchedule)) {
            if (currentSchedule[cid]?.[c.d]?.[c.p]?.assignmentId === c.slot.assignmentId) {
              conflictClassId = cid;
              break;
            }
          }

          if (conflictClassId) {
            const slotToEject = currentSchedule[conflictClassId][c.d][c.p];
            if (slotToEject) {
              backupEjected.push({ slot: slotToEject, classId: conflictClassId, d: c.d, p: c.p });
              currentSchedule[conflictClassId][c.d][c.p] = null;
              clearOccupancy(conflictClassId, c.d, c.p, slotToEject, currentTeacherOccupancy, currentClassroomOccupancy);
            }
          }
        }

        const placedSlots: { d: number; p: number }[] = [];
        for (let offset = 0; offset < block.size; offset++) {
          const period = p + offset;
          const slot = {
            assignmentId: block.assignment.id,
            courseId: block.assignment.courseId,
            teacherId: block.assignment.teacherId,
            classroomId: block.assignment.classroomId
          };
          currentSchedule[classId][d][period] = slot;
          registerOccupancy(classId, d, period, slot, currentTeacherOccupancy, currentClassroomOccupancy);
          placedSlots.push({ d, p: period });
        }

        const ejectedBlocksToPlace: BlockToPlace[] = [];
        const processedAssignIds = new Set<string>();

        for (const backup of backupEjected) {
          if (!processedAssignIds.has(backup.slot.assignmentId)) {
            processedAssignIds.add(backup.slot.assignmentId);
            const assignObj = assignments.find((a: any) => a.id === backup.slot.assignmentId);
            if (assignObj) {
              ejectedBlocksToPlace.push({
                assignment: assignObj,
                size: 1,
                id: `${assignObj.id}-ej-${Date.now()}-${Math.random()}`
              });
            }
          }
        }

        const success = await solveStateSpace([...ejectedBlocksToPlace, ...blocks.slice(1)], depth + (conflicts.length > 0 ? 1 : 0));
        if (success) {
          return true;
        }

        // Backtrack
        for (const ps of placedSlots) {
          const slotToRemove = currentSchedule[classId][ps.d][ps.p];
          currentSchedule[classId][ps.d][ps.p] = null;
          if (slotToRemove) {
            clearOccupancy(classId, ps.d, ps.p, slotToRemove, currentTeacherOccupancy, currentClassroomOccupancy);
          }
        }

        for (const backup of backupEjected) {
          currentSchedule[backup.classId][backup.d][backup.p] = backup.slot;
          registerOccupancy(backup.classId, backup.d, backup.p, backup.slot, currentTeacherOccupancy, currentClassroomOccupancy);
        }
      }

      return false;
    };

    const backtrackingSolved = await solveStateSpace(randomizedBlocks, 0);

    // Compute unplaced details
    const scheduledHoursInThisTrial: Record<string, number> = {};
    for (const cId of Object.keys(currentSchedule)) {
      for (let d = 0; d < numDays; d++) {
        for (let p = 0; p < numPeriods; p++) {
          const slot = currentSchedule[cId][d][p];
          if (slot) {
            scheduledHoursInThisTrial[slot.assignmentId] = (scheduledHoursInThisTrial[slot.assignmentId] || 0) + 1;
          }
        }
      }
    }

    const finalUnplacedHoursList: BlockToPlace[] = [];
    targetAssignments.forEach(assign => {
      const scheduled = scheduledHoursInThisTrial[assign.id] || 0;
      const remaining = assign.weeklyHours - scheduled;
      if (remaining > 0) {
        finalUnplacedHoursList.push({
          assignment: assign,
          size: remaining,
          id: `${assign.id}-unplaced-final`
        });
      }
    });

    const unplacedHoursThisTrial = finalUnplacedHoursList.reduce((sum, b) => sum + b.size, 0);
    let softPenaltyThisTrial = calculateScheduleScore(currentSchedule, state, teachersMap, classesMap, classroomsMap, coursesMap);

    // Evaluate trial success
    if (unplacedHoursThisTrial < bestGlobalUnplacedHours || (unplacedHoursThisTrial === bestGlobalUnplacedHours && softPenaltyThisTrial < bestGlobalPenalty)) {
      bestGlobalSchedule = cloneSchedule(currentSchedule);
      bestGlobalUnplaced = finalUnplacedHoursList;
      bestGlobalUnplacedHours = unplacedHoursThisTrial;
      bestGlobalPenalty = softPenaltyThisTrial;

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const totalHours = blocksToPlace.reduce((sum, b) => sum + b.size, 0);
      const placedHours = totalHours - unplacedHoursThisTrial;

      self.postMessage({
        type: "progress",
        progress: {
          phase: "backtracking",
          percent: Math.round(Math.min(100, (placedHours / totalHours) * 100)),
          message: unplacedHoursThisTrial === 0 
            ? "Mükemmel yerleşim başarıyla tamamlandı! İyileştiriliyor..." 
            : `Daha yüksek başarımlı yerleşim çıktı! Kalan yerleşmeyen saat: ${unplacedHoursThisTrial}`,
          steps: totalIterations,
          unplacedCount: unplacedHoursThisTrial,
          elapsedSeconds: elapsed,
          totalHours,
          placedHours,
          unplacedHours: unplacedHoursThisTrial,
          bestSchedule: bestGlobalSchedule,
          unplacedDetails: finalUnplacedHoursList.map(b => `${classesMap.get(b.assignment.classId)?.name || b.assignment.classId} sınıfının ${b.size} saatlik dersi yerleştirilemedi.`)
        }
      });
    }

    // 4. Simulated Annealing Optimization Pass
    if (unplacedHoursThisTrial === 0) {
      let temp = 100.0;
      const coolingRate = 0.998;
      const maxSAIterations = 2000;

      for (let iter = 0; iter < maxSAIterations && !stopped; iter++) {
        if (iter % 150 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          const totalHours = blocksToPlace.reduce((sum, b) => sum + b.size, 0);

          self.postMessage({
            type: "progress",
            progress: {
              phase: "optimizing",
              percent: 100,
              message: `Program Simulated Annealing ile optimize ediliyor... (SA adımı ${iter}/${maxSAIterations})`,
              steps: totalIterations * 1000 + iter,
              unplacedCount: 0,
              elapsedSeconds: elapsed,
              totalHours,
              placedHours: totalHours,
              unplacedHours: 0,
              bestSchedule: bestGlobalSchedule,
              unplacedDetails: []
            }
          });
        }

        const randClass = classes[Math.floor(Math.random() * classes.length)];
        const d1 = Math.floor(Math.random() * numDays);
        const p1 = Math.floor(Math.random() * numPeriods);
        const d2 = Math.floor(Math.random() * numDays);
        const p2 = Math.floor(Math.random() * numPeriods);

        if (d1 !== d2 || p1 !== p2) {
          const slot1 = currentSchedule[randClass.id]?.[d1]?.[p1] || null;
          const slot2 = currentSchedule[randClass.id]?.[d2]?.[p2] || null;

          const isLocked1 = slot1 && isSlotLocked(slot1, coursesMap);
          const isLocked2 = slot2 && isSlotLocked(slot2, coursesMap);

          if (!isLocked1 && !isLocked2) {
            if (slot1) clearOccupancy(randClass.id, d1, p1, slot1, currentTeacherOccupancy, currentClassroomOccupancy);
            if (slot2) clearOccupancy(randClass.id, d2, p2, slot2, currentTeacherOccupancy, currentClassroomOccupancy);

            currentSchedule[randClass.id][d1][p1] = slot2;
            currentSchedule[randClass.id][d2][p2] = slot1;

            let valid1 = true;
            if (slot1) {
              const assign1 = assignments.find(a => a.id === slot1.assignmentId);
              if (assign1) {
                valid1 = isPlacementValidEx(state, teachersMap, classesMap, classroomsMap, currentSchedule, currentTeacherOccupancy, currentClassroomOccupancy, assign1, d2, p2, 1, randClass.id);
              }
            }

            let valid2 = true;
            if (slot2) {
              const assign2 = assignments.find(a => a.id === slot2.assignmentId);
              if (assign2) {
                valid2 = isPlacementValidEx(state, teachersMap, classesMap, classroomsMap, currentSchedule, currentTeacherOccupancy, currentClassroomOccupancy, assign2, d1, p1, 1, randClass.id);
              }
            }

            if (valid1 && valid2) {
              if (slot1) registerOccupancy(randClass.id, d2, p2, slot1, currentTeacherOccupancy, currentClassroomOccupancy);
              if (slot2) registerOccupancy(randClass.id, d1, p1, slot2, currentTeacherOccupancy, currentClassroomOccupancy);

              const newPenalty = calculateScheduleScore(currentSchedule, state, teachersMap, classesMap, classroomsMap, coursesMap);
              const delta = newPenalty - softPenaltyThisTrial;

              if (delta <= 0 || Math.random() < Math.exp(-delta / temp)) {
                softPenaltyThisTrial = newPenalty;
                if (newPenalty < bestGlobalPenalty) {
                  bestGlobalPenalty = newPenalty;
                  bestGlobalSchedule = cloneSchedule(currentSchedule);
                }
              } else {
                if (slot1) clearOccupancy(randClass.id, d2, p2, slot1, currentTeacherOccupancy, currentClassroomOccupancy);
                if (slot2) clearOccupancy(randClass.id, d1, p1, slot2, currentTeacherOccupancy, currentClassroomOccupancy);

                currentSchedule[randClass.id][d1][p1] = slot1;
                currentSchedule[randClass.id][d2][p2] = slot2;

                if (slot1) registerOccupancy(randClass.id, d1, p1, slot1, currentTeacherOccupancy, currentClassroomOccupancy);
                if (slot2) registerOccupancy(randClass.id, d2, p2, slot2, currentTeacherOccupancy, currentClassroomOccupancy);
              }
            } else {
              currentSchedule[randClass.id][d1][p1] = slot1;
              currentSchedule[randClass.id][d2][p2] = slot2;

              if (slot1) registerOccupancy(randClass.id, d1, p1, slot1, currentTeacherOccupancy, currentClassroomOccupancy);
              if (slot2) registerOccupancy(randClass.id, d2, p2, slot2, currentTeacherOccupancy, currentClassroomOccupancy);
            }
          }
        }

        temp *= coolingRate;
      }
    }

    // Randomized Restart trigger logic (60 seconds)
    if (Date.now() - lastRestartTime > 60000) {
      restartCount++;
      lastRestartTime = Date.now();
    }

    // If options specify we only run 1 standard trial and backtracking solved it, let's allow it to complete
    if (bestGlobalUnplacedHours === 0 && !options?.exhaustiveMode && restartCount > 0) {
      break;
    }
  }

  // Final worker return
  self.postMessage({
    type: "result",
    result: {
      success: bestGlobalUnplacedHours === 0,
      schedule: bestGlobalSchedule,
      unplacedCount: bestGlobalUnplacedHours,
      message: bestGlobalUnplacedHours === 0
        ? "Tüm haftalık ders programı başarıyla yerleştirildi ve optimize edildi!"
        : `Ders programı yerleştirildi ancak ${bestGlobalUnplacedHours} ders saati yerleştirilemedi.`,
      unplacedDetails: bestGlobalUnplaced.map(b => `${classesMap.get(b.assignment.classId)?.name || b.assignment.classId} sınıfının ${b.size} saatlik dersi yerleştirilemedi.`)
    }
  });
};

