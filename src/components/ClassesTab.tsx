import React from "react";
import { motion } from "motion/react";
import { Layers, Plus, Calendar, Edit3, Trash2, Lock } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { GradeClass } from "../types";
import { createEmptyUnavailability } from "../utils/demoData";

export default function ClassesTab() {
  const {
    historyState,
    newClass,
    setNewClass,
    editingClassId,
    setEditingClassId,
    selectedClassId,
    setSelectedClassId,
    setActiveTab,
    setScheduleViewMode,
    setViewingEntityId,
    setConfirmModal,
    updateState,
    showToast,
  } = useAppStore();

  const state = historyState.current;
  const classesMap = new Map<string, GradeClass>(state.classes.map((c) => [c.id, c]));

  const handleClassSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClass.name.trim()) return;

    updateState((draft) => {
      if (editingClassId) {
        const item = draft.classes.find((c) => c.id === editingClassId);
        if (item) item.name = newClass.name;
        setEditingClassId(null);
// removed toast
      } else {
        const id = "c_" + Date.now();
        const item: GradeClass = {
          id,
          name: newClass.name,
          unavailability: createEmptyUnavailability(draft.settings.days.length, draft.settings.periodsPerDay)
        };
        draft.classes.push(item);
        draft.schedule[id] = {};
        for (let d = 0; d < draft.settings.days.length; d++) {
          draft.schedule[id][d] = Array(draft.settings.periodsPerDay).fill(null);
        }
        setSelectedClassId(id);
// removed toast
      }
    });
    setNewClass({ name: "" });
  };

  const handleDeleteClass = (id: string) => {
    const item = state.classes.find((c) => c.id === id);
    setConfirmModal({
      isOpen: true,
      title: "Sınıfı Sil",
      message: `"${item?.name}" sınıfını silmek istediğinize emin misiniz? Sınıfa ait tüm ders programı ve ders dağıtımları da kaldırılacaktır.`,
      isDangerous: true,
      confirmText: "Evet, Sil",
      action: () => {
        updateState((draft) => {
          draft.classes = draft.classes.filter((c) => c.id !== id);
          draft.assignments = draft.assignments.filter((a) => a.classId !== id);
          delete draft.schedule[id];
        });
        if (selectedClassId === id) setSelectedClassId("");
// removed toast
        setConfirmModal(null);
      }
    });
  };

  const handleUpdateClassDailyPeriods = (classId: string, dayIndex: number, periods: number) => {
    updateState((draft) => {
      const cls = draft.classes.find((c) => c.id === classId);
      if (cls) {
        if (!cls.dailyPeriods) {
          cls.dailyPeriods = {};
        }
        cls.dailyPeriods[dayIndex] = periods;
      }
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full"
    >
      {/* Sol Sınıf Girişi */}
      <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col h-[calc(100vh-180px)] text-slate-800">
        <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center space-x-2 shrink-0">
          <Layers className="w-5 h-5 text-blue-600" />
          <span>Sınıf Ekleme</span>
        </h2>

        <form onSubmit={handleClassSubmit} className="space-y-4 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200/80 shrink-0">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Sınıf Adı</label>
            <input
              type="text"
              value={newClass.name}
              onChange={(e) => setNewClass({ name: e.target.value })}
              placeholder="Örn: 9-A, 10-B, 11-FEN-A"
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition duration-150 flex items-center justify-center space-x-1.5 cursor-pointer shadow-md shadow-blue-100"
          >
            <Plus className="w-4 h-4" />
            <span>{editingClassId ? "Sınıfı Güncelle" : "Sınıf Ekle"}</span>
          </button>
        </form>

        <div className="flex-1 overflow-y-auto bg-white border border-slate-300">
          {state.classes.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs font-semibold">Kayıtlı sınıf bulunmuyor.</div>
          ) : (
            <table className="w-full text-xs text-left text-slate-700 border-collapse border border-slate-300">
              <thead>
                <tr className="text-[10px] text-slate-700 uppercase tracking-wider bg-slate-100 sticky top-0 z-10">
                  <th className="py-1.5 px-3 font-extrabold text-slate-700 text-center w-12 bg-slate-100 border border-slate-300">SIRA</th>
                  <th className="py-1.5 px-3 font-extrabold text-slate-700 bg-slate-100 border border-slate-300">SINIF ADI</th>
                  <th className="py-1.5 px-3 font-extrabold text-slate-700 text-right w-24 bg-slate-100 border border-slate-300">İŞLEMLER</th>
                </tr>
              </thead>
              <tbody>
                {state.classes.map((cls, index) => {
                  const isSelected = selectedClassId === cls.id;
                  const isEven = index % 2 === 0;
                  return (
                    <tr
                      key={cls.id}
                      onClick={() => setSelectedClassId(cls.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-blue-100 font-semibold"
                          : isEven
                          ? "bg-white hover:bg-slate-50"
                          : "bg-slate-50/50 hover:bg-slate-50"
                      }`}
                    >
                      <td className="py-1.5 px-3 text-center font-bold text-slate-500 border border-slate-200 font-mono">
                        {index + 1}
                      </td>
                      <td className="py-1.5 px-3 font-bold text-slate-800 border border-slate-200">
                        <span>{cls.name}</span>
                      </td>
                      <td className="py-1.5 px-3 text-right border border-slate-200" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center justify-end space-x-1">
                          <button
                            onClick={() => {
                              setActiveTab("schedule");
                              setScheduleViewMode("class");
                              setViewingEntityId(cls.id);
// removed toast
                            }}
                            className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded transition"
                            title="Haftalık Programı Gör"
                          >
                            <Calendar className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setNewClass({ name: cls.name });
                              setEditingClassId(cls.id);
                            }}
                            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition"
                            title="Düzenle"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteClass(cls.id)}
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
      </div>

      {/* Sınıf Kısıtlamaları */}
      <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col h-[calc(100vh-180px)] text-slate-800">
        {selectedClassId ? (
          <>
            <div className="mb-4 shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                  <Lock className="w-5 h-5 text-blue-600" />
                  <span>Sınıf Günlük ve Haftalık Ayarları</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Sınıfın günlük ders saati limitlerini ve kapalı saatlerini düzenleyin.
                </p>
              </div>
              <div className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-lg self-start sm:self-center">
                <span className="text-xs font-semibold text-blue-700">Seçili Sınıf:</span>
                <span className="text-xs font-bold text-blue-950">
                  {classesMap.get(selectedClassId)?.name}
                </span>
              </div>
            </div>

            {/* GÜNLÜK DERS SAATİ SAYILARI AYARI */}
            <div className="mb-4 bg-slate-50 p-4 rounded-xl border border-slate-200/80 shrink-0">
              <div className="flex items-center space-x-2 mb-2">
                <Calendar className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-bold text-slate-700">Günlük Ders Saati Sayısı Sınırları</span>
              </div>
              <p className="text-[10px] text-slate-500 mb-3">
                Bu sınıf için her bir güne en fazla kaç ders saati yerleştirilebileceğini belirleyin (Örn: Pazartesi: 9, Salı: 7 vb. - En fazla {state.settings.periodsPerDay}).
              </p>
              <div className="flex flex-col gap-2 max-w-xs">
                {state.settings.days.map((day, dIdx) => {
                  const cls = classesMap.get(selectedClassId);
                  const val = cls?.dailyPeriods?.[dIdx] ?? state.settings.periodsPerDay;
                  return (
                    <div key={dIdx} className="bg-white px-3 py-1.5 rounded-lg border border-slate-200 flex items-center justify-between shadow-sm">
                      <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">{day}</span>
                      <div className="flex items-center space-x-2">
                        <input
                          type="number"
                          min="1"
                          max={state.settings.periodsPerDay}
                          value={val}
                          onChange={(e) => handleUpdateClassDailyPeriods(selectedClassId, dIdx, Number(e.target.value))}
                          className="w-16 text-center bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded px-1.5 py-1 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                        />
                        <span className="text-[10px] text-slate-400 font-medium">saat</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 py-12">
            <Layers className="w-12 h-12 mb-3 text-slate-300" />
            <p className="text-xs font-semibold">Sol listeden bir sınıf seçerek günlük ders saati limitlerini düzenleyin.</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
