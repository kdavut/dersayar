import { AppState, ClassScheduleMap, LessonAssignment, Teacher, GradeClass, Classroom, Course } from "../../types";
import { parseTeacherIds } from "./helpers";
import { isPlacementValidEx } from "./validation";

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
          text: `"${teacherObj.name}" öğretmeninin kapalı saatlerinden en az ${assignedHours - maxPossibleHoursForTeacher} saati açarak (veya kısıtlarını azaltarak) kapasitesini artırabilirsiniz.`,
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

      const teachersMap = new Map<string, Teacher>(relaxedState.teachers.map(t => [t.id, t]));
      const classesMap = new Map<string, GradeClass>(relaxedState.classes.map(c => [c.id, c]));
      const classroomsMap = new Map<string, Classroom>(relaxedState.classrooms.map(cr => [cr.id, cr]));

      // Create dummy teacher/classroom occupancies
      const dummyTeacherOccupancy: Record<string, (string | null)[][]> = {};
      const dummyClassroomOccupancy: Record<string, (string | null)[][]> = {};
      for (const t of relaxedState.teachers) {
        dummyTeacherOccupancy[t.id] = Array(numDays).fill(null).map(() => Array(numPeriods).fill(null));
      }
      for (const cr of relaxedState.classrooms) {
        dummyClassroomOccupancy[cr.id] = Array(numDays).fill(null).map(() => Array(numPeriods).fill(null));
      }

      for (let d = 0; d < numDays && !foundRelaxed; d++) {
        for (let p = 0; p <= numPeriods - blockSize && !foundRelaxed; p++) {
          if (isPlacementValidEx(relaxedState, teachersMap, classesMap, classroomsMap, currentSchedule, dummyTeacherOccupancy, dummyClassroomOccupancy, assignment, d, p, blockSize)) {
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

export function restoreMissingTeacherHours(
  initialSched: ClassScheduleMap,
  newSched: ClassScheduleMap,
  state: AppState
): ClassScheduleMap {
  return newSched; // Disabled because it causes duplication bugs
}
