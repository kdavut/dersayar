import React from "react";
import { motion } from "motion/react";
import { Wrench, Plus, Calendar, Edit3, Trash2 } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { Classroom } from "../types";
import { createEmptyUnavailability } from "../utils/demoData";

export default function ClassroomsTab() {
  const {
    historyState,
    newClassroom,
    setNewClassroom,
    editingClassroomId,
    setEditingClassroomId,
    selectedClassroomId,
    setSelectedClassroomId,
    activeClassroomTabId,
    setActiveClassroomTabId,
    selectedAssignmentToAssignRoom,
    setSelectedAssignmentToAssignRoom,
    setActiveTab,
    setScheduleViewMode,
    setViewingEntityId,
    setConfirmModal,
    updateState,
    showToast,
  } = useAppStore();

  const state = historyState.current;

  const [assignmentSearch, setAssignmentSearch] = React.useState("");

  const filteredAssignments = React.useMemo(() => {
    return state.assignments.filter((assign) => {
      if (!assignmentSearch.trim()) return true;
      const classObj = state.classes.find(c => c.id === assign.classId);
      const courseObj = state.courses.find(co => co.id === assign.courseId);
      const teacherNames = assign.teacherId 
        ? assign.teacherId.split(",").map(id => state.teachers.find(t => t.id === id)?.name).filter(Boolean).join(", ") 
        : "";
      const searchLower = assignmentSearch.toLowerCase();
      return (
        (classObj?.name || "").toLowerCase().includes(searchLower) ||
        (courseObj?.name || "").toLowerCase().includes(searchLower) ||
        (teacherNames || "").toLowerCase().includes(searchLower)
      );
    });
  }, [state.assignments, state.classes, state.courses, state.teachers, assignmentSearch]);

  const handleClassroomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassroom.name.trim() || !newClassroom.shortName.trim()) {
      showToast("Lütfen atölye adı ve kısa adını doldurun!", "error");
      return;
    }

    updateState((draft) => {
      if (editingClassroomId) {
        const item = draft.classrooms.find((cr) => cr.id === editingClassroomId);
        if (item) {
          item.name = newClassroom.name;
          item.shortName = newClassroom.shortName.toLocaleUpperCase("tr-TR");
        }
        setEditingClassroomId(null);
        showToast("Atölye güncellendi.", "success");
      } else {
        const id = "cr_" + Date.now();
        const item: Classroom = {
          id,
          name: newClassroom.name,
          shortName: newClassroom.shortName.toLocaleUpperCase("tr-TR"),
          type: "workshop" as const,
          unavailability: createEmptyUnavailability(draft.settings.days.length, draft.settings.periodsPerDay)
        };
        draft.classrooms.push(item);
        setSelectedClassroomId(id);
        showToast(`Atölye ${newClassroom.name} sisteme kaydedildi.`, "success");
      }
    });
    setNewClassroom({ name: "", shortName: "" });
  };

  const handleEditClassroom = (cr: Classroom) => {
    setNewClassroom({ name: cr.name, shortName: cr.shortName });
    setEditingClassroomId(cr.id);
  };

  const handleDeleteClassroom = (id: string) => {
    const item = state.classrooms.find((cr) => cr.id === id);
    setConfirmModal({
      isOpen: true,
      title: "Atölyeyi/Laboratuvarı Sil",
      message: `"${item?.name}" atölyesini silmek istediğinize emin misiniz?`,
      isDangerous: true,
      confirmText: "Evet, Sil",
      action: () => {
        updateState((draft) => {
          draft.classrooms = draft.classrooms.filter((cr) => cr.id !== id);
          // Reset classroom requirements to null in assignments
          draft.assignments.forEach((a) => {
            if (a.classroomId === id) a.classroomId = null;
          });
          // Clear classroomId in scheduled slots
          Object.keys(draft.schedule).forEach((cId) => {
            const classSchedules = draft.schedule[cId];
            Object.keys(classSchedules).forEach((dIdxStr) => {
              const dIdx = parseInt(dIdxStr);
              const periods = classSchedules[dIdx] || [];
              for (let p = 0; p < periods.length; p++) {
                if (periods[p]?.classroomId === id) {
                  periods[p]!.classroomId = null;
                }
              }
            });
          });
        });
        if (selectedClassroomId === id) setSelectedClassroomId("");
        showToast("Atölye kaldırıldı.", "info");
        setConfirmModal(null);
      }
    });
  };

  const selectedRoomId = activeClassroomTabId || (state.classrooms.length > 0 ? state.classrooms[0].id : "");
  const roomObj = state.classrooms.find(r => r.id === selectedRoomId);
  const assignedList = roomObj ? state.assignments.filter(a => a.classroomId === selectedRoomId) : [];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="grid grid-cols-1 lg:grid-cols-12 gap-6"
    >
      {/* Bilgilendirme Bannerı */}
      <div className="col-span-1 lg:col-span-12 bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start space-x-3 text-blue-900 shadow-sm">
        <span className="text-lg shrink-0">💡</span>
        <div>
          <h4 className="text-xs font-bold text-blue-950 uppercase tracking-wide">Önemli Atölye Planlama Önerisi</h4>
          <p className="text-[11px] leading-relaxed mt-0.5 text-blue-800 font-medium">
            Bir atölyeye ne kadar çok ders atanırsa, çakışma ihtimali o kadar artacak ve ders programının otomatik olarak oluşturulması o kadar zorlaşacaktır. Atölye ders atamalarını dengeli yapmanız önerilir.
          </p>
        </div>
      </div>

      {/* Sol Atölye Kaydı */}
      <div className="lg:col-span-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col h-fit text-slate-800">
        <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center space-x-2 shrink-0">
          <Wrench className="w-5 h-5 text-blue-600" />
          <span>{editingClassroomId ? "Atölye Düzenle" : "Özel Atölye Kaydı"}</span>
        </h2>

        <form onSubmit={handleClassroomSubmit} className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200/80 shrink-0">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Atölye Adı</label>
            <input
              type="text"
              value={newClassroom.name}
              onChange={(e) => setNewClassroom({ ...newClassroom, name: e.target.value })}
              placeholder="Örn: Bilgisayar Sınıfı, Fizik Laboratuvarı"
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Atölye Kısa Adı (Kod)</label>
            <input
              type="text"
              value={newClassroom.shortName || ""}
              onChange={(e) => setNewClassroom({ ...newClassroom, shortName: e.target.value })}
              placeholder="Örn: BT, FİZ-LAB, AT-1"
              maxLength={8}
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              required
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition duration-150 flex items-center justify-center space-x-1.5 cursor-pointer shadow-md shadow-blue-100"
            >
              <Plus className="w-4 h-4" />
              <span>{editingClassroomId ? "Güncelle" : "Atölye Ekle"}</span>
            </button>
            {editingClassroomId && (
              <button
                type="button"
                onClick={() => {
                  setEditingClassroomId(null);
                  setNewClassroom({ name: "", shortName: "" });
                }}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition"
              >
                İptal
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Sağ Atölye Listesi */}
      <div className="lg:col-span-8 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col text-slate-800">
        <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center space-x-2 shrink-0">
          <Wrench className="w-5 h-5 text-blue-600" />
          <span>Kayıtlı Atölye ve Laboratuvarlar ({state.classrooms.length})</span>
        </h2>

        <div className="overflow-x-auto border border-slate-300 max-h-[500px] overflow-y-auto bg-white">
          {state.classrooms.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs font-semibold">Kayıtlı atölye bulunmuyor.</div>
          ) : (
            <table className="w-full text-xs text-left text-slate-700 border-collapse border border-slate-300">
              <thead>
                <tr className="text-[10px] text-slate-700 uppercase tracking-wider bg-slate-100 sticky top-0 z-10">
                  <th className="py-1.5 px-3 font-extrabold text-slate-700 text-center w-12 bg-slate-100 border border-slate-300">SIRA</th>
                  <th className="py-1.5 px-3 font-extrabold text-slate-700 bg-slate-100 border border-slate-300">ATÖLYE / LABORATUVAR ADI</th>
                  <th className="py-1.5 px-3 font-extrabold text-slate-700 bg-slate-100 border border-slate-300">KISA ADI (KOD)</th>
                  <th className="py-1.5 px-3 font-extrabold text-slate-700 text-right w-24 bg-slate-100 border border-slate-300">İŞLEMLER</th>
                </tr>
              </thead>
              <tbody>
                {state.classrooms.map((cr, idx) => {
                  const isSelected = selectedRoomId === cr.id;
                  const isEven = idx % 2 === 0;
                  return (
                    <tr
                      key={cr.id}
                      onClick={() => setActiveClassroomTabId(cr.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected 
                          ? "bg-blue-100 font-semibold" 
                          : isEven
                          ? "bg-white hover:bg-slate-50"
                          : "bg-slate-50/50 hover:bg-slate-50"
                      }`}
                    >
                      <td className="py-1.5 px-3 text-center font-bold text-slate-500 border border-slate-200 font-mono">{idx + 1}</td>
                      <td className="py-1.5 px-3 font-bold text-slate-800 hover:text-indigo-600 transition cursor-pointer font-sans border border-slate-200" onClick={(e) => {
                        e.stopPropagation();
                        setActiveTab("schedule");
                        setScheduleViewMode("classroom");
                        setViewingEntityId(cr.id);
                        showToast(`"${cr.name}" atölye/derslik programı açıldı.`, "info");
                      }}>
                        <span className="hover:underline flex items-center gap-1.5" title="Haftalık ders programını görmek için tıklayın">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{cr.name}</span>
                        </span>
                      </td>
                      <td className="py-1.5 px-3 border border-slate-200">
                        <span className="bg-blue-50 text-blue-600 text-[10px] font-extrabold px-2 py-0.5 rounded border border-blue-100">
                          {cr.shortName || "Bilinmiyor"}
                        </span>
                      </td>
                      <td className="py-1.5 px-3 text-right border border-slate-200">
                        <div className="inline-flex items-center justify-end space-x-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => {
                              setActiveTab("schedule");
                              setScheduleViewMode("classroom");
                              setViewingEntityId(cr.id);
                              showToast(`"${cr.name}" atölye/derslik programı açıldı.`, "info");
                            }}
                            className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded transition"
                            title="Ders Programını Gör"
                          >
                            <Calendar className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleEditClassroom(cr)}
                            className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded transition"
                            title="Düzenle"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteClassroom(cr.id)}
                            className="p-1 text-rose-500 hover:text-rose-600 hover:bg-rose-50 rounded transition"
                            title="Sil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Atölyeye Sınıf ve Ders Atama Bölümü */}
        {roomObj && (
          <div className="mt-6 p-5 bg-slate-50 border border-slate-200/80 rounded-2xl flex flex-col">
            <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-200 pb-3 mb-4 gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <Wrench className="w-4 h-4 text-blue-600" />
                  <span>{roomObj.name} ({roomObj.shortName}) Atölyesine Atanan Sınıf ve Dersler</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Bu atölyede işlenmek üzere tanımlanan derslerin listesi ve yeni ders atama paneli.</p>
              </div>
            </div>

            {/* Atanmış Sınıf/Ders Listesi */}
            <div className="space-y-2 mb-4">
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Mevcut Atamalar ({assignedList.length})</h4>
              {assignedList.length === 0 ? (
                <div className="text-center py-6 bg-white border border-slate-200/50 rounded-xl text-slate-400 text-xs font-semibold">
                  Bu atölyeye atanmış ders bulunmuyor. Aşağıdaki panelden ders atayabilirsiniz.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {assignedList.map((assign) => {
                    const classObj = state.classes.find(c => c.id === assign.classId);
                    const courseObj = state.courses.find(co => co.id === assign.courseId);
                    const teachersList = assign.teacherId ? assign.teacherId.split(",").map(id => state.teachers.find(t => t.id === id)?.name).filter(Boolean).join(", ") : "Öğretmen Atanmamış";
                    return (
                      <div key={assign.id} className="flex items-center justify-between bg-white p-3 border border-slate-200/60 rounded-xl shadow-sm hover:border-slate-300 transition-all">
                        <div className="flex flex-col min-w-0 pr-2">
                          <span className="text-xs font-bold text-slate-800 truncate">
                            {classObj?.name || "Sınıf"} - {courseObj?.name || "Ders"}
                          </span>
                          <span className="text-[10px] text-slate-500 truncate mt-0.5">
                            Öğretmen: {teachersList} ({assign.weeklyHours} Saat)
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            updateState((draft) => {
                              const aDraft = draft.assignments.find(x => x.id === assign.id);
                              if (aDraft) {
                                aDraft.classroomId = null; // clear classroom allocation
                              }
                              // Clear classroomId in scheduled slots for this assignment
                              Object.keys(draft.schedule).forEach((classId) => {
                                const classSchedules = draft.schedule[classId];
                                if (classSchedules) {
                                  Object.keys(classSchedules).forEach((dIdxStr) => {
                                    const dIdx = parseInt(dIdxStr, 10);
                                    const periods = classSchedules[dIdx] || [];
                                    for (let p = 0; p < periods.length; p++) {
                                      if (periods[p]?.assignmentId === assign.id) {
                                        periods[p]!.classroomId = null;
                                      }
                                    }
                                  });
                                }
                              });
                            });
                            showToast("Atölye ataması başarıyla kaldırıldı.", "success");
                          }}
                          className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition shrink-0"
                          title="Atamayı Kaldır"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Yeni Sınıf-Ders Atama Paneli */}
            <div className="bg-white p-4 border border-slate-200 rounded-xl shadow-sm">
              <div className="mb-3">
                <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">
                  Ders - Sınıf Arama {assignmentSearch.trim() ? `(${filteredAssignments.length} bulundu)` : ""}
                </label>
                <input
                  type="text"
                  value={assignmentSearch}
                  onChange={(e) => setAssignmentSearch(e.target.value)}
                  placeholder="Sınıf, ders veya öğretmen adı arayın..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                />
              </div>
              <h4 className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-2.5">
                Sınıf & Ders Atama {assignmentSearch.trim() ? `(${filteredAssignments.length})` : ""}
              </h4>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <select
                    value={selectedAssignmentToAssignRoom}
                    onChange={(e) => setSelectedAssignmentToAssignRoom(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                  >
                    <option value="">-- Atanacak Sınıf ve Dersi Seçin --</option>
                    {filteredAssignments.map((assign) => {
                      const classObj = state.classes.find(c => c.id === assign.classId);
                      const courseObj = state.courses.find(co => co.id === assign.courseId);
                      const teacherNames = assign.teacherId ? assign.teacherId.split(",").map(id => state.teachers.find(t => t.id === id)?.name).filter(Boolean).join(", ") : "Bilinmiyor";
                      const curRoom = assign.classroomId ? state.classrooms.find(r => r.id === assign.classroomId)?.name : null;
                      
                      return (
                        <option key={assign.id} value={assign.id}>
                          {classObj?.name || "Sınıf"} - {courseObj?.name || "Ders"} ({teacherNames}) {curRoom ? `[Mevcut Atölye: ${curRoom}]` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <button
                  onClick={() => {
                    if (!selectedAssignmentToAssignRoom) {
                      showToast("Lütfen atanacak bir sınıf ve ders seçin.", "error");
                      return;
                    }
                    
                    let unplacedCount = 0;
                    let workshopConflictCount = 0;
                    updateState((draft) => {
                      const aDraft = draft.assignments.find(x => x.id === selectedAssignmentToAssignRoom);
                      if (aDraft) {
                        aDraft.classroomId = selectedRoomId;
                      }
                      
                      const currentRoomObj = draft.classrooms.find(r => r.id === selectedRoomId);
                      
                      // Identify existing assignments assigned to this workshop (excluding the current one)
                      const existingAssignedIds = new Set(
                        draft.assignments
                          .filter(a => a.classroomId === selectedRoomId && a.id !== selectedAssignmentToAssignRoom)
                          .map(a => a.id)
                      );

                      // Map out which days and periods are already occupied in the workshop by other assignments
                      const occupiedWorkshopHours = new Set<string>(); // formatted as "dIdx-pIdx"
                      Object.keys(draft.schedule).forEach((classId) => {
                        const classSchedules = draft.schedule[classId];
                        if (classSchedules) {
                          Object.keys(classSchedules).forEach((dIdxStr) => {
                            const dIdx = parseInt(dIdxStr, 10);
                            const periods = classSchedules[dIdx] || [];
                            for (let p = 0; p < periods.length; p++) {
                              const slot = periods[p];
                              if (slot && slot.assignmentId && existingAssignedIds.has(slot.assignmentId)) {
                                occupiedWorkshopHours.add(`${dIdx}-${p}`);
                              }
                            }
                          });
                        }
                      });
                      
                      // Update existing schedule slots with this classroom ID
                      Object.keys(draft.schedule).forEach((classId) => {
                        const classSchedules = draft.schedule[classId];
                        if (classSchedules) {
                          Object.keys(classSchedules).forEach((dIdxStr) => {
                            const dIdx = parseInt(dIdxStr, 10);
                            const periods = classSchedules[dIdx] || [];
                            for (let p = 0; p < periods.length; p++) {
                              if (periods[p]?.assignmentId === selectedAssignmentToAssignRoom) {
                                // Check if classroom is unavailable at this day/period
                                const isRoomUnavailable = currentRoomObj && currentRoomObj.unavailability?.[dIdx]?.[p];
                                // Check if classroom is already occupied by an existing assignment at this day/period
                                const isRoomOccupied = occupiedWorkshopHours.has(`${dIdx}-${p}`);

                                if (isRoomUnavailable || isRoomOccupied) {
                                  // Clear this slot (unplace) due to conflict with classroom unavailability or prior occupant
                                  periods[p] = null;
                                  if (isRoomOccupied) {
                                    workshopConflictCount++;
                                  } else {
                                    unplacedCount++;
                                  }
                                } else {
                                  periods[p]!.classroomId = selectedRoomId;
                                }
                              }
                            }
                          });
                        }
                      });
                    });

                    if (workshopConflictCount > 0 && unplacedCount > 0) {
                      showToast(`${workshopConflictCount} saatlik ders başka bir sınıfla atölye çakışması nedeniyle, ${unplacedCount} saatlik ders ise atölyenin kapalı olması nedeniyle programdan kaldırıldı (yerleşmedi).`, "info");
                    } else if (workshopConflictCount > 0) {
                      showToast(`${workshopConflictCount} saatlik ders, bu saatlerde atölye başka bir ders için dolu olduğundan programdan kaldırıldı (yerleşmedi).`, "info");
                    } else if (unplacedCount > 0) {
                      showToast(`${unplacedCount} saatlik ders, atölyenin kapalı olduğu saatlere denk geldiği için programdan kaldırıldı (yerleşmedi).`, "info");
                    } else {
                      showToast("Sınıf ve ders başarıyla bu atölyeye atandı.", "success");
                    }
                    setSelectedAssignmentToAssignRoom(""); // reset selection
                  }}
                  className="sm:w-auto w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition duration-150 flex items-center justify-center space-x-1.5 shadow-md shadow-emerald-100 cursor-pointer border-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Atölyeye Ata</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
