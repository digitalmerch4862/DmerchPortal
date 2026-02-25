/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, CreditCard, Info, ExternalLink, CheckCircle2, AlertCircle, Facebook, Youtube, Instagram } from 'lucide-react';

// Import local assets
import gcashQr from './gcash-qr.png';
import gotymeQr from './gotyme-qr.png';

// Cyberpunk Theme Constants
const COLORS = {
  bg: '#050505',
  cyan: '#00f3ff',
  magenta: '#ff00ff',
  yellow: '#fcee0a',
  darkCyan: '#008b91',
  darkMagenta: '#910091',
};

// Real QR Codes (Base64)
const GCASH_QR = gcashQr;
const GOTYME_QR = gotymeQr;
export default function App() {
  const [step, setStep] = useState<'payment' | 'form'>('payment');
  const [selectedMethod, setSelectedMethod] = useState<'gcash' | 'gotyme'>('gcash');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  const GlitchText = ({ text, className = "" }: { text: string; className?: string }) => (
    <div className={`relative inline-block ${className}`}>
      <span className="relative z-10">{text}</span>
      <span className="absolute top-0 left-0 -ml-0.5 text-cyan-400 opacity-70 animate-pulse select-none z-0" style={{ clipPath: 'inset(45% 0 30% 0)' }}>{text}</span>
      <span className="absolute top-0 left-0 ml-0.5 text-magenta-400 opacity-70 animate-pulse select-none z-0" style={{ clipPath: 'inset(10% 0 60% 0)' }}>{text}</span>
    </div>
  );

  const CyberCard = ({ children, title, icon: Icon, color = 'cyan' }: any) => {
    const borderColor = color === 'cyan' ? 'border-[#00f3ff]' : 'border-[#ff00ff]';
    const shadowColor = color === 'cyan' ? 'shadow-[0_0_15px_rgba(0,243,255,0.3)]' : 'shadow-[0_0_15px_rgba(255,0,255,0.3)]';
    const textColor = color === 'cyan' ? 'text-[#00f3ff]' : 'text-[#ff00ff]';

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative bg-black/80 border-l-4 ${borderColor} p-6 mb-6 ${shadowColor} backdrop-blur-md overflow-hidden`}
      >
        <div className="absolute top-0 right-0 p-2 opacity-10">
          <Icon size={80} />
        </div>
        <div className="flex items-center gap-3 mb-4">
          <Icon className={textColor} size={24} />
          <h2 className={`text-xl font-bold tracking-widest uppercase ${textColor}`}>
            {title}
          </h2>
        </div>
        <div className="relative z-10 text-gray-300">
          {children}
        </div>
        {/* Decorative elements */}
        <div className={`absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 ${borderColor} opacity-50`} />
        <div className={`absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 ${borderColor} opacity-50`} />
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-cyan-500/30 overflow-x-hidden">
      {/* Background Grid & Effects */}
      <div className="fixed inset-0 z-0 opacity-20 pointer-events-none" 
           style={{ backgroundImage: `linear-gradient(${COLORS.cyan}22 1px, transparent 1px), linear-gradient(90deg, ${COLORS.cyan}22 1px, transparent 1px)`, backgroundSize: '40px 40px' }} />
      <div className="fixed inset-0 z-0 bg-gradient-to-b from-transparent via-black/50 to-black pointer-events-none" />
      
      {/* Scanline Effect */}
      <div className="fixed inset-0 z-50 pointer-events-none opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]" />

      <main className="relative z-10 max-w-4xl mx-auto px-4 py-12">
        {/* Header */}
        <header className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-block border-2 border-cyan-500 px-8 py-4 mb-4 relative">
              <div className="absolute -top-1 -left-1 w-3 h-3 bg-cyan-500" />
              <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-cyan-500" />
              <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase italic">
                <GlitchText text="DMERCH_PORTAL" />
              </h1>
            </div>
            <p className="text-cyan-400/80 font-mono text-sm tracking-[0.3em] uppercase">
              Secure Transaction Protocol v2.4.0
            </p>
          </motion.div>
        </header>

        {/* Navigation Tabs */}
        <div className="flex justify-center mb-12 gap-4">
          <button
            onClick={() => setStep('payment')}
            className={`px-6 py-2 font-bold tracking-widest uppercase transition-all duration-300 border-b-2 ${
              step === 'payment' ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10' : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            01. PAYMENT
          </button>
          <button
            onClick={() => setStep('form')}
            className={`px-6 py-2 font-bold tracking-widest uppercase transition-all duration-300 border-b-2 ${
              step === 'form' ? 'border-magenta-500 text-magenta-400 bg-magenta-500/10' : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            02. VERIFICATION
          </button>
        </div>

        <AnimatePresence mode="wait">
          {step === 'payment' ? (
            <motion.div
              key="payment-step"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="mb-8 text-center">
                <p className="text-cyan-400/60 font-mono text-xs uppercase tracking-[0.3em]">
                  Select Protocol & Decrypt Access Key
                </p>
              </div>

              {/* Side-by-Side Layout */}
              <div className="flex flex-col lg:flex-row items-center justify-center gap-8 lg:gap-12 mb-16">
                
                {/* Left: GCash Card */}
                <div className="order-2 lg:order-1">
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setSelectedMethod('gcash')}
                    className={`relative cursor-pointer w-44 h-64 transition-all duration-300 border-2 ${
                      selectedMethod === 'gcash' 
                        ? 'border-blue-500 bg-blue-500/20 shadow-[0_0_40px_rgba(0,125,254,0.5)]' 
                        : 'border-white/10 bg-white/5 grayscale hover:grayscale-0 opacity-40 hover:opacity-100'
                    }`}
                  >
                    <div className="absolute top-0 left-0 w-full h-full flex flex-col items-center justify-between p-6">
                      <div className="w-full flex justify-between items-start">
                        <span className="text-[10px] font-mono opacity-50">ID: 001</span>
                        <div className={`w-2 h-2 rounded-full ${selectedMethod === 'gcash' ? 'bg-blue-400 animate-pulse' : 'bg-gray-700'}`} />
                      </div>
                      <div className="flex flex-col items-center">
                        <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-blue-500/50">
                          <span className="font-black italic text-white text-3xl">G</span>
                        </div>
                        <span className="font-black tracking-[0.2em] uppercase text-lg italic">GCash</span>
                      </div>
                      <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: selectedMethod === 'gcash' ? '100%' : '30%' }}
                          className="h-full bg-blue-500"
                        />
                      </div>
                    </div>
                    {selectedMethod === 'gcash' && (
                      <motion.div layoutId="selection-glow" className="absolute inset-0 border-2 border-blue-400 animate-pulse pointer-events-none" />
                    )}
                  </motion.div>
                </div>

                {/* Center: QR Terminal */}
                <div className="order-1 lg:order-2 w-full max-w-sm">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={selectedMethod}
                      initial={{ opacity: 0, scale: 0.9, rotateY: 90 }}
                      animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                      exit={{ opacity: 0, scale: 0.9, rotateY: -90 }}
                      transition={{ duration: 0.5, type: "spring", stiffness: 100 }}
                      className="relative"
                    >
                      <div className="relative group">
                        <div className={`absolute -inset-2 bg-gradient-to-r ${selectedMethod === 'gcash' ? 'from-blue-500 to-cyan-500' : 'from-cyan-400 to-emerald-400'} rounded-lg blur opacity-40 group-hover:opacity-60 transition duration-1000`}></div>
                        <div className="relative bg-[#0a0a0a] rounded-lg p-6 border border-white/10 flex flex-col items-center shadow-2xl">
                          <div className={`w-full ${selectedMethod === 'gcash' ? 'bg-[#007dfe]' : 'bg-[#00e5ff]'} py-3 px-6 rounded-t-md flex justify-between items-center shadow-lg`}>
                            <span className={`font-black italic tracking-tighter uppercase text-sm ${selectedMethod === 'gcash' ? 'text-white' : 'text-black'}`}>
                              {selectedMethod === 'gcash' ? 'GCash Terminal' : 'GoTyme Terminal'}
                            </span>
                            <div className={`w-3 h-3 rounded-full ${selectedMethod === 'gcash' ? 'bg-white' : 'bg-black'} animate-pulse`} />
                          </div>
                          
                          <div className={`${selectedMethod === 'gcash' ? 'bg-[#007dfe]' : 'bg-[#00e5ff]'} p-4 w-full aspect-[3/5] flex items-center justify-center overflow-hidden border-x-4 border-b-4 ${selectedMethod === 'gcash' ? 'border-blue-600' : 'border-cyan-500'}`}>
                            <img 
                              src={selectedMethod === 'gcash' ? gcashQr : gotymeQr} 
                              alt="Payment QR Code" 
                              className="w-full h-full object-contain"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                          
                          <div className="mt-6 text-center w-full py-4 border-t border-white/5">
                            <p className="text-[10px] font-mono text-gray-500 uppercase tracking-[0.3em] mb-1">Recipient Verified</p>
                            <p className="text-xl font-black text-white tracking-widest uppercase italic bg-gradient-to-r from-white to-gray-500 bg-clip-text text-transparent">
                              Robert Rich Garcia
                            </p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Right: GoTyme Card */}
                <div className="order-3">
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setSelectedMethod('gotyme')}
                    className={`relative cursor-pointer w-44 h-64 transition-all duration-300 border-2 ${
                      selectedMethod === 'gotyme' 
                        ? 'border-cyan-500 bg-cyan-500/20 shadow-[0_0_40px_rgba(0,229,255,0.5)]' 
                        : 'border-white/10 bg-white/5 grayscale hover:grayscale-0 opacity-40 hover:opacity-100'
                    }`}
                  >
                    <div className="absolute top-0 left-0 w-full h-full flex flex-col items-center justify-between p-6">
                      <div className="w-full flex justify-between items-start">
                        <span className="text-[10px] font-mono opacity-50">ID: 002</span>
                        <div className={`w-2 h-2 rounded-full ${selectedMethod === 'gotyme' ? 'bg-cyan-400 animate-pulse' : 'bg-gray-700'}`} />
                      </div>
                      <div className="flex flex-col items-center">
                        <div className="w-20 h-20 bg-cyan-400 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-cyan-400/50">
                          <span className="font-black italic text-black text-3xl">GT</span>
                        </div>
                        <span className="font-black tracking-[0.2em] uppercase text-lg italic">GoTyme</span>
                      </div>
                      <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: selectedMethod === 'gotyme' ? '100%' : '30%' }}
                          className="h-full bg-cyan-400"
                        />
                      </div>
                    </div>
                    {selectedMethod === 'gotyme' && (
                      <motion.div layoutId="selection-glow" className="absolute inset-0 border-2 border-cyan-400 animate-pulse pointer-events-none" />
                    )}
                  </motion.div>
                </div>

              </div>

              <div className="flex justify-center">
                <button
                  onClick={() => setStep('form')}
                  className="group relative px-12 py-4 bg-cyan-500 text-black font-black uppercase tracking-[0.2em] hover:bg-white transition-all duration-300"
                >
                  <span className="relative z-10 flex items-center gap-2">
                    Proceed to Form <ExternalLink size={18} />
                  </span>
                  <div className="absolute top-0 left-0 w-full h-full border-2 border-cyan-500 translate-x-2 translate-y-2 group-hover:translate-x-0 group-hover:translate-y-0 transition-transform duration-300" />
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="form-step"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="w-full"
            >
              <CyberCard title="Verification Form" icon={ShieldCheck} color="magenta">
                <p className="mb-6">
                  Please fill out the form below with your transaction details and upload your proof of payment. 
                  Our system will verify your payment within 5-10 minutes.
                </p>
                
                <div className="relative w-full min-h-[700px] bg-black/40 border-2 border-magenta-500/50 rounded-lg overflow-hidden shadow-[0_0_30px_rgba(255,0,255,0.1)]">
                  <iframe
                    src="https://api.leadconnectorhq.com/widget/form/G3KEcgah2pyk7Mz0sh4T"
                    style={{ width: '100%', height: '700px', border: 'none' }}
                    id="inline-G3KEcgah2pyk7Mz0sh4T" 
                    data-layout="{'id':'INLINE'}"
                    data-trigger-type="alwaysShow"
                    data-trigger-value=""
                    data-activation-type="alwaysActivated"
                    data-activation-value=""
                    data-deactivation-type="neverDeactivate"
                    data-deactivation-value=""
                    data-form-name="Follow up Product Link"
                    data-height="637"
                    data-layout-iframe-id="inline-G3KEcgah2pyk7Mz0sh4T"
                    data-form-id="G3KEcgah2pyk7Mz0sh4T"
                    title="Follow up Product Link"
                  />
                </div>
              </CyberCard>

              <div className="mt-8 flex justify-between items-center">
                <button
                  onClick={() => setStep('payment')}
                  className="text-gray-500 hover:text-cyan-400 font-mono text-xs uppercase tracking-widest flex items-center gap-2 transition-colors"
                >
                  ← Back to Payment
                </button>
                <div className="flex items-center gap-2 text-magenta-400/60 font-mono text-[10px] uppercase">
                  <ShieldCheck size={14} />
                  End-to-End Encrypted Verification
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer Info */}
        <footer className="mt-24 pt-8 border-t border-white/5 text-center">
          {/* Social Links */}
          <div className="flex justify-center gap-6 mb-10">
            <motion.a
              whileHover={{ scale: 1.2, color: '#1877F2' }}
              href="https://www.facebook.com/digitalmerch4862/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 transition-colors"
              title="Facebook"
            >
              <Facebook size={24} />
            </motion.a>
            <motion.a
              whileHover={{ scale: 1.2, color: '#FF0000' }}
              href="https://youtube.com/@digitalmerch-sy7yt?si=c8VCo5afd47Rf5Df"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 transition-colors"
              title="YouTube"
            >
              <Youtube size={24} />
            </motion.a>
            <motion.a
              whileHover={{ scale: 1.2, color: '#E4405F' }}
              href="https://www.instagram.com/digitalmerch4862/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 transition-colors"
              title="Instagram"
            >
              <Instagram size={24} />
            </motion.a>
          </div>

          <div className="flex justify-center gap-8 mb-6">
            <div className="flex flex-col items-center">
              <CheckCircle2 className="text-cyan-500 mb-2" size={20} />
              <span className="text-[10px] font-mono text-gray-500 uppercase">Instant Confirmation</span>
            </div>
            <div className="flex flex-col items-center">
              <ShieldCheck className="text-magenta-500 mb-2" size={20} />
              <span className="text-[10px] font-mono text-gray-500 uppercase">Secure Gateway</span>
            </div>
            <div className="flex flex-col items-center">
              <CreditCard className="text-yellow-500 mb-2" size={20} />
              <span className="text-[10px] font-mono text-gray-500 uppercase">Multiple Methods</span>
            </div>
          </div>
          <p className="text-gray-600 text-[10px] font-mono uppercase tracking-widest">
            © 2026 DMERCH PROTOCOL // ALL RIGHTS RESERVED // SYSTEM STATUS: OPTIMAL
          </p>
        </footer>
      </main>
    </div>
  );
}
