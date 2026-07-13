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

export function isValidSwapSameDay(
  tempSch: Record<string, Record<number, (ScheduleSlot | null)[]>>,
  classId: string,
  dIdx: number,
  pFrom: number,
  pTo: number,
  classesMap: Map<string, GradeClass>,
  teachersMap: Map<string, Teacher>,
  classroomsMap: Map<string, Classroom>
): boolean {
  const slotFrom = tempSch[classId]?.[dIdx]?.[pFrom];
  const slotTo = tempSch[classId]?.[dIdx]?.[pTo];

  if (!slotFrom || !slotTo) return false;

  const targetClassObj = classesMap.get(classId);

  // Check if daily periods restriction is violated for either slot moving to the other's period
  if (targetClassObj && targetClassObj.dailyPeriods) {
    const maxPeriodsThisDay = targetClassObj.dailyPeriods[dIdx];
    if (maxPeriodsThisDay !== undefined) {
      if (pTo >= maxPeriodsThisDay || pFrom >= maxPeriodsThisDay) {
        return false;
      }
    }
  }

  // Check class unavailabilities
  if (targetClassObj) {
    if (targetClassObj.unavailability?.[dIdx]?.[pTo]) return false;
    if (targetClassObj.unavailability?.[dIdx]?.[pFrom]) return false;
  }

  // 1. Check if slotFrom can go to (dIdx, pTo)
  const tIdsFrom = slotFrom.teacherId ? slotFrom.teacherId.split(",") : [];
  for (const tId of tIdsFrom) {
    const teacherObj = teachersMap.get(tId);
    if (teacherObj && teacherObj.unavailability?.[dIdx]?.[pTo]) return false;

    for (const otherClassId of Object.keys(tempSch)) {
      if (otherClassId === classId) continue;
      const otherSlot = tempSch[otherClassId]?.[dIdx]?.[pTo];
      if (otherSlot && otherSlot.teacherId) {
        const otherTIds = otherSlot.teacherId.split(",");
        if (otherTIds.includes(tId)) return false;
      }
    }
  }

  if (slotFrom.classroomId) {
    const classroomObj = classroomsMap.get(slotFrom.classroomId);
    if (classroomObj && classroomObj.unavailability?.[dIdx]?.[pTo]) return false;

    for (const otherClassId of Object.keys(tempSch)) {
      if (otherClassId === classId) continue;
      const otherSlot = tempSch[otherClassId]?.[dIdx]?.[pTo];
      if (otherSlot && otherSlot.classroomId === slotFrom.classroomId) return false;
    }
  }

  // 2. Check if slotTo can go to (dIdx, pFrom)
  const tIdsTo = slotTo.teacherId ? slotTo.teacherId.split(",") : [];
  for (const tId of tIdsTo) {
    const teacherObj = teachersMap.get(tId);
    if (teacherObj && teacherObj.unavailability?.[dIdx]?.[pFrom]) return false;

    for (const otherClassId of Object.keys(tempSch)) {
      if (otherClassId === classId) continue;
      const otherSlot = tempSch[otherClassId]?.[dIdx]?.[pFrom];
      if (otherSlot && otherSlot.teacherId) {
        const otherTIds = otherSlot.teacherId.split(",");
        if (otherTIds.includes(tId)) return false;
      }
    }
  }

  if (slotTo.classroomId) {
    const classroomObj = classroomsMap.get(slotTo.classroomId);
    if (classroomObj && classroomObj.unavailability?.[dIdx]?.[pFrom]) return false;

    for (const otherClassId of Object.keys(tempSch)) {
      if (otherClassId === classId) continue;
      const otherSlot = tempSch[otherClassId]?.[dIdx]?.[pFrom];
      if (otherSlot && otherSlot.classroomId === slotTo.classroomId) return false;
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
    let bestMove: { classId: string; dIdx: number; pFrom: number; pTo: number; gapReduction: number; isSwap: boolean } | null = null;

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
                    bestMove = { classId, dIdx, pFrom, pTo, gapReduction: reduction, isSwap: false };
                  }
                }
              } else if (isValidSwapSameDay(tempSchedule, classId, dIdx, pFrom, pTo, classesMap, teachersMap, classroomsMap)) {
                const testSchedule = JSON.parse(JSON.stringify(tempSchedule));
                const temp = testSchedule[classId][dIdx][pTo];
                testSchedule[classId][dIdx][pTo] = testSchedule[classId][dIdx][pFrom];
                testSchedule[classId][dIdx][pFrom] = temp;

                const testGaps = getTeacherGaps(testSchedule, teacherId, state);
                const reduction = currentGaps - testGaps;

                if (reduction > 0) {
                  if (!bestMove || reduction > bestMove.gapReduction) {
                    bestMove = { classId, dIdx, pFrom, pTo, gapReduction: reduction, isSwap: true };
                  }
                }
              }
            }
          }
        }
      }
    }

    if (bestMove) {
      const { classId, dIdx, pFrom, pTo, isSwap } = bestMove;
      if (isSwap) {
        const temp = tempSchedule[classId][dIdx][pTo];
        tempSchedule[classId][dIdx][pTo] = tempSchedule[classId][dIdx][pFrom];
        tempSchedule[classId][dIdx][pFrom] = temp;
      } else {
        tempSchedule[classId][dIdx][pTo] = tempSchedule[classId][dIdx][pFrom];
        tempSchedule[classId][dIdx][pFrom] = null;
      }

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
    return { success: false, message: "Öğretmenin boşluklarını daha fazla azaltmak için uygun yer değişimi veya boş slot bulunamadı.", type: "error" };
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
    let bestMove: { classId: string; dIdx: number; pFrom: number; pTo: number; gapReduction: number; isSwap: boolean } | null = null;

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
                    bestMove = { classId, dIdx, pFrom, pTo, gapReduction: reduction, isSwap: false };
                  }
                }
              } else if (isValidSwapSameDay(tempSchedule, classId, dIdx, pFrom, pTo, classesMap, teachersMap, classroomsMap)) {
                const testSchedule = JSON.parse(JSON.stringify(tempSchedule));
                const temp = testSchedule[classId][dIdx][pTo];
                testSchedule[classId][dIdx][pTo] = testSchedule[classId][dIdx][pFrom];
                testSchedule[classId][dIdx][pFrom] = temp;

                const testGaps = getAllTeachersGaps(testSchedule, state);
                const reduction = currentGaps - testGaps;

                if (reduction > 0) {
                  if (!bestMove || reduction > bestMove.gapReduction) {
                    bestMove = { classId, dIdx, pFrom, pTo, gapReduction: reduction, isSwap: true };
                  }
                }
              }
            }
          }
        }
      }
    }

    if (bestMove) {
      const { classId, dIdx, pFrom, pTo, isSwap } = bestMove;
      if (isSwap) {
        const temp = tempSchedule[classId][dIdx][pTo];
        tempSchedule[classId][dIdx][pTo] = tempSchedule[classId][dIdx][pFrom];
        tempSchedule[classId][dIdx][pFrom] = temp;
      } else {
        tempSchedule[classId][dIdx][pTo] = tempSchedule[classId][dIdx][pFrom];
        tempSchedule[classId][dIdx][pFrom] = null;
      }

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
    return { success: false, message: "Öğretmenlerin boşluklarını daha fazla azaltmak için uygun yer değişimi veya boş slot bulunamadı.", type: "error" };
  }
}

export function getTeacherSingleLessonDaysCount(
  sch: Record<string, Record<number, (ScheduleSlot | null)[]>>,
  tId: string,
  state: AppState
): number {
  const daysCount = state.settings.days.length;
  const periodsPerDay = state.settings.periodsPerDay;
  const countPerDay = Array(daysCount).fill(0);

  for (const classId of Object.keys(sch)) {
    for (let dIdx = 0; dIdx < daysCount; dIdx++) {
      const daySched = sch[classId]?.[dIdx];
      if (!daySched) continue;
      for (let pIdx = 0; pIdx < periodsPerDay; pIdx++) {
        const slot = daySched[pIdx];
        if (slot && slot.teacherId && slot.teacherId.split(",").includes(tId)) {
          countPerDay[dIdx]++;
        }
      }
    }
  }

  return countPerDay.filter(c => c === 1).length;
}

export function getAllTeachersSingleLessonDaysCount(
  sch: Record<string, Record<number, (ScheduleSlot | null)[]>>,
  state: AppState
): number {
  let total = 0;
  for (const teacher of state.teachers) {
    total += getTeacherSingleLessonDaysCount(sch, teacher.id, state);
  }
  return total;
}

export function removeSingleLessonDays(
  state: AppState
): { success: boolean; schedule?: Record<string, Record<number, (ScheduleSlot | null)[]>>; message: string; type: "success" | "info" | "error" } {
  const tempSchedule: Record<string, Record<number, (ScheduleSlot | null)[]>> = JSON.parse(JSON.stringify(state.schedule));
  const daysCount = state.settings.days.length;
  const periodsPerDay = state.settings.periodsPerDay;
  
  const teachersMap = new Map<string, Teacher>(state.teachers.map((t) => [t.id, t]));
  const classesMap = new Map<string, GradeClass>(state.classes.map((c) => [c.id, c]));
  const classroomsMap = new Map<string, Classroom>(state.classrooms.map((cr) => [cr.id, cr]));

  let currentTotalSingleDays = getAllTeachersSingleLessonDaysCount(tempSchedule, state);
  if (currentTotalSingleDays === 0) {
    return { success: false, message: "Tüm öğretmenlerin zaten tek dersi olan günü bulunmuyor.", type: "info" };
  }

  let improved = false;
  let iterations = 0;
  const maxIterations = 100;

  while (iterations < maxIterations) {
    let bestAction: {
      type: "move" | "swap";
      classId: string;
      dSrc: number;
      pSrc: number;
      dDst: number;
      pDst: number;
      reduction: number;
    } | null = null;

    for (const classId of Object.keys(tempSchedule)) {
      for (let dSrc = 0; dSrc < daysCount; dSrc++) {
        for (let pSrc = 0; pSrc < periodsPerDay; pSrc++) {
          const slot = tempSchedule[classId]?.[dSrc]?.[pSrc];
          if (!slot || !slot.teacherId) {
            continue;
          }

          for (let dDst = 0; dDst < daysCount; dDst++) {
            if (dDst === dSrc) continue;

            for (let pDst = 0; pDst < periodsPerDay; pDst++) {
              if (isValidMoveCrossDay(tempSchedule, classId, dSrc, pSrc, dDst, pDst, classesMap, teachersMap, classroomsMap)) {
                const testSch = JSON.parse(JSON.stringify(tempSchedule));
                testSch[classId][dDst][pDst] = testSch[classId][dSrc][pSrc];
                testSch[classId][dSrc][pSrc] = null;

                const testTotalSingleDays = getAllTeachersSingleLessonDaysCount(testSch, state);
                const reduction = currentTotalSingleDays - testTotalSingleDays;

                if (reduction > 0) {
                  if (!bestAction || reduction > bestAction.reduction) {
                    bestAction = {
                      type: "move",
                      classId,
                      dSrc,
                      pSrc,
                      dDst,
                      pDst,
                      reduction
                    };
                  }
                }
              }

              if (isValidSwapCrossDay(tempSchedule, classId, dSrc, pSrc, dDst, pDst, classesMap, teachersMap, classroomsMap)) {
                const testSch = JSON.parse(JSON.stringify(tempSchedule));
                const temp = testSch[classId][dDst][pDst];
                testSch[classId][dDst][pDst] = testSch[classId][dSrc][pSrc];
                testSch[classId][dSrc][pSrc] = temp;

                const testTotalSingleDays = getAllTeachersSingleLessonDaysCount(testSch, state);
                const reduction = currentTotalSingleDays - testTotalSingleDays;

                if (reduction > 0) {
                  if (!bestAction || reduction > bestAction.reduction) {
                    bestAction = {
                      type: "swap",
                      classId,
                      dSrc,
                      pSrc,
                      dDst,
                      pDst,
                      reduction
                    };
                  }
                }
              }
            }
          }
        }
      }
    }

    if (bestAction) {
      const { type, classId, dSrc, pSrc, dDst, pDst } = bestAction;
      if (type === "move") {
        tempSchedule[classId][dDst][pDst] = tempSchedule[classId][dSrc][pSrc];
        tempSchedule[classId][dSrc][pSrc] = null;
      } else {
        const temp = tempSchedule[classId][dDst][pDst];
        tempSchedule[classId][dDst][pDst] = tempSchedule[classId][dSrc][pSrc];
        tempSchedule[classId][dSrc][pSrc] = temp;
      }

      currentTotalSingleDays = getAllTeachersSingleLessonDaysCount(tempSchedule, state);
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
      message: `Öğretmenlerin tek ders günleri başarıyla optimize edildi! Kalan toplam tek ders günü sayısı: ${currentTotalSingleDays}`,
      type: "success"
    };
  } else {
    return {
      success: false,
      message: "Öğretmenlerin tek ders günlerini azaltmak için uygun yer değişimi veya boş slot bulunamadı.",
      type: "error"
    };
  }
}

export function removeSingleLessonDaysForTeacher(
  state: AppState,
  teacherId: string
): { success: boolean; schedule?: Record<string, Record<number, (ScheduleSlot | null)[]>>; message: string; type: "success" | "info" | "error" } {
  const tempSchedule: Record<string, Record<number, (ScheduleSlot | null)[]>> = JSON.parse(JSON.stringify(state.schedule));
  const daysCount = state.settings.days.length;
  const periodsPerDay = state.settings.periodsPerDay;
  
  const teachersMap = new Map<string, Teacher>(state.teachers.map((t) => [t.id, t]));
  const classesMap = new Map<string, GradeClass>(state.classes.map((c) => [c.id, c]));
  const classroomsMap = new Map<string, Classroom>(state.classrooms.map((cr) => [cr.id, cr]));

  const teacher = teachersMap.get(teacherId);
  if (!teacher) {
    return { success: false, message: "Öğretmen bulunamadı.", type: "error" };
  }

  let currentSingleDays = getTeacherSingleLessonDaysCount(tempSchedule, teacherId, state);
  if (currentSingleDays === 0) {
    return { success: false, message: `"${teacher.name}" öğretmeninin zaten tek dersi olan bir günü bulunmuyor.`, type: "info" };
  }

  let improved = false;
  let iterations = 0;
  const maxIterations = 50;

  while (iterations < maxIterations) {
    let bestAction: {
      type: "move" | "swap";
      classId: string;
      dSrc: number;
      pSrc: number;
      dDst: number;
      pDst: number;
      reduction: number;
    } | null = null;

    for (const classId of Object.keys(tempSchedule)) {
      for (let dSrc = 0; dSrc < daysCount; dSrc++) {
        for (let pSrc = 0; pSrc < periodsPerDay; pSrc++) {
          const slot = tempSchedule[classId]?.[dSrc]?.[pSrc];
          if (!slot || !slot.teacherId || !slot.teacherId.split(",").includes(teacherId)) {
            continue;
          }

          for (let dDst = 0; dDst < daysCount; dDst++) {
            if (dDst === dSrc) continue;

            for (let pDst = 0; pDst < periodsPerDay; pDst++) {
              if (isValidMoveCrossDay(tempSchedule, classId, dSrc, pSrc, dDst, pDst, classesMap, teachersMap, classroomsMap)) {
                const testSch = JSON.parse(JSON.stringify(tempSchedule));
                testSch[classId][dDst][pDst] = testSch[classId][dSrc][pSrc];
                testSch[classId][dSrc][pSrc] = null;

                const testSingleDays = getTeacherSingleLessonDaysCount(testSch, teacherId, state);
                const reduction = currentSingleDays - testSingleDays;

                if (reduction > 0) {
                  if (!bestAction || reduction > bestAction.reduction) {
                    bestAction = {
                      type: "move",
                      classId,
                      dSrc,
                      pSrc,
                      dDst,
                      pDst,
                      reduction
                    };
                  }
                }
              }

              if (isValidSwapCrossDay(tempSchedule, classId, dSrc, pSrc, dDst, pDst, classesMap, teachersMap, classroomsMap)) {
                const testSch = JSON.parse(JSON.stringify(tempSchedule));
                const temp = testSch[classId][dDst][pDst];
                testSch[classId][dDst][pDst] = testSch[classId][dSrc][pSrc];
                testSch[classId][dSrc][pSrc] = temp;

                const testSingleDays = getTeacherSingleLessonDaysCount(testSch, teacherId, state);
                const reduction = currentSingleDays - testSingleDays;

                if (reduction > 0) {
                  if (!bestAction || reduction > bestAction.reduction) {
                    bestAction = {
                      type: "swap",
                      classId,
                      dSrc,
                      pSrc,
                      dDst,
                      pDst,
                      reduction
                    };
                  }
                }
              }
            }
          }
        }
      }
    }

    if (bestAction) {
      const { type, classId, dSrc, pSrc, dDst, pDst } = bestAction;
      if (type === "move") {
        tempSchedule[classId][dDst][pDst] = tempSchedule[classId][dSrc][pSrc];
        tempSchedule[classId][dSrc][pSrc] = null;
      } else {
        const temp = tempSchedule[classId][dDst][pDst];
        tempSchedule[classId][dDst][pDst] = tempSchedule[classId][dSrc][pSrc];
        tempSchedule[classId][dSrc][pSrc] = temp;
      }

      currentSingleDays = getTeacherSingleLessonDaysCount(tempSchedule, teacherId, state);
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
      message: `"${teacher.name}" öğretmeninin tek ders günleri başarıyla giderildi! Kalan tek dersli gün sayısı: ${currentSingleDays}`,
      type: "success"
    };
  } else {
    return {
      success: false,
      message: `"${teacher.name}" öğretmeninin tek ders günlerini birleştirmek veya diğer günleri buraya çekmek için uygun boş slot veya takas edilebilir ders bulunamadı.`,
      type: "error"
    };
  }
}
