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

export interface SolveResult {
  success: boolean;
  conflictAssignmentIds?: Set<string>;
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

// Deterministic Seeding Support
let currentSeed = 123456789;
let activeSeed = 123456789;

function setRandomSeed(seed: number) {
  currentSeed = seed;
}

// Simple and fast Mulberry32 PRNG
function random(): number {
  let t = (currentSeed += 0x6D2B79F5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

let lockedAssignmentIds = new Set<string>();
let isAggressiveOrDeepActive = false;

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
    const assignmentObj = state.assignments.find(a => a.id === slot.assignmentId);
    if (assignmentObj && (assignmentObj as any).isLocked === true) return true;
    const course = state.courses.find(c => c.id === slot.courseId);
    if (course && isChefOrCoordinatorCourse(course.name, course.code)) return true;
    return false;
  };

  // Strict different days constraint check - different blocks of same course must go to different days
  const classDaySched = tempSchedule[assignment.classId]?.[dayIndex];
  if (classDaySched) {
    for (let p = 0; p < numPeriods; p++) {
      const slot = classDaySched[p];
      if (slot !== null && slot.courseId === assignment.courseId) {
        return false;
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

      // Find assignment to calculate ideal number of days/blocks
      let idealDays = 1;
      const assign = state.assignments.find(a => a.classId === classId && a.courseId === courseId);
      if (assign) {
        if (assign.customPlacementMode) {
          const parts = assign.customPlacementMode.split("+").map(p => parseInt(p.trim(), 10)).filter(p => !isNaN(p) && p > 0);
          idealDays = parts.length;
        } else {
          const prefBlock = assign.preferredBlockSize || 2;
          idealDays = Math.ceil(assign.weeklyHours / prefBlock);
        }
      } else {
        idealDays = Math.ceil(totalLessons / 2);
      }

      if (daysWithCourse < idealDays) {
        const missingDays = idealDays - daysWithCourse;
        distributionPenalty += missingDays * 250;
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
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function isSlotLocked(slot: ScheduleSlot | null, coursesMap: Map<string, Course>, priorityAssignmentIds?: string[]): boolean {
  if (!slot) return false;
  if (slot.isLocked === true) return true;
  if (lockedAssignmentIds.has(slot.assignmentId) && !isAggressiveOrDeepActive) return true;
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

function getConsecutiveBlockSlots(
  schedule: ClassScheduleMap,
  classId: string,
  d: number,
  p: number,
  assignmentId: string
): { slot: ScheduleSlot; d: number; p: number }[] {
  const slots: { slot: ScheduleSlot; d: number; p: number }[] = [];
  const daySchedule = schedule[classId]?.[d];
  if (!daySchedule) return slots;

  // Find start of consecutive block
  let start = p;
  while (start > 0 && daySchedule[start - 1]?.assignmentId === assignmentId) {
    start--;
  }

  // Find end of consecutive block
  let end = p;
  while (end < daySchedule.length - 1 && daySchedule[end + 1]?.assignmentId === assignmentId) {
    end++;
  }

  // Collect all slots in this consecutive block
  for (let i = start; i <= end; i++) {
    const s = daySchedule[i];
    if (s) {
      slots.push({ slot: s, d, p: i });
    }
  }
  return slots;
}

function getRemainingDomainSize(
  block: BlockToPlace,
  schedule: ClassScheduleMap,
  teacherOccupancy: Record<string, (string | null)[][]>,
  classroomOccupancy: Record<string, (string | null)[][]>,
  settings: AppState["settings"],
  teachersMap: Map<string, Teacher>,
  classesMap: Map<string, GradeClass>,
  classroomsMap: Map<string, Classroom>,
  coursesMap: Map<string, Course>,
  options?: any
): number {
  const classId = block.assignment.classId;
  const classObj = classesMap.get(classId);
  if (!classObj) return 0;

  const numDays = settings.days.length;
  const numPeriods = settings.periodsPerDay;
  let possibleSlots = 0;

  for (let d = 0; d < numDays; d++) {
    if (classObj.unavailability[d]?.every(p => p === true)) continue;

    for (let p = 0; p <= numPeriods - block.size; p++) {
      let valid = true;

      for (let offset = 0; offset < block.size; offset++) {
        const period = p + offset;

        if (classObj.unavailability[d]?.[period] === true) {
          valid = false;
          break;
        }

        if (classObj.dailyPeriods) {
          const maxPeriods = classObj.dailyPeriods[d];
          if (maxPeriods !== undefined && period >= maxPeriods) {
            valid = false;
            break;
          }
        }

        // Strict different days constraint check
        const classDaySched = schedule[classId]?.[d];
        if (classDaySched) {
          const hasOtherSameCourse = classDaySched.some((s, sIdx) => 
            s !== null && 
            s.courseId === block.assignment.courseId && 
            (sIdx < p || sIdx >= p + block.size)
          );
          if (hasOtherSameCourse) {
            valid = false;
            break;
          }
        }

        const existingSlot = schedule[classId]?.[d]?.[period];
        if (existingSlot && isSlotLocked(existingSlot, coursesMap, options?.priorityAssignmentIds)) {
          valid = false;
          break;
        }

        if (block.assignment.teacherId) {
          const tIds = parseTeacherIds(block.assignment.teacherId);
          for (const tId of tIds) {
            const teacher = teachersMap.get(tId);
            if (teacher?.unavailability[d]?.[period] === true) {
              valid = false;
              break;
            }
            const occupiedByClassId = teacherOccupancy[tId]?.[d]?.[period];
            if (occupiedByClassId !== null && occupiedByClassId !== undefined && occupiedByClassId !== classId) {
              const occupiedSlot = schedule[occupiedByClassId]?.[d]?.[period];
              if (occupiedSlot && isSlotLocked(occupiedSlot, coursesMap, options?.priorityAssignmentIds)) {
                valid = false;
                break;
              }
            }
          }
          if (!valid) break;
        }

        if (block.assignment.classroomId) {
          const classroom = classroomsMap.get(block.assignment.classroomId);
          if (classroom?.unavailability[d]?.[period] === true) {
            valid = false;
            break;
          }
          const occupiedByClassId = classroomOccupancy[block.assignment.classroomId]?.[d]?.[period];
          if (occupiedByClassId && occupiedByClassId !== classId) {
            const occupiedSlot = schedule[occupiedByClassId]?.[d]?.[period];
            if (occupiedSlot && isSlotLocked(occupiedSlot, coursesMap, options?.priorityAssignmentIds)) {
              valid = false;
              break;
            }
          }
          if (!valid) break;
        }
      }

      if (valid) {
        possibleSlots++;
      }
    }
  }

  return possibleSlots;
}

self.onmessage = async (e: MessageEvent) => {
  const { type, state, options } = e.data;
  
  if (type === "stop") {
    stopped = true;
    return;
  }

  // Start Solver
  stopped = false;
  activeSeed = (typeof options?.randomSeed === "number")
    ? options.randomSeed
    : Math.floor(Date.now() + Math.random() * 1000000);
  setRandomSeed(activeSeed);

  const { settings, teachers, classes, classrooms, assignments, courses } = state;
  isAggressiveOrDeepActive = true;
  const numDays = settings.days.length;
  const numPeriods = settings.periodsPerDay;
  const keepExisting = options?.keepExisting ?? false;
  const isTargeted = !!((options?.targetClassIds && options.targetClassIds.length > 0) || (options?.targetTeacherIds && options.targetTeacherIds.length > 0));

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

  const teacherConflictWeights = new Map<string, number>();
  const classConflictWeights = new Map<string, number>();

  const baseSchedule: ClassScheduleMap = {};

  // Setup schedule layout
  for (const c of classes) {
    baseSchedule[c.id] = {};
    for (let d = 0; d < numDays; d++) {
      baseSchedule[c.id][d] = Array(numPeriods).fill(null);
    }
  }

  // Load existing schedule if requested
  if ((keepExisting || isTargeted) && state.schedule) {
    for (const cId of Object.keys(state.schedule)) {
      if (baseSchedule[cId]) {
        for (let d = 0; d < numDays; d++) {
          const daySched = state.schedule[cId][d];
          if (daySched) {
            for (let p = 0; p < numPeriods; p++) {
              const slot = daySched[p];
              if (slot) {
                // If we are keeping existing, but the slot is NOT locked, we can let the scheduler
                // shift/re-plan it by NOT locking/fixing it in baseSchedule.
                // A slot is locked if slot.isLocked === true OR if it's a Chef/Coordinator course.
                const isKoorOrSef = (() => {
                  const course = coursesMap.get(slot.courseId);
                  if (!course) return false;
                  return isChefOrCoordinatorCourse(course.name, course.code);
                })();
                const isLocked = slot.isLocked === true || !!isKoorOrSef;

                if (isLocked) {
                  baseSchedule[cId][d][p] = slot;
                } else {
                  // If we are targeting specific classes/teachers, and this slot does NOT belong to any of them,
                  // we MUST keep it in baseSchedule (as if it is locked/fixed) so it isn't deleted or ejected.
                  let belongsToTarget = true;
                  if (isTargeted) {
                    belongsToTarget = false;
                    const assign = assignmentsMap.get(slot.assignmentId);
                    if (assign) {
                      if (options?.targetClassIds && options.targetClassIds.includes(assign.classId)) {
                        belongsToTarget = true;
                      }
                      if (options?.targetTeacherIds && assign.teacherId) {
                        const tIds = parseTeacherIds(assign.teacherId);
                        if (tIds.some(id => options.targetTeacherIds!.includes(id))) {
                          belongsToTarget = true;
                        }
                      }
                    }
                  }

                  if (belongsToTarget) {
                    baseSchedule[cId][d][p] = null; // Let the scheduler shift/re-place it!
                  } else {
                    baseSchedule[cId][d][p] = slot; // Keep it fixed so it is preserved!
                  }
                }
              } else {
                baseSchedule[cId][d][p] = null;
              }
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

  const isAggressiveOrDeep = true;
  // Maximum number of restarts and duration before returning the best-effort schedule
  const maxRestarts = options?.numTrials ?? 80;
  const maxDurationMs = 30000;

  // Infinite Solver & Randomized Restart Loop
  while (!stopped) {
    // Yield execution to process incoming stop messages or progress UI events
    await new Promise(resolve => setTimeout(resolve, 0));
    if (stopped) {
      break;
    }

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

    // Öneri 1: Deterministik Tohumlama (Deterministic Seeding)
    // İlk denemede (restartCount === 0), her zaman en yüksek kısıtı olan derslerin matematiksel sırasıyla başlarız.
    // Bu sayede kolay-orta programlar her seferinde anında ve kararlı şekilde yerleşir.
    // Başarısız olunursa sonraki denemelerde (restartCount > 0) yerel minimumlardan kaçmak için karıştırma (shuffle) yaparız.
    const randomizedBlocks = restartCount === 0 ? [...blocksToPlace] : shuffle([...blocksToPlace]);

    // Calculate remainingDomainSize for all blocks at the start of this trial
    const remainingDomainSizes = new Map<string, number>();
    for (const b of randomizedBlocks) {
      const dSize = getRemainingDomainSize(
        b,
        currentSchedule,
        currentTeacherOccupancy,
        currentClassroomOccupancy,
        settings,
        teachersMap,
        classesMap,
        classroomsMap,
        coursesMap,
        options
      );
      remainingDomainSizes.set(b.id, dSize);
    }

    const getConflictWeightScore = (b: BlockToPlace): number => {
      const cWeight = classConflictWeights.get(b.assignment.classId) || 0;
      const tIds = parseTeacherIds(b.assignment.teacherId);
      const tWeight = tIds.reduce((sum, id) => sum + (teacherConflictWeights.get(id) || 0), 0);
      return cWeight + tWeight;
    };

    randomizedBlocks.sort((a, b) => {
      // Priority 0: priorityAssignmentIds (for Forced Placement / "Bu Dersi Zorla") get absolute first priority
      if (options?.priorityAssignmentIds && options.priorityAssignmentIds.length > 0) {
        const isPriA = options.priorityAssignmentIds.includes(a.assignment.id);
        const isPriB = options.priorityAssignmentIds.includes(b.assignment.id);
        if (isPriA !== isPriB) {
          return isPriA ? -1 : 1;
        }
      }

      // Priority 1: Dynamic conflict weights (Adaptive Constraint Weights) - higher weight placed first
      const weightA = getConflictWeightScore(a);
      const weightB = getConflictWeightScore(b);
      if (weightA !== weightB) {
        return weightB - weightA;
      }

      // Priority 1.5: Soft Tier priority (Tier 1 < Tier 2 < Tier 3) - to try important/teacher blocks first
      const tierA = getBlockTier(a, coursesMap);
      const tierB = getBlockTier(b, coursesMap);
      if (tierA !== tierB) {
        return tierA - tierB;
      }

      // Priority 2: Remaining domain size (MCV / MRV Heuristic) - less is placed first
      const sizeA = remainingDomainSizes.get(a.id) ?? 999;
      const sizeB = remainingDomainSizes.get(b.id) ?? 999;
      if (sizeA !== sizeB) {
        return sizeA - sizeB;
      }

      // Priority 3: Multi-teacher lessons get absolute priority
      const isMultiA = a.assignment.teacherId && parseTeacherIds(a.assignment.teacherId).length > 1;
      const isMultiB = b.assignment.teacherId && parseTeacherIds(b.assignment.teacherId).length > 1;
      if (isMultiA !== isMultiB) {
        return isMultiA ? -1 : 1;
      }

      // Priority 4: En az boş saati olan sınıf (MCV)
      const availSlotsA = classAvailableSlotsCount[a.assignment.classId] ?? 999;
      const availSlotsB = classAvailableSlotsCount[b.assignment.classId] ?? 999;
      if (availSlotsA !== availSlotsB) {
        return availSlotsA - availSlotsB; // Less available slots = more constrained = place first
      }

      // Priority 5: En kısıtlı öğretmene sahip ders (MCV)
      const teacherIdsA = parseTeacherIds(a.assignment.teacherId);
      const teacherIdsB = parseTeacherIds(b.assignment.teacherId);
      const teacherUnavailA = teacherIdsA.reduce((sum, id) => sum + (teacherConstraints[id] || 0), 0);
      const teacherUnavailB = teacherIdsB.reduce((sum, id) => sum + (teacherConstraints[id] || 0), 0);
      if (teacherUnavailA !== teacherUnavailB) {
        return teacherUnavailB - teacherUnavailA; // More unavailable hours = more constrained = place first
      }

      // Priority 6: Larger block size first
      if (a.size !== b.size) {
        return b.size - a.size;
      }

      // Priority 7: Deterministik veya Rastgele bağ bozucu (Tie-breaker)
      if (restartCount === 0) {
        return a.id.localeCompare(b.id);
      }
      return random() - 0.5;
    });

    // Deep Backtracking Depth Limit - scale depth gradually with restartCount for maximum search depth
    let maxBacktrackDepth = isTargeted
      ? Math.max(150, blocksToPlace.length * 4)
      : Math.max(120, 50 + Math.floor(restartCount / 2));
    if (!isTargeted && totalIterations - lastImprovementIteration >= 500) {
      maxBacktrackDepth += 20;
    }
    let lastYieldTime = Date.now();

    // Search step limits to prevent thrashing in bad subtrees
    let currentTrialSteps = 0;
    const maxTrialSteps = isTargeted
      ? 5000 + (restartCount % 10) * 1000   // Rapid restarts for targeted aggressive placement
      : 10000 + (restartCount % 15) * 1000; // Deeper restarts for full-school aggressive placement
    const tabuList = new Map<string, number>(); // Key: `${tId}-${d}-${period}-${classId}`, Value: step number when it expires
    const ejectionCounts = new Map<string, number>(); // Key: assignmentId, Value: number of times ejected in this subproblem

    const solveStateSpace = async (
      blocks: BlockToPlace[],
      depth: number
    ): Promise<SolveResult> => {
      if (stopped) return { success: false };

      const tryChainShiftRecursive = async (
        assignmentId: string,
        targetD: number,
        targetP: number,
        visited: Set<string>,
        chainDepth: number,
        maxChainDepth: number
      ): Promise<boolean> => {
        if (chainDepth > maxChainDepth) return false;
        if (visited.has(assignmentId)) return false;

        const assignObj = assignmentsMap.get(assignmentId);
        if (!assignObj) return false;

        const classId = assignObj.classId;
        const classObj = classesMap.get(classId);
        if (!classObj) return false;

        // 1. Find the current placement of assignmentId in currentSchedule
        let sourceD = -1;
        let sourceP = -1;
        let blockSize = 0;
        const slotsToMove: ScheduleSlot[] = [];

        for (let d = 0; d < numDays && sourceD === -1; d++) {
          for (let p = 0; p < numPeriods; p++) {
            const slot = currentSchedule[classId]?.[d]?.[p];
            if (slot && slot.assignmentId === assignmentId) {
              sourceD = d;
              sourceP = p;
              // Scan contiguous block size for this assignment
              let currP = p;
              while (currP < numPeriods) {
                const s = currentSchedule[classId]?.[d]?.[currP];
                if (s && s.assignmentId === assignmentId) {
                  slotsToMove.push(s);
                  currP++;
                } else {
                  break;
                }
              }
              blockSize = slotsToMove.length;
              break;
            }
          }
        }

        // If already at target, return true!
        if (sourceD === targetD && sourceP === targetP) {
          return true;
        }

        // 2. Check if (targetD, targetP) is physically possible for classId, teacher, classroom
        for (let offset = 0; offset < (blockSize || 1); offset++) {
          const currP = targetP + offset;
          if (currP >= numPeriods) return false;

          // Class unavailability
          if (classObj.unavailability[targetD]?.[currP] === true) return false;

          // Teacher unavailability
          if (assignObj.teacherId) {
            const tIds = parseTeacherIds(assignObj.teacherId);
            for (const tId of tIds) {
              const teacher = teachersMap.get(tId);
              if (teacher?.unavailability[targetD]?.[currP] === true) return false;
            }
          }

          // Classroom unavailability
          if (assignObj.classroomId) {
            const classroom = classroomsMap.get(assignObj.classroomId);
            if (classroom?.unavailability[targetD]?.[currP] === true) return false;
          }
        }

        // 3. Collect conflicts at (targetD, targetP) in current state
        const conflicts = new Set<string>(); // Set of assignment IDs
        for (let offset = 0; offset < (blockSize || 1); offset++) {
          const currP = targetP + offset;

          // Class conflict
          const classOccupant = currentSchedule[classId]?.[targetD]?.[currP];
          if (classOccupant && classOccupant.assignmentId !== assignmentId) {
            conflicts.add(classOccupant.assignmentId);
          }

          // Teacher conflict (check other classes where this teacher is scheduled at (targetD, currP))
          if (assignObj.teacherId) {
            const tIds = parseTeacherIds(assignObj.teacherId);
            for (const tId of tIds) {
              const busyClassId = currentTeacherOccupancy[tId]?.[targetD]?.[currP];
              if (busyClassId && busyClassId !== classId) {
                const occupiedSlot = currentSchedule[busyClassId]?.[targetD]?.[currP];
                if (occupiedSlot && occupiedSlot.assignmentId !== assignmentId) {
                  conflicts.add(occupiedSlot.assignmentId);
                }
              }
            }
          }

          // Classroom conflict (check other classes using this classroom)
          if (assignObj.classroomId) {
            const busyClassId = currentClassroomOccupancy[assignObj.classroomId]?.[targetD]?.[currP];
            if (busyClassId && busyClassId !== classId) {
              const occupiedSlot = currentSchedule[busyClassId]?.[targetD]?.[currP];
              if (occupiedSlot && occupiedSlot.assignmentId !== assignmentId) {
                conflicts.add(occupiedSlot.assignmentId);
              }
            }
          }
        }

        // 4. Validate if any of the conflicts cannot be shifted (e.g. locked)
        for (const confId of conflicts) {
          if (visited.has(confId)) return false; // Cycle detected
          
          const confAssignObj = assignmentsMap.get(confId);
          if (!confAssignObj) return false;
          
          if (options?.priorityAssignmentIds && options.priorityAssignmentIds.includes(confId)) {
            return false;
          }
          
          const course = coursesMap.get(confAssignObj.courseId);
          if (course?.isLocked) return false;
        }

        // Create local clones to try shifting without corrupting state
        const backupSchedule = cloneSchedule(currentSchedule);
        const backupTeacherOccupancy = cloneOccupancy(currentTeacherOccupancy, numDays);
        const backupClassroomOccupancy = cloneOccupancy(currentClassroomOccupancy, numDays);

        // Add ourselves to visited
        const nextVisited = new Set(visited);
        nextVisited.add(assignmentId);

        // Temporarily "clear" the source slot of assignmentId in the backup state so they don't look busy
        if (sourceD !== -1) {
          for (let offset = 0; offset < blockSize; offset++) {
            const sP = sourceP + offset;
            const slot = backupSchedule[classId][sourceD][sP];
            if (slot && slot.assignmentId === assignmentId) {
              backupSchedule[classId][sourceD][sP] = null;
              clearOccupancy(classId, sourceD, sP, slot, backupTeacherOccupancy, backupClassroomOccupancy);
            }
          }
        }

        // Try to find homes for all conflicts recursively
        let allResolved = true;

        for (const confId of conflicts) {
          const confAssign = assignmentsMap.get(confId);
          if (!confAssign) {
            allResolved = false;
            break;
          }

          let resolvedThisConflict = false;
          
          // Separate empty vs occupied slots in confAssign's class
          const emptySlots: { d: number; p: number }[] = [];
          const occupiedSlots: { d: number; p: number }[] = [];

          for (let nd = 0; nd < numDays; nd++) {
            if (classesMap.get(confAssign.classId)?.unavailability[nd]?.every(p => p === true)) continue;
            for (let np = 0; np < numPeriods; np++) {
              if (nd === targetD && np === targetP) continue;
              
              const isCurrentlyEmpty = (backupSchedule[confAssign.classId]?.[nd]?.[np] === null);
              if (isCurrentlyEmpty) {
                emptySlots.push({ d: nd, p: np });
              } else {
                occupiedSlots.push({ d: nd, p: np });
              }
            }
          }

          const possibleSlots = [...emptySlots, ...occupiedSlots];

          for (const slot of possibleSlots) {
            // Swap global references temporarily to make recursion point to backup state
            const oldSchedule = currentSchedule;
            const oldTeacher = currentTeacherOccupancy;
            const oldClassroom = currentClassroomOccupancy;

            currentSchedule = backupSchedule;
            currentTeacherOccupancy = backupTeacherOccupancy;
            currentClassroomOccupancy = backupClassroomOccupancy;

            const success = await tryChainShiftRecursive(
              confId,
              slot.d,
              slot.p,
              nextVisited,
              chainDepth + 1,
              maxChainDepth
            );

            currentSchedule = oldSchedule;
            currentTeacherOccupancy = oldTeacher;
            currentClassroomOccupancy = oldClassroom;

            if (success) {
              resolvedThisConflict = true;
              break;
            }
          }

          if (!resolvedThisConflict) {
            allResolved = false;
            break;
          }
        }

        if (allResolved) {
          // If all conflicts are successfully recursively shifted, we can place assignmentId at (targetD, targetP)
          for (let offset = 0; offset < (blockSize || 1); offset++) {
            const tP = targetP + offset;
            const slot = {
              assignmentId: assignObj.id,
              courseId: assignObj.courseId,
              teacherId: assignObj.teacherId,
              classroomId: assignObj.classroomId
            };
            backupSchedule[classId][targetD][tP] = slot;
            registerOccupancy(classId, targetD, tP, slot, backupTeacherOccupancy, backupClassroomOccupancy);
          }

          // Apply backup state to main state!
          for (const cId of Object.keys(currentSchedule)) {
            for (let d = 0; d < numDays; d++) {
              currentSchedule[cId][d] = [...backupSchedule[cId][d]];
            }
          }
          for (const tId of Object.keys(currentTeacherOccupancy)) {
            for (let d = 0; d < numDays; d++) {
              currentTeacherOccupancy[tId][d] = [...backupTeacherOccupancy[tId][d]];
            }
          }
          for (const rId of Object.keys(currentClassroomOccupancy)) {
            for (let d = 0; d < numDays; d++) {
              currentClassroomOccupancy[rId][d] = [...backupClassroomOccupancy[rId][d]];
            }
          }

          return true;
        }

        return false;
      };

      const combinedConflicts = new Set<string>();

      currentTrialSteps++;
      if (currentTrialSteps > maxTrialSteps) {
        return { success: false }; // Force immediate trial abort to trigger rapid restart
      }

      // Keep track of the best global schedule seen so far (Best-State Persistence & Prevention of Data Loss)
      const hasPendingEjected = blocks.some(b => b.isEjected === true);
      const allowSave = !hasPendingEjected;
      if (allowSave) {
        // Calculate the actual global unplaced hours from currentSchedule
        const scheduledInTrial: Record<string, number> = {};
        for (const cId of Object.keys(currentSchedule)) {
          const classSched = currentSchedule[cId];
          if (classSched) {
            for (let d = 0; d < numDays; d++) {
              const daySlots = classSched[d];
              if (daySlots) {
                for (let p = 0; p < numPeriods; p++) {
                  const slot = daySlots[p];
                  if (slot) {
                    scheduledInTrial[slot.assignmentId] = (scheduledInTrial[slot.assignmentId] || 0) + 1;
                  }
                }
              }
            }
          }
        }
        let actualGlobalUnplaced = 0;
        targetAssignments.forEach(assign => {
          const scheduled = scheduledInTrial[assign.id] || 0;
          const remaining = assign.weeklyHours - scheduled;
          if (remaining > 0) {
            actualGlobalUnplaced += remaining;
          }
        });

        let isIdempotentValid = true;
        for (const assign of assignments) {
          const initial = scheduledHoursCount[assign.id] || 0;
          const current = scheduledInTrial[assign.id] || 0;
          if (current < initial) {
            isIdempotentValid = false;
            break;
          }
        }

        if (isIdempotentValid && actualGlobalUnplaced < bestGlobalUnplacedHours) {
          bestGlobalUnplacedHours = actualGlobalUnplaced;
          lastImprovementIteration = totalIterations;
          consecutiveLnsRepairsWithoutImprovement = 0;
          bestGlobalSchedule = cloneSchedule(currentSchedule);
          
          bestGlobalUnplaced = [];
          targetAssignments.forEach((assign, bIdx) => {
            const scheduled = scheduledInTrial[assign.id] || 0;
            const remaining = assign.weeklyHours - scheduled;
            if (remaining > 0) {
              bestGlobalUnplaced.push({
                assignment: assign,
                size: remaining,
                id: `${assign.id}-unplaced-bt-${bIdx}`
              });
            }
          });
        }
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
        return { success: true };
      }

      // Dynamic Variable Selection Heuristic (MRV + Priority + Conflict Weight)
      let bestIdx = 0;
      if (blocks.length > 1) {
        const scanCount = Math.min(blocks.length, 40);
        for (let i = 1; i < scanCount; i++) {
          const b = blocks[i];
          const bestBlock = blocks[bestIdx];

          const isPri = options?.priorityAssignmentIds?.includes(b.assignment.id) ? 1 : 0;
          const isPriBest = options?.priorityAssignmentIds?.includes(bestBlock.assignment.id) ? 1 : 0;
          if (isPri !== isPriBest) {
            if (isPri > isPriBest) bestIdx = i;
            continue;
          }

          const isEjected = b.isEjected === true ? 1 : 0;
          const bestEjected = bestBlock.isEjected === true ? 1 : 0;
          if (isEjected !== bestEjected) {
            if (isEjected > bestEjected) bestIdx = i;
            continue;
          }

          const tier = getBlockTier(b, coursesMap);
          const bestTier = getBlockTier(bestBlock, coursesMap);
          if (tier !== bestTier) {
            if (tier < bestTier) bestIdx = i;
            continue;
          }

          // Dynamic Remaining Domain Size (MRV Heuristic)
          const dSize = getRemainingDomainSize(
            b,
            currentSchedule,
            currentTeacherOccupancy,
            currentClassroomOccupancy,
            settings,
            teachersMap,
            classesMap,
            classroomsMap,
            coursesMap,
            options
          );
          const bestDSize = getRemainingDomainSize(
            bestBlock,
            currentSchedule,
            currentTeacherOccupancy,
            currentClassroomOccupancy,
            settings,
            teachersMap,
            classesMap,
            classroomsMap,
            coursesMap,
            options
          );
          if (dSize !== bestDSize) {
            if (dSize < bestDSize) bestIdx = i;
            continue;
          }

          const conflictWeight = getConflictWeightScore(b);
          const bestWeight = getConflictWeightScore(bestBlock);
          if (conflictWeight !== bestWeight) {
            if (conflictWeight > bestWeight) bestIdx = i;
            continue;
          }

          const isMulti = b.assignment.teacherId && parseTeacherIds(b.assignment.teacherId).length > 1 ? 1 : 0;
          const bestMulti = bestBlock.assignment.teacherId && parseTeacherIds(bestBlock.assignment.teacherId).length > 1 ? 1 : 0;
          if (isMulti !== bestMulti) {
            if (isMulti > bestMulti) bestIdx = i;
            continue;
          }

          if (b.size !== bestBlock.size) {
            if (b.size > bestBlock.size) bestIdx = i;
            continue;
          }
        }
      }

      const block = blocks[bestIdx];
      const blocksSlice1 = [...blocks];
      blocksSlice1.splice(bestIdx, 1);

      const classId = block.assignment.classId;
      const classObj = classesMap.get(classId);
      if (!classObj) {
        return await solveStateSpace(blocksSlice1, depth);
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

            const classDaySched = currentSchedule[classId]?.[d];
            if (classDaySched) {
              const hasOtherSameCourse = classDaySched.some((s, sIdx) => 
                s !== null && 
                s.courseId === block.assignment.courseId && 
                (sIdx < p || sIdx >= p + block.size)
              );
              if (hasOtherSameCourse) {
                canPlace = false;
                break;
              }
            }

            const existingSlot = currentSchedule[classId]?.[d]?.[period];
            if (existingSlot) {
              const blockSlots = getConsecutiveBlockSlots(currentSchedule, classId, d, period, existingSlot.assignmentId);
              let canEject = true;
              for (const bs of blockSlots) {
                if (isSlotLocked(bs.slot, coursesMap) || (options?.priorityAssignmentIds && options.priorityAssignmentIds.includes(bs.slot.assignmentId))) {
                  canEject = false;
                  break;
                }
                if (bs.slot.classroomId !== null && !isAggressiveOrDeepActive) {
                  canEject = false;
                  break;
                }
              }
              if (!canEject) {
                canPlace = false;
                break;
              }
              for (const bs of blockSlots) {
                if (!conflicts.some(c => c.slot.assignmentId === bs.slot.assignmentId && c.d === bs.d && c.p === bs.p)) {
                  conflicts.push(bs);
                }
              }
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
                    const blockSlots = getConsecutiveBlockSlots(currentSchedule, occupiedByClassId, d, period, occupiedSlot.assignmentId);
                    let canEject = true;
                    for (const bs of blockSlots) {
                      if (isSlotLocked(bs.slot, coursesMap) || (options?.priorityAssignmentIds && options.priorityAssignmentIds.includes(bs.slot.assignmentId))) {
                        canEject = false;
                        break;
                      }
                      if (bs.slot.classroomId !== null && !isAggressiveOrDeepActive) {
                        canEject = false;
                        break;
                      }
                    }
                    if (!canEject) {
                      canPlace = false;
                      break;
                    }
                    for (const bs of blockSlots) {
                      if (!conflicts.some(c => c.slot.assignmentId === bs.slot.assignmentId && c.d === bs.d && c.p === bs.p)) {
                        conflicts.push(bs);
                      }
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
                  const blockSlots = getConsecutiveBlockSlots(currentSchedule, occupiedByClassId, d, period, occupiedSlot.assignmentId);
                  let canEject = true;
                  for (const bs of blockSlots) {
                    if (isSlotLocked(bs.slot, coursesMap) || (options?.priorityAssignmentIds && options.priorityAssignmentIds.includes(bs.slot.assignmentId))) {
                      canEject = false;
                      break;
                    }
                    if (bs.slot.classroomId !== null && !isAggressiveOrDeepActive) {
                      canEject = false;
                      break;
                    }
                  }
                  if (!canEject) {
                    canPlace = false;
                    break;
                  }
                  for (const bs of blockSlots) {
                    if (!conflicts.some(c => c.slot.assignmentId === bs.slot.assignmentId && c.d === bs.d && c.p === bs.p)) {
                      conflicts.push(bs);
                    }
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
        let hasSoftLockedConflict = false;
        let containsWorkshopConflict = false;
        for (const conflict of cand.conflicts) {
          if (isSlotLocked(conflict.slot, coursesMap, options?.priorityAssignmentIds)) {
            hasLockedOrPriorityConflict = true;
          }
          if (lockedAssignmentIds.has(conflict.slot.assignmentId)) {
            hasSoftLockedConflict = true;
          }
          if (conflict.slot.classroomId !== null) {
            containsWorkshopConflict = true;
          }
        }

        // High penalty if we eject without being strictly more constrained.
        // Base ejection penalty is 1000 so that empty slots (score 0) are always prioritized.
        let score = (isCurrentMoreConstrained || isAggressiveOrDeepActive)
          ? 1000 + cand.conflicts.length * 10
          : 100000 + cand.conflicts.length * 100;

        if (hasLockedOrPriorityConflict) {
          score *= 10; // Apply significantly higher (10x) penalty for ejecting locked/priority slots
        }

        if (hasSoftLockedConflict && isAggressiveOrDeepActive) {
          score += 50000; // Apply a moderate/high penalty to discourage soft-lock ejection unless necessary
        }

        if (containsWorkshopConflict) {
          // Atölye derslerini kaydırmayı/yerinden çıkarmayı "çok pahalı" yapıyoruz
          score += 1000000000; // Büyük penaltı maliyeti (Sonsuz maliyet etkisi)
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

              // Döngü Önleme Kilidi (Anti-Oscillation Ejection Counter)
              // Eğer bu ders ataması bu arama dalında 3'ten fazla kez boşa çıkarılmışsa,
              // kısır döngüleri önlemek için bu adımı baştan eliyoruz.
              const maxOscillation = isAggressiveOrDeep ? 6 : 3;
              const prevEjects = ejectionCounts.get(slotToEject.assignmentId) || 0;
              if (prevEjects >= maxOscillation) {
                failedEject = true;
                break;
              }

              backupEjected.push({ slot: slotToEject, classId: conflictClassId, d: c.d, p: c.p });
              currentSchedule[conflictClassId][c.d][c.p] = null;
              clearOccupancy(conflictClassId, c.d, c.p, slotToEject, currentTeacherOccupancy, currentClassroomOccupancy);
            }
          }
        }

        // Dinamik Geri İzleme Derinliği Sınırlandırması (Adaptive Depth Throttling)
        // Arama ağacında derinlere indikçe (depth arttıkça), zincirleme boşa çıkarmaların
        // sayısını sınırlarız. Bu sayede derin dallarda sonsuz döngülere girmek yerine
        // hızlıca geri izleme (backtrack) yaparız.
        const maxAllowedEjectionsAtDepth = isAggressiveOrDeep
          ? (depth <= 6 ? 6 : (depth <= 12 ? 4 : (depth <= 30 ? 3 : 2)))
          : (depth <= 2 ? 2 : (depth <= 6 ? 1 : 0));
        if (backupEjected.length > maxAllowedEjectionsAtDepth) {
          failedEject = true;
        }

        if (failedEject) {
          // Revert any partially ejected slots
          for (const backup of backupEjected) {
            currentSchedule[backup.classId][backup.d][backup.p] = backup.slot;
            registerOccupancy(backup.classId, backup.d, backup.p, backup.slot, currentTeacherOccupancy, currentClassroomOccupancy);
          }
          continue; // Skip to next candidate!
        }

        // Öneri 2: Net Kazanç Koruması (Net Gain Guard)
        // Eğer yerleştirdiğimiz blok boyutundan daha fazla hücreyi (ders saatini) boşa düşürüyorsak,
        // bu adımda doğrudan negatif duruma geçmiş oluruz. Bu durumun önüne geçmek için bunu engelliyoruz.
        const maxEjectedMultiplier = isAggressiveOrDeep ? block.size + 4 : block.size;
        if (backupEjected.length > maxEjectedMultiplier) {
          // Revert any partially ejected slots
          for (const backup of backupEjected) {
            currentSchedule[backup.classId][backup.d][backup.p] = backup.slot;
            registerOccupancy(backup.classId, backup.d, backup.p, backup.slot, currentTeacherOccupancy, currentClassroomOccupancy);
          }
          continue; // Skip this candidate as it results in negative net gain
        }

        // Öneri 1: İleri Görüşlü Fizibilite Kontrolü (Look-ahead Feasibility Filter)
        // Boşa düşen her bir ders atamasının, haftalık ders programında yerleşebileceği en az 1 teorik
        // boş veya kilitlenmemiş alternatif yer olduğunu kontrol ediyoruz. Eğer tamamen çaresiz/yerleşemez
        // kalacaksa, bu boşa düşürme (ejection) işlemini baştan reddediyoruz.
        const lookaheadEjectedCounts = new Map<string, number>();
        for (const backup of backupEjected) {
          const aid = backup.slot.assignmentId;
          lookaheadEjectedCounts.set(aid, (lookaheadEjectedCounts.get(aid) || 0) + 1);
        }

        let lookaheadFeasible = true;
        for (const [assignmentId, ejectedSize] of lookaheadEjectedCounts.entries()) {
          const ejectedAssign = assignmentsMap.get(assignmentId);
          if (!ejectedAssign) continue;

          let possiblePlacementsCount = 0;
          for (let nd = 0; nd < numDays; nd++) {
            for (let np = 0; np <= numPeriods - ejectedSize; np++) {
              // Şu an yerleştirmekte olduğumuz bloğun kapladığı hücrelerle çakışmamalıdır
              if (nd === d && np >= p && np < p + block.size) {
                continue;
              }

              let cellIsFreeOrEjectable = true;
              for (let offset = 0; offset < ejectedSize; offset++) {
                const curPeriod = np + offset;
                
                // Sınıf günlük ders sınırı ve uygunsuzluk kontrolü
                const classObj = classesMap.get(ejectedAssign.classId);
                if (classObj?.unavailability[nd]?.[curPeriod] === true) {
                  cellIsFreeOrEjectable = false;
                  break;
                }
                if (classObj?.dailyPeriods && curPeriod >= (classObj.dailyPeriods[nd] ?? numPeriods)) {
                  cellIsFreeOrEjectable = false;
                  break;
                }

                // Öğretmen uygunsuzluk kontrolü
                if (ejectedAssign.teacherId) {
                  const tIds = parseTeacherIds(ejectedAssign.teacherId);
                  for (const tId of tIds) {
                    const teacher = teachersMap.get(tId);
                    if (teacher?.unavailability[nd]?.[curPeriod] === true) {
                      cellIsFreeOrEjectable = false;
                      break;
                    }
                  }
                  if (!cellIsFreeOrEjectable) break;
                }

                // Sınıf/Atölye uygunsuzluk kontrolü
                if (ejectedAssign.classroomId) {
                  const classroom = classroomsMap.get(ejectedAssign.classroomId);
                  if (classroom?.unavailability[nd]?.[curPeriod] === true) {
                    cellIsFreeOrEjectable = false;
                    break;
                  }
                }

                // Kilitli derslerin kontrolü
                const occupiedSlot = currentSchedule[ejectedAssign.classId]?.[nd]?.[curPeriod];
                if (occupiedSlot && isSlotLocked(occupiedSlot, coursesMap, options?.priorityAssignmentIds)) {
                  cellIsFreeOrEjectable = false;
                  break;
                }
              }

              if (cellIsFreeOrEjectable) {
                possiblePlacementsCount++;
                if (possiblePlacementsCount >= 1) {
                  break; // En az bir alternatif yer bulundu!
                }
              }
            }
            if (possiblePlacementsCount >= 1) {
              break;
            }
          }

          // If aggressive mode is active and the ejected block is NOT a targeted block,
          // we are allowed to leave it permanently unplaced.
          const isTargetedBlock = (() => {
            if (options?.targetTeacherIds && options.targetTeacherIds.length > 0) {
              if (!ejectedAssign.teacherId) return false;
              const tIds = parseTeacherIds(ejectedAssign.teacherId);
              return tIds.some(id => options.targetTeacherIds!.includes(id));
            }
            if (options?.targetClassIds && options.targetClassIds.length > 0) {
              return options.targetClassIds.includes(ejectedAssign.classId);
            }
            return false;
          })();

          const isPermissiveEjection = false;
          if (isPermissiveEjection && !isTargetedBlock) {
            possiblePlacementsCount = 1; // force feasibility to allow permanent ejection
          }

          if (possiblePlacementsCount === 0) {
            lookaheadFeasible = false;
            break;
          }
        }

        if (!lookaheadFeasible) {
          // Revert any partially ejected slots
          for (const backup of backupEjected) {
            currentSchedule[backup.classId][backup.d][backup.p] = backup.slot;
            registerOccupancy(backup.classId, backup.d, backup.p, backup.slot, currentTeacherOccupancy, currentClassroomOccupancy);
          }
          continue; // Skip this candidate as look-ahead shows the ejected slots can't be placed
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
        const groups: Record<string, typeof backupEjected> = {};
        for (const item of backupEjected) {
          const key = `${item.slot.assignmentId}_${item.classId}_${item.d}`;
          if (!groups[key]) {
            groups[key] = [];
          }
          groups[key].push(item);
        }

        for (const key of Object.keys(groups)) {
          const items = groups[key];
          // Sort by p to find contiguous segments
          items.sort((a, b) => a.p - b.p);
          
          let currentSegmentSize = 0;
          let lastP = -999;
          const assignObj = assignments.find((a: any) => a.id === items[0].slot.assignmentId);
          if (!assignObj) continue;

          for (const item of items) {
            if (lastP === -999 || item.p === lastP + 1) {
              currentSegmentSize++;
            } else {
              // End of contiguous segment, push it
              ejectedBlocksToPlace.push({
                assignment: assignObj,
                size: currentSegmentSize,
                id: `${assignObj.id}-ej-${Date.now()}-${random()}`,
                isEjected: true
              });
              currentSegmentSize = 1;
            }
            lastP = item.p;
          }
          if (currentSegmentSize > 0) {
            ejectedBlocksToPlace.push({
              assignment: assignObj,
              size: currentSegmentSize,
              id: `${assignObj.id}-ej-${Date.now()}-${random()}`,
              isEjected: true
            });
          }
        }

        // Increment ejection counts for successfully ejected slots in this branch
        for (const backup of backupEjected) {
          const aid = backup.slot.assignmentId;
          ejectionCounts.set(aid, (ejectionCounts.get(aid) || 0) + 1);
        }

        // Forward Checking: check if any remaining block has 0 available slots
        let forwardCheckingPassed = true;
        const remainingBlocks = [...ejectedBlocksToPlace, ...blocksSlice1];
        for (const remBlock of remainingBlocks) {
          const domainSize = getRemainingDomainSize(
            remBlock,
            currentSchedule,
            currentTeacherOccupancy,
            currentClassroomOccupancy,
            settings,
            teachersMap,
            classesMap,
            classroomsMap,
            coursesMap,
            options
          );
          if (domainSize === 0) {
            forwardCheckingPassed = false;
            break;
          }
        }

        if (!forwardCheckingPassed) {
          // Revert primary block placement
          for (const ps of placedSlots) {
            currentSchedule[classId][ps.d][ps.p] = null;
            const placedSlot = {
              assignmentId: block.assignment.id,
              courseId: block.assignment.courseId,
              teacherId: block.assignment.teacherId,
              classroomId: block.assignment.classroomId
            };
            clearOccupancy(classId, ps.d, ps.p, placedSlot, currentTeacherOccupancy, currentClassroomOccupancy);
          }
          // Revert ejected conflicts
          for (const backup of backupEjected) {
            currentSchedule[backup.classId][backup.d][backup.p] = backup.slot;
            registerOccupancy(backup.classId, backup.d, backup.p, backup.slot, currentTeacherOccupancy, currentClassroomOccupancy);
          }
          // Decrement ejection counts
          for (const backup of backupEjected) {
            const aid = backup.slot.assignmentId;
            const currentCount = ejectionCounts.get(aid) || 0;
            if (currentCount > 0) {
              ejectionCounts.set(aid, currentCount - 1);
            }
          }
          continue; // Move to next candidate
        }

        const res = await solveStateSpace(remainingBlocks, depth + (conflicts.length > 0 ? 1 : 0));
        if (res.success) {
          return { success: true };
        }

        // Merge child conflicts
        if (res.conflictAssignmentIds) {
          for (const id of res.conflictAssignmentIds) {
            combinedConflicts.add(id);
          }
        }

        // Decrement ejection counts on backtrack
        for (const backup of backupEjected) {
          const aid = backup.slot.assignmentId;
          const currentCount = ejectionCounts.get(aid) || 1;
          if (currentCount <= 1) {
            ejectionCounts.delete(aid);
          } else {
            ejectionCounts.set(aid, currentCount - 1);
          }
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

        // CBJ Jump-Back Check:
        // If our block's assignment ID is NOT in the child's conflict set,
        // then changing our placement will NOT resolve the conflict. We can jump back immediately!
        if (res.conflictAssignmentIds && !res.conflictAssignmentIds.has(block.assignment.id)) {
          break; // Jump back! Skip remaining candidates at this level.
        }
      }
    
      // Ejected blocks MUST never be skipped, because skipping them would mean we permanently lost a previously placed lesson,
      // which results in a net-negative or neutral-negative gain. They must be successfully placed,
      // otherwise we must backtrack to restore them to their original positions.
      const canSkip = block.isEjected !== true;

      if (canSkip) {
        // Pas Geçme (Skip): Sadece daha önceden yerleşmiş (isEjected) olmayan dersler veya agresif modda hedef dışı çıkarılanlar geçilebilir.
        const res = await solveStateSpace(blocksSlice1, depth);
        if (res.success) {
          return { success: true };
        }
        if (res.conflictAssignmentIds) {
          for (const id of res.conflictAssignmentIds) {
            combinedConflicts.add(id);
          }
        }
      }

      // --- RECURSIVE CROSS-CLASS CHAIN SHIFTING AND SWAPPING FALLBACK ---
      if (depth < maxBacktrackDepth) {
        for (let d_target = 0; d_target < numDays; d_target++) {
          if (classObj.unavailability[d_target]?.every(p => p === true)) continue;

          for (let p_target = 0; p_target <= numPeriods - block.size; p_target++) {
            let isPhysicallyPossible = true;
            for (let offset = 0; offset < block.size; offset++) {
              const currP = p_target + offset;
              if (classObj.unavailability[d_target]?.[currP] === true) {
                isPhysicallyPossible = false;
                break;
              }
            }
            if (!isPhysicallyPossible) continue;

            const preShiftSchedule = cloneSchedule(currentSchedule);
            const preShiftTeacher = cloneOccupancy(currentTeacherOccupancy, numDays);
            const preShiftClassroom = cloneOccupancy(currentClassroomOccupancy, numDays);

            const success = await tryChainShiftRecursive(
              block.assignment.id,
              d_target,
              p_target,
              new Set(),
              1,
              4
            );

            if (success) {
              const res = await solveStateSpace(blocksSlice1, depth + 1);
              if (res.success) {
                return { success: true };
              }

              for (const cId of Object.keys(currentSchedule)) {
                for (let d = 0; d < numDays; d++) {
                  currentSchedule[cId][d] = [...preShiftSchedule[cId][d]];
                }
              }
              for (const tId of Object.keys(currentTeacherOccupancy)) {
                for (let d = 0; d < numDays; d++) {
                  currentTeacherOccupancy[tId][d] = [...preShiftTeacher[tId][d]];
                }
              }
              for (const rId of Object.keys(currentClassroomOccupancy)) {
                for (let d = 0; d < numDays; d++) {
                  currentClassroomOccupancy[rId][d] = [...preShiftClassroom[rId][d]];
                }
              }
            }
          }
        }
      }
      // --- END RECURSIVE CROSS-CLASS CHAIN SHIFTING AND SWAPPING FALLBACK ---

      // Gather conflicts that prevent placing `block` (dead-end)
      const blockClassId = block.assignment.classId;
      const blockTeachers = block.assignment.teacherId ? parseTeacherIds(block.assignment.teacherId) : [];
      const blockClassroom = block.assignment.classroomId;
      
      // Collect direct conflicts
      for (let d = 0; d < numDays; d++) {
        for (let p = 0; p < numPeriods; p++) {
          const slot = currentSchedule[blockClassId]?.[d]?.[p];
          if (slot) {
            combinedConflicts.add(slot.assignmentId);
          }
          for (const tId of blockTeachers) {
            const occupiedByClassId = currentTeacherOccupancy[tId]?.[d]?.[p];
            if (occupiedByClassId && occupiedByClassId !== blockClassId) {
              const occSlot = currentSchedule[occupiedByClassId]?.[d]?.[p];
              if (occSlot) {
                combinedConflicts.add(occSlot.assignmentId);
              }
            }
          }
          if (blockClassroom) {
            const occupiedByClassId = currentClassroomOccupancy[blockClassroom]?.[d]?.[p];
            if (occupiedByClassId && occupiedByClassId !== blockClassId) {
              const occSlot = currentSchedule[occupiedByClassId]?.[d]?.[p];
              if (occSlot) {
                combinedConflicts.add(occSlot.assignmentId);
              }
            }
          }
        }
      }

      // Feature 5: Increment conflict weights for involved teachers and classes
      for (const tId of blockTeachers) {
        teacherConflictWeights.set(tId, (teacherConflictWeights.get(tId) || 0) + 1);
      }
      classConflictWeights.set(blockClassId, (classConflictWeights.get(blockClassId) || 0) + 1);

      return { success: false, conflictAssignmentIds: combinedConflicts };
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

      // 2. Select randomly to clear (higher ratio for targeted to allow enough restructuring)
      const clearRatio = isTargeted ? 0.35 : 0.10;
      const minClear = isTargeted ? 3 : 1;
      const numToClear = Math.max(minClear, Math.floor(placedSlotsList.length * clearRatio));
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

      // Calculate remainingDomainSize for all repair blocks
      const repairDomainSizes = new Map<string, number>();
      for (const b of allRepairBlocks) {
        const dSize = getRemainingDomainSize(
          b,
          repairSchedule,
          repairTeacherOccupancy,
          repairClassroomOccupancy,
          settings,
          teachersMap,
          classesMap,
          classroomsMap,
          coursesMap,
          options
        );
        repairDomainSizes.set(b.id, dSize);
      }

      // Sort repair blocks with MCV (Most Constrained Variable) priority
      allRepairBlocks.sort((a, b) => {
        if (options?.priorityAssignmentIds) {
          const isPriA = options.priorityAssignmentIds.includes(a.assignment.id);
          const isPriB = options.priorityAssignmentIds.includes(b.assignment.id);
          if (isPriA !== isPriB) {
            return isPriA ? -1 : 1;
          }
        }

        // Priority 1: Dynamic conflict weights (Adaptive Constraint Weights) - higher weight placed first
        const weightA = getConflictWeightScore(a);
        const weightB = getConflictWeightScore(b);
        if (weightA !== weightB) {
          return weightB - weightA;
        }

        // Priority 1.5: Soft Tier priority (Tier 1 < Tier 2 < Tier 3) - to try important/teacher blocks first
        const tierA = getBlockTier(a, coursesMap);
        const tierB = getBlockTier(b, coursesMap);
        if (tierA !== tierB) {
          return tierA - tierB;
        }

        // Priority 2: Remaining domain size (MCV / MRV Heuristic) - less is placed first
        const sizeA = repairDomainSizes.get(a.id) ?? 999;
        const sizeB = repairDomainSizes.get(b.id) ?? 999;
        if (sizeA !== sizeB) {
          return sizeA - sizeB;
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
        return random() - 0.5;
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
      const repairRes = await solveStateSpace(allRepairBlocks, 0);
      return repairRes.success;
    };

    let backtrackingSolved = false;
    const stagnationIterations = totalIterations - lastImprovementIteration;
    const lnsTriggerStagnation = isTargeted ? 8 : 15;
    const isStuck = totalIterations > lnsTriggerStagnation && stagnationIterations > lnsTriggerStagnation;

    // Use step-by-step only if explicitly requested, to ensure we run a joint unified solution by default.
    const isFirstStepByStep = options?.stepByStep === true && !isTargeted && restartCount === 0;
    
    // If we have some unplaced hours and we are on subsequent trials, run LNS Repair!
    const shouldRunLns = bestGlobalUnplacedHours > 0 && restartCount > 0;

    if (isFirstStepByStep) {
      lockedAssignmentIds.clear();

      const tier1 = randomizedBlocks.filter(b => getBlockTier(b, coursesMap) === 1);
      const tier2 = randomizedBlocks.filter(b => getBlockTier(b, coursesMap) === 2);
      const tier3 = randomizedBlocks.filter(b => getBlockTier(b, coursesMap) === 3);

      let t1Success = true;
      if (tier1.length > 0) {
        t1Success = (await solveStateSpace(tier1, 0)).success;
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
        t2Success = (await solveStateSpace(tier2, 0)).success;
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
        t3Success = (await solveStateSpace(tier3, 0)).success;
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
    } else if (shouldRunLns) {
      // LNS Repair mode: works directly on bestGlobalSchedule
      if (isStuck || consecutiveLnsRepairsWithoutImprovement >= 4) {
        // Reset search area: run a full randomized global trial (without locks) to escape local minimum
        consecutiveLnsRepairsWithoutImprovement = 0;
        
        self.postMessage({
          type: "progress",
          progress: {
            phase: "backtracking",
            percent: 85,
            message: `Tıkanma çözülüyor... Alternatif çözüm uzayı taranıyor (Yeniden başlatma: ${restartCount})`,
            steps: totalIterations,
            elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
            bestSchedule: bestGlobalSchedule
          }
        });
        
        backtrackingSolved = (await solveStateSpace(randomizedBlocks, 0)).success;
      } else {
        consecutiveLnsRepairsWithoutImprovement++;
        
        self.postMessage({
          type: "progress",
          progress: {
            phase: "backtracking",
            percent: 90,
            message: `LNS Onarım (Repair) aktif: En iyi yerleşim korunarak kalan ${bestGlobalUnplacedHours} ders saati yerleştirilmeye çalışılıyor... (Yeniden Başlatma: ${restartCount})`,
            steps: totalIterations,
            elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
            bestSchedule: bestGlobalSchedule
          }
        });
        
        backtrackingSolved = await runLnsRepair();
      }
    } else {
      // Default / Standard Global Backtracking (for first targeted runs or if stepByStep is disabled)
      backtrackingSolved = (await solveStateSpace(randomizedBlocks, 0)).success;
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

    let isIdempotentValid = true;
    for (const assign of assignments) {
      const initial = scheduledHoursCount[assign.id] || 0;
      const current = scheduledHoursInThisTrial[assign.id] || 0;
      if (current < initial) {
        isIdempotentValid = false;
        break;
      }
    }

    // Evaluate trial success
    if (isIdempotentValid && (unplacedHoursThisTrial < bestGlobalUnplacedHours || (unplacedHoursThisTrial === bestGlobalUnplacedHours && softPenaltyThisTrial < bestGlobalPenalty))) {
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
    if (unplacedHoursThisTrial === 0 && !isTargeted) {
      // Öneri 2: Adaptif Başlangıç Sıcaklığı ve Yavaş Soğutma (Adaptive Temperature Scaling & Slower Cooling)
      // Sıcaklığı başlangıçtaki ceza puanına göre ölçekliyoruz, böylece büyük kısıt ihlalleri varsa SA daha geniş arama yapabilir.
      let temp = Math.max(120.0, softPenaltyThisTrial * 0.15);
      const coolingRate = 0.9985; // Daha hassas bir arama için soğuma hızını hafifçe yavaşlatıyoruz
      const maxSAIterations = 2500; // İyileştirme kapasitesini artırmak için iterasyon sınırını yükseltiyoruz

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

        const randClass = classes[Math.floor(random() * classes.length)];
        const d1 = Math.floor(random() * numDays);
        const p1 = Math.floor(random() * numPeriods);
        const d2 = Math.floor(random() * numDays);
        const p2 = Math.floor(random() * numPeriods);

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

              const currentPenalty = calculateScheduleScore(currentSchedule, state, teachersMap, classesMap, classroomsMap, coursesMap);

              // --- ONE-STEP LOOK-AHEAD FOR SIMULATED ANNEALING ---
              // Sınıf ve öğretmen boşluklarını (öneri 3) daha iyi optimize edebilmek için 1 adım sonrasını tarıyoruz.
              let bestLookAheadPenalty = currentPenalty;
              let bestLookAheadSwap: { d3: number; p3: number; d4: number; p4: number; classId: string } | null = null;

              for (let la = 0; la < 5; la++) {
                const laClass = classes[Math.floor(random() * classes.length)];
                const d3 = Math.floor(random() * numDays);
                const p3 = Math.floor(random() * numPeriods);
                const d4 = Math.floor(random() * numDays);
                const p4 = Math.floor(random() * numPeriods);
                if (d3 === d4 && p3 === p4) continue;

                const slot3 = currentSchedule[laClass.id]?.[d3]?.[p3] || null;
                const slot4 = currentSchedule[laClass.id]?.[d4]?.[p4] || null;

                if ((slot3 && isSlotLocked(slot3, coursesMap)) || (slot4 && isSlotLocked(slot4, coursesMap))) continue;

                if (slot3) clearOccupancy(laClass.id, d3, p3, slot3, currentTeacherOccupancy, currentClassroomOccupancy);
                if (slot4) clearOccupancy(laClass.id, d4, p4, slot4, currentTeacherOccupancy, currentClassroomOccupancy);

                currentSchedule[laClass.id][d3][p3] = slot4;
                currentSchedule[laClass.id][d4][p4] = slot3;

                let laValid3 = true;
                if (slot3) {
                  const assign3 = assignments.find(a => a.id === slot3.assignmentId);
                  if (assign3) {
                    laValid3 = isPlacementValidEx(state, teachersMap, classesMap, classroomsMap, currentSchedule, currentTeacherOccupancy, currentClassroomOccupancy, assign3, d4, p4, 1, laClass.id);
                  }
                }
                let laValid4 = true;
                if (slot4) {
                  const assign4 = assignments.find(a => a.id === slot4.assignmentId);
                  if (assign4) {
                    laValid4 = isPlacementValidEx(state, teachersMap, classesMap, classroomsMap, currentSchedule, currentTeacherOccupancy, currentClassroomOccupancy, assign4, d3, p3, 1, laClass.id);
                  }
                }

                if (laValid3 && laValid4) {
                  if (slot3) registerOccupancy(laClass.id, d4, p4, slot3, currentTeacherOccupancy, currentClassroomOccupancy);
                  if (slot4) registerOccupancy(laClass.id, d3, p3, slot4, currentTeacherOccupancy, currentClassroomOccupancy);

                  const laPenalty = calculateScheduleScore(currentSchedule, state, teachersMap, classesMap, classroomsMap, coursesMap);
                  if (laPenalty < bestLookAheadPenalty) {
                    bestLookAheadPenalty = laPenalty;
                    bestLookAheadSwap = { d3, p3, d4, p4, classId: laClass.id };
                  }

                  if (slot3) clearOccupancy(laClass.id, d4, p4, slot3, currentTeacherOccupancy, currentClassroomOccupancy);
                  if (slot4) clearOccupancy(laClass.id, d3, p3, slot4, currentTeacherOccupancy, currentClassroomOccupancy);
                }

                currentSchedule[laClass.id][d3][p3] = slot3;
                currentSchedule[laClass.id][d4][p4] = slot4;

                if (slot3) registerOccupancy(laClass.id, d3, p3, slot3, currentTeacherOccupancy, currentClassroomOccupancy);
                if (slot4) registerOccupancy(laClass.id, d4, p4, slot4, currentTeacherOccupancy, currentClassroomOccupancy);
              }

              const targetPenalty = bestLookAheadSwap ? bestLookAheadPenalty : currentPenalty;
              const delta = targetPenalty - softPenaltyThisTrial;

              if (delta <= 0 || random() < Math.exp(-delta / temp)) {
                // Accept the original move, and if we found an even better look-ahead, apply that too!
                if (bestLookAheadSwap) {
                  const { d3, p3, d4, p4, classId: laId } = bestLookAheadSwap;
                  const slot3 = currentSchedule[laId][d3][p3];
                  const slot4 = currentSchedule[laId][d4][p4];

                  if (slot3) clearOccupancy(laId, d3, p3, slot3, currentTeacherOccupancy, currentClassroomOccupancy);
                  if (slot4) clearOccupancy(laId, d4, p4, slot4, currentTeacherOccupancy, currentClassroomOccupancy);

                  currentSchedule[laId][d3][p3] = slot4;
                  currentSchedule[laId][d4][p4] = slot3;

                  if (slot3) registerOccupancy(laId, d4, p4, slot3, currentTeacherOccupancy, currentClassroomOccupancy);
                  if (slot4) registerOccupancy(laId, d3, p3, slot4, currentTeacherOccupancy, currentClassroomOccupancy);
                }

                softPenaltyThisTrial = targetPenalty;
                if (targetPenalty < bestGlobalPenalty) {
                  bestGlobalPenalty = targetPenalty;
                  bestGlobalSchedule = cloneSchedule(currentSchedule);
                }
              } else {
                // Reject and revert original swap
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

    // 4.5. Tabu Search Optimization Pass for Gap and Distribution
    if (unplacedHoursThisTrial === 0 && !isTargeted) {
      const maxTabuIterations = 1500;
      let tabuSchedule = cloneSchedule(currentSchedule);
      let tabuPenalty = softPenaltyThisTrial;
      let bestTabuSchedule = cloneSchedule(currentSchedule);
      let bestTabuPenalty = softPenaltyThisTrial;

      // Tabu list structure: Key: `${classId}-${d1}-${p1}-${d2}-${p2}`, Value: expiration iteration
      const tabuMoves = new Map<string, number>();
      
      // Öneri 2: Dinamik Tabu Sürgüsü (Adaptive Tabu Tenure)
      // Tabu listesi süresini okul büyüklüğüne (sınıf sayısına) göre dinamik olarak ölçekliyoruz.
      // Bu sayede küçük okullarda gereksiz kilitlenmeler önlenirken büyük okullarda döngüye girme (cycling) engellenir.
      const tabuTenure = Math.max(12, Math.floor(classes.length * 0.6));

      for (let iter = 0; iter < maxTabuIterations && !stopped; iter++) {
        if (iter % 150 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          const totalHours = blocksToPlace.reduce((sum, b) => sum + b.size, 0);

          self.postMessage({
            type: "progress",
            progress: {
              phase: "optimizing",
              percent: 100,
              message: `Program Tabu Arama ile optimize ediliyor... (Tabu adımı ${iter}/${maxTabuIterations})`,
              steps: totalIterations * 1000 + 5000 + iter,
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

        // Generate neighborhood: evaluate multiple random swap candidates for classes
        // To make it "maksimum derin", we sample 20 potential moves and pick the best non-tabu or aspirational one.
        let bestMove: {
          classId: string;
          d1: number;
          p1: number;
          d2: number;
          p2: number;
          slot1: ScheduleSlot | null;
          slot2: ScheduleSlot | null;
          newPenalty: number;
          key: string;
          lookAheadSwap?: { d3: number; p3: number; d4: number; p4: number; classId: string };
        } | null = null;

        const candidateMovesCount = 20; // High neighborhood sample rate for deep search!
        for (let c = 0; c < candidateMovesCount; c++) {
          const randClass = classes[Math.floor(random() * classes.length)];
          const d1 = Math.floor(random() * numDays);
          const p1 = Math.floor(random() * numPeriods);
          const d2 = Math.floor(random() * numDays);
          const p2 = Math.floor(random() * numPeriods);

          if (d1 === d2 && p1 === p2) continue;

          const slot1 = tabuSchedule[randClass.id]?.[d1]?.[p1] || null;
          const slot2 = tabuSchedule[randClass.id]?.[d2]?.[p2] || null;

          const isLocked1 = slot1 && isSlotLocked(slot1, coursesMap);
          const isLocked2 = slot2 && isSlotLocked(slot2, coursesMap);

          if (isLocked1 || isLocked2) continue;

          // Temporary swap to evaluate feasibility and score
          if (slot1) clearOccupancy(randClass.id, d1, p1, slot1, currentTeacherOccupancy, currentClassroomOccupancy);
          if (slot2) clearOccupancy(randClass.id, d2, p2, slot2, currentTeacherOccupancy, currentClassroomOccupancy);

          tabuSchedule[randClass.id][d1][p1] = slot2;
          tabuSchedule[randClass.id][d2][p2] = slot1;

          let valid1 = true;
          if (slot1) {
            const assign1 = assignments.find(a => a.id === slot1.assignmentId);
            if (assign1) {
              valid1 = isPlacementValidEx(state, teachersMap, classesMap, classroomsMap, tabuSchedule, currentTeacherOccupancy, currentClassroomOccupancy, assign1, d2, p2, 1, randClass.id);
            }
          }

          let valid2 = true;
          if (slot2) {
            const assign2 = assignments.find(a => a.id === slot2.assignmentId);
            if (assign2) {
              valid2 = isPlacementValidEx(state, teachersMap, classesMap, classroomsMap, tabuSchedule, currentTeacherOccupancy, currentClassroomOccupancy, assign2, d1, p1, 1, randClass.id);
            }
          }

          if (valid1 && valid2) {
            if (slot1) registerOccupancy(randClass.id, d2, p2, slot1, currentTeacherOccupancy, currentClassroomOccupancy);
            if (slot2) registerOccupancy(randClass.id, d1, p1, slot2, currentTeacherOccupancy, currentClassroomOccupancy);

            const score = calculateScheduleScore(tabuSchedule, state, teachersMap, classesMap, classroomsMap, coursesMap);

            // --- ONE-STEP LOOK-AHEAD FOR TABU SEARCH ---
            // Benzetilmiş tavlamadaki gibi, boşluk optimizasyonunu daha ileriye götürmek için 1 adım ileri tarıyoruz
            let bestLaScore = score;
            let bestLaMove: { d3: number; p3: number; d4: number; p4: number; classId: string } | null = null;

            for (let la = 0; la < 5; la++) {
              const laClass = classes[Math.floor(random() * classes.length)];
              const d3 = Math.floor(random() * numDays);
              const p3 = Math.floor(random() * numPeriods);
              const d4 = Math.floor(random() * numDays);
              const p4 = Math.floor(random() * numPeriods);
              if (d3 === d4 && p3 === p4) continue;

              const slot3 = tabuSchedule[laClass.id]?.[d3]?.[p3] || null;
              const slot4 = tabuSchedule[laClass.id]?.[d4]?.[p4] || null;

              if ((slot3 && isSlotLocked(slot3, coursesMap)) || (slot4 && isSlotLocked(slot4, coursesMap))) continue;

              if (slot3) clearOccupancy(laClass.id, d3, p3, slot3, currentTeacherOccupancy, currentClassroomOccupancy);
              if (slot4) clearOccupancy(laClass.id, d4, p4, slot4, currentTeacherOccupancy, currentClassroomOccupancy);

              tabuSchedule[laClass.id][d3][p3] = slot4;
              tabuSchedule[laClass.id][d4][p4] = slot3;

              let laValid3 = true;
              if (slot3) {
                const assign3 = assignments.find(a => a.id === slot3.assignmentId);
                if (assign3) {
                  laValid3 = isPlacementValidEx(state, teachersMap, classesMap, classroomsMap, tabuSchedule, currentTeacherOccupancy, currentClassroomOccupancy, assign3, d4, p4, 1, laClass.id);
                }
              }
              let laValid4 = true;
              if (slot4) {
                const assign4 = assignments.find(a => a.id === slot4.assignmentId);
                if (assign4) {
                  laValid4 = isPlacementValidEx(state, teachersMap, classesMap, classroomsMap, tabuSchedule, currentTeacherOccupancy, currentClassroomOccupancy, assign4, d3, p3, 1, laClass.id);
                }
              }

              if (laValid3 && laValid4) {
                if (slot3) registerOccupancy(laClass.id, d4, p4, slot3, currentTeacherOccupancy, currentClassroomOccupancy);
                if (slot4) registerOccupancy(laClass.id, d3, p3, slot4, currentTeacherOccupancy, currentClassroomOccupancy);

                const laPenalty = calculateScheduleScore(tabuSchedule, state, teachersMap, classesMap, classroomsMap, coursesMap);
                if (laPenalty < bestLaScore) {
                  bestLaScore = laPenalty;
                  bestLaMove = { d3, p3, d4, p4, classId: laClass.id };
                }

                if (slot3) clearOccupancy(laClass.id, d4, p4, slot3, currentTeacherOccupancy, currentClassroomOccupancy);
                if (slot4) clearOccupancy(laClass.id, d3, p3, slot4, currentTeacherOccupancy, currentClassroomOccupancy);
              }

              tabuSchedule[laClass.id][d3][p3] = slot3;
              tabuSchedule[laClass.id][d4][p4] = slot4;

              if (slot3) registerOccupancy(laClass.id, d3, p3, slot3, currentTeacherOccupancy, currentClassroomOccupancy);
              if (slot4) registerOccupancy(laClass.id, d4, p4, slot4, currentTeacherOccupancy, currentClassroomOccupancy);
            }

            const finalScore = bestLaMove ? bestLaScore : score;
            const moveKey = `${randClass.id}-${Math.min(d1, d2)}-${Math.min(p1, p2)}-${Math.max(d1, d2)}-${Math.max(p1, p2)}`;

            let isMoveTabu = false;
            const expireIter = tabuMoves.get(moveKey);
            if (expireIter !== undefined && iter < expireIter) {
              isMoveTabu = true;
            }

            // Aspiration Criterion: accept tabu if it's better than bestTabuPenalty
            const isAspirational = finalScore < bestTabuPenalty;

            // If we find a move, compare with our current best candidate in this neighborhood search
            if (!isMoveTabu || isAspirational) {
              if (bestMove === null || finalScore < bestMove.newPenalty) {
                bestMove = {
                  classId: randClass.id,
                  d1,
                  p1,
                  d2,
                  p2,
                  slot1,
                  slot2,
                  newPenalty: finalScore,
                  key: moveKey,
                  lookAheadSwap: bestLaMove || undefined
                };
              }
            }

            // Revert temporary swap and occupancy for next candidate evaluation
            if (slot1) clearOccupancy(randClass.id, d2, p2, slot1, currentTeacherOccupancy, currentClassroomOccupancy);
            if (slot2) clearOccupancy(randClass.id, d1, p1, slot2, currentTeacherOccupancy, currentClassroomOccupancy);
          }

          // Restore occupancy to previous tabuSchedule state
          if (slot1) registerOccupancy(randClass.id, d1, p1, slot1, currentTeacherOccupancy, currentClassroomOccupancy);
          if (slot2) registerOccupancy(randClass.id, d2, p2, slot2, currentTeacherOccupancy, currentClassroomOccupancy);

          tabuSchedule[randClass.id][d1][p1] = slot1;
          tabuSchedule[randClass.id][d2][p2] = slot2;
        }

        // Apply the best found move (even if it makes penalty worse, allowing local-minimum escape!)
        if (bestMove !== null) {
          const { classId, d1, p1, d2, p2, slot1, slot2, newPenalty, key, lookAheadSwap } = bestMove;

          // Perform the actual swap in tabuSchedule
          if (slot1) clearOccupancy(classId, d1, p1, slot1, currentTeacherOccupancy, currentClassroomOccupancy);
          if (slot2) clearOccupancy(classId, d2, p2, slot2, currentTeacherOccupancy, currentClassroomOccupancy);

          tabuSchedule[classId][d1][p1] = slot2;
          tabuSchedule[classId][d2][p2] = slot1;

          if (slot1) registerOccupancy(classId, d2, p2, slot1, currentTeacherOccupancy, currentClassroomOccupancy);
          if (slot2) registerOccupancy(classId, d1, p1, slot2, currentTeacherOccupancy, currentClassroomOccupancy);

          // Apply lookAheadSwap if present
          if (lookAheadSwap) {
            const { d3, p3, d4, p4, classId: laId } = lookAheadSwap;
            const slot3 = tabuSchedule[laId][d3][p3];
            const slot4 = tabuSchedule[laId][d4][p4];

            if (slot3) clearOccupancy(laId, d3, p3, slot3, currentTeacherOccupancy, currentClassroomOccupancy);
            if (slot4) clearOccupancy(laId, d4, p4, slot4, currentTeacherOccupancy, currentClassroomOccupancy);

            tabuSchedule[laId][d3][p3] = slot4;
            tabuSchedule[laId][d4][p4] = slot3;

            if (slot3) registerOccupancy(laId, d4, p4, slot3, currentTeacherOccupancy, currentClassroomOccupancy);
            if (slot4) registerOccupancy(laId, d3, p3, slot4, currentTeacherOccupancy, currentClassroomOccupancy);
          }

          tabuPenalty = newPenalty;

          // Update tabu list with tenure expiration
          tabuMoves.set(key, iter + tabuTenure);

          // Update best-seen states
          if (tabuPenalty < bestTabuPenalty) {
            bestTabuPenalty = tabuPenalty;
            bestTabuSchedule = cloneSchedule(tabuSchedule);

            if (tabuPenalty < bestGlobalPenalty) {
              bestGlobalPenalty = tabuPenalty;
              bestGlobalSchedule = cloneSchedule(tabuSchedule);
            }
          }
        }
      }

      // Apply the absolute best tabu search result back to currentSchedule and update occupancies
      currentSchedule = cloneSchedule(bestTabuSchedule);
      softPenaltyThisTrial = bestTabuPenalty;

      // Re-initialize occupancies for this final best schedule
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
    }

    // Increments restartCount on every trial to scale backtracking depth/steps dynamically
    restartCount++;

    // If we successfully placed all lessons (0 unplaced hours), break immediately to finish and close the progress overlay!
    if (bestGlobalUnplacedHours === 0 && !options?.exhaustiveMode) {
      break;
    }

    // Stop and return the best schedule found if we reach the trials or duration limit
    if (restartCount >= maxRestarts || (Date.now() - startTime) >= maxDurationMs) {
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
      usedSeed: activeSeed,
      message: bestGlobalUnplacedHours === 0
        ? "Tüm dersler başarıyla yerleştirildi, motor kendiliğinden durdu!"
        : `Ders programı yerleştirildi ancak ${bestGlobalUnplacedHours} ders saati yerleştirilemedi.`,
      unplacedDetails: bestGlobalUnplaced.map(b => `${classesMap.get(b.assignment.classId)?.name || b.assignment.classId} sınıfının ${b.size} saatlik dersi yerleştirilemedi.`)
    }
  });
};

