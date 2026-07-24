import { AppState, Teacher, GradeClass, Classroom, Course, LessonAssignment, ClassScheduleMap, ScheduleSlot } from "../../types";
import { BlockToPlace } from "./types";
import { parseTeacherIds } from "./helpers";
import { clearOccupancy, registerOccupancy, getConsecutiveBlockSlots } from "./utils";

/**
 * Checks placement validity inside the worker with O(1) occupancy lookups.
 */
export function isPlacementValidEx(
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
  classIdToIgnoreTeacherCheck?: string,
  options?: any,
  globalAllowSameDaySameCourse: boolean = false
): boolean {
  const { settings } = state;
  const numPeriods = settings.periodsPerDay;

  if (startPeriod + blockSize > numPeriods) return false;

  const classItem = classesMap.get(assignment.classId);

  const isSlotLockedInPlacement = (slot: ScheduleSlot): boolean => {
    if (slot.isLocked === true) return true;
    const assignmentObj = state.assignments.find(a => a.id === slot.assignmentId);
    if (assignmentObj && (assignmentObj as any).isLocked === true) return true;
    return false;
  };

  // Strict different days constraint check - different blocks of same course must go to different days
  const classDaySched = tempSchedule[assignment.classId]?.[dayIndex];
  if (classDaySched) {
    for (let p = 0; p < numPeriods; p++) {
      const slot = classDaySched[p];
      if (slot !== null && slot.courseId === assignment.courseId) {
        const isAssignmentForcedSameDay = (assignment as any)._forceSameDay === true;
        const needsMultipleBlocksPerDay = assignment.weeklyHours > settings.days.length;
        if (!globalAllowSameDaySameCourse && !isAssignmentForcedSameDay && !needsMultipleBlocksPerDay && (!options?.priorityAssignmentIds || !options.priorityAssignmentIds.includes(assignment.id))) {
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
 * Highly optimized Backtracking swap mechanism using constant-time occupancy maps.
 */
export function tryBacktrackingSwap(
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
  lockedAssignmentIds: Set<string>,
  globalAllowSameDaySameCourse: boolean,
  priorityAssignmentIds?: string[]
): boolean {
  const classId = block.assignment.classId;
  const classObj = classesMap.get(classId);
  if (!classObj) return false;

  const isSlotLocked = (slot: ScheduleSlot | null): boolean => {
    if (!slot) return false;
    if (slot.isLocked === true) return true;
    if (lockedAssignmentIds.has(slot.assignmentId)) return true;
    if (priorityAssignmentIds && priorityAssignmentIds.includes(slot.assignmentId)) return true;
    
    const assignmentObj = assignments.find(a => a.id === slot.assignmentId);
    if (assignmentObj && (assignmentObj as any).isLocked === true) return true;

    const course = coursesMap.get(slot.courseId);
    // Şeflik ve koordinatörlük kilitlenme kontrolü devre dışı bırakıldı

    return false;
  };

  const candidates: { 
    d: number; 
    p: number; 
    conflicts: { slot: ScheduleSlot; d: number; p: number; classId: string }[] 
  }[] = [];

  for (let d = 0; d < numDays; d++) {
    for (let p = 0; p <= numPeriods - block.size; p++) {
      let canPlaceHere = true;
      const rawConflicts: { slot: ScheduleSlot; d: number; p: number; classId: string }[] = [];

      for (let offset = 0; offset < block.size; offset++) {
        const period = p + offset;

        // Check class unavailability & period limits
        if (classObj.unavailability[d]?.[period] === true) {
          canPlaceHere = false;
          break;
        }
        if (classObj.dailyPeriods && classObj.dailyPeriods[d] !== undefined && period >= classObj.dailyPeriods[d]) {
          canPlaceHere = false;
          break;
        }

        // 1. Direct class conflicts
        const slotInClass = schedule[classId]?.[d]?.[period];
        if (slotInClass) {
          if (isSlotLocked(slotInClass)) {
            canPlaceHere = false;
            break;
          }
          // Gather consecutive slots for this block
          const blockSlots = getConsecutiveBlockSlots(schedule, classId, d, period, slotInClass.assignmentId);
          for (const bs of blockSlots) {
            if (isSlotLocked(bs.slot)) {
              canPlaceHere = false;
              break;
            }
            if (!rawConflicts.some(rc => rc.slot.assignmentId === bs.slot.assignmentId && rc.d === bs.d && rc.p === bs.p)) {
              rawConflicts.push(bs);
            }
          }
          if (!canPlaceHere) break;
        }

        // 2. Teacher conflicts in other classes
        if (block.assignment.teacherId) {
          const teacherIds = parseTeacherIds(block.assignment.teacherId);
          for (const tId of teacherIds) {
            const teacher = teachersMap.get(tId);
            if (teacher?.unavailability[d]?.[period] === true) {
              canPlaceHere = false;
              break;
            }

            const occupiedByClassId = teacherOccupancy[tId]?.[d]?.[period];
            if (occupiedByClassId !== null && occupiedByClassId !== undefined && occupiedByClassId !== classId) {
              const occupiedSlot = schedule[occupiedByClassId]?.[d]?.[period];
              if (occupiedSlot) {
                if (isSlotLocked(occupiedSlot)) {
                  canPlaceHere = false;
                  break;
                }
                const blockSlots = getConsecutiveBlockSlots(schedule, occupiedByClassId, d, period, occupiedSlot.assignmentId);
                for (const bs of blockSlots) {
                  if (isSlotLocked(bs.slot)) {
                    canPlaceHere = false;
                    break;
                  }
                  if (!rawConflicts.some(rc => rc.slot.assignmentId === bs.slot.assignmentId && rc.d === bs.d && rc.p === bs.p)) {
                    rawConflicts.push(bs);
                  }
                }
                if (!canPlaceHere) break;
              }
            }
          }
          if (!canPlaceHere) break;
        }

        // 3. Classroom conflicts in other classes
        if (block.assignment.classroomId) {
          const classroom = classroomsMap.get(block.assignment.classroomId);
          if (classroom?.unavailability[d]?.[period] === true) {
            canPlaceHere = false;
            break;
          }

          const occupiedByClassId = classroomOccupancy[block.assignment.classroomId]?.[d]?.[period];
          if (occupiedByClassId !== null && occupiedByClassId !== undefined && occupiedByClassId !== classId) {
            const occupiedSlot = schedule[occupiedByClassId]?.[d]?.[period];
            if (occupiedSlot) {
              if (isSlotLocked(occupiedSlot)) {
                canPlaceHere = false;
                break;
              }
              const blockSlots = getConsecutiveBlockSlots(schedule, occupiedByClassId, d, period, occupiedSlot.assignmentId);
              for (const bs of blockSlots) {
                if (isSlotLocked(bs.slot)) {
                  canPlaceHere = false;
                  break;
                }
                if (!rawConflicts.some(rc => rc.slot.assignmentId === bs.slot.assignmentId && rc.d === bs.d && rc.p === bs.p)) {
                  rawConflicts.push(bs);
                }
              }
              if (!canPlaceHere) break;
            }
          }
          if (!canPlaceHere) break;
        }
      }

      if (canPlaceHere) {
        candidates.push({ d, p, conflicts: rawConflicts });
      }
    }
  }

  // Sort candidates so we prefer the ones with fewer conflicts to resolve
  candidates.sort((a, b) => a.conflicts.length - b.conflicts.length);

  for (const cand of candidates) {
    const { d, p, conflicts: rawConflicts } = cand;

    // Group raw conflicts into unique consecutive blocks
    const groupedConflicts = new Map<string, { classId: string; assignmentId: string; d: number; pStart: number; slots: any[] }>();
    for (const c of rawConflicts) {
      const key = `${c.classId}_${c.slot.assignmentId}_${c.d}`;
      if (!groupedConflicts.has(key)) {
        groupedConflicts.set(key, {
          classId: c.classId,
          assignmentId: c.slot.assignmentId,
          d: c.d,
          pStart: c.p,
          slots: [c]
        });
      } else {
        const existing = groupedConflicts.get(key)!;
        existing.slots.push(c);
      }
    }

    const uniqueConflicts: { classId: string; assignmentId: string; d: number; pStart: number; size: number; slot: ScheduleSlot }[] = [];
    for (const [key, item] of groupedConflicts.entries()) {
      const pStart = Math.min(...item.slots.map(s => s.p));
      const pEnd = Math.max(...item.slots.map(s => s.p));
      uniqueConflicts.push({
        classId: item.classId,
        assignmentId: item.assignmentId,
        d: item.d,
        pStart: pStart,
        size: pEnd - pStart + 1,
        slot: item.slots[0].slot
      });
    }

    // 1. Save original states of all affected slots to revert in case of failure
    const originalSlots: { classId: string; d: number; p: number; slot: ScheduleSlot | null }[] = [];
    
    // Original slots of the conflicts
    for (const c of uniqueConflicts) {
      for (let offset = 0; offset < c.size; offset++) {
        const period = c.pStart + offset;
        const s = schedule[c.classId]?.[c.d]?.[period] ?? null;
        originalSlots.push({ classId: c.classId, d: c.d, p: period, slot: s });
      }
    }
    // Original slots of the primary block's target range (should be null or part of conflicts)
    for (let offset = 0; offset < block.size; offset++) {
      const period = p + offset;
      const s = schedule[classId]?.[d]?.[period] ?? null;
      if (!originalSlots.some(os => os.classId === classId && os.d === d && os.p === period)) {
        originalSlots.push({ classId, d, p: period, slot: s });
      }
    }

    // 2. Temporarily clear conflicts from schedule and occupancy
    for (const c of uniqueConflicts) {
      for (let offset = 0; offset < c.size; offset++) {
        const period = c.pStart + offset;
        const slotInSched = schedule[c.classId]?.[c.d]?.[period];
        if (slotInSched && slotInSched.assignmentId === c.assignmentId) {
          schedule[c.classId][c.d][period] = null;
          clearOccupancy(c.classId, c.d, period, slotInSched, teacherOccupancy, classroomOccupancy);
        }
      }
    }

    // 3. Try to place our primary block
    const isPrimaryValid = isPlacementValidEx(
      state,
      teachersMap,
      classesMap,
      classroomsMap,
      schedule,
      teacherOccupancy,
      classroomOccupancy,
      block.assignment,
      d,
      p,
      block.size,
      undefined,
      { priorityAssignmentIds },
      globalAllowSameDaySameCourse
    );

    if (isPrimaryValid) {
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

      // 4. Relocate each conflict Rubik-style!
      let allConflictsRelocated = true;
      const relocatedConflicts: { classId: string; d: number; p: number; size: number; slot: ScheduleSlot }[] = [];

      for (const c of uniqueConflicts) {
        const confAssign = assignments.find(a => a.id === c.assignmentId);
        if (!confAssign) {
          allConflictsRelocated = false;
          break;
        }

        let foundNewHome = false;
        const classObjConf = classesMap.get(c.classId);
        if (classObjConf) {
          // Search for any valid empty space in its class's schedule
          for (let nd = 0; nd < numDays && !foundNewHome; nd++) {
            for (let np = 0; np <= numPeriods - c.size && !foundNewHome; np++) {
              // Ensure we don't try to put it back exactly where it was
              if (nd === c.d && np === c.pStart) continue;

              let spaceAvailable = true;
              for (let offset = 0; offset < c.size; offset++) {
                const curPeriod = np + offset;
                if (schedule[c.classId]?.[nd]?.[curPeriod] !== null) {
                  spaceAvailable = false;
                  break;
                }
                if (classObjConf.unavailability[nd]?.[curPeriod] === true) {
                  spaceAvailable = false;
                  break;
                }
                if (classObjConf.dailyPeriods && classObjConf.dailyPeriods[nd] !== undefined && curPeriod >= classObjConf.dailyPeriods[nd]) {
                  spaceAvailable = false;
                  break;
                }
              }

              if (spaceAvailable) {
                // Check teacher/classroom/day constraints O(1)
                const isAltValid = isPlacementValidEx(
                  state,
                  teachersMap,
                  classesMap,
                  classroomsMap,
                  schedule,
                  teacherOccupancy,
                  classroomOccupancy,
                  confAssign,
                  nd,
                  np,
                  c.size,
                  undefined,
                  { priorityAssignmentIds },
                  globalAllowSameDaySameCourse
                );

                if (isAltValid) {
                  // Relocate this conflict!
                  for (let offset = 0; offset < c.size; offset++) {
                    const curPeriod = np + offset;
                    schedule[c.classId][nd][curPeriod] = c.slot;
                    registerOccupancy(c.classId, nd, curPeriod, c.slot, teacherOccupancy, classroomOccupancy);
                  }
                  relocatedConflicts.push({ classId: c.classId, d: nd, p: np, size: c.size, slot: c.slot });
                  foundNewHome = true;
                }
              }
            }
          }
        }

        if (!foundNewHome) {
          allConflictsRelocated = false;
          break;
        }
      }

      if (allConflictsRelocated) {
        return true; // SUCCESS! All conflicts relocated successfully and primary block is placed.
      }

      // Revert relocated conflicts
      for (const rc of relocatedConflicts) {
        for (let offset = 0; offset < rc.size; offset++) {
          const curPeriod = rc.p + offset;
          schedule[rc.classId][rc.d][curPeriod] = null;
          clearOccupancy(rc.classId, rc.d, curPeriod, rc.slot, teacherOccupancy, classroomOccupancy);
        }
      }

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

    // 5. Restore original slots & occupancy if this candidate failed
    for (const os of originalSlots) {
      if (os.slot) {
        schedule[os.classId][os.d][os.p] = os.slot;
        registerOccupancy(os.classId, os.d, os.p, os.slot, teacherOccupancy, classroomOccupancy);
      } else {
        schedule[os.classId][os.d][os.p] = null;
      }
    }
  }

  return false;
}

export function tryManualChainShift(
  state: AppState,
  assignmentId: string,
  targetD: number,
  targetP: number,
  sourceD: number = -1,
  sourceP: number = -1,
  maxDepth: number = 8
): ClassScheduleMap | null {
  const settings = state.settings;
  const numDays = settings.days.length;
  const numPeriods = settings.periodsPerDay;

  const assignmentsMap = new Map<string, LessonAssignment>(state.assignments.map(a => [a.id, a]));
  const classesMap = new Map<string, GradeClass>(state.classes.map(c => [c.id, c]));
  const teachersMap = new Map<string, Teacher>(state.teachers.map(t => [t.id, t]));
  const classroomsMap = new Map<string, Classroom>(state.classrooms.map(cr => [cr.id, cr]));

  const assignment = assignmentsMap.get(assignmentId);
  if (!assignment) return null;

  const classId = assignment.classId;
  const classObj = classesMap.get(classId);
  if (!classObj) return null;

  const cloneSchedule = (sched: ClassScheduleMap): ClassScheduleMap => {
    const copy: ClassScheduleMap = {};
    for (const cId of Object.keys(sched)) {
      copy[cId] = {};
      for (const d of Object.keys(sched[cId])) {
        copy[cId][parseInt(d)] = [...sched[cId][parseInt(d)]];
      }
    }
    return copy;
  };

  const isSlotLockedInPlacement = (slot: ScheduleSlot): boolean => {
    if (slot.isLocked === true) return true;
    const assignmentObj = assignmentsMap.get(slot.assignmentId);
    if (assignmentObj && (assignmentObj as any).isLocked === true) return true;
    const course = state.courses.find(c => c.id === slot.courseId);
    // Şeflik ve koordinatörlük kilitlenme kontrolü devre dışı bırakıldı
    return false;
  };

  const dfs = (
    sched: ClassScheduleMap,
    assignId: string,
    toD: number,
    toP: number,
    fromD: number,
    fromP: number,
    visited: Set<string>
  ): ClassScheduleMap | null => {
    if (visited.has(assignId)) return null;
    const curAssign = assignmentsMap.get(assignId);
    if (!curAssign) return null;

    const cId = curAssign.classId;
    const clObj = classesMap.get(cId);
    if (!clObj) return null;

    if (toD < 0 || toD >= numDays || toP < 0 || toP >= numPeriods) return null;
    if (clObj.unavailability[toD]?.[toP] === true) return null;
    if (clObj.dailyPeriods && clObj.dailyPeriods[toD] !== undefined && toP >= clObj.dailyPeriods[toD]) return null;

    if (curAssign.teacherId) {
      const teacherIds = parseTeacherIds(curAssign.teacherId);
      for (const tId of teacherIds) {
        const teacher = teachersMap.get(tId);
        if (teacher?.unavailability[toD]?.[toP] === true) return null;
      }
    }

    if (curAssign.classroomId) {
      const classroom = classroomsMap.get(curAssign.classroomId);
      if (classroom?.unavailability[toD]?.[toP] === true) return null;
    }

    const nextSched = cloneSchedule(sched);

    if (fromD !== -1 && fromP !== -1) {
      if (nextSched[cId]?.[fromD]?.[fromP]?.assignmentId === assignId) {
        nextSched[cId][fromD][fromP] = null;
      }
    }

    const conflicts: { slot: ScheduleSlot; classId: string; d: number; p: number }[] = [];

    const existingClassSlot = nextSched[cId]?.[toD]?.[toP];
    if (existingClassSlot && existingClassSlot.assignmentId !== assignId) {
      if (isSlotLockedInPlacement(existingClassSlot)) return null;
      conflicts.push({ slot: existingClassSlot, classId: cId, d: toD, p: toP });
    }

    if (curAssign.teacherId) {
      const teacherIds = parseTeacherIds(curAssign.teacherId);
      for (const tId of teacherIds) {
        for (const otherClassId of Object.keys(nextSched)) {
          if (otherClassId === cId) continue;
          const otherSlot = nextSched[otherClassId]?.[toD]?.[toP];
          if (otherSlot && otherSlot.teacherId && otherSlot.assignmentId !== assignId) {
            const otherTIds = parseTeacherIds(otherSlot.teacherId);
            if (otherTIds.includes(tId)) {
              if (isSlotLockedInPlacement(otherSlot)) return null;
              if (!conflicts.some(c => c.slot.assignmentId === otherSlot.assignmentId)) {
                conflicts.push({ slot: otherSlot, classId: otherClassId, d: toD, p: toP });
              }
            }
          }
        }
      }
    }

    if (curAssign.classroomId) {
      for (const otherClassId of Object.keys(nextSched)) {
        if (otherClassId === cId) continue;
        const otherSlot = nextSched[otherClassId]?.[toD]?.[toP];
        if (otherSlot && otherSlot.classroomId === curAssign.classroomId && otherSlot.assignmentId !== assignId) {
          if (isSlotLockedInPlacement(otherSlot)) return null;
          if (!conflicts.some(c => c.slot.assignmentId === otherSlot.assignmentId)) {
            conflicts.push({ slot: otherSlot, classId: otherClassId, d: toD, p: toP });
          }
        }
      }
    }

    if (conflicts.length === 0) {
      if (!nextSched[cId]) nextSched[cId] = {};
      if (!nextSched[cId][toD]) nextSched[cId][toD] = Array(numPeriods).fill(null);
      nextSched[cId][toD][toP] = {
        assignmentId: assignId,
        courseId: curAssign.courseId,
        teacherId: curAssign.teacherId,
        classroomId: curAssign.classroomId
      };
      return nextSched;
    }

    if (visited.size >= maxDepth) return null;

    const nextVisited = new Set(visited);
    nextVisited.add(assignId);

    let currentSchedState = nextSched;

    for (const conf of conflicts) {
      const confAssignId = conf.slot.assignmentId;
      const confAssign = assignmentsMap.get(confAssignId);
      if (!confAssign) return null;

      const confClassId = confAssign.classId;
      const confClassObj = classesMap.get(confClassId);
      if (!confClassObj) return null;

      let resolved = false;
      const candidates: { d: number; p: number; score: number }[] = [];

      for (let altD = 0; altD < numDays; altD++) {
        if (confClassObj.unavailability[altD]?.every(p => p === true)) continue;

        for (let altP = 0; altP < numPeriods; altP++) {
          if (altD === conf.d && altP === conf.p) continue;
          if (altD === toD && altP === toP) continue;

          if (confClassObj.unavailability[altD]?.[altP] === true) continue;
          if (confClassObj.dailyPeriods && confClassObj.dailyPeriods[altD] !== undefined && altP >= confClassObj.dailyPeriods[altD]) continue;

          const targetSlot = currentSchedState[confClassId]?.[altD]?.[altP];
          let score = 0;
          if (targetSlot === null || targetSlot === undefined) {
            score = 0;
          } else {
            if (isSlotLockedInPlacement(targetSlot)) continue;
            score = 10;
          }

          candidates.push({ d: altD, p: altP, score });
        }
      }

      candidates.sort((a, b) => a.score - b.score);

      let bestSchedResult: ClassScheduleMap | null = null;
      for (const cand of candidates) {
        const resultSched = dfs(
          currentSchedState,
          confAssignId,
          cand.d,
          cand.p,
          conf.d,
          conf.p,
          nextVisited
        );
        if (resultSched !== null) {
          bestSchedResult = resultSched;
          resolved = true;
          break;
        }
      }

      if (!resolved || !bestSchedResult) {
        return null;
      }

      currentSchedState = bestSchedResult;
    }

    if (!currentSchedState[cId]) currentSchedState[cId] = {};
    if (!currentSchedState[cId][toD]) currentSchedState[cId][toD] = Array(numPeriods).fill(null);
    currentSchedState[cId][toD][toP] = {
      assignmentId: assignId,
      courseId: curAssign.courseId,
      teacherId: curAssign.teacherId,
      classroomId: curAssign.classroomId
    };

    return currentSchedState;
  };

  return dfs(state.schedule, assignmentId, targetD, targetP, sourceD, sourceP, new Set<string>());
}
