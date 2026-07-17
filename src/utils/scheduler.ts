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
  Course,
  UnavailabilityMap
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
  targetTeacherName?: string;
  targetClassName?: string;
}

export function parseTeacherIds(teacherIdStr: string | null | undefined): string[] {
  if (!teacherIdStr) return [];
  return teacherIdStr
    .split(/[\s,;]+/)
    .map(id => id.trim())
    .filter(Boolean);
}

export function isChefOrCoordinatorCourse(courseName: string, courseCode: string): boolean {
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

export function isGeneralCultureCourse(courseName: string, courseCode: string): boolean {
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

export function getDefaultMaxDepth(teacherCount: number): number {
  if (teacherCount < 20) return 8;
  if (teacherCount < 50) return 15;
  return 25;
}

/**
 * Validates the entire schedule and returns a list of all conflicts found.
 */
export function detectConflicts(state: AppState): ConflictInfo[] {
  const conflicts: ConflictInfo[] = [];
  const { settings, teachers, classes, classrooms, assignments, schedule } = state;
  const numDays = settings.days.length;
  const numPeriods = settings.periodsPerDay;

  const teacherOccupancy: { [key: string]: string } = {};
  const classroomOccupancy: { [key: string]: string } = {};

  const teacherMap = new Map<string, Teacher>(teachers.map(t => [t.id, t]));
  const classMap = new Map<string, GradeClass>(classes.map(c => [c.id, c]));
  const classroomMap = new Map<string, Classroom>(classrooms.map(r => [r.id, r]));
  const assignmentMap = new Map<string, LessonAssignment>(assignments.map(a => [a.id, a]));
  const courseMap = new Map<string, Course>(state.courses.map(c => [c.id, c]));

  const scheduledHoursCount: { [assignmentId: string]: number } = {};

  for (const classId of Object.keys(schedule)) {
    const classSchedules = schedule[classId];
    if (!classSchedules) continue;

    for (let d = 0; d < numDays; d++) {
      const daySchedule = classSchedules[d];
      if (!daySchedule) continue;

      for (let p = 0; p < numPeriods; p++) {
        const slot = daySchedule[p];
        if (!slot) continue;

        const assignment = assignmentMap.get(slot.assignmentId);
        if (!assignment) continue;

        const gClass = classMap.get(classId);
        const room = slot.classroomId ? classroomMap.get(slot.classroomId) : null;

        scheduledHoursCount[slot.assignmentId] = (scheduledHoursCount[slot.assignmentId] || 0) + 1;

        if (gClass?.unavailability[d]?.[p]) {
          conflicts.push({
            type: "class_unavailable",
            message: `"${gClass.name}" sınıfının bu saat kısıtlaması (kilitli) var! (${settings.days[d]}, Saat: ${p + 1})`,
            dayIndex: d,
            periodIndex: p,
            details: { classId, courseId: slot.courseId }
          });
        }

        if (slot.teacherId) {
          const teacherIds = parseTeacherIds(slot.teacherId);
          for (const tId of teacherIds) {
            const teacher = teacherMap.get(tId);
            if (teacher?.unavailability[d]?.[p]) {
              conflicts.push({
                type: "teacher_unavailable",
                message: `"${teacher.name}" öğretmeni bu saatte müsait değil (kısıtlamalı)! (${settings.days[d]}, Saat: ${p + 1})`,
                dayIndex: d,
                periodIndex: p,
                details: { classId, teacherId: tId, courseId: slot.courseId }
              });
            }
          }
        }

        if (room && room.unavailability[d]?.[p]) {
          conflicts.push({
            type: "classroom_unavailable",
            message: `"${room.name}" atölyesi/laboratuvarı bu saatte kilitli! (${settings.days[d]}, Saat: ${p + 1})`,
            dayIndex: d,
            periodIndex: p,
            details: { classId, classroomId: slot.classroomId || undefined, courseId: slot.courseId }
          });
        }

        if (slot.teacherId) {
          const teacherIds = parseTeacherIds(slot.teacherId);
          for (const tId of teacherIds) {
            const teacherKey = `${tId}-${d}-${p}`;
            if (teacherOccupancy[teacherKey]) {
              const conflictingClassId = teacherOccupancy[teacherKey];
              const conflictingClass = classMap.get(conflictingClassId);
              const teacher = teacherMap.get(tId);
              conflicts.push({
                type: "teacher_overlap",
                message: `"${teacher?.name || "Öğretmen"}" aynı saatte birden fazla sınıfta ders veriyor! (${gClass?.name} ve ${conflictingClass?.name || conflictingClassId})`,
                dayIndex: d,
                periodIndex: p,
                details: { classId, teacherId: tId, courseId: slot.courseId }
              });
            } else {
              teacherOccupancy[teacherKey] = classId;
            }
          }
        }

        if (slot.classroomId) {
          const roomKey = `${slot.classroomId}-${d}-${p}`;
          if (classroomOccupancy[roomKey]) {
            const conflictingClassId = classroomOccupancy[roomKey];
            const conflictingClass = classMap.get(conflictingClassId);
            conflicts.push({
              type: "classroom_overlap",
              message: `"${room?.name || "Atölye"}" atölyesi aynı saatte birden fazla sınıf (${gClass?.name} ve ${conflictingClass?.name || conflictingClassId}) tarafından kullanılıyor!`,
              dayIndex: d,
              periodIndex: p,
              details: { classId, classroomId: slot.classroomId, courseId: slot.courseId }
            });
          } else {
            classroomOccupancy[roomKey] = classId;
          }
        }
      }
    }
  }

  for (const assignment of assignments) {
    const scheduled = scheduledHoursCount[assignment.id] || 0;
    if (scheduled > assignment.weeklyHours) {
      const gClass = classMap.get(assignment.classId);
      const course = courseMap.get(assignment.courseId);
      conflicts.push({
        type: "excess_hours",
        message: `"${gClass?.name || "Sınıf"}" için "${course?.name || "Ders"}" planlanan saat (${scheduled} saat), haftalık atanan saati (${assignment.weeklyHours} saat) aşıyor!`,
        dayIndex: -1,
        periodIndex: -1,
        details: { classId: assignment.classId, courseId: assignment.courseId }
      });
    }
  }

  return conflicts;
}

export function getTeacherGapsForDay(
  schedule: ClassScheduleMap,
  teacherId: string,
  dayIndex: number,
  numPeriods: number
): number {
  const teacherIds = parseTeacherIds(teacherId);
  let maxGaps = 0;
  
  for (const tId of teacherIds) {
    const activePeriods = new Set<number>();
    for (const cId of Object.keys(schedule)) {
      const classSched = schedule[cId];
      if (!classSched) continue;
      const daySlots = classSched[dayIndex];
      if (!daySlots) continue;
      for (let p = 0; p < numPeriods; p++) {
        const slot = daySlots[p];
        if (slot && slot.teacherId) {
          const slotTIds = parseTeacherIds(slot.teacherId);
          if (slotTIds.includes(tId)) {
            activePeriods.add(p);
          }
        }
      }
    }
    
    if (activePeriods.size < 2) continue;
    
    const minP = Math.min(...activePeriods);
    const maxP = Math.max(...activePeriods);
    let gapsCount = 0;
    for (let p = minP; p <= maxP; p++) {
      if (!activePeriods.has(p)) {
        gapsCount++;
      }
    }
    maxGaps = Math.max(maxGaps, gapsCount);
  }
  return maxGaps;
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
    // (SA moves explicitly clear targeted cells beforehand)
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

export interface FeasibilityIssue {
  type: "error" | "warning";
  entityType: "teacher" | "class" | "classroom";
  entityName: string;
  assignedHours: number;
  availableHours: number;
  message: string;
}

export function preSolveFeasibilityCheck(state: AppState): FeasibilityIssue[] {
  const { settings, teachers, classes, classrooms, assignments } = state;
  const numDays = settings.days.length;
  const numPeriods = settings.periodsPerDay;
  const totalSlotsPerEntity = numDays * numPeriods;
  const issues: FeasibilityIssue[] = [];

  // Helper to count available slots for an entity
  const countAvailableSlots = (unavailability: UnavailabilityMap) => {
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

  // 1. Teacher Check
  teachers.forEach(t => {
    const teacherAssignments = assignments.filter(a => {
      if (!a.teacherId) return false;
      return a.teacherId.split(",").includes(t.id);
    });
    const totalHours = teacherAssignments.reduce((sum, a) => sum + a.weeklyHours, 0);
    const available = countAvailableSlots(t.unavailability);

    if (totalHours > available) {
      issues.push({
        type: "error",
        entityType: "teacher",
        entityName: t.name,
        assignedHours: totalHours,
        availableHours: available,
        message: `${t.name} öğretmeninin haftalık ${totalHours} saat dersi var ama sadece ${available} saat müsaitliği var — bu haliyle tam çözüm imkânsız.`
      });
    }
  });

  // 2. Class Check
  classes.forEach(c => {
    const classAssignments = assignments.filter(a => a.classId === c.id);
    const totalHours = classAssignments.reduce((sum, a) => sum + a.weeklyHours, 0);
    const available = countAvailableSlots(c.unavailability);

    if (totalHours > available) {
      issues.push({
        type: "error",
        entityType: "class",
        entityName: c.name,
        assignedHours: totalHours,
        availableHours: available,
        message: `${c.name} sınıfının haftalık ${totalHours} saat dersi var ama sadece ${available} saat müsaitliği var — bu haliyle tam çözüm imkânsız.`
      });
    }
  });

  // 3. Classroom Check
  classrooms.forEach(cr => {
    const classroomAssignments = assignments.filter(a => a.classroomId === cr.id);
    const totalHours = classroomAssignments.reduce((sum, a) => sum + a.weeklyHours, 0);
    const available = countAvailableSlots(cr.unavailability);

    if (totalHours > available) {
      issues.push({
        type: "error",
        entityType: "classroom",
        entityName: cr.name,
        assignedHours: totalHours,
        availableHours: available,
        message: `${cr.name} atölyesinin/dersliğinin haftalık ${totalHours} saatlik talebi var ama sadece ${available} saat müsaitliği var — bu haliyle tam çözüm imkânsız.`
      });
    }
  });

  return issues;
}

export interface ScheduleScoreBreakdown {
  teacherGapsPenalty: number;
  classGapsPenalty: number;
  distributionPenalty: number;
  balancePenalty: number;
  periodPriorityPenalty: number;
  totalPenalty: number;
}

/**
 * Evaluates the soft constraints for the current timetabling solution.
 * Penalizes empty gaps (pencereler), unbalanced workloads, bad course spread, and poorly timed heavy courses.
 */
export function calculateScheduleScore(
  schedule: ClassScheduleMap,
  state: AppState
): ScheduleScoreBreakdown {
  const { settings, teachers, classes, courses } = state;
  const numDays = settings.days.length;
  const numPeriods = settings.periodsPerDay;

  let teacherGapsPenalty = 0;
  let classGapsPenalty = 0;
  let distributionPenalty = 0;
  let balancePenalty = 0;
  let periodPriorityPenalty = 0;

  const teacherDayPeriods: { [tId: string]: { [day: number]: Set<number> } } = {};
  const classCourseDayPeriods: { [cId: string]: { [crsId: string]: { [day: number]: number[] } } } = {};

  const teacherDailyHours: { [tId: string]: number[] } = {};
  const classDailyHours: { [cId: string]: number[] } = {};

  teachers.forEach(t => {
    teacherDayPeriods[t.id] = {};
    teacherDailyHours[t.id] = Array(numDays).fill(0);
    for (let d = 0; d < numDays; d++) {
      teacherDayPeriods[t.id][d] = new Set<number>();
    }
  });

  classes.forEach(c => {
    classDailyHours[c.id] = Array(numDays).fill(0);
    classCourseDayPeriods[c.id] = {};
  });

  Object.keys(schedule).forEach(classId => {
    const classSched = schedule[classId];
    if (!classSched) return;

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
          tIds.forEach(tId => {
            if (teacherDayPeriods[tId]) {
              teacherDayPeriods[tId][d].add(p);
              teacherDailyHours[tId][d]++;
            }
          });
        }

        // Pedagogical priority is removed per user request: morning/afternoon timing does not affect scheduling value.
      }
    }
  });

  teachers.forEach(t => {
    for (let d = 0; d < numDays; d++) {
      const periods = teacherDayPeriods[t.id][d];
      if (periods.size >= 2) {
        const sorted = Array.from(periods).sort((a, b) => a - b);
        const minP = sorted[0];
        const maxP = sorted[sorted.length - 1];
        let gaps = 0;
        for (let p = minP; p <= maxP; p++) {
          if (!periods.has(p)) gaps++;
        }
        teacherGapsPenalty += gaps * 15;
      }
    }
  });

  classes.forEach(c => {
    const classSched = schedule[c.id];
    if (!classSched) return;

    for (let d = 0; d < numDays; d++) {
      const daySlots = classSched[d];
      if (!daySlots) continue;

      const activePeriods = new Set<number>();
      for (let p = 0; p < numPeriods; p++) {
        if (daySlots[p]) activePeriods.add(p);
      }

      if (activePeriods.size >= 2) {
        const sorted = Array.from(activePeriods).sort((a, b) => a - b);
        const minP = sorted[0];
        const maxP = sorted[sorted.length - 1];
        let gaps = 0;
        for (let p = minP; p <= maxP; p++) {
          if (!activePeriods.has(p)) gaps++;
        }
        classGapsPenalty += gaps * 10;
      }
    }
  });

  Object.keys(classCourseDayPeriods).forEach(classId => {
    const courseMap = classCourseDayPeriods[classId];
    Object.keys(courseMap).forEach(courseId => {
      const dayMap = courseMap[courseId];
      
      let daysWithCourse = 0;
      let totalLessons = 0;

      Object.keys(dayMap).forEach(dayKey => {
        const d = parseInt(dayKey);
        const periods = dayMap[d].sort((a, b) => a - b);
        daysWithCourse++;
        totalLessons += periods.length;

        if (periods.length >= 2) {
          for (let i = 0; i < periods.length - 1; i++) {
            if (periods[i + 1] - periods[i] > 1) {
              distributionPenalty += 25;
            }
          }
          if (periods.length > 2) {
            distributionPenalty += (periods.length - 2) * 20;
          }
        }
      });

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
    });
  });

  const calculateBalanceScore = (hours: number[]) => {
    const activeDays = hours.filter(h => h > 0);
    if (activeDays.length <= 1) return 0;
    const mean = activeDays.reduce((a, b) => a + b, 0) / activeDays.length;
    let sumOfDiffs = 0;
    activeDays.forEach(h => {
      sumOfDiffs += Math.abs(h - mean);
    });
    return sumOfDiffs * 12;
  };

  teachers.forEach(t => {
    balancePenalty += calculateBalanceScore(teacherDailyHours[t.id]);
  });

  classes.forEach(c => {
    balancePenalty += calculateBalanceScore(classDailyHours[c.id]);
  });

  const totalPenalty = teacherGapsPenalty + classGapsPenalty + distributionPenalty + balancePenalty + periodPriorityPenalty;

  return {
    teacherGapsPenalty,
    classGapsPenalty,
    distributionPenalty,
    balancePenalty,
    periodPriorityPenalty,
    totalPenalty
  };
}

interface BlockToPlace {
  assignment: LessonAssignment;
  size: number;
  id: string;
}

export interface SuggestionAction {
  type: "expand_teacher_availability" | "increase_quota" | "change_teacher" | "free_class_period";
  entityId: string;
  dayIndex?: number;
  periodIndex?: number;
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
  suggestions: {
    text: string;
    action?: SuggestionAction;
  }[];
}

/**
 * Generates highly descriptive reasons and 1-3 actionable suggestion options for unplaced assignments.
 */
export function diagnoseUnplacedAssignment(
  state: AppState,
  currentSchedule: ClassScheduleMap,
  assignment: LessonAssignment,
  blockSize: number
): { reason: string; suggestions: { text: string; action?: SuggestionAction }[] } {
  const { teachers, classes, classrooms, courses, settings } = state;
  const classObj = classes.find(c => c.id === assignment.classId);
  const courseObj = courses.find(c => c.id === assignment.courseId);
  const tIds = parseTeacherIds(assignment.teacherId);
  const teacherNames = tIds.map(id => teachers.find(t => t.id === id)?.name).filter(Boolean).join(", ");
  
  let reason = `"${classObj?.name || 'Sınıf'}" sınıfı ile "${teacherNames || 'Öğretmen'}" kısıtları çakışıyor.`;
  const suggestions: { text: string; action?: SuggestionAction }[] = [];

  const numDays = settings.days.length;
  const numPeriods = settings.periodsPerDay;

  // 1. Quota Check for Teacher
  for (const tId of tIds) {
    const teacherObj = teachers.find(t => t.id === tId);
    if (teacherObj) {
      let unavailableCount = 0;
      for (let d = 0; d < numDays; d++) {
        for (let p = 0; p < numPeriods; p++) {
          if (teacherObj.unavailability[d]?.[p]) {
            unavailableCount++;
          }
        }
      }
      const totalWeeklySlots = numDays * numPeriods;
      const maxPossibleHoursForTeacher = totalWeeklySlots - unavailableCount;
      
      let assignedHours = 0;
      state.assignments.forEach(as => {
        if (as.teacherId && parseTeacherIds(as.teacherId).includes(tId)) {
          assignedHours += as.weeklyHours;
        }
      });

      if (assignedHours > maxPossibleHoursForTeacher) {
        reason = `"${teacherObj.name}" öğretmeninin haftalık toplam ders yükü (${assignedHours} saat), öğretmenin müsait olduğu maksimum saat sınırını (${maxPossibleHoursForTeacher} saat) aşıyor!`;
        suggestions.push({
          text: `"${teacherObj.name}" öğretmenin kapalı saatlerinden en az ${assignedHours - maxPossibleHoursForTeacher} saati açarak (veya kısıtlarını azaltarak) kapasitesini artırabilirsiniz.`,
          action: { type: "expand_teacher_availability", entityId: tId }
        });
      }
    }
  }

  // 2. Class schedule full check
  if (classObj) {
    let filledSlots = 0;
    let unavailableSlots = 0;
    for (let d = 0; d < numDays; d++) {
      for (let p = 0; p < numPeriods; p++) {
        if (currentSchedule[classObj.id]?.[d]?.[p] !== null) {
          filledSlots++;
        } else if (classObj.unavailability[d]?.[p]) {
          unavailableSlots++;
        }
      }
    }
    const totalSlots = numDays * numPeriods;
    if (filledSlots + unavailableSlots >= totalSlots) {
      reason = `"${classObj.name}" sınıfının haftalık ders programında boş saat kalmadı (Haftalık kapasite dolu).`;
      suggestions.push({
        text: `Sınıfın kapalı zaman dilimlerini esnetebilir ya da sınıftan bazı dersleri çıkartarak yer açabilirsiniz.`,
        action: { type: "free_class_period", entityId: classObj.id }
      });
    }
  }

  // 3. Simulation: What if teacher unavailability was ignored?
  if (suggestions.length === 0 && tIds.length > 0) {
    let foundRelaxed = false;
    for (const tId of tIds) {
      const teacherObj = teachers.find(t => t.id === tId);
      if (!teacherObj) continue;

      const relaxedState = {
        ...state,
        teachers: teachers.map(t => t.id === tId ? { ...t, unavailability: {} } : t)
      };

      for (let d = 0; d < numDays && !foundRelaxed; d++) {
        for (let p = 0; p <= numPeriods - blockSize && !foundRelaxed; p++) {
          if (isPlacementValidEx(relaxedState, currentSchedule, assignment, d, p, blockSize)) {
            const dayName = settings.days[d];
            reason = `"${teacherObj.name}" öğretmeninin bu saat aralığında kapalı kısıtları bulunuyor.`;
            suggestions.push({
              text: `"${teacherObj.name}" öğretmeninin ${dayName} günü ${p + 1}. ders saatindeki kısıtını (kapalı saatini) kaldırarak bu dersi yerleştirebilirsiniz.`,
              action: { type: "expand_teacher_availability", entityId: tId, dayIndex: d, periodIndex: p }
            });
            foundRelaxed = true;
          }
        }
      }
    }
  }

  // 4. Alternative teacher suggestions
  if (tIds.length > 0) {
    const mainTeacher = teachers.find(t => t.id === tIds[0]);
    if (mainTeacher && mainTeacher.branch) {
      const alternatives = teachers.filter(t => t.id !== mainTeacher.id && t.branch === mainTeacher.branch);
      if (alternatives.length > 0) {
        alternatives.forEach(alt => {
          suggestions.push({
            text: `Bu dersi verebilecek aynı branştan (${mainTeacher.branch}) alternatif öğretmen olan "${alt.name}" öğretmenine bu dersi atayabilirsiniz.`,
            action: { type: "change_teacher", entityId: assignment.id }
          });
        });
      }
    }
  }

  // 5. Default shift/manual suggestions
  if (suggestions.length < 2) {
    suggestions.push({
      text: `Bu dersi sınıf programındaki boş ve uygun bir güne/saate elle yerleştirmek için sağ taraftaki "Yerleşmeyen Dersler" panelinden sürükleyip programda boş bir kutuya bırakabilirsiniz.`,
      action: { type: "free_class_period", entityId: assignment.classId }
    });
  }

  return { reason, suggestions };
}

let activeWorker: Worker | null = null;
let activeResolve: ((value: any) => void) | null = null;
let lastProgressProgress: any = null;
let initialSchedule: ClassScheduleMap | null = null;
let initialAppState: AppState | null = null;

export function restoreMissingTeacherHours(
  initialSched: ClassScheduleMap,
  newSched: ClassScheduleMap,
  state: AppState
): ClassScheduleMap {
  let finalSchedule = JSON.parse(JSON.stringify(newSched));
  const { teachers, assignments, settings } = state;
  const numDays = settings.days.length;
  const numPeriods = settings.periodsPerDay;

  const assignmentsMap = new Map<string, any>();
  for (const a of assignments) {
    assignmentsMap.set(a.id, a);
  }

  // Calculate initial teacher hours
  const initialTeacherHours: Record<string, number> = {};
  for (const t of teachers) {
    initialTeacherHours[t.id] = 0;
  }
  for (const cId of Object.keys(initialSched)) {
    for (let d = 0; d < numDays; d++) {
      const slots = initialSched[cId]?.[d];
      if (slots) {
        for (let p = 0; p < numPeriods; p++) {
          const slot = slots[p];
          if (slot) {
            const assign = assignmentsMap.get(slot.assignmentId);
            if (assign?.teacherId) {
              const tIds = assign.teacherId.split(",").map((id: string) => id.trim()).filter(Boolean);
              for (const tId of tIds) {
                initialTeacherHours[tId] = (initialTeacherHours[tId] || 0) + 1;
              }
            }
          }
        }
      }
    }
  }

  // Iterative restoration loop (max 5 passes)
  for (let pass = 0; pass < 5; pass++) {
    // 1. Calculate current teacher hours in finalSchedule
    const currentTeacherHours: Record<string, number> = {};
    for (const t of teachers) {
      currentTeacherHours[t.id] = 0;
    }
    for (const cId of Object.keys(finalSchedule)) {
      for (let d = 0; d < numDays; d++) {
        const slots = finalSchedule[cId]?.[d];
        if (slots) {
          for (let p = 0; p < numPeriods; p++) {
            const slot = slots[p];
            if (slot) {
              const assign = assignmentsMap.get(slot.assignmentId);
              if (assign?.teacherId) {
                const tIds = assign.teacherId.split(",").map((id: string) => id.trim()).filter(Boolean);
                for (const tId of tIds) {
                  currentTeacherHours[tId] = (currentTeacherHours[tId] || 0) + 1;
                }
              }
            }
          }
        }
      }
    }

    // 2. Find any teachers whose current hours are less than initial hours
    const decreasedTeachers = new Set<string>();
    for (const t of teachers) {
      if (currentTeacherHours[t.id] < initialTeacherHours[t.id]) {
        decreasedTeachers.add(t.id);
      }
    }

    if (decreasedTeachers.size === 0) {
      break; // Safe! No teacher has fewer hours than they started with.
    }

    // 3. Restore initial slots for the decreased teachers
    let restoredAny = false;
    for (const cId of Object.keys(initialSched)) {
      if (!finalSchedule[cId]) {
        finalSchedule[cId] = {};
      }
      for (let d = 0; d < numDays; d++) {
        if (!finalSchedule[cId][d]) {
          finalSchedule[cId][d] = Array(numPeriods).fill(null);
        }
      }

      for (let d = 0; d < numDays; d++) {
        const slots = initialSched[cId]?.[d];
        if (slots) {
          for (let p = 0; p < numPeriods; p++) {
            const slot = slots[p];
            if (slot) {
              const assign = assignmentsMap.get(slot.assignmentId);
              if (assign?.teacherId) {
                const tIds = assign.teacherId.split(",").map((id: string) => id.trim()).filter(Boolean);
                const hasDecreasedTeacher = tIds.some(tId => decreasedTeachers.has(tId));
                
                const currentSlot = finalSchedule[cId][d][p];
                const isAlreadyRestored = currentSlot && currentSlot.assignmentId === slot.assignmentId;
                
                if (hasDecreasedTeacher && !isAlreadyRestored) {
                  restoredAny = true;
                  
                  // Clear the position first
                  finalSchedule[cId][d][p] = null;

                  // Clear other class slots that have teacher or classroom conflict with this restored slot
                  for (const otherCId of Object.keys(finalSchedule)) {
                    const otherSlot = finalSchedule[otherCId]?.[d]?.[p];
                    if (otherSlot) {
                      const otherAssign = assignmentsMap.get(otherSlot.assignmentId);
                      if (otherAssign) {
                        let hasTeacherConflict = false;
                        if (otherAssign.teacherId) {
                          const otherTIds = otherAssign.teacherId.split(",").map((id: string) => id.trim()).filter(Boolean);
                          hasTeacherConflict = otherTIds.some(tId => tIds.includes(tId));
                        }
                        const hasClassroomConflict = assign.classroomId && otherAssign.classroomId && assign.classroomId === otherAssign.classroomId;

                        if (hasTeacherConflict || hasClassroomConflict) {
                          finalSchedule[otherCId][d][p] = null;
                        }
                      }
                    }
                  }

                  // Restore slot
                  finalSchedule[cId][d][p] = slot;
                }
              }
            }
          }
        }
      }
    }

    if (!restoredAny) {
      break; // Prevent infinite loop if no changes are made
    }
  }

  return finalSchedule;
}

export function stopActiveScheduler() {
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

      // If the promise is still pending, resolve it now with the last known best schedule
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
    // If no active worker but activeResolve is still set, clean it up
    if (activeResolve) {
      activeResolve({
        success: false,
        schedule: initialSchedule || {},
        message: "Planlama durduruldu.",
        unplacedCount: 0,
        unplacedDetails: []
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
}> {
  return new Promise((resolve, reject) => {
    try {
      stopActiveScheduler();

      initialSchedule = state.schedule || {};
      initialAppState = state;

      const worker = new Worker(
        new URL("./scheduler.worker.ts", import.meta.url),
        { type: "module" }
      );
      activeWorker = worker;
      activeResolve = resolve;
      lastProgressProgress = null;

      worker.onmessage = (event) => {
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
          activeResolve = null; // Clear so safety timeout won't double-resolve
          worker.terminate();

          if (result && result.schedule) {
            // Apply restoration to ensure no teacher's placed hours are decreased compared to before starting
            if (initialSchedule && initialAppState) {
              result.schedule = restoreMissingTeacherHours(initialSchedule, result.schedule, initialAppState);
            }

            // Compute diagnostics and reports on the main thread for the unplaced items
            const { settings, teachers, classes, assignments } = state;
            const numDays = settings.days.length;
            const numPeriods = settings.periodsPerDay;

            const scheduledHoursCount: { [assignId: string]: number } = {};
            for (const cId of Object.keys(result.schedule)) {
              for (let d = 0; d < numDays; d++) {
                const daySlots = result.schedule[cId][d];
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

            const unplacedReports: UnplacedReportItem[] = [];
            const unplacedDiagnosis: string[] = [];

            const targetTeacherIds = options?.targetTeacherIds;
            const targetClassIds = options?.targetClassIds;

            for (const assign of assignments) {
              // If targetTeacherIds is specified, only include assignments for those teachers
              if (targetTeacherIds && targetTeacherIds.length > 0) {
                if (!assign.teacherId) continue;
                const assignTeacherIds = parseTeacherIds(assign.teacherId);
                const hasTargetTeacher = assignTeacherIds.some(id => targetTeacherIds.includes(id));
                if (!hasTargetTeacher) continue;
              }

              // If targetClassIds is specified, only include assignments for those classes
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

          resolve(result);
        }
      };

      worker.onerror = (err) => {
        console.error("Web Worker error:", err);
        if (activeWorker === worker) {
          activeWorker = null;
        }
        worker.terminate();
        reject(err);
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
      console.error("Could not start Web Worker:", error);
      reject(error);
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
  const resultPromise = generateAutomaticScheduleAsync(state, undefined, { keepExisting: false });
  // Since our async generator relies on microtasks, running it synchronously via standard awaiting or blocking isn't natively supported.
  // Instead, we implement a fast, immediate synchronous solver fallback directly:
  const { settings, teachers, classes, classrooms, assignments } = state;
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

  // Identify targets
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

  // Count unplaced hours
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

  // Fast greedy scheduler for partial run
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
