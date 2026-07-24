import { AppState, UnavailabilityMap } from "../../types";

export interface FeasibilityIssue {
  type: "error" | "warning";
  entityType: "teacher" | "class" | "classroom";
  entityName: string;
  assignedHours: number;
  availableHours: number;
  message: string;
}

export function preSolveFeasibilityCheck(state: AppState): FeasibilityIssue[] {
  const { settings, teachers, classes, classrooms, assignments } = state;
  const numDays = settings.days.length;
  const numPeriods = settings.periodsPerDay;
  const totalSlotsPerEntity = numDays * numPeriods;
  const issues: FeasibilityIssue[] = [];

  // Helper to count available slots for an entity
  const countAvailableSlots = (unavailability: UnavailabilityMap) => {
    let unavail = 0;
    for (let d = 0; d < numDays; d++) {
      if (unavailability && unavailability[d]) {
        for (let p = 0; p < numPeriods; p++) {
          if (unavailability[d][p]) {
            unavail++;
          }
        }
      }
    }
    return totalSlotsPerEntity - unavail;
  };

  // 1. Teacher Check
  teachers.forEach(t => {
    const teacherAssignments = assignments.filter(a => {
      if (!a.teacherId) return false;
      return a.teacherId.split(",").includes(t.id);
    });
    const totalHours = teacherAssignments.reduce((sum, a) => sum + a.weeklyHours, 0);
    const available = countAvailableSlots(t.unavailability);

    if (totalHours > available) {
      issues.push({
        type: "error",
        entityType: "teacher",
        entityName: t.name,
        assignedHours: totalHours,
        availableHours: available,
        message: `${t.name} öğretmeninin haftalık ${totalHours} saat dersi var ama sadece ${available} saat müsaitliği var — bu haliyle tam çözüm imkânsız.`
      });
    }
  });

  // 2. Class Check
  classes.forEach(c => {
    const classAssignments = assignments.filter(a => a.classId === c.id);
    const totalHours = classAssignments.reduce((sum, a) => sum + a.weeklyHours, 0);
    const available = countAvailableSlots(c.unavailability);

    if (totalHours > available) {
      issues.push({
        type: "error",
        entityType: "class",
        entityName: c.name,
        assignedHours: totalHours,
        availableHours: available,
        message: `${c.name} sınıfının haftalık ${totalHours} saat dersi var ama sadece ${available} saat müsaitliği var — bu haliyle tam çözüm imkânsız.`
      });
    }
  });

  // 3. Classroom Check
  classrooms.forEach(cr => {
    const classroomAssignments = assignments.filter(a => a.classroomId === cr.id);
    const totalHours = classroomAssignments.reduce((sum, a) => sum + a.weeklyHours, 0);
    const available = countAvailableSlots(cr.unavailability);

    if (totalHours > available) {
      issues.push({
        type: "error",
        entityType: "classroom",
        entityName: cr.name,
        assignedHours: totalHours,
        availableHours: available,
        message: `${cr.name} atölyesinin/dersliğinin haftalık ${totalHours} saatlik talebi var ama sadece ${available} saat müsaitliği var — bu haliyle tam çözüm imkânsız.`
      });
    }
  });

  return issues;
}
