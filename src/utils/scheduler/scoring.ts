import { ClassScheduleMap, AppState, Teacher, GradeClass, Classroom, Course, LessonAssignment } from "../../types";
import { parseTeacherIds } from "./helpers";

/**
 * Calculates soft constraints penalties with Map lookups for performance.
 */
export function calculateScheduleScore(
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
              distributionPenalty += 500000; // MASSIVE penalty for non-contiguous periods
            }
          }
          if (periods.length > 2) {
            distributionPenalty += (periods.length - 2) * 500000;
          }
        }
      }

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
      } else if (daysWithCourse > idealDays) {
        const extraDays = daysWithCourse - idealDays;
        distributionPenalty += extraDays * 500000;
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
