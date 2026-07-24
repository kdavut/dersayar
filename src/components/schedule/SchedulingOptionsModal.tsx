import React from "react";
import { motion } from "motion/react";
import { CalendarDays, RefreshCw, Lock } from "lucide-react";

interface SchedulingOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  runAutomaticScheduler: (keepExisting: boolean) => void;
  deepSearch: boolean;
  setDeepSearch: (val: boolean) => void;
  numTrials: number;
  setNumTrials: (val: number) => void;
}

export function SchedulingOptionsModal({
  isOpen,
  onClose,
  runAutomaticScheduler,
  deepSearch,
  setDeepSearch,
  numTrials,
  setNumTrials
}: SchedulingOptionsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 text-left">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-100"
      >
        <div className="p-6 space-y-4">
          <div className="flex items-center space-x-3 text-blue-600">
            <CalendarDays className="w-5 h-5" />
            <h3 className="text-base font-bold text-slate-800">Ders Programı Seçenekleri</h3>
          </div>
          
          <p className="text-xs text-slate-500 leading-relaxed font-semibold">
            Mevcut ders programınızda yerleştirilmiş bazı dersler bulunuyor. Planlama motorunu nasıl çalıştırmak istersiniz?
          </p>

          <div className="grid grid-cols-1 gap-3 pt-1">
            <button
              onClick={() => {
                runAutomaticScheduler(false);
              }}
              className="flex items-start text-left p-4 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50/50 transition cursor-pointer group"
            >
              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg mr-3 group-hover:bg-blue-100 transition shrink-0">
                <RefreshCw className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800">Sıfırdan Yeni Program Çıkar</div>
                <div className="text-[10px] text-slate-400 mt-1 font-semibold leading-normal">
                  Mevcut tüm yerleşimleri siler (kilitli/kapalı çakılı dersler hariç) ve sıfırdan tam kapasiteli optimizasyon yapar. Önerilir!
                </div>
              </div>
            </button>

            <button
              onClick={() => {
                runAutomaticScheduler(true);
              }}
              className="flex items-start text-left p-4 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/50 transition cursor-pointer group"
            >
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg mr-3 group-hover:bg-emerald-100 transition shrink-0">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800">Mevcutları Koru, Kalanları Planla</div>
                <div className="text-[10px] text-slate-400 mt-1 font-semibold leading-normal">
                  Halihazırda yerleşmiş olan derslerinize kesinlikle dokunmaz. Sadece henüz yerleşmemiş olan ders saatlerini kalan boşluklara planlar.
                </div>
              </div>
            </button>
          </div>

          {/* Gelişmiş Dağıtım Ayarları (Multi-Start & Deep Search) */}
          <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200/60 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-800 block">Daha Fazla Dene / Derinlemesine Ara</span>
                <span className="text-[10px] text-slate-500 font-semibold leading-normal">Kısıtları zorlayarak çok yönlü tarama gerçekleştirir.</span>
              </div>
              <button
                onClick={() => {
                  const nextVal = !deepSearch;
                  setDeepSearch(nextVal);
                  setNumTrials(nextVal ? 20 : 8);
                }}
                className={`w-10 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer shrink-0 ${
                  deepSearch ? "bg-blue-600" : "bg-slate-300"
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                    deepSearch ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-slate-200/50">
              <div className="flex justify-between text-[10px] font-bold text-slate-500">
                <span>Çoklu Başlangıç (Multi-Start) Deneme Sayısı:</span>
                <span className="text-blue-600 font-extrabold">{numTrials} Deneme</span>
              </div>
              <input
                type="range"
                min="2"
                max="50"
                value={numTrials}
                onChange={(e) => setNumTrials(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <p className="text-[9px] text-slate-400 font-medium leading-relaxed">
                Her denemede farklı ders yerleşim sırası seçilerek kilitli kısıtlar aşılmaya çalışılır. Sayı arttıkça çözüm oranı %100'e yaklaşır.
              </p>
            </div>
          </div>

          {/* Algoritma ve Optimizasyon Bilgileri */}
          <div className="bg-blue-50/50 rounded-xl p-3.5 border border-blue-100 space-y-2">
            <span className="text-[10px] font-extrabold text-blue-800 block uppercase tracking-wider">Planlama Motoru Teknolojileri</span>
            
            <div className="space-y-2 text-[9px] text-slate-600 font-semibold leading-relaxed">
              <div>
                <span className="text-blue-700 font-bold block">Öneri 1: İleri Görüşlü Fizibilite Filtresi</span>
                Boşa düşen bir dersin yerleşebileceği en az 1 alternatif alan olduğunu önceden test eder ve programı korur.
              </div>
              <div className="pt-1.5 border-t border-slate-200/50">
                <span className="text-blue-700 font-bold block">Öneri 2: Akıllı Net Kazanç Koruması</span>
                Yeni bir ders yerleştirirken zincirleme bozulmaları engeller. Atama başına boşa çıkan ders sayısını otomatik limitler.
              </div>
              <div className="pt-1.5 border-t border-slate-200/50">
                <span className="text-blue-700 font-bold block">Öneri 3: Esnek Öğretmen Boşluk Optimizasyonu</span>
                Öğretmenlerin gün içi pencerelerini Simulated Annealing ve Tabu Search ile minimize eder.
              </div>
              <div className="pt-1.5 border-t border-slate-200/50">
                <span className="text-blue-700 font-bold block">Öneri 4: Rekürsif Çok Seviyeli Zincir Kaydırma Motoru</span>
                Çakışma anında, çakışan dersi başka bir saate, o saatteki dersi ise başka bir öğretmenin boşluğuna kaydırarak tüm okul çapında zincirleme (cascading) bir kaydırma dalgası başlatır.
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-1 gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-lg transition cursor-pointer"
            >
              Vazgeç
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
