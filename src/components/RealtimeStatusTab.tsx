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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 animate-fade-in pb-4">
          
          {/* Card 1: Şuan Derste Olanlar (Pastel Blue / Sky) */}
          <div className="bg-sky-50/90 border border-sky-200/95 rounded-xl shadow-md p-3.5 flex flex-col justify-between min-h-[380px] md:h-[450px] transition-all hover:shadow-lg hover:bg-sky-50/100">
            <div className="flex flex-col h-full overflow-hidden">
              <div className="flex items-center justify-between border-b border-sky-200/60 pb-2 mb-2 shrink-0">
                <h3 className="text-xs font-black text-sky-950 flex items-center gap-1.5 uppercase tracking-wider">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-500 inline-block animate-ping"></span>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
                  </span>
                  Dersteki Öğretmenler
                </h3>
                <span className="bg-sky-200/80 text-sky-900 border border-sky-300/50 font-extrabold text-[10px] px-2.5 py-0.5 rounded-full">
                  {currentlyTeaching.length} Öğretmen
                </span>
              </div>
 
              <div className="flex-1 overflow-hidden">
                {currentlyTeaching.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-4">
                    <span className="text-2xl mb-1.5">💤</span>
                    <p className="text-xs text-sky-850/70 font-bold">Bu periyotta aktif ders bulunmamaktadır.</p>
                  </div>
                ) : (
                  <div className="overflow-y-auto h-full pr-1">
                    <table className="w-full text-xs text-left text-sky-950 border-collapse border border-sky-200/60 bg-white/70 rounded-lg overflow-hidden">
                      <thead>
                        <tr className="bg-sky-100 text-[10px] font-black text-sky-900 uppercase tracking-wider sticky top-0 z-10 border-b border-sky-200/60">
                          <th className="py-2 px-2.5 border-r border-sky-200/60">Öğretmen</th>
                          <th className="py-2 px-2.5 text-right">Sınıf (Ders)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-sky-100">
                        {currentlyTeaching.map(({ teacher, classNames, courseNames }) => (
                          <tr key={teacher.id} className="hover:bg-sky-100/30 transition-colors">
                            <td className="py-2 px-2.5 font-bold text-sky-950 truncate max-w-[120px]">{teacher.name}</td>
                            <td className="py-2 px-2.5 text-right font-extrabold text-sky-850">
                              <span className="bg-sky-100 text-sky-900 px-1.5 py-0.5 rounded text-[10px] mr-1">{classNames}</span>
                              <span className="text-sky-700/80 text-[10px] font-bold">({courseNames})</span>
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
 
          {/* Card 2: Ders Arasında Olanlar (Pastel Amber / Peach) */}
          <div className="bg-amber-50/90 border border-amber-200/95 rounded-xl shadow-md p-3.5 flex flex-col justify-between min-h-[380px] md:h-[450px] transition-all hover:shadow-lg hover:bg-amber-50/100">
            <div className="flex flex-col h-full overflow-hidden">
              <div className="flex items-center justify-between border-b border-amber-200/60 pb-2 mb-2 shrink-0">
                <h3 className="text-xs font-black text-amber-950 flex items-center gap-1.5 uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
                  Ders Arasında Olanlar
                </h3>
                <span className="bg-amber-200/80 text-amber-900 border border-amber-300/50 font-extrabold text-[10px] px-2.5 py-0.5 rounded-full">
                  {breakTime.length} Öğretmen
                </span>
              </div>
 
              <div className="flex-1 overflow-hidden">
                {breakTime.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-4">
                    <span className="text-2xl mb-1.5">☕</span>
                    <p className="text-xs text-amber-850/70 font-bold">Ders arasında dinlenen öğretmen bulunmuyor.</p>
                  </div>
                ) : (
                  <div className="overflow-y-auto h-full pr-1">
                    <table className="w-full text-xs text-left text-amber-950 border-collapse border border-amber-200/60 bg-white/70 rounded-lg overflow-hidden">
                      <thead>
                        <tr className="bg-amber-100 text-[10px] font-black text-amber-900 uppercase tracking-wider sticky top-0 z-10 border-b border-amber-200/60">
                          <th className="py-2 px-2.5 border-r border-amber-200/60">Öğretmen</th>
                          <th className="py-2 px-2.5 text-right">Ders Dağılımı (Bugün)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-amber-100">
                        {breakTime.map(({ teacher, completedCount, remainingCount }) => (
                          <tr key={teacher.id} className="hover:bg-amber-100/30 transition-colors">
                            <td className="py-2 px-2.5 font-bold text-amber-950 truncate max-w-[120px]">{teacher.name}</td>
                            <td className="py-2 px-2.5 text-right font-extrabold text-amber-800">
                              <span className="text-xs text-amber-900">Biten: {completedCount}</span>
                              <span className="mx-1 text-amber-400">|</span>
                              <span className="text-xs text-amber-700">Kalan: {remainingCount}</span>
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
 
          {/* Card 3: Günlük Dersleri Henüz Başlamayanlar (Pastel Indigo / Lilac) */}
          <div className="bg-indigo-50/90 border border-indigo-200/95 rounded-xl shadow-md p-3.5 flex flex-col justify-between min-h-[380px] md:h-[450px] transition-all hover:shadow-lg hover:bg-indigo-50/100">
            <div className="flex flex-col h-full overflow-hidden">
              <div className="flex items-center justify-between border-b border-indigo-200/60 pb-2 mb-2 shrink-0">
                <h3 className="text-xs font-black text-indigo-950 flex items-center gap-1.5 uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block"></span>
                  Henüz Başlamamış
                </h3>
                <span className="bg-indigo-200/80 text-indigo-900 border border-indigo-300/50 font-extrabold text-[10px] px-2.5 py-0.5 rounded-full">
                  {notStarted.length} Öğretmen
                </span>
              </div>
 
              <div className="flex-1 overflow-hidden">
                {notStarted.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-4">
                    <span className="text-2xl mb-1.5">📋</span>
                    <p className="text-xs text-indigo-850/70 font-bold">Tüm öğretmenlerin dersleri başlamış durumda.</p>
                  </div>
                ) : (
                  <div className="overflow-y-auto h-full pr-1">
                    <table className="w-full text-xs text-left text-indigo-950 border-collapse border border-indigo-200/60 bg-white/70 rounded-lg overflow-hidden">
                      <thead>
                        <tr className="bg-indigo-100 text-[10px] font-black text-indigo-900 uppercase tracking-wider sticky top-0 z-10 border-b border-indigo-200/60">
                          <th className="py-2 px-2.5 border-r border-indigo-200/60">Öğretmen</th>
                          <th className="py-2 px-2.5 text-right">İlk Ders Saati</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-indigo-100">
                        {notStarted.map(({ teacher, firstPeriod }) => {
                          const time = times[firstPeriod];
                          return (
                            <tr key={teacher.id} className="hover:bg-indigo-100/30 transition-colors">
                              <td className="py-2 px-2.5 font-bold text-indigo-950 truncate max-w-[120px]">{teacher.name}</td>
                              <td className="py-2 px-2.5 text-right font-extrabold text-indigo-800">
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
 
          {/* Card 4: Günlük Tüm Dersleri Bitenler (Pastel Rose / Coral) */}
          <div className="bg-rose-50/90 border border-rose-200/95 rounded-xl shadow-md p-3.5 flex flex-col justify-between min-h-[380px] md:h-[450px] transition-all hover:shadow-lg hover:bg-rose-50/100">
            <div className="flex flex-col h-full overflow-hidden">
              <div className="flex items-center justify-between border-b border-rose-200/60 pb-2 mb-2 shrink-0">
                <h3 className="text-xs font-black text-rose-950 flex items-center gap-1.5 uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-rose-500 inline-block"></span>
                  Tüm Dersleri Bitenler
                </h3>
                <span className="bg-rose-200/80 text-rose-900 border border-rose-300/50 font-extrabold text-[10px] px-2.5 py-0.5 rounded-full">
                  {finishedForDay.length} Öğretmen
                </span>
              </div>
 
              <div className="flex-1 overflow-hidden">
                {finishedForDay.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-4">
                    <span className="text-2xl mb-1.5">🏃</span>
                    <p className="text-xs text-rose-850/70 font-bold">Henüz ders programını tamamlayan öğretmen yok.</p>
                  </div>
                ) : (
                  <div className="overflow-y-auto h-full pr-1">
                    <table className="w-full text-xs text-left text-rose-950 border-collapse border border-rose-200/60 bg-white/70 rounded-lg overflow-hidden">
                      <thead>
                        <tr className="bg-rose-100 text-[10px] font-black text-rose-900 uppercase tracking-wider sticky top-0 z-10 border-b border-rose-200/60">
                          <th className="py-2 px-2.5 border-r border-rose-200/60">Öğretmen</th>
                          <th className="py-2 px-2.5 text-right">Son Ders Saati</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-rose-100">
                        {finishedForDay.map(({ teacher, lastPeriod }) => {
                          const time = times[lastPeriod];
                          return (
                            <tr key={teacher.id} className="hover:bg-rose-100/30 transition-colors">
                              <td className="py-2 px-2.5 font-bold text-rose-950 truncate max-w-[120px]">{teacher.name}</td>
                              <td className="py-2 px-2.5 text-right font-extrabold text-rose-800">
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
 
          {/* Card 5: Bugün Hiç Dersi Olmayanlar (Pastel Emerald / Mint) */}
          <div className="bg-emerald-50/90 border border-emerald-200/95 rounded-xl shadow-md p-3.5 flex flex-col justify-between min-h-[380px] md:h-[450px] transition-all hover:shadow-lg hover:bg-emerald-50/100">
            <div className="flex flex-col h-full overflow-hidden">
              <div className="flex items-center justify-between border-b border-emerald-200/60 pb-2 mb-2 shrink-0">
                <h3 className="text-xs font-black text-emerald-950 flex items-center gap-1.5 uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                  Bugün Dersi Olmayanlar
                </h3>
                <span className="bg-emerald-200/80 text-emerald-900 border border-emerald-300/50 font-extrabold text-[10px] px-2.5 py-0.5 rounded-full">
                  {noLessonsToday.length} Öğretmen
                </span>
              </div>
 
              <div className="flex-1 overflow-hidden">
                {noLessonsToday.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-4">
                    <span className="text-2xl mb-1.5">📚</span>
                    <p className="text-xs text-emerald-850/70 font-bold">Bugün tüm öğretmenlerin en az bir dersi var.</p>
                  </div>
                ) : (
                  <div className="overflow-y-auto h-full pr-1">
                    <table className="w-full text-xs text-left text-emerald-950 border-collapse border border-emerald-200/60 bg-white/70 rounded-lg overflow-hidden">
                      <thead>
                        <tr className="bg-emerald-100 text-[10px] font-black text-emerald-900 uppercase tracking-wider sticky top-0 z-10 border-b border-emerald-200/60">
                          <th className="py-2 px-2.5 border-r border-emerald-200/60">Öğretmen</th>
                          <th className="py-2 px-2.5 text-right">Branş</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-emerald-100">
                        {noLessonsToday.map(({ teacher }) => (
                          <tr key={teacher.id} className="hover:bg-emerald-100/30 transition-colors">
                            <td className="py-2 px-2.5 font-bold text-emerald-950 truncate max-w-[120px]">{teacher.name}</td>
                            <td className="py-2 px-2.5 text-right font-semibold text-emerald-800">
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
 
          {/* Card 6: İstatistiksel Özet (Pastel Teal / Soft Cyan) */}
          <div className="bg-teal-50/90 border border-teal-200/95 rounded-xl shadow-md p-3.5 flex flex-col justify-between min-h-[380px] md:h-[450px] transition-all hover:shadow-lg hover:bg-teal-50/100">
            <div className="flex flex-col h-full justify-between overflow-hidden">
              <div className="overflow-y-auto h-full flex flex-col justify-between space-y-3 pr-0.5">
                <div>
                  <div className="flex items-center justify-between border-b border-teal-200/60 pb-2 mb-2 shrink-0">
                    <h3 className="text-xs font-black text-teal-950 flex items-center gap-1.5 uppercase tracking-wider">
                      <Activity className="w-4 h-4 text-teal-600 animate-pulse" />
                      Genel Analiz & Özet
                    </h3>
                    <span className="text-[9px] bg-teal-200/80 text-teal-900 border border-teal-300/50 font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">İstatistik</span>
                  </div>
 
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div className="bg-white/80 border border-teal-200/50 rounded-xl p-2.5 text-center shadow-sm hover:bg-white transition-colors">
                      <div className="text-xl font-black text-teal-950">{totalTeachers}</div>
                      <div className="text-[9px] font-black text-teal-700/80 uppercase tracking-wider mt-0.5">Toplam Öğretmen</div>
                    </div>
                    <div className="bg-sky-100/80 border border-sky-200/50 rounded-xl p-2.5 text-center shadow-sm hover:bg-white transition-colors">
                      <div className="text-xl font-black text-sky-950">{activeCount}</div>
                      <div className="text-[9px] font-black text-sky-700/80 uppercase tracking-wider mt-0.5">Dersteki Öğr.</div>
                    </div>
                    <div className="bg-emerald-100/80 border border-emerald-200/50 rounded-xl p-3 text-center col-span-2 shadow-sm hover:bg-white transition-colors">
                      <div className="flex items-center justify-center gap-2">
                        <div className="text-lg font-black text-emerald-950">{inSchoolCount} / {totalTeachers}</div>
                        <span className="text-[10px] bg-emerald-200/80 text-emerald-950 font-black px-2 py-0.5 rounded-full border border-emerald-300/40">% {inSchoolPercent}</span>
                      </div>
                      <div className="text-[9px] font-black text-emerald-700/80 uppercase tracking-wider mt-1">Okuldaki Aktif Öğretmen Gücü</div>
                    </div>
                  </div>
                </div>
 
                <div className="space-y-2 pb-1.5 shrink-0">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px] font-black text-teal-900 uppercase tracking-wider">
                      <span>Dağılım Grafiği (Bu Saat)</span>
                      <span className="text-teal-950">% {activePercent} Aktif Derste</span>
                    </div>
                    
                    <div className="h-3 w-full bg-teal-100/60 border border-teal-200/30 rounded-full flex overflow-hidden shadow-inner">
                      {activeCount > 0 && (
                        <div
                          style={{ width: `${(activeCount / totalTeachers) * 100}%` }}
                          className="bg-sky-400 h-full transition-all duration-500"
                          title={`Dersteki Öğretmenler: ${activeCount}`}
                        />
                      )}
                      {breakCount > 0 && (
                        <div
                          style={{ width: `${(breakCount / totalTeachers) * 100}%` }}
                          className="bg-amber-400 h-full transition-all duration-500"
                          title={`Ders Arasında Olanlar: ${breakCount}`}
                        />
                      )}
                      {notStartedCount > 0 && (
                        <div
                          style={{ width: `${(notStartedCount / totalTeachers) * 100}%` }}
                          className="bg-indigo-400 h-full transition-all duration-500"
                          title={`Dersleri Başlamamış: ${notStartedCount}`}
                        />
                      )}
                      {finishedCount > 0 && (
                        <div
                          style={{ width: `${(finishedCount / totalTeachers) * 100}%` }}
                          className="bg-rose-400 h-full transition-all duration-500"
                          title={`Günü Biten Öğretmenler: ${finishedCount}`}
                        />
                      )}
                      {noLessonsCount > 0 && (
                        <div
                          style={{ width: `${(noLessonsCount / totalTeachers) * 100}%` }}
                          className="bg-emerald-400 h-full transition-all duration-500"
                          title={`Bugün Dersi Olmayanlar: ${noLessonsCount}`}
                        />
                      )}
                    </div>
                  </div>
 
                  <div className="flex flex-wrap gap-x-2 gap-y-1 text-[9px] font-black text-teal-950 justify-start">
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block border border-sky-300"></span>Derste</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block border border-amber-300"></span>Arada</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-indigo-400 inline-block border border-indigo-300"></span>Başlamadı</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-rose-400 inline-block border border-rose-300"></span>Bitti</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block border border-emerald-300"></span>Yok</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
 
        </div>
      </div>
    </motion.div>
  );
}
