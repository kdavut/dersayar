import React from "react";
import { motion } from "motion/react";
import { Lock } from "lucide-react";

interface F3CustomClosureModalProps {
  closureDialog: { dIdx: number; pIdx: number } | null;
  onClose: () => void;
  days: string[];
  closureNameInput: string;
  setClosureNameInput: (val: string) => void;
  handleSetCustomClosureAt: (dIdx: number, pIdx: number, label: string) => void;
}

export function F3CustomClosureModal({
  closureDialog,
  onClose,
  days,
  closureNameInput,
  setClosureNameInput,
  handleSetCustomClosureAt
}: F3CustomClosureModalProps) {
  if (!closureDialog) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 text-left">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-100"
      >
        <div className="p-6 space-y-4">
          <div className="flex items-center space-x-2.5 text-amber-600">
            <Lock className="w-5 h-5" />
            <h3 className="text-base font-extrabold text-slate-800">Özel Kapatma Belirle</h3>
          </div>

          <p className="text-xs text-slate-500 font-semibold leading-relaxed">
            Seçili hücreyi ({days[closureDialog.dIdx]} Günü, {closureDialog.pIdx + 1}. Ders Saati) kapatmak için bir etiket girin veya hızlıca seçim yapın.
          </p>

          <div className="space-y-3">
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Kapatma İsmi / Etiketi</label>
            <input
              type="text"
              value={closureNameInput}
              onChange={(e) => setClosureNameInput(e.target.value)}
              placeholder="Örn: Reh, Drs, koor, Atö, alan, İBE, Nöbet"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 focus:bg-white transition"
            />

            <div className="space-y-1.5">
              <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Hızlı Seçim Etiketleri</span>
              <div className="flex flex-wrap gap-1.5">
                {["Reh", "Drs", "koor", "Atö", "alan", "İBE", "Nöbet"].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => {
                      handleSetCustomClosureAt(closureDialog.dIdx, closureDialog.pIdx, preset);
                      onClose();
                    }}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-amber-100 hover:text-amber-800 text-slate-700 text-[10px] font-bold rounded-lg transition-all cursor-pointer border-none bg-transparent"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center pt-2 border-t border-slate-100">
            <button
              onClick={() => {
                handleSetCustomClosureAt(closureDialog.dIdx, closureDialog.pIdx, "");
                onClose();
              }}
              className="px-3 py-2 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-bold transition cursor-pointer border-none bg-transparent"
            >
              Kapatmayı Temizle
            </button>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-lg transition cursor-pointer border-none"
              >
                Vazgeç
              </button>
              <button
                onClick={() => {
                  handleSetCustomClosureAt(closureDialog.dIdx, closureDialog.pIdx, closureNameInput || "KAPALI");
                  onClose();
                }}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition cursor-pointer shadow-md shadow-amber-100 border-none"
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
