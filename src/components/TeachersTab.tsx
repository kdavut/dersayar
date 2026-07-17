import React from "react";
import { motion } from "motion/react";
import { Users, Plus, ChevronUp, ChevronDown, Edit3, Trash2 } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { Teacher } from "../types";
import { createEmptyUnavailability } from "../utils/demoData";

export default function TeachersTab() {
  const {
    historyState,
    newTeacher,
    setNewTeacher,
    editingTeacherId,
    setEditingTeacherId,
    selectedTeacherId,
    setSelectedTeacherId,
    setConfirmModal,
    updateState,
    showToast,
  } = useAppStore();

  const state = historyState.current;

  const handleTeacherSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeacher.name.trim() || !newTeacher.branch.trim()) return;

    updateState((draft) => {
      if (editingTeacherId) {
        // Edit Mode
        const teacher = draft.teachers.find((t) => t.id === editingTeacherId);
        if (teacher) {
          teacher.name = newTeacher.name;
          teacher.branch = newTeacher.branch;
          teacher.shortName = newTeacher.shortName.trim().toLocaleUpperCase("tr-TR");
          teacher.homeroomClass = newTeacher.homeroomClass.trim();
        }
        setEditingTeacherId(null);
        showToast("Öğretmen bilgileri güncellendi.", "success");
      } else {
        // Add Mode
        const id = "t_" + Date.now();
        const teacher: Teacher = {
          id,
          name: newTeacher.name,
          branch: newTeacher.branch,
          shortName: newTeacher.shortName.trim().toLocaleUpperCase("tr-TR") || undefined,
          homeroomClass: newTeacher.homeroomClass.trim() || undefined,
          unavailability: createEmptyUnavailability(draft.settings.days.length, draft.settings.periodsPerDay)
        };
        draft.teachers.push(teacher);
        setSelectedTeacherId(id);
        showToast(`Öğretmen ${newTeacher.name} sisteme eklendi.`, "success");
      }
    });

    setNewTeacher({ name: "", branch: "", shortName: "", homeroomClass: "" });
  };

  const handleEditTeacher = (teacher: Teacher) => {
    setNewTeacher({
      name: teacher.name,
      branch: teacher.branch,
      shortName: teacher.shortName || "",
      homeroomClass: teacher.homeroomClass || ""
    });
    setEditingTeacherId(teacher.id);
  };

  const handleDeleteTeacher = (id: string) => {
    const teacher = state.teachers.find((t) => t.id === id);
    setConfirmModal({
      isOpen: true,
      title: "Öğretmeni Sil",
      message: `"${teacher?.name}" öğretmenini silmek istediğinize emin misiniz? Öğretmene bağlı tüm ders dağıtımları भी silinecektir.`,
      isDangerous: true,
      confirmText: "Evet, Sil",
      action: () => {
        updateState((draft) => {
          draft.teachers = draft.teachers.filter((t) => t.id !== id);
          // Clean assignments teacherId
          draft.assignments.forEach((a) => {
            if (a.teacherId) {
              const currentIds = a.teacherId.split(",");
              const filteredIds = currentIds.filter(tId => tId !== id);
              a.teacherId = filteredIds.join(",");
            }
          });
          // Clean schedule slots referring to this teacher
          Object.keys(draft.schedule).forEach((cId) => {
            const classSchedules = draft.schedule[cId];
            Object.keys(classSchedules).forEach((dIdxStr) => {
              const dIdx = parseInt(dIdxStr);
              const periods = classSchedules[dIdx] || [];
              for (let p = 0; p < periods.length; p++) {
                if (periods[p]?.teacherId) {
                  const currentIds = periods[p].teacherId.split(",");
                  if (currentIds.includes(id)) {
                     const filteredIds = currentIds.filter(tId => tId !== id);
                     periods[p].teacherId = filteredIds.join(",");
                  }
                }
              }
            });
          });
        });
        if (selectedTeacherId === id) setSelectedTeacherId("");
        showToast("Öğretmen ve ilgili ders tanımları silindi.", "info");
        setConfirmModal(null);
      }
    });
  };

  const handleMoveTeacherUp = (index: number) => {
    if (index === 0) return;
    updateState((draft) => {
      const temp = draft.teachers[index];
      draft.teachers[index] = draft.teachers[index - 1];
      draft.teachers[index - 1] = temp;
    });
  };

  const handleMoveTeacherDown = (index: number) => {
    if (index === state.teachers.length - 1) return;
    updateState((draft) => {
      const temp = draft.teachers[index];
      draft.teachers[index] = draft.teachers[index + 1];
      draft.teachers[index + 1] = temp;
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="grid grid-cols-1 lg:grid-cols-12 gap-2 text-slate-800"
    >
      {/* Sol Alan: Öğretmen Ekleme Formu */}
      <div className="lg:col-span-4 bg-white p-3 rounded-lg border border-slate-200/80 shadow-sm flex flex-col h-fit">
        <h2 className="text-xs font-bold text-slate-800 mb-2.5 flex items-center space-x-1.5 shrink-0">
          <Users className="w-4 h-4 text-blue-600" />
          <span>{editingTeacherId ? "Öğretmen Düzenle" : "Özel Öğretmen Kaydı"}</span>
        </h2>

        {/* Form - Tüm alanlar alt alta */}
        <form onSubmit={handleTeacherSubmit} className="space-y-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 shrink-0">
          <div>
            <label className="block text-[9px] font-bold text-slate-500 mb-0.5 uppercase tracking-wider">Öğretmen Adı</label>
            <input
              type="text"
              value={newTeacher.name}
              onChange={(e) => setNewTeacher({ ...newTeacher, name: e.target.value })}
              placeholder="Ad Soyad"
              className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500/20 focus:border-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-[9px] font-bold text-slate-500 mb-0.5 uppercase tracking-wider">Kısa Adı</label>
            <input
              type="text"
              value={newTeacher.shortName || ""}
              onChange={(e) => setNewTeacher({ ...newTeacher, shortName: e.target.value })}
              placeholder="Örn: SÜL-YIL"
              maxLength={8}
              className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-[9px] font-bold text-slate-500 mb-0.5 uppercase tracking-wider">Branş</label>
            <input
              type="text"
              value={newTeacher.branch}
              onChange={(e) => setNewTeacher({ ...newTeacher, branch: e.target.value })}
              placeholder="Örn: Matematik"
              className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500/20 focus:border-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-[9px] font-bold text-slate-500 mb-0.5 uppercase tracking-wider">Sınıf Rehberliği</label>
            <select
              value={newTeacher.homeroomClass || ""}
              onChange={(e) => setNewTeacher({ ...newTeacher, homeroomClass: e.target.value })}
              className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500/20 focus:border-blue-500"
            >
              <option value="">Seçiniz (Yok)</option>
              {state.classes.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex space-x-1.5 pt-1">
            <button
              type="submit"
              className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-bold transition duration-150 flex items-center justify-center space-x-1.5 cursor-pointer shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{editingTeacherId ? "Güncelle" : "Ekle"}</span>
            </button>
            {editingTeacherId && (
              <button
                type="button"
                onClick={() => {
                  setEditingTeacherId(null);
                  setNewTeacher({ name: "", branch: "", shortName: "", homeroomClass: "" });
                }}
                className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-[11px] font-bold transition"
              >
                İptal
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Sağ Alan: Kayıtlı Öğretmen Listesi */}
      <div className="lg:col-span-8 bg-white p-3 rounded-lg border border-slate-200/80 shadow-sm flex flex-col">
        <div className="flex items-center justify-between mb-2 shrink-0">
          <h2 className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
            <Users className="w-4 h-4 text-blue-600" />
            <span>Kayıtlı Öğretmenler ({state.teachers.length})</span>
          </h2>
          <span className="text-[10px] text-slate-400 font-semibold">
            Sıralama eklenme sırasına göredir
          </span>
        </div>

        {/* Sabit Sıralama Çubuğu (Selected Teacher Controls) */}
        {selectedTeacherId && state.teachers.some(t => t.id === selectedTeacherId) && (() => {
          const idx = state.teachers.findIndex(t => t.id === selectedTeacherId);
          const selTeacher = state.teachers[idx];
          return (
            <div className="mb-2 p-1.5 bg-blue-50 border border-blue-150 rounded flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 shadow-sm">
              <div className="flex flex-col">
                <span className="text-[8px] font-extrabold text-blue-500 uppercase tracking-wider">Sıralama Yönetimi (Seçili)</span>
                <span className="text-[11px] font-bold text-slate-800">{selTeacher?.name} ({selTeacher?.branch})</span>
              </div>
              <div className="flex items-center space-x-1.5 self-end sm:self-auto">
                <button
                  onClick={() => handleMoveTeacherUp(idx)}
                  disabled={idx === 0}
                  className="px-2 py-1 bg-white border border-slate-200 hover:border-blue-500 text-slate-700 disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-400 rounded text-[10px] font-bold transition flex items-center space-x-1 shadow-sm"
                  title="Listede bir sıra yukarı taşı"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                  <span>Yukarı Taşı</span>
                </button>
                <button
                  onClick={() => handleMoveTeacherDown(idx)}
                  disabled={idx === state.teachers.length - 1}
                  className="px-2 py-1 bg-white border border-slate-200 hover:border-blue-500 text-slate-700 disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-400 rounded text-[10px] font-bold transition flex items-center space-x-1 shadow-sm"
                  title="Listede bir sıra aşağı taşı"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span>Aşağı Taşı</span>
                </button>
              </div>
            </div>
          );
        })()}

        {/* List Container - Tablo Halinde */}
        <div className="overflow-x-auto border border-slate-300 max-h-[600px] overflow-y-auto bg-white rounded">
          {state.teachers.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs font-semibold">Kayıtlı öğretmen bulunmuyor. Sol taraftan ekleyin.</div>
          ) : (
            <table className="w-full text-[11px] text-left text-slate-700 border-collapse border border-slate-300">
              <thead>
                <tr className="bg-slate-100 uppercase tracking-wider font-bold text-[10px] text-slate-700 sticky top-0 z-10">
                  <th className="py-1 px-2 text-center w-10 border border-slate-300">SIRA</th>
                  <th className="py-1 px-2 border border-slate-300">ÖĞRETMEN ADI</th>
                  <th className="py-1 px-2 border border-slate-300">BRANŞ (KOD)</th>
                  <th className="py-1 px-2 border border-slate-300">REHBERLİK</th>
                  <th className="py-1 px-2 text-right w-20 border border-slate-300">İŞLEMLER</th>
                </tr>
              </thead>
              <tbody>
                {state.teachers.map((teacher, index) => {
                  const isSelected = selectedTeacherId === teacher.id;
                  const isEven = index % 2 === 0;
                  return (
                    <tr
                      key={teacher.id}
                      onClick={() => setSelectedTeacherId(teacher.id)}
                      className={`cursor-pointer transition-colors h-6.5 ${
                        isSelected
                          ? "bg-blue-100 font-semibold"
                          : isEven
                          ? "bg-white hover:bg-slate-50"
                          : "bg-slate-50/50 hover:bg-slate-50"
                      }`}
                    >
                      <td className="py-0.5 px-2 text-center font-bold text-slate-500 border border-slate-200 font-mono">
                        {index + 1}
                      </td>
                      <td className="py-0.5 px-2 font-bold text-slate-800 border border-slate-200">
                        <span>{teacher.name}</span>
                      </td>
                      <td className="py-0.5 px-2 border border-slate-200">
                        <span className="font-bold text-slate-700">
                          {teacher.branch}
                        </span>
                        {teacher.shortName && (
                          <span className="text-blue-600 font-bold ml-1.5 text-[9px] uppercase bg-blue-50 px-1 py-0.2 border border-blue-100 rounded">
                            {teacher.shortName}
                          </span>
                        )}
                      </td>
                      <td className="py-0.5 px-2 border border-slate-200">
                        {teacher.homeroomClass ? (
                          <span className="bg-emerald-50 text-emerald-700 text-[9px] font-bold px-1.5 py-0.2 rounded border border-emerald-150 uppercase">
                            {teacher.homeroomClass}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="py-0.5 px-2 text-right border border-slate-200" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center justify-end space-x-1">
                          <button
                            onClick={() => handleEditTeacher(teacher)}
                            className="p-0.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded transition"
                            title="Düzelt"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteTeacher(teacher.id)}
                            className="p-0.5 text-rose-500 hover:text-rose-600 hover:bg-rose-50 rounded transition"
                            title="Sil"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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
      </div>
    </motion.div>
  );
}
