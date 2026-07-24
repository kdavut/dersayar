import { AppState, ClassScheduleMap } from "../../types";
import { parseTeacherIds } from "./helpers";

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
  const { settings, teachers, classes } = state;
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
      const course = state.courses.find(c => c.id === courseId);
      const modeStr = (assign?.customPlacementMode || course?.placementMode || "").trim();
      if (modeStr) {
        const parts = modeStr.split("+").map(p => parseInt(p.trim(), 10)).filter(p => !isNaN(p) && p > 0);
        if (parts.length > 0) {
          idealDays = parts.length;
        } else if (assign) {
          const prefBlock = assign.preferredBlockSize || 2;
          idealDays = Math.ceil(assign.weeklyHours / prefBlock);
        }
      } else if (assign) {
        const prefBlock = assign.preferredBlockSize || 2;
        idealDays = Math.ceil(assign.weeklyHours / prefBlock);
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
