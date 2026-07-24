import { AppState, ConflictInfo, Teacher, GradeClass, Classroom, LessonAssignment, Course } from "../../types";
import { parseTeacherIds } from "./helpers";

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
