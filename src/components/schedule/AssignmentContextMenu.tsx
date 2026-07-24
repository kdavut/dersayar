import React from "react";
import { Edit3, User, UserCheck, CalendarDays, School, Flame } from "lucide-react";
import { AppState, Course, GradeClass, Teacher } from "../../types";

interface AssignmentContextMenuProps {
  assignmentContextMenu: { x: number; y: number; assignmentId: string; visible: boolean } | null;
  onClose: () => void;
  state: AppState;
  setScheduleViewMode: (mode: "class" | "teacher" | "classroom") => void;
  setViewingEntityId: (id: string) => void;
  showToast: (message: string, type: "success" | "error" | "info") => void;
  optimizeGapsForTeacher: (tId: string) => void;
  removeSingleLessonDaysForTeacher: (tId: string) => void;
  handleForceLesson: (assignId: string) => void;
  setDistributionDialog: (dialog: { assignmentId: string; current: string } | null) => void;
  setDistributionInput: (val: string) => void;
}

export function AssignmentContextMenu({
  assignmentContextMenu,
  onClose,
  state,
  setScheduleViewMode,
  setViewingEntityId,
  showToast,
  optimizeGapsForTeacher,
  removeSingleLessonDaysForTeacher,
  handleForceLesson,
  setDistributionDialog,
  setDistributionInput
}: AssignmentContextMenuProps) {
  if (!assignmentContextMenu || !assignmentContextMenu.visible) return null;

  const assign = state.assignments.find(a => a.id === assignmentContextMenu.assignmentId);
  if (!assign) return null;

  const teachersMap = new Map<string, Teacher>(state.teachers.map((t) => [t.id, t]));
  const classesMap = new Map<string, GradeClass>(state.classes.map((c) => [c.id, c]));
  const coursesMap = new Map<string, Course>(state.courses.map((co) => [co.id, co]));

  const course = coursesMap.get(assign.courseId);

  return (
    <div
      style={{ 
        top: assignmentContextMenu.y + 300 > window.innerHeight ? 'auto' : assignmentContextMenu.y,
        bottom: assignmentContextMenu.y + 300 > window.innerHeight ? window.innerHeight - assignmentContextMenu.y : 'auto',
        left: assignmentContextMenu.x + 280 > window.innerWidth ? 'auto' : assignmentContextMenu.x,
        right: assignmentContextMenu.x + 280 > window.innerWidth ? window.innerWidth - assignmentContextMenu.x : 'auto'
      }}
      className="fixed z-[999] min-w-[260px] bg-white border border-slate-200 rounded-xl shadow-2xl p-1.5 flex flex-col gap-0.5 divide-y divide-slate-100 font-sans"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-2.5 py-1 text-[10px] font-black text-slate-400 uppercase tracking-widest truncate text-left">
        📚 {course?.name || "Ders"} İşlemleri
      </div>
      <div className="py-1 space-y-0.5 text-left">
        <button
          onClick={() => {
            setDistributionDialog({
              assignmentId: assign.id,
              current: assign.customPlacementMode || ""
            });
            setDistributionInput(assign.customPlacementMode || "");
            onClose();
          }}
          className="w-full text-left px-2.5 py-1.5 hover:bg-blue-50 hover:text-blue-700 text-blue-600 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer border-none bg-transparent"
        >
          <Edit3 className="w-3.5 h-3.5 text-blue-500" />
          <span>Bu Derse Özel Dağıtım Belirle</span>
        </button>

        {assign.teacherId && (
          <>
            <button
              onClick={() => {
                const firstTId = assign.teacherId!.split(",")[0].trim();
                setScheduleViewMode("teacher");
                setViewingEntityId(firstTId);
                showToast(`${teachersMap.get(firstTId)?.name || "Öğretmen"} programına geçildi.`, "success");
                onClose();
              }}
              className="w-full text-left px-2.5 py-1.5 hover:bg-teal-50 hover:text-teal-700 text-teal-600 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer border-none bg-transparent"
            >
              <User className="w-3.5 h-3.5 text-teal-500" />
              <span>Öğretmene Bağlan</span>
            </button>

            <button
              onClick={() => {
                const firstTId = assign.teacherId!.split(",")[0].trim();
                optimizeGapsForTeacher(firstTId);
                onClose();
              }}
              className="w-full text-left px-2.5 py-1.5 hover:bg-amber-50 hover:text-amber-700 text-amber-600 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer border-none bg-transparent"
            >
              <UserCheck className="w-3.5 h-3.5 text-amber-500" />
              <span>Bu Öğretmenin Boşluğunu Azalt</span>
            </button>

            <button
              onClick={() => {
                const firstTId = assign.teacherId!.split(",")[0].trim();
                removeSingleLessonDaysForTeacher(firstTId);
                onClose();
              }}
              className="w-full text-left px-2.5 py-1.5 hover:bg-indigo-50 hover:text-indigo-700 text-indigo-600 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer border-none bg-transparent"
            >
              <CalendarDays className="w-3.5 h-3.5 text-indigo-500" />
              <span>Bu Öğretmenin Tek Dersini Kaldır</span>
            </button>
          </>
        )}

        {assign.classId && (
          <button
            onClick={() => {
              setScheduleViewMode("class");
              setViewingEntityId(assign.classId);
              showToast(`${classesMap.get(assign.classId)?.name || "Sınıf"} programına geçildi.`, "success");
              onClose();
            }}
            className="w-full text-left px-2.5 py-1.5 hover:bg-indigo-50 hover:text-indigo-700 text-indigo-600 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer border-none bg-transparent"
          >
            <School className="w-3.5 h-3.5 text-indigo-500" />
            <span>Sınıfa Bağlan</span>
          </button>
        )}

        <button
          onClick={() => {
            handleForceLesson(assign.id);
            onClose();
          }}
          className="w-full text-left px-2.5 py-1.5 hover:bg-amber-50 hover:text-amber-700 text-amber-600 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer border-none bg-transparent"
        >
          <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-100/35" />
          <span>Bu Dersi Zorla</span>
        </button>
      </div>

      <div className="pt-1">
        <button
          onClick={onClose}
          className="w-full text-center py-1 hover:bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold transition cursor-pointer border-none bg-transparent"
        >
          Kapat
        </button>
      </div>
    </div>
  );
}
