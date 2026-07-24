import { ClassScheduleMap, AppState, Teacher, GradeClass, Classroom, Course, ScheduleSlot } from "../../types";
import { BlockToPlace } from "./types";
import { parseTeacherIds } from "./helpers";

// Deterministic Seeding Support
let currentSeed = 123456789;

export function setRandomSeed(seed: number) {
  currentSeed = seed;
}

export function random(): number {
  let t = (currentSeed += 0x6D2B79F5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Fast deep cloning helper for schedules. Avoids expensive JSON conversions.
 */
export function cloneSchedule(src: ClassScheduleMap): ClassScheduleMap {
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
export function cloneOccupancy(src: Record<string, (string | null)[][]>, numDays: number): Record<string, (string | null)[][]> {
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

export function clearOccupancy(
  classId: string,
  d: number,
  p: number,
  slot: ScheduleSlot | null | undefined,
  teacherOccupancy: Record<string, (string | null)[][]>,
  classroomOccupancy: Record<string, (string | null)[][]>
) {
  if (!slot) return;
  if (slot.teacherId) {
    const tIds = parseTeacherIds(slot.teacherId);
    for (const tId of tIds) {
      if (teacherOccupancy[tId]?.[d]) {
        teacherOccupancy[tId][d][p] = null;
      }
    }
  }
  if (slot.classroomId && classroomOccupancy[slot.classroomId]?.[d]) {
    classroomOccupancy[slot.classroomId][d][p] = null;
  }
}

export function registerOccupancy(
  classId: string,
  d: number,
  p: number,
  slot: ScheduleSlot | null | undefined,
  teacherOccupancy: Record<string, (string | null)[][]>,
  classroomOccupancy: Record<string, (string | null)[][]>
) {
  if (!slot) return;
  if (slot.teacherId) {
    const tIds = parseTeacherIds(slot.teacherId);
    for (const tId of tIds) {
      if (teacherOccupancy[tId]?.[d]) {
        teacherOccupancy[tId][d][p] = classId;
      }
    }
  }
  if (slot.classroomId && classroomOccupancy[slot.classroomId]?.[d]) {
    classroomOccupancy[slot.classroomId][d][p] = classId;
  }
}

export function isSlotLocked(
  slot: ScheduleSlot | null,
  coursesMap: Map<string, Course>,
  lockedAssignmentIds: Set<string>,
  isAggressiveOrDeepActive: boolean,
  priorityAssignmentIds?: string[]
): boolean {
  if (!slot) return false;
  if (slot.isLocked === true) return true;
  if (lockedAssignmentIds.has(slot.assignmentId) && !isAggressiveOrDeepActive) return true;
  if (priorityAssignmentIds && priorityAssignmentIds.includes(slot.assignmentId)) return true;
  return false;
}

export function validateSchedule(
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

export function getConsecutiveBlockSlots(
  schedule: ClassScheduleMap,
  classId: string,
  d: number,
  p: number,
  assignmentId: string
): { slot: ScheduleSlot; d: number; p: number; classId: string }[] {
  const slots: { slot: ScheduleSlot; d: number; p: number; classId: string }[] = [];
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
      slots.push({ slot: s, d, p: i, classId });
    }
  }
  return slots;
}

export function getBlockTier(b: BlockToPlace, coursesMap: Map<string, Course>): number {
  if (b.assignment.classroomId !== null) {
    return 3; // Tier 3: Atölye ve laboratuvar dersleri en son aşamada yerleştirilir.
  }
  return 1; // Tier 1: Standart teorik dersler ilk aşamada yerleştirilir.
}

export function getScheduledAssignmentIds(schedule: ClassScheduleMap, numDays: number, numPeriods: number): Set<string> {
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

export function getStrictEmptyDomainSize(
  block: BlockToPlace,
  schedule: ClassScheduleMap,
  teacherOccupancy: Record<string, (string | null)[][]>,
  classroomOccupancy: Record<string, (string | null)[][]>,
  settings: AppState['settings'],
  teachersMap: Map<string, Teacher>,
  classesMap: Map<string, GradeClass>,
  classroomsMap: Map<string, Classroom>,
  coursesMap: Map<string, Course>,
  globalAllowSameDaySameCourse: boolean,
  options?: any
): number {
  const classId = block.assignment.classId;
  const classObj = classesMap.get(classId);
  if (!classObj) return 0;

  const numDays = settings.days.length;
  const numPeriods = settings.periodsPerDay;
  let emptySlots = 0;

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
        
        // Sınıfın bu saati DOLU ise boş DEĞİLDİR (chain shift kabul etmiyoruz)
        if (schedule[classId]?.[d]?.[period] !== null && schedule[classId]?.[d]?.[period] !== undefined) {
          valid = false;
          break;
        }

        // Strict different days constraint check
        const classDaySched = schedule[classId]?.[d];
        if (classDaySched) {
          const hasOtherSameCourse = classDaySched.some((s, sIdx) => 
            s !== null && 
            s.courseId === block.assignment.courseId && 
            (sIdx < p || sIdx >= p + block.size)
          );
          if (hasOtherSameCourse && !globalAllowSameDaySameCourse && (!options?.priorityAssignmentIds || !options.priorityAssignmentIds.includes(block.assignment.id))) {
            valid = false;
            break;
          }
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
            // Öğretmen bu saatte DOLU ise boş DEĞİLDİR
            if (occupiedByClassId !== null && occupiedByClassId !== undefined) {
              valid = false;
              break;
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
          // Derslik DOLU ise boş DEĞİLDİR
          if (occupiedByClassId !== null && occupiedByClassId !== undefined) {
            valid = false;
            break;
          }
        }
      }
      if (valid) {
        emptySlots++;
      }
    }
  }
  return emptySlots;
}

export function getRemainingDomainSize(
  block: BlockToPlace,
  schedule: ClassScheduleMap,
  teacherOccupancy: Record<string, (string | null)[][]>,
  classroomOccupancy: Record<string, (string | null)[][]>,
  settings: AppState["settings"],
  teachersMap: Map<string, Teacher>,
  classesMap: Map<string, GradeClass>,
  classroomsMap: Map<string, Classroom>,
  coursesMap: Map<string, Course>,
  globalAllowSameDaySameCourse: boolean,
  lockedAssignmentIds: Set<string>,
  isAggressiveOrDeepActive: boolean,
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
          if (hasOtherSameCourse && !globalAllowSameDaySameCourse && (!options?.priorityAssignmentIds || !options.priorityAssignmentIds.includes(block.assignment.id))) {
            valid = false;
            break;
          }
        }

        const existingSlot = schedule[classId]?.[d]?.[period];
        if (existingSlot && isSlotLocked(existingSlot, coursesMap, lockedAssignmentIds, isAggressiveOrDeepActive, options?.priorityAssignmentIds)) {
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
              if (occupiedSlot && isSlotLocked(occupiedSlot, coursesMap, lockedAssignmentIds, isAggressiveOrDeepActive, options?.priorityAssignmentIds)) {
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
            if (occupiedSlot && isSlotLocked(occupiedSlot, coursesMap, lockedAssignmentIds, isAggressiveOrDeepActive, options?.priorityAssignmentIds)) {
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
