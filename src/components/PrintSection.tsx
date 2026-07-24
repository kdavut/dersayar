import React from "react";
import { AppState, Teacher, GradeClass, Classroom, Course } from "../types";

// Yazdırma şablonunun parametrelerini ve tiplerini tanımlayan arayüz
interface PrintSectionProps {
  activePrintJob: { type: string; ids: string[] } | null;
  state: AppState;
  getTeacherWeeklySchedule: (tId: string) => any[][];
  getClassWeeklySchedule: (classId: string) => any[];
  getClassroomWeeklySchedule: (classroomId: string) => any[][];
  printDocNo: string;
  printDocSubject: string;
  getFormattedDate: () => string;
}

export function PrintSection({
  activePrintJob,
  state,
  getTeacherWeeklySchedule,
  getClassWeeklySchedule,
  getClassroomWeeklySchedule,
  printDocNo,
  printDocSubject,
  getFormattedDate,
}: PrintSectionProps) {
  if (!activePrintJob) return null;

  // Çarşaf liste görünümü için arka plan renk döngüsü
  const zebraColors = ["#FFF5EE", "#F0F8FF", "#F0FFF0", "#FFFFE0", "#E6E6FA"];
  const numDays = state.settings.days.length;
  const numPeriods = state.settings.periodsPerDay;

  // Veri aramalarını hızlandırmak ve performansı artırmak için harita yapıları oluşturuluyor
  const teachersMap = new Map<string, Teacher>(state.teachers.map((t) => [t.id, t]));
  const classesMap = new Map<string, GradeClass>(state.classes.map((c) => [c.id, c]));
  const classroomsMap = new Map<string, Classroom>(state.classrooms.map((cr) => [cr.id, cr]));
  const coursesMap = new Map<string, Course>(state.courses.map((co) => [co.id, co]));

  // Çıktıda öğretmen isimlerinin baş harflerini kısaltarak yer tasarrufu sağlayan yardımcı fonksiyon
  const getAbbreviatedTeacherName = (name: string) => {
    if (!name) return "";
    const parts = name.trim().split(/\s+/);
    if (parts.length <= 1) return name;
    const lastName = parts[parts.length - 1];
    const initials = parts.slice(0, -1).map(p => p[0].toLocaleUpperCase("tr-TR") + ".").join(" ");
    return `${initials} ${lastName}`;
  };

  const { type, ids } = activePrintJob;

  // Öğretmen ders programı kartlarını dikey formatta yazdıran bölüm
  if (type.startsWith("teacher") && !type.includes("carsaf")) {
    return (
      <>
        {ids.map((tId) => {
          const teacher = state.teachers.find(t => t.id === tId);
          if (!teacher) return null;

          const grid = getTeacherWeeklySchedule(tId);

          return (
            <div key={tId} className="print-page flex flex-col justify-between">
              <div>
                {/* Resmi okul başlığı ve eğitim öğretim yılı bilgileri */}
                <div className="official-header uppercase text-center mb-4">
                  <div className="text-xs font-bold">T.C.</div>
                  <div className="text-sm font-extrabold mt-0.5">{state.settings.schoolName || "OKUL ADI BELİRTİLMEDİ"}</div>
                  <div className="text-xs font-bold mt-1 tracking-wide">
                    {state.settings.academicYear ? `${state.settings.academicYear} EĞİTİM ÖĞRETİM YILI ` : ""}HAFTALIK DERS PROGRAMI
                  </div>
                </div>

                {/* Resmi evrak üst bilgileri, sayı ve konu detayları */}
                <div className="official-meta flex justify-between border-b border-slate-300 pb-2 mb-2 font-mono text-xs">
                  <div className="space-y-1">
                    <div><strong>Sayı:</strong> {printDocNo || "Belirtilmedi"}</div>
                    <div><strong>Konu:</strong> {printDocSubject || "Belirtilmedi"}</div>
                  </div>
                  <div className="text-right">
                    <div><strong>Tarih:</strong> {state.settings.effectiveDate ? new Date(state.settings.effectiveDate).toLocaleDateString('tr-TR') : getFormattedDate()}</div>
                    <div><strong>Tebliğ Edilen:</strong> {teacher.name}</div>
                  </div>
                </div>

                {/* Tebligat metni ve öğretmene yapılacak bilgilendirme mesajı */}
                <div className="official-text mt-2.5 text-justify">
                  Sayın <strong>{teacher.name}</strong> ({teacher.branch || "Öğretmen"}),
                  <br /><br />
                  {state.settings.effectiveDate ? <strong>{new Date(state.settings.effectiveDate).toLocaleDateString('tr-TR')}</strong> : "Belirtilen"} tarihinden itibaren geçerli olmak üzere ders yükünüz ve haftalık ders programınız aşağıda belirtilmiştir. Bilgilerinizi, tebliğ edilen program doğrultusunda ders görevlerinizi yerine getirmenizi ve gereğini tebliğen rica ederim.
                </div>

                {/* Öğretmenin haftalık ders programını gösteren ana tablo */}
                <table className="print-table">
                  <thead>
                    <tr>
                      <th style={{ width: "14%" }}>Ders Saati</th>
                      {state.settings.days.map((day, dIdx) => (
                        <th key={dIdx} style={{ width: `${86 / numDays}%` }}>{day}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: numPeriods }).map((_, pIdx) => {
                      const periodTime = state.settings.periodTimes?.[pIdx];
                      const timeStr = periodTime ? `${periodTime.start} - ${periodTime.end}` : "";
                      return (
                        <React.Fragment key={pIdx}>
                          <tr>
                            <td className="font-bold">
                              <div className="font-black">{pIdx + 1}. Ders</div>
                              <div className="text-[8px] font-medium text-slate-500">{timeStr}</div>
                            </td>
                            {state.settings.days.map((_, dIdx) => {
                              const teacherSlots = grid[dIdx][pIdx]; // Array of { slot, classId }
                              const isLocked = teacher.unavailability?.[dIdx]?.[pIdx];
                              const closureName = teacher.closureNames?.[dIdx]?.[pIdx] || "";
                              const isSpecialClosure = !!(closureName && closureName.trim() !== "" && closureName.trim().toLocaleUpperCase("tr-TR") !== "KAPALI");

                              if (isLocked) {
                                if (isSpecialClosure) {
                                  return (
                                    <td key={dIdx} className="bg-amber-50/60 p-1 text-center font-extrabold text-[8.5px] text-amber-800 uppercase border border-slate-300">
                                      {closureName}
                                    </td>
                                  );
                                }
                                return (
                                  <td key={dIdx}></td>
                                );
                              }

                              if (!teacherSlots || teacherSlots.length === 0) {
                                return <td key={dIdx}></td>;
                              }

                              return (
                                <td key={dIdx} className="p-1">
                                  {teacherSlots.map((ts: any, index: number) => {
                                    const course = coursesMap.get(ts.slot.courseId);
                                    const classObj = classesMap.get(ts.classId);
                                    const roomObj = ts.slot.classroomId ? classroomsMap.get(ts.slot.classroomId) : null;
                                    return (
                                      <div key={index} className="leading-tight py-0.5">
                                        <div className="font-extrabold text-slate-900 text-[9px] uppercase leading-tight">{classObj?.name || "Sınıf"}</div>
                                        <div className="font-bold text-blue-700 text-[8px] mt-0.5 leading-tight truncate" title={course?.name || course?.code || "Ders"}>{course?.code || course?.name || "Ders"}</div>
                                        {roomObj && (
                                          <div className="text-[7.5px] font-medium text-purple-600 mt-0.5 leading-tight">🛠️ {roomObj.shortName || roomObj.name}</div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </td>
                              );
                            })}
                          </tr>
                          {/* Gün ortasındaki öğle arası satırının oluşturulması */}
                          {state.settings.lunchBreakAfter && state.settings.lunchBreakAfter > 0 && state.settings.lunchBreakAfter === pIdx + 1 && (
                            <tr key={`lunch-${pIdx}`} style={{ height: "14px", backgroundColor: "#f8fafc" }}>
                              <td style={{ padding: "2px", fontSize: "7px", fontWeight: "bold", backgroundColor: "#cbd5e1" }}>
                                Öğle Arası
                              </td>
                              <td colSpan={numDays} style={{ padding: "2px", fontSize: "7.5px", fontWeight: "extrabold", backgroundColor: "#f8fafc", color: "#475569" }}>
                                ÖĞLE ARASI
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>

                {/* Öğretmenin girdiği sınıfları ve haftalık toplam ders yükü istatistikleri */}
                {(() => {
                  const teacherAssignments = state.assignments.filter(a => {
                    if (!a.teacherId) return false;
                    return a.teacherId.split(",").map(id => id.trim()).includes(tId);
                  });

                  if (teacherAssignments.length === 0) return null;

                  return (
                    <div className="mt-2.5 border-t border-slate-300 pt-1.5">
                      <h4 className="text-[9px] font-black uppercase text-slate-800 tracking-wider mb-1 text-center">
                        GİRDİĞİ SINIFLAR VE HAFTALIK DERS SAATLERİ (HDS) İSTATİSTİKLERİ
                      </h4>
                      <table className="print-table" style={{ marginTop: "1px", width: "100%" }}>
                        <thead>
                          <tr>
                            <th style={{ width: "8%", fontSize: "8px", padding: "1.5px 1px" }}>S.No</th>
                            <th style={{ width: "25%", fontSize: "8px", padding: "1.5px 1px", textAlign: "left" }}>Sınıf</th>
                            <th style={{ width: "15%", fontSize: "8px", padding: "1.5px 1px" }}>Ders Kodu</th>
                            <th style={{ width: "42%", fontSize: "8px", padding: "1.5px 1px", textAlign: "left" }}>Ders Adı</th>
                            <th style={{ width: "10%", fontSize: "8px", padding: "1.5px 1px" }}>HDS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {teacherAssignments.map((a, index) => {
                            const course = coursesMap.get(a.courseId);
                            const classObj = classesMap.get(a.classId);
                            return (
                              <tr key={a.id}>
                                <td style={{ fontSize: "7.5px", padding: "1px 1.5px" }}>{index + 1}</td>
                                <td style={{ fontSize: "7.5px", padding: "1px 1.5px", textAlign: "left" }} className="font-extrabold">{classObj?.name || "-"}</td>
                                <td style={{ fontSize: "7.5px", padding: "1px 1.5px" }} className="font-bold">{course?.code || "-"}</td>
                                <td style={{ fontSize: "7.5px", padding: "1px 1.5px", textAlign: "left" }}>{course?.name || "-"}</td>
                                <td style={{ fontSize: "7.5px", padding: "1px 1.5px" }} className="font-bold">{a.weeklyHours}</td>
                              </tr>
                            );
                          })}
                          {/* Toplam haftalık ders saatinin hesaplandığı satır */}
                          <tr className="font-extrabold bg-slate-50">
                            <td colSpan={4} style={{ textAlign: "right", fontSize: "7.5px", padding: "1.5px" }} className="pr-4 font-black">TOPLAM HAFTALIK DERS SAATİ:</td>
                            <td style={{ fontSize: "7.5px", padding: "1.5px" }} className="font-black">
                              {teacherAssignments.reduce((acc, a) => acc + a.weeklyHours, 0)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>

              {/* İmza sirküsü, okul müdürü ve öğretmen imza alanları */}
              <div className="mt-2.5 pt-1.5 border-t border-slate-300 w-full">
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div className="flex flex-col items-center">
                    <span className="text-[9px] font-extrabold text-slate-800 tracking-wider">TEBELLÜĞ EDEN</span>
                    <span className="text-[9px] font-bold text-slate-700 mt-0.5">{teacher.name}</span>
                    <span className="text-[8.5px] text-slate-500 font-semibold">{teacher.branch || "Öğretmen"}</span>
                    <span className="text-[7.5px] font-mono text-slate-400 mt-2 border-b border-dashed border-slate-300 w-28 pb-0.5">Tarih / İmza</span>
                  </div>

                  <div className="flex flex-col items-center">
                    <span className="text-[9px] font-extrabold text-slate-800 tracking-wider">TEBLİĞ EDEN</span>
                    <span className="text-[9px] font-bold text-slate-700 mt-0.5">{state.settings.principalName || "Okul Müdürü"}</span>
                    <span className="text-[8.5px] text-slate-500 font-semibold">Okul Müdürü</span>
                    <span className="text-[7.5px] font-mono text-slate-400 mt-2 border-b border-dashed border-slate-300 w-28 pb-0.5">İmza</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </>
    );
  }

  // Sınıf ders programı dikey format çıktı görünümü
  if (type.startsWith("class") && !type.startsWith("classroom") && !type.includes("carsaf")) {
    return (
      <>
        {ids.map((cId) => {
          const classObj = state.classes.find(c => c.id === cId);
          if (!classObj) return null;

          const grid = getClassWeeklySchedule(cId);
          const classAssignments = state.assignments.filter(a => a.classId === cId);

          return (
            <div key={cId} className="print-page flex flex-col justify-between">
              <div>
                <div className="official-header uppercase text-center mb-4">
                  <div className="text-xs font-bold">T.C.</div>
                  <div className="text-sm font-extrabold mt-0.5">{state.settings.schoolName || "OKUL ADI BELİRTİLMEDİ"}</div>
                  <div className="text-xs font-bold mt-1 tracking-wide">
                    {state.settings.academicYear ? `${state.settings.academicYear} EĞİTİM ÖĞRETİM YILI ` : ""}HAFTALIK DERS PROGRAMI
                  </div>
                </div>

                <div className="official-meta flex justify-between border-b border-slate-300 pb-2 mb-2 font-mono text-xs">
                  <div>
                    <div><strong>Sınıf:</strong> {classObj.name}</div>
                  </div>
                  <div className="text-right">
                    <div><strong>Tarih:</strong> {state.settings.effectiveDate ? new Date(state.settings.effectiveDate).toLocaleDateString('tr-TR') : getFormattedDate()}</div>
                  </div>
                </div>

                {/* Sınıf haftalık ders saatleri ve çizelgesi */}
                <table className="print-table">
                  <thead>
                    <tr>
                      <th style={{ width: "14%" }}>Ders Saati</th>
                      {state.settings.days.map((day, dIdx) => (
                        <th key={dIdx} style={{ width: `${86 / numDays}%` }}>{day}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: numPeriods }).map((_, pIdx) => {
                      const periodTime = state.settings.periodTimes?.[pIdx];
                      const timeStr = periodTime ? `${periodTime.start} - ${periodTime.end}` : "";
                      return (
                        <React.Fragment key={pIdx}>
                          <tr>
                            <td className="font-bold">
                              <div className="font-black">{pIdx + 1}. Ders</div>
                              <div className="text-[8px] font-medium text-slate-500">{timeStr}</div>
                            </td>
                            {state.settings.days.map((_, dIdx) => {
                              const slot = grid[dIdx][pIdx];
                              const isLocked = classObj.unavailability?.[dIdx]?.[pIdx];
                              const closureName = classObj.closureNames?.[dIdx]?.[pIdx] || "";
                              const isSpecialClosure = !!(closureName && closureName.trim() !== "" && closureName.trim().toLocaleUpperCase("tr-TR") !== "KAPALI");

                              if (isLocked) {
                                if (isSpecialClosure) {
                                  return (
                                    <td key={dIdx} className="bg-amber-50/60 p-1 text-center font-extrabold text-[8.5px] text-amber-800 uppercase border border-slate-300">
                                      {closureName}
                                    </td>
                                  );
                                }
                                return (
                                  <td key={dIdx}></td>
                                );
                              }

                              if (!slot) {
                                return <td key={dIdx}>-</td>;
                              }

                              const course = coursesMap.get(slot.courseId);
                              const assignedTeachers = slot.teacherId ? slot.teacherId.split(",").map(id => teachersMap.get(id)).filter(Boolean) : [];
                              const roomObj = slot.classroomId ? classroomsMap.get(slot.classroomId) : null;

                              return (
                                <td key={dIdx} className="p-1">
                                  <div className="font-extrabold text-slate-900 text-[9px] uppercase leading-tight truncate" title={course?.name || course?.code || "Ders"}>{course?.code || course?.name || "Ders"}</div>
                                  <div className="text-[8px] font-semibold text-slate-600 mt-0.5 leading-tight">
                                    {assignedTeachers.map(t => getAbbreviatedTeacherName(t?.name || "")).join(", ")}
                                  </div>
                                  {roomObj && (
                                    <div className="text-[7.5px] font-medium text-purple-600 mt-0.5 leading-tight">🛠 {roomObj.shortName || roomObj.name}</div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                          {state.settings.lunchBreakAfter && state.settings.lunchBreakAfter > 0 && state.settings.lunchBreakAfter === pIdx + 1 && (
                            <tr key={`lunch-${pIdx}`} style={{ height: "14px", backgroundColor: "#f8fafc" }}>
                              <td style={{ padding: "2px", fontSize: "7px", fontWeight: "bold", backgroundColor: "#cbd5e1" }}>
                                Öğle Arası
                              </td>
                              <td colSpan={numDays} style={{ padding: "2px", fontSize: "7.5px", fontWeight: "extrabold", backgroundColor: "#f8fafc", color: "#475569" }}>
                                ÖĞLE ARASI
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>

                {/* Sınıfta ders okutan öğretmenlerin listesi ve ders yükü dağılımları */}
                <div className="mt-2.5 border-t border-slate-300 pt-1.5">
                  <h4 className="text-[9px] font-black uppercase text-slate-800 tracking-wider mb-1 text-center">
                    DERSİ OKUTAN ÖĞRETMENLER VE HAFTALIK SAATLERİ (HDS)
                  </h4>
                  <table className="print-table" style={{ marginTop: "1px", width: "100%" }}>
                    <thead>
                      <tr>
                        <th style={{ width: "8%", fontSize: "8px", padding: "1.5px 1px" }}>S.No</th>
                        <th style={{ width: "15%", fontSize: "8px", padding: "1.5px 1px" }}>Ders Kodu</th>
                        <th style={{ width: "42%", fontSize: "8px", padding: "1.5px 1px", textAlign: "left" }}>Ders Adı</th>
                        <th style={{ width: "25%", fontSize: "8px", padding: "1.5px 1px", textAlign: "left" }}>Öğretmen</th>
                        <th style={{ width: "10%", fontSize: "8px", padding: "1.5px 1px" }}>HDS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {classAssignments.map((a, index) => {
                        const course = coursesMap.get(a.courseId);
                        const assignedTeachers = a.teacherId ? a.teacherId.split(",").map(id => teachersMap.get(id)).filter(Boolean) : [];
                        const teacherNames = assignedTeachers.map(t => t ? t.name : "").join(", ");
                        return (
                          <tr key={a.id}>
                            <td style={{ fontSize: "7.5px", padding: "1px 1.5px" }}>{index + 1}</td>
                            <td style={{ fontSize: "7.5px", padding: "1px 1.5px" }} className="font-extrabold">{course?.code || "-"}</td>
                            <td style={{ fontSize: "7.5px", padding: "1px 1.5px", textAlign: "left" }}>{course?.name || "-"}</td>
                            <td style={{ fontSize: "7.5px", padding: "1px 1.5px", textAlign: "left" }}>{teacherNames || "Atanmamış"}</td>
                            <td style={{ fontSize: "7.5px", padding: "1px 1.5px" }} className="font-bold">{a.weeklyHours}</td>
                          </tr>
                        );
                      })}
                      <tr className="font-extrabold bg-slate-50">
                        <td colSpan={4} style={{ textAlign: "right", fontSize: "7.5px", padding: "1.5px" }} className="pr-4 font-black">TOPLAM HAFTALIK DERS SAATİ:</td>
                        <td style={{ fontSize: "7.5px", padding: "1.5px" }} className="font-black">
                          {classAssignments.reduce((acc, a) => acc + a.weeklyHours, 0)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="official-signature flex flex-col items-center mt-2.5 pt-1.5 border-t border-slate-300 w-full">
                <div className="text-[9px] font-extrabold text-slate-800 tracking-wider">TEBLİĞ EDEN</div>
                <div className="text-[9px] font-bold text-slate-700 mt-1">{state.settings.principalName || "Okul Müdürü"}</div>
                <div className="text-[8.5px] text-slate-500 font-semibold">Okul Müdürü</div>
                <div className="text-[7.5px] font-mono text-slate-400 mt-2 border-b border-dashed border-slate-300 w-28 pb-0.5">İmza</div>
              </div>
            </div>
          );
        })}
      </>
    );
  }

  // Atölye veya Derslik ders programı dikey format görünümü
  if (type.startsWith("classroom") && !type.includes("carsaf")) {
    return (
      <>
        {ids.map((crId) => {
          const classroom = state.classrooms.find(cr => cr.id === crId);
          if (!classroom) return null;

          const grid = getClassroomWeeklySchedule(crId);

          return (
            <div key={crId} className="print-page flex flex-col justify-between">
              <div>
                <div className="official-header uppercase text-center mb-4">
                  <div className="text-xs font-bold">T.C.</div>
                  <div className="text-sm font-extrabold mt-0.5">{state.settings.schoolName || "OKUL ADI BELİRTİLMEDİ"}</div>
                  <div className="text-xs font-bold mt-1 tracking-wide">
                    {state.settings.academicYear ? `${state.settings.academicYear} EĞİTİM ÖĞRETİM YILI ` : ""}HAFTALIK DERS PROGRAMI
                  </div>
                </div>

                <div className="official-meta flex justify-between border-b border-slate-300 pb-2 mb-2 font-mono text-xs">
                  <div>
                    <div><strong>Atölye/Salon:</strong> {classroom.name} ({classroom.shortName || "Atölye"})</div>
                  </div>
                  <div className="text-right">
                    <div><strong>Tarih:</strong> {state.settings.effectiveDate ? new Date(state.settings.effectiveDate).toLocaleDateString('tr-TR') : getFormattedDate()}</div>
                  </div>
                </div>

                <table className="print-table">
                  <thead>
                    <tr>
                      <th style={{ width: "14%" }}>Ders Saati</th>
                      {state.settings.days.map((day, dIdx) => (
                        <th key={dIdx} style={{ width: `${86 / numDays}%` }}>{day}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: numPeriods }).map((_, pIdx) => {
                      const periodTime = state.settings.periodTimes?.[pIdx];
                      const timeStr = periodTime ? `${periodTime.start} - ${periodTime.end}` : "";
                      return (
                        <React.Fragment key={pIdx}>
                          <tr>
                            <td className="font-bold">
                              <div className="font-black">{pIdx + 1}. Ders</div>
                              <div className="text-[8px] font-medium text-slate-500">{timeStr}</div>
                            </td>
                            {state.settings.days.map((_, dIdx) => {
                              const slots = grid[dIdx][pIdx]; // Array of { slot, classId }
                              const isLocked = classroom.unavailability?.[dIdx]?.[pIdx];
                              const closureName = classroom.closureNames?.[dIdx]?.[pIdx] || "";
                              const isSpecialClosure = !!(closureName && closureName.trim() !== "" && closureName.trim().toLocaleUpperCase("tr-TR") !== "KAPALI");

                              if (isLocked) {
                                if (isSpecialClosure) {
                                  return (
                                    <td key={dIdx} className="bg-amber-50/60 p-1 text-center font-extrabold text-[8.5px] text-amber-800 uppercase border border-slate-300">
                                      {closureName}
                                    </td>
                                  );
                                }
                                return (
                                  <td key={dIdx}></td>
                                );
                              }

                              if (!slots || slots.length === 0) {
                                return <td key={dIdx}>-</td>;
                              }

                              return (
                                <td key={dIdx} className="p-1">
                                  {slots.map((sObj: any, sIdx: number) => {
                                    const course = coursesMap.get(sObj.slot.courseId);
                                    const classObj = classesMap.get(sObj.classId);
                                    const assignedTeachers = sObj.slot.teacherId ? sObj.slot.teacherId.split(",").map((id: string) => teachersMap.get(id)).filter(Boolean) : [];
                                    return (
                                      <div key={sIdx} className="leading-tight py-0.5">
                                        <div className="font-extrabold text-slate-900 text-[9px] uppercase leading-tight">{classObj?.name || "Sınıf"}</div>
                                        <div className="font-bold text-blue-700 text-[8px] leading-tight mt-0.5 truncate" title={course?.name || course?.code || "Ders"}>{course?.code || course?.name || "Ders"}</div>
                                        <div className="text-[7.5px] text-slate-600 mt-0.5 leading-tight">
                                          {assignedTeachers.map((t: any) => getAbbreviatedTeacherName(t?.name || "")).join(", ")}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </td>
                              );
                            })}
                          </tr>
                          {state.settings.lunchBreakAfter && state.settings.lunchBreakAfter > 0 && state.settings.lunchBreakAfter === pIdx + 1 && (
                            <tr key={`lunch-${pIdx}`} style={{ height: "14px", backgroundColor: "#f8fafc" }}>
                              <td style={{ padding: "2px", fontSize: "7px", fontWeight: "bold", backgroundColor: "#cbd5e1" }}>
                                Öğle Arası
                              </td>
                              <td colSpan={numDays} style={{ padding: "2px", fontSize: "7.5px", fontWeight: "extrabold", backgroundColor: "#f8fafc", color: "#475569" }}>
                                ÖĞLE ARASI
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="official-signature flex flex-col items-center mt-2.5 pt-1.5 border-t border-slate-300 w-full">
                <div className="text-[9px] font-extrabold text-slate-800 tracking-wider">TEBLİĞ EDEN</div>
                <div className="text-[9px] font-bold text-slate-700 mt-1">{state.settings.principalName || "Okul Müdürü"}</div>
                <div className="text-[8.5px] text-slate-500 font-semibold">Okul Müdürü</div>
                <div className="text-[7.5px] font-mono text-slate-400 mt-2 border-b border-dashed border-slate-300 w-28 pb-0.5">İmza</div>
              </div>
            </div>
          );
        })}
      </>
    );
  }

  // Öğretmenlerin toplu ders programı çarşaf liste (yatay) görünümü
  if (type === "teacher_carsaf") {
    return (
      <div className="print-carsaf-page w-full">
        <div className="official-header uppercase text-center mb-4">
          <div className="text-xs font-bold">T.C.</div>
          <div className="text-sm font-extrabold mt-0.5">{state.settings.schoolName || "OKUL ADI BELİRTİLMEDİ"}</div>
          <div className="text-xs font-bold mt-1 tracking-wide">
            {state.settings.academicYear ? `${state.settings.academicYear} EĞİTİM ÖĞRETİM YILI ` : ""}HAFTALIK DERS PROGRAMI
          </div>
        </div>
        <div className="text-right text-[9px] font-mono mb-2">
          <strong>Tarih:</strong> {state.settings.effectiveDate ? new Date(state.settings.effectiveDate).toLocaleDateString('tr-TR') : getFormattedDate()}
        </div>
        <table className="print-carsaf-table">
          <thead>
            <tr>
              <th rowSpan={2} className="border-thick-right" style={{ width: "12%" }}>Öğretmen / Branş</th>
              {state.settings.days.map((day, dIdx) => (
                <th key={dIdx} colSpan={numPeriods} className="bg-slate-100 font-bold text-[9px] uppercase border border-black border-thick-right">{day}</th>
              ))}
            </tr>
            <tr>
              {state.settings.days.map(() => 
                Array.from({ length: numPeriods }).map((_, pIdx) => (
                  <th key={pIdx} className={`font-extrabold text-[8px] bg-slate-50 border border-black ${pIdx === numPeriods - 1 ? "border-thick-right" : ""}`}>{pIdx + 1}</th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {state.teachers.map((teacher, tIdx) => {
              const grid = getTeacherWeeklySchedule(teacher.id);
              const rowBgColor = zebraColors[tIdx % zebraColors.length];
              return (
                <tr key={teacher.id}>
                  <td className="font-extrabold text-left px-1.5 text-[9px] border border-black border-thick-right carsaf-row-header" style={{ backgroundColor: rowBgColor }}>
                    <div className="font-black text-slate-900 leading-tight uppercase">{teacher.name}</div>
                    <div className="text-[7.5px] font-medium text-slate-500 mt-0.5">{teacher.branch || "-"}</div>
                  </td>
                  {state.settings.days.map((_, dIdx) => 
                    Array.from({ length: numPeriods }).map((_, pIdx) => {
                      const slots = grid[dIdx][pIdx];
                      const isLocked = teacher.unavailability?.[dIdx]?.[pIdx];
                      const closureName = teacher.closureNames?.[dIdx]?.[pIdx] || "";
                      const isSpecialClosure = !!(closureName && closureName.trim() !== "" && closureName.trim().toLocaleUpperCase("tr-TR") !== "KAPALI");

                      const isThick = pIdx === numPeriods - 1;

                      if (isLocked) {
                        if (isSpecialClosure) {
                          return (
                            <td key={pIdx} className={`border border-black text-center font-extrabold text-[7.5px] bg-amber-50 text-amber-900 uppercase ${isThick ? "border-thick-right" : ""}`}>
                              {closureName}
                            </td>
                          );
                        }
                        return (
                          <td key={pIdx} className={`border border-black text-center ${isThick ? "border-thick-right" : ""}`} style={{ backgroundColor: "#e2e8f0" }}></td>
                        );
                      }

                      if (!slots || slots.length === 0) {
                        return <td key={pIdx} className={`border border-black text-center ${isThick ? "border-thick-right" : ""}`} style={{ backgroundColor: rowBgColor }}>-</td>;
                      }

                      return (
                        <td key={pIdx} className={`border border-black text-center leading-tight px-0.5 ${isThick ? "border-thick-right" : ""}`} style={{ backgroundColor: rowBgColor }}>
                          {slots.map((ts: any, index: number) => {
                            const classObj = classesMap.get(ts.classId);
                            const course = coursesMap.get(ts.slot.courseId);
                            return (
                              <div key={index}>
                                <span className="font-black text-slate-900 text-[8px]">{classObj?.name || "Sınıf"}</span>
                                <span className="text-slate-500 text-[7px] font-semibold block">({course?.code || course?.name || "Drs"})</span>
                              </div>
                            );
                          })}
                        </td>
                      );
                    })
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // Sınıfların toplu ders programı çarşaf liste (yatay) görünümü
  if (type === "class_carsaf") {
    return (
      <div className="print-carsaf-page w-full">
        <div className="official-header uppercase text-center mb-4">
          <div className="text-xs font-bold">T.C.</div>
          <div className="text-sm font-extrabold mt-0.5">{state.settings.schoolName || "OKUL ADI BELİRTİLMEDİ"}</div>
          <div className="text-xs font-bold mt-1 tracking-wide">
            {state.settings.academicYear ? `${state.settings.academicYear} EĞİTİM ÖĞRETİM YILI ` : ""}HAFTALIK DERS PROGRAMI
          </div>
        </div>
        <div className="text-right text-[9px] font-mono mb-2">
          <strong>Tarih:</strong> {state.settings.effectiveDate ? new Date(state.settings.effectiveDate).toLocaleDateString('tr-TR') : getFormattedDate()}
        </div>
        <table className="print-carsaf-table">
          <thead>
            <tr>
              <th rowSpan={2} className="border-thick-right" style={{ width: "10%" }}>Sınıf</th>
              {state.settings.days.map((day, dIdx) => (
                <th key={dIdx} colSpan={numPeriods} className="bg-slate-100 font-bold text-[9px] uppercase border border-black border-thick-right" style={{ borderRight: "3px solid #000" }}>{day}</th>
              ))}
            </tr>
            <tr>
              {state.settings.days.map(() => 
                Array.from({ length: numPeriods }).map((_, pIdx) => (
                  <th key={pIdx} className={`font-extrabold text-[8px] bg-slate-50 border border-black ${pIdx === numPeriods - 1 ? "border-thick-right" : ""}`}>{pIdx + 1}</th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {state.classes.map((classObj, cIdx) => {
              const grid = getClassWeeklySchedule(classObj.id);
              const rowBgColor = zebraColors[cIdx % zebraColors.length];
              return (
                <tr key={classObj.id}>
                  <td className="font-black px-1.5 text-[9.5px] border border-black text-center text-slate-900 uppercase border-thick-right carsaf-row-header" style={{ backgroundColor: rowBgColor }}>
                    {classObj.name}
                  </td>
                  {state.settings.days.map((_, dIdx) => 
                    Array.from({ length: numPeriods }).map((_, pIdx) => {
                      const slot = grid[dIdx][pIdx];
                      const isLocked = classObj.unavailability?.[dIdx]?.[pIdx];
                      const closureName = classObj.closureNames?.[dIdx]?.[pIdx] || "";
                      const isSpecialClosure = !!(closureName && closureName.trim() !== "" && closureName.trim().toLocaleUpperCase("tr-TR") !== "KAPALI");

                      const isThick = pIdx === numPeriods - 1;

                      if (isLocked) {
                        if (isSpecialClosure) {
                          return (
                            <td key={pIdx} className={`border border-black text-center font-extrabold text-[7.5px] bg-amber-50 text-amber-900 uppercase ${isThick ? "border-thick-right" : ""}`}>
                              {closureName}
                            </td>
                          );
                        }
                        return (
                          <td key={pIdx} className={`border border-black text-center ${isThick ? "border-thick-right" : ""}`} style={{ backgroundColor: "#e2e8f0" }}></td>
                        );
                      }

                      if (!slot) {
                        return <td key={pIdx} className={`border border-black text-center ${isThick ? "border-thick-right" : ""}`} style={{ backgroundColor: rowBgColor }}>-</td>;
                      }

                      const course = coursesMap.get(slot.courseId);
                      const assignedTeachers = slot.teacherId ? slot.teacherId.split(",").map(id => teachersMap.get(id)).filter(Boolean) : [];
                      const teacherInitials = assignedTeachers.map(t => getAbbreviatedTeacherName(t?.name || "")).join(", ");

                      return (
                        <td key={pIdx} className={`border border-black text-center leading-tight px-0.5 ${isThick ? "border-thick-right" : ""}`} style={{ backgroundColor: rowBgColor }}>
                          <div className="font-black text-slate-900 text-[8px]">{course?.code || course?.name}</div>
                          <div className="text-slate-500 text-[7px] truncate font-medium block">{teacherInitials || "Atanmamış"}</div>
                        </td>
                      );
                    })
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // Atölye veya dersliklerin toplu ders programı çarşaf liste (yatay) görünümü
  if (type === "classroom_carsaf") {
    return (
      <div className="print-carsaf-page w-full">
        <div className="official-header uppercase text-center mb-4">
          <div className="text-xs font-bold">T.C.</div>
          <div className="text-sm font-extrabold mt-0.5">{state.settings.schoolName || "OKUL ADI BELİRTİLMEDİ"}</div>
          <div className="text-xs font-bold mt-1 tracking-wide">
            {state.settings.academicYear ? `${state.settings.academicYear} EĞİTİM ÖĞRETİM YILI ` : ""}HAFTALIK DERS PROGRAMI
          </div>
        </div>
        <div className="text-right text-[9px] font-mono mb-2">
          <strong>Tarih:</strong> {state.settings.effectiveDate ? new Date(state.settings.effectiveDate).toLocaleDateString('tr-TR') : getFormattedDate()}
        </div>
        <table className="print-carsaf-table">
          <thead>
            <tr>
              <th rowSpan={2} className="border-thick-right" style={{ width: "12%" }}>Atölye / Salon</th>
              {state.settings.days.map((day, dIdx) => (
                <th key={dIdx} colSpan={numPeriods} className="bg-slate-100 font-bold text-[9px] uppercase border border-black border-thick-right" style={{ borderRight: "3px solid #000" }}>{day}</th>
              ))}
            </tr>
            <tr>
              {state.settings.days.map(() => 
                Array.from({ length: numPeriods }).map((_, pIdx) => (
                  <th key={pIdx} className={`font-extrabold text-[8px] bg-slate-50 border border-black ${pIdx === numPeriods - 1 ? "border-thick-right" : ""}`}>{pIdx + 1}</th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {state.classrooms.map((classroom, crIdx) => {
              const grid = getClassroomWeeklySchedule(classroom.id);
              const rowBgColor = zebraColors[crIdx % zebraColors.length];
              return (
                <tr key={classroom.id}>
                  <td className="font-extrabold px-1.5 text-[9px] border border-black leading-tight uppercase text-slate-900 border-thick-right carsaf-row-header" style={{ backgroundColor: rowBgColor }}>
                    <div>{classroom.name}</div>
                  </td>
                  {state.settings.days.map((_, dIdx) => 
                    Array.from({ length: numPeriods }).map((_, pIdx) => {
                      const slots = grid[dIdx][pIdx];
                      const isLocked = classroom.unavailability?.[dIdx]?.[pIdx];
                      const closureName = classroom.closureNames?.[dIdx]?.[pIdx] || "";
                      const isSpecialClosure = !!(closureName && closureName.trim() !== "" && closureName.trim().toLocaleUpperCase("tr-TR") !== "KAPALI");

                      const isThick = pIdx === numPeriods - 1;

                      if (isLocked) {
                        if (isSpecialClosure) {
                          return (
                            <td key={pIdx} className={`border border-black text-center font-extrabold text-[7.5px] bg-amber-50 text-amber-900 uppercase ${isThick ? "border-thick-right" : ""}`}>
                              {closureName}
                            </td>
                          );
                        }
                        return (
                          <td key={pIdx} className={`border border-black text-center ${isThick ? "border-thick-right" : ""}`} style={{ backgroundColor: "#e2e8f0" }}></td>
                        );
                      }

                      if (!slots || slots.length === 0) {
                        return <td key={pIdx} className={`border border-black text-center ${isThick ? "border-thick-right" : ""}`} style={{ backgroundColor: rowBgColor }}>-</td>;
                      }

                      return (
                        <td key={pIdx} className={`border border-black text-center leading-tight px-0.5 ${isThick ? "border-thick-right" : ""}`} style={{ backgroundColor: rowBgColor }}>
                          {slots.map((sObj: any, index: number) => {
                            const classObj = classesMap.get(sObj.classId);
                            const course = coursesMap.get(sObj.slot.courseId);
                            return (
                              <div key={index}>
                                <span className="font-black text-slate-900 text-[8px]">{classObj?.name || "Sınıf"}</span>
                                <span className="text-slate-500 text-[7px] font-semibold block">({course?.code || course?.name || "Drs"})</span>
                              </div>
                            );
                          })}
                        </td>
                      );
                    })
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return null;
}
