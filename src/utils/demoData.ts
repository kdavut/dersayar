/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppState, ClassScheduleMap } from "../types";

export const DEFAULT_TIMES = [
  { start: "08:30", end: "09:10" },
  { start: "09:20", end: "10:00" },
  { start: "10:10", end: "10:50" },
  { start: "11:00", end: "11:40" },
  { start: "11:50", end: "12:30" },
  { start: "13:30", end: "14:10" },
  { start: "14:20", end: "15:00" },
  { start: "15:10", end: "15:50" }
];

export const DEFAULT_DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma"];

export function createEmptyUnavailability(daysCount: number, periodsCount: number) {
  const map: { [dayIndex: number]: boolean[] } = {};
  for (let d = 0; d < daysCount; d++) {
    map[d] = Array(periodsCount).fill(false);
  }
  return map;
}

export function generateDemoState(): AppState {
  const days = [...DEFAULT_DAYS]; // 5 days
  const periods = DEFAULT_TIMES.length; // 8 periods per day

  // 20 Teachers
  const teacherNames = [
    { name: "Ahmet Yılmaz", branch: "Matematik" },
    { name: "Fatma Kaya", branch: "Edebiyat" },
    { name: "Ali Demir", branch: "İngilizce" },
    { name: "Zeynep Şahin", branch: "Fizik" },
    { name: "Mustafa Çelik", branch: "Kimya" },
    { name: "Ayşe Öztürk", branch: "Matematik" },
    { name: "Mehmet Yıldız", branch: "Edebiyat" },
    { name: "Selin Polat", branch: "İngilizce" },
    { name: "Can Arslan", branch: "Fizik" },
    { name: "Elif Tekin", branch: "Kimya" },
    { name: "Hakan Koç", branch: "Matematik" },
    { name: "Hüseyin Özkan", branch: "Edebiyat" },
    { name: "Merve Aydın", branch: "İngilizce" },
    { name: "Bülent Bulut", branch: "Fizik" },
    { name: "Derya Şen", branch: "Kimya" },
    { name: "Murat Yavuz", branch: "Matematik" },
    { name: "Deniz Güneş", branch: "Edebiyat" },
    { name: "Kemal Ateş", branch: "İngilizce" },
    { name: "Gökhan Kılıç", branch: "Fizik" },
    { name: "Aslı Polat", branch: "Kimya" }
  ];

  const teachers = teacherNames.map((tn, idx) => ({
    id: `t${idx + 1}`,
    name: tn.name,
    branch: tn.branch,
    unavailability: createEmptyUnavailability(days.length, periods)
  }));

  // 20 Classes
  const classNames = [
    "9-A", "9-B", "9-C", "9-D",
    "10-A", "10-B", "10-C", "10-D",
    "11-A", "11-B", "11-C", "11-D",
    "12-A", "12-B", "12-C", "12-D",
    "AMP-9A", "AMP-9B", "AMP-10A", "AMP-10B"
  ];

  const classes = classNames.map((name, idx) => ({
    id: `c${idx + 1}`,
    name,
    unavailability: createEmptyUnavailability(days.length, periods),
    dailyPeriods: { 0: 8, 1: 8, 2: 8, 3: 8, 4: 8 }
  }));

  // 5 Courses, each has 5 weekly hours, so total = 25 weekly hours per class
  const courses = [
    { id: "crs1", name: "Matematik", code: "MAT", weeklyHours: 5, placementMode: "2+2+1" },
    { id: "crs2", name: "Türk Dili ve Edebiyatı", code: "EDB", weeklyHours: 5, placementMode: "2+2+1" },
    { id: "crs3", name: "İngilizce", code: "ING", weeklyHours: 5, placementMode: "2+2+1" },
    { id: "crs4", name: "Fizik", code: "FIZ", weeklyHours: 5, placementMode: "2+2+1" },
    { id: "crs5", name: "Kimya", code: "KIM", weeklyHours: 5, placementMode: "2+2+1" }
  ];

  const classrooms = [
    { id: "r1", name: "Kimya Laboratuvarı", shortName: "KİM-LAB", type: "workshop" as const, unavailability: createEmptyUnavailability(days.length, periods) },
    { id: "r2", name: "Fizik Laboratuvarı", shortName: "FİZ-LAB", type: "workshop" as const, unavailability: createEmptyUnavailability(days.length, periods) }
  ];

  const assignments: any[] = [];
  let assignmentIdCounter = 1;

  classes.forEach((c, cIdx) => {
    courses.forEach((course, courseIdx) => {
      // Round robin assignment
      // Each course is assigned to a teacher of the appropriate branch
      // courseIdx 0 (MAT) -> teachers [0, 5, 10, 15]
      // courseIdx 1 (EDB) -> teachers [1, 6, 11, 16]
      // courseIdx 2 (ING) -> teachers [2, 7, 12, 17]
      // courseIdx 3 (FIZ) -> teachers [3, 8, 13, 18]
      // courseIdx 4 (KIM) -> teachers [4, 9, 14, 19]
      const branchTeacherIndices = [
        [0, 5, 10, 15], // Matematik
        [1, 6, 11, 16], // Edebiyat
        [2, 7, 12, 17], // İngilizce
        [3, 8, 13, 18], // Fizik
        [4, 9, 14, 19]  // Kimya
      ][courseIdx];

      const teacherIndex = branchTeacherIndices[cIdx % branchTeacherIndices.length];
      const teacher = teachers[teacherIndex];

      let classroomId: string | null = null;
      if (course.id === "crs4") {
        classroomId = "r2"; // Fizik Lab
      } else if (course.id === "crs5") {
        classroomId = "r1"; // Kimya Lab
      }

      assignments.push({
        id: `a${assignmentIdCounter++}`,
        classId: c.id,
        courseId: course.id,
        teacherId: teacher.id,
        weeklyHours: 5,
        classroomId,
        preferredBlockSize: 2
      });
    });
  });

  const schedule: ClassScheduleMap = {};
  classes.forEach(c => {
    schedule[c.id] = {};
    for (let d = 0; d < days.length; d++) {
      schedule[c.id][d] = Array(periods).fill(null);
    }
  });

  return {
    settings: {
      schoolName: "Gazi Anadolu Lisesi",
      principalName: "Ali Yılmaz",
      effectiveDate: "2026-09-15",
      officialDocumentNo: "E-10293847-903.02",
      days,
      periodsPerDay: periods,
      periodTimes: [...DEFAULT_TIMES],
      lunchBreakAfter: 4,
      lunchBreakDuration: 45
    },
    teachers,
    classes,
    classrooms,
    courses,
    assignments,
    schedule
  };
}

export function generateLargeDemoState(): AppState {
  return generateDemoState();
}
