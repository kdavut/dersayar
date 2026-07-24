import React from "react";
import { motion } from "motion/react";
import { RefreshCw } from "lucide-react";
import { ProgressUpdate, LessonAssignment } from "../../types";

interface ProgressOverlayProps {
  isScheduling: boolean;
  schedulingProgress: ProgressUpdate | null;
  assignments: LessonAssignment[];
  stopAutomaticScheduler: () => void;
}

export function ProgressOverlay({
  isScheduling,
  schedulingProgress,
  assignments,
  stopAutomaticScheduler
}: ProgressOverlayProps) {
  if (!isScheduling || !schedulingProgress) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-100 text-left"
      >
        <div className="p-6 text-center space-y-5">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <RefreshCw className="w-5 h-5 animate-spin" />
          </div>
          
          <div className="space-y-1 animate-pulse">
            <h3 className="text-base font-bold text-slate-800 tracking-tight">DerSayar Algoritması hesaplamalar yapıyor...</h3>
            <p className="text-xs text-slate-400">Kısıtlar optimize ediliyor</p>
          </div>

          {schedulingProgress.targetTeacherName && (
            <div className="bg-blue-50 border border-blue-100/60 rounded-xl py-2.5 px-3.5 flex flex-col items-center justify-center gap-0.5 max-w-xs mx-auto shadow-sm">
              <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest">İşlem Yapılan Öğretmen</span>
              <span className="text-sm font-extrabold text-blue-800 truncate max-w-full">👨‍🏫 {schedulingProgress.targetTeacherName}</span>
            </div>
          )}

          {schedulingProgress.targetClassName && (
            <div className="bg-purple-50 border border-purple-100/60 rounded-xl py-2.5 px-3.5 flex flex-col items-center justify-center gap-0.5 max-w-xs mx-auto shadow-sm">
              <span className="text-[9px] font-black text-purple-500 uppercase tracking-widest">İşlem Yapılan Sınıf</span>
              <span className="text-sm font-extrabold text-purple-800 truncate max-w-full">🏫 {schedulingProgress.targetClassName}</span>
            </div>
          )}

          {/* Minimalist Live Counters Grid */}
          {schedulingProgress.globalTotalHours !== undefined ? (
            <div className="grid grid-cols-3 gap-2 bg-slate-50 border border-slate-100 rounded-xl p-3">
              <div className="text-center space-y-0.5">
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Toplam Ders</span>
                <span className="block text-base font-extrabold text-slate-700">
                  {schedulingProgress.globalTotalHours}
                </span>
              </div>
              <div className="text-center space-y-0.5 border-x border-slate-200/60">
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Yerleşen (Toplam)</span>
                <span className="block text-base font-extrabold text-emerald-600">
                  {schedulingProgress.globalPlacedHours}
                </span>
              </div>
              <div className="text-center space-y-0.5">
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Kalan (Toplam)</span>
                <span className="block text-base font-extrabold text-rose-500">
                  {schedulingProgress.globalUnplacedHours}
                </span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 bg-slate-50 border border-slate-100 rounded-xl p-3">
              <div className="text-center space-y-0.5">
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Atanan Ders</span>
                <span className="block text-base font-extrabold text-slate-700">
                  {schedulingProgress.totalHours ?? assignments.reduce((sum, a) => sum + a.weeklyHours, 0)}
                </span>
              </div>
              <div className="text-center space-y-0.5 border-x border-slate-200/60">
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Yerleşen</span>
                <span className="block text-base font-extrabold text-emerald-600">
                  {schedulingProgress.placedHours ?? 0}
                </span>
              </div>
              <div className="text-center space-y-0.5">
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Kalan Ders</span>
                <span className="block text-base font-extrabold text-rose-500">
                  {schedulingProgress.unplacedHours ?? 0}
                </span>
              </div>
            </div>
          )}

          <div className="pt-1">
            <button
              onClick={stopAutomaticScheduler}
              className="w-full py-2.5 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-600 font-bold text-xs rounded-xl transition-all cursor-pointer shadow-sm hover:shadow"
            >
              Durdur
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
