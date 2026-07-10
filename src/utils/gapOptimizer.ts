import { AppState, ScheduleSlot, Teacher, GradeClass, Classroom } from "../types";

export function getTeacherGaps(
  sch: Record<string, Record<number, (ScheduleSlot | null)[]>>,
  teacherId: string,
  state: AppState
): number {
  let totalGaps = 0;
  const periodsPerDay = state.settings.periodsPerDay;
  const daysCount = state.settings.days.length;

  for (let dIdx = 0; dIdx < daysCount; dIdx++) {
    const activePeriods: number[] = [];
    for (let pIdx = 0; pIdx < periodsPerDay; pIdx++) {
      let isTeaching = false;
      for (const classId of Object.keys(sch)) {
        const slot = sch[classId]?.[dIdx]?.[pIdx];
        if (slot && slot.teacherId && slot.teacherId.split(",").includes(teacherId)) {
          isTeaching = true;
          break;
        }
      }
      if (isTeaching) {
        activePeriods.push(pIdx);
      }
    }

    if (activePeriods.length > 1) {
      const minP = Math.min(...activePeriods);
      const maxP = Math.max(...activePeriods);
      for (let p = minP + 1; p < maxP; p++) {
        if (!activePeriods.includes(p)) {
          totalGaps++;
        }
      }
    }
  }
  return totalGaps;
}

export function getAllTeachersGaps(
  sch: Record<string, Record<number, (ScheduleSlot | null)[]>>,
  state: AppState
): number {
  let total = 0;
  for (const t of state.teachers) {
    total += getTeacherGaps(sch, t.id, state);
  }
  return total;
}

export function isValidMove(
  tempSch: Record<string, Record<number, (ScheduleSlot | null)[]>>,
  classId: string,
  dIdx: number,
  pFrom: number,
  pTo: number,
  state: AppState,
  classesMap: Map<string, GradeClass>,
  teachersMap: Map<string, Teacher>,
  classroomsMap: Map<string, Classroom>
): boolean {
  const slot = tempSch[classId]?.[dIdx]?.[pFrom];
  if (!slot) return false;

  const destSlot = tempSch[classId]?.[dIdx]?.[pTo];
  if (destSlot !== null) return false;

  const targetClassObj = classesMap.get(classId);
  if (targetClassObj && targetClassObj.dailyPeriods) {
    const maxPeriodsThisDay = targetClassObj.dailyPeriods[dIdx];
    if (maxPeriodsThisDay !== undefined && pTo >= maxPeriodsThisDay) {
      return false;
    }
  }

  if (targetClassObj && targetClassObj.unavailability?.[dIdx]?.[pTo]) {
    return false;
  }

  const tIds = slot.teacherId ? slot.teacherId.split(",") : [];
  for (const tId of tIds) {
    const teacherObj = teachersMap.get(tId);
    if (teacherObj && teacherObj.unavailability?.[dIdx]?.[pTo]) {
      return false;
    }

    for (const otherClassId of Object.keys(tempSch)) {
      if (otherClassId === classId) continue;
      const otherSlot = tempSch[otherClassId]?.[dIdx]?.[pTo];
      if (otherSlot && otherSlot.teacherId) {
        const otherTIds = otherSlot.teacherId.split(",");
        if (otherTIds.includes(tId)) {
          return false;
        }
      }
    }
  }

  if (slot.classroomId) {
    const classroomObj = classroomsMap.get(slot.classroomId);
    if (classroomObj && classroomObj.unavailability?.[dIdx]?.[pTo]) {
      return false;
    }

    for (const otherClassId of Object.keys(tempSch)) {
      if (otherClassId === classId) continue;
      const otherSlot = tempSch[otherClassId]?.[dIdx]?.[pTo];
      if (otherSlot && otherSlot.classroomId === slot.classroomId) {
        return false;
      }
    }
  }

  return true;
}

export function isValidMoveCrossDay(
  tempSch: Record<string, Record<number, (ScheduleSlot | null)[]>>,
  classId: string,
  dFrom: number,
  pFrom: number,
  dTo: number,
  pTo: number,
  classesMap: Map<string, GradeClass>,
  teachersMap: Map<string, Teacher>,
  classroomsMap: Map<string, Classroom>
): boolean {
  const slot = tempSch[classId]?.[dFrom]?.[pFrom];
  if (!slot) return false;

  const destSlot = tempSch[classId]?.[dTo]?.[pTo];
  if (destSlot !== undefined && destSlot !== null) return false;

  const targetClassObj = classesMap.get(classId);
  if (targetClassObj && targetClassObj.dailyPeriods) {
    const maxPeriodsThisDay = targetClassObj.dailyPeriods[dTo];
    if (maxPeriodsThisDay !== undefined && pTo >= maxPeriodsThisDay) {
      return false;
    }
  }

  if (targetClassObj && targetClassObj.unavailability?.[dTo]?.[pTo]) {
    return false;
  }

  const tIds = slot.teacherId ? slot.teacherId.split(",") : [];
  for (const tId of tIds) {
    const teacherObj = teachersMap.get(tId);
    if (teacherObj && teacherObj.unavailability?.[dTo]?.[pTo]) {
      return false;
    }

    for (const otherClassId of Object.keys(tempSch)) {
      if (otherClassId === classId) continue;
      const otherSlot = tempSch[otherClassId]?.[dTo]?.[pTo];
      if (otherSlot && otherSlot.teacherId) {
        const otherTIds = otherSlot.teacherId.split(",");
        if (otherTIds.includes(tId)) {
          return false;
        }
      }
    }
  }

  if (slot.classroomId) {
    const classroomObj = classroomsMap.get(slot.classroomId);
    if (classroomObj && classroomObj.unavailability?.[dTo]?.[pTo]) {
      return false;
    }

    for (const otherClassId of Object.keys(tempSch)) {
      if (otherClassId === classId) continue;
      const otherSlot = tempSch[otherClassId]?.[dTo]?.[pTo];
      if (otherSlot && otherSlot.classroomId === slot.classroomId) {
        return false;
      }
    }
  }

  return true;
}

export function isValidSwapCrossDay(
  tempSch: Record<string, Record<number, (ScheduleSlot | null)[]>>,
  classId: string,
  dFrom: number,
  pFrom: number,
  dTo: number,
  pTo: number,
  classesMap: Map<string, GradeClass>,
  teachersMap: Map<string, Teacher>,
  classroomsMap: Map<string, Classroom>
): boolean {
  const slotFrom = tempSch[classId]?.[dFrom]?.[pFrom];
  const slotTo = tempSch[classId]?.[dTo]?.[pTo];

  if (!slotFrom || !slotTo) return false;

  const targetClassObj = classesMap.get(classId);

  // Check unavailabilities
  if (targetClassObj) {
    if (targetClassObj.unavailability?.[dTo]?.[pTo]) return false;
    if (targetClassObj.unavailability?.[dFrom]?.[pFrom]) return false;
  }

  // 1. Check if slotFrom can go to (dTo, pTo)
  const tIdsFrom = slotFrom.teacherId ? slotFrom.teacherId.split(",") : [];
  for (const tId of tIdsFrom) {
    const teacherObj = teachersMap.get(tId);
    if (teacherObj && teacherObj.unavailability?.[dTo]?.[pTo]) return false;

    for (const otherClassId of Object.keys(tempSch)) {
      if (otherClassId === classId) continue;
      const otherSlot = tempSch[otherClassId]?.[dTo]?.[pTo];
      if (otherSlot && otherSlot.teacherId) {
        const otherTIds = otherSlot.teacherId.split(",");
        if (otherTIds.includes(tId)) return false;
      }
    }
  }

  if (slotFrom.classroomId) {
    const classroomObj = classroomsMap.get(slotFrom.classroomId);
    if (classroomObj && classroomObj.unavailability?.[dTo]?.[pTo]) return false;

    for (const otherClassId of Object.keys(tempSch)) {
      if (otherClassId === classId) continue;
      const otherSlot = tempSch[otherClassId]?.[dTo]?.[pTo];
      if (otherSlot && otherSlot.classroomId === slotFrom.classroomId) return false;
    }
  }

  // 2. Check if slotTo can go to (dFrom, pFrom)
  const tIdsTo = slotTo.teacherId ? slotTo.teacherId.split(",") : [];
  for (const tId of tIdsTo) {
    const teacherObj = teachersMap.get(tId);
    if (teacherObj && teacherObj.unavailability?.[dFrom]?.[pFrom]) return false;

    for (const otherClassId of Object.keys(tempSch)) {
      if (otherClassId === classId) continue;
      const otherSlot = tempSch[otherClassId]?.[dFrom]?.[pFrom];
      if (otherSlot && otherSlot.teacherId) {
        const otherTIds = otherSlot.teacherId.split(",");
        if (otherTIds.includes(tId)) return false;
      }
    }
  }

  if (slotTo.classroomId) {
    const classroomObj = classroomsMap.get(slotTo.classroomId);
    if (classroomObj && classroomObj.unavailability?.[dFrom]?.[pFrom]) return false;

    for (const otherClassId of Object.keys(tempSch)) {
      if (otherClassId === classId) continue;
      const otherSlot = tempSch[otherClassId]?.[dFrom]?.[pFrom];
      if (otherSlot && otherSlot.classroomId === slotTo.classroomId) return false;
    }
  }

  return true;
}

export function optimizeGapsForTeacher(
  state: AppState,
  teacherId: string
): { success: boolean; schedule?: Record<string, Record<number, (ScheduleSlot | null)[]>>; message: string; type: "success" | "info" | "error" } {
  const tempSchedule: Record<string, Record<number, (ScheduleSlot | null)[]>> = JSON.parse(JSON.stringify(state.schedule));
  
  const initialGaps = getTeacherGaps(tempSchedule, teacherId, state);
  if (initialGaps === 0) {
    return { success: false, message: "Öğretmenin programında zaten hiç boşluk yok.", type: "info" };
  }

  const teachersMap = new Map<string, Teacher>(state.teachers.map((t) => [t.id, t]));
  const classesMap = new Map<string, GradeClass>(state.classes.map((c) => [c.id, c]));
  const classroomsMap = new Map<string, Classroom>(state.classrooms.map((cr) => [cr.id, cr]));

  const daysCount = state.settings.days.length;
  const periodsPerDay = state.settings.periodsPerDay;
  let improved = false;
  let iterations = 0;
  // maxDepth is integrated to scale gap optimization attempts/iterations
  const maxDepth = state.settings.maxDepth ?? 15;
  const maxIterations = maxDepth * 15;
  let currentGaps = initialGaps;

  while (iterations < maxIterations) {
    let bestMove: { classId: string; dIdx: number; pFrom: number; pTo: number; gapReduction: number } | null = null;

    for (const classId of Object.keys(tempSchedule)) {
      for (let dIdx = 0; dIdx < daysCount; dIdx++) {
        for (let pFrom = 0; pFrom < periodsPerDay; pFrom++) {
          const slot = tempSchedule[classId]?.[dIdx]?.[pFrom];
          if (slot && slot.teacherId && slot.teacherId.split(",").includes(teacherId)) {
            for (let pTo = 0; pTo < periodsPerDay; pTo++) {
              if (pFrom === pTo) continue;

              if (isValidMove(tempSchedule, classId, dIdx, pFrom, pTo, state, classesMap, teachersMap, classroomsMap)) {
                const testSchedule = JSON.parse(JSON.stringify(tempSchedule));
                testSchedule[classId][dIdx][pTo] = testSchedule[classId][dIdx][pFrom];
                testSchedule[classId][dIdx][pFrom] = null;

                const testGaps = getTeacherGaps(testSchedule, teacherId, state);
                const reduction = currentGaps - testGaps;

                if (reduction > 0) {
                  if (!bestMove || reduction > bestMove.gapReduction) {
                    bestMove = { classId, dIdx, pFrom, pTo, gapReduction: reduction };
                  }
                }
              }
            }
          }
        }
      }
    }

    if (bestMove) {
      const { classId, dIdx, pFrom, pTo } = bestMove;
      tempSchedule[classId][dIdx][pTo] = tempSchedule[classId][dIdx][pFrom];
      tempSchedule[classId][dIdx][pFrom] = null;

      currentGaps = getTeacherGaps(tempSchedule, teacherId, state);
      improved = true;
      iterations++;
    } else {
      break;
    }
  }

  if (improved) {
    return {
      success: true,
      schedule: tempSchedule,
      message: `Seçili öğretmenin boşlukları azaltıldı! ${currentGaps} boşluk kaldı.`,
      type: "success"
    };
  } else {
    return { success: false, message: "yapılamadı", type: "error" };
  }
}

export function optimizeGapsForAllTeachers(
  state: AppState
): { success: boolean; schedule?: Record<string, Record<number, (ScheduleSlot | null)[]>>; message: string; type: "success" | "info" | "error" } {
  const tempSchedule: Record<string, Record<number, (ScheduleSlot | null)[]>> = JSON.parse(JSON.stringify(state.schedule));
  
  const initialGaps = getAllTeachersGaps(tempSchedule, state);
  if (initialGaps === 0) {
    return { success: false, message: "Tüm öğretmenlerin programlarında zaten hiç boşluk yok.", type: "info" };
  }

  const teachersMap = new Map<string, Teacher>(state.teachers.map((t) => [t.id, t]));
  const classesMap = new Map<string, GradeClass>(state.classes.map((c) => [c.id, c]));
  const classroomsMap = new Map<string, Classroom>(state.classrooms.map((cr) => [cr.id, cr]));

  const daysCount = state.settings.days.length;
  const periodsPerDay = state.settings.periodsPerDay;
  let improved = false;
  let iterations = 0;
  // maxDepth is integrated to scale gap optimization attempts/iterations
  const maxDepth = state.settings.maxDepth ?? 15;
  const maxIterations = maxDepth * 30;
  let currentGaps = initialGaps;

  while (iterations < maxIterations) {
    let bestMove: { classId: string; dIdx: number; pFrom: number; pTo: number; gapReduction: number } | null = null;

    for (const classId of Object.keys(tempSchedule)) {
      for (let dIdx = 0; dIdx < daysCount; dIdx++) {
        for (let pFrom = 0; pFrom < periodsPerDay; pFrom++) {
          const slot = tempSchedule[classId]?.[dIdx]?.[pFrom];
          if (slot) {
            for (let pTo = 0; pTo < periodsPerDay; pTo++) {
              if (pFrom === pTo) continue;

              if (isValidMove(tempSchedule, classId, dIdx, pFrom, pTo, state, classesMap, teachersMap, classroomsMap)) {
                const testSchedule = JSON.parse(JSON.stringify(tempSchedule));
                testSchedule[classId][dIdx][pTo] = testSchedule[classId][dIdx][pFrom];
                testSchedule[classId][dIdx][pFrom] = null;

                const testGaps = getAllTeachersGaps(testSchedule, state);
                const reduction = currentGaps - testGaps;

                if (reduction > 0) {
                  if (!bestMove || reduction > bestMove.gapReduction) {
                    bestMove = { classId, dIdx, pFrom, pTo, gapReduction: reduction };
                  }
                }
              }
            }
          }
        }
      }
    }

    if (bestMove) {
      const { classId, dIdx, pFrom, pTo } = bestMove;
      tempSchedule[classId][dIdx][pTo] = tempSchedule[classId][dIdx][pFrom];
      tempSchedule[classId][dIdx][pFrom] = null;

      currentGaps = getAllTeachersGaps(tempSchedule, state);
      improved = true;
      iterations++;
    } else {
      break;
    }
  }

  if (improved) {
    return {
      success: true,
      schedule: tempSchedule,
      message: `Tüm öğretmenlerin toplam boşluğu azaltıldı! Yeni toplam boşluk: ${currentGaps}`,
      type: "success"
    };
  } else {
    return { success: false, message: "yapılamadı", type: "error" };
  }
}

export function removeSingleLessonDays(
  state: AppState
): { success: boolean; schedule?: Record<string, Record<number, (ScheduleSlot | null)[]>>; message: string; type: "success" | "info" | "error" } {
  const tempSchedule: Record<string, Record<number, (ScheduleSlot | null)[]>> = JSON.parse(JSON.stringify(state.schedule));
  const daysCount = state.settings.days.length;
  const periodsPerDay = state.settings.periodsPerDay;
  let improved = false;

  const teachersMap = new Map<string, Teacher>(state.teachers.map((t) => [t.id, t]));
  const classesMap = new Map<string, GradeClass>(state.classes.map((c) => [c.id, c]));
  const classroomsMap = new Map<string, Classroom>(state.classrooms.map((cr) => [cr.id, cr]));

  for (const teacher of state.teachers) {
    const teacherLessonsCountPerDay: Record<number, { count: number; slots: { classId: string; pIdx: number }[] }> = {};
    for (let dIdx = 0; dIdx < daysCount; dIdx++) {
      teacherLessonsCountPerDay[dIdx] = { count: 0, slots: [] };
    }

    for (const classId of Object.keys(tempSchedule)) {
      for (let dIdx = 0; dIdx < daysCount; dIdx++) {
        const daySched = tempSchedule[classId]?.[dIdx];
        if (!daySched) continue;
        for (let pIdx = 0; pIdx < periodsPerDay; pIdx++) {
          const slot = daySched[pIdx];
          if (slot && slot.teacherId && slot.teacherId.split(",").includes(teacher.id)) {
            teacherLessonsCountPerDay[dIdx].count++;
            teacherLessonsCountPerDay[dIdx].slots.push({ classId, pIdx });
          }
        }
      }
    }

    const singleLessonDays = Object.keys(teacherLessonsCountPerDay)
      .map(Number)
      .filter(d => teacherLessonsCountPerDay[d].count === 1);

    if (singleLessonDays.length === 0) continue;

    for (const dFrom of singleLessonDays) {
      const soleLesson = teacherLessonsCountPerDay[dFrom].slots[0];
      if (!soleLesson) continue;

      const { classId, pIdx: pFrom } = soleLesson;

      let movedSuccess = false;
      // 1. Try moving to empty slot (priority)
      for (let dTo = 0; dTo < daysCount; dTo++) {
        if (dTo === dFrom) continue;
        if (teacherLessonsCountPerDay[dTo].count === 0) continue;

        for (let pTo = 0; pTo < periodsPerDay; pTo++) {
          if (isValidMoveCrossDay(tempSchedule, classId, dFrom, pFrom, dTo, pTo, classesMap, teachersMap, classroomsMap)) {
            if (!tempSchedule[classId][dTo]) {
              tempSchedule[classId][dTo] = Array(periodsPerDay).fill(null);
            }
            tempSchedule[classId][dTo][pTo] = tempSchedule[classId][dFrom][pFrom];
            tempSchedule[classId][dFrom][pFrom] = null;

            teacherLessonsCountPerDay[dFrom].count--;
            teacherLessonsCountPerDay[dTo].count++;
            movedSuccess = true;
            improved = true;
            break;
          }
        }
        if (movedSuccess) break;
      }

      // 2. Try swapping with another lesson on dTo to group them (Secondary priority / Swap allowed!)
      if (!movedSuccess) {
        for (let dTo = 0; dTo < daysCount; dTo++) {
          if (dTo === dFrom) continue;
          if (teacherLessonsCountPerDay[dTo].count === 0) continue;

          for (let pTo = 0; pTo < periodsPerDay; pTo++) {
            if (isValidSwapCrossDay(tempSchedule, classId, dFrom, pFrom, dTo, pTo, classesMap, teachersMap, classroomsMap)) {
              const temp = tempSchedule[classId][dFrom][pFrom];
              tempSchedule[classId][dFrom][pFrom] = tempSchedule[classId][dTo][pTo];
              tempSchedule[classId][dTo][pTo] = temp;

              teacherLessonsCountPerDay[dFrom].count--;
              teacherLessonsCountPerDay[dTo].count++;
              movedSuccess = true;
              improved = true;
              break;
            }
          }
          if (movedSuccess) break;
        }
      }
    }
  }

  if (improved) {
    return {
      success: true,
      schedule: tempSchedule,
      message: "Öğretmenlerin tek ders günleri başarıyla ortadan kaldırıldı ve diğer günlere dağıtıldı!",
      type: "success"
    };
  } else {
    return { success: false, message: "yapılamadı", type: "error" };
  }
}

export function removeSingleLessonDaysForTeacher(
  state: AppState,
  teacherId: string
): { success: boolean; schedule?: Record<string, Record<number, (ScheduleSlot | null)[]>>; message: string; type: "success" | "info" | "error" } {
  const tempSchedule: Record<string, Record<number, (ScheduleSlot | null)[]>> = JSON.parse(JSON.stringify(state.schedule));
  const daysCount = state.settings.days.length;
  const periodsPerDay = state.settings.periodsPerDay;
  let improved = false;

  const teachersMap = new Map<string, Teacher>(state.teachers.map((t) => [t.id, t]));
  const classesMap = new Map<string, GradeClass>(state.classes.map((c) => [c.id, c]));
  const classroomsMap = new Map<string, Classroom>(state.classrooms.map((cr) => [cr.id, cr]));

  const teacher = teachersMap.get(teacherId);
  if (!teacher) {
    return { success: false, message: "Öğretmen bulunamadı.", type: "error" };
  }

  const teacherLessonsCountPerDay: Record<number, { count: number; slots: { classId: string; pIdx: number }[] }> = {};
  for (let dIdx = 0; dIdx < daysCount; dIdx++) {
    teacherLessonsCountPerDay[dIdx] = { count: 0, slots: [] };
  }

  for (const classId of Object.keys(tempSchedule)) {
    for (let dIdx = 0; dIdx < daysCount; dIdx++) {
      const daySched = tempSchedule[classId]?.[dIdx];
      if (!daySched) continue;
      for (let pIdx = 0; pIdx < periodsPerDay; pIdx++) {
        const slot = daySched[pIdx];
        if (slot && slot.teacherId && slot.teacherId.split(",").includes(teacherId)) {
          teacherLessonsCountPerDay[dIdx].count++;
          teacherLessonsCountPerDay[dIdx].slots.push({ classId, pIdx });
        }
      }
    }
  }

  const singleLessonDays = Object.keys(teacherLessonsCountPerDay)
    .map(Number)
    .filter(d => teacherLessonsCountPerDay[d].count === 1);

  if (singleLessonDays.length === 0) {
    return { success: false, message: "Öğretmenin zaten tek dersi olan günü bulunmuyor.", type: "info" };
  }

  for (const dFrom of singleLessonDays) {
    const soleLesson = teacherLessonsCountPerDay[dFrom].slots[0];
    if (!soleLesson) continue;

    const { classId, pIdx: pFrom } = soleLesson;

    let movedSuccess = false;
    // 1. Try moving to empty slot (priority)
    for (let dTo = 0; dTo < daysCount; dTo++) {
      if (dTo === dFrom) continue;
      if (teacherLessonsCountPerDay[dTo].count === 0) continue;

      for (let pTo = 0; pTo < periodsPerDay; pTo++) {
        if (isValidMoveCrossDay(tempSchedule, classId, dFrom, pFrom, dTo, pTo, classesMap, teachersMap, classroomsMap)) {
          if (!tempSchedule[classId][dTo]) {
            tempSchedule[classId][dTo] = Array(periodsPerDay).fill(null);
          }
          tempSchedule[classId][dTo][pTo] = tempSchedule[classId][dFrom][pFrom];
          tempSchedule[classId][dFrom][pFrom] = null;

          teacherLessonsCountPerDay[dFrom].count--;
          teacherLessonsCountPerDay[dTo].count++;
          movedSuccess = true;
          improved = true;
          break;
        }
      }
      if (movedSuccess) break;
    }

    // 2. Try swapping with another lesson on dTo to group them (Secondary priority / Swap allowed!)
    if (!movedSuccess) {
      for (let dTo = 0; dTo < daysCount; dTo++) {
        if (dTo === dFrom) continue;
        if (teacherLessonsCountPerDay[dTo].count === 0) continue;

        for (let pTo = 0; pTo < periodsPerDay; pTo++) {
          if (isValidSwapCrossDay(tempSchedule, classId, dFrom, pFrom, dTo, pTo, classesMap, teachersMap, classroomsMap)) {
            const temp = tempSchedule[classId][dFrom][pFrom];
            tempSchedule[classId][dFrom][pFrom] = tempSchedule[classId][dTo][pTo];
            tempSchedule[classId][dTo][pTo] = temp;

            teacherLessonsCountPerDay[dFrom].count--;
            teacherLessonsCountPerDay[dTo].count++;
            movedSuccess = true;
            improved = true;
            break;
          }
        }
        if (movedSuccess) break;
      }
    }
  }

  if (improved) {
    return {
      success: true,
      schedule: tempSchedule,
      message: `"${teacher.name}" öğretmeninin tek ders günü başarıyla kaldırıldı ve dersi diğer günlerine birleştirildi!`,
      type: "success"
    };
  } else {
    return { success: false, message: "Öğretmenin tek dersini birleştirmek için uygun boş slot veya takas edilebilir ders bulunamadı.", type: "error" };
  }
}
