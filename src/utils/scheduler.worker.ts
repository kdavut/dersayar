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
  assignments: LessonAssignment[]
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
          })();

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
self.onmessage = async (e: MessageEvent) => {
  const { state, options } = e.data;
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

  const getBlockPriority = (b: BlockToPlace) => {
    if (options?.priorityAssignmentIds && options.priorityAssignmentIds.includes(b.assignment.id)) {
      return 0;
    }
    const isMultiTeacher = b.assignment.teacherId && b.assignment.teacherId.split(",").length > 1;
    if (isMultiTeacher) return 1;
    
    const classObj = classesMap.get(b.assignment.classId);
    let isRestricted = false;
    if (classObj) {
      const hasUnavailDay = classObj.unavailability && Object.values(classObj.unavailability).some((day: boolean[]) => day && day.every((p: boolean) => p === true));
      const hasDailyPeriodsRestriction = classObj.dailyPeriods && Object.values(classObj.dailyPeriods).some((pCount: number) => pCount !== undefined && pCount < numPeriods);
      const isGrade12 = classObj.name && (classObj.name.includes("12") || classObj.name.toLowerCase().includes("mezun"));
      isRestricted = !!(hasUnavailDay || hasDailyPeriodsRestriction || isGrade12);
    }
    
    if (isRestricted) return 2;
    return 3;
  };

  const getBlockTeacherHours = (b: BlockToPlace) => {
    if (!b.assignment.teacherId) return 0;
    const tIds = b.assignment.teacherId.split(",").map(id => id.trim()).filter(Boolean);
    if (tIds.length === 0) return 0;
    return Math.max(...tIds.map(id => teacherTotalHours[id] || 0));
  };

  const getBlockTeacherConstraints = (b: BlockToPlace) => {
    if (!b.assignment.teacherId) return 0;
    const tIds = b.assignment.teacherId.split(",").map(id => id.trim()).filter(Boolean);
    if (tIds.length === 0) return 0;
    return Math.max(...tIds.map(id => teacherConstraints[id] || 0));
  };

  // MULTI-START (3 trials with different seeds)
  const numStarts = 3;
  let bestGlobalSchedule = cloneSchedule(baseSchedule);
  let bestGlobalUnplaced: BlockToPlace[] = [...blocksToPlace];
  let bestGlobalPenalty = Infinity;

  for (let trialIdx = 0; trialIdx < numStarts; trialIdx++) {
    // Report progress
    self.postMessage({
      type: "progress",
      progress: {
        phase: "backtracking",
        percent: Math.round((trialIdx / numStarts) * 100),
        message: `Çözücü Başlatılıyor... Çalıştırma ${trialIdx + 1}/${numStarts}`,
        steps: trialIdx
      }
    });

    const currentSchedule = cloneSchedule(baseSchedule);
    const unplacedList: BlockToPlace[] = [];

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

    // Sort blocks according to priority rules with stable structure + small multi-trial tie breaking perturbation
    const blocksToProcess = [...blocksToPlace].sort((a, b) => {
      const priA = getBlockPriority(a);
      const priB = getBlockPriority(b);
      if (priA !== priB) {
        return priA - priB; // 1 then 2 then 3
      }
      
      const noise = (Math.random() - 0.5) * 0.1;

      if (priA === 1) {
        // Multi-teacher: en yoğun olandan başla (most hours first)
        const hoursA = getBlockTeacherHours(a);
        const hoursB = getBlockTeacherHours(b);
        if (Math.abs(hoursB - hoursA) > 0.1) {
          return hoursB - hoursA;
        }
        return noise;
      }
      
      if (priA === 2) {
        // Restricted classes: en yoğun dersi olan öğretmenden başla
        const hoursA = getBlockTeacherHours(a);
        const hoursB = getBlockTeacherHours(b);
        if (Math.abs(hoursB - hoursA) > 0.1) {
          return hoursB - hoursA;
        }
        return noise;
      }
      
      // Tier 3: en çok kısıtı olan öğretmenden başlayarak
      const constA = getBlockTeacherConstraints(a);
      const constB = getBlockTeacherConstraints(b);
      if (Math.abs(constB - constA) > 0.1) {
        return constB - constA;
      }
      
      const hoursA = getBlockTeacherHours(a);
      const hoursB = getBlockTeacherHours(b);
      if (Math.abs(hoursB - hoursA) > 0.1) {
        return hoursB - hoursA;
      }
      
      return noise;
    });

    // 1. GREEDY PASS (Placement constructor)
    for (let bIdx = 0; bIdx < blocksToProcess.length; bIdx++) {
      const block = blocksToProcess[bIdx];
      let placed = false;
      const classId = block.assignment.classId;

      // Try placing block in a suitable empty slot
      for (let d = 0; d < numDays; d++) {
        for (let p = 0; p <= numPeriods - block.size; p++) {
          if (isPlacementValidEx(state, teachersMap, classesMap, classroomsMap, currentSchedule, currentTeacherOccupancy, currentClassroomOccupancy, block.assignment, d, p, block.size)) {
            // Place it in schedule and register in occupancy grids
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
            }
            placed = true;
            break;
          }
        }
        if (placed) break;
      }

      // If greedy constructor failed, try Backtracking Swap
      if (!placed) {
        placed = tryBacktrackingSwap(
          state,
          teachersMap,
          classesMap,
          classroomsMap,
          coursesMap,
          currentSchedule,
          currentTeacherOccupancy,
          currentClassroomOccupancy,
          block,
          numDays,
          numPeriods,
          assignments
        );
      }

      if (!placed) {
        unplacedList.push(block);
      }
    }

    // 2. SIMULATED ANNEALING PASS (To optimize days off, gaps, and any remaining unplaced blocks)
    let currentPenalty = calculateScheduleScore(currentSchedule, state, teachersMap, classesMap, classroomsMap, coursesMap);
    let currentCost = currentPenalty + unplacedList.reduce((sum, b) => sum + b.size, 0) * 1000;

    let bestTrialSchedule = cloneSchedule(currentSchedule);
    let bestTrialUnplaced = [...unplacedList];
    let bestTrialTeacherOccupancy = cloneOccupancy(currentTeacherOccupancy, numDays);
    let bestTrialClassroomOccupancy = cloneOccupancy(currentClassroomOccupancy, numDays);
    let bestTrialCost = currentCost;

    let temp = 100.0;
    const coolingRate = 0.997;
    const maxIterations = 5000; // Increased to 5,000 since O(1) validations are incredibly fast!

    for (let iter = 0; iter < maxIterations; iter++) {
      // Periodic status report
      if (iter % 300 === 0) {
        self.postMessage({
          type: "progress",
          progress: {
            phase: "optimizing",
            percent: Math.round(((trialIdx + (iter / maxIterations)) / numStarts) * 100),
            message: `Çalıştırma ${trialIdx + 1}/${numStarts} - İyileştirme yapılıyor (SA iterasyonu ${iter}/${maxIterations})...`,
            steps: iter,
            currentScore: currentPenalty,
            unplacedCount: unplacedList.length
          }
        });
      }

      const moveType = Math.random();
      
      if (moveType < 0.60 && classes.length > 0) {
        // Swap slots mutation (Intra-class)
        const randClass = classes[Math.floor(Math.random() * classes.length)];
        const d1 = Math.floor(Math.random() * numDays);
        const p1 = Math.floor(Math.random() * numPeriods);
        const d2 = Math.floor(Math.random() * numDays);
        const p2 = Math.floor(Math.random() * numPeriods);

        if (d1 !== d2 || p1 !== p2) {
          const slot1 = currentSchedule[randClass.id]?.[d1]?.[p1] || null;
          const slot2 = currentSchedule[randClass.id]?.[d2]?.[p2] || null;

          const isLocked1 = slot1 && (slot1.isLocked === true || (() => {
            const course = coursesMap.get(slot1.courseId);
            if (!course) return false;
            return (course.name || "").toLowerCase().includes("şef") || (course.name || "").toLowerCase().includes("koor");
          })());

          const isLocked2 = slot2 && (slot2.isLocked === true || (() => {
            const course = coursesMap.get(slot2.courseId);
            if (!course) return false;
            return (course.name || "").toLowerCase().includes("şef") || (course.name || "").toLowerCase().includes("koor");
          })());

          if (!isLocked1 && !isLocked2) {
            // Unregister old occupancies
            if (slot1) clearOccupancy(randClass.id, d1, p1, slot1, currentTeacherOccupancy, currentClassroomOccupancy);
            if (slot2) clearOccupancy(randClass.id, d2, p2, slot2, currentTeacherOccupancy, currentClassroomOccupancy);

            // Apply Mutation In-Place
            if (currentSchedule[randClass.id]?.[d1]) currentSchedule[randClass.id][d1][p1] = slot2;
            if (currentSchedule[randClass.id]?.[d2]) currentSchedule[randClass.id][d2][p2] = slot1;

            // Check if hard constraints are respected
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
              // Register new occupancies
              if (slot1) registerOccupancy(randClass.id, d2, p2, slot1, currentTeacherOccupancy, currentClassroomOccupancy);
              if (slot2) registerOccupancy(randClass.id, d1, p1, slot2, currentTeacherOccupancy, currentClassroomOccupancy);

              // Valid move! Evaluate soft score delta
              const newPenalty = calculateScheduleScore(currentSchedule, state, teachersMap, classesMap, classroomsMap, coursesMap);
              const newCost = newPenalty + unplacedList.reduce((sum, b) => sum + b.size, 0) * 1000;
              const delta = newCost - currentCost;

              if (delta <= 0 || Math.random() < Math.exp(-delta / temp)) {
                // Accept Mutation
                currentPenalty = newPenalty;
                currentCost = newCost;

                if (currentCost < bestTrialCost) {
                  bestTrialSchedule = cloneSchedule(currentSchedule);
                  bestTrialUnplaced = [...unplacedList];
                  bestTrialTeacherOccupancy = cloneOccupancy(currentTeacherOccupancy, numDays);
                  bestTrialClassroomOccupancy = cloneOccupancy(currentClassroomOccupancy, numDays);
                  bestTrialCost = currentCost;
                }
              } else {
                // Reject Mutation (Undo / Rollback In-Place)
                // Unregister swapped occupancies
                if (slot1) clearOccupancy(randClass.id, d2, p2, slot1, currentTeacherOccupancy, currentClassroomOccupancy);
                if (slot2) clearOccupancy(randClass.id, d1, p1, slot2, currentTeacherOccupancy, currentClassroomOccupancy);

                // Revert schedule swap
                if (currentSchedule[randClass.id]?.[d1]) currentSchedule[randClass.id][d1][p1] = slot1;
                if (currentSchedule[randClass.id]?.[d2]) currentSchedule[randClass.id][d2][p2] = slot2;

                // Restore old occupancies
                if (slot1) registerOccupancy(randClass.id, d1, p1, slot1, currentTeacherOccupancy, currentClassroomOccupancy);
                if (slot2) registerOccupancy(randClass.id, d2, p2, slot2, currentTeacherOccupancy, currentClassroomOccupancy);
              }
            } else {
              // Invalid move (violates hard constraints) - Rollback In-Place
              if (currentSchedule[randClass.id]?.[d1]) currentSchedule[randClass.id][d1][p1] = slot1;
              if (currentSchedule[randClass.id]?.[d2]) currentSchedule[randClass.id][d2][p2] = slot2;

              if (slot1) registerOccupancy(randClass.id, d1, p1, slot1, currentTeacherOccupancy, currentClassroomOccupancy);
              if (slot2) registerOccupancy(randClass.id, d2, p2, slot2, currentTeacherOccupancy, currentClassroomOccupancy);
            }
          }
        }
      } else if (unplacedList.length > 0) {
        // Try placing an unplaced block mutation
        const prevTotalSize = unplacedList.reduce((sum, b) => sum + b.size, 0);
        const randUnplacedIdx = Math.floor(Math.random() * unplacedList.length);
        const block = unplacedList[randUnplacedIdx];
        const classId = block.assignment.classId;
        const d = Math.floor(Math.random() * numDays);
        const p = Math.floor(Math.random() * (numPeriods - block.size + 1));

        // Ensure target slot isn't locked
        let hasLockedCell = false;
        const classObj = classesMap.get(classId);
        for (let offset = 0; offset < block.size; offset++) {
          const currentSlot = currentSchedule[classId]?.[d]?.[p + offset];
          if (classObj?.unavailability[d]?.[p + offset] === true || currentSlot?.isLocked === true) {
            hasLockedCell = true;
            break;
          }
        }

        if (!hasLockedCell) {
          // Store old slots and unregister occupancies
          const oldSlots: (ScheduleSlot | null)[] = [];
          for (let offset = 0; offset < block.size; offset++) {
            const os = currentSchedule[classId][d][p + offset];
            oldSlots.push(os);
            if (os) {
              clearOccupancy(classId, d, p + offset, os, currentTeacherOccupancy, currentClassroomOccupancy);
            }
            currentSchedule[classId][d][p + offset] = null;
          }

          if (isPlacementValidEx(state, teachersMap, classesMap, classroomsMap, currentSchedule, currentTeacherOccupancy, currentClassroomOccupancy, block.assignment, d, p, block.size, classId)) {
            // Apply placement
            const newPlacedSlots: ScheduleSlot[] = [];
            for (let offset = 0; offset < block.size; offset++) {
              const newSlot = {
                assignmentId: block.assignment.id,
                courseId: block.assignment.courseId,
                teacherId: block.assignment.teacherId,
                classroomId: block.assignment.classroomId
              };
              currentSchedule[classId][d][p + offset] = newSlot;
              registerOccupancy(classId, d, p + offset, newSlot, currentTeacherOccupancy, currentClassroomOccupancy);
              newPlacedSlots.push(newSlot);
            }

            // Remove from unplaced and add any ejected lessons to unplaced list
            unplacedList.splice(randUnplacedIdx, 1);
            const ejectedList: BlockToPlace[] = [];
            oldSlots.forEach(slot => {
              if (slot) {
                const assignObj = assignments.find(a => a.id === slot.assignmentId);
                if (assignObj) {
                  ejectedList.push({
                    assignment: assignObj,
                    size: 1,
                    id: `${assignObj.id}-ej-${Date.now()}-${Math.random()}`
                  });
                }
              }
            });
            unplacedList.push(...ejectedList);

            const nextTotalSize = unplacedList.reduce((sum, b) => sum + b.size, 0);
            const doesNotIncreaseUnplaced = nextTotalSize <= prevTotalSize;

            const newPenalty = calculateScheduleScore(currentSchedule, state, teachersMap, classesMap, classroomsMap, coursesMap);
            const newCost = newPenalty + nextTotalSize * 1000;
            const delta = newCost - currentCost;

            if (doesNotIncreaseUnplaced && (delta <= 0 || Math.random() < Math.exp(-delta / temp))) {
              // Accept placement mutation
              currentPenalty = newPenalty;
              currentCost = newCost;

              if (currentCost < bestTrialCost) {
                bestTrialSchedule = cloneSchedule(currentSchedule);
                bestTrialUnplaced = [...unplacedList];
                bestTrialTeacherOccupancy = cloneOccupancy(currentTeacherOccupancy, numDays);
                bestTrialClassroomOccupancy = cloneOccupancy(currentClassroomOccupancy, numDays);
                bestTrialCost = currentCost;
              }
            } else {
              // Reject (Undo placement mutation)
              // Unregister new placed slots
              for (let offset = 0; offset < block.size; offset++) {
                clearOccupancy(classId, d, p + offset, newPlacedSlots[offset], currentTeacherOccupancy, currentClassroomOccupancy);
              }
              // Restore old slots and register occupancies
              for (let offset = 0; offset < block.size; offset++) {
                currentSchedule[classId][d][p + offset] = oldSlots[offset];
                const os = oldSlots[offset];
                if (os) {
                  registerOccupancy(classId, d, p + offset, os, currentTeacherOccupancy, currentClassroomOccupancy);
                }
              }
              // Restore unplaced list
              ejectedList.forEach(() => unplacedList.pop());
              unplacedList.splice(randUnplacedIdx, 0, block);
            }
          } else {
            // Invalid - Rollback immediately
            for (let offset = 0; offset < block.size; offset++) {
              currentSchedule[classId][d][p + offset] = oldSlots[offset];
              const os = oldSlots[offset];
              if (os) {
                registerOccupancy(classId, d, p + offset, os, currentTeacherOccupancy, currentClassroomOccupancy);
              }
            }
          }
        }
      }

      temp *= coolingRate;
    }

    // Evaluate this trial's best solution compared to other trials
    const trialUnplacedHours = bestTrialUnplaced.reduce((sum, b) => sum + b.size, 0);
    const bestGlobalUnplacedHours = bestGlobalUnplaced.reduce((sum, b) => sum + b.size, 0);

    // Primary goal: Minimize unplaced hours. Secondary: Minimize soft penalty gaps.
    if (trialUnplacedHours < bestGlobalUnplacedHours || (trialUnplacedHours === bestGlobalUnplacedHours && bestTrialCost < bestGlobalPenalty)) {
      bestGlobalSchedule = bestTrialSchedule;
      bestGlobalUnplaced = bestTrialUnplaced;
      bestGlobalPenalty = bestTrialCost;
    }
  }

  const finalUnplacedHours = bestGlobalUnplaced.reduce((sum, b) => sum + b.size, 0);
  self.postMessage({
    type: "result",
    result: {
      success: finalUnplacedHours === 0,
      schedule: bestGlobalSchedule,
      unplacedCount: bestGlobalUnplaced.length,
      message: finalUnplacedHours === 0
        ? "Tüm haftalık ders programı başarıyla yerleştirildi ve optimize edildi!"
        : `Ders programı yerleştirildi ancak ${finalUnplacedHours} ders saati yerleştirilemedi. Lütfen kısıtları gevşetmeyi deneyin.`,
      unplacedDetails: bestGlobalUnplaced.map(b => `${classesMap.get(b.assignment.classId)?.name || b.assignment.classId} sınıfının ${b.size} saatlik dersi yerleştirilemedi.`)
    }
  });
};
