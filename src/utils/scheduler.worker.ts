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
  isEjected?: boolean;
}

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
  targetTeacherName?: string;
  targetClassName?: string;
}

let lockedAssignmentIds = new Set<string>();

function parseTeacherIds(teacherIdStr: string | null | undefined): string[] {
  if (!teacherIdStr) return [];
  return teacherIdStr
    .split(/[\s,;]+/)
    .map(id => id.trim())
    .filter(Boolean);
}

function isChefOrCoordinatorCourse(courseName: string, courseCode: string): boolean {
  const nameLower = (courseName || "").toLowerCase().trim();
  const codeLower = (courseCode || "").toLowerCase().trim();

  // Whitelist exception: if name or code includes felsefe, fel, fls, etc., it is definitely NOT a chef or coordinator course
  if (
    nameLower.includes("felsefe") || 
    nameLower.includes("fel") || 
    nameLower.includes("fls") ||
    codeLower.includes("fel") || 
    codeLower.includes("fls") || 
    codeLower.includes("felsefe")
  ) {
    return false;
  }

  // Regular expression to check for precise word match of şef, sef, koor, koordinatör, koordinatörlük, şeflik, şefliği
  const pattern = /(?:^|[^a-zıüşöçğ])(şef|sef|koor|koordinatör|koordinatörlük|şefliği|şeflik)(?:$|[^a-zıüşöçğ])/i;
  
  return pattern.test(nameLower) || pattern.test(codeLower);
}

function isGeneralCultureCourse(courseName: string, courseCode: string): boolean {
  const nameLower = (courseName || "").toLowerCase().trim();
  const codeLower = (courseCode || "").toLowerCase().trim();

  // If it's chef or coordinator duty, it's NOT a general culture course (it's teacher duty/coordination)
  if (isChefOrCoordinatorCourse(courseName, courseCode)) {
    return false;
  }

  const keywords = [
    "matematik", "geometri", "fizik", "kimya", "biyoloji", "tarih", "coğrafya", "edebiyat", 
    "türk dili", "ingilizce", "almanca", "yabancı dil", "din kültürü", "felsefe", "müzik", 
    "resim", "görsel sanatlar", "beden eğitimi", "sağlık bilgisi", "rehberlik", "fel", "türkçe",
    "coğ", "tar", "mat", "fiz", "kim", "biyo", "ing", "alm", "dkab", "din", "görsel", "müz", "bed"
  ];

  return keywords.some(kw => nameLower.includes(kw) || codeLower.includes(kw));
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

  const isSlotLockedInPlacement = (slot: ScheduleSlot): boolean => {
    if (slot.isLocked === true) return true;
    if (lockedAssignmentIds.has(slot.assignmentId)) return true;
    const assignmentObj = state.assignments.find(a => a.id === slot.assignmentId);
    if (assignmentObj && (assignmentObj as any).isLocked === true) return true;
    const course = state.courses.find(c => c.id === slot.courseId);
    if (course && isChefOrCoordinatorCourse(course.name, course.code)) return true;
    return false;
  };

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
      const teacherIds = parseTeacherIds(assignment.teacherId);
      for (let i = 0; i < teacherIds.length; i++) {
        const tId = teacherIds[i];
        
        // 1. Unavailability Check
        const teacher = teachersMap.get(tId);
        if (teacher?.unavailability[dayIndex]?.[p]) return false;

        // 2. Teacher Occupancy Check (O(1))
        const occupiedByClassId = teacherOccupancy[tId]?.[dayIndex]?.[p];
        if (occupiedByClassId !== null && occupiedByClassId !== undefined && occupiedByClassId !== assignment.classId) {
          if (occupiedByClassId !== classIdToIgnoreTeacherCheck) {
            return false;
          } else {
            const ignoredSlot = tempSchedule[classIdToIgnoreTeacherCheck]?.[dayIndex]?.[p];
            if (ignoredSlot && isSlotLockedInPlacement(ignoredSlot)) {
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
      if (occupiedByClassId && occupiedByClassId !== assignment.classId) {
        if (occupiedByClassId !== classIdToIgnoreTeacherCheck) {
          return false;
        } else {
          const ignoredSlot = tempSchedule[classIdToIgnoreTeacherCheck]?.[dayIndex]?.[p];
          if (ignoredSlot && isSlotLockedInPlacement(ignoredSlot)) {
            return false;
          }
        }
      }
    }

    // Direct Class overlap check (if not ignoring self-class during swaps)
    if (classIdToIgnoreTeacherCheck === undefined) {
      if (tempSchedule[assignment.classId]?.[dayIndex]?.[p] !== null) {
        return false;
      }
    } else {
      const existingSlot = tempSchedule[assignment.classId]?.[dayIndex]?.[p];
      if (existingSlot && isSlotLockedInPlacement(existingSlot)) {
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
          const tIds = parseTeacherIds(slot.teacherId);
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
        // Öğretmen boşlukları (gaps) 'Yumuşak Kısıt' yerine 'Öncelikli Kısıt' olarak işaretlendi. Ceza katsayısı 1000'e çıkarıldı.
        teacherGapsPenalty += gaps * 1000;
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
    const tIds = parseTeacherIds(slot.teacherId);
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
    const tIds = parseTeacherIds(slot.teacherId);
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
          const isLocked = slot.isLocked === true || 
            lockedAssignmentIds.has(slot.assignmentId) || 
            (assignments.find(a => a.id === slot.assignmentId) as any)?.isLocked === true ||
            (() => {
              const course = coursesMap.get(slot.courseId);
              if (!course) return false;
              return isChefOrCoordinatorCourse(course.name, course.code);
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
            if (schedule[classId]?.[nd]?.[np] !== null) continue; // Must be empty
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

function isSlotLocked(slot: ScheduleSlot | null, coursesMap: Map<string, Course>, priorityAssignmentIds?: string[]): boolean {
  if (!slot) return false;
  if (slot.isLocked === true) return true;
  if (lockedAssignmentIds.has(slot.assignmentId)) return true;
  if (priorityAssignmentIds && priorityAssignmentIds.includes(slot.assignmentId)) return true;
  const course = coursesMap.get(slot.courseId);
  if (!course) return false;
  return isChefOrCoordinatorCourse(course.name, course.code);
}

function validateSchedule(
  schedule: ClassScheduleMap,
  numDays: number,
  numPeriods: number
): { success: boolean; message: string } {
  const teacherOccupancy: Record<string, Record<string, boolean>> = {};
  const classroomOccupancy: Record<string, Record<string, boolean>> = {};

  for (const cId of Object.keys(schedule)) {
    for (let d = 0; d < numDays; d++) {
      const daySlots = schedule[cId][d];
      if (!daySlots) continue;
      for (let p = 0; p < numPeriods; p++) {
        const slot = daySlots[p];
        if (slot) {
          // Check Teacher Overlap
          if (slot.teacherId) {
            const tIds = parseTeacherIds(slot.teacherId);
            for (const tId of tIds) {
              const key = `${tId}-${d}-${p}`;
              if (teacherOccupancy[tId]?.[key]) {
                return { 
                  success: false, 
                  message: `Öğretmen Çakışması: Öğretmen ID ${tId}, Gün ${d}, Ders ${p + 1}` 
                };
              }
              if (!teacherOccupancy[tId]) teacherOccupancy[tId] = {};
              teacherOccupancy[tId][key] = true;
            }
          }

          // Check Classroom Overlap
          if (slot.classroomId) {
            const key = `${slot.classroomId}-${d}-${p}`;
            if (classroomOccupancy[slot.classroomId]?.[key]) {
              return { 
                success: false, 
                message: `Atölye/Laboratuvar Çakışması: Atölye ID ${slot.classroomId}, Gün ${d}, Ders ${p + 1}` 
              };
            }
            if (!classroomOccupancy[slot.classroomId]) classroomOccupancy[slot.classroomId] = {};
            classroomOccupancy[slot.classroomId][key] = true;
          }
        }
      }
    }
  }

  return { success: true, message: "Aşama Doğrulaması: Başarılı. Sıfır çakışma." };
}

function getBlockTier(b: BlockToPlace, coursesMap: Map<string, Course>): number {
  if (b.assignment.classroomId !== null) {
    return 3; // Tier 3: Laboratuvar/Atölye (En son aşama)
  }
  const course = coursesMap.get(b.assignment.courseId);
  if (course && isGeneralCultureCourse(course.name, course.code)) {
    return 2; // Tier 2: Genel Kültür
  }
  return 1; // Tier 1: Öğretmenlerin Sabit/Meslek Programı (İlk aşama)
}

function getScheduledAssignmentIds(schedule: ClassScheduleMap, numDays: number, numPeriods: number): Set<string> {
  const ids = new Set<string>();
  for (const cId of Object.keys(schedule)) {
    for (let d = 0; d < numDays; d++) {
      const daySlots = schedule[cId][d];
      if (!daySlots) continue;
      for (let p = 0; p < numPeriods; p++) {
        const slot = daySlots[p];
        if (slot) {
          ids.add(slot.assignmentId);
        }
      }
    }
  }
  return ids;
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

  // Initialize and populate lockedAssignmentIds from both assignments and schedule slots
  lockedAssignmentIds = new Set<string>();
  assignments.forEach((a: any) => {
    if (a.isLocked === true) {
      lockedAssignmentIds.add(a.id);
    }
  });
  if (state.schedule) {
    for (const cId of Object.keys(state.schedule)) {
      const classSched = state.schedule[cId];
      if (classSched) {
        for (let d = 0; d < numDays; d++) {
          const daySlots = classSched[d];
          if (daySlots) {
            for (let p = 0; p < numPeriods; p++) {
              const slot = daySlots[p];
              if (slot && slot.isLocked === true) {
                lockedAssignmentIds.add(slot.assignmentId);
              }
            }
          }
        }
      }
    }
  }

  // Build quick O(1) Maps for indexing and lookup
  const teachersMap = new Map<string, Teacher>(teachers.map((t: Teacher) => [t.id, t]));
  const classesMap = new Map<string, GradeClass>(classes.map((c: GradeClass) => [c.id, c]));
  const classroomsMap = new Map<string, Classroom>(classrooms.map((r: Classroom) => [r.id, r]));
  const coursesMap = new Map<string, Course>(courses.map((co: Course) => [co.id, co]));
  const assignmentsMap = new Map<string, LessonAssignment>(assignments.map((a: LessonAssignment) => [a.id, a]));

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
                return isChefOrCoordinatorCourse(course.name, course.code);
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

  // PRE-PROCESSING CONFLICT STRIPPING PASS:
  // Detect and strip any conflicting slots from baseSchedule before starting the search process.
  // This guarantees that pre-existing conflicts are resolved by the algorithm during planning.
  const initialTeacherOccupancy: Record<string, (string | null)[][]> = {};
  const initialClassroomOccupancy: Record<string, (string | null)[][]> = {};

  for (const t of teachers) {
    initialTeacherOccupancy[t.id] = [];
    for (let d = 0; d < numDays; d++) {
      initialTeacherOccupancy[t.id].push(Array(numPeriods).fill(null));
    }
  }
  for (const r of classrooms) {
    initialClassroomOccupancy[r.id] = [];
    for (let d = 0; d < numDays; d++) {
      initialClassroomOccupancy[r.id].push(Array(numPeriods).fill(null));
    }
  }

  const tryRelocateSlot = (cid: string, s: ScheduleSlot): boolean => {
    for (let nd = 0; nd < numDays; nd++) {
      for (let np = 0; np < numPeriods; np++) {
        if (baseSchedule[cid][nd][np] !== null) continue;

        // Check class unavailability
        const classObj = classesMap.get(cid);
        if (classObj?.unavailability[nd]?.[np] === true) continue;
        if (classObj?.dailyPeriods && classObj.dailyPeriods[nd] !== undefined && np >= classObj.dailyPeriods[nd]) continue;

        // Check classroom unavailability and occupancy in baseSchedule
        if (s.classroomId) {
          const classroom = classroomsMap.get(s.classroomId);
          if (classroom?.unavailability[nd]?.[np] === true) continue;
          
          let classroomOccupied = false;
          for (const otherCId of Object.keys(baseSchedule)) {
            const otherSlot = baseSchedule[otherCId][nd][np];
            if (otherSlot && otherSlot.classroomId === s.classroomId) {
              classroomOccupied = true;
              break;
            }
          }
          if (classroomOccupied) continue;
        }

        // Check teacher unavailability and occupancy in baseSchedule
        if (s.teacherId) {
          const tIds = parseTeacherIds(s.teacherId);
          let teacherOccupied = false;
          for (const tId of tIds) {
            const teacher = teachersMap.get(tId);
            if (teacher?.unavailability[nd]?.[np] === true) {
              teacherOccupied = true;
              break;
            }
            
            for (const otherCId of Object.keys(baseSchedule)) {
              const otherSlot = baseSchedule[otherCId][nd][np];
              if (otherSlot && otherSlot.teacherId) {
                const otherTIds = parseTeacherIds(otherSlot.teacherId);
                if (otherTIds.includes(tId)) {
                  teacherOccupied = true;
                  break;
                }
              }
            }
            if (teacherOccupied) break;
          }
          if (teacherOccupied) continue;
        }

        // If all checks pass, we can place it here!
        baseSchedule[cid][nd][np] = s;
        return true;
      }
    }
    return false;
  };

  for (const cId of Object.keys(baseSchedule)) {
    for (let d = 0; d < numDays; d++) {
      for (let p = 0; p < numPeriods; p++) {
        const slot = baseSchedule[cId][d][p];
        if (!slot) continue;

        // 1. Check Class unavailability
        const classObj = classesMap.get(cId);
        if (classObj?.unavailability[d]?.[p] === true) {
          baseSchedule[cId][d][p] = null;
          if (!tryRelocateSlot(cId, slot)) {
            // Remains null, will be scheduled by backtracking solver
          }
          continue;
        }

        // 2. Check Classroom unavailability
        if (slot.classroomId) {
          const classroom = classroomsMap.get(slot.classroomId);
          if (classroom?.unavailability[d]?.[p] === true) {
            baseSchedule[cId][d][p] = null;
            if (!tryRelocateSlot(cId, slot)) {
              // Remains null
            }
            continue;
          }
        }

        // 3. Check Teacher unavailability
        if (slot.teacherId) {
          const tIds = parseTeacherIds(slot.teacherId);
          let hasTeacherUnavail = false;
          for (const tId of tIds) {
            const teacher = teachersMap.get(tId);
            if (teacher?.unavailability[d]?.[p] === true) {
              hasTeacherUnavail = true;
              break;
            }
          }
          if (hasTeacherUnavail) {
            baseSchedule[cId][d][p] = null;
            if (!tryRelocateSlot(cId, slot)) {
              // Remains null
            }
            continue;
          }
        }

        // 4. Check Teacher Occupancy for conflicts
        if (slot.teacherId) {
          const tIds = parseTeacherIds(slot.teacherId);
          let hasConflict = false;
          let otherCIdToRelocate = "";
          let otherSlotToRelocate: ScheduleSlot | null = null;
          
          for (const tId of tIds) {
            for (const otherCId of Object.keys(baseSchedule)) {
              if (otherCId === cId) continue;
              const otherSlot = baseSchedule[otherCId][d][p];
              if (otherSlot && otherSlot.teacherId) {
                const otherTIds = parseTeacherIds(otherSlot.teacherId);
                if (otherTIds.includes(tId)) {
                  hasConflict = true;
                  otherCIdToRelocate = otherCId;
                  otherSlotToRelocate = otherSlot;
                  break;
                }
              }
            }
            if (hasConflict) break;
          }
          
          if (hasConflict) {
            baseSchedule[cId][d][p] = null;
            if (otherCIdToRelocate) {
              baseSchedule[otherCIdToRelocate][d][p] = null;
            }
            
            tryRelocateSlot(cId, slot);
            if (otherCIdToRelocate && otherSlotToRelocate) {
              tryRelocateSlot(otherCIdToRelocate, otherSlotToRelocate);
            }
            continue;
          }
        }

        // 5. Check Classroom Occupancy for conflicts
        if (slot.classroomId) {
          let hasConflict = false;
          let otherCIdToRelocate = "";
          let otherSlotToRelocate: ScheduleSlot | null = null;
          
          for (const otherCId of Object.keys(baseSchedule)) {
            if (otherCId === cId) continue;
            const otherSlot = baseSchedule[otherCId][d][p];
            if (otherSlot && otherSlot.classroomId === slot.classroomId) {
              hasConflict = true;
              otherCIdToRelocate = otherCId;
              otherSlotToRelocate = otherSlot;
              break;
            }
          }
          
          if (hasConflict) {
            baseSchedule[cId][d][p] = null;
            if (otherCIdToRelocate) {
              baseSchedule[otherCIdToRelocate][d][p] = null;
            }
            
            tryRelocateSlot(cId, slot);
            if (otherCIdToRelocate && otherSlotToRelocate) {
              tryRelocateSlot(otherCIdToRelocate, otherSlotToRelocate);
            }
            continue;
          }
        }
      }
    }
  }

  // Populate final non-conflicting occupancies
  for (const cId of Object.keys(baseSchedule)) {
    for (let d = 0; d < numDays; d++) {
      for (let p = 0; p < numPeriods; p++) {
        const slot = baseSchedule[cId][d][p];
        if (slot) {
          registerOccupancy(cId, d, p, slot, initialTeacherOccupancy, initialClassroomOccupancy);
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
      const tIds = parseTeacherIds(a.teacherId);
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
    const tAss = assignments.filter((a: LessonAssignment) => a.teacherId && parseTeacherIds(a.teacherId).includes(t.id));
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

  // Precalculate class available slots count for MCV ("en az boş saati olan")
  const classAvailableSlotsCount: Record<string, number> = {};
  classes.forEach((c: GradeClass) => {
    let count = 0;
    for (let d = 0; d < numDays; d++) {
      const maxP = c.dailyPeriods?.[d] ?? numPeriods;
      for (let p = 0; p < maxP; p++) {
        if (c.unavailability[d]?.[p] !== true) {
          count++;
        }
      }
    }
    classAvailableSlotsCount[c.id] = count;
  });

  // Setup global trackers
  let bestGlobalSchedule = cloneSchedule(baseSchedule);
  let bestGlobalUnplaced: BlockToPlace[] = [...blocksToPlace];
  let bestGlobalPenalty = Infinity;
  let bestGlobalUnplacedHours = blocksToPlace.reduce((sum, b) => sum + b.size, 0);

  const startTime = Date.now();
  let lastRestartTime = Date.now();
  let totalIterations = 0;
  let lastImprovementIteration = 0;
  let consecutiveLnsRepairsWithoutImprovement = 0;
  let restartCount = 0;

  // Infinite Solver & Randomized Restart Loop
  while (!stopped) {
    totalIterations++;

    let currentSchedule = cloneSchedule(baseSchedule);

    // Initialize high-performance occupancy grids for this trial
    let currentTeacherOccupancy: Record<string, (string | null)[][]> = {};
    let currentClassroomOccupancy: Record<string, (string | null)[][]> = {};

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

    // Shuffle and apply Tiered Priority Logic Heuristic sorting with MCV (Most Constrained Variable)
    const randomizedBlocks = shuffle([...blocksToPlace]);

    randomizedBlocks.sort((a, b) => {
      // Priority 0: priorityAssignmentIds (for Forced Placement / "Bu Dersi Zorla") get absolute first priority
      if (options?.priorityAssignmentIds && options.priorityAssignmentIds.length > 0) {
        const isPriA = options.priorityAssignmentIds.includes(a.assignment.id);
        const isPriB = options.priorityAssignmentIds.includes(b.assignment.id);
        if (isPriA !== isPriB) {
          return isPriA ? -1 : 1;
        }
      }

      // Priority 1: Multi-teacher lessons get absolute priority
      const isMultiA = a.assignment.teacherId && parseTeacherIds(a.assignment.teacherId).length > 1;
      const isMultiB = b.assignment.teacherId && parseTeacherIds(b.assignment.teacherId).length > 1;
      if (isMultiA !== isMultiB) {
        return isMultiA ? -1 : 1;
      }

      // Priority 2: En az boş saati olan sınıf (MCV)
      const availSlotsA = classAvailableSlotsCount[a.assignment.classId] ?? 999;
      const availSlotsB = classAvailableSlotsCount[b.assignment.classId] ?? 999;
      if (availSlotsA !== availSlotsB) {
        return availSlotsA - availSlotsB; // Less available slots = more constrained = place first
      }

      // Priority 3: En kısıtlı öğretmene sahip ders (MCV)
      const teacherIdsA = parseTeacherIds(a.assignment.teacherId);
      const teacherIdsB = parseTeacherIds(b.assignment.teacherId);
      const teacherUnavailA = teacherIdsA.reduce((sum, id) => sum + (teacherConstraints[id] || 0), 0);
      const teacherUnavailB = teacherIdsB.reduce((sum, id) => sum + (teacherConstraints[id] || 0), 0);
      if (teacherUnavailA !== teacherUnavailB) {
        return teacherUnavailB - teacherUnavailA; // More unavailable hours = more constrained = place first
      }

      // Priority 4: Larger block size first
      if (a.size !== b.size) {
        return b.size - a.size;
      }

      // Priority 5: Random tie-breaker
      return Math.random() - 0.5;
    });

    // Deep Backtracking Depth Limit - use maxDepth if specified, else scale depth gradually with restartCount
    let maxBacktrackDepth = options?.maxDepth !== undefined
      ? options.maxDepth
      : Math.min(15, 4 + Math.floor(restartCount / 8));
    if (options?.maxDepth === undefined && totalIterations - lastImprovementIteration >= 500) {
      maxBacktrackDepth += 5;
    }
    let lastYieldTime = Date.now();

    // Search step limits to prevent thrashing in bad subtrees
    let currentTrialSteps = 0;
    const maxTrialSteps = 1500 + (restartCount % 20) * 250; // Cycles step limit: quick trials mixed with deeper search blocks
    const tabuList = new Map<string, number>(); // Key: `${tId}-${d}-${period}-${classId}`, Value: step number when it expires

    const solveStateSpace = async (
      blocks: BlockToPlace[],
      depth: number
    ): Promise<boolean> => {
      if (stopped) return false;

      currentTrialSteps++;
      if (currentTrialSteps > maxTrialSteps) {
        return false; // Force immediate trial abort to trigger rapid restart
      }

      // Keep track of the best global schedule seen so far (Best-State Persistence & Prevention of Data Loss)
      const currentTotalUnplaced = blocks.reduce((sum, b) => sum + b.size, 0);
      const hasPendingEjected = blocks.some(b => b.isEjected === true);
      if (!hasPendingEjected && currentTotalUnplaced < bestGlobalUnplacedHours) {
        bestGlobalUnplacedHours = currentTotalUnplaced;
        lastImprovementIteration = totalIterations;
        consecutiveLnsRepairsWithoutImprovement = 0;
        bestGlobalSchedule = cloneSchedule(currentSchedule);
        bestGlobalUnplaced = blocks.map((b, bIdx) => ({
          assignment: b.assignment,
          size: b.size,
          id: `${b.assignment.id}-unplaced-bt-${bIdx}`
        }));
      }

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
              const tIds = parseTeacherIds(block.assignment.teacherId);
              
              // Tabu list check: is this teacher-period-class combination tabu?
              let isTabu = false;
              for (const tId of tIds) {
                const expireStep = tabuList.get(`${tId}-${d}-${period}-${classId}`);
                if (expireStep !== undefined && currentTrialSteps < expireStep) {
                  isTabu = true;
                  break;
                }
              }
              if (isTabu) {
                canPlace = false;
                break;
              }

              for (const tId of tIds) {
                const teacher = teachersMap.get(tId);
                if (teacher?.unavailability[d]?.[period] === true) {
                   canPlace = false;
                   break;
                }

                const occupiedByClassId = currentTeacherOccupancy[tId]?.[d]?.[period];
                if (occupiedByClassId !== null && occupiedByClassId !== undefined && occupiedByClassId !== classId) {
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
            if (block.assignment.classroomId !== null && conflicts.length > 0) {
              // Yerinden Çıkarma Yasağı: Atölye dersleri yerleştirilirken çakışan dersler kesinlikle çıkarılmamalı
            } else {
              candidates.push({ d, p, conflicts });
            }
          }
        }
      }

      // Calculate constraints of current block for Empty Slot Priority and constrained-based ejection
      const currentClassAvail = classAvailableSlotsCount[block.assignment.classId] ?? 999;
      const currentTeacherIds = parseTeacherIds(block.assignment.teacherId);
      const currentTeacherUnavail = currentTeacherIds.reduce((sum, id) => sum + (teacherConstraints[id] || 0), 0);

      const candidatesWithScores = candidates.map(cand => {
        if (cand.conflicts.length === 0) {
          return { ...cand, score: 0 };
        }

        // Check if current block is more constrained than ANY of the conflicted assignments
        let isCurrentMoreConstrained = false;
        for (const conflict of cand.conflicts) {
          const ejectedAssign = assignmentsMap.get(conflict.slot.assignmentId);
          if (ejectedAssign) {
            const ejectedClassAvail = classAvailableSlotsCount[ejectedAssign.classId] ?? 999;
            const ejectedTeacherIds = parseTeacherIds(ejectedAssign.teacherId);
            const ejectedTeacherUnavail = ejectedTeacherIds.reduce((sum, id) => sum + (teacherConstraints[id] || 0), 0);

            if (currentClassAvail < ejectedClassAvail || currentTeacherUnavail > ejectedTeacherUnavail) {
              isCurrentMoreConstrained = true;
              break;
            }
          }
        }

        // Check if we are ejecting any locked or priority assignments to add severe penalty
        let hasLockedOrPriorityConflict = false;
        for (const conflict of cand.conflicts) {
          if (isSlotLocked(conflict.slot, coursesMap, options?.priorityAssignmentIds)) {
            hasLockedOrPriorityConflict = true;
            break;
          }
        }

        // High penalty if we eject without being strictly more constrained.
        // Base ejection penalty is 1000 so that empty slots (score 0) are always prioritized.
        let score = isCurrentMoreConstrained
          ? 1000 + cand.conflicts.length * 10
          : 100000 + cand.conflicts.length * 100;

        if (hasLockedOrPriorityConflict) {
          score *= 10; // Apply significantly higher (10x) penalty for ejecting locked/priority slots
        }

        return { ...cand, score };
      });

      candidatesWithScores.sort((a, b) => a.score - b.score);

      for (const cand of candidatesWithScores) {
        const { d, p, conflicts } = cand;

        if (conflicts.length > 0 && depth >= maxBacktrackDepth) {
          continue;
        }

        let failedEject = false;
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
              const isLocked = isSlotLocked(slotToEject, coursesMap, options?.priorityAssignmentIds);
              if (isLocked) {
                failedEject = true;
                break;
              }
              backupEjected.push({ slot: slotToEject, classId: conflictClassId, d: c.d, p: c.p });
              currentSchedule[conflictClassId][c.d][c.p] = null;
              clearOccupancy(conflictClassId, c.d, c.p, slotToEject, currentTeacherOccupancy, currentClassroomOccupancy);
            }
          }
        }

        if (failedEject) {
          // Revert any partially ejected slots
          for (const backup of backupEjected) {
            currentSchedule[backup.classId][backup.d][backup.p] = backup.slot;
            registerOccupancy(backup.classId, backup.d, backup.p, backup.slot, currentTeacherOccupancy, currentClassroomOccupancy);
          }
          continue; // Skip to next candidate!
        }

        // Final verification using the absolute source-of-truth validator
        const isCurrentlyValid = isPlacementValidEx(
          state,
          teachersMap,
          classesMap,
          classroomsMap,
          currentSchedule,
          currentTeacherOccupancy,
          currentClassroomOccupancy,
          block.assignment,
          d,
          p,
          block.size
        );

        if (!isCurrentlyValid) {
          // Revert ejected conflicts and move to next candidate
          for (const backup of backupEjected) {
            currentSchedule[backup.classId][backup.d][backup.p] = backup.slot;
            registerOccupancy(backup.classId, backup.d, backup.p, backup.slot, currentTeacherOccupancy, currentClassroomOccupancy);
          }
          continue;
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
        const ejectedCounts = new Map<string, number>();
        for (const backup of backupEjected) {
          const aid = backup.slot.assignmentId;
          ejectedCounts.set(aid, (ejectedCounts.get(aid) || 0) + 1);
        }

        for (const [assignmentId, size] of ejectedCounts.entries()) {
          const assignObj = assignments.find((a: any) => a.id === assignmentId);
          if (assignObj) {
            ejectedBlocksToPlace.push({
              assignment: assignObj,
              size: size,
              id: `${assignObj.id}-ej-${Date.now()}-${Math.random()}`,
              isEjected: true
            });
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
            
            // Mark as tabu for 10 iterations
            if (block.assignment.teacherId) {
              const tIds = parseTeacherIds(block.assignment.teacherId);
              for (const tId of tIds) {
                tabuList.set(`${tId}-${ps.d}-${ps.p}-${classId}`, currentTrialSteps + 10);
              }
            }
          }
        }

        for (const backup of backupEjected) {
          currentSchedule[backup.classId][backup.d][backup.p] = backup.slot;
          registerOccupancy(backup.classId, backup.d, backup.p, backup.slot, currentTeacherOccupancy, currentClassroomOccupancy);
        }
      }
    
      if (block.assignment.classroomId !== null) {
        // Pas Geçme (Skip): Atölye dersi tamamen boş ve uygun yer bulamazsa, unplaced kalmalı ve backtrack etmemeli
        return await solveStateSpace(blocks.slice(1), depth);
      }

      return false;
    };

    const runLnsRepair = async (): Promise<boolean> => {
      // 1. Collect all placed slots in bestGlobalSchedule
      const placedSlotsList: { classId: string; d: number; p: number; slot: ScheduleSlot }[] = [];
      for (const cId of Object.keys(bestGlobalSchedule)) {
        for (let d = 0; d < numDays; d++) {
          for (let p = 0; p < numPeriods; p++) {
            const slot = bestGlobalSchedule[cId]?.[d]?.[p];
            if (slot) {
              placedSlotsList.push({ classId: cId, d, p, slot });
            }
          }
        }
      }

      if (placedSlotsList.length === 0) return false;

      // 2. Select 10% of them randomly to clear
      const numToClear = Math.max(1, Math.floor(placedSlotsList.length * 0.1));
      const shuffledSlots = shuffle([...placedSlotsList]);
      const slotsToClear = shuffledSlots.slice(0, numToClear);

      // Create a copy of bestGlobalSchedule to modify
      const repairSchedule = cloneSchedule(bestGlobalSchedule);
      const repairTeacherOccupancy: Record<string, (string | null)[][]> = {};
      const repairClassroomOccupancy: Record<string, (string | null)[][]> = {};

      for (const t of teachers) {
        repairTeacherOccupancy[t.id] = [];
        for (let d = 0; d < numDays; d++) {
          repairTeacherOccupancy[t.id].push(Array(numPeriods).fill(null));
        }
      }
      for (const r of classrooms) {
        repairClassroomOccupancy[r.id] = [];
        for (let d = 0; d < numDays; d++) {
          repairClassroomOccupancy[r.id].push(Array(numPeriods).fill(null));
        }
      }

      // Re-register occupancy for all slots in repairSchedule except the cleared ones
      const clearedAssignmentHours: Record<string, number> = {};
      const clearedAssignmentsSet = new Set<string>();

      for (const cId of Object.keys(repairSchedule)) {
        for (let d = 0; d < numDays; d++) {
          for (let p = 0; p < numPeriods; p++) {
            const slot = repairSchedule[cId]?.[d]?.[p];
            if (slot) {
              const isCleared = slotsToClear.some(sc => sc.classId === cId && sc.d === d && sc.p === p);
              if (isCleared) {
                repairSchedule[cId][d][p] = null;
                clearedAssignmentHours[slot.assignmentId] = (clearedAssignmentHours[slot.assignmentId] || 0) + 1;
                clearedAssignmentsSet.add(slot.assignmentId);
              } else {
                registerOccupancy(cId, d, p, slot, repairTeacherOccupancy, repairClassroomOccupancy);
              }
            }
          }
        }
      }

      // 3. Reconstruct blocks to place for the cleared slots
      const repairBlocks: BlockToPlace[] = [];
      let repairBlockCounter = 0;

      for (const assignId of clearedAssignmentsSet) {
        const assign = assignments.find(a => a.id === assignId);
        if (assign) {
          let hours = clearedAssignmentHours[assignId];
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
            let tempRemaining = hours;
            for (const partSize of parts) {
              if (tempRemaining <= 0) break;
              const size = Math.min(partSize, tempRemaining);
              repairBlocks.push({
                assignment: assign,
                size: size,
                id: `repair-${assign.id}-b${repairBlockCounter++}`
              });
              tempRemaining -= size;
            }
            const prefBlock = assign.preferredBlockSize || 2;
            while (tempRemaining > 0) {
              const size = Math.min(prefBlock, tempRemaining);
              repairBlocks.push({
                assignment: assign,
                size: size,
                id: `repair-${assign.id}-b${repairBlockCounter++}`
              });
              tempRemaining -= size;
            }
          } else {
            const prefBlock = assign.preferredBlockSize || 2;
            while (hours > 0) {
              const size = Math.min(prefBlock, hours);
              repairBlocks.push({
                assignment: assign,
                size: size,
                id: `repair-${assign.id}-b${repairBlockCounter++}`
              });
              hours -= size;
            }
          }
        }
      }

      // Also append original unplaced blocks
      const originalUnplacedBlocks = bestGlobalUnplaced.map((b, idx) => ({
        ...b,
        id: `repair-orig-${b.assignment.id}-b${idx}`
      }));

      const allRepairBlocks = [...repairBlocks, ...originalUnplacedBlocks];

      // Sort repair blocks with MCV (Most Constrained Variable) priority
      allRepairBlocks.sort((a, b) => {
        if (options?.priorityAssignmentIds) {
          const isPriA = options.priorityAssignmentIds.includes(a.assignment.id);
          const isPriB = options.priorityAssignmentIds.includes(b.assignment.id);
          if (isPriA !== isPriB) {
            return isPriA ? -1 : 1;
          }
        }
        const isMultiA = a.assignment.teacherId && parseTeacherIds(a.assignment.teacherId).length > 1;
        const isMultiB = b.assignment.teacherId && parseTeacherIds(b.assignment.teacherId).length > 1;
        if (isMultiA !== isMultiB) {
          return isMultiA ? -1 : 1;
        }
        const availSlotsA = classAvailableSlotsCount[a.assignment.classId] ?? 999;
        const availSlotsB = classAvailableSlotsCount[b.assignment.classId] ?? 999;
        if (availSlotsA !== availSlotsB) {
          return availSlotsA - availSlotsB;
        }
        const teacherIdsA = parseTeacherIds(a.assignment.teacherId);
        const teacherIdsB = parseTeacherIds(b.assignment.teacherId);
        const teacherUnavailA = teacherIdsA.reduce((sum, id) => sum + (teacherConstraints[id] || 0), 0);
        const teacherUnavailB = teacherIdsB.reduce((sum, id) => sum + (teacherConstraints[id] || 0), 0);
        if (teacherUnavailA !== teacherUnavailB) {
          return teacherUnavailB - teacherUnavailA;
        }
        if (a.size !== b.size) {
          return b.size - a.size;
        }
        return Math.random() - 0.5;
      });

      // Swap environment references to the repair ones
      currentSchedule = repairSchedule;
      currentTeacherOccupancy = repairTeacherOccupancy;
      currentClassroomOccupancy = repairClassroomOccupancy;

      // Log progress before repair
      const isStuck = totalIterations > 300 && (totalIterations - lastImprovementIteration) > 300;
      const logMessage = isStuck
        ? "Tıkanma algılandı, otomatik onarım başlatılıyor..."
        : `LNS Onarım (Repair) aktif: %10 rastgele temizlenip yeniden yerleştiriliyor... (Yeniden Başlatma: ${restartCount})`;

      self.postMessage({
        type: "progress",
        progress: {
          phase: "backtracking",
          percent: 90,
          message: logMessage,
          steps: totalIterations,
          unplacedCount: bestGlobalUnplacedHours,
          elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
          totalHours: blocksToPlace.reduce((sum, b) => sum + b.size, 0),
          placedHours: blocksToPlace.reduce((sum, b) => sum + b.size, 0) - bestGlobalUnplacedHours,
          unplacedHours: bestGlobalUnplacedHours,
          bestSchedule: bestGlobalSchedule,
          unplacedDetails: bestGlobalUnplaced.map(b => `${classesMap.get(b.assignment.classId)?.name || b.assignment.classId} sınıfının ${b.size} saatlik dersi yerleştirilemedi.`)
        }
      });

      // Run solveStateSpace on this subproblem
      return await solveStateSpace(allRepairBlocks, 0);
    };

    let backtrackingSolved = false;
    const stagnationIterations = totalIterations - lastImprovementIteration;
    const isStuck = totalIterations > 300 && stagnationIterations > 300;

    const useStepByStep = options?.stepByStep !== false;

    if (useStepByStep) {
      lockedAssignmentIds.clear();

      const tier1 = randomizedBlocks.filter(b => getBlockTier(b, coursesMap) === 1);
      const tier2 = randomizedBlocks.filter(b => getBlockTier(b, coursesMap) === 2);
      const tier3 = randomizedBlocks.filter(b => getBlockTier(b, coursesMap) === 3);

      let t1Success = true;
      if (tier1.length > 0) {
        t1Success = await solveStateSpace(tier1, 0);
        const val1 = validateSchedule(currentSchedule, numDays, numPeriods);
        const scheduledT1 = getScheduledAssignmentIds(currentSchedule, numDays, numPeriods);
        for (const id of scheduledT1) {
          lockedAssignmentIds.add(id);
        }

        self.postMessage({
          type: "progress",
          progress: {
            phase: "backtracking",
            percent: 30,
            message: `Aşama 1 (Sabit/Öğretmen Programı) tamamlandı. Doğrulama: ${val1.message}`,
            steps: totalIterations,
            unplacedCount: tier1.length - scheduledT1.size,
            elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
            bestSchedule: currentSchedule
          }
        });
      }

      let t2Success = true;
      if (tier2.length > 0 && !stopped) {
        t2Success = await solveStateSpace(tier2, 0);
        const val2 = validateSchedule(currentSchedule, numDays, numPeriods);
        const scheduledT2 = getScheduledAssignmentIds(currentSchedule, numDays, numPeriods);
        for (const id of scheduledT2) {
          lockedAssignmentIds.add(id);
        }

        self.postMessage({
          type: "progress",
          progress: {
            phase: "backtracking",
            percent: 60,
            message: `Aşama 2 (Genel Kültür) tamamlandı. Doğrulama: ${val2.message}`,
            steps: totalIterations,
            unplacedCount: tier2.length - (scheduledT2.size - lockedAssignmentIds.size),
            elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
            bestSchedule: currentSchedule
          }
        });
      }

      let t3Success = true;
      if (tier3.length > 0 && !stopped) {
        t3Success = await solveStateSpace(tier3, 0);
        const val3 = validateSchedule(currentSchedule, numDays, numPeriods);

        self.postMessage({
          type: "progress",
          progress: {
            phase: "backtracking",
            percent: 90,
            message: `Aşama 3 (Atölye/Laboratuvar) tamamlandı. Doğrulama: ${val3.message}`,
            steps: totalIterations,
            elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
            bestSchedule: currentSchedule
          }
        });
      }

      backtrackingSolved = t1Success && t2Success && t3Success;
    } else {
      if (bestGlobalUnplacedHours > 0 && (totalIterations >= 1000 || isStuck)) {
        if (isStuck && consecutiveLnsRepairsWithoutImprovement >= 3) {
          consecutiveLnsRepairsWithoutImprovement = 0;
          backtrackingSolved = await solveStateSpace(randomizedBlocks, 0);
        } else {
          consecutiveLnsRepairsWithoutImprovement++;
          backtrackingSolved = await runLnsRepair();
        }
      } else {
        backtrackingSolved = await solveStateSpace(randomizedBlocks, 0);
      }
    }

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
      lastImprovementIteration = totalIterations;
      consecutiveLnsRepairsWithoutImprovement = 0;

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
    const isTargeted = !!((options?.targetClassIds && options.targetClassIds.length > 0) || (options?.targetTeacherIds && options.targetTeacherIds.length > 0));
    if (unplacedHoursThisTrial === 0 && !isTargeted) {
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

    // Increments restartCount on every trial to scale backtracking depth/steps dynamically
    restartCount++;

    // If we successfully placed all lessons (0 unplaced hours), break immediately to finish and close the progress overlay!
    if (bestGlobalUnplacedHours === 0 && !options?.exhaustiveMode) {
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

