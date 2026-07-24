import React from "react";
import { motion } from "motion/react";
import { Layers, BookOpen, Plus, Trash2, GitCommit } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { LessonAssignment } from "../types";

export default function AssignmentsTab() {
  const {
    historyState,
    selectedClassId,
    setSelectedClassId,
    copySourceClassId,
    setCopySourceClassId,
    updateState,
    showToast,
    setConfirmModal,
  } = useAppStore();

  const state = historyState.current;

  const handleDirectCourseAssign = (classId: string, courseId: string) => {
    if (!classId) {
      showToast("Lütfen önce ders atamak istediğiniz sınıfı seçin!", "error");
      return;
    }
    const course = state.courses.find((c) => c.id === courseId);
    if (!course) return;

    updateState((draft) => {
      // Check if this lesson has already been assigned to this class
      const exists = draft.assignments.some(
        (a) => a.classId === classId && a.courseId === courseId
      );
      if (exists) {
        showToast("Bu ders zaten bu sınıfa atanmış!", "error");
        return;
      }

      const id = "as_" + Date.now();
      
      // Determine preferred block size from placementMode or weeklyHours
      let blockSize = 2;
      if (course.placementMode && course.placementMode.includes("1")) {
        blockSize = 1;
      } else if (course.weeklyHours === 1) {
        blockSize = 1;
      }

      const item: LessonAssignment = {
        id,
        classId,
        courseId,
        teacherId: "", // Öğretmen daha sonra atanacak
        weeklyHours: course.weeklyHours,
        classroomId: null,
        preferredBlockSize: blockSize
      };
      draft.assignments.push(item);
      const className = draft.classes.find((c) => c.id === classId)?.name || "Seçili Sınıf";
// removed toast
    });
  };

  const handleDeleteAssignment = (id: string) => {
    const assignment = state.assignments.find((a) => a.id === id);
    if (!assignment) return;
    const course = state.courses.find((c) => c.id === assignment.courseId);
    
    setConfirmModal({
      isOpen: true,
      title: "Ders Dağıtımını Sil",
      message: `"${course?.name}" dersinin bu sınıftan dağıtımını silmek istediğinize emin misiniz? Ders programındaki ilgili yerleşimler de boşaltılacaktır.`,
      confirmText: "Evet, Sil",
      isDangerous: true,
      action: () => {
        updateState((draft) => {
          draft.assignments = draft.assignments.filter((a) => a.id !== id);
          // Clean schedule
          Object.keys(draft.schedule).forEach((cId) => {
            const classSchedules = draft.schedule[cId];
            if (classSchedules) {
              Object.keys(classSchedules).forEach((dIdxStr) => {
                const dIdx = parseInt(dIdxStr, 10);
                if (Array.isArray(classSchedules[dIdx])) {
                  classSchedules[dIdx] = classSchedules[dIdx].map((slot) => {
                    return slot?.assignmentId === id ? null : slot;
                  });
                }
              });
            }
          });
        });
// removed toast
        setConfirmModal(null);
      }
    });
  };

  const handleCopyClassAssignments = (sourceClassId: string, targetClassId: string) => {
    if (!sourceClassId || !targetClassId) {
      showToast("Lütfen hem kaynak sınıfı hem de hedef sınıfı seçin!", "error");
      return;
    }
    const sourceClass = state.classes.find(c => c.id === sourceClassId);
    const targetClass = state.classes.find(c => c.id === targetClassId);
    if (!sourceClass || !targetClass) return;

    const sourceAssigns = state.assignments.filter(a => a.classId === sourceClassId);
    if (sourceAssigns.length === 0) {
      showToast(`Kaynak sınıfın (${sourceClass.name}) atanmış herhangi bir dersi bulunmuyor!`, "error");
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: "Sınıf Derslerini Kopyala",
      message: `${sourceClass.name} sınıfının tüm dersleri (${sourceAssigns.length} ders) ${targetClass.name} sınıfına kopyalanacaktır. Bu sınıftaki tüm mevcut dersler silinecektir. Onaylıyor musunuz?`,
      isDangerous: true,
      confirmText: "Evet, Kopyala",
      action: () => {
        updateState((draft) => {
          // 1. Remove existing assignments for target class
          draft.assignments = draft.assignments.filter(a => a.classId !== targetClassId);

          // 2. Clear old schedule slots for target class if any
          if (draft.schedule[targetClassId]) {
            Object.keys(draft.schedule[targetClassId]).forEach((dayKey) => {
              const dIdx = parseInt(dayKey);
              if (draft.schedule[targetClassId][dIdx]) {
                draft.schedule[targetClassId][dIdx] = draft.schedule[targetClassId][dIdx].map(() => null);
              }
            });
          }

          // 3. Clone and add assignments
          sourceAssigns.forEach((a, index) => {
            const newId = "as_" + Date.now() + "_" + Math.floor(Math.random() * 1000) + "_" + index;
            draft.assignments.push({
              ...a,
              id: newId,
              classId: targetClassId
            });
          });
        });
// removed toast
        setConfirmModal(null);
      }
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full text-slate-800"
    >
      {/* 1. KOLON: Sınıf Atama Durumu */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col h-[calc(100vh-180px)]">
        <h2 className="text-sm font-extrabold text-slate-800 mb-2.5 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <Layers className="w-4.5 h-4.5 text-blue-600" />
            <span>1. Tablo: Sınıfların Ders Atama Durumu</span>
          </div>
          <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">
            {state.classes.length} Sınıf
          </span>
        </h2>
        <p className="text-[11px] text-slate-500 mb-3 font-medium shrink-0">
          Sınıfa tıklayarak 2. Tablo'da derslerini listeleyin ve 3. Tablo'dan ders ekleyin.
        </p>

        <div className="flex-1 overflow-y-auto border border-slate-300 bg-white">
          {state.classes.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs font-semibold">
              Kayıtlı sınıf bulunmuyor.
            </div>
          ) : (
            <table className="w-full text-xs text-left text-slate-700 border-collapse border border-slate-300">
              <thead>
                <tr className="text-[10px] text-slate-700 uppercase tracking-wider bg-slate-100 sticky top-0 z-10">
                  <th className="py-1.5 px-2.5 font-extrabold text-slate-700 text-center w-12 bg-slate-100 border border-slate-300">SIRA</th>
                  <th className="py-1.5 px-2.5 font-extrabold text-slate-700 bg-slate-100 border border-slate-300">SINIF ADI</th>
                  <th className="py-1.5 px-2.5 font-extrabold text-slate-700 text-center bg-slate-100 border border-slate-300">SINIR</th>
                  <th className="py-1.5 px-2.5 font-extrabold text-slate-700 text-center bg-slate-100 border border-slate-300">ATANAN</th>
                </tr>
              </thead>
              <tbody>
                {state.classes.map((cls, idx) => {
                  const limit = (() => {
                    let total = 0;
                    state.settings.days.forEach((_, dIdx) => {
                      const dailyVal = cls.dailyPeriods?.[dIdx] ?? state.settings.periodsPerDay;
                      total += dailyVal;
                    });
                    return total;
                  })();
                  const assigned = state.assignments
                    .filter((a) => a.classId === cls.id)
                    .reduce((sum, a) => sum + a.weeklyHours, 0);
                  const isSelected = selectedClassId === cls.id;
                  const isOverLimit = assigned > limit;
                  const isEven = idx % 2 === 0;

                  return (
                    <tr
                      key={cls.id}
                      onClick={() => {
                        setSelectedClassId(cls.id);
                      }}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-blue-100 font-semibold"
                          : isEven
                          ? "bg-white hover:bg-slate-50"
                          : "bg-slate-50/50 hover:bg-slate-50"
                      }`}
                    >
                      <td className="py-1.5 px-2.5 text-center font-bold text-slate-500 border border-slate-200 font-mono">{idx + 1}</td>
                      <td className="py-1.5 px-2.5 font-bold text-slate-800 border border-slate-200">{cls.name}</td>
                      <td className="py-1.5 px-2.5 text-center font-bold text-slate-600 border border-slate-200">{limit}s</td>
                      <td className="py-1.5 px-2.5 text-center border border-slate-200">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          isOverLimit
                            ? "bg-rose-100 text-rose-700 border-rose-200"
                            : assigned === limit
                            ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                            : "bg-blue-100 text-blue-800 border-blue-200"
                        }`}>
                          {assigned}s
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 2. KOLON: Sınıfta Okutulan Dersler */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col h-[calc(100vh-180px)]">
        {(() => {
          const activeClassObj = state.classes.find(c => c.id === selectedClassId) || state.classes[0];
          if (!activeClassObj) {
            return (
              <div className="text-center py-12 text-slate-400 text-xs font-semibold">
                Lütfen önce sol tablodan bir sınıf seçin.
              </div>
            );
          }

          const classAssigns = state.assignments.filter(a => a.classId === activeClassObj.id);
          
          // Enrich and sort alphabetically by course name (turkish aware)
          const enriched = classAssigns.map(a => {
            const course = state.courses.find(c => c.id === a.courseId);
            const teacher = state.teachers.find(t => t.id === a.teacherId);
            return {
              ...a,
              courseName: course ? course.name : "Bilinmeyen Ders",
              courseCode: course ? course.code : "DERS",
              placementMode: course ? course.placementMode : "Bilinmiyor",
              teacherName: teacher ? teacher.name : "Öğretmen Atanmamış"
            };
          });
          enriched.sort((a, b) => a.courseName.localeCompare(b.courseName, "tr"));

          return (
            <>
              <div className="flex flex-col border-b border-slate-100 pb-2.5 mb-2.5 shrink-0">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-extrabold text-slate-800 flex items-center space-x-1.5">
                    <GitCommit className="w-4.5 h-4.5 text-blue-600" />
                    <span>2. Tablo: {activeClassObj.name} Sınıfı Dersleri</span>
                  </h2>
                  <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-mono font-bold">
                    Toplam: {classAssigns.reduce((sum, a) => sum + a.weeklyHours, 0)} Saat
                  </span>
                </div>
              </div>

              {/* Aynısını Kopyala / Aynı Dersleri Ata Aracı */}
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 mb-3 flex flex-col gap-2 text-xs shrink-0">
                <div className="flex flex-col">
                  <span className="font-extrabold text-slate-700">Ders Programını Kopyala:</span>
                  <span className="text-[10px] text-slate-400">Bu sınıftaki ({activeClassObj.name}) tüm dersleri başka sınıfa kopyalayın.</span>
                </div>
                <div className="flex items-center space-x-2">
                  <select
                    value={copySourceClassId}
                    onChange={(e) => setCopySourceClassId(e.target.value)}
                    className="flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="">Hedef Sınıf...</option>
                    {state.classes.filter(c => c.id !== activeClassObj.id).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      if (!copySourceClassId) {
                        showToast("Lütfen kopyalanacak bir hedef sınıf seçin!", "error");
                        return;
                      }
                      handleCopyClassAssignments(activeClassObj.id, copySourceClassId);
                      setCopySourceClassId("");
                    }}
                    className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-all text-xs flex items-center space-x-1 cursor-pointer shadow-sm shrink-0"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Kopyala</span>
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto border border-slate-300 bg-white">
                {enriched.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 text-xs font-semibold px-4">
                    Bu sınıfa henüz ders atanmamış. Sağdaki ders listesinden hızlıca ders ekleyin.
                  </div>
                ) : (
                  <table className="w-full text-xs text-left text-slate-700 border-collapse border border-slate-300">
                    <thead>
                      <tr className="text-[10px] text-slate-700 uppercase tracking-wider bg-slate-100 sticky top-0 z-10">
                        <th className="py-1.5 px-2.5 font-extrabold text-slate-700 text-center w-12 bg-slate-100 border border-slate-300">SIRA</th>
                        <th className="py-1.5 px-2.5 font-extrabold text-slate-700 bg-slate-100 border border-slate-300">DERS ADI</th>
                        <th className="py-1.5 px-2.5 font-extrabold text-slate-700 text-center bg-slate-100 border border-slate-300 w-16">HDS</th>
                        <th className="py-1.5 px-2.5 font-extrabold text-slate-700 text-right w-12 bg-slate-100 border border-slate-300">SİL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {enriched.map((assign, idx) => {
                        const isEven = idx % 2 === 0;
                        return (
                          <tr
                            key={assign.id}
                            className={`transition-colors ${
                              isEven ? "bg-white hover:bg-slate-50" : "bg-slate-50/50 hover:bg-slate-50"
                            }`}
                          >
                            <td className="py-1.5 px-2.5 text-center font-bold text-slate-500 border border-slate-200 font-mono">{idx + 1}</td>
                            <td className="py-1.5 px-2.5 font-bold text-slate-800 border border-slate-200">
                              <span className="bg-slate-100 text-slate-600 text-[9px] px-1.5 py-0.5 rounded font-mono mr-1.5 border border-slate-200">
                                {assign.courseCode}
                              </span>
                              {assign.courseName}
                            </td>
                            <td className="py-1.5 px-2.5 text-center font-extrabold text-blue-600 border border-slate-200 font-mono">{assign.weeklyHours}s</td>
                            <td className="py-1.5 px-2.5 text-right border border-slate-200">
                              <button
                                onClick={() => handleDeleteAssignment(assign.id)}
                                className="p-1 text-rose-500 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                                title="Sil"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          );
        })()}
      </div>

      {/* 3. KOLON: Ders Kütüphanesi */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col h-[calc(100vh-180px)]">
        {(() => {
          const activeClassObj = state.classes.find(c => c.id === selectedClassId) || state.classes[0];
          return (
            <>
              <h2 className="text-sm font-extrabold text-slate-800 mb-2.5 flex items-center justify-between shrink-0">
                <div className="flex items-center space-x-2">
                  <BookOpen className="w-4.5 h-4.5 text-blue-600" />
                  <span>3. Tablo: Ders Kütüphanesi</span>
                </div>
                <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">
                  {state.courses.length} Ders
                </span>
              </h2>
              
              {/* Elegant interactive guidance message replacing the old action column */}
              <div className="mb-3 p-2.5 bg-blue-50/50 border border-blue-100 rounded-xl text-[11px] text-blue-800 font-medium shrink-0 flex items-start gap-2">
                <span className="text-base leading-none">💡</span>
                <p>
                  {activeClassObj ? (
                    <span>
                      Eklemek istediğiniz dersin <strong>satırına tıklamanız yeterlidir</strong>. Tıklanan ders doğrudan <strong className="bg-blue-100 px-1 py-0.5 rounded text-blue-900">{activeClassObj.name}</strong> sınıfına otomatik olarak atanacaktır.
                    </span>
                  ) : (
                    <span>Lütfen önce 1. Tablo'dan ders atamak istediğiniz bir sınıf seçin.</span>
                  )}
                </p>
              </div>

              <div className="flex-1 overflow-y-auto border border-slate-300 bg-white">
                {state.courses.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-xs font-semibold">
                    Kayıtlı ders bulunmuyor.
                  </div>
                ) : (
                  <table className="w-full text-xs text-left text-slate-700 border-collapse border border-slate-300">
                    <thead>
                      <tr className="text-[10px] text-slate-700 uppercase tracking-wider bg-slate-100 sticky top-0 z-10">
                        <th className="py-1.5 px-2.5 font-extrabold text-slate-700 text-center w-12 bg-slate-100 border border-slate-300">SIRA</th>
                        <th className="py-1.5 px-2.5 font-extrabold text-slate-700 bg-slate-100 border border-slate-300">DERS ADI (KOD)</th>
                        <th className="py-1.5 px-2.5 font-extrabold text-slate-700 text-center bg-slate-100 border border-slate-300 w-16">HDS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...state.courses]
                        .sort((a, b) => a.name.localeCompare(b.name, "tr"))
                        .map((crs, idx) => {
                          const isEven = idx % 2 === 0;
                          return (
                            <tr
                              key={crs.id}
                              className={`transition-colors ${
                                activeClassObj 
                                  ? isEven 
                                    ? "bg-white hover:bg-blue-50/30 hover:border-blue-500 cursor-pointer" 
                                    : "bg-slate-50/50 hover:bg-blue-50/30 hover:border-blue-500 cursor-pointer"
                                  : "opacity-60 cursor-not-allowed"
                              }`}
                              onClick={() => {
                                if (activeClassObj) {
                                  handleDirectCourseAssign(activeClassObj.id, crs.id);
                                } else {
                                  showToast("Lütfen önce sol taraftan ders atamak istediğiniz bir sınıf seçin.", "error");
                                }
                              }}
                            >
                              <td className="py-1.5 px-2.5 text-center font-bold text-slate-500 border border-slate-200 font-mono">{idx + 1}</td>
                              <td className="py-1.5 px-2.5 font-bold text-slate-800 border border-slate-200">
                                <div className="flex items-center space-x-2">
                                  <span className="text-slate-800 font-bold">{crs.name}</span>
                                  <span className="text-[10px] bg-slate-100 text-slate-500 font-semibold px-1.5 py-0.2 rounded border border-slate-200/60">{crs.code}</span>
                                </div>
                              </td>
                              <td className="py-1.5 px-2.5 text-center font-extrabold text-blue-600 bg-blue-50/10 border border-slate-200 font-mono">{crs.weeklyHours}s</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          );
        })()}
      </div>
    </motion.div>
  );
}
