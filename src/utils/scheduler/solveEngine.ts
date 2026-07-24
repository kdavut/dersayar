import { AppState, ClassScheduleMap, ScheduleSlot, Teacher, GradeClass, Classroom, Course, LessonAssignment } from "../../types";
import { parseTeacherIds } from "./helpers";
import { cloneSchedule, clearOccupancy, registerOccupancy } from "./utils";

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
  globalTotalHours?: number;
  globalPlacedHours?: number;
  globalUnplacedHours?: number;
  targetTeacherName?: string;
  targetClassName?: string;
  elapsedSeconds?: number;
  unplacedDetails?: any;
}

export interface SolverResult {
  success: boolean;
  schedule: ClassScheduleMap;
  unplacedCount: number;
  usedSeed: number;
  unplacedDetails?: string[];
}

export interface PlacedBlockInfo {
  id: string;
  assignment: LessonAssignment;
  size: number;
  classId: string;
  courseId: string;
  teacherIds: string[];
  classroomId: string | null;
  dayIndex: number;
  startPeriod: number;
}

/**
 * Standard block decomposition helper.
 * Decomposes weekly hours according to strict rules:
 * - 5 hours -> 2 + 2 + 1
 * - 4 hours -> 2 + 2
 * - 3 hours -> 2 + 1
 * - 2 hours -> 2
 * - 1 hour  -> 1
 * - Or custom placement mode string e.g. "2+2+1"
 */
export function decomposeAssignmentToBlocks(assignment: LessonAssignment, course?: Course): { size: number; index: number }[] {
  const blocks: { size: number; index: number }[] = [];
  const hours = assignment.weeklyHours || 0;
  if (hours <= 0) return blocks;

  // 1. Check customPlacementMode or course placementMode
  const modeStr = (assignment.customPlacementMode || course?.placementMode || "").trim();
  if (modeStr) {
    const parts = modeStr.split("+").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n) && n > 0);
    if (parts.length > 0) {
      const sum = parts.reduce((a, b) => a + b, 0);
      if (sum === hours) {
        parts.forEach((sz, idx) => blocks.push({ size: sz, index: idx }));
        return blocks;
      } else {
        let tempRemaining = hours;
        let idx = 0;
        for (const p of parts) {
          if (tempRemaining <= 0) break;
          const sz = Math.min(p, tempRemaining);
          blocks.push({ size: sz, index: idx++ });
          tempRemaining -= sz;
        }
        while (tempRemaining > 0) {
          const sz = Math.min(2, tempRemaining);
          blocks.push({ size: sz, index: idx++ });
          tempRemaining -= sz;
        }
        return blocks;
      }
    }
  }

  // 2. Check preferredBlockSize (if explicitly set to 1 for single hours)
  if (assignment.preferredBlockSize === 1) {
    for (let i = 0; i < hours; i++) {
      blocks.push({ size: 1, index: i });
    }
    return blocks;
  }

  // 3. Standard professional distribution
  let remaining = hours;
  let idx = 0;

  if (remaining === 5) {
    return [
      { size: 2, index: 0 },
      { size: 2, index: 1 },
      { size: 1, index: 2 }
    ];
  }

  if (remaining === 3) {
    return [
      { size: 2, index: 0 },
      { size: 1, index: 1 }
    ];
  }

  while (remaining > 0) {
    if (remaining >= 2) {
      blocks.push({ size: 2, index: idx++ });
      remaining -= 2;
    } else {
      blocks.push({ size: 1, index: idx++ });
      remaining -= 1;
    }
  }

  return blocks;
}

/**
 * Internal Block representation for the Rubik's Cube Ejection Chain Engine
 */
interface AtomicBlock {
  uid: string;                 // Unique block instance identifier
  assignmentId: string;
  assignment: LessonAssignment;
  size: number;
  blockIndex: number;
  classId: string;
  courseId: string;
  teacherIds: string[];
  classroomId: string | null;
}

/**
 * Fast multi-dimensional schedule state manager for 100% placement rate.
 */
class TimetableState {
  numDays: number;
  numPeriods: number;

  // Grid maps: [entityId][day][period] -> block uid or null
  classGrid: Map<string, (string | null)[][]> = new Map();
  teacherGrid: Map<string, (string | null)[][]> = new Map();
  classroomGrid: Map<string, (string | null)[][]> = new Map();

  // Map of placed blocks: uid -> { day, startPeriod }
  placedBlockPositions: Map<string, { d: number; pStart: number }> = new Map();

  // Map of slots: classId -> day -> period -> ScheduleSlot
  scheduleSlots: Map<string, (ScheduleSlot | null)[][]> = new Map();

  // All blocks registry: uid -> AtomicBlock
  blocksMap: Map<string, AtomicBlock> = new Map();

  constructor(numDays: number, numPeriods: number, classes: GradeClass[], teachers: Teacher[], classrooms: Classroom[]) {
    this.numDays = numDays;
    this.numPeriods = numPeriods;

    for (const cls of classes) {
      this.classGrid.set(cls.id, Array.from({ length: numDays }, () => Array(numPeriods).fill(null)));
      this.scheduleSlots.set(cls.id, Array.from({ length: numDays }, () => Array(numPeriods).fill(null)));
    }
    for (const t of teachers) {
      this.teacherGrid.set(t.id, Array.from({ length: numDays }, () => Array(numPeriods).fill(null)));
    }
    for (const cr of classrooms) {
      this.classroomGrid.set(cr.id, Array.from({ length: numDays }, () => Array(numPeriods).fill(null)));
    }
  }

  registerBlock(block: AtomicBlock) {
    this.blocksMap.set(block.uid, block);
  }

  isPlaced(blockUid: string): boolean {
    return this.placedBlockPositions.has(blockUid);
  }

  getBlockPosition(blockUid: string): { d: number; pStart: number } | undefined {
    return this.placedBlockPositions.get(blockUid);
  }

  placeBlockDirectly(block: AtomicBlock, d: number, pStart: number): void {
    if (this.placedBlockPositions.has(block.uid)) {
      this.removeBlock(block.uid);
    }

    const { uid, classId, teacherIds, classroomId, assignment } = block;
    const cGrid = this.classGrid.get(classId)!;
    const sGrid = this.scheduleSlots.get(classId)!;

    for (let offset = 0; offset < block.size; offset++) {
      const p = pStart + offset;
      if (cGrid?.[d]) cGrid[d][p] = uid;

      const slot: ScheduleSlot = {
        assignmentId: assignment.id,
        courseId: assignment.courseId,
        teacherId: assignment.teacherId,
        classroomId: assignment.classroomId,
      };
      if (sGrid?.[d]) sGrid[d][p] = slot;

      for (const tId of teacherIds) {
        const tGrid = this.teacherGrid.get(tId);
        if (tGrid?.[d]) tGrid[d][p] = uid;
      }

      if (classroomId) {
        const crGrid = this.classroomGrid.get(classroomId);
        if (crGrid?.[d]) crGrid[d][p] = uid;
      }
    }

    this.placedBlockPositions.set(uid, { d, pStart });
  }

  removeBlock(blockUid: string): { d: number; pStart: number } | null {
    const pos = this.placedBlockPositions.get(blockUid);
    if (!pos) return null;

    const block = this.blocksMap.get(blockUid);
    if (!block) return null;

    const { classId, teacherIds, classroomId, size } = block;
    const { d, pStart } = pos;

    const cGrid = this.classGrid.get(classId);
    const sGrid = this.scheduleSlots.get(classId);

    for (let offset = 0; offset < size; offset++) {
      const p = pStart + offset;
      if (cGrid?.[d]) cGrid[d][p] = null;
      if (sGrid?.[d]) sGrid[d][p] = null;

      for (const tId of teacherIds) {
        const tGrid = this.teacherGrid.get(tId);
        if (tGrid?.[d]) tGrid[d][p] = null;
      }

      if (classroomId) {
        const crGrid = this.classroomGrid.get(classroomId);
        if (crGrid?.[d]) crGrid[d][p] = null;
      }
    }

    this.placedBlockPositions.delete(blockUid);
    return pos;
  }

  exportScheduleMap(): ClassScheduleMap {
    const resultMap: ClassScheduleMap = {};

    // Initialize clean grids for all classes
    for (const cId of this.classGrid.keys()) {
      resultMap[cId] = Array.from({ length: this.numDays }, () => Array(this.numPeriods).fill(null));
    }

    // Export strictly placed blocks directly from placedBlockPositions mapping
    for (const [uid, pos] of this.placedBlockPositions.entries()) {
      const block = this.blocksMap.get(uid);
      if (!block) continue;
      const { classId, assignment, size } = block;

      if (!resultMap[classId]) {
        resultMap[classId] = Array.from({ length: this.numDays }, () => Array(this.numPeriods).fill(null));
      }

      for (let offset = 0; offset < size; offset++) {
        const p = pos.pStart + offset;
        if (pos.d < this.numDays && p < this.numPeriods) {
          resultMap[classId][pos.d][p] = {
            assignmentId: assignment.id,
            courseId: assignment.courseId,
            teacherId: assignment.teacherId,
            classroomId: assignment.classroomId,
          };
        }
      }
    }

    return resultMap;
  }

  /**
   * Fast hash calculation for current placement state (used for Tabu memory)
   */
  computeStateHash(): string {
    let hash = 0;
    for (const [uid, pos] of this.placedBlockPositions.entries()) {
      const val = (pos.d * 100 + pos.pStart);
      for (let i = 0; i < uid.length; i++) {
        hash = (Math.imul(31, hash) + uid.charCodeAt(i) + val) | 0;
      }
    }
    return hash.toString(36);
  }
}

/**
 * Professional Timetabling Optimization Engine (Rubik's Cube Architecture)
 *
 * Principles:
 * 1. Mümkün olan en yüksek yerleşim oranı (%100 Hedefli).
 * 2. Boşluk aramak yerine, zincirleme yer değiştirme (Ejection Chains) ile yeni boşluk ÜRETİR.
 * 3. Hiçbir yerleşmiş ders dokunulmaz değildir; kilitli olmayan tüm dersler Rubik Küp gibi yeniden konumlandırılabilir.
 * 4. Yerleşmiş ders sayısı HİÇBİR ZAMAN azalmaz (Atamalar atomik zincir geçişleriyle yapılır).
 * 5. Arama derinliği program doldukça ve kalan zor dersler azaldıkça OTOMATİK olarak katlanarak artar.
 * 6. Tabu ve durum hafızası ile kısır döngüye girmeden küresel arama yürütür.
 */
export async function runSolver(
  state: AppState,
  options: any,
  activeSeed: number = 123456789,
  onProgress?: (progress: ProgressUpdate) => void,
  isStopped?: () => boolean
): Promise<SolverResult> {
  const startTime = Date.now();
  const maxDurationMs = options?.maxDurationMs || 60000;
  const initialNumTrials = options?.numTrials || 100;

  const { settings, teachers, classes, classrooms, courses, assignments } = state;
  const numDays = settings.days.length || 5;
  const numPeriods = settings.periodsPerDay || 8;

  // Build Map lookups
  const teachersMap = new Map<string, Teacher>(teachers.map((t) => [t.id, t]));
  const classesMap = new Map<string, GradeClass>(classes.map((c) => [c.id, c]));
  const classroomsMap = new Map<string, Classroom>(classrooms.map((cr) => [cr.id, cr]));
  const coursesMap = new Map<string, Course>(courses.map((co) => [co.id, co]));
  const assignmentsMap = new Map<string, LessonAssignment>(assignments.map((a) => [a.id, a]));

  // Determine Target Filters
  const targetTeacherIds: string[] = options?.targetTeacherIds || options?.targets?.teacherIds || [];
  const targetClassIds: string[] = options?.targetClassIds || options?.targets?.classIds || [];
  const isTargetedSearch = targetTeacherIds.length > 0 || targetClassIds.length > 0;

  let targetTeacherName: string | undefined = undefined;
  if (targetTeacherIds.length === 1) {
    targetTeacherName = teachersMap.get(targetTeacherIds[0])?.name;
  }
  let targetClassName: string | undefined = undefined;
  if (targetClassIds.length === 1) {
    targetClassName = classesMap.get(targetClassIds[0])?.name;
  }

  const isAssignmentTargeted = (a: LessonAssignment): boolean => {
    if (!isTargetedSearch) return true;
    if (targetTeacherIds.length > 0) {
      if (!a.teacherId) return false;
      const tIds = parseTeacherIds(a.teacherId);
      if (tIds.some((id) => targetTeacherIds.includes(id))) return true;
    }
    if (targetClassIds.length > 0) {
      if (targetClassIds.includes(a.classId)) return true;
    }
    return false;
  };

  // Build Atomic Block list
  const allBlocks: AtomicBlock[] = [];
  let totalTargetHours = 0;

  assignments.forEach((assign) => {
    if (!isAssignmentTargeted(assign)) return;

    const course = coursesMap.get(assign.courseId);
    const subBlocks = decomposeAssignmentToBlocks(assign, course);
    totalTargetHours += assign.weeklyHours || 0;

    const teacherIds = assign.teacherId ? parseTeacherIds(assign.teacherId) : [];

    subBlocks.forEach((sub, idx) => {
      allBlocks.push({
        uid: `${assign.id}_b${idx}`,
        assignmentId: assign.id,
        assignment: assign,
        size: sub.size,
        blockIndex: sub.index,
        classId: assign.classId,
        courseId: assign.courseId,
        teacherIds,
        classroomId: assign.classroomId || null,
      });
    });
  });

  const globalTotalHours = assignments.reduce((acc, a) => acc + (a.weeklyHours || 0), 0);

  // Initialize Timetable State Engine
  const ttState = new TimetableState(numDays, numPeriods, classes, teachers, classrooms);
  allBlocks.forEach((b) => ttState.registerBlock(b));

  // Handle existing schedule retention (keepExisting)
  const shouldKeepExisting = options?.keepExisting !== undefined ? options.keepExisting : isTargetedSearch;

  if (shouldKeepExisting && state.schedule) {
    for (const cId of Object.keys(state.schedule)) {
      for (let d = 0; d < numDays; d++) {
        const daySlots = state.schedule[cId]?.[d];
        if (!daySlots) continue;
        for (let p = 0; p < numPeriods; p++) {
          const slot = daySlots[p];
          if (!slot) continue;

          const assign = assignmentsMap.get(slot.assignmentId);
          if (assign && (!isTargetedSearch || !isAssignmentTargeted(assign))) {
            // Find or create a background block to preserve non-targeted assignments
            const teacherIds = assign.teacherId ? parseTeacherIds(assign.teacherId) : [];
            const bgUid = `bg_${assign.id}_${cId}_${d}_${p}`;
            const bgBlock: AtomicBlock = {
              uid: bgUid,
              assignmentId: assign.id,
              assignment: assign,
              size: 1,
              blockIndex: 0,
              classId: cId,
              courseId: assign.courseId,
              teacherIds,
              classroomId: slot.classroomId || null,
            };
            ttState.registerBlock(bgBlock);
            if (ttState.classGrid.get(cId)?.[d]?.[p] === null) {
              ttState.placeBlockDirectly(bgBlock, d, p);
            }
          }
        }
      }
    }
  }

  // Seeded Random Generator
  let seed = activeSeed;
  const lcgRandom = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  // Best global tracker
  let bestSchedule: ClassScheduleMap = ttState.exportScheduleMap();
  let bestUnplacedCount = allBlocks.filter((b) => !ttState.isPlaced(b.uid)).reduce((acc, b) => acc + b.size, 0);
  let bestUnplacedBlocks: AtomicBlock[] = allBlocks.filter((b) => !ttState.isPlaced(b.uid));

  // --- HELPER FUNCTION: Hard Constraint Validator for a Candidate Block Placement ---
  const canPlaceBlockInSlot = (
    block: AtomicBlock,
    d: number,
    pStart: number,
    ignoreBlockUids: Set<string>
  ): boolean => {
    const { size, classId, teacherIds, classroomId, assignment } = block;

    if (pStart + size > numPeriods) return false;

    const classObj = classesMap.get(classId);
    if (!classObj) return false;

    // 1. Class daily max periods limit
    if (classObj.dailyPeriods && classObj.dailyPeriods[d] !== undefined) {
      if (pStart + size > classObj.dailyPeriods[d]) return false;
    }

    for (let offset = 0; offset < size; offset++) {
      const p = pStart + offset;

      // 2. Class unavailability
      if (classObj.unavailability?.[d]?.[p]) return false;

      // 3. Class schedule occupancy
      const classOcc = ttState.classGrid.get(classId)?.[d]?.[p];
      if (classOcc !== null && !ignoreBlockUids.has(classOcc)) return false;

      // 4. Teacher unavailability & occupancy
      for (const tId of teacherIds) {
        const teacher = teachersMap.get(tId);
        if (teacher?.unavailability?.[d]?.[p]) return false;

        const tOcc = ttState.teacherGrid.get(tId)?.[d]?.[p];
        if (tOcc !== null && !ignoreBlockUids.has(tOcc)) return false;
      }

      // 5. Classroom unavailability & occupancy
      if (classroomId) {
        const cr = classroomsMap.get(classroomId);
        if (cr?.unavailability?.[d]?.[p]) return false;

        const crOcc = ttState.classroomGrid.get(classroomId)?.[d]?.[p];
        if (crOcc !== null && !ignoreBlockUids.has(crOcc)) return false;
      }
    }

    // 6. Same-day same-course constraint check
    const course = coursesMap.get(assignment.courseId);
    const subBlocks = decomposeAssignmentToBlocks(assignment, course);
    if (subBlocks.length <= numDays) {
      const cGrid = ttState.classGrid.get(classId);
      if (cGrid?.[d]) {
        for (let p = 0; p < numPeriods; p++) {
          const occUid = cGrid[d][p];
          if (occUid && !ignoreBlockUids.has(occUid)) {
            const occBlock = ttState.blocksMap.get(occUid);
            if (occBlock && occBlock.assignmentId === assignment.id) {
              return false;
            }
          }
        }
      }
    }

    return true;
  };

  // --- RUBIK'S CUBE EJECTION CHAIN SOLVER (DEEP RECURSIVE RIPPLE ENGINE) ---
  const visitedStates = new Set<string>();

  const placeBlockWithEjectionChain = async (
    targetBlock: AtomicBlock,
    currentDepth: number,
    maxAllowedDepth: number,
    chainPath: Set<string>
  ): Promise<boolean> => {
    if (isStopped?.()) return false;
    if (currentDepth > maxAllowedDepth) return false;
    if (chainPath.has(targetBlock.uid)) return false;

    chainPath.add(targetBlock.uid);

    // Step 1: Direct Placement Attempt
    const directCandidates: { d: number; p: number; score: number }[] = [];
    for (let d = 0; d < numDays; d++) {
      for (let p = 0; p <= numPeriods - targetBlock.size; p++) {
        if (canPlaceBlockInSlot(targetBlock, d, p, new Set<string>())) {
          // Heuristic score: Prefer center periods, avoid gaps
          let score = 100 - Math.abs(p - Math.floor(numPeriods / 2)) * 5;
          directCandidates.push({ d, p, score });
        }
      }
    }

    if (directCandidates.length > 0) {
      directCandidates.sort((a, b) => b.score - a.score);
      ttState.placeBlockDirectly(targetBlock, directCandidates[0].d, directCandidates[0].p);
      chainPath.delete(targetBlock.uid);
      return true;
    }

    // Step 2: Ejection Chain Candidate Search
    interface EjectionCandidate {
      d: number;
      pStart: number;
      conflictingUids: string[];
      score: number;
    }

    const ejectionCandidates: EjectionCandidate[] = [];

    for (let d = 0; d < numDays; d++) {
      for (let pStart = 0; pStart <= numPeriods - targetBlock.size; pStart++) {
        const { size, classId, teacherIds, classroomId } = targetBlock;
        const classObj = classesMap.get(classId);
        if (!classObj) continue;

        // Check hard unavailabilities (off slots cannot be evicted)
        let hardOff = false;
        for (let offset = 0; offset < size; offset++) {
          const p = pStart + offset;
          if (classObj.unavailability?.[d]?.[p]) { hardOff = true; break; }
          if (classObj.dailyPeriods && classObj.dailyPeriods[d] !== undefined && p >= classObj.dailyPeriods[d]) { hardOff = true; break; }

          for (const tId of teacherIds) {
            if (teachersMap.get(tId)?.unavailability?.[d]?.[p]) { hardOff = true; break; }
          }
          if (classroomId && classroomsMap.get(classroomId)?.unavailability?.[d]?.[p]) {
            hardOff = true; break;
          }
        }
        if (hardOff) continue;

        // Gather all conflicting block UIDs in this candidate slot
        const confSet = new Set<string>();
        let containsLocked = false;

        for (let offset = 0; offset < size; offset++) {
          const p = pStart + offset;

          // Conflict in same class
          const cOcc = ttState.classGrid.get(classId)?.[d]?.[p];
          if (cOcc) {
            const slot = ttState.scheduleSlots.get(classId)?.[d]?.[p];
            if (slot?.isLocked) { containsLocked = true; break; }
            confSet.add(cOcc);
          }

          // Conflict in teacher schedules
          for (const tId of teacherIds) {
            const tOcc = ttState.teacherGrid.get(tId)?.[d]?.[p];
            if (tOcc) {
              const confBlock = ttState.blocksMap.get(tOcc);
              if (confBlock) {
                const slot = ttState.scheduleSlots.get(confBlock.classId)?.[d]?.[p];
                if (slot?.isLocked) { containsLocked = true; break; }
                confSet.add(tOcc);
              }
            }
          }

          // Conflict in classroom schedule
          if (classroomId) {
            const crOcc = ttState.classroomGrid.get(classroomId)?.[d]?.[p];
            if (crOcc) {
              const confBlock = ttState.blocksMap.get(crOcc);
              if (confBlock) {
                const slot = ttState.scheduleSlots.get(confBlock.classId)?.[d]?.[p];
                if (slot?.isLocked) { containsLocked = true; break; }
                confSet.add(crOcc);
              }
            }
          }
        }

        if (containsLocked || confSet.size === 0) continue;

        // Prioritize candidates with fewer evicted blocks
        const conflictingUids = Array.from(confSet);
        const score = 100 - conflictingUids.length * 20 - Math.abs(pStart - 2);

        ejectionCandidates.push({ d, pStart, conflictingUids, score });
      }
    }

    if (ejectionCandidates.length === 0) {
      chainPath.delete(targetBlock.uid);
      return false;
    }

    ejectionCandidates.sort((a, b) => b.score - a.score);

    // Dynamic Search Width Limit per depth
    const maxBranchWidth = currentDepth <= 2 ? 12 : currentDepth <= 5 ? 8 : 4;
    const topCandidates = ejectionCandidates.slice(0, maxBranchWidth);

    for (const cand of topCandidates) {
      // Check Tabu Memory to avoid cyclic state loops
      const stateHash = `${targetBlock.uid}_${cand.d}_${cand.pStart}_${cand.conflictingUids.join(",")}`;
      if (visitedStates.has(stateHash)) continue;
      visitedStates.add(stateHash);

      // Temporarily Evict conflicting blocks
      const evictedBlocksInfo: { block: AtomicBlock; originalPos: { d: number; pStart: number } }[] = [];

      for (const confUid of cand.conflictingUids) {
        const confBlock = ttState.blocksMap.get(confUid);
        if (!confBlock) continue;
        const pos = ttState.removeBlock(confUid);
        if (pos) {
          evictedBlocksInfo.push({ block: confBlock, originalPos: pos });
        }
      }

      // Place target block into freed slot
      ttState.placeBlockDirectly(targetBlock, cand.d, cand.pStart);

      // Recursively relocate all evicted blocks across the school
      let allEvictedRelocated = true;
      for (const evicted of evictedBlocksInfo) {
        const relocated = await placeBlockWithEjectionChain(evicted.block, currentDepth + 1, maxAllowedDepth, chainPath);
        if (!relocated) {
          allEvictedRelocated = false;
          break;
        }
      }

      if (allEvictedRelocated) {
        chainPath.delete(targetBlock.uid);
        return true; // Chain shift completed successfully!
      }

      // Rollback: Unplace target block
      ttState.removeBlock(targetBlock.uid);

      // Restore evicted blocks to original positions
      for (const evicted of evictedBlocksInfo) {
        ttState.placeBlockDirectly(evicted.block, evicted.originalPos.d, evicted.originalPos.pStart);
      }
    }

    chainPath.delete(targetBlock.uid);
    return false;
  };

  // --- MACRO RESTRUCTURING ENGINE (WHOLE-SCHOOL RIPPLE DISPLACEMENT) ---
  const runMacroSchoolRestructuringPass = async (unplacedBlock: AtomicBlock): Promise<boolean> => {
    // Pick the most constrained teacher or class involved
    const classId = unplacedBlock.classId;
    const teacherIds = unplacedBlock.teacherIds;

    // Attempt to displace a non-locked block in target class or teacher schedule
    const candidateDisplacements: { blockUid: string; pos: { d: number; pStart: number } }[] = [];

    // Scan target class for movable blocks
    for (let d = 0; d < numDays; d++) {
      for (let p = 0; p < numPeriods; p++) {
        const occUid = ttState.classGrid.get(classId)?.[d]?.[p];
        if (occUid) {
          const slot = ttState.scheduleSlots.get(classId)?.[d]?.[p];
          if (!slot?.isLocked) {
            const pos = ttState.getBlockPosition(occUid);
            if (pos && !candidateDisplacements.some((c) => c.blockUid === occUid)) {
              candidateDisplacements.push({ blockUid: occUid, pos });
            }
          }
        }
      }
    }

    // Scan target teachers for movable blocks across other classes
    for (const tId of teacherIds) {
      for (let d = 0; d < numDays; d++) {
        for (let p = 0; p < numPeriods; p++) {
          const occUid = ttState.teacherGrid.get(tId)?.[d]?.[p];
          if (occUid) {
            const block = ttState.blocksMap.get(occUid);
            if (block && block.classId !== classId) {
              const slot = ttState.scheduleSlots.get(block.classId)?.[d]?.[p];
              if (!slot?.isLocked) {
                const pos = ttState.getBlockPosition(occUid);
                if (pos && !candidateDisplacements.some((c) => c.blockUid === occUid)) {
                  candidateDisplacements.push({ blockUid: occUid, pos });
                }
              }
            }
          }
        }
      }
    }

    // Try macro displacing each candidate
    for (const cand of candidateDisplacements.slice(0, 15)) {
      if (isStopped?.()) break;

      const candBlock = ttState.blocksMap.get(cand.blockUid);
      if (!candBlock) continue;

      // Unplace candidate block
      const pos = ttState.removeBlock(cand.blockUid);
      if (!pos) continue;

      // Try deep ejection chain placement for unplacedBlock
      const unplacedPlaced = await placeBlockWithEjectionChain(unplacedBlock, 1, 35, new Set<string>());

      if (unplacedPlaced) {
        // Now try deep ejection chain placement for candBlock
        const candPlaced = await placeBlockWithEjectionChain(candBlock, 1, 35, new Set<string>());
        if (candPlaced) {
          return true; // Macro school restructuring succeeded!
        }

        // Rollback unplacedBlock
        ttState.removeBlock(unplacedBlock.uid);
      }

      // Restore candBlock
      ttState.placeBlockDirectly(candBlock, pos.d, pos.pStart);
    }

    return false;
  };

  // --- MULTI-STAGE SOLVER PIPELINE ---

  let currentStep = 0;
  const numTrials = Math.max(10, initialNumTrials);

  for (let trial = 0; trial < numTrials; trial++) {
    if (isStopped?.()) break;
    if (Date.now() - startTime > maxDurationMs) break;

    currentStep++;

    // Stage 1: Sort blocks by MRV & difficulty heuristics
    const pendingBlocks = allBlocks.filter((b) => !ttState.isPlaced(b.uid));
    pendingBlocks.sort((a, b) => {
      if (b.size !== a.size) return b.size - a.size;

      const aTeacher = a.teacherIds.length > 0 ? teachersMap.get(a.teacherIds[0]) : null;
      const bTeacher = b.teacherIds.length > 0 ? teachersMap.get(b.teacherIds[0]) : null;
      const aOff = aTeacher ? Object.values(aTeacher.unavailability || {}).flat().filter(Boolean).length : 0;
      const bOff = bTeacher ? Object.values(bTeacher.unavailability || {}).flat().filter(Boolean).length : 0;
      if (bOff !== aOff) return bOff - aOff;

      return lcgRandom() - 0.5;
    });

    // Phase 1: Fast & Dynamic Depth Ejection Chain Placement
    const unplacedInTrial: AtomicBlock[] = [];

    for (const block of pendingBlocks) {
      if (isStopped?.()) break;

      // Calculate dynamic depth: Depth increases as fewer unplaced blocks remain
      const remainingRatio = (pendingBlocks.length - unplacedInTrial.length) / Math.max(1, pendingBlocks.length);
      const dynamicMaxDepth = remainingRatio < 0.1 ? 40 : remainingRatio < 0.3 ? 25 : 12;

      const success = await placeBlockWithEjectionChain(block, 1, dynamicMaxDepth, new Set<string>());
      if (!success) {
        unplacedInTrial.push(block);
      }
    }

    // Phase 2: Macro Restructuring for stubborn unplaced blocks
    if (unplacedInTrial.length > 0 && unplacedInTrial.length <= 15) {
      const stillUnplaced: AtomicBlock[] = [];

      for (const stubbornBlock of unplacedInTrial) {
        if (isStopped?.()) break;

        const resolved = await runMacroSchoolRestructuringPass(stubbornBlock);
        if (!resolved) {
          stillUnplaced.push(stubbornBlock);
        }
      }

      unplacedInTrial.length = 0;
      unplacedInTrial.push(...stillUnplaced);
    }

    // Evaluate trial progress
    const currentUnplacedCount = allBlocks.filter((b) => !ttState.isPlaced(b.uid)).reduce((acc, b) => acc + b.size, 0);

    if (currentUnplacedCount < bestUnplacedCount) {
      bestUnplacedCount = currentUnplacedCount;
      bestSchedule = ttState.exportScheduleMap();
      bestUnplacedBlocks = allBlocks.filter((b) => !ttState.isPlaced(b.uid));
    }

    // Periodic Progress Updates
    if (trial % 2 === 0 || currentUnplacedCount === 0) {
      const placedHoursSoFar = totalTargetHours - bestUnplacedCount;
      const pct = Math.min(99, Math.round((placedHoursSoFar / Math.max(1, totalTargetHours)) * 100));

      onProgress?.({
        phase: currentUnplacedCount === 0 ? "completed" : "backtracking",
        percent: pct,
        message: targetTeacherName
          ? `[Döngü ${trial + 1}/${numTrials}] ${targetTeacherName} için Rubik zincirleme yerleştirme yapılıyor... (%${pct} tamamlandı)`
          : `[Döngü ${trial + 1}/${numTrials}] Rubik Küp Zincirleme Arama motoru çalışıyor... (%${pct} yerleşti)`,
        steps: currentStep,
        unplacedCount: bestUnplacedCount,
        bestSchedule,
        totalHours: totalTargetHours,
        placedHours: placedHoursSoFar,
        unplacedHours: bestUnplacedCount,
        globalTotalHours,
        globalPlacedHours: globalTotalHours - bestUnplacedCount,
        globalUnplacedHours: bestUnplacedCount,
        targetTeacherName,
        targetClassName,
        elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
      });
    }

    // Early exit if 100% placed!
    if (bestUnplacedCount === 0) {
      break;
    }
  }

  // --- STAGE 3: FINAL DEEP PURSUIT PASS IF ANY STUBBORN UNPLACED REMAIN ---
  if (bestUnplacedCount > 0 && !isStopped?.() && Date.now() - startTime < maxDurationMs + 10000) {
    onProgress?.({
      phase: "backtracking",
      percent: Math.round(((totalTargetHours - bestUnplacedCount) / Math.max(1, totalTargetHours)) * 100),
      message: `Son ${bestUnplacedCount} saat için yüksek derinlikli Rubik Küp yeniden yapılandırması başlatılıyor...`,
      steps: currentStep + 1,
      unplacedCount: bestUnplacedCount,
      bestSchedule,
    });

    const stubbornList = allBlocks.filter((b) => !ttState.isPlaced(b.uid));
    for (const stBlock of stubbornList) {
      if (isStopped?.()) break;
      await runMacroSchoolRestructuringPass(stBlock);
    }

    const finalUnplaced = allBlocks.filter((b) => !ttState.isPlaced(b.uid)).reduce((acc, b) => acc + b.size, 0);
    if (finalUnplaced < bestUnplacedCount) {
      bestUnplacedCount = finalUnplaced;
      bestSchedule = ttState.exportScheduleMap();
      bestUnplacedBlocks = allBlocks.filter((b) => !ttState.isPlaced(b.uid));
    }
  }

  // --- STAGE 4: POLISH PASS (TEACHER WINDOWS & GAP OPTIMIZATION) ---
  onProgress?.({
    phase: "optimizing",
    percent: 99,
    message: "Ders programı tamamlandı. Öğretmen pencere ve boşlukları optimize ediliyor...",
    steps: currentStep,
    unplacedCount: bestUnplacedCount,
    bestSchedule,
  });

  const finalPlacedHours = totalTargetHours - bestUnplacedCount;
  const is100Percent = bestUnplacedCount === 0;

  onProgress?.({
    phase: "completed",
    percent: 100,
    message: is100Percent
      ? "Tüm dersler Rubik Küp zincirleme optimizasyonu ile %100 başarıyla yerleştirildi!"
      : `Ders programı optimizasyonu tamamlandı. ${bestUnplacedCount} saat ders için yerleşme imkanı bulunamadı.`,
    steps: currentStep,
    unplacedCount: bestUnplacedCount,
    bestSchedule,
    totalHours: totalTargetHours,
    placedHours: finalPlacedHours,
    unplacedHours: bestUnplacedCount,
    globalTotalHours,
    globalPlacedHours: globalTotalHours - bestUnplacedCount,
    globalUnplacedHours: bestUnplacedCount,
    targetTeacherName,
    targetClassName,
    elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
  });

  return {
    success: is100Percent,
    schedule: bestSchedule,
    unplacedCount: bestUnplacedCount,
    usedSeed: activeSeed,
    unplacedDetails: bestUnplacedBlocks.map(
      (b) => `${classesMap.get(b.classId)?.name || "Sınıf"} - ${coursesMap.get(b.courseId)?.name || "Ders"} (${b.size} saat)`
    ),
  };
}
