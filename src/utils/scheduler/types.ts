import { AppState, ClassScheduleMap, Teacher, GradeClass, Classroom, Course, LessonAssignment } from "../../types";

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

export interface SolverContext {
  state: AppState;
  teachersMap: Map<string, Teacher>;
  classesMap: Map<string, GradeClass>;
  classroomsMap: Map<string, Classroom>;
  coursesMap: Map<string, Course>;
  assignmentsMap: Map<string, LessonAssignment>;
  lockedAssignmentIds: Set<string>;
  numDays: number;
  numPeriods: number;
  globalAllowSameDaySameCourse: boolean;
  isAggressiveOrDeepActive: boolean;
  options: any;
  startTime: number;
  maxDurationMs: number;
  isStopped: () => boolean;
  isSlotLocked: (slot: any, cMap: Map<string, Course>, priorityAssignmentIds?: string[]) => boolean;
  isPlacementValidEx: (
    st: any,
    tM: any,
    cM: any,
    crM: any,
    tS: any,
    tO: any,
    crO: any,
    as: any,
    dI: number,
    sP: number,
    bS: number,
    cI?: string,
    opts?: any
  ) => boolean;
}

