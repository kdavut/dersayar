/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface PeriodTime {
  start: string;
  end: string;
}

export interface SchoolSettings {
  schoolName: string;
  principalName: string; // Müdür Adı
  academicYear?: string; // Eğitim Öğretim Yılı
  effectiveDate: string; // Ders programı uygulanma tarihi
  officialDocumentNo: string; // Resmi tebliğ yazısı evrak sayısı
  days: string[]; // e.g. ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma"]
  periodsPerDay: number; // e.g. 8
  periodTimes: PeriodTime[];
  lunchBreakAfter?: number; // Öğle arası hangi dersten sonra (0: yok)
  lunchBreakDuration?: number; // Öğle arası süresi (dakika)
}

export interface UnavailabilityMap {
  // Key: dayIndex (e.g. 0 for Monday). Value: boolean array of length periodsPerDay (true = unavailable/blocked)
  [dayIndex: number]: boolean[];
}

export interface Teacher {
  id: string;
  name: string;
  branch: string; // Branş (e.g. Matematik, Fizik)
  unavailability: UnavailabilityMap;
  shortName?: string; // Kısa adı
  homeroomClass?: string; // Sınıf rehberliği
  closureNames?: { [dayIndex: number]: string[] };
}

export interface GradeClass {
  id: string;
  name: string; // Sınıf adı (e.g. 9-A, 10-B)
  unavailability: UnavailabilityMap;
  dailyPeriods?: { [dayIndex: number]: number }; // Her gün için ders saati sayısı
  closureNames?: { [dayIndex: number]: string[] };
}

export interface Classroom {
  id: string;
  name: string; // Atölye adı
  shortName: string; // Atölye kısa adı
  type: "standard" | "workshop";
  unavailability: UnavailabilityMap;
  closureNames?: { [dayIndex: number]: string[] };
}

export interface Course {
  id: string;
  name: string; // Dersin Adı (e.g. Matematik)
  code: string; // Ders Kodu / Kısa Adı (e.g. MAT)
  weeklyHours: number; // Haftalık sayısı
  placementMode: string; // Yerleşme biçimi (e.g. "2+2", "1+1+1", "Blok")
}

export interface LessonAssignment {
  id: string;
  classId: string; // Hangi sınıfa atanmış
  courseId: string; // Hangi ders
  teacherId: string; // Hangi öğretmen anlatacak
  weeklyHours: number; // Haftalık ders saati (e.g. 6)
  classroomId: string | null; // Özel atölye/laboratuvar gerekiyor mu (null ise standart sınıf)
  preferredBlockSize: number; // Blok ders tercihi (1: Tek tek, 2: Çift çift/blok, vb.)
  customPlacementMode?: string; // Özel dağılım belirleme (Örn: "3+3" veya "1+1+1+1+1+1")
}

export interface ScheduleSlot {
  assignmentId: string;
  courseId: string;
  teacherId: string;
  classroomId: string | null;
  isLocked?: boolean;
}

// Full School Schedule State
export interface ClassScheduleMap {
  // classId -> dayIndex -> Array of ScheduleSlots (of length periodsPerDay)
  [classId: string]: {
    [dayIndex: number]: (ScheduleSlot | null)[];
  };
}

export interface AppState {
  settings: SchoolSettings;
  teachers: Teacher[];
  classes: GradeClass[];
  classrooms: Classroom[];
  courses: Course[];
  assignments: LessonAssignment[];
  schedule: ClassScheduleMap;
}

export interface FullHistoryState {
  current: AppState;
  past: AppState[];
  future: AppState[];
  isSynced: boolean; // True if saved to cloud, False if local-only modifications exist
}

export interface ConflictInfo {
  type: "teacher_overlap" | "classroom_overlap" | "teacher_unavailable" | "class_unavailable" | "classroom_unavailable" | "excess_hours";
  message: string;
  dayIndex: number;
  periodIndex: number;
  details: {
    classId?: string;
    teacherId?: string;
    classroomId?: string;
    courseId?: string;
  };
}
