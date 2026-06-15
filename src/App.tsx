/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Shield, 
  Search, 
  Plus, 
  Trash2, 
  Lock, 
  Unlock, 
  KeyRound, 
  Copy, 
  Check, 
  FileText, 
  RefreshCw, 
  Download, 
  Upload, 
  Eye, 
  EyeOff, 
  LogOut, 
  Database,
  Smartphone,
  Sparkles,
  SearchIcon,
  HelpCircle,
  X,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  encryptText, 
  decryptText, 
  generateVerificationPayload, 
  verifyPassword,
  EncryptedData 
} from './lib/crypto';
import { SecureRecord, DecryptedRecord, SecureConfig } from './types';
import AndroidExportGuide from './components/AndroidExportGuide';

export default function App() {
  // Authentication & Configuration states
  const [isSetup, setIsSetup] = useState<boolean>(false);
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [masterPassword, setMasterPassword] = useState<string>('');
  const [enteredPassword, setEnteredPassword] = useState<string>('');
  
  // Create / Setup Password form state
  const [setupPassword, setSetupPassword] = useState<string>('');
  const [setupPasswordConfirm, setSetupPasswordConfirm] = useState<string>('');
  const [setupError, setSetupError] = useState<string>('');

  // Main UI Tab state
  const [activeTab, setActiveTab] = useState<'search' | 'add' | 'records' | 'export'>('search');

  // Vault data (Decrypted in Memory)
  const [decryptedRecords, setDecryptedRecords] = useState<DecryptedRecord[]>([]);
  const [errorMsg, setErrorMsg] = useState<string>('');
  
  // New Q&A Registry fields
  const [newQuestion, setNewQuestion] = useState<string>('');
  const [newAnswer, setNewAnswer] = useState<string>('');
  const [requirePasswordToReveal, setRequirePasswordToReveal] = useState<boolean>(false);
  const [addRecordSuccess, setAddRecordSuccess] = useState<boolean>(false);

  // Search interface states
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showPlainPasswordInput, setShowPlainPasswordInput] = useState<boolean>(false);

  // Active Challenge / Pin Prompt for Extra Secured Records
  const [activeChallengeRecordId, setActiveChallengeRecordId] = useState<string | null>(null);
  const [challengePassword, setChallengePassword] = useState<string>('');
  const [challengeError, setChallengeError] = useState<string>('');
  const [revealedSecureRecords, setRevealedSecureRecords] = useState<Record<string, boolean>>({});

  // Backup Import/Export triggers
  const [importStatus, setImportStatus] = useState<{ success: boolean; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // System Time State (simulated Android system top-bar clock)
  const [systemTime, setSystemTime] = useState<string>('18:00');

  // Load and check initial security payload
  useEffect(() => {
    const checkConfig = () => {
      const savedConfig = localStorage.getItem('secure_config');
      if (savedConfig) {
        setIsSetup(true);
      } else {
        setIsSetup(false);
      }
    };
    checkConfig();

    // Setup simulated Android top-bar system clock
    const updateTime = () => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      setSystemTime(`${hh}:${mm}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 15000);
    return () => clearInterval(interval);
  }, []);

  /**
   * Handles first-time password setup scheme
   */
  const handleSetupWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetupError('');

    if (!setupPassword) {
      setSetupError('A senha mestra não pode ser vazia.');
      return;
    }
    if (setupPassword.length < 6) {
      setSetupError('Para segurança máxima, a senha mestra deve conter ao menos 6 caracteres.');
      return;
    }
    if (setupPassword !== setupPasswordConfirm) {
      setSetupError('As senhas digitadas não coincidem.');
      return;
    }

    try {
      // Derive PBKDF2 payload to check password correctly later
      const verificationPayload = await generateVerificationPayload(setupPassword);
      const secureConfig: SecureConfig = { verificationPayload };
      
      localStorage.setItem('secure_config', JSON.stringify(secureConfig));
      localStorage.setItem('secure_records', JSON.stringify([])); // blank register array
      
      setMasterPassword(setupPassword);
      setDecryptedRecords([]);
      setIsSetup(true);
      setIsUnlocked(true);
      setActiveTab('search');
    } catch (e) {
      setSetupError('Falha crítica ao inicializar biblioteca de criptografia do navegador.');
      console.error(e);
    }
  };

  /**
   * Unlocks the secure storage with password, decrypting items on the spot to RAM
   */
  const handleUnlockWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const savedConfigStr = localStorage.getItem('secure_config');
    if (!savedConfigStr) {
      setIsSetup(false);
      return;
    }

    try {
      const secureConfig = JSON.parse(savedConfigStr) as SecureConfig;
      const isValid = await verifyPassword(secureConfig.verificationPayload, enteredPassword);
      
      if (isValid) {
        setMasterPassword(enteredPassword);
        setIsUnlocked(true);
        // Load and decrypt database
        await decryptAllData(enteredPassword);
      } else {
        setErrorMsg('Senha Mestra incorreta. Tente novamente.');
      }
    } catch (error) {
      setErrorMsg('Falha ao decodificar cofre de segurança.');
      console.error(error);
    }
  };

  /**
   * Read raw ciphertexts from localStorage, decrypting them natively on client-side RAM
   */
  const decryptAllData = async (password: string) => {
    try {
      const recordsStr = localStorage.getItem('secure_records');
      if (!recordsStr) return;
      
      const secureRecordsArray = JSON.parse(recordsStr) as SecureRecord[];
      const decryptedTempList: DecryptedRecord[] = [];

      for (const encRecord of secureRecordsArray) {
        try {
          const qPlain = await decryptText(encRecord.encryptedQuestion, password);
          const aPlain = await decryptText(encRecord.encryptedAnswer, password);
          
          decryptedTempList.push({
            id: encRecord.id,
            question: qPlain,
            answer: aPlain,
            requireMasterPasswordToReveal: encRecord.requireMasterPasswordToReveal,
            createdAt: encRecord.createdAt
          });
        } catch (decryptionError) {
          console.warn(`Record skip error (corrupted payload or bad signature)`, decryptionError);
        }
      }

      setDecryptedRecords(decryptedTempList);
    } catch (error) {
      console.error('Falha ao descriptografar banco de dados', error);
    }
  };

  /**
   * Encrypt and Append brand new record
   */
  const handleAddRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddRecordSuccess(false);

    if (!newQuestion.trim() || !newAnswer.trim()) {
      alert('Por favor, digite tanto a pergunta/frase quanto a resposta protegida.');
      return;
    }

    // Always make sure question has a question mark if user asks for typical lookups, 
    // but keep exactly what the user wrote. We can append '?' automatically if not present 
    // to match typical Q&A format, or let the user choose.
    let finalQuestion = newQuestion.trim();
    if (!finalQuestion.endsWith('?')) {
      finalQuestion = finalQuestion + '?'; // Ensure Question ends with ? to resemble request context
    }

    try {
      const encryptedQuestion = await encryptText(finalQuestion, masterPassword);
      const encryptedAnswer = await encryptText(newAnswer.trim(), masterPassword);

      const newSecureRecord: SecureRecord = {
        id: window.crypto.randomUUID ? window.crypto.randomUUID() : Math.random().toString(36).substr(2, 9),
        encryptedQuestion,
        encryptedAnswer,
        requireMasterPasswordToReveal: requirePasswordToReveal,
        createdAt: new Date().toISOString()
      };

      // Push into database
      const savedStr = localStorage.getItem('secure_records') || '[]';
      const secureList = JSON.parse(savedStr) as SecureRecord[];
      secureList.push(newSecureRecord);
      localStorage.setItem('secure_records', JSON.stringify(secureList));

      // Append live state
      setDecryptedRecords(prev => [
        ...prev,
        {
          id: newSecureRecord.id,
          question: finalQuestion,
          answer: newAnswer.trim(),
          requireMasterPasswordToReveal: requirePasswordToReveal,
          createdAt: newSecureRecord.createdAt
        }
      ]);

      setNewQuestion('');
      setNewAnswer('');
      setRequirePasswordToReveal(false);
      setAddRecordSuccess(true);
      setTimeout(() => setAddRecordSuccess(false), 3000);
    } catch (e) {
      alert('Ocorreu um erro ao encriptar as informações do registro.');
      console.error(e);
    }
  };

  /**
   * Delete static record
   */
  const handleDeleteRecord = (id: string) => {
    if (!window.confirm('Tem certeza de que deseja apagar permanentemente esse registro criptografado? Essa ação é imediata e irreversível.')) {
      return;
    }

    // Update Storage
    const savedStr = localStorage.getItem('secure_records') || '[]';
    let secureList = JSON.parse(savedStr) as SecureRecord[];
    secureList = secureList.filter(item => item.id !== id);
    localStorage.setItem('secure_records', JSON.stringify(secureList));

    // Update RAM
    setDecryptedRecords(prev => prev.filter(item => item.id !== id));
  };

  /**
   * Handle re-entry of password challenge for sensitive records
   */
  const handleVerifyChallenge = (e: React.FormEvent) => {
    e.preventDefault();
    setChallengeError('');

    if (challengePassword === masterPassword) {
      if (activeChallengeRecordId) {
        setRevealedSecureRecords(prev => ({
          ...prev,
          [activeChallengeRecordId]: true
        }));
      }
      setActiveChallengeRecordId(null);
      setChallengePassword('');
    } else {
      setChallengeError('Senha Incorreta. Não foi possível autenticar o acesso.');
    }
  };

  /**
   * Clean Lock - purge RAM states instantly
   */
  const handleLockVault = () => {
    setMasterPassword('');
    setEnteredPassword('');
    setDecryptedRecords([]);
    setRevealedSecureRecords({});
    setSearchTerm('');
    setIsUnlocked(false);
  };

  /**
   * Export encrypted database backup file
   */
  const handleExportBackup = () => {
    const rawData = localStorage.getItem('secure_records') || '[]';
    const configData = localStorage.getItem('secure_config') || '{}';
    
    const transferPayload = {
      appIdentifier: 'memo-seguro-criptografado-e2e',
      exportedAt: new Date().toISOString(),
      config: JSON.parse(configData),
      records: JSON.parse(rawData)
    };

    const blob = new Blob([JSON.stringify(transferPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Cofre_Backup_MemoCriptografado_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  /**
   * Import backup database file securely
   */
  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportStatus(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const payload = JSON.parse(event.target?.result as string);
        if (payload.appIdentifier !== 'memo-seguro-criptografado-e2e') {
          setImportStatus({ success: false, message: 'Arquivo inválido. Formato sem assinatura de segurança do app.' });
          return;
        }

        // Overwrite locally and lock for safety
        localStorage.setItem('secure_config', JSON.stringify(payload.config));
        localStorage.setItem('secure_records', JSON.stringify(payload.records));
        
        setImportStatus({ success: true, message: 'Cofre importado com absoluto sucesso! Digite a senha mestra para desbloquear.' });
        setIsSetup(true);
        handleLockVault();
      } catch (error) {
        setImportStatus({ success: false, message: 'Falha durante o parse do JSON do cofre.' });
      }
    };
    reader.readAsText(file);
  };

  // ----------------------------------------------------
  // Live Instant Query Processing logic
  // ----------------------------------------------------
  // Match normal query and clear spaces. Keep case-insensitive.
  // The system checks if user queries standard question or with custom question marks:
  // e.g. "11/06/2026?" or "11/06/2026" should yield the answer!
  const normalizeText = (text: string) => {
    return text.trim().toLowerCase().replace(/\?$/, "");
  };

  const processedSearchQuery = normalizeText(searchTerm);

  // Exact Match (e.g. user typed standard matching phrase such as '11/06/2026?')
  const exactMatchedRecord = processedSearchQuery.length > 0 
    ? decryptedRecords.find(r => normalizeText(r.question) === processedSearchQuery)
    : undefined;

  // Inclusive / Similar matches (the rest of the list for quick search lookups)
  const matchingFuzzyRecords = processedSearchQuery.length > 0
    ? decryptedRecords.filter(r => 
        normalizeText(r.question).includes(processedSearchQuery) &&
         (!exactMatchedRecord || r.id !== exactMatchedRecord.id)
      )
    : [];

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 font-sans flex flex-col items-center justify-center p-2 sm:p-6 overflow-x-hidden relative" id="main-web-view">
      
      {/* Immersive glow background blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-500/10 blur-[130px] pointer-events-none -z-10 animate-pulse duration-[8s]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/10 blur-[130px] pointer-events-none -z-10 animate-pulse duration-[12s]" />
      <div className="absolute top-[45%] right-[15%] w-[35%] h-[35%] rounded-full bg-violet-600/5 blur-[110px] pointer-events-none -z-10" />

      {/* Cyberpunk abstract tech grid overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b0b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b0b_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none -z-10" />

      {/* Responsive layout: Desktop container on large screen, converts to mobile-only style smoothly */}
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center justify-center z-10" id="layout-grid">
        
        {/* Left Side: Desktop Branding & Status Bar (Visible on desktops) */}
        <div className="lg:col-span-12 lg:lg:col-span-5 space-y-6 hidden lg:block text-left relative p-6 rounded-3xl bg-slate-900/40 backdrop-blur-md border border-slate-850/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.03)]" id="desktop-side-banner">
          <div className="inline-flex items-center space-x-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3.5 py-1.5 rounded-full text-xs font-semibold shadow-[0_0_15px_rgba(16,185,129,0.08)]" id="pill-badge">
            <Shield className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
            <span className="font-mono tracking-wider uppercase text-[10px]">AES-GCM-256 E2E Ativa</span>
          </div>
          
          <h1 className="text-4xl font-display font-extrabold tracking-tight text-white leading-tight">
            Memo <span className="relative inline-block"><span className="absolute -inset-1 rounded-lg bg-emerald-500/10 blur-sm"></span><span className="relative text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">Criptografado</span></span>
          </h1>
          
          <p className="text-xs text-slate-400 leading-relaxed font-sans">
            Armazene registros de perguntas e respostas com segurança inviolável de ponta-a-ponta. Seus dados são salvos localmente e codificados com cifra militar direto no navegador do computador ou do smartphone.
          </p>

          <div className="p-4.5 bg-slate-950/60 border border-slate-900 rounded-2xl space-y-3.5 shadow-inner" id="tech-highlights">
            <h3 className="text-[10px] font-bold font-mono text-emerald-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-900 pb-2">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Especificações da Criptografia</span>
            </h3>
            <ul className="space-y-2.5 text-xs text-slate-400">
              <li className="flex items-start space-x-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                <span><b className="text-slate-200">Zero Knowledge local:</b> Nenhum servidor externo possui acesso às suas chaves ou textos salvos.</span>
              </li>
              <li className="flex items-start space-x-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                <span><b className="text-slate-200">Busca Rápida Instantânea:</b> Suporta consulta instantânea offline conforme digita o termo.</span>
              </li>
              <li className="flex items-start space-x-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                <span><b className="text-slate-200">Modo Duplo Blindado:</b> Marque itens sensíveis para exigir nova confirmação da senha mestra.</span>
              </li>
            </ul>
          </div>

          <div className="text-[10px] text-slate-500 flex items-center space-x-2 font-mono">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>SERVIDOR INTEGRADO • PORTA 3000</span>
          </div>
        </div>

        {/* Right Side / Middle Container: Smartphone Simulator Chassis */}
        <div className="lg:col-span-7 flex justify-center w-full" id="phone-container-wrapper">
          
          {/* Smart Mobile Phone Frame - On mobile it stretches cleanly */}
          <div className="w-full max-w-[420px] bg-[#0c0e14] border-0 sm:border-[12px] border-[#181d28] rounded-[42px] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85),0_0_40px_rgba(16,185,129,0.03)] relative overflow-hidden flex flex-col justify-between h-[820px] max-h-screen text-slate-100" id="smartphone-frame">
            
            {/* Top Ear Speaker & Punch hole Camera notch details */}
            <div className="absolute top-0 inset-x-0 h-6 bg-[#06070a] flex items-center justify-between px-7 z-40 text-[10px] font-mono text-slate-400 select-none" id="phone-status-bar">
              {/* Fake System Time */}
              <span className="font-semibold text-slate-300">{systemTime}</span>
              {/* Fake Notch Camera */}
              <div className="w-2.5 h-2.5 rounded-full bg-slate-900 border border-slate-800" />
              {/* Mobile Indicators */}
              <div className="flex items-center space-x-1.5">
                <Smartphone className="h-2.5 w-2.5" />
                <span className="text-[9px]">5G</span>
                <span className="text-[9px] text-emerald-400 font-bold">100%</span>
              </div>
            </div>

            {/* Main Inside Viewport wrapper */}
            <div className="flex-grow pt-8 pb-16 overflow-y-auto px-4.5 bg-[#080a0f] scrollbar-none flex flex-col justify-start" id="app-viewport">
              
              {/* HEADER DA APLICAÇÃO */}
              {isUnlocked && (
                <div className="flex items-center justify-between py-4 border-b border-slate-900/60 mb-4" id="view-header">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-slate-950 font-black text-sm shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                      M
                    </div>
                    <div>
                      <h2 className="text-xs font-display font-extrabold text-white leading-none tracking-tight">Memo Seguro</h2>
                      <span className="text-[9px] text-emerald-400 tracking-wider font-mono">ENCRYPTED VAULT LIVE</span>
                    </div>
                  </div>

                  <button 
                    onClick={handleLockVault}
                    className="p-1.5 px-3 bg-red-950/20 hover:bg-red-500/10 text-red-400 hover:text-red-300 rounded-xl text-[10px] border border-red-500/20 font-bold cursor-pointer transition flex items-center space-x-1"
                    title="Bloquear Cofre"
                    id="exit-vault-btn"
                  >
                    <LogOut className="h-3 w-3" />
                    <span>Bloquear</span>
                  </button>
                </div>
              )}

              {/* ROUTER SWITCH ACCORDING TO STATE (Setup -> Locked -> Unlocked Dashboard) */}
              <AnimatePresence mode="wait">
                
                {/* 1. SETUP STATE */}
                {!isSetup && (
                  <motion.div
                    key="setup"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    className="space-y-6 py-6"
                    id="setup-pane"
                  >
                    <div className="text-center space-y-2">
                      <div className="inline-block p-4.5 bg-gradient-to-tr from-emerald-500/10 to-teal-500/5 text-emerald-400 border border-emerald-500/20 rounded-2xl mb-1 shadow-[0_0_20px_rgba(16,185,129,0.05)]" id="icon-container">
                        <KeyRound className="h-8 w-8 animate-pulse text-emerald-400" />
                      </div>
                      <h2 className="text-lg font-display font-extrabold text-white tracking-tight">Criar Sua Senha Mestra</h2>
                      <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
                        Este aplicativo armazena suas credenciais locais de forma estritamente criptografada. Insira uma senha abaixo.
                      </p>
                    </div>

                    <form onSubmit={handleSetupWorkspace} className="space-y-4">
                      <div className="space-y-2 text-left">
                        <label className="text-[10px] text-slate-400 uppercase tracking-widest block font-bold">Senha Mestra de Inicialização</label>
                        <div className="relative">
                          <input 
                            type={showPlainPasswordInput ? "text" : "password"}
                            placeholder="Mínimo 6 caracteres"
                            value={setupPassword}
                            onChange={(e) => setSetupPassword(e.target.value)}
                            className="w-full bg-[#090b11] border border-slate-800/80 hover:border-slate-700/80 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 focus:outline-none rounded-xl px-4 py-3 text-sm text-center font-mono placeholder:font-sans transition-all duration-250 shadow-inner"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPlainPasswordInput(!showPlainPasswordInput)}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                          >
                            {showPlainPasswordInput ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2 text-left">
                        <label className="text-[10px] text-slate-400 uppercase tracking-widest block font-bold">Confirme sua Senha</label>
                        <input 
                          type="password"
                          placeholder="Repita a chave mestra"
                          value={setupPasswordConfirm}
                          onChange={(e) => setSetupPasswordConfirm(e.target.value)}
                          className="w-full bg-[#090b11] border border-slate-800/80 hover:border-slate-700/80 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 focus:outline-none rounded-xl px-4 py-3 text-sm text-center font-mono placeholder:font-sans transition-all duration-250 shadow-inner"
                        />
                      </div>

                      {setupError && (
                        <div className="p-3 bg-red-950/20 border border-red-500/30 text-red-400 text-xs text-left rounded-xl flex items-center space-x-2">
                          <X className="h-4 w-4 shrink-0 text-red-400" />
                          <span>{setupError}</span>
                        </div>
                      )}

                      <div className="p-3.5 bg-amber-500/5 border border-amber-500/15 text-amber-300 text-[10px] text-left rounded-xl space-y-1.5 leading-relaxed">
                        <span className="font-bold flex items-center text-xs tracking-wider text-amber-400 uppercase font-mono">
                          <AlertTriangle className="h-3.5 w-3.5 mr-1 text-amber-400 shrink-0" /> ATENÇÃO
                        </span>
                        Se você perder esta senha mestra, as perguntas e respostas armazenadas no cofre estarão encriptadas para sempre e não poderão ser recuperadas.
                      </div>

                      <button
                        type="submit"
                        className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black rounded-xl transition duration-200 cursor-pointer text-xs font-mono uppercase tracking-widest shadow-[0_4px_25px_-5px_rgba(16,185,129,0.3)] active:scale-[0.98]"
                        id="btn-create-vault"
                      >
                        Super Proteger Meu Cofre
                      </button>
                    </form>

                    {/* Quick Restore link for setup screens */}
                    <div className="pt-4 border-t border-slate-900/60 text-center space-y-2">
                      <p className="text-[10px] text-slate-500 font-medium">Já possui um backup (.json)?</p>
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="px-4 py-2 bg-[#090b11] hover:bg-slate-900 border border-slate-800 text-[10px] font-bold text-slate-300 rounded-xl cursor-pointer transition inline-flex items-center space-x-1.5"
                        id="btn-import-restore-setup"
                      >
                        <Upload className="h-3 w-3 text-emerald-400" />
                        <span>Restaurar Cofre Existente</span>
                      </button>
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleImportBackup} 
                        accept=".json" 
                        className="hidden" 
                      />
                    </div>
                  </motion.div>
                )}


                {/* 2. LOCKED OUT STATE */}
                {isSetup && !isUnlocked && (
                  <motion.div
                    key="login"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    className="space-y-6 py-8"
                    id="login-pane"
                  >
                    <div className="text-center space-y-2">
                      <div className="inline-block p-4.5 bg-gradient-to-tr from-indigo-500/10 to-violet-500/5 text-indigo-400 border border-indigo-500/20 rounded-2xl mb-1 shadow-[0_0_20px_rgba(99,102,241,0.05)]">
                        <Lock className="h-8 w-8 text-indigo-400 animate-pulse" />
                      </div>
                      <h2 className="text-lg font-display font-extrabold text-white tracking-tight">Cofre Codificado</h2>
                      <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
                        Este dispositivo contém registros criptografados. Insira a Senha Mestra abaixo para revelá-los na RAM.
                      </p>
                    </div>

                    <form onSubmit={handleUnlockWorkspace} className="space-y-4">
                      <div className="space-y-2 text-left">
                        <label className="text-[10px] text-slate-400 uppercase tracking-widest block font-bold">Sua Senha Mestra</label>
                        <div className="relative">
                          <input 
                            type={showPlainPasswordInput ? "text" : "password"}
                            placeholder="Inserir chave de acesso"
                            value={enteredPassword}
                            onChange={(e) => setEnteredPassword(e.target.value)}
                            className="w-full bg-[#090b11] border border-slate-800/80 hover:border-slate-700/80 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 focus:outline-none rounded-xl px-4 py-3 text-sm text-center font-mono placeholder:font-sans transition-all duration-250 shadow-inner"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPlainPasswordInput(!showPlainPasswordInput)}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                          >
                            {showPlainPasswordInput ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      {errorMsg && (
                        <div className="p-3 bg-red-950/20 border border-red-500/30 text-red-400 text-xs text-center rounded-xl flex items-center justify-center space-x-1.5 animate-bounce">
                          <X className="h-4 w-4 shrink-0 text-red-400" />
                          <span>{errorMsg}</span>
                        </div>
                      )}

                      {importStatus && (
                        <div className={`p-3 border text-xs text-left rounded-xl leading-relaxed ${
                          importStatus.success ? 'bg-emerald-950/10 border-emerald-500/20 text-emerald-400' : 'bg-red-950/10 border-red-500/20 text-red-500'
                        }`}>
                          {importStatus.message}
                        </div>
                      )}

                      <button
                        type="submit"
                        className="w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-500 hover:from-indigo-500 hover:to-violet-400 text-white font-mono uppercase text-xs tracking-widest font-black rounded-xl transition duration-200 cursor-pointer shadow-[0_4px_25px_-5px_rgba(99,102,241,0.3)] active:scale-[0.98] flex items-center justify-center space-x-2"
                        id="btn-login-vault"
                      >
                        <Unlock className="h-3.5 w-3.5" />
                        <span>Desbloquear Cofre</span>
                      </button>
                    </form>

                    <div className="pt-6 border-t border-slate-900/60 flex flex-col items-center space-y-3">
                      <div className="flex flex-col space-y-1 w-full">
                        <span className="text-[10px] text-slate-500 text-center font-medium">Precisa resetar ou mudar de cofre?</span>
                        <div className="flex justify-center gap-2 mt-1">
                          <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="px-3.5 py-2 bg-[#090b11] hover:bg-slate-900 border border-slate-800/80 text-[10px] font-bold text-slate-300 rounded-lg cursor-pointer transition flex items-center space-x-1"
                            id="btn-import-change-vault"
                          >
                            <Upload className="h-3 w-3 text-emerald-400" />
                            <span>Importar JSON</span>
                          </button>

                          <button 
                            onClick={() => {
                              if(window.confirm("Essa operação apagará as chaves salvas localmente do navegador de modo irreversível. Certifique-se de que exportou seu backup antes. Limpar?")) {
                                localStorage.removeItem('secure_config');
                                localStorage.removeItem('secure_records');
                                setIsSetup(false);
                                handleLockVault();
                              }
                            }}
                            className="px-3.5 py-2 bg-red-950/20 hover:bg-red-950/35 border border-red-950/40 text-[10px] font-bold text-red-400 rounded-lg cursor-pointer transition flex items-center space-x-1"
                            id="btn-purge-keys-vault"
                          >
                            <Trash2 className="h-3 w-3 text-red-400" />
                            <span>Limpar Tudo</span>
                          </button>
                        </div>
                      </div>
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleImportBackup} 
                        accept=".json" 
                        className="hidden" 
                      />
                    </div>
                  </motion.div>
                )}


                {/* 3. UNLOCKED DASHBOARD STATE */}
                {isSetup && isUnlocked && (
                  <motion.div
                    key="dashboard"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="space-y-4 flex-grow flex flex-col justify-between"
                    id="dashboard-container"
                  >
                    
                    {/* Switchable views inside unlocked states */}
                    <div className="flex-grow space-y-4">
                      
                      {/* Sub-Header Tabs */}
                      <div className="grid grid-cols-4 gap-1 p-1 bg-[#090b11] border border-slate-800/80 rounded-xl" id="nav-tabs">
                        <button
                          onClick={() => setActiveTab('search')}
                          className={`py-2 text-[10px] font-mono tracking-wider uppercase rounded-lg cursor-pointer transition-all duration-200 text-center ${
                            activeTab === 'search' ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black shadow-[0_2px_10px_rgba(16,185,129,0.25)]' : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Consulta
                        </button>
                        <button
                          onClick={() => setActiveTab('add')}
                          className={`py-2 text-[10px] font-mono tracking-wider uppercase rounded-lg cursor-pointer transition-all duration-200 text-center ${
                            activeTab === 'add' ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black shadow-[0_2px_10px_rgba(16,185,129,0.25)]' : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          + Novo
                        </button>
                        <button
                          onClick={() => {
                            setActiveTab('records');
                            setSearchTerm('');
                          }}
                          className={`py-2 text-[10px] font-mono tracking-wider uppercase rounded-lg cursor-pointer transition-all duration-200 text-center ${
                            activeTab === 'records' ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black shadow-[0_2px_10px_rgba(16,185,129,0.25)]' : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Cofre ({decryptedRecords.length})
                        </button>
                        <button
                          onClick={() => setActiveTab('export')}
                          className={`py-2 text-[10px] font-mono tracking-wider uppercase rounded-lg cursor-pointer transition-all duration-200 text-center ${
                            activeTab === 'export' ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black shadow-[0_2px_10px_rgba(16,185,129,0.25)]' : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          iOS/APK
                        </button>
                      </div>

                      {/* RENDERING TAB CONTENT */}
                      
                      {/* TAB 1: LIVE LOOKUP / INSTANT QUERY */}
                      {activeTab === 'search' && (
                        <div className="space-y-4 text-left" id="tab-search">
                          
                          <div className="space-y-2">
                            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">🔒 Consulta Automatizada Rápida</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                                <Search className="h-4 w-4 text-emerald-400" />
                              </span>
                              <input 
                                type="text"
                                placeholder="Insira a Pergunta ou Palavra-Chave..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-[#090b11] border border-slate-800/80 hover:border-slate-700/80 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 focus:outline-none rounded-xl pl-9.5 pr-4 py-3 text-xs text-emerald-300 font-medium placeholder:text-slate-500 transition-all duration-200"
                                id="query-term-box"
                              />
                              {searchTerm && (
                                <button 
                                  onClick={() => setSearchTerm('')}
                                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-500 italic">
                              Dica: Digite a palavra ou frase (ex: <strong className="text-slate-400">11/06/2026?</strong>). Diferença de maiúsculas/minúsculas é totalmente ignorada!
                            </p>
                          </div>

                          {/* DYNAMIC SEARCH RESULT WINDOW */}
                          <div className="space-y-3 pt-2" id="search-results-viewport">
                            {searchTerm.trim().length === 0 ? (
                              <div className="p-8 text-center text-slate-600 bg-[#090b11]/20 border border-slate-900 border-dashed rounded-2xl space-y-2 select-none">
                                <Search className="h-10 w-10 mx-auto opacity-20 text-emerald-400" />
                                <div className="text-xs font-semibold">Aguardando busca automatizada...</div>
                                <div className="text-[10px] text-slate-600 leading-normal">Ao digitar algo correspondente a um Memo, a resposta correspondente será revelada imediatamente na tela!</div>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                
                                {/* A. EXACT MATCH CONTAINER */}
                                {exactMatchedRecord ? (
                                  <div className="p-4 bg-gradient-to-br from-emerald-950/15 via-slate-900/40 to-[#090b11]/80 border border-emerald-500/30 rounded-2xl space-y-2.5 shadow-[0_4px_25px_-5px_rgba(16,185,129,0.1)]" id="exact-match-view">
                                    <div className="flex items-center justify-between">
                                      <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[9px] font-mono font-bold border border-emerald-500/15 uppercase tracking-wider">
                                        Perfeito Match ✓
                                      </span>
                                      <span className="text-[9px] text-slate-500 font-mono">100% de Coincidência</span>
                                    </div>
                                    
                                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Pergunta encontrada:</div>
                                    <div className="text-sm font-semibold text-emerald-300 leading-snug">{exactMatchedRecord.question}</div>
                                    
                                    <div className="border-t border-slate-900/60 pt-2 pb-1">
                                      {exactMatchedRecord.requireMasterPasswordToReveal && !revealedSecureRecords[exactMatchedRecord.id] ? (
                                        // Requiring security confirmation for locked answers
                                        <div className="p-3 bg-[#050608] border border-amber-500/20 rounded-xl space-y-2 text-center shadow-inner" id="locked-shield">
                                          <div className="flex items-center justify-center space-x-1.5 text-amber-500 text-xs">
                                            <Lock className="h-3.5 w-3.5 text-amber-400 animate-bounce" />
                                            <span className="font-bold text-[11px] uppercase tracking-wider">Requer Chave Mestra</span>
                                          </div>
                                          <p className="text-[10px] text-slate-400 leading-normal">Este registro possui ultra blindagem. Clique abaixo para confirmar credenciais.</p>
                                          <button
                                            onClick={() => {
                                              setActiveChallengeRecordId(exactMatchedRecord.id);
                                              setChallengePassword('');
                                              setChallengeError('');
                                            }}
                                            className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 rounded-xl text-[10px] font-mono uppercase tracking-wider font-extrabold cursor-pointer transition shadow-md active:scale-[0.98]"
                                            id="btn-reveal-exact-match"
                                          >
                                            Confirmar e Revelar
                                          </button>
                                        </div>
                                      ) : (
                                        // Plainly visible unlocked answer
                                        <div className="space-y-1">
                                          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Resposta Criptografada:</div>
                                          <div className="p-3 bg-emerald-500/10 border border-emerald-500/15 text-white font-medium rounded-xl text-xs selection:bg-emerald-500/30 whitespace-pre-wrap select-all break-all leading-relaxed shadow-inner">
                                            {exactMatchedRecord.answer}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ) : null}

                                {/* B. INCLUSIVE OR CLOSE FUZZY ENTRIES MATCHES */}
                                {matchingFuzzyRecords.length > 0 ? (
                                  <div className="space-y-2">
                                    <h4 className="text-[10px] text-slate-500 uppercase font-bold tracking-widest font-mono">Memos Semelhantes ("{searchTerm}")</h4>
                                    <div className="space-y-2 select-none">
                                      {matchingFuzzyRecords.map(item => (
                                        <div key={item.id} className="p-3 bg-[#090b11]/80 border border-slate-900 rounded-xl space-y-1.5 hover:border-slate-800 transition duration-200">
                                          <div className="text-xs font-semibold text-slate-300">{item.question}</div>
                                          
                                          {item.requireMasterPasswordToReveal && !revealedSecureRecords[item.id] ? (
                                            <div className="flex items-center justify-between text-[10px] pt-1">
                                              <span className="text-amber-500 flex items-center space-x-1 font-mono font-bold">
                                                <Lock className="h-3 w-3 mr-0.5" /> BLOQUEADO
                                              </span>
                                              <button
                                                onClick={() => {
                                                  setActiveChallengeRecordId(item.id);
                                                  setChallengeError('');
                                                }}
                                                className="text-amber-400 hover:underline font-bold text-[10px] font-mono uppercase tracking-wider"
                                              >
                                                Revelar
                                              </button>
                                            </div>
                                          ) : (
                                            <p className="text-[11px] text-emerald-450 bg-emerald-950/15 p-2 rounded-lg border border-emerald-900/20 break-all leading-normal whitespace-pre-wrap">
                                              {item.answer}
                                            </p>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}

                                {/* Empty Search Results State */}
                                {!exactMatchedRecord && matchingFuzzyRecords.length === 0 && (
                                  <div className="p-6 bg-[#090b11]/20 border border-slate-900 border-dashed rounded-2xl text-center py-6">
                                    <HelpCircle className="h-6 w-6 text-slate-700 mx-auto mb-1.5" />
                                    <p className="text-xs text-slate-400 font-semibold">Nenhum memo correspondente no momento...</p>
                                    <p className="text-[10px] text-slate-500 max-w-[280px] mx-auto mt-1 leading-normal">Gostaria de criar um novo memo para responder a essa pergunta?</p>
                                    <button
                                      onClick={() => {
                                        setNewQuestion(searchTerm);
                                        setActiveTab('add');
                                      }}
                                      className="mt-2.5 text-[10px] font-bold text-emerald-400 hover:underline uppercase tracking-wider font-mono"
                                    >
                                      Criar memo com "{searchTerm}" &rarr;
                                    </button>
                                  </div>
                                )}

                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* TAB 2: ADD NEW DATA REGISTRY */}
                      {activeTab === 'add' && (
                        <div className="space-y-4 text-left" id="tab-add">
                          <div className="space-y-1">
                            <h3 className="text-xs font-mono font-bold tracking-wider text-emerald-400 uppercase">Criar Novo Memo Codificado</h3>
                            <p className="text-[11px] text-slate-400 leading-relaxed">
                              Insira uma chave ou pergunta correspondente e defina qual deve ser a resposta mostrada.
                            </p>
                          </div>

                          <form onSubmit={handleAddRecord} className="space-y-4">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Pergunta anterior ao ponto de interrogação (?):</label>
                              <input 
                                type="text"
                                placeholder="ex: 11/06/2026? ou Senha Dropbox?"
                                value={newQuestion}
                                onChange={(e) => setNewQuestion(e.target.value)}
                                className="w-full bg-[#090b11] border border-slate-800/80 hover:border-slate-700/80 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 focus:outline-none rounded-xl px-4 py-3 text-xs text-slate-200 transition-all duration-200 shadow-inner"
                                id="new-record-question"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Resposta correspondente (Texto Seguro):</label>
                              <textarea
                                placeholder="ex: Criei o app. ou MinhaSenhaExtremaSegura#"
                                value={newAnswer}
                                onChange={(e) => setNewAnswer(e.target.value)}
                                rows={3}
                                className="w-full bg-[#090b11] border border-slate-800/80 hover:border-slate-700/80 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 focus:outline-none rounded-xl px-4 py-3 text-xs text-slate-200 transition-all duration-200 shadow-inner"
                                id="new-record-answer"
                              />
                            </div>

                            <div className="p-3.5 bg-[#090b11]/80 border border-slate-800/80 rounded-xl space-y-2 shadow-inner">
                              <div className="flex items-start space-x-2.5">
                                <input 
                                  type="checkbox"
                                  id="req-pass-checkbox"
                                  checked={requirePasswordToReveal}
                                  onChange={(e) => setRequirePasswordToReveal(e.target.checked)}
                                  className="mt-0.5 rounded border-slate-800 bg-[#090b11] text-emerald-500 focus:ring-0 cursor-pointer"
                                />
                                <div className="space-y-1">
                                  <label htmlFor="req-pass-checkbox" className="text-xs font-bold text-slate-200 cursor-pointer leading-tight block">
                                    Exigir senha mestra para revelar
                                  </label>
                                  <p className="text-[10px] text-slate-400 leading-normal">
                                    Quando ativado, os usuários precisarão redigitar a Senha Mestra explicitamente para ver esta resposta. Perfeito para senhas de banco ou dados sensíveis.
                                  </p>
                                </div>
                              </div>
                            </div>

                            {addRecordSuccess && (
                              <div className="p-3 bg-emerald-950/20 border border-emerald-500/30 text-emerald-400 text-[11px] text-center rounded-xl font-bold font-mono">
                                ✓ Registro salvo e criptografado com AES-256!
                              </div>
                            )}

                            <button
                              type="submit"
                              className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black rounded-xl text-xs font-mono uppercase tracking-widest cursor-pointer transition shadow-[0_4px_25px_-5px_rgba(16,185,129,0.3)] select-none active:scale-[0.98] flex items-center justify-center space-x-1.5"
                              id="btn-add-record"
                            >
                              <Plus className="h-4 w-4" />
                              <span>Salvar Memo Encriptado</span>
                            </button>
                          </form>
                        </div>
                      )}

                      {/* TAB 3: KEY VAULT RECORD LIST MANAGER */}
                      {activeTab === 'records' && (
                        <div className="space-y-4 text-left" id="tab-records">
                          <div className="flex justify-between items-center bg-[#090b11]/40 p-2 rounded-xl border border-slate-900/40">
                            <div>
                              <h3 className="text-xs font-mono font-bold tracking-wider text-emerald-400 uppercase">Todos os Memos Armazenados</h3>
                              <p className="text-[9px] text-slate-400 font-semibold leading-tight">Decodificados temporariamente em memória RAM</p>
                            </div>
                            <span className="text-[9px] px-2 py-0.5 bg-[#090b11] border border-slate-800/80 text-emerald-400 rounded-full font-mono font-bold">
                              {decryptedRecords.length} ITENS
                            </span>
                          </div>

                          {decryptedRecords.length === 0 ? (
                            <div className="p-12 text-center text-slate-600 bg-[#090b11]/20 border border-slate-900 border-dashed rounded-2xl space-y-2 select-none">
                              <Database className="h-10 w-10 mx-auto opacity-15 text-emerald-400" />
                              <p className="text-xs font-semibold">Não existem registros salvos neste cofre.</p>
                              <p className="text-[10px] text-slate-600 max-w-[240px] mx-auto leading-normal">Selecione "+ Novo" acima para preencher suas perguntas e respostas e testar a criptografia!</p>
                            </div>
                          ) : (
                            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1" id="records-overflow">
                              {decryptedRecords.map(item => {
                                const isLocked = item.requireMasterPasswordToReveal && !revealedSecureRecords[item.id];
                                return (
                                  <div key={item.id} className="p-3.5 bg-[#090b11] border border-slate-900 rounded-xl space-y-1.5 relative hover:border-slate-800/60 transition-all duration-200 shadow-md">
                                    <div className="flex items-start justify-between pr-8">
                                      <div className="space-y-0.5">
                                        <div className="text-xs font-bold text-slate-200 select-all">{item.question}</div>
                                        <div className="text-[9px] text-slate-500 font-mono">Cachê Local • Criado em {new Date(item.createdAt).toLocaleDateString('pt-BR')}</div>
                                      </div>
                                      
                                      {/* Security Flag pin label */}
                                      {item.requireMasterPasswordToReveal && (
                                        <span className="text-[8px] bg-amber-500/10 border border-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-bold font-mono">
                                          🔒 EXTRA
                                        </span>
                                      )}
                                    </div>

                                    {/* Sub-Answer view */}
                                    <div className="border-t border-slate-900/65 pt-1.5">
                                      {isLocked ? (
                                        <div className="flex items-center justify-between">
                                          <div className="text-[10px] text-amber-500 italic flex items-center font-medium">
                                            <Lock className="h-2.5 w-2.5 mr-1" /> Requer autenticação
                                          </div>
                                          <button
                                            onClick={() => {
                                              setActiveChallengeRecordId(item.id);
                                              setChallengePassword('');
                                              setChallengeError('');
                                            }}
                                            className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 font-mono uppercase tracking-wider"
                                          >
                                            Revelar
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="text-emerald-300 font-mono text-[11px] whitespace-pre-wrap select-all break-all leading-normal bg-emerald-950/5 p-2 rounded-lg border border-emerald-950/10 shadow-inner">
                                          {item.answer}
                                        </div>
                                      )}
                                    </div>

                                    {/* Absolute trash button */}
                                    <button
                                      onClick={() => handleDeleteRecord(item.id)}
                                      className="absolute right-3.5 top-3.5 text-slate-500 hover:text-red-400 transition-colors cursor-pointer"
                                      title="Deletar permanentemente"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Vault backups links */}
                          <div className="pt-3 border-t border-slate-900/60 flex justify-between gap-2">
                            <button
                              onClick={handleExportBackup}
                              className="flex-1 py-2 bg-[#090b11] hover:bg-slate-900 text-slate-300 text-[10px] border border-slate-800/80 rounded-xl cursor-pointer transition flex items-center justify-center space-x-1 font-bold"
                              id="btn-export-records"
                            >
                              <Download className="h-3.5 w-3.5 text-emerald-400" />
                              <span>Exportar Backup (.json)</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* TAB 4: ANDROID & EXPORT UTILITIES */}
                      {activeTab === 'export' && (
                        <div className="text-left" id="tab-export">
                          <AndroidExportGuide encryptedRecordsJSON={localStorage.getItem('secure_records') || '[]'} />
                        </div>
                      )}

                    </div>

                    {/* Bottom simple closing drawer */}
                    <div className="pt-4 border-t border-slate-900/40 mt-4 text-center">
                      <p className="text-[10px] text-slate-600 font-medium font-mono uppercase tracking-wide">Sua privacidade é inegociável. Dados E2E 256 bits.</p>
                    </div>

                  </motion.div>
                )}

              </AnimatePresence>
            </div>
            
            {/* Fake Android screen navigation bar details */}
            <div className="absolute bottom-0 inset-x-0 h-11 bg-slate-950/90 flex items-center justify-around px-8 border-t border-slate-900/40 select-none text-slate-550" id="android-nav-bar">
              <button 
                onClick={() => {
                  if(isUnlocked) {
                    setActiveTab('search');
                  }
                }}
                className={`flex flex-col items-center justify-center transition-all duration-200 ${activeTab === 'search' && isUnlocked ? 'text-emerald-400 font-extrabold scale-105' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <Search className="h-4 w-4" />
                <span className="text-[8px] font-mono tracking-wider uppercase mt-0.5">Buscar</span>
              </button>
              
              <button 
                onClick={() => {
                  if(isUnlocked) {
                    setActiveTab('add');
                  }
                }}
                className={`flex flex-col items-center justify-center transition-all duration-200 ${activeTab === 'add' && isUnlocked ? 'text-emerald-400 font-extrabold scale-105' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <Plus className="h-4 w-4" />
                <span className="text-[8px] font-mono tracking-wider uppercase mt-0.5">Adicionar</span>
              </button>

              <button 
                onClick={() => {
                  if(isUnlocked) {
                    setActiveTab('records');
                  }
                }}
                className={`flex flex-col items-center justify-center transition-all duration-200 ${activeTab === 'records' && isUnlocked ? 'text-emerald-400 font-extrabold scale-105' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <Database className="h-4 w-4" />
                <span className="text-[8px] font-mono tracking-wider uppercase mt-0.5">Cofre</span>
              </button>
            </div>

          </div>

        </div>

      </div>

      {/* DOUBLE-BLIND MODAL CHALLENGE FOR LOCKED RECORDS */}
      <AnimatePresence>
        {activeChallengeRecordId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center z-50 p-4"
            id="challenge-modal-overlay"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="bg-[#0c0e14] border border-slate-800 p-6 rounded-2xl max-w-sm w-full space-y-4 shadow-[0_10px_50px_rgba(0,0,0,0.8)] relative"
              id="challenge-modal-card"
            >
              <button 
                onClick={() => setActiveChallengeRecordId(null)}
                className="absolute right-4 top-4 text-slate-500 hover:text-slate-300 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
              
              <div className="text-center space-y-1.5">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center justify-center mx-auto mb-1 shadow-inner">
                  <Lock className="h-5 w-5 animate-pulse text-amber-500" />
                </div>
                <h3 className="font-mono font-bold tracking-wider text-white text-sm uppercase">Registro Protegido</h3>
                <p className="text-xs text-slate-400 leading-relaxed max-w-[260px] mx-auto">
                  Redigite sua chave mestra para confirmar sua identidade e ler este memo seguro.
                </p>
              </div>

              <form onSubmit={handleVerifyChallenge} className="space-y-4">
                <input 
                  type="password"
                  placeholder="Insira sua Senha Mestra"
                  value={challengePassword}
                  onChange={(e) => setChallengePassword(e.target.value)}
                  className="w-full bg-[#050608] border border-slate-800/80 rounded-xl px-4 py-3 text-xs text-center font-mono focus:border-amber-550 focus:ring-4 focus:ring-amber-500/10 focus:outline-none transition-all duration-200 shadow-inner"
                  autoFocus
                />

                {challengeError && (
                  <p className="text-[10px] text-red-400 font-bold text-center font-mono uppercase tracking-wider">
                    ✕ {challengeError}
                  </p>
                )}

                <div className="flex space-x-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setActiveChallengeRecordId(null)}
                    className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-850 text-slate-300 text-xs rounded-xl font-bold transition duration-200 cursor-pointer active:scale-[0.98]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs rounded-xl font-black transition duration-200 cursor-pointer shadow-[0_2px_15px_rgba(245,158,11,0.25)] uppercase tracking-wider font-mono active:scale-[0.98]"
                  >
                    Revelar
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
