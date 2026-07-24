import React from 'react';
import { motion } from 'motion/react';
import { ArrowDown, CloudLightning, ArrowUp, Trash2, CalendarDays, Settings, Lock, Unlock } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

export default function BackupDeleteTab() {
  const {
    handleDownloadBackup,
    saveToCloud,
    handleImportBackup,
    handleClearAllData,
    handleClearAllTeachersSchedule,
    handleClearConstraints,
    handleClearManualLocks
  } = useAppStore();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-5xl space-y-6"
    >
      {/* Temel İşlemler Section */}
      <div className="space-y-3">
        <div className="flex items-center space-x-2 border-b border-slate-100 pb-2">
          <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Temel İşlemler</h3>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Tüm Verileri İndir */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between aspect-square hover:border-blue-500 hover:shadow-md hover:shadow-blue-50/50 transition-all duration-200">
            <div className="flex flex-col items-center text-center space-y-2 mt-2">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-xl shrink-0">
                <ArrowDown className="w-5 h-5" />
              </div>
              <h4 className="text-xs font-bold text-slate-800">Yedek İndir</h4>
              <p className="text-[10px] text-slate-400 leading-normal max-w-[150px]">
                Tüm okul ve program verilerini bilgisayarınıza JSON olarak indirir.
              </p>
            </div>
            <button
              onClick={handleDownloadBackup}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] py-2 px-3 rounded-lg transition cursor-pointer flex items-center justify-center space-x-1"
            >
              <ArrowDown className="w-3 h-3" />
              <span>İndir (.JSON)</span>
            </button>
          </div>

          {/* Tüm Verileri Buluta Kaydet */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between aspect-square hover:border-emerald-500 hover:shadow-md hover:shadow-emerald-50/50 transition-all duration-200">
            <div className="flex flex-col items-center text-center space-y-2 mt-2">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
                <CloudLightning className="w-5 h-5" />
              </div>
              <h4 className="text-xs font-bold text-slate-800">Buluta Yedekle</h4>
              <p className="text-[10px] text-slate-400 leading-normal max-w-[150px]">
                Ders programı verilerini güvenli bulut veritabanına kaydeder.
              </p>
            </div>
            <button
              onClick={saveToCloud}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] py-2 px-3 rounded-lg transition cursor-pointer flex items-center justify-center space-x-1"
            >
              <CloudLightning className="w-3 h-3" />
              <span>Buluta Kaydet</span>
            </button>
          </div>

          {/* Dosya'dan Geri Al */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between aspect-square hover:border-indigo-500 hover:shadow-md hover:shadow-indigo-50/50 transition-all duration-200">
            <div className="flex flex-col items-center text-center space-y-2 mt-2">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl shrink-0">
                <ArrowUp className="w-5 h-5" />
              </div>
              <h4 className="text-xs font-bold text-slate-800">Yedekten Yükle</h4>
              <p className="text-[10px] text-slate-400 leading-normal max-w-[150px]">
                Bilgisayarınızdaki yedek dosyasından tüm sistemi geri yükler.
              </p>
            </div>
            <label className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] py-2 px-3 rounded-lg transition cursor-pointer flex items-center justify-center space-x-1 text-center">
              <ArrowUp className="w-3 h-3" />
              <span>Dosya Seç</span>
              <input
                type="file"
                accept=".json"
                onChange={handleImportBackup}
                className="hidden"
              />
            </label>
          </div>

          {/* Tüm Verileri Sil */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between aspect-square hover:border-rose-500 hover:shadow-md hover:shadow-rose-50/50 transition-all duration-200">
            <div className="flex flex-col items-center text-center space-y-2 mt-2">
              <div className="p-3 bg-rose-50 text-rose-600 rounded-xl shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <h4 className="text-xs font-bold text-slate-800">Sıfırla</h4>
              <p className="text-[10px] text-slate-400 leading-normal max-w-[150px]">
                Tüm okul, öğretmen, ders ve planlama verilerini temizler.
              </p>
            </div>
            <button
              onClick={handleClearAllData}
              className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] py-2 px-3 rounded-lg transition cursor-pointer flex items-center justify-center space-x-1"
            >
              <Trash2 className="w-3 h-3" />
              <span>Sistemi Sıfırla</span>
            </button>
          </div>
        </div>
      </div>

      {/* Alt Menüler Section */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center space-x-2 border-b border-slate-100 pb-2">
          <div className="w-2 bg-slate-400 rounded-full h-2"></div>
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Alt Menüler (Hızlı Temizlik)</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {/* Tüm Ders Programını Sil */}
          <div className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/80 flex flex-col justify-between hover:bg-white transition-all duration-150">
            <div className="space-y-0.5 mb-2.5">
              <h4 className="text-xs font-bold text-slate-700 flex items-center space-x-1.5">
                <CalendarDays className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <span>Programı Temizle</span>
              </h4>
              <p className="text-[9.5px] text-slate-400">
                Ders yerleşimlerini siler, tanımları korur.
              </p>
            </div>
            <button
              onClick={handleClearAllTeachersSchedule}
              className="w-full bg-white hover:bg-rose-50 text-rose-600 border border-slate-200 hover:border-rose-200 font-bold text-[9px] py-1.5 px-3 rounded-md transition cursor-pointer flex items-center justify-center space-x-1 shadow-sm"
            >
              <Trash2 className="w-3 h-3" />
              <span>Hücreleri Temizle</span>
            </button>
          </div>

          {/* Tüm Kısıtları Sil */}
          <div className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/80 flex flex-col justify-between hover:bg-white transition-all duration-150">
            <div className="space-y-0.5 mb-2.5">
              <h4 className="text-xs font-bold text-slate-700 flex items-center space-x-1.5">
                <Settings className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <span>Kısıtları Sıfırla</span>
              </h4>
              <p className="text-[9.5px] text-slate-400">
                Tanımlanmış kapalı saat ve engelleri kaldırır.
              </p>
            </div>
            <button
              onClick={handleClearConstraints}
              className="w-full bg-white hover:bg-rose-50 text-rose-600 border border-slate-200 hover:border-rose-200 font-bold text-[9px] py-1.5 px-3 rounded-md transition cursor-pointer flex items-center justify-center space-x-1 shadow-sm"
            >
              <Trash2 className="w-3 h-3" />
              <span>Kısıtları Sıfırla</span>
            </button>
          </div>

          {/* Tüm Elle Çakılanları Sil */}
          <div className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/80 flex flex-col justify-between hover:bg-white transition-all duration-150">
            <div className="space-y-0.5 mb-2.5">
              <h4 className="text-xs font-bold text-slate-700 flex items-center space-x-1.5">
                <Lock className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <span>Kilitleri Kaldır</span>
              </h4>
              <p className="text-[9.5px] text-slate-400">
                Hücrelerdeki tüm sabit ders kilitlerini açar.
              </p>
            </div>
            <button
              onClick={handleClearManualLocks}
              className="w-full bg-white hover:bg-rose-50 text-rose-600 border border-slate-200 hover:border-rose-200 font-bold text-[9px] py-1.5 px-3 rounded-md transition cursor-pointer flex items-center justify-center space-x-1 shadow-sm"
            >
              <Unlock className="w-3 h-3" />
              <span>Tüm Kilitleri Kaldır</span>
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
