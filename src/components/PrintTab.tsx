import React from "react";
import { motion } from "motion/react";
import { Users, Layers, Wrench, Search } from "lucide-react";
import { useAppStore } from "../store/useAppStore";

interface PrintTabProps {
  printSearchTeacher: string;
  setPrintSearchTeacher: (val: string) => void;
  printSearchClass: string;
  setPrintSearchClass: (val: string) => void;
  printSearchClassroom: string;
  setPrintSearchClassroom: (val: string) => void;
  selectedPrintTeachers: string[];
  setSelectedPrintTeachers: (val: string[]) => void;
  selectedPrintClasses: string[];
  setSelectedPrintClasses: (val: string[]) => void;
  selectedPrintClassrooms: string[];
  setSelectedPrintClassrooms: (val: string[]) => void;
  printDocNo: string;
  setPrintDocNo: (val: string) => void;
  printDocSubject: string;
  setPrintDocSubject: (val: string) => void;
  setActivePrintJob: (val: { type: string; ids: string[] } | null) => void;
}

export default function PrintTab({
  printSearchTeacher,
  setPrintSearchTeacher,
  printSearchClass,
  setPrintSearchClass,
  printSearchClassroom,
  setPrintSearchClassroom,
  selectedPrintTeachers,
  setSelectedPrintTeachers,
  selectedPrintClasses,
  setSelectedPrintClasses,
  selectedPrintClassrooms,
  setSelectedPrintClassrooms,
  printDocNo,
  setPrintDocNo,
  printDocSubject,
  setPrintDocSubject,
  setActivePrintJob,
}: PrintTabProps) {
  const {
    historyState,
    updateState,
    showToast,
  } = useAppStore();

  const state = historyState.current;

  const handleUpdateEffectiveDate = (date: string) => {
    updateState((draft) => {
      draft.settings.effectiveDate = date;
    });
  };

  const handleUpdateOfficialDocumentNo = (no: string) => {
    updateState((draft) => {
      draft.settings.officialDocumentNo = no;
    });
  };

  const filteredTeachers = state.teachers.filter(t => 
    t.name.toLowerCase().includes(printSearchTeacher.toLowerCase()) || 
    (t.branch && t.branch.toLowerCase().includes(printSearchTeacher.toLowerCase()))
  );
  const filteredClasses = state.classes.filter(c => 
    c.name.toLowerCase().includes(printSearchClass.toLowerCase())
  );
  const filteredClassrooms = state.classrooms.filter(cr => 
    cr.name.toLowerCase().includes(printSearchClassroom.toLowerCase()) ||
    (cr.shortName && cr.shortName.toLowerCase().includes(printSearchClassroom.toLowerCase()))
  );

  const handleToggleAllTeachers = () => {
    if (selectedPrintTeachers.length === state.teachers.length) {
      setSelectedPrintTeachers([]);
    } else {
      setSelectedPrintTeachers(state.teachers.map(t => t.id));
    }
  };

  const handleToggleAllClasses = () => {
    if (selectedPrintClasses.length === state.classes.length) {
      setSelectedPrintClasses([]);
    } else {
      setSelectedPrintClasses(state.classes.map(c => c.id));
    }
  };

  const handleToggleAllClassrooms = () => {
    if (selectedPrintClassrooms.length === state.classrooms.length) {
      setSelectedPrintClassrooms([]);
    } else {
      setSelectedPrintClassrooms(state.classrooms.map(cr => cr.id));
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 no-print text-slate-800"
    >
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-bold text-slate-800">Resmi Belge & Tarih Ayarları</span>
            <span className="text-[10px] bg-slate-100 text-slate-500 font-semibold px-2 py-0.5 rounded">Tüm Çıktılar İçin</span>
          </div>
        </div>
        <p className="text-[11px] text-slate-500 leading-relaxed mt-1">
          Aşağıdaki Sayı ve Konu alanları öğretmen tebliğ belgelerinde yer alırken, <strong>Uygulanma Tarihi</strong> tüm çıktılarda (öğretmen, sınıf ve çarşaf listeler) resmi tarih olarak basılacaktır.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
              Resmi Tebliğ Evrak Sayısı (Sayı)
            </label>
            <input
              type="text"
              value={printDocNo}
              onChange={(e) => {
                setPrintDocNo(e.target.value);
                handleUpdateOfficialDocumentNo(e.target.value);
              }}
              placeholder="Örn: E-70182744-903.02-392"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition font-medium"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
              Resmi Tebliğ Konusu (Konu)
            </label>
            <input
              type="text"
              value={printDocSubject}
              onChange={(e) => setPrintDocSubject(e.target.value)}
              placeholder="Örn: Haftalık Ders Dağıtım Tebliği"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition font-medium"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
              Ders Programı Uygulanma Tarihi
            </label>
            <input
              type="date"
              value={state.settings.effectiveDate || ""}
              onChange={(e) => handleUpdateEffectiveDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition font-medium cursor-pointer"
            />
          </div>
        </div>
      </div>

      <div className={`grid grid-cols-1 ${state.classrooms.length > 0 ? "lg:grid-cols-3" : "md:grid-cols-2"} gap-6`}>
        
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col h-[520px]">
          <div className="flex flex-col space-y-3 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                  <Users className="w-4 h-4" />
                </span>
                <h3 className="font-bold text-slate-800 text-sm">Öğretmenler ({state.teachers.length})</h3>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1 pt-1">
              <button
                onClick={() => {
                  if (selectedPrintTeachers.length === 0) {
                    showToast("Lütfen yazdırılacak öğretmenleri seçin.", "error");
                    return;
                  }
                  setActivePrintJob({ type: "teacher_selected", ids: selectedPrintTeachers });
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold py-1.5 px-2 rounded-lg shadow-sm transition flex flex-col items-center justify-center gap-1 cursor-pointer"
                title="Seçilenleri ayrı ayrı yazdırır"
              >
                <span>Seçilenleri</span>
                <span>Yazdır ({selectedPrintTeachers.length})</span>
              </button>
              <button
                onClick={() => setActivePrintJob({ type: "teacher_all", ids: state.teachers.map(t => t.id) })}
                className="bg-slate-800 hover:bg-slate-900 text-white text-[10px] font-bold py-1.5 px-2 rounded-lg shadow-sm transition flex flex-col items-center justify-center gap-1 cursor-pointer"
                title="Tüm öğretmenleri tek tıkla ayrı ayrı sayfalarda yazdırır"
              >
                <span>Tümünü</span>
                <span>Yazdır</span>
              </button>
              <button
                onClick={() => setActivePrintJob({ type: "teacher_carsaf", ids: state.teachers.map(t => t.id) })}
                className="bg-purple-600 hover:bg-purple-700 text-white text-[10px] font-bold py-1.5 px-2 rounded-lg shadow-sm transition flex flex-col items-center justify-center gap-1 cursor-pointer"
                title="Tüm öğretmenleri tek bir büyük çarşaf program halinde yazdırır"
              >
                <span>Çarşaf</span>
                <span>Yazdır</span>
              </button>
            </div>

            <div className="relative pt-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Öğretmen veya branş ara..."
                value={printSearchTeacher}
                onChange={(e) => setPrintSearchTeacher(e.target.value)}
                className="w-full bg-slate-50 hover:bg-slate-100/70 border border-slate-200 rounded-xl pl-9 pr-4 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition font-medium"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto border border-slate-100 rounded-xl mt-3 divide-y divide-slate-100 bg-white">
            {filteredTeachers.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs font-semibold">Öğretmen bulunamadı.</div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 sticky top-0 font-bold text-slate-500 text-[10px] uppercase border-b border-slate-100 z-10">
                  <tr>
                    <th className="p-2 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={selectedPrintTeachers.length === state.teachers.length && state.teachers.length > 0}
                        onChange={handleToggleAllTeachers}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
                      />
                    </th>
                    <th className="p-2">Ad Soyad</th>
                    <th className="p-2">Branş</th>
                    <th className="p-2 text-right">Tekli</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 font-medium text-slate-700">
                  {filteredTeachers.map((t) => {
                    const isChecked = selectedPrintTeachers.includes(t.id);
                    return (
                      <tr key={t.id} className="hover:bg-slate-50/70 transition">
                        <td className="p-2 text-center">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                  setSelectedPrintTeachers(selectedPrintTeachers.filter(id => id !== t.id));
                              } else {
                                  setSelectedPrintTeachers([...selectedPrintTeachers, t.id]);
                              }
                            }}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
                          />
                        </td>
                        <td className="p-2 font-bold text-slate-800">{t.name}</td>
                        <td className="p-2 text-slate-500">{t.branch || "-"}</td>
                        <td className="p-2 text-right">
                          <button
                            onClick={() => setActivePrintJob({ type: "teacher_single", ids: [t.id] })}
                            className="bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-[10px] text-slate-600 font-bold px-2 py-1 rounded border border-slate-200/60 hover:border-blue-200 transition cursor-pointer"
                          >
                            Yazdır
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col h-[520px]">
          <div className="flex flex-col space-y-3 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                  <Layers className="w-4 h-4" />
                </span>
                <h3 className="font-bold text-slate-800 text-sm">Sınıflar ({state.classes.length})</h3>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1 pt-1">
              <button
                onClick={() => {
                  if (selectedPrintClasses.length === 0) {
                    showToast("Lütfen yazdırılacak sınıfları seçin.", "error");
                    return;
                  }
                  setActivePrintJob({ type: "class_selected", ids: selectedPrintClasses });
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold py-1.5 px-2 rounded-lg shadow-sm transition flex flex-col items-center justify-center gap-1 cursor-pointer"
                title="Seçilenleri ayrı ayrı yazdırır"
              >
                <span>Seçilenleri</span>
                <span>Yazdır ({selectedPrintClasses.length})</span>
              </button>
              <button
                onClick={() => setActivePrintJob({ type: "class_all", ids: state.classes.map(c => c.id) })}
                className="bg-slate-800 hover:bg-slate-900 text-white text-[10px] font-bold py-1.5 px-2 rounded-lg shadow-sm transition flex flex-col items-center justify-center gap-1 cursor-pointer"
                title="Tüm sınıfları tek tıkla ayrı ayrı sayfalarda yazdırır"
              >
                <span>Tümünü</span>
                <span>Yazdır</span>
              </button>
              <button
                onClick={() => setActivePrintJob({ type: "class_carsaf", ids: state.classes.map(c => c.id) })}
                className="bg-purple-600 hover:bg-purple-700 text-white text-[10px] font-bold py-1.5 px-2 rounded-lg shadow-sm transition flex flex-col items-center justify-center gap-1 cursor-pointer"
                title="Tüm sınıfları tek bir büyük çarşaf program halinde yazdırır"
              >
                <span>Çarşaf</span>
                <span>Yazdır</span>
              </button>
            </div>

            <div className="relative pt-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Sınıf ara..."
                value={printSearchClass}
                onChange={(e) => setPrintSearchClass(e.target.value)}
                className="w-full bg-slate-50 hover:bg-slate-100/70 border border-slate-200 rounded-xl pl-9 pr-4 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition font-medium"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto border border-slate-100 rounded-xl mt-3 divide-y divide-slate-100 bg-white">
            {filteredClasses.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs font-semibold">Sınıf bulunamadı.</div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 sticky top-0 font-bold text-slate-500 text-[10px] uppercase border-b border-slate-100 z-10">
                  <tr>
                    <th className="p-2 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={selectedPrintClasses.length === state.classes.length && state.classes.length > 0}
                        onChange={handleToggleAllClasses}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                      />
                    </th>
                    <th className="p-2">Sınıf Adı</th>
                    <th className="p-2 text-right">Tekli</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 font-medium text-slate-700">
                  {filteredClasses.map((c) => {
                    const isChecked = selectedPrintClasses.includes(c.id);
                    return (
                      <tr key={c.id} className="hover:bg-slate-50/70 transition">
                        <td className="p-2 text-center">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setSelectedPrintClasses(selectedPrintClasses.filter(id => id !== c.id));
                              } else {
                                setSelectedPrintClasses([...selectedPrintClasses, c.id]);
                              }
                            }}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                          />
                        </td>
                        <td className="p-2 font-bold text-slate-800">{c.name}</td>
                        <td className="p-2 text-right">
                          <button
                            onClick={() => setActivePrintJob({ type: "class_single", ids: [c.id] })}
                            className="bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-[10px] text-slate-600 font-bold px-2 py-1 rounded border border-slate-200/60 hover:border-indigo-200 transition cursor-pointer"
                          >
                            Yazdır
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {state.classrooms.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col h-[520px]">
            <div className="flex flex-col space-y-3 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
                    <Wrench className="w-4 h-4" />
                  </span>
                  <h3 className="font-bold text-slate-800 text-sm">Atölyeler ({state.classrooms.length})</h3>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1 pt-1">
                <button
                  onClick={() => {
                    if (selectedPrintClassrooms.length === 0) {
                      showToast("Lütfen yazdırılacak atölyeleri seçin.", "error");
                      return;
                    }
                    setActivePrintJob({ type: "classroom_selected", ids: selectedPrintClassrooms });
                  }}
                  className="bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold py-1.5 px-2 rounded-lg shadow-sm transition flex flex-col items-center justify-center gap-1 cursor-pointer"
                  title="Seçilenleri ayrı ayrı yazdırır"
                >
                  <span>Seçilenleri</span>
                  <span>Yazdır ({selectedPrintClassrooms.length})</span>
                </button>
                <button
                  onClick={() => setActivePrintJob({ type: "classroom_all", ids: state.classrooms.map(cr => cr.id) })}
                  className="bg-slate-800 hover:bg-slate-900 text-white text-[10px] font-bold py-1.5 px-2 rounded-lg shadow-sm transition flex flex-col items-center justify-center gap-1 cursor-pointer"
                  title="Tüm atölyeleri tek tıkla ayrı ayrı sayfalarda yazdırır"
                >
                  <span>Tümünü</span>
                  <span>Yazdır</span>
                </button>
                <button
                  onClick={() => setActivePrintJob({ type: "classroom_carsaf", ids: state.classrooms.map(cr => cr.id) })}
                  className="bg-purple-600 hover:bg-purple-700 text-white text-[10px] font-bold py-1.5 px-2 rounded-lg shadow-sm transition flex flex-col items-center justify-center gap-1 cursor-pointer"
                  title="Tüm atölyeleri tek bir büyük çarşaf program halinde yazdırır"
                >
                  <span>Çarşaf</span>
                  <span>Yazdır</span>
                </button>
              </div>

              <div className="relative pt-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Atölye ara..."
                  value={printSearchClassroom}
                  onChange={(e) => setPrintSearchClassroom(e.target.value)}
                  className="w-full bg-slate-50 hover:bg-slate-100/70 border border-slate-200 rounded-xl pl-9 pr-4 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition font-medium"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto border border-slate-100 rounded-xl mt-3 divide-y divide-slate-100 bg-white">
              {filteredClassrooms.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs font-semibold">Atölye bulunamadı.</div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 sticky top-0 font-bold text-slate-500 text-[10px] uppercase border-b border-slate-100 z-10">
                    <tr>
                      <th className="p-2 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={selectedPrintClassrooms.length === state.classrooms.length && state.classrooms.length > 0}
                          onChange={handleToggleAllClassrooms}
                          className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 w-3.5 h-3.5 cursor-pointer"
                        />
                      </th>
                      <th className="p-2">Atölye Adı</th>
                      <th className="p-2 text-right">Tekli</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 font-medium text-slate-700">
                    {filteredClassrooms.map((cr) => {
                      const isChecked = selectedPrintClassrooms.includes(cr.id);
                      return (
                        <tr key={cr.id} className="hover:bg-slate-50/70 transition">
                          <td className="p-2 text-center">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                if (isChecked) {
                                  setSelectedPrintClassrooms(selectedPrintClassrooms.filter(id => id !== cr.id));
                                } else {
                                  setSelectedPrintClassrooms([...selectedPrintClassrooms, cr.id]);
                                }
                              }}
                              className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 w-3.5 h-3.5 cursor-pointer"
                            />
                          </td>
                          <td className="p-2 font-bold text-slate-800">{cr.name}</td>
                          <td className="p-2 text-right">
                            <button
                              onClick={() => setActivePrintJob({ type: "classroom_single", ids: [cr.id] })}
                              className="bg-slate-100 hover:bg-amber-50 hover:text-amber-600 text-[10px] text-slate-600 font-bold px-2 py-1 rounded border border-slate-200/60 hover:border-amber-200 transition cursor-pointer"
                            >
                              Yazdır
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

      </div>
    </motion.div>
  );
}
