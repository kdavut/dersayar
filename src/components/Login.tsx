import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Lock, Mail, LogIn, Eye, EyeOff, HelpCircle, KeyRound, ArrowLeft } from "lucide-react";
import { auth, isFirebaseConfigured } from "../firebase";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";

interface LoginProps {
  onLoginSuccess: (user: any) => void;
  onContinueAsGuest: () => void;
}

export default function Login({ onLoginSuccess, onContinueAsGuest }: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isResetMode, setIsResetMode] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");
    setLoading(true);

    if (!isFirebaseConfigured()) {
      setError("Bağlantı ayarları yapılandırılmamış. Lütfen sistem yöneticisi ile iletişime geçin.");
      setLoading(false);
      return;
    }

    if (!auth) {
      setError("Kimlik doğrulama sistemi başlatılamadı.");
      setLoading(false);
      return;
    }

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      onLoginSuccess(userCredential.user);
    } catch (err: any) {
      console.error("Auth error:", err);
      let errorMsg = "Bir hata oluştu. Lütfen tekrar deneyin.";
      if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password" || err.code === "auth/user-not-found") {
        errorMsg = "Hatalı e-posta adresi veya şifre!";
      } else if (err.code === "auth/invalid-email") {
        errorMsg = "Geçersiz e-posta adresi girdiniz!";
      } else if (err.code === "auth/too-many-requests") {
        errorMsg = "Çok fazla başarısız deneme yapıldı. Lütfen daha sonra tekrar deneyin veya şifrenizi sıfırlayın.";
      }
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");
    setLoading(true);

    if (!email) {
      setError("Lütfen e-posta adresinizi giriniz!");
      setLoading(false);
      return;
    }

    try {
      await sendPasswordResetEmail(auth!, email);
      setSuccessMessage("Şifre sıfırlama bağlantısı e-posta adresinize gönderildi. Lütfen gelen kutunuzu (ve spam klasörünü) kontrol edin.");
    } catch (err: any) {
      console.error("Reset error:", err);
      let errorMsg = "Sıfırlama e-postası gönderilirken bir hata oluştu.";
      if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential") {
        errorMsg = "Bu e-posta adresine kayıtlı kullanıcı bulunamadı!";
      } else if (err.code === "auth/invalid-email") {
        errorMsg = "Geçersiz bir e-posta adresi girdiniz!";
      }
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-950 to-blue-950 flex flex-col justify-center items-center p-4 relative overflow-hidden select-none">
      {/* Decorative Animated Ambient Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40vw] h-[40vw] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[45vw] h-[45vw] rounded-full bg-blue-500/10 blur-[130px] pointer-events-none animate-pulse" style={{ animationDelay: "2s" }}></div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md my-8"
      >
        {/* LOGO & APP BRANDING */}
        <div className="flex flex-col items-center mb-6 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 via-indigo-300 to-teal-300 bg-clip-text text-transparent font-sans">
            DerSayar
          </h1>
          <p className="mt-2 text-sm font-semibold tracking-widest text-indigo-300/80 uppercase">
            OKUL DERS YÖNETİM PANELİ
          </p>
          <div className="w-12 h-1 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full mt-3 opacity-60"></div>
        </div>

        {/* AUTH FORM CARD */}
        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-8 shadow-2xl shadow-black/40">
          <div className="flex items-center justify-center mb-6 border-b border-slate-800/60 pb-4">
            <h2 className="text-sm font-bold tracking-wider uppercase text-cyan-400 flex items-center gap-2">
              <KeyRound className="w-4 h-4" />
              {isResetMode ? "ŞİFRE SIFIRLAMA" : "YÖNETİCİ YETKİLENDİRME"}
            </h2>
          </div>

          <AnimatePresence mode="wait">
            {!isResetMode ? (
              <motion.form
                key="login-form"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                onSubmit={handleAuth}
                className="space-y-5"
              >
                <div>
                  <label className="block text-xs font-bold text-slate-400 tracking-wider uppercase mb-1.5">
                    YÖNETİCİ E-POSTA
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                      <Mail className="w-4 h-4" />
                    </span>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="isim@okulunuz.com"
                      className="w-full bg-slate-950/60 border border-slate-800 focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/30 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-600 outline-none transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 tracking-wider uppercase mb-1.5">
                    ŞİFRE
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                      <Lock className="w-4 h-4" />
                    </span>
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••"
                      className="w-full bg-slate-950/60 border border-slate-800 focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/30 rounded-xl pl-10 pr-10 py-3 text-sm text-white placeholder-slate-600 outline-none transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* ERROR PROMPT */}
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-red-950/50 border border-red-800/40 text-red-300 text-xs px-4 py-2.5 rounded-xl text-center font-medium leading-normal"
                  >
                    {error}
                  </motion.div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full relative flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold py-3 px-4 rounded-xl text-sm transition-all duration-200 cursor-pointer shadow-lg shadow-blue-950/40 hover:shadow-cyan-950/20 disabled:opacity-60 disabled:cursor-not-allowed overflow-hidden"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <span>Sistem Girişi Yap</span>
                      <LogIn className="w-4 h-4" />
                    </>
                  )}
                </button>

                <div className="relative my-4 flex items-center justify-center">
                  <div className="absolute inset-x-0 h-px bg-slate-800"></div>
                  <span className="relative bg-[#0F172A] px-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">VEYA</span>
                </div>

                <button
                  type="button"
                  onClick={onContinueAsGuest}
                  className="w-full flex items-center justify-center gap-2 bg-slate-950/40 hover:bg-slate-950/80 text-cyan-300 hover:text-white border border-cyan-800/60 hover:border-cyan-500/80 font-bold py-3 px-4 rounded-xl text-xs transition-all duration-200 cursor-pointer shadow-sm"
                >
                  <Eye className="w-4 h-4 shrink-0 text-cyan-400" />
                  <span>Sadece Görüntüleme Modu</span>
                </button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsResetMode(true);
                      setError("");
                      setSuccessMessage("");
                    }}
                    className="text-xs text-slate-400 hover:text-cyan-400 transition-colors inline-flex items-center gap-1 cursor-pointer"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    Şifremi Unuttum
                  </button>
                </div>
              </motion.form>
            ) : (
              <motion.form
                key="reset-form"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                onSubmit={handlePasswordReset}
                className="space-y-5"
              >
                <p className="text-xs text-slate-300 leading-relaxed text-center bg-slate-950/40 p-3.5 border border-slate-800/60 rounded-xl">
                  Kayıtlı e-posta adresinizi girerek şifre sıfırlama bağlantısı talep edebilirsiniz.
                </p>

                <div>
                  <label className="block text-xs font-bold text-slate-400 tracking-wider uppercase mb-1.5">
                    KAYITLI E-POSTA
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                      <Mail className="w-4 h-4" />
                    </span>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="isim@okulunuz.com"
                      className="w-full bg-slate-950/60 border border-slate-800 focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/30 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-600 outline-none transition-all"
                    />
                  </div>
                </div>

                {/* STATUS PROMPTS */}
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-red-950/50 border border-red-800/40 text-red-300 text-xs px-4 py-2.5 rounded-xl text-center font-medium leading-normal"
                  >
                    {error}
                  </motion.div>
                )}

                {successMessage && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-emerald-950/50 border border-emerald-800/40 text-emerald-300 text-xs px-4 py-2.5 rounded-xl text-center font-medium leading-normal"
                  >
                    {successMessage}
                  </motion.div>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsResetMode(false);
                      setError("");
                      setSuccessMessage("");
                    }}
                    className="flex-1 bg-slate-950/40 hover:bg-slate-950/70 border border-slate-800 text-slate-300 hover:text-white font-bold py-3 px-4 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Geri Dön
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold py-3 px-4 rounded-xl text-xs transition-all duration-200 cursor-pointer disabled:opacity-60 flex items-center justify-center"
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    ) : (
                      "Sıfırlama Bağlantısı Gönder"
                    )}
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </div>

        {/* LICENSE & DEVELOPER CORNER */}
        <div className="mt-8 bg-slate-900/30 border border-slate-800/40 rounded-2xl p-6 text-center leading-normal">
          <h3 className="text-xs font-bold text-cyan-400 tracking-wider uppercase mb-1.5">
            Giriş Yetkisi &amp; Lisanslama
          </h3>
          <p className="text-slate-400 text-xs leading-relaxed mb-4">
            Sistemi kullanmak için kurumunuza özel giriş yetkisi tanımlanması gerekmektedir. Fiyatlandırma ve teknik destek için lütfen geliştirici ile iletişime geçiniz.
          </p>

          <div className="w-8 h-px bg-slate-800 mx-auto mb-4"></div>

          <h4 className="text-[10px] font-bold text-slate-500 tracking-widest uppercase mb-2">
            Geliştirici İletişim
          </h4>
          
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-950/40 border border-slate-800/80 rounded-xl">
            <span className="w-5 h-5 rounded-full bg-gradient-to-r from-cyan-500 to-teal-500 flex items-center justify-center text-[10px] font-extrabold text-white">
              DK
            </span>
            <span className="text-xs font-semibold text-slate-300 font-mono">
              davutk144@gmail.com
            </span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

