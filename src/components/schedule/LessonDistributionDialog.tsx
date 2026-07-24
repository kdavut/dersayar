import React from "react";
import { motion } from "motion/react";
import { Edit3 } from "lucide-react";
import { AppState, Course, GradeClass, Teacher } from "../../types";

interface LessonDistributionDialogProps {
  distributionDialog: { assignmentId: string; current: string } | null;
  onClose: () => void;
  state: AppState;
  distributionInput: string;
  setDistributionInput: (val: string) => void;
  handleSetCustomDistribution: (assignmentId: string, distribution: string) => void;
}

export function LessonDistributionDialog({
  distributionDialog,
  onClose,
  state,
  distributionInput,
  setDistributionInput,
  handleSetCustomDistribution
}: LessonDistributionDialogProps) {
  if (!distributionDialog) return null;

  const assign = state.assignments.find(a => a.id === distributionDialog.assignmentId);
  if (!assign) return null;

  const teachersMap = new Map<string, Teacher>(state.teachers.map((t) => [t.id, t]));
  const classesMap = new Map<string, GradeClass>(state.classes.map((c) => [c.id, c]));
  const coursesMap = new Map<string, Course>(state.courses.map((co) => [co.id, co]));

  const course = coursesMap.get(assign.courseId);
  const classObj = classesMap.get(assign.classId);
  const teacherNames = assign.teacherId
    ? assign.teacherId.split(",").map(id => teachersMap.get(id.trim())?.name).filter(Boolean).join(", ")
    : "Atanmamış";

  const parts = distributionInput.trim()
    ? distributionInput.split("+").map(p => parseInt(p.trim(), 10)).filter(p => !isNaN(p))
    : [];
  const partsSum = parts.reduce((sum, p) => sum + p, 0);
  const isValidSum = partsSum === assign.weeklyHours;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 text-left">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-100"
      >
        <div className="p-6 space-y-4">
          <div className="flex items-center space-x-2 text-blue-600">
            <Edit3 className="w-5 h-5" />
            <h3 className="text-base font-extrabold text-slate-800">Derse Özel Dağılım Belirle</h3>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-700 space-y-1">
            <p><strong className="text-slate-800">Ders:</strong> {course?.name} ({course?.code})</p>
            <p><strong className="text-slate-800">Sınıf:</strong> {classObj?.name}</p>
            <p><strong className="text-slate-800">Öğretmen:</strong> {teacherNames}</p>
            <p><strong className="text-slate-800">Haftalık Toplam Saat:</strong> <span className="font-bold text-blue-600">{assign.weeklyHours} Saat</span></p>
          </div>

          <div className="space-y-2">
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Haftalık Gün Dağılım Formatı</label>
            <input
              type="text"
              value={distributionInput}
              onChange={(e) => setDistributionInput(e.target.value)}
              placeholder="Örn: 2+2+2 veya 3+3 veya 4+2"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition"
            />
            <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">
              Dağılım saatlerini aralarında '+' karakteri olacak şekilde yazın.
            </p>
          </div>

          {distributionInput.trim() && (
            <div className={`p-3 rounded-xl border text-xs font-semibold ${isValidSum ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-800"}`}>
              {isValidSum ? (
                <p className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  Dağılım geçerli! Toplam: {partsSum} saat (Haftalık saate tam uyuyor).
                </p>
              ) : (
                <p className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                  Dağılım geçersiz: Girdiğiniz dağılım toplamı {partsSum} saat, fakat haftalık ders saati {assign.weeklyHours} saattir!
                </p>
              )}
            </div>
          )}

          <div className="flex justify-between items-center pt-2 border-t border-slate-100">
            <button
              onClick={() => {
                handleSetCustomDistribution(assign.id, "");
                onClose();
              }}
              className="px-3 py-2 text-slate-600 hover:bg-slate-50 rounded-lg text-xs font-bold transition cursor-pointer border-none bg-transparent"
            >
              Varsayılana Dön
            </button>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-lg transition cursor-pointer border-none"
              >
                İptal
              </button>
              <button
                disabled={distributionInput.trim() !== "" && !isValidSum}
                onClick={() => {
                  handleSetCustomDistribution(assign.id, distributionInput);
                  onClose();
                }}
                className={`px-4 py-2 text-white text-xs font-bold rounded-lg transition cursor-pointer border-none ${
                  distributionInput.trim() !== "" && !isValidSum
                    ? "bg-slate-300 cursor-not-allowed text-slate-500"
                    : "bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-100"
                }`}
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
