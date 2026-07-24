import React, { useState } from "react";
import { motion } from "motion/react";
import { UserCheck, Search } from "lucide-react";
import { AppState, Teacher, GradeClass, Classroom, Course } from "../../types";

interface F4TeacherStatusModalProps {
  teacherStatusDialog: { dIdx: number; pIdx: number } | null;
  onClose: () => void;
  state: AppState;
}

export function F4TeacherStatusModal({
  teacherStatusDialog,
  onClose,
  state
}: F4TeacherStatusModalProps) {
  const [teacherStatusSearch, setTeacherStatusSearch] = useState("");

  if (!teacherStatusDialog) return null;

  const classesMap = new Map<string, GradeClass>(state.classes.map((c) => [c.id, c]));
  const classroomsMap = new Map<string, Classroom>(state.classrooms.map((cr) => [cr.id, cr]));
  const coursesMap = new Map<string, Course>(state.courses.map((co) => [co.id, co]));

  const filtered = state.teachers.filter(t =>
    t.name.toLowerCase().includes(teacherStatusSearch.toLowerCase()) ||
    t.branch.toLowerCase().includes(teacherStatusSearch.toLowerCase())
  );

  // Hücrede geçerli bir ders tanımlı olup olmadığını kontrol eden yardımcı fonksiyon.
  const isRealLessonSlot = (slot: any) => {
    if (!slot) return false;
    const course = state.courses.find(c => c.id === slot.courseId);
    return !!course;
  };

  const getTeacherStatus = (teacher: Teacher) => {
    const dIdx = teacherStatusDialog.dIdx;
    const pIdx = teacherStatusDialog.pIdx;

    const isUnavailable = teacher.unavailability[dIdx]?.[pIdx] === true;
    const closureLabel = teacher.closureNames?.[dIdx]?.[pIdx];

    // 1. Check if teaching right now
    let teachingInClass = "";
    let teachingCourseName = "";
    for (const cId of Object.keys(state.schedule || {})) {
      const s = state.schedule[cId]?.[dIdx]?.[pIdx];
      if (s && s.teacherId && s.teacherId.split(",").includes(teacher.id)) {
        teachingInClass = classesMap.get(cId)?.name || cId;
        teachingCourseName = coursesMap.get(s.courseId)?.name || "Ders";
        break;
      }
    }

    // 2. Find all real lessons for this teacher on this day
    const lessonsToday: number[] = [];
    Object.keys(state.schedule || {}).forEach((cId) => {
      const daySchedule = state.schedule[cId]?.[dIdx];
      if (daySchedule) {
        daySchedule.forEach((slot, periodIdx) => {
          if (slot && slot.teacherId && slot.teacherId.split(",").includes(teacher.id) && isRealLessonSlot(slot)) {
            lessonsToday.push(periodIdx);
          }
        });
      }
    });

    if (lessonsToday.length === 0) {
      return {
        priority: 5,
        badge: (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-50 text-slate-500 rounded-full text-[10px] font-medium border border-slate-200/60">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
            <span>Bugün Dersi Yok</span>
          </span>
        )
      };
    }

    if (teachingInClass) {
      return {
        priority: 3,
        badge: (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full text-[10px] font-bold border border-amber-100">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            <span>Derste ({teachingInClass} - {teachingCourseName})</span>
          </span>
        )
      };
    }

    if (isUnavailable) {
      return {
        priority: 6,
        badge: (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full text-[10px] font-semibold border border-slate-200">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
            <span>Bu derste kapalı {closureLabel ? `(${closureLabel})` : ""}</span>
          </span>
        )
      };
    }

    const firstLesson = Math.min(...lessonsToday);
    const lastLesson = Math.max(...lessonsToday);

    if (pIdx < firstLesson) {
      return {
        priority: 1,
        badge: (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full text-[10px] font-bold border border-indigo-100">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
            <span>Henüz Dersi Başlamadı</span>
          </span>
        )
      };
    }

    if (pIdx > lastLesson) {
      return {
        priority: 4,
        badge: (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-50 text-rose-700 rounded-full text-[10px] font-bold border border-rose-100">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
            <span>Dersi Bitti</span>
          </span>
        )
      };
    }

    return {
      priority: 2,
      badge: (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-black border border-emerald-100">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>Okulda ve Boşta (Aktif)</span>
        </span>
      )
    };
  };

  const teachersWithStatus = filtered.map((teacher) => {
    return { teacher, status: getTeacherStatus(teacher) };
  });

  const sortedTeachers = teachersWithStatus.sort((a, b) => {
    if (a.status.priority !== b.status.priority) {
      return a.status.priority - b.status.priority;
    }
    return a.teacher.name.localeCompare(b.teacher.name, "tr-TR");
  });

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 text-left">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-100 flex flex-col max-h-[85vh]"
      >
        <div className="p-5 border-b border-slate-100 shrink-0 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-teal-600">
            <UserCheck className="w-5 h-5" />
            <div>
              <h3 className="text-sm font-extrabold text-slate-800">Ders Saatindeki Öğretmen Durumları</h3>
              <p className="text-[10px] text-slate-400 mt-0.5 font-semibold">
                {state.settings.days[teacherStatusDialog.dIdx]} Günü, {teacherStatusDialog.pIdx + 1}. Ders Saati için genel tablo
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 font-bold px-2 py-1 rounded hover:bg-slate-50 transition cursor-pointer border-none bg-transparent"
          >
            ✕
          </button>
        </div>

        <div className="p-4 bg-slate-50 border-b border-slate-100 shrink-0 flex items-center gap-2">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={teacherStatusSearch}
            onChange={(e) => setTeacherStatusSearch(e.target.value)}
            placeholder="Öğretmen adı veya branş ile ara..."
            className="w-full bg-transparent border-none text-xs font-bold text-slate-700 placeholder-slate-400 focus:outline-none"
          />
          {teacherStatusSearch && (
            <button
              onClick={() => setTeacherStatusSearch("")}
              className="text-slate-400 hover:text-slate-600 text-xs font-bold border-none bg-transparent"
            >
              Temizle
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {sortedTeachers.length === 0 ? (
            <p className="text-center py-8 text-xs text-slate-400 font-semibold">Aranan kriterlere uygun öğretmen bulunamadı.</p>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-xs text-left text-slate-700 border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                    <th className="py-2 px-3 font-extrabold">Öğretmen Adı / Branş</th>
                    <th className="py-2 px-3 font-extrabold text-right">Mevcut Durum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {sortedTeachers.map(({ teacher, status }) => (
                    <tr key={teacher.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-800">{teacher.name}</div>
                        <div className="text-[10px] text-slate-400 font-semibold mt-0.5">{teacher.branch}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {status.badge}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50/50 shrink-0 text-right">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition cursor-pointer border-none"
          >
            Kapat
          </button>
        </div>
      </motion.div>
    </div>
  );
}
