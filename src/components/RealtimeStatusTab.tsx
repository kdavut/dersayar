import React, { useState } from "react";
import { motion } from "motion/react";
import { Activity } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { isChefOrCoordinatorCourse } from "../utils/scheduler";

export default function RealtimeStatusTab() {
  const { historyState } = useAppStore();
  const [realtimeDaySel, setRealtimeDaySel] = useState<"now" | number>("now");
  const [realtimePeriodSel, setRealtimePeriodSel] = useState<"now" | number>("now");

  const state = historyState.current;

  // Get current PC day and period
  const turkishDays = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
  
  const getMinutes = (timeStr: string) => {
    const [h, m] = timeStr.split(":").map(Number);
    return h * 60 + m;
  };

  const now = new Date();
  const systemDayName = turkishDays[now.getDay()];
  let systemDIdx = state.settings.days.indexOf(systemDayName);
  if (systemDIdx === -1) systemDIdx = 0; // Default to first day if weekend

  const currentHours = String(now.getHours()).padStart(2, '0');
  const currentMinutes = String(now.getMinutes()).padStart(2, '0');
  const currentStr = `${currentHours}:${currentMinutes}`;
  const currentMin = getMinutes(currentStr);

  const times = state.settings.periodTimes || [];
  let systemPIdx = 0;
  if (times.length > 0) {
    const foundIdx = times.findIndex(t => currentMin <= getMinutes(t.end));
    if (foundIdx !== -1) {
      systemPIdx = foundIdx;
    } else {
      systemPIdx = times.length - 1;
    }
  }

  // Determine active day index and period index based on state
  const activeDIdx = realtimeDaySel === "now" ? systemDIdx : realtimeDaySel;
  const activePIdx = (realtimeDaySel === "now" || realtimePeriodSel === "now") ? systemPIdx : (realtimePeriodSel as number);

  const activeDayName = state.settings.days[activeDIdx] || "Belirsiz";
  const activePeriodName = times[activePIdx] ? `${activePIdx + 1}. Ders (${times[activePIdx].start} - ${times[activePIdx].end})` : `${activePIdx + 1}. Ders`;

  // Helper to check if slot is real lesson (excluding headship/coordination)
  const isRealLessonSlot = (slot: any) => {
    if (!slot) return false;
    const course = state.courses.find(c => c.id === slot.courseId);
    if (!course) return false;
    return !isChefOrCoordinatorCourse(course.name, course.code);
  };

  // Categorize teachers
  // Let's first build teacher slot maps for the active day
  const teacherSlotsMap = new Map<string, { periodIdx: number; slot: any; classId: string }[]>();
  state.teachers.forEach(t => teacherSlotsMap.set(t.id, []));

  Object.keys(state.schedule).forEach((classId) => {
    const daySchedule = state.schedule[classId]?.[activeDIdx];
    if (daySchedule) {
      daySchedule.forEach((slot, periodIdx) => {
        if (slot && slot.teacherId) {
          const tIds = slot.teacherId.split(",");
          tIds.forEach(tId => {
            const list = teacherSlotsMap.get(tId) || [];
            list.push({ periodIdx, slot, classId });
            teacherSlotsMap.set(tId, list);
          });
        }
      });
    }
  });

  // Prepare categories
  const currentlyTeaching: { teacher: any; classNames: string; courseNames: string }[] = [];
  const breakTime: { teacher: any; completedCount: number; remainingCount: number }[] = [];
  const notStarted: { teacher: any; firstPeriod: number }[] = [];
  const finishedForDay: { teacher: any; lastPeriod: number }[] = [];
  const noLessonsToday: { teacher: any }[] = [];

  state.teachers.forEach((t) => {
    const allSlots = teacherSlotsMap.get(t.id) || [];
    const realLessonPeriods = allSlots
      .filter(item => isRealLessonSlot(item.slot))
      .map(item => item.periodIdx);

    if (realLessonPeriods.length === 0) {
      noLessonsToday.push({ teacher: t });
    } else if (realLessonPeriods.includes(activePIdx)) {
      const activeItems = allSlots.filter(item => item.periodIdx === activePIdx && isRealLessonSlot(item.slot));
      const classNames = activeItems.map(item => {
        const cObj = state.classes.find(c => c.id === item.classId);
        return cObj ? cObj.name : "Sınıf";
      }).join(", ");
      const courseNames = activeItems.map(item => {
        const crs = state.courses.find(c => c.id === item.slot.courseId);
        return crs ? crs.code || crs.name : "Ders";
      }).join(", ");

      currentlyTeaching.push({ teacher: t, classNames, courseNames });
    } else {
      const earlierLessons = realLessonPeriods.filter(p => p < activePIdx);
      const laterLessons = realLessonPeriods.filter(p => p > activePIdx);

      if (earlierLessons.length > 0 && laterLessons.length > 0) {
        breakTime.push({
          teacher: t,
          completedCount: earlierLessons.length,
          remainingCount: laterLessons.length
        });
      } else if (earlierLessons.length > 0 && laterLessons.length === 0) {
        const lastPeriod = Math.max(...earlierLessons);
        finishedForDay.push({ teacher: t, lastPeriod });
      } else if (earlierLessons.length === 0 && laterLessons.length > 0) {
        const firstPeriod = Math.min(...laterLessons);
        notStarted.push({ teacher: t, firstPeriod });
      }
    }
  });

  const totalTeachers = state.teachers.length;
  const activeCount = currentlyTeaching.length;
  const breakCount = breakTime.length;
  const notStartedCount = notStarted.length;
  const finishedCount = finishedForDay.length;
  const noLessonsCount = noLessonsToday.length;

  const activePercent = totalTeachers > 0 ? Math.round((activeCount / totalTeachers) * 100) : 0;
  const inSchoolCount = activeCount + breakCount;
  const inSchoolPercent = totalTeachers > 0 ? Math.round((inSchoolCount / totalTeachers) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="flex-1 flex flex-col overflow-hidden p-1 space-y-1.5 text-slate-800"
    >
      {/* Selector Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-sm shrink-0">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5">
            <div className="p-1 bg-blue-50 text-blue-600 rounded">
              <Activity className="w-4 h-4 animate-pulse" />
            </div>
            <h2 className="text-xs font-bold text-slate-800">Okul Anlık Durum İzleme Paneli</h2>
          </div>
          <p className="text-[10px] text-slate-500 font-semibold">
            {realtimeDaySel === "now" ? (
              <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Canlı Durum: {activeDayName} Günü, {activePeriodName} ders saati (PC saatiyle anlık senkronize).
              </span>
            ) : (
              <span className="text-blue-600 font-semibold">
                Planlı Zaman Durumu: {activeDayName} Günü, {activePeriodName} ders saati.
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">GÜN:</span>
            <select
              value={realtimeDaySel}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "now") {
                  setRealtimeDaySel("now");
                  setRealtimePeriodSel("now");
                } else {
                  setRealtimeDaySel(Number(val));
                  setRealtimePeriodSel(0);
                }
              }}
              className="bg-slate-50 border border-slate-200 text-[10px] font-bold text-slate-800 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500/20 focus:bg-white transition cursor-pointer min-w-[110px]"
            >
              <option value="now">🔴 Şu an (Canlı)</option>
              {state.settings.days.map((day, dIdx) => (
                <option key={dIdx} value={dIdx}>{day}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">SAAT:</span>
            <select
              value={realtimePeriodSel}
              disabled={realtimeDaySel === "now"}
              onChange={(e) => setRealtimePeriodSel(Number(e.target.value))}
              className="bg-slate-50 border border-slate-200 text-[10px] font-bold text-slate-800 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500/20 focus:bg-white transition disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer min-w-[110px]"
            >
              {realtimeDaySel === "now" ? (
                <option value="now">⚡ Canlı ({activePIdx + 1}. Saat)</option>
              ) : (
                times.map((time, pIdx) => (
                  <option key={pIdx} value={pIdx}>
                    {pIdx + 1}. Ders ({time.start} - {time.end})
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
      </div>

      {/* Symmetrical 3x2 Grid */}
      <div className="flex-1 overflow-y-auto pr-1">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 animate-fade-in">
          
          {/* Card 1: Şuan Derste Olanlar */}
          <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-2 flex flex-col justify-between h-[230px]">
            <div className="flex flex-col h-full overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 pb-1 mb-1.5 shrink-0">
                <h3 className="text-[10px] font-bold text-slate-800 flex items-center gap-1 uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block animate-pulse"></span>
                  Dersteki Öğretmenler
                </h3>
                <span className="bg-blue-50 text-blue-600 font-bold text-[9px] px-1.5 py-0.2 rounded">
                  {currentlyTeaching.length}
                </span>
              </div>

              <div className="flex-1 overflow-hidden">
                {currentlyTeaching.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-2">
                    <span className="text-lg mb-1">💤</span>
                    <p className="text-[10px] text-slate-400 font-semibold">Bu periyotta aktif ders bulunmamaktadır.</p>
                  </div>
                ) : (
                  <div className="overflow-y-auto h-full pr-0.5">
                    <table className="w-full text-[11px] text-left text-slate-700 border-collapse border border-slate-200">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[9px] font-bold text-slate-500 uppercase tracking-wider sticky top-0 z-10">
                          <th className="py-0.5 px-1.5 border border-slate-200">Öğretmen</th>
                          <th className="py-0.5 px-1.5 border border-slate-200 text-right">Sınıf (Ders)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentlyTeaching.map(({ teacher, classNames, courseNames }) => (
                          <tr key={teacher.id} className="hover:bg-slate-50/50 transition h-6">
                            <td className="py-0.5 px-1.5 font-bold text-slate-800 border border-slate-150 truncate max-w-[110px]">{teacher.name}</td>
                            <td className="py-0.5 px-1.5 text-right font-bold text-blue-600 border border-slate-150">
                              {classNames} <span className="text-slate-400 text-[9px] font-semibold">({courseNames})</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Card 2: Ders Arasında Olanlar */}
          <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-2 flex flex-col justify-between h-[230px]">
            <div className="flex flex-col h-full overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 pb-1 mb-1.5 shrink-0">
                <h3 className="text-[10px] font-bold text-slate-800 flex items-center gap-1 uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block"></span>
                  Ders Arasında Olanlar
                </h3>
                <span className="bg-amber-50 text-amber-600 font-bold text-[9px] px-1.5 py-0.2 rounded">
                  {breakTime.length}
                </span>
              </div>

              <div className="flex-1 overflow-hidden">
                {breakTime.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-2">
                    <span className="text-lg mb-1">☕</span>
                    <p className="text-[10px] text-slate-400 font-semibold">Ders arasında dinlenen öğretmen bulunmuyor.</p>
                  </div>
                ) : (
                  <div className="overflow-y-auto h-full pr-0.5">
                    <table className="w-full text-[11px] text-left text-slate-700 border-collapse border border-slate-200">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[9px] font-bold text-slate-500 uppercase tracking-wider sticky top-0 z-10">
                          <th className="py-0.5 px-1.5 border border-slate-200">Öğretmen</th>
                          <th className="py-0.5 px-1.5 border border-slate-200 text-right">Ders Dağılımı (Bugün)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {breakTime.map(({ teacher, completedCount, remainingCount }) => (
                          <tr key={teacher.id} className="hover:bg-slate-50/50 transition h-6">
                            <td className="py-0.5 px-1.5 font-bold text-slate-800 border border-slate-150 truncate max-w-[110px]">{teacher.name}</td>
                            <td className="py-0.5 px-1.5 text-right font-bold text-amber-600 border border-slate-150">
                              Biten: {completedCount} / Kalan: {remainingCount}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Card 3: Günlük Dersleri Henüz Başlamayanlar */}
          <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-2 flex flex-col justify-between h-[230px]">
            <div className="flex flex-col h-full overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 pb-1 mb-1.5 shrink-0">
                <h3 className="text-[10px] font-bold text-slate-800 flex items-center gap-1 uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block"></span>
                  Henüz Başlamamış
                </h3>
                <span className="bg-indigo-50 text-indigo-600 font-bold text-[9px] px-1.5 py-0.2 rounded">
                  {notStarted.length}
                </span>
              </div>

              <div className="flex-1 overflow-hidden">
                {notStarted.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-2">
                    <span className="text-lg mb-1">📋</span>
                    <p className="text-[10px] text-slate-400 font-semibold">Tüm öğretmenlerin dersleri başlamış durumda.</p>
                  </div>
                ) : (
                  <div className="overflow-y-auto h-full pr-0.5">
                    <table className="w-full text-[11px] text-left text-slate-700 border-collapse border border-slate-200">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[9px] font-bold text-slate-500 uppercase tracking-wider sticky top-0 z-10">
                          <th className="py-0.5 px-1.5 border border-slate-200">Öğretmen</th>
                          <th className="py-0.5 px-1.5 border border-slate-200 text-right">İlk Ders Saati</th>
                        </tr>
                      </thead>
                      <tbody>
                        {notStarted.map(({ teacher, firstPeriod }) => {
                          const time = times[firstPeriod];
                          return (
                            <tr key={teacher.id} className="hover:bg-slate-50/50 transition h-6">
                              <td className="py-0.5 px-1.5 font-bold text-slate-800 border border-slate-150 truncate max-w-[110px]">{teacher.name}</td>
                              <td className="py-0.5 px-1.5 text-right font-bold text-indigo-600 border border-slate-150">
                                {firstPeriod + 1}. Ders {time ? `(${time.start})` : ""}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Card 4: Günlük Tüm Dersleri Bitenler */}
          <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-2 flex flex-col justify-between h-[230px]">
            <div className="flex flex-col h-full overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 pb-1 mb-1.5 shrink-0">
                <h3 className="text-[10px] font-bold text-slate-800 flex items-center gap-1 uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500 inline-block"></span>
                  Tüm Dersleri Bitenler
                </h3>
                <span className="bg-purple-50 text-purple-600 font-bold text-[9px] px-1.5 py-0.2 rounded">
                  {finishedForDay.length}
                </span>
              </div>

              <div className="flex-1 overflow-hidden">
                {finishedForDay.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-2">
                    <span className="text-lg mb-1">🏃</span>
                    <p className="text-[10px] text-slate-400 font-semibold">Henüz ders programını tamamlayan öğretmen yok.</p>
                  </div>
                ) : (
                  <div className="overflow-y-auto h-full pr-0.5">
                    <table className="w-full text-[11px] text-left text-slate-700 border-collapse border border-slate-200">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[9px] font-bold text-slate-500 uppercase tracking-wider sticky top-0 z-10">
                          <th className="py-0.5 px-1.5 border border-slate-200">Öğretmen</th>
                          <th className="py-0.5 px-1.5 border border-slate-200 text-right">Son Ders Saati</th>
                        </tr>
                      </thead>
                      <tbody>
                        {finishedForDay.map(({ teacher, lastPeriod }) => {
                          const time = times[lastPeriod];
                          return (
                            <tr key={teacher.id} className="hover:bg-slate-50/50 transition h-6">
                              <td className="py-0.5 px-1.5 font-bold text-slate-800 border border-slate-150 truncate max-w-[110px]">{teacher.name}</td>
                              <td className="py-0.5 px-1.5 text-right font-bold text-purple-600 border border-slate-150">
                                {lastPeriod + 1}. Ders {time ? `(${time.end})` : ""}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Card 5: Bugün Hiç Dersi Olmayanlar */}
          <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-2 flex flex-col justify-between h-[230px]">
            <div className="flex flex-col h-full overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 pb-1 mb-1.5 shrink-0">
                <h3 className="text-[10px] font-bold text-slate-800 flex items-center gap-1 uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block"></span>
                  Bugün Dersi Olmayanlar
                </h3>
                <span className="bg-slate-100 text-slate-600 font-bold text-[9px] px-1.5 py-0.2 rounded">
                  {noLessonsToday.length}
                </span>
              </div>

              <div className="flex-1 overflow-hidden">
                {noLessonsToday.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-2">
                    <span className="text-lg mb-1">📚</span>
                    <p className="text-[10px] text-slate-400 font-semibold">Bugün tüm öğretmenlerin en az bir dersi var.</p>
                  </div>
                ) : (
                  <div className="overflow-y-auto h-full pr-0.5">
                    <table className="w-full text-[11px] text-left text-slate-700 border-collapse border border-slate-200">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[9px] font-bold text-slate-500 uppercase tracking-wider sticky top-0 z-10">
                          <th className="py-0.5 px-1.5 border border-slate-200">Öğretmen</th>
                          <th className="py-0.5 px-1.5 border border-slate-200 text-right">Branş</th>
                        </tr>
                      </thead>
                      <tbody>
                        {noLessonsToday.map(({ teacher }) => (
                          <tr key={teacher.id} className="hover:bg-slate-50/50 transition h-6">
                            <td className="py-0.5 px-1.5 font-bold text-slate-800 border border-slate-150 truncate max-w-[110px]">{teacher.name}</td>
                            <td className="py-0.5 px-1.5 text-right font-medium text-slate-500 border border-slate-150">
                              {teacher.branch || "Branş Yok"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Card 6: İstatistiksel Özet */}
          <div className="bg-white rounded-lg border border-slate-200/80 shadow-sm p-2 flex flex-col justify-between h-[230px]">
            <div className="flex flex-col h-full justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-1 mb-1.5">
                  <h3 className="text-[10px] font-bold text-slate-800 flex items-center gap-1 uppercase tracking-wider">
                    <Activity className="w-3.5 h-3.5 text-slate-500 animate-pulse" />
                    Genel Analiz & Özet
                  </h3>
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">İSTATİSTİKLER</span>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <div className="bg-slate-50/60 border border-slate-100 rounded p-1 text-center">
                    <div className="text-sm font-black text-slate-800">{totalTeachers}</div>
                    <div className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Toplam Öğretmen</div>
                  </div>
                  <div className="bg-blue-50/60 border border-blue-100 rounded p-1 text-center">
                    <div className="text-sm font-black text-blue-600">{activeCount}</div>
                    <div className="text-[8px] font-bold text-blue-500 uppercase tracking-wider">Dersteki Öğr.</div>
                  </div>
                  <div className="bg-emerald-50/60 border border-emerald-100 rounded p-1 text-center col-span-2">
                    <div className="flex items-center justify-center gap-1.5">
                      <div className="text-xs font-black text-emerald-600">{inSchoolCount} / {totalTeachers}</div>
                      <span className="text-[8px] bg-emerald-100 text-emerald-800 font-extrabold px-1 rounded">% {inSchoolPercent}</span>
                    </div>
                    <div className="text-[8px] font-bold text-emerald-500 uppercase tracking-wider">Okuldaki Öğretmen</div>
                  </div>
                </div>
              </div>

              <div className="space-y-1 mt-1.5">
                <div className="space-y-0.5">
                  <div className="flex justify-between text-[8px] font-bold text-slate-400 uppercase tracking-wider">
                    <span>Dağılım Grafiği (Bu Saat)</span>
                    <span>% {activePercent} Aktif</span>
                  </div>
                  
                  <div className="h-2 w-full bg-slate-100 rounded flex overflow-hidden shadow-inner">
                    {activeCount > 0 && (
                      <div
                        style={{ width: `${(activeCount / totalTeachers) * 100}%` }}
                        className="bg-blue-500 h-full transition-all duration-500"
                        title={`Dersteki Öğretmenler: ${activeCount}`}
                      />
                    )}
                    {breakCount > 0 && (
                      <div
                        style={{ width: `${(breakCount / totalTeachers) * 100}%` }}
                        className="bg-amber-500 h-full transition-all duration-500"
                        title={`Ders Arasında Olanlar: ${breakCount}`}
                      />
                    )}
                    {notStartedCount > 0 && (
                      <div
                        style={{ width: `${(notStartedCount / totalTeachers) * 100}%` }}
                        className="bg-indigo-500 h-full transition-all duration-500"
                        title={`Dersleri Başlamamış: ${notStartedCount}`}
                      />
                    )}
                    {finishedCount > 0 && (
                      <div
                        style={{ width: `${(finishedCount / totalTeachers) * 100}%` }}
                        className="bg-purple-500 h-full transition-all duration-500"
                        title={`Günü Biten Öğretmenler: ${finishedCount}`}
                      />
                    )}
                    {noLessonsCount > 0 && (
                      <div
                        style={{ width: `${(noLessonsCount / totalTeachers) * 100}%` }}
                        className="bg-slate-400 h-full transition-all duration-500"
                        title={`Bugün Dersi Olmayanlar: ${noLessonsCount}`}
                      />
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-x-1 gap-y-0.5 text-[8px] font-bold text-slate-500 justify-start">
                  <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded bg-blue-500 inline-block"></span>Derste</span>
                  <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded bg-amber-500 inline-block"></span>Arada</span>
                  <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded bg-indigo-500 inline-block"></span>Başlamadı</span>
                  <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded bg-purple-500 inline-block"></span>Bitti</span>
                  <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded bg-slate-400 inline-block"></span>Yok</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </motion.div>
  );
}
