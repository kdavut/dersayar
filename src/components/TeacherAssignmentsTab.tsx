import React from "react";
import { motion } from "motion/react";
import { UserCheck, Users, BookOpen, School, Trash2 } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { Teacher, Course, GradeClass } from "../types";

export default function TeacherAssignmentsTab() {
  const [showUnassignedTable, setShowUnassignedTable] = React.useState(false);
  const {
    historyState,
    teacherAssignTabSearch,
    setTeacherAssignTabSearch,
    courseAssignTabSearch,
    setCourseAssignTabSearch,
    assignmentTabTeacherId,
    setAssignmentTabTeacherId,
    assignmentTabCourseId,
    setAssignmentTabCourseId,
    updateState,
    showToast,
  } = useAppStore();

  const state = historyState.current;

  // Re-construct the quick lookup maps exactly as they are in App.tsx
  const classesMap = new Map<string, GradeClass>(state.classes.map((c) => [c.id, c]));
  const coursesMap = new Map<string, Course>(state.courses.map((co) => [co.id, co]));

  const handleAssignTeacherToClassCourse = (assignmentId: string, teacherId: string) => {
    updateState((draft) => {
      const assignment = draft.assignments.find((a) => a.id === assignmentId);
      if (assignment) {
        let finalTeacherId = "";
        if (!teacherId) {
          finalTeacherId = "";
        } else {
          const currentIds = assignment.teacherId ? assignment.teacherId.split(",").filter(Boolean) : [];
          if (currentIds.includes(teacherId)) {
            // Remove if already assigned
            const filteredIds = currentIds.filter(id => id !== teacherId);
            finalTeacherId = filteredIds.join(",");
          } else {
            // Add if not already assigned
            currentIds.push(teacherId);
            finalTeacherId = currentIds.join(",");
          }
        }

        assignment.teacherId = finalTeacherId;

        // Also update any schedule slots using this assignment to the new teacher!
        Object.keys(draft.schedule).forEach((cId) => {
          const classSchedules = draft.schedule[cId];
          Object.keys(classSchedules).forEach((dIdxStr) => {
            const dIdx = parseInt(dIdxStr, 10);
            const periods = classSchedules[dIdx] || [];
            for (let p = 0; p < periods.length; p++) {
              if (periods[p]?.assignmentId === assignmentId) {
                periods[p].teacherId = finalTeacherId;
              }
            }
          });
        });

        const teacherNames = finalTeacherId 
          ? finalTeacherId.split(",").map(id => draft.teachers.find((t) => t.id === id)?.name).filter(Boolean).join(", ") 
          : "Hiçbiri";
        const className = draft.classes.find((c) => c.id === assignment.classId)?.name || "Sınıf";
        const courseName = draft.courses.find((c) => c.id === assignment.courseId)?.name || "Ders";
        showToast(`${className} sınıfının ${courseName} dersine öğretmen(ler) atandı: ${teacherNames}`, "success");
      }
    });
  };

  const handleRemoveTeacherFromAssignment = (assignmentId: string, teacherIdToRemove: string) => {
    updateState((draft) => {
      const assignment = draft.assignments.find((a) => a.id === assignmentId);
      if (assignment && assignment.teacherId) {
        const currentIds = assignment.teacherId.split(",").filter(Boolean);
        const filteredIds = currentIds.filter(id => id !== teacherIdToRemove);
        const finalTeacherId = filteredIds.join(",");
        assignment.teacherId = finalTeacherId;

        // Also update any schedule slots using this assignment
        Object.keys(draft.schedule).forEach((cId) => {
          const classSchedules = draft.schedule[cId];
          Object.keys(classSchedules).forEach((dIdxStr) => {
            const dIdx = parseInt(dIdxStr, 10);
            const periods = classSchedules[dIdx] || [];
            for (let p = 0; p < periods.length; p++) {
              if (periods[p]?.assignmentId === assignmentId) {
                periods[p].teacherId = finalTeacherId;
              }
            }
          });
        });
      }
    });
    showToast("Öğretmen ataması kaldırıldı.", "info");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 text-slate-800"
    >
      {/* Üst Özet Tablosu (Tek Satır) */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <span className="font-extrabold text-slate-700 flex items-center gap-1.5">
            📊 <span>Ders Atama Özeti:</span>
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              <span className="font-semibold text-slate-600">Toplam Ders:</span>
              <span className="font-extrabold text-blue-700 font-mono text-sm">
                {state.assignments.length}
              </span>
              <span className="text-slate-400 font-mono text-[10px]">
                ({state.assignments.reduce((sum, a) => sum + a.weeklyHours, 0)} Saat)
              </span>
            </div>
            <div className="hidden sm:block h-4 w-px bg-slate-200"></div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              <span className="font-semibold text-slate-600">Boşta Kalan:</span>
              <span className="font-extrabold text-rose-700 font-mono text-sm">
                {state.assignments.filter(a => !a.teacherId || a.teacherId.trim() === "").length}
              </span>
              <span className="text-slate-400 font-mono text-[10px]">
                ({state.assignments.filter(a => !a.teacherId || a.teacherId.trim() === "").reduce((sum, a) => sum + a.weeklyHours, 0)} Saat)
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowUnassignedTable(!showUnassignedTable)}
          className={`px-3 py-1.5 rounded-lg font-bold text-[11px] transition shadow-sm cursor-pointer shrink-0 ${
            showUnassignedTable 
              ? "bg-rose-100 text-rose-700 hover:bg-rose-200 border border-rose-200" 
              : "bg-rose-600 text-white hover:bg-rose-700 shadow-rose-200"
          }`}
        >
          {showUnassignedTable ? "Tabloyu Gizle" : "Atanmayan Boş Dersler"}
        </button>
      </div>

      {/* Atanmayan Boş Dersler Tablosu (Expandable) */}
      {showUnassignedTable && (
        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-slate-50/50 p-3 animate-fadeIn">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 mb-2">
            <h4 className="text-xs font-black text-rose-800 uppercase flex items-center gap-1.5">
              <span>⚠️ Henüz Öğretmen Atanmamış Boş Dersler ({state.assignments.filter(a => !a.teacherId || a.teacherId.trim() === "").length} Ders)</span>
            </h4>
            <p className="text-[10px] text-slate-500 font-medium hidden md:block">
              Ders atamak için bir satıra tıklayarak ilgili derse ve sınıfa gidebilirsiniz.
            </p>
          </div>

          {state.assignments.filter(a => !a.teacherId || a.teacherId.trim() === "").length === 0 ? (
            <div className="text-center py-6 text-emerald-600 text-xs font-bold">
              🎉 Harika! Tüm derslere öğretmen ataması yapılmış, boşta kalan ders yok.
            </div>
          ) : (
            <div className="overflow-y-auto max-h-[250px] border border-slate-300 rounded-lg bg-white">
              <table className="w-full text-xs text-left text-slate-700 border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-[10px] text-slate-600 uppercase tracking-wider border-b border-slate-200 sticky top-0 z-10">
                    <th className="py-2 px-3 font-bold border-r border-slate-200">SINIF ADI</th>
                    <th className="py-2 px-3 font-bold border-r border-slate-200">DERS ADI (KOD)</th>
                    <th className="py-2 px-3 font-bold text-center border-r border-slate-200 w-20">HDS</th>
                    <th className="py-2 px-3 font-bold text-center w-28">İŞLEM</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150">
                  {state.assignments
                    .filter(a => !a.teacherId || a.teacherId.trim() === "")
                    .map((assignment) => {
                      const c = classesMap.get(assignment.classId);
                      const co = coursesMap.get(assignment.courseId);
                      return (
                        <tr
                          key={assignment.id}
                          onClick={() => {
                            setAssignmentTabCourseId(assignment.courseId);
                            showToast(`"${co?.name}" dersi ve "${c?.name}" sınıfı seçildi.`, "info");
                          }}
                          className="hover:bg-blue-50/60 cursor-pointer transition-colors group"
                        >
                          <td className="py-2 px-3 font-extrabold text-slate-800 border-r border-slate-200 group-hover:text-blue-700">
                            {c?.name || "Bilinmeyen Sınıf"}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200">
                            <span className="font-bold text-slate-700 group-hover:text-blue-700">{co?.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono font-medium ml-1.5">({co?.code})</span>
                          </td>
                          <td className="py-2 px-3 text-center font-bold text-slate-600 font-mono border-r border-slate-200">
                            {assignment.weeklyHours} saat
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className="text-[10px] text-blue-600 bg-blue-50 group-hover:bg-blue-100 group-hover:text-blue-800 font-bold px-2 py-0.5 rounded transition">
                              Atama Yap ➔
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

    {/* Main 3-Column Layout Grid */}
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      
      {/* LEFT COLUMN: ÖĞRETMENLER (Width: 4/12) */}
      <div className="xl:col-span-4 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {(() => {
          const filteredTeachersCount = state.teachers.filter(t => 
            t.name.toLowerCase().includes(teacherAssignTabSearch.toLowerCase()) ||
            t.branch.toLowerCase().includes(teacherAssignTabSearch.toLowerCase())
          ).length;

          return (
            <div className="bg-slate-900 px-5 py-4 flex items-center justify-between">
              <h3 className="text-xs font-extrabold tracking-wider uppercase text-slate-200 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-400" />
                <span>1. Öğretmen Listesi {teacherAssignTabSearch.trim() ? `(${filteredTeachersCount} bulundu)` : ""}</span>
              </h3>
              <span className="bg-slate-800 text-[10px] text-slate-300 font-bold px-2 py-0.5 rounded border border-slate-700">
                {state.teachers.length} Kayıt
              </span>
            </div>
          );
        })()}

        {/* Search Input for Teachers */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
          <input
            type="text"
            value={teacherAssignTabSearch}
            onChange={(e) => setTeacherAssignTabSearch(e.target.value)}
            placeholder="Öğretmen veya branş ara..."
            className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
          />
        </div>

        {/* Teacher Table Container with Scroll */}
        <div className="overflow-y-auto max-h-[380px] border-b border-slate-200 bg-white">
            <table className="w-full text-xs text-left text-slate-700 border-collapse border border-slate-300">
              <thead>
                <tr className="text-[10px] text-slate-700 uppercase tracking-wider bg-slate-100 sticky top-0 z-10">
                  <th className="py-1.5 px-3 font-extrabold text-slate-700 text-center w-12 bg-slate-100 border border-slate-300">SIRA</th>
                  <th className="py-1.5 px-3 font-extrabold text-slate-700 bg-slate-100 border border-slate-300">ADI SOYADI</th>
                  <th className="py-1.5 px-3 font-extrabold text-slate-700 bg-slate-100 border border-slate-300">BRANŞI</th>
                  <th className="py-1.5 px-3 font-extrabold text-slate-700 text-center w-16 bg-slate-100 border border-slate-300">HDS</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const filteredTeachers = state.teachers.filter(t => 
                    t.name.toLowerCase().includes(teacherAssignTabSearch.toLowerCase()) ||
                    t.branch.toLowerCase().includes(teacherAssignTabSearch.toLowerCase())
                  );

                  if (filteredTeachers.length === 0) {
                    return (
                      <tr>
                        <td colSpan={4} className="text-center py-4 text-slate-400 text-xs font-semibold border border-slate-200">Öğretmen bulunamadı.</td>
                      </tr>
                    );
                  }

                  return filteredTeachers.map((t, idx) => {
                    const totalHours = state.assignments
                      .filter(a => a.teacherId && a.teacherId.split(",").includes(t.id))
                      .reduce((sum, a) => sum + a.weeklyHours, 0);
                    const isSelected = assignmentTabTeacherId === t.id;
                    const isEven = idx % 2 === 0;

                    return (
                      <tr
                        key={t.id}
                        onClick={() => setAssignmentTabTeacherId(t.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected 
                            ? "bg-blue-100 font-semibold" 
                            : isEven
                            ? "bg-white hover:bg-slate-50"
                            : "bg-slate-50/50 hover:bg-slate-50"
                        }`}
                      >
                        <td className="py-1.5 px-3 text-center font-bold text-slate-500 border border-slate-200 font-mono">{idx + 1}</td>
                        <td className="py-1.5 px-3 font-bold text-slate-800 border border-slate-200">{t.name}</td>
                        <td className="py-1.5 px-3 text-slate-600 border border-slate-200">{t.branch}</td>
                        <td className="py-1.5 px-3 text-center border border-slate-200">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100">
                            {totalHours}s
                          </span>
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>

          {/* Teacher Details & Assignments (Bottom of Left Column) */}
          <div className="border-t border-slate-200 bg-slate-50 p-4 rounded-b-2xl">
            {(() => {
              const selectedTeacher = state.teachers.find(t => t.id === assignmentTabTeacherId);
              if (!selectedTeacher) {
                return (
                  <div className="text-center py-6 text-slate-400 text-xs font-semibold">
                    Lütfen öğretmen seçin.
                  </div>
                );
              }

              const selectedTeacherAssignments = state.assignments.filter(a => a.teacherId && a.teacherId.split(",").includes(selectedTeacher.id));

              return (
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                    <h4 className="text-xs font-black text-slate-700 uppercase flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                      <span>{selectedTeacher.name} - Atandığı Dersler</span>
                    </h4>
                    <span className="text-[10px] bg-slate-200 text-slate-700 font-extrabold px-2 py-0.5 rounded">
                      {selectedTeacherAssignments.length} Sınıf
                    </span>
                  </div>

                  {selectedTeacherAssignments.length === 0 ? (
                    <div className="text-center py-4 text-slate-400 text-xs italic">
                      Bu öğretmene henüz atanmış bir ders bulunmuyor.
                    </div>
                  ) : (
                    <div className="max-h-[160px] overflow-y-auto border border-slate-300 bg-white">
                      <table className="w-full text-[11px] text-left text-slate-700 border-collapse border border-slate-300">
                        <thead>
                          <tr className="text-[10px] text-slate-700 uppercase bg-slate-100 sticky top-0 z-10">
                            <th className="py-1 px-2 font-extrabold text-slate-700 bg-slate-100 border border-slate-300">SINIF</th>
                            <th className="py-1 px-2 font-extrabold text-slate-700 bg-slate-100 border border-slate-300">DERS</th>
                            <th className="py-1 px-2 font-extrabold text-slate-700 text-center w-12 bg-slate-100 border border-slate-300">HDS</th>
                            <th className="py-1 px-2 font-extrabold text-slate-700 text-right w-12 bg-slate-100 border border-slate-300">İŞLEM</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedTeacherAssignments.map((a, idx) => {
                            const cName = classesMap.get(a.classId)?.name || "Bilinmeyen Sınıf";
                            const coName = coursesMap.get(a.courseId)?.name || "Bilinmeyen Ders";
                            const coCode = coursesMap.get(a.courseId)?.code || "";
                            const isEven = idx % 2 === 0;

                            return (
                              <tr
                                key={a.id}
                                className={`transition-colors ${
                                  isEven ? "bg-white hover:bg-slate-50" : "bg-slate-50/50 hover:bg-slate-50"
                                }`}
                              >
                                <td className="py-1 px-2 font-bold text-slate-800 border border-slate-200">{cName}</td>
                                <td className="py-1 px-2 border border-slate-200">
                                  <span className="font-bold text-slate-800">{coName}</span>{" "}
                                  <span className="text-[9px] text-slate-400 font-mono">({coCode})</span>
                                </td>
                                <td className="py-1 px-2 text-center font-extrabold text-slate-600 border border-slate-200 font-mono">{a.weeklyHours}s</td>
                                <td className="py-1 px-2 text-right border border-slate-200">
                                  <button
                                    onClick={() => handleAssignTeacherToClassCourse(a.id, "")}
                                    title="Öğretmeni Atamadan Çıkar"
                                    className="p-0.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>

        {/* MIDDLE COLUMN: DERSLER (Width: 4/12) */}
        <div className="xl:col-span-4 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          {(() => {
            const filteredCoursesCount = state.courses.filter(c => 
              c.name.toLowerCase().includes(courseAssignTabSearch.toLowerCase()) ||
              c.code.toLowerCase().includes(courseAssignTabSearch.toLowerCase())
            ).length;

            return (
              <div className="bg-slate-900 px-5 py-4 flex items-center justify-between">
                <h3 className="text-xs font-extrabold tracking-wider uppercase text-slate-200 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-emerald-400" />
                  <span>2. Ders Listesi {courseAssignTabSearch.trim() ? `(${filteredCoursesCount} bulundu)` : ""}</span>
                </h3>
                <span className="bg-slate-800 text-[10px] text-slate-300 font-bold px-2 py-0.5 rounded border border-slate-700">
                  {state.courses.length} Ders
                </span>
              </div>
            );
          })()}

          {/* Search Input for Courses */}
          <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <input
              type="text"
              value={courseAssignTabSearch}
              onChange={(e) => setCourseAssignTabSearch(e.target.value)}
              placeholder="Ders adı veya kod ara..."
              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
            />
          </div>

          {/* Course Table Container with Scroll */}
          <div className="overflow-y-auto max-h-[615px] border-b border-slate-200 bg-white">
            <table className="w-full text-xs text-left text-slate-700 border-collapse border border-slate-300">
              <thead>
                <tr className="text-[10px] text-slate-700 uppercase tracking-wider bg-slate-100 sticky top-0 z-10">
                  <th className="py-1.5 px-3 font-extrabold text-slate-700 text-center w-12 bg-slate-100 border border-slate-300">SIRA</th>
                  <th className="py-1.5 px-3 font-extrabold text-slate-700 bg-slate-100 border border-slate-300">DERS ADI (KOD)</th>
                  <th className="py-1.5 px-3 font-extrabold text-slate-700 text-center w-16 bg-slate-100 border border-slate-300">HDS</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const filteredCourses = state.courses.filter(c => 
                    c.name.toLowerCase().includes(courseAssignTabSearch.toLowerCase()) ||
                    c.code.toLowerCase().includes(courseAssignTabSearch.toLowerCase())
                  );

                  if (filteredCourses.length === 0) {
                    return (
                      <tr>
                        <td colSpan={3} className="text-center py-4 text-slate-400 text-xs font-semibold border border-slate-200">Ders bulunamadı.</td>
                      </tr>
                    );
                  }

                  return filteredCourses.map((c, idx) => {
                    const isSelected = assignmentTabCourseId === c.id;
                    const isEven = idx % 2 === 0;

                    return (
                      <tr
                        key={c.id}
                        onClick={() => setAssignmentTabCourseId(c.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected 
                            ? "bg-emerald-100 font-semibold" 
                            : isEven
                            ? "bg-white hover:bg-slate-50"
                            : "bg-slate-50/50 hover:bg-slate-50"
                        }`}
                      >
                        <td className="py-1.5 px-3 text-center font-bold text-slate-500 border border-slate-200 font-mono">{idx + 1}</td>
                        <td className="py-1.5 px-3 font-bold text-slate-800 border border-slate-200">
                          <div className="flex items-center space-x-2">
                            <span>{c.name}</span>
                            <span className="text-[10px] bg-slate-100 text-slate-500 font-semibold px-1.5 py-0.2 rounded border border-slate-200/60 font-mono">{c.code}</span>
                          </div>
                        </td>
                        <td className="py-1.5 px-3 text-center border border-slate-200">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-100 font-mono">
                            {c.weeklyHours}s
                          </span>
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT COLUMN: DERSİN OKUTULDUĞU SINIFLAR VE ÖĞRETMENLER (Width: 4/12) */}
        <div className="xl:col-span-4 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="bg-slate-900 px-5 py-4 flex items-center justify-between">
            <h3 className="text-xs font-extrabold tracking-wider uppercase text-slate-200 flex items-center gap-2">
              <School className="w-4 h-4 text-indigo-400" />
              <span>Dersin Okutulduğu Sınıf</span>
            </h3>
          </div>

          <div className="p-5 space-y-4">
            {(() => {
              const selectedCourse = state.courses.find(c => c.id === assignmentTabCourseId);
              if (!selectedCourse) {
                return (
                  <div className="text-center py-12 text-slate-400 text-xs font-semibold italic">
                    Yandan bir ders seçerek dersin okutulduğu sınıfları görüntüleyin.
                  </div>
                );
              }

              // Get all assignments for this course
              const courseAssignments = state.assignments.filter(a => a.courseId === selectedCourse.id);
              const selectedTeacher = state.teachers.find(t => t.id === assignmentTabTeacherId);

              return (
                <div className="space-y-4">
                  {/* Selected context banner */}
                  <div className="bg-slate-50 border border-slate-200/60 p-3.5 rounded-xl text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-slate-500 uppercase">Seçili Ders:</span>
                      <span className="font-black text-slate-800">{selectedCourse.name} ({selectedCourse.code})</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-slate-500 uppercase">HDS / Ders Saati:</span>
                      <span className="font-bold text-slate-700">{selectedCourse.weeklyHours} Saat</span>
                    </div>
                    <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/60">
                      <span className="font-extrabold text-slate-500 uppercase">Seçili Öğretmen:</span>
                      {selectedTeacher ? (
                        <span className="font-black text-blue-700">{selectedTeacher.name}</span>
                      ) : (
                        <span className="text-rose-600 font-bold">Öğretmen Seçilmedi</span>
                      )}
                    </div>
                    <div className="text-[10px] text-blue-600 bg-blue-50 border border-blue-100 p-2 rounded-lg font-bold">
                      💡 1. Tablodan öğretmen seçip aşağıdaki satırlara <strong>çift tıklayarak (Double Click)</strong> öğretmeni hızlıca sınıfa atayabilirsiniz.
                    </div>
                  </div>

                  {/* Main Table for "Dersin Okutulduğu Sınıf" */}
                  <div className="overflow-hidden border border-slate-300 bg-white">
                    <table className="w-full text-xs text-left text-slate-700 border-collapse border border-slate-300">
                      <thead>
                        <tr className="text-[10px] text-slate-700 uppercase tracking-wider bg-slate-100 sticky top-0 z-10">
                          <th className="py-1.5 px-2.5 font-extrabold text-slate-700 bg-slate-100 border border-slate-300">SINIF ADI</th>
                          <th className="py-1.5 px-2.5 font-extrabold text-slate-700 bg-slate-100 border border-slate-300">ATANAN ÖĞRETMEN</th>
                          <th className="py-1.5 px-2.5 font-extrabold text-slate-700 text-center w-16 bg-slate-100 border border-slate-300">İŞLEM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {courseAssignments.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="text-center py-6 text-slate-400 font-semibold italic border border-slate-200 bg-white">
                              Bu ders henüz hiçbir sınıfta okutulmuyor.<br />
                              <span className="text-[10px] font-normal text-slate-400 mt-1 block">
                                "Sınıfta Okutulan Dersler" sekmesinden sınıfa ders ekleyebilirsiniz.
                              </span>
                            </td>
                          </tr>
                        ) : (
                          courseAssignments.map((assignment, idx) => {
                            const c = classesMap.get(assignment.classId);
                            const assignedTeachers = assignment.teacherId
                              ? assignment.teacherId.split(",").map(id => state.teachers.find(t => t.id === id)).filter(Boolean)
                              : [];
                            const isEven = idx % 2 === 0;

                            return (
                              <tr
                                key={assignment.id}
                                onDoubleClick={() => {
                                  if (selectedTeacher) {
                                    handleAssignTeacherToClassCourse(assignment.id, selectedTeacher.id);
                                  } else {
                                    showToast("Öğretmen atamak için lütfen 1. tablodan bir öğretmen seçin.", "error");
                                  }
                                }}
                                className={`cursor-pointer select-none transition-colors group ${
                                  isEven ? "bg-white hover:bg-blue-50/30" : "bg-slate-50/50 hover:bg-blue-50/30"
                                }`}
                                title="Öğretmen eklemek/çıkarmak için çift tıklayın"
                              >
                                <td className="py-1.5 px-2.5 font-extrabold text-slate-800 border border-slate-200">
                                  {c?.name || "Bilinmeyen Sınıf"}
                                </td>
                                <td className="py-1.5 px-2.5 border border-slate-200">
                                  {assignedTeachers.length > 0 ? (
                                    <div className="flex flex-wrap gap-1">
                                      {assignedTeachers.map((t) => (
                                        <span key={t.id} className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-200 text-emerald-800 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                          <span>{t.name}</span>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleRemoveTeacherFromAssignment(assignment.id, t.id);
                                            }}
                                            className="text-emerald-600 hover:text-rose-600 font-bold ml-1 text-[11px] px-0.5 cursor-pointer"
                                            title="Öğretmeni Kaldır"
                                          >
                                            ×
                                          </button>
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="font-bold text-rose-500 flex items-center gap-1 text-[10px]">
                                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                                      Atanmamış
                                    </span>
                                  )}
                                </td>
                                <td className="py-1.5 px-2.5 text-center border border-slate-200">
                                  {assignment.teacherId ? (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleAssignTeacherToClassCourse(assignment.id, "");
                                      }}
                                      title="Tüm Öğretmen Atamalarını Kaldır"
                                      className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  ) : (
                                    <span className="text-[10px] text-slate-300 font-bold group-hover:text-blue-500 transition">
                                      Çift Tıkla
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

      </div>
    </motion.div>
  );
}
