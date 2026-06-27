/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
// @ts-ignore
import vaultLogo from './assets/images/vault_logo_1781668621232.jpg';
import { 
  Shield, 
  ShieldCheck,
  Search, 
  Plus, 
  Trash2, 
  Lock, 
  Unlock, 
  KeyRound, 
  Copy, 
  Check, 
  FileText, 
  CreditCard,
  ArrowUpRight, 
  RefreshCw, 
  Download, 
  Upload, 
  Eye, 
  EyeOff, 
  LogOut, 
  Database,
  FileJson,
  Smartphone,
  Sparkles,
  SearchIcon,
  HelpCircle,
  X,
  AlertTriangle,
  Cloud,
  CloudOff,
  Settings,
  User,
  ArrowLeft,
  ChevronDown,
  ChevronUp
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

// Firebase core, auth and database imports
import { db, auth } from './lib/firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

// Capacitor Native API Imports
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

// Standardized Firestore error-reporting structure as mandated by security skills
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function calculatePasswordStrength(password: string): { score: number; label: string; color: string; percentage: number } {
  if (!password) return { score: 0, label: 'Vazio', color: 'bg-slate-800', percentage: 0 };
  let score = 0;
  if (password.length >= 6) score += 1;
  if (password.length >= 10) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 1) {
    return { score, label: 'Muito Fraca ⚠️', color: 'bg-red-500', percentage: 20 };
  } else if (score === 2) {
    return { score, label: 'Fraca', color: 'bg-orange-500', percentage: 40 };
  } else if (score === 3) {
    return { score, label: 'Razoável', color: 'bg-yellow-500', percentage: 60 };
  } else if (score === 4) {
    return { score, label: 'Forte 💪', color: 'bg-emerald-500', percentage: 80 };
  } else {
    return { score, label: 'Inviolável 🔥', color: 'bg-cyan-400', percentage: 100 };
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function promiseWithTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMsg: string): Promise<T> {
  let timeoutId: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(errorMsg));
    }, timeoutMs);
  });
  return Promise.race([
    promise.then((val) => {
      clearTimeout(timeoutId);
      return val;
    }),
    timeoutPromise
  ]);
}

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
  const [activeTab, setActiveTab] = useState<'search' | 'add' | 'records' | 'profile'>('search');

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
  const [revealedInCofre, setRevealedInCofre] = useState<Record<string, boolean>>({});

  // Backup Import/Export triggers
  const [importStatus, setImportStatus] = useState<{ success: boolean; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pastedJsonSetup, setPastedJsonSetup] = useState<string>('');
  const [showPastedImportSetup, setShowPastedImportSetup] = useState<boolean>(false);
  const [pastedJsonSettings, setPastedJsonSettings] = useState<string>('');
  const [showPastedImportSettings, setShowPastedImportSettings] = useState<boolean>(false);

  // Google Drive Cloud Backup states
  const [gdriveAccessToken, setGdriveAccessToken] = useState<string | null>(null);
  const [gdriveUserEmail, setGdriveUserEmail] = useState<string>(
    localStorage.getItem('secure_gdrive_email') || ''
  );
  const [gdriveIsSyncing, setGdriveIsSyncing] = useState<boolean>(false);
  const [gdriveStatusMessage, setGdriveStatusMessage] = useState<string | null>(null);
  const [gdriveLastSync, setGdriveLastSync] = useState<string | null>(
    localStorage.getItem('secure_gdrive_last_sync')
  );
  const [gdriveClientId, setGdriveClientId] = useState<string>(
    localStorage.getItem('secure_google_client_id') || 
    (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || 
    '629248809839-al3q9ad4e9es6763hom58t4fohsth9r2.apps.googleusercontent.com'
  );
  const [showGDriveClientSetup, setShowGDriveClientSetup] = useState<boolean>(false);
  const [gdriveCollapsed, setGdriveCollapsed] = useState<boolean>(true);
  const [firebaseCollapsed, setFirebaseCollapsed] = useState<boolean>(true);
  const [cryptoCollapsed, setCryptoCollapsed] = useState<boolean>(true);

  // Firebase Cloud Backup & Sync states
  const [fbUser, setFbUser] = useState<any>(null);
  const [fbEmail, setFbEmail] = useState<string>('');
  const [fbPassword, setFbPassword] = useState<string>('');
  const [fbIsLoading, setFbIsLoading] = useState<boolean>(false);
  const [fbLastSync, setFbLastSync] = useState<string | null>(
    localStorage.getItem('secure_fb_last_sync')
  );
  const [fbMode, setFbMode] = useState<'login' | 'register'>('login');
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showSetupWarning, setShowSetupWarning] = useState<boolean>(false);

  // Change Master Password form states
  const [currentMasterPassword, setCurrentMasterPassword] = useState<string>('');
  const [newMasterPassword, setNewMasterPassword] = useState<string>('');
  const [confirmNewMasterPassword, setConfirmNewMasterPassword] = useState<string>('');
  const [changePasswordError, setChangePasswordError] = useState<string>('');
  const [changePasswordSuccess, setChangePasswordSuccess] = useState<string>('');
  const [isChangingPassword, setIsChangingPassword] = useState<boolean>(false);

  // Advanced Security & Clipboard auto-clear states
  const [autoLockTimeout, setAutoLockTimeout] = useState<string>(
    localStorage.getItem('secure_autolock_timeout') || '5'
  );
  const [clipboardTimeout, setClipboardTimeout] = useState<string>(
    localStorage.getItem('secure_clipboard_timeout') || '30'
  );
  const [copiedNotification, setCopiedNotification] = useState<{ id: string; secondsLeft: number } | null>(null);

  // Secure Password Generator states
  const [showGenerator, setShowGenerator] = useState<boolean>(false);
  const [genLength, setGenLength] = useState<number>(16);
  const [genUpper, setGenUpper] = useState<boolean>(true);
  const [genLower, setGenLower] = useState<boolean>(true);
  const [genNumbers, setGenNumbers] = useState<boolean>(true);
  const [genSymbols, setGenSymbols] = useState<boolean>(true);
  const [genResult, setGenResult] = useState<string>('');

  // Stripe Integration States
  const [hasActiveSubscription, setHasActiveSubscription] = useState<boolean | null>(null);
  const [subscriptionInfo, setSubscriptionInfo] = useState<{
    planName: string;
    nextPayment: string | null;
    customerId: string | null;
    stripeStatus: string | null;
  } | null>(null);
  const [isLoadingSub, setIsLoadingSub] = useState<boolean>(false);
  const [isCheckingOut, setIsCheckingOut] = useState<boolean>(false);

  // Custom dialogs (to bypass iframe-blocked native alert/confirm APIs)
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    onConfirm: () => void;
    isDanger?: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    isDanger: false
  });

  const [alertDialog, setAlertDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
  }>({
    isOpen: false,
    title: '',
    message: ''
  });

  const triggerConfirm = (title: string, message: string, onConfirm: () => void, isDanger = false, confirmText = 'Confirmar') => {
    setConfirmDialog({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmDialog(p => ({ ...p, isOpen: false }));
      },
      isDanger,
      confirmText
    });
  };

  const triggerAlert = (title: string, message: string) => {
    setAlertDialog({
      isOpen: true,
      title,
      message
    });
  };

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

  // Whenever activeTab changes (leaving a menu / view), reset all revealed states back to hidden (REVELAR)
  useEffect(() => {
    setRevealedInCofre({});
    setRevealedSecureRecords({});
  }, [activeTab]);

  // Monitor Firebase Auth state change safely
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFbUser(user);
    });
    return () => unsubscribe();
  }, []);

  // Auto-Lock Vault on Inactivity
  useEffect(() => {
    if (!isUnlocked || autoLockTimeout === '0') return;

    let timeoutId: any;
    const timeoutMs = parseInt(autoLockTimeout) * 60 * 1000;

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        handleLockVault();
        triggerAlert('Bloqueio por Inatividade', 'O cofre foi trancado automaticamente para sua segurança após o período configurado de inatividade.');
      }, timeoutMs);
    };

    // User interaction events
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    events.forEach(event => window.addEventListener(event, resetTimer));

    resetTimer();

    return () => {
      clearTimeout(timeoutId);
      events.forEach(event => window.removeEventListener(event, resetTimer));
    };
  }, [isUnlocked, autoLockTimeout]);

  // Clipboard Countdown and auto-clear handler
  useEffect(() => {
    if (!copiedNotification) return;

    const intervalId = setInterval(() => {
      setCopiedNotification(prev => {
        if (!prev) return null;
        if (prev.secondsLeft <= 1) {
          try {
            navigator.clipboard.writeText('');
          } catch (e) {
            console.warn('Erro ao limpar clipboard:', e);
          }
          return null;
        }
        return { ...prev, secondsLeft: prev.secondsLeft - 1 };
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [copiedNotification]);

  /**
   * Secure Clipboard Copy with Auto-Clear Trigger
   */
  const handleCopyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      const secondsSetting = parseInt(clipboardTimeout);
      if (secondsSetting > 0) {
        setCopiedNotification({ id, secondsLeft: secondsSetting });
      } else {
        setCopiedNotification({ id, secondsLeft: 2 }); // Temp 2s indicator
      }
    } catch (err) {
      console.warn('Clipboard write blocked:', err);
    }
  };

  /**
   * Generates a cryptographically strong random password using window.crypto
   */
  const generateSecurePassword = () => {
    let charset = '';
    if (genUpper) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (genLower) charset += 'abcdefghijklmnopqrstuvwxyz';
    if (genNumbers) charset += '0123456789';
    if (genSymbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';

    if (!charset) {
      setGenResult('');
      return;
    }

    let password = '';
    // Use Web Crypto's secure random generation
    const array = new Uint32Array(genLength);
    window.crypto.getRandomValues(array);
    for (let i = 0; i < genLength; i++) {
      password += charset[array[i] % charset.length];
    }
    setGenResult(password);
  };

  // Re-generate password when options change
  useEffect(() => {
    if (showGenerator) {
      generateSecurePassword();
    }
  }, [showGenerator, genLength, genUpper, genLower, genNumbers, genSymbols]);

  /**
   * Refreshes the user's active billing status via our backend server
   */
  const handleCheckSubscriptionStatus = async (userEmail: string, userId: string) => {
    if (!userEmail) return;
    setIsLoadingSub(true);
    try {
      const response = await fetch('/api/stripe/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: userEmail, userId }),
      });
      const data = await response.json();
      if (data) {
        setHasActiveSubscription(data.hasActiveSubscription);
        setSubscriptionInfo({
          planName: data.planName || 'Gratuito',
          nextPayment: data.nextPayment || null,
          customerId: data.customerId || null,
          stripeStatus: data.stripeStatus || null,
        });
      }
    } catch (error) {
      console.error('Erro ao verificar assinatura:', error);
    } finally {
      setIsLoadingSub(false);
    }
  };

  /**
   * Directs the user to a secure Stripe Checkout Session for Premium subscription upgrade
   */
  const handleUpgradeToPremium = async () => {
    if (!fbUser) {
      triggerAlert('Conta Necessária', 'Por favor, conecte-se à sua conta (Firebase Cloud) na aba de Backup em Nuvem primeiro para que sua assinatura do Stripe possa ser registrada.');
      return;
    }
    setIsCheckingOut(true);
    try {
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: fbUser.email,
          userId: fbUser.uid,
        }),
      });
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (data.error) {
        triggerAlert('Erro Stripe', `Ocorreu um erro ao criar a sessão de checkout do Stripe: ${data.error}`);
      }
    } catch (err: any) {
      console.error('Erro no checkout Stripe:', err);
      triggerAlert('Falha ao conectar', 'Não foi possível conectar ao servidor Stripe para iniciar a transação de checkout.');
    } finally {
      setIsCheckingOut(false);
    }
  };

  /**
   * Directs the user to the Stripe Self-Service Billing Customer Portal
   */
  const handleOpenBillingPortal = async () => {
    if (!subscriptionInfo?.customerId) {
      triggerAlert('Sem dados de cobrança', 'Você ainda não possui um registro de cobrança ativo com dados de pagamento no Stripe.');
      return;
    }
    setIsCheckingOut(true);
    try {
      const response = await fetch('/api/stripe/create-portal-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerId: subscriptionInfo.customerId,
        }),
      });
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (data.error) {
        triggerAlert('Erro Stripe Portal', `Erro ao abrir painel de faturamento: ${data.error}`);
      }
    } catch (err: any) {
      console.error('Erro ao abrir portal de cobrança:', err);
      triggerAlert('Falha de conexão', 'Falha ao sincronizar com o provedor de portal Stripe.');
    } finally {
      setIsCheckingOut(false);
    }
  };

  // Automatically check Stripe status when fbUser changes
  useEffect(() => {
    if (fbUser) {
      handleCheckSubscriptionStatus(fbUser.email, fbUser.uid);
    } else {
      setHasActiveSubscription(null);
      setSubscriptionInfo(null);
    }
  }, [fbUser]);

  // Monitor Stripe Success/Cancel params in the URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const stripeStatus = urlParams.get('stripe_status');
    if (stripeStatus === 'success') {
      triggerAlert('Assinatura Confirmada!', 'Parabéns! Sua assinatura Premium Cloud Sync foi confirmada com sucesso via Stripe. Os recursos premium de backup na nuvem estão totalmente liberados!');
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (stripeStatus === 'cancel') {
      triggerAlert('Cancelado', 'A transação do Stripe foi pausada ou cancelada. Você continua com o plano gratuito.');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
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
      triggerAlert('Campos Vazios', 'Por favor, preencha tanto o registro quanto a senha protegida.');
      return;
    }

    let finalQuestion = newQuestion.trim();

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
      triggerAlert('Falha na Criptografia', 'Ocorreu um erro ao encriptar as informações do registro.');
      console.error(e);
    }
  };

  /**
   * Delete static record
   */
  const handleDeleteRecord = (id: string) => {
    triggerConfirm(
      'Deletar Registro',
      'Tem certeza de que deseja apagar permanentemente esse registro criptografado? Essa ação é imediata e irreversível.',
      () => {
        // Update Storage
        const savedStr = localStorage.getItem('secure_records') || '[]';
        let secureList = JSON.parse(savedStr) as SecureRecord[];
        secureList = secureList.filter(item => item.id !== id);
        localStorage.setItem('secure_records', JSON.stringify(secureList));

        // Update RAM
        setDecryptedRecords(prev => prev.filter(item => item.id !== id));
      },
      true,
      'Apagar'
    );
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
        setRevealedInCofre(prev => ({
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
    setRevealedInCofre({});
    setSearchTerm('');
    setShowSettings(false);
    isUnlocked && setIsUnlocked(false);
  };

  /**
   * Safe purge of local database after strict custom confirmation
   */
  const handlePurgeVault = () => {
    triggerConfirm(
      'Apagar Todo o Cofre',
      'Essa operação apagará as chaves salvas localmente do navegador de modo definitivo e irreversível. Certifique-se de que exportou seu backup antes de prosseguir. Deseja realmente APAGAR TUDO?',
      () => {
        localStorage.removeItem('secure_config');
        localStorage.removeItem('secure_records');
        setIsSetup(false);
        handleLockVault();
      },
      true,
      'Apagar Tudo'
    );
  };

  /**
   * Reset the current configure/setup state to first setup screen.
   * This is extremely useful if they forgot the password of an imported/restored vault.
   */
  const handleBackToSetup = () => {
    triggerConfirm(
      'Voltar para Criação / Reiniciar',
      'Se você voltar, qualquer cofre importado ou dados locais não descriptografados serão desconectados do aparelho para que você possa reiniciar do zero. Tem certeza que deseja voltar?',
      () => {
        localStorage.removeItem('secure_config');
        localStorage.removeItem('secure_records');
        setIsSetup(false);
        setEnteredPassword('');
        setImportStatus(null);
        setErrorMsg('');
      },
      true,
      'Voltar do Zero'
    );
  };

  /**
   * Export encrypted database backup file
   */
  const handleExportBackup = async () => {
    const rawData = localStorage.getItem('secure_records') || '[]';
    const configData = localStorage.getItem('secure_config') || '{}';
    
    const transferPayload = {
      appIdentifier: 'memo-seguro-criptografado-e2e',
      exportedAt: new Date().toISOString(),
      config: JSON.parse(configData),
      records: JSON.parse(rawData)
    };

    const fileName = `Cofre_Backup_Senhas_${new Date().toISOString().slice(0, 10)}.json`;
    const jsonString = JSON.stringify(transferPayload, null, 2);

    if (Capacitor.isNativePlatform()) {
      try {
        // write the file in temporary cache directory of Android/iOS device
        const result = await Filesystem.writeFile({
          path: fileName,
          data: jsonString,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
        });

        // invoke native Android share sheet to let users save it where they want or share it
        await Share.share({
          title: 'Backup do Cofre de Senhas',
          text: 'Aqui está o seu arquivo de backup (.json) criptografado do cofre de senhas.',
          url: result.uri,
          dialogTitle: 'Salvar/Compartilhar Backup',
        });
      } catch (err: any) {
        console.error('Error sharing backup in Capacitor:', err);
        triggerAlert('Erro ao Exportar', `Não foi possível criar ou compartilhar o arquivo de backup: ${err.message || err}`);
      }
    } else {
      // standard web downloads
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
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

  /**
   * Import backup database file securely from direct pasted JSON text
   */
  const handleImportPastedJSON = (jsonText: string) => {
    setImportStatus(null);
    if (!jsonText || !jsonText.trim()) {
      setImportStatus({ success: false, message: 'O conteúdo de texto do backup JSON está vazio.' });
      return;
    }

    try {
      const payload = JSON.parse(jsonText.trim());
      if (payload.appIdentifier !== 'memo-seguro-criptografado-e2e') {
        setImportStatus({ success: false, message: 'Texto inválido. Formato sem assinatura de segurança do app.' });
        return;
      }

      // Overwrite locally and lock for safety
      localStorage.setItem('secure_config', JSON.stringify(payload.config));
      localStorage.setItem('secure_records', JSON.stringify(payload.records));
      
      setImportStatus({ success: true, message: 'Cofre importado com absoluto sucesso! Digite a senha mestra para desbloquear.' });
      setIsSetup(true);
      handleLockVault();
    } catch (error) {
      setImportStatus({ success: false, message: 'Falha durante o parse do texto JSON do cofre. Certifique-se de copiar o texto completo.' });
    }
  };

  /**
   * Connect and authorize Google Drive
   */
  const handleConnectGDrive = (customClientId?: string) => {
    const finalClientId = (customClientId || gdriveClientId || '').trim();
    if (!finalClientId) {
      triggerAlert(
        'Configurar Google Client ID',
        'Por favor, insira o seu Google Client ID nas configurações de backup antes de conectar o Google Drive.'
      );
      return;
    }

    try {
      // Save it locally
      localStorage.setItem('secure_google_client_id', finalClientId);
      setGdriveClientId(finalClientId);

      const client = (window as any).google?.accounts?.oauth2?.initTokenClient({
        client_id: finalClientId,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: async (tokenResponse: any) => {
          if (tokenResponse?.error) {
            triggerAlert('Erro de Conexão', `Não foi possível conectar ao Google Drive: ${tokenResponse.error_description || tokenResponse.error}`);
            return;
          }
          if (tokenResponse?.access_token) {
            const token = tokenResponse.access_token;
            setGdriveAccessToken(token);
            setGdriveIsSyncing(true);
            try {
              const abRes = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
                headers: { Authorization: `Bearer ${token}` }
              });
              if (abRes.ok) {
                const abData = await abRes.json();
                const emailStr = abData.user?.emailAddress || 'Conectado';
                setGdriveUserEmail(emailStr);
                localStorage.setItem('secure_gdrive_email', emailStr);
              } else {
                setGdriveUserEmail('Conectado');
                localStorage.setItem('secure_gdrive_email', 'Conectado');
              }
              triggerAlert('Google Drive Ativo!', 'Seu Google Drive foi autenticado com sucesso no seu navegador. Suas chaves de segurança estão prontas para backup/restauração na nuvem.');
            } catch (e) {
              setGdriveUserEmail('Conectado');
              localStorage.setItem('secure_gdrive_email', 'Conectado');
            } finally {
              setGdriveIsSyncing(false);
            }
          }
        },
        error_callback: (err: any) => {
          console.warn('Core Google Identity Error (handled):', err);
          let errMsg = err?.message || String(err);
          const errType = err?.type || err?.error || '';
          if (errType === 'popup_failed_to_open' || errMsg.includes('popup_failed_to_open')) {
            errMsg = 'O pop-up de login foi bloqueado pelo seu navegador. Por favor, ative a exibição de pop-ups para este site e tente novamente, ou abra o app em uma aba externa cheia.';
          } else if (errType === 'popup_closed_by_user' || errMsg.includes('popup_closed_by_user') || errMsg.includes('closed') || errMsg.includes('window closed')) {
            errMsg = 'Você fechou a janela de login antes de completar a permissão de acesso ao Google Drive.';
          }
          triggerAlert('Aviso de Autenticação', errMsg);
        }
      });

      if (client) {
        client.requestAccessToken({ prompt: 'consent' });
      } else {
        triggerAlert('Biblioteca Não Carregada', 'A biblioteca do Google Identity não foi totalmente carregada no navegador. Tente em alguns instantes.');
      }
    } catch (err: any) {
      console.warn('Core Google Identity Error initialized (handled):', err);
      const isIframe = window.self !== window.top;
      let errMsg = `Não foi possível iniciar a autenticação de segurança do Google: ${err.message || err}`;
      if (isIframe) {
        errMsg += '\n\nNota importante: O navegador bloqueia pop-ups e sessões seguras do Google de terceiros quando usados dentro de frames (como este preview do AI Studio). Para resolver isso e sincronizar:\n\n1. Clique no ícone de link externo (no canto superior direito do preview) para abrir este aplicativo em uma aba dedicada inteira.\n2. Conecte pelo Google Drive lá.';
      }
      triggerAlert('Aviso de Segurança', errMsg);
    }
  };

  /**
   * Disconnect Google Drive
   */
  const handleDisconnectGDrive = () => {
    setGdriveAccessToken(null);
    setGdriveUserEmail('');
    localStorage.removeItem('secure_gdrive_email');
    triggerAlert('Nuvem Desconectada', 'Seu Google Drive foi desconectado temporariamente desta sessão da memória do navegador.');
  };

  /**
   * Safe upload of backup metadata and data as JSON
   */
  const handleGDriveBackup = async () => {
    if (!gdriveAccessToken) {
      triggerAlert('Nuvem Desconectada', 'Por favor, conecte a sua conta do Google Drive antes de fazer backup.');
      return;
    }

    setGdriveIsSyncing(true);
    setGdriveStatusMessage('Procurando cofre anterior...');
    try {
      const rawData = localStorage.getItem('secure_records') || '[]';
      const configData = localStorage.getItem('secure_config') || '{}';
      
      const transferPayload = {
        appIdentifier: 'memo-seguro-criptografado-e2e',
        exportedAt: new Date().toISOString(),
        config: JSON.parse(configData),
        records: JSON.parse(rawData)
      };

      // 1. Search for existing file named cofre_de_senhas_backup.json
      const searchRes = await fetch(
        "https://www.googleapis.com/drive/v3/files?q=name='cofre_de_senhas_backup.json' and trashed=false",
        {
          headers: { Authorization: `Bearer ${gdriveAccessToken}` },
        }
      );
      if (!searchRes.ok) throw new Error('Falha ao autenticar ou consultar arquivos no Google Drive.');
      
      const searchData = await searchRes.json();
      const existingFile = searchData.files?.[0];

      let uploadRes;
      if (existingFile) {
        setGdriveStatusMessage('Atualizando cofre da nuvem...');
        // 2a. Update existing file content directly
        uploadRes = await fetch(
          `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${gdriveAccessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(transferPayload),
          }
        );
      } else {
        setGdriveStatusMessage('Criando arquivo na nuvem...');
        // 2b. Create new file with multipart metadata + file body
        const metadata = {
          name: 'cofre_de_senhas_backup.json',
          mimeType: 'application/json',
        };
        const fileContent = JSON.stringify(transferPayload);
        
        const boundary = 'foo_bar_baz_boundary';
        const delimiter = `\r\n--${boundary}\r\n`;
        const closeDelimiter = `\r\n--${boundary}--`;
        
        const body = 
          delimiter +
          'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
          JSON.stringify(metadata) +
          delimiter +
          'Content-Type: application/json\r\n\r\n' +
          fileContent +
          closeDelimiter;

        uploadRes = await fetch(
          'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${gdriveAccessToken}`,
              'Content-Type': `multipart/related; boundary=${boundary}`,
            },
            body,
          }
        );
      }

      if (uploadRes.ok) {
        const nowStr = new Date().toLocaleString('pt-BR');
        setGdriveLastSync(nowStr);
        localStorage.setItem('secure_gdrive_last_sync', nowStr);
        triggerAlert('Backup Concluído', 'Seu cofre de senhas foi criptografado e atualizado com pleno sucesso no seu Google Drive (arquivo: cofre_de_senhas_backup.json)!');
      } else {
        const errText = await uploadRes.text();
        console.error(errText);
        throw new Error('Falha no upload do cofre à nuvem.');
      }
    } catch (error: any) {
      console.error(error);
      triggerAlert('Erro de Sincronização', `Não foi possível enviar para o Google Drive: ${error.message || error}`);
    } finally {
      setGdriveIsSyncing(false);
      setGdriveStatusMessage(null);
    }
  };

  /**
   * Restore from GDrive back onto client machine
   */
  const handleGDriveRestore = async () => {
    if (!gdriveAccessToken) {
      triggerAlert('Nuvem Desconectada', 'Por favor, conecte a sua conta do Google Drive antes de restaurar.');
      return;
    }

    triggerConfirm(
      'Restaurar da Nuvem',
      'Isso substituirá TODOS os seus registros locais atualmente armazenados nesta máquina pelos dados salvos no seu backup do Google Drive. Deseja realmente prosseguir com a restauração?',
      async () => {
        setGdriveIsSyncing(true);
        setGdriveStatusMessage('Procurando arquivo de backup...');
        try {
          const searchRes = await fetch(
            "https://www.googleapis.com/drive/v3/files?q=name='cofre_de_senhas_backup.json' and trashed=false",
            {
              headers: { Authorization: `Bearer ${gdriveAccessToken}` },
            }
          );
          if (!searchRes.ok) throw new Error('Falha ao procurar por arquivos no Google Drive.');
          
          const searchData = await searchRes.json();
          const existingFile = searchData.files?.[0];

          if (!existingFile) {
            triggerAlert('Nenhum Backup Encontrado', 'Não encontramos nenhum arquivo "cofre_de_senhas_backup.json" no seu Google Drive criado por esta plataforma.');
            return;
          }

          setGdriveStatusMessage('Baixando dados criptografados...');
          const downloadRes = await fetch(
            `https://www.googleapis.com/drive/v3/files/${existingFile.id}?alt=media`,
            {
              headers: { Authorization: `Bearer ${gdriveAccessToken}` },
            }
          );
          if (!downloadRes.ok) throw new Error('Falha ao baixar conteúdo do arquivo.');
          
          const payload = await downloadRes.json();

          if (payload.appIdentifier !== 'memo-seguro-criptografado-e2e') {
            triggerAlert('Cofre Inválido', 'O arquivo encontrado no Google Drive não pertence ao formato oficial deste aplicativo.');
            return;
          }

          // Import details to LocalStorage
          localStorage.setItem('secure_config', JSON.stringify(payload.config));
          localStorage.setItem('secure_records', JSON.stringify(payload.records));
          
          setImportStatus({ success: true, message: 'Cofre importado diretamente do Google Drive com total sucesso! Redigite sua senha mestra para desbloquear.' });
          setIsSetup(true);
          handleLockVault();
          triggerAlert('Restaurado com Sucesso', 'Informações criptografadas baixadas da nuvem e aplicadas localmente. O cofre do dispositivo foi trancado para segurança.');
        } catch (error: any) {
          console.error(error);
          triggerAlert('Falha de Restauração', `Erro ao restaurar da nuvem: ${error.message || error}`);
        } finally {
          setGdriveIsSyncing(false);
          setGdriveStatusMessage(null);
        }
      },
      false,
      'Restaurar do Drive'
    );
  };

  /**
   * Firebase Sync and Backup handler methods
   */
  const handleFbBackup = async () => {
    if (!fbUser) {
      triggerAlert('Nuvem Desconectada', 'Por favor, conecte a sua conta Firebase antes de fazer backup.');
      return;
    }

    setFbIsLoading(true);
    try {
      const rawData = localStorage.getItem('secure_records') || '[]';
      const configData = localStorage.getItem('secure_config') || '{}';

      const transferPayload = {
        config: JSON.parse(configData),
        records: JSON.parse(rawData),
        updatedAt: new Date().toISOString()
      };

      const docRef = doc(db, 'vaults', fbUser.uid);
      try {
        await promiseWithTimeout(
          setDoc(docRef, transferPayload),
          8000,
          'O servidor do Firebase demorou muito para responder (timeout de 8s). Verifique se o banco de dados do Firebase ou se a sua conexão de rede está ativa.'
        );
      } catch (firestoreErr: any) {
        if (firestoreErr.message && firestoreErr.message.includes('timeout')) {
          throw firestoreErr;
        }
        handleFirestoreError(firestoreErr, OperationType.WRITE, 'vaults');
      }

      const nowStr = new Date().toLocaleString('pt-BR');
      setFbLastSync(nowStr);
      localStorage.setItem('secure_fb_last_sync', nowStr);
      triggerAlert('Backup Concluído', 'Seu cofre foi criptografado localmente e salvo na nuvem segura do Firebase!');
    } catch (error: any) {
      console.error(error);
      triggerAlert('Erro de Sincronização', `Não foi possível enviar para o Firebase: ${error.message}`);
    } finally {
      setFbIsLoading(false);
    }
  };

  const handleFbRestore = async () => {
    if (!fbUser) {
      triggerAlert('Nuvem Desconectada', 'Por favor, conecte a sua conta Firebase antes de restaurar.');
      return;
    }

    triggerConfirm(
      'Restaurar da Nuvem Firebase',
      'Isso substituirá TODOS os seus registros locais atualmente armazenados nesta máquina pelos dados salvos no seu backup do Firebase. Deseja realmente prosseguir com a restauração?',
      async () => {
        setFbIsLoading(true);
        try {
          const docRef = doc(db, 'vaults', fbUser.uid);
          let docSnap;
          try {
            docSnap = await promiseWithTimeout(
              getDoc(docRef),
              8000,
              'O servidor do Firebase demorou muito para responder (timeout de 8s). Verifique sua conexão com a internet ou se o banco de dados do Firebase está acessível.'
            );
          } catch (firestoreErr: any) {
            if (firestoreErr.message && firestoreErr.message.includes('timeout')) {
              throw firestoreErr;
            }
            handleFirestoreError(firestoreErr, OperationType.GET, 'vaults');
          }
          
          if (!docSnap || !docSnap.exists()) {
            triggerAlert('Cofre Vazio', 'Não encontramos nenhum backup salvo para a sua conta no Firebase Firestore.');
            return;
          }

          const data = docSnap.data();
          if (!data.records || !data.config) {
            triggerAlert('Erro no Formato', 'Os dados de backup salvos no Firebase parecem corrompidos ou incompletos.');
            return;
          }

          // Overwrite local credentials
          localStorage.setItem('secure_config', JSON.stringify(data.config));
          localStorage.setItem('secure_records', JSON.stringify(data.records));

          // If masterPassword is already set (user is logged in) and matches, we decrypt right away
          const isValidPassword = masterPassword ? await verifyPassword(data.config.verificationPayload, masterPassword) : false;
          
          if (masterPassword && isValidPassword) {
            await decryptAllData(masterPassword);
            triggerAlert('Restauração Concluída', 'Seu cofre de senhas foi restaurado do Firebase com pleno sucesso e recarregado na tela!');
          } else {
            handleLockVault();
            setIsSetup(true);
            triggerAlert('Restauração Concluída', 'Seu cofre foi restaurado com sucesso! Digite a senha mestra correspondente ao cofre baixado para desbloquear.');
          }

          const nowStr = new Date().toLocaleString('pt-BR');
          setFbLastSync(nowStr);
          localStorage.setItem('secure_fb_last_sync', nowStr);
        } catch (error: any) {
          console.error(error);
          triggerAlert('Erro de Restauração', `Não foi possível baixar os dados do Firebase: ${error.message}`);
        } finally {
          setFbIsLoading(false);
        }
      },
      false,
      'Restaurar do Firebase'
    );
  };

  const handleChangeMasterPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangePasswordError('');
    setChangePasswordSuccess('');

    if (!currentMasterPassword || !newMasterPassword || !confirmNewMasterPassword) {
      setChangePasswordError('Por favor, preencha todos os campos para alterar a senha.');
      return;
    }

    if (newMasterPassword.length < 6) {
      setChangePasswordError('A nova senha mestra deve conter pelo menos 6 caracteres.');
      return;
    }

    if (newMasterPassword !== confirmNewMasterPassword) {
      setChangePasswordError('A nova senha e a confirmação não coincidem.');
      return;
    }

    setIsChangingPassword(true);
    try {
      // 1. Verify current master password
      const savedConfigStr = localStorage.getItem('secure_config');
      if (!savedConfigStr) {
        setChangePasswordError('Configuração do cofre não encontrada localmente.');
        setIsChangingPassword(false);
        return;
      }
      const secureConfig = JSON.parse(savedConfigStr) as SecureConfig;
      const isValid = await verifyPassword(secureConfig.verificationPayload, currentMasterPassword);
      if (!isValid || currentMasterPassword !== masterPassword) {
        setChangePasswordError('A senha mestra atual inserida está incorreta.');
        setIsChangingPassword(false);
        return;
      }

      // 2. Generate new verification payload
      const newVerificationPayload = await generateVerificationPayload(newMasterPassword);
      const newSecureConfig: SecureConfig = { verificationPayload: newVerificationPayload };

      // 3. Re-encrypt all records currently in memory
      const newSecureRecords: SecureRecord[] = [];
      for (const rec of decryptedRecords) {
        const encryptedQuestion = await encryptText(rec.question, newMasterPassword);
        const encryptedAnswer = await encryptText(rec.answer, newMasterPassword);
        newSecureRecords.push({
          id: rec.id,
          encryptedQuestion,
          encryptedAnswer,
          requireMasterPasswordToReveal: rec.requireMasterPasswordToReveal,
          createdAt: rec.createdAt
        });
      }

      // 4. Save to localStorage
      localStorage.setItem('secure_config', JSON.stringify(newSecureConfig));
      localStorage.setItem('secure_records', JSON.stringify(newSecureRecords));

      // 5. Update masterPassword state
      setMasterPassword(newMasterPassword);

      // Reset fields
      setCurrentMasterPassword('');
      setNewMasterPassword('');
      setConfirmNewMasterPassword('');

      // 6. If logged in with Firebase, automatically upload the new encrypted cofre to the cloud!
      if (fbUser) {
        const docRef = doc(db, 'vaults', fbUser.uid);
        await setDoc(docRef, {
          config: newSecureConfig,
          records: newSecureRecords,
          updatedAt: new Date().toISOString()
        });
        const nowStr = new Date().toLocaleString('pt-BR');
        setFbLastSync(nowStr);
        localStorage.setItem('secure_fb_last_sync', nowStr);
        setChangePasswordSuccess('Sua senha mestra foi alterada com sucesso e sincronizada com a nuvem do Firebase!');
      } else {
        setChangePasswordSuccess('Sua senha mestra foi alterada com sucesso localmente!');
      }
    } catch (error: any) {
      console.error(error);
      setChangePasswordError(`Erro ao alterar senha mestra: ${error.message || error}`);
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleFbLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fbEmail.trim() || !fbPassword) {
      triggerAlert('Campos Vazios', 'Por favor digite o e-mail e a senha do Firebase Sync.');
      return;
    }
    setFbIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, fbEmail.trim(), fbPassword);
      setFbPassword('');
      triggerAlert('Conectado!', 'Seu aplicativo está agora integrado e sincronizado com a nuvem do Firebase.');
    } catch (error: any) {
      console.error(error);
      let errMsg = 'Falha ao logar. Verifique os dados inseridos.';
      if (error.code === 'auth/operation-not-allowed') {
        errMsg = 'O provedor de E-mail/Senha não está ativado no Firebase Console para este projeto. Por favor, utilize o botão "Entrar com o Google" (que funciona imediatamente) ou ative o provedor "E-mail/senha" nas configurações de Autenticação do Console Firebase.';
      } else if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
        errMsg = 'E-mail ou senha inválidos.';
      }
      triggerAlert('Erro de Autenticação', errMsg);
    } finally {
      setFbIsLoading(false);
    }
  };

  const handleFbRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fbEmail.trim() || !fbPassword) {
      triggerAlert('Campos Vazios', 'Por favor preencha todos os campos para realizar o cadastro.');
      return;
    }
    if (fbPassword.length < 6) {
      triggerAlert('Senha Curta', 'A senha do Firebase deve conter ao menos 6 caracteres.');
      return;
    }
    setFbIsLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, fbEmail.trim(), fbPassword);
      setFbPassword('');
      triggerAlert('Conta Criada!', 'Sua conta Firebase Sync foi cadastrada com sucesso e está conectada!');
    } catch (error: any) {
      console.error(error);
      let errMsg = 'Não foi possível cadastrar sua conta.';
      if (error.code === 'auth/operation-not-allowed') {
        errMsg = 'O provedor de E-mail/Senha não está ativado no Firebase Console para este projeto. Por favor, utilize o botão "Entrar com o Google" (que funciona imediatamente) ou ative o provedor "E-mail/senha" nas configurações de Autenticação do Console Firebase.';
      } else if (error.code === 'auth/email-already-in-use') {
        errMsg = 'Este endereço de e-mail já está sendo utilizado.';
      }
      triggerAlert('Erro de Cadastro', errMsg);
    } finally {
      setFbIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setFbIsLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      triggerAlert('Conectado!', 'Seu aplicativo está agora integrado e sincronizado com a nuvem do Firebase (Google Auth).');
    } catch (error: any) {
      if (error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request') {
        console.warn('Firebase Google Sign-In user canceled or closed (handled):', error);
      } else {
        console.error(error);
      }
      let errMsg = `Erro no Google Sign-In: ${error.message}`;
      
      if (error.code === 'auth/operation-not-allowed') {
        errMsg = 'O provedor do Google não está ativado no Firebase Console para este projeto. Por favor, ative-o nas configurações de Autenticação do Console do Firebase.';
      } else if (error.code === 'auth/popup-closed-by-user') {
        errMsg = 'A janela de autenticação do Google foi fechada antes da conclusão do login. Se você deseja conectar sua conta do Google, por favor tente novamente e conclua o fluxo na janela que se abre.';
      } else if (error.code === 'auth/popup-blocked') {
        errMsg = 'A janela de login do Google foi bloqueada pelo navegador. Como o aplicativo está sendo executado dentro de uma área de preview (iframe), os navegadores podem bloquear popups por segurança. Para corrigir:\n\n1. Abra o aplicativo em uma nova aba cheia clicando no ícone do link no canto superior direito.\n2. Permita popups para este site nas configurações do seu navegador.';
      } else if (error.code === 'auth/cancelled-popup-request') {
        errMsg = 'A solicitação de login foi cancelada ou sobreposta por outra ação. Por favor, tente novamente.';
      }
      
      triggerAlert('Autenticação Pendente', errMsg);
    } finally {
      setFbIsLoading(false);
    }
  };

  const handleFbLogout = async () => {
    setFbIsLoading(true);
    try {
      await signOut(auth);
      setFbUser(null);
      triggerAlert('Nuvem Desconectada', 'Você saiu da sua conta Firebase Sync com sucesso.');
    } catch (error: any) {
      console.error(error);
      triggerAlert('Erro', 'Houve um erro ao tentar sair da sua conta.');
    } finally {
      setFbIsLoading(false);
    }
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
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-teal-500/10 blur-[130px] pointer-events-none -z-10 animate-pulse duration-[12s]" />
      <div className="absolute top-[45%] right-[15%] w-[35%] h-[35%] rounded-full bg-emerald-600/5 blur-[110px] pointer-events-none -z-10" />

      {/* Cyberpunk abstract tech grid overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b0b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b0b_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none -z-10" />

      {/* Centered layout for Modern Responsive Web Workspace */}
      <div className="w-full max-w-5xl flex justify-center z-10 px-2 sm:px-6 py-4 md:py-8" id="layout-grid">
        
        {/* Main Cybersecurity Web Workspace Console */}
        <div className="flex justify-center w-full" id="phone-container-wrapper">
          
          {/* Secure Web Workspace Frame - Expanded widescreen layout */}
          <div className="w-full max-w-5xl bg-[#0c0e14] border border-slate-900 rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85),0_0_50px_rgba(16,185,129,0.04)] relative overflow-hidden flex flex-col justify-between min-h-[640px] md:min-h-[760px] text-slate-100" id="smartphone-frame">
            
            {/* Top Cyan Glowing High-Tech Loading Accent Bar */}
            <div className="absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r from-emerald-500/30 via-teal-500/80 to-emerald-500/30 z-40" id="phone-status-bar" />

            {/* Main Inside Viewport wrapper */}
            <div 
              className="flex-grow pt-6 overflow-y-auto px-4 sm:px-8 bg-[#080a0f] scrollbar-none flex flex-col justify-start pb-28" 
              id="app-viewport"
            >
              
              {/* HEADER DA APLICAÇÃO */}
              {isUnlocked && (
                <div className="flex items-center justify-between py-4 border-b border-slate-900/60 mb-4" id="view-header">
                  <div className="flex items-center space-x-2.5">
                    <img
                      src={vaultLogo}
                      alt="CRYPTORAPP"
                      referrerPolicy="no-referrer"
                      className="w-9 h-9 rounded-xl object-cover shadow-[0_0_15px_rgba(16,185,129,0.3)] filter contrast-125"
                    />
                    <div className="flex flex-col items-center justify-center h-9 gap-0.5">
                      <span className="text-[11px] font-sans font-black tracking-widest text-[#10b981] uppercase leading-none">CRYPTOR</span>
                      <span className="text-[11px] font-sans font-black tracking-widest text-[#10b981] uppercase leading-none">APP</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 text-left" id="header-right-side">
                    {activeTab !== 'records' && activeTab !== 'profile' && (
                      <div className="flex flex-col items-start justify-center h-9 gap-0.5 pr-1">
                        <h2 className="text-xs font-display font-extrabold text-white leading-none tracking-tight">Cofre de Senhas</h2>
                        <span className="text-[9px] text-emerald-400 tracking-wider font-mono leading-none">ENCRYPTED VAULT LIVE</span>
                      </div>
                    )}

                    {(activeTab === 'records' || activeTab === 'profile') && (
                      <div className="flex items-center space-x-2" id="header-actions">
                        {activeTab === 'profile' && (
                          <button 
                            onClick={() => setShowSettings(true)}
                            className="p-2 bg-slate-900/60 hover:bg-slate-800 text-slate-400 hover:text-emerald-400 border border-slate-800/80 rounded-xl cursor-pointer transition flex items-center justify-center shadow-sm"
                            title="Configurações e Segurança"
                            id="settings-vault-btn"
                          >
                            <Settings className="h-4 w-4" />
                          </button>
                        )}

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
                  </div>
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
                    className="space-y-6 py-2"
                    id="setup-pane"
                  >
                    {/* CUSTOM HORIZONTAL HEADER FOR SETUP SCREEN */}
                    <div className="flex items-center justify-between py-3 border-b border-slate-900/60 mb-2" id="setup-header">
                      <div className="flex items-center space-x-2.5">
                        <img
                          src={vaultLogo}
                          alt="CRYPTORAPP"
                          referrerPolicy="no-referrer"
                          className="w-9 h-9 rounded-xl object-cover shadow-[0_0_15px_rgba(16,185,129,0.3)] filter contrast-125"
                        />
                        <div className="flex flex-col items-center justify-center h-9 gap-0.5">
                          <span className="text-[11px] font-sans font-black tracking-widest text-[#10b981] uppercase leading-none">CRYPTOR</span>
                          <span className="text-[11px] font-sans font-black tracking-widest text-[#10b981] uppercase leading-none">APP</span>
                        </div>
                      </div>

                      <div className="flex flex-col items-start justify-center h-9 gap-0.5 pr-1 text-left">
                        <h2 className="text-xs font-display font-extrabold text-white leading-none tracking-tight">Cofre de Senhas</h2>
                        <span className="text-[9px] text-emerald-400 tracking-wider font-mono leading-none">ENCRYPTED VAULT LIVE</span>
                      </div>
                    </div>

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

                        {/* Password Strength Indicator */}
                        {setupPassword && (
                          <div className="space-y-1 mt-1.5 px-1">
                            <div className="flex justify-between items-center text-[9px]">
                              <span className="text-slate-500 font-sans">Análise de Segurança:</span>
                              <span className="font-bold uppercase tracking-wider font-mono text-[10px]" style={{ color: calculatePasswordStrength(setupPassword).score <= 1 ? '#f87171' : calculatePasswordStrength(setupPassword).score === 2 ? '#fb923c' : calculatePasswordStrength(setupPassword).score === 3 ? '#facc15' : calculatePasswordStrength(setupPassword).score === 4 ? '#34d399' : '#22d3ee' }}>
                                {calculatePasswordStrength(setupPassword).label}
                              </span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-900/40">
                              <div 
                                className={`h-full ${calculatePasswordStrength(setupPassword).color} transition-all duration-300`} 
                                style={{ width: `${calculatePasswordStrength(setupPassword).percentage}%` }}
                              />
                            </div>
                          </div>
                        )}
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

                      <div className="flex flex-col space-y-2">
                        <div className="flex justify-center">
                          <button
                            type="button"
                            onClick={() => setShowSetupWarning(!showSetupWarning)}
                            className="flex items-center justify-center p-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 hover:border-amber-500/40 text-amber-400 cursor-pointer transition-all duration-200"
                            title="Clique para ver aviso de segurança importante"
                          >
                            <AlertTriangle className="h-5 w-5 shrink-0" />
                          </button>
                        </div>

                        {showSetupWarning && (
                          <motion.div 
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="p-3.5 bg-amber-500/5 border border-amber-500/15 text-amber-300 text-[10px] text-left rounded-xl space-y-1.5 leading-relaxed"
                          >
                            <span className="font-bold flex items-center text-xs tracking-wider text-amber-400 uppercase font-mono">
                              <AlertTriangle className="h-3.5 w-3.5 mr-1 text-amber-400 shrink-0" /> ATENÇÃO
                            </span>
                            Se você perder esta senha mestra, os registros armazenados no cofre estarão encriptados para sempre e não poderão ser recuperadas.
                          </motion.div>
                        )}
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
                      <div className="flex flex-col items-center gap-2">
                        <button 
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-4 py-2 bg-[#090b11] hover:bg-slate-900 border border-slate-800 text-[10px] font-bold text-slate-300 rounded-xl cursor-pointer transition inline-flex items-center space-x-1.5"
                          id="btn-import-restore-setup"
                        >
                          <Upload className="h-3 w-3 text-emerald-400" />
                          <span>Selecionar Arquivo .json</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setShowPastedImportSetup(!showPastedImportSetup)}
                          className="text-[9px] text-slate-400 hover:text-slate-300 underline font-mono cursor-pointer"
                        >
                          {showPastedImportSetup ? '✕ Ocultar colar texto' : 'Ou importar colando texto do JSON'}
                        </button>
                      </div>

                      {showPastedImportSetup && (
                        <div className="mt-2 space-y-1.5 text-left bg-[#05070a]/60 p-2.5 rounded-xl border border-slate-900">
                          <textarea
                            rows={4}
                            value={pastedJsonSetup}
                            onChange={(e) => setPastedJsonSetup(e.target.value)}
                            placeholder='Cole aqui todo o conteúdo de texto do seu arquivo .json de backup exportado...'
                            className="w-full bg-[#05070a] border border-slate-800 text-[10px] font-mono p-2 rounded-lg focus:outline-none focus:border-emerald-500/50 text-slate-300 placeholder:text-slate-600"
                          />
                          <button
                            type="button"
                            onClick={() => handleImportPastedJSON(pastedJsonSetup)}
                            className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-[10px] rounded-lg cursor-pointer transition uppercase"
                          >
                            Validar e Restaurar por Texto
                          </button>
                        </div>
                      )}

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
                      <div className="inline-block p-4.5 bg-gradient-to-tr from-emerald-500/10 to-teal-500/5 text-emerald-400 border border-emerald-500/20 rounded-2xl mb-1 shadow-[0_0_20px_rgba(16,185,129,0.05)]">
                        <Lock className="h-8 w-8 text-emerald-400 animate-pulse" />
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
                        className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-slate-950 font-mono uppercase text-xs tracking-widest font-black rounded-xl transition duration-200 cursor-pointer shadow-[0_4px_25px_-5px_rgba(16,185,129,0.3)] active:scale-[0.98] flex items-center justify-center space-x-2"
                        id="btn-login-vault"
                      >
                        <Unlock className="h-3.5 w-3.5" />
                        <span>Desbloquear Cofre</span>
                      </button>
                    </form>

                    {/* Voltar para a Criação/Inicialização se esquecer a senha do cofre importado */}
                    <div className="pt-4 border-t border-slate-900/60 text-center space-y-2 animate-fade-in">
                      <p className="text-[10px] text-slate-500 font-medium">Esqueceu a senha mestra ou quer começar de novo?</p>
                      <button 
                        type="button"
                        onClick={handleBackToSetup}
                        className="px-4 py-2 bg-[#090b11] hover:bg-slate-900 border border-slate-800 text-[10px] font-bold text-slate-300 rounded-xl cursor-pointer transition inline-flex items-center space-x-1.5"
                        id="btn-back-to-setup"
                      >
                        <ArrowLeft className="h-3 w-3 text-emerald-400" />
                        <span>Voltar / Reiniciar Configuração</span>
                      </button>
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
                      {activeTab !== 'profile' && (
                        <div className="grid grid-cols-3 gap-1 p-1 bg-[#090b11] border border-slate-800/80 rounded-xl" id="nav-tabs">
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
                        </div>
                      )}

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
                                placeholder="Insira o Registro ou Palavra-Chave..."
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

                          </div>

                          {/* DYNAMIC SEARCH RESULT WINDOW */}
                          <div className="space-y-3 pt-2" id="search-results-viewport">
                            {searchTerm.trim().length === 0 ? (
                              <div className="p-8 text-center text-slate-600 bg-[#090b11]/20 border border-slate-900 border-dashed rounded-2xl space-y-2 select-none">
                                <Search className="h-10 w-10 mx-auto opacity-20 text-emerald-400" />
                                <div className="text-xs font-semibold">Aguardando busca automatizada...</div>
                                <div className="text-[10px] text-slate-600 leading-normal">Ao digitar algo correspondente a um Registro, a senha correspondente será revelada imediatamente na tela!</div>
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
                                    
                                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Registro encontrado:</div>
                                    <div className="text-sm font-semibold text-emerald-300 leading-snug whitespace-pre-wrap">{exactMatchedRecord.question}</div>
                                    
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
                                        <div className="space-y-1.5" id="exact-match-answer-block">
                                          <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                            <span>Senha Criptografada:</span>
                                            <button
                                              type="button"
                                              onClick={() => handleCopyToClipboard(exactMatchedRecord.answer, exactMatchedRecord.id)}
                                              className="flex items-center space-x-1.5 py-0.5 px-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 hover:border-emerald-500/35 rounded-lg cursor-pointer transition text-[9px] font-mono leading-none font-bold"
                                              title="Copiar para Área de Transferência"
                                              id="copy-exact-btn"
                                            >
                                              {copiedNotification?.id === exactMatchedRecord.id ? (
                                                <>
                                                  <Check className="h-2.5 w-2.5 text-cyan-400 animate-pulse" />
                                                  <span className="text-cyan-400 font-bold">Limpa em {copiedNotification.secondsLeft}s</span>
                                                </>
                                              ) : (
                                                <>
                                                  <Copy className="h-2.5 w-2.5" />
                                                  <span>Copiar</span>
                                                </>
                                              )}
                                            </button>
                                          </div>
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
                                    <h4 className="text-[10px] text-slate-500 uppercase font-bold tracking-widest font-mono">Registros Semelhantes ("{searchTerm}")</h4>
                                    <div className="space-y-2 select-none">
                                      {matchingFuzzyRecords.map(item => (
                                        <div key={item.id} className="p-3 bg-[#090b11]/80 border border-slate-900 rounded-xl space-y-1.5 hover:border-slate-800 transition duration-200">
                                          <div className="text-xs font-semibold text-slate-300 whitespace-pre-wrap">{item.question}</div>
                                          
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
                                    <p className="text-xs text-slate-400 font-semibold">Nenhum registro correspondente no momento...</p>
                                    <p className="text-[10px] text-slate-500 max-w-[280px] mx-auto mt-1 leading-normal">Gostaria de criar um novo registro para salvar essa senha?</p>
                                    <button
                                      onClick={() => {
                                        setNewQuestion(searchTerm);
                                        setActiveTab('add');
                                      }}
                                      className="mt-2.5 text-[10px] font-bold text-emerald-400 hover:underline uppercase tracking-wider font-mono"
                                    >
                                      Criar registro para "{searchTerm}" &rarr;
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
                            <h3 className="text-xs font-mono font-bold tracking-wider text-emerald-400 uppercase">CRIAR NOVO REGISTRO</h3>
                          </div>

                          <form onSubmit={handleAddRecord} className="space-y-4">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">REGISTRO</label>
                              <textarea 
                                placeholder="Digite o nome do registro (site, serviço, conta, etc.)..."
                                value={newQuestion}
                                onChange={(e) => setNewQuestion(e.target.value)}
                                rows={3}
                                className="w-full bg-[#090b11] border border-slate-800/80 hover:border-slate-700/80 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 focus:outline-none rounded-xl px-4 py-3 text-xs text-slate-200 transition-all duration-200 shadow-inner"
                                id="new-record-question"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">SENHA</label>
                              <textarea
                                placeholder="Digite a senha protegida ou conteúdo secreto..."
                                value={newAnswer}
                                onChange={(e) => setNewAnswer(e.target.value)}
                                rows={3}
                                className="w-full bg-[#090b11] border border-slate-800/80 hover:border-slate-700/80 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 focus:outline-none rounded-xl px-4 py-3 text-xs text-slate-200 transition-all duration-200 shadow-inner"
                                id="new-record-answer"
                              />
                            </div>

                            {/* COLLAPSIBLE PASSWORD GENERATOR WIDGET */}
                            <div className="space-y-2 p-3 bg-[#090b11]/50 border border-slate-900/85 rounded-xl hover:border-slate-800/80 transition shadow-inner">
                              <button
                                type="button"
                                onClick={() => {
                                  setShowGenerator(!showGenerator);
                                  if (!showGenerator) {
                                    generateSecurePassword();
                                  }
                                }}
                                className="w-full flex items-center justify-between text-left text-slate-300 hover:text-white transition cursor-pointer"
                                id="toggle-generator-btn"
                              >
                                <div className="flex items-center space-x-2 text-[10.5px] font-bold uppercase tracking-wider font-sans">
                                  <KeyRound className="h-3.5 w-3.5 text-emerald-400" />
                                  <span>Gerador de Senhas Seguras</span>
                                </div>
                                <span className="text-[10px] text-slate-500 font-mono font-bold">
                                  {showGenerator ? 'OCULTAR ↑' : 'EXPANDIR ↓'}
                                </span>
                              </button>

                              {showGenerator && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                  className="pt-2 space-y-3 border-t border-slate-950/60 mt-1 pb-1"
                                  id="password-generator-controls"
                                >
                                  {/* RESULT VISUAL CONTAINER */}
                                  <div className="space-y-1">
                                    <div className="text-[9px] text-slate-500 font-mono uppercase tracking-widest font-bold">Senha Gerada:</div>
                                    <div className="relative flex items-center bg-slate-950/70 border border-slate-900/60 p-2.5 rounded-xl font-mono text-xs text-cyan-400 select-all break-all leading-normal text-center min-h-[36px] shadow-inner font-bold pr-10">
                                      {genResult || 'Selecione pelo menos uma opção'}
                                      
                                      {genResult && (
                                        <button
                                          type="button"
                                          onClick={() => handleCopyToClipboard(genResult, 'genResult')}
                                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-white rounded-lg transition"
                                          title="Copiar para clipboard"
                                        >
                                          {copiedNotification?.id === 'genResult' ? (
                                            <Check className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
                                          ) : (
                                            <Copy className="h-3.5 w-3.5" />
                                          )}
                                        </button>
                                      )}
                                    </div>
                                    
                                    {copiedNotification?.id === 'genResult' && (
                                      <p className="text-[8.5px] text-cyan-400 font-mono uppercase tracking-wider text-right pr-1">
                                        ✓ Copiado! Clipboard apaga em {copiedNotification.secondsLeft}s
                                      </p>
                                    )}
                                  </div>

                                  {/* SLIDER FOR LENGTH */}
                                  <div className="space-y-1">
                                    <div className="flex justify-between items-center text-[9.5px]">
                                      <span className="text-slate-400 uppercase tracking-widest font-bold">Comprimento da Senha</span>
                                      <span className="font-mono text-emerald-400 font-bold">{genLength} caracteres</span>
                                    </div>
                                    <input 
                                      type="range"
                                      min={8}
                                      max={64}
                                      value={genLength}
                                      onChange={(e) => setGenLength(parseInt(e.target.value))}
                                      className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-slate-950 rounded-lg appearance-none"
                                    />
                                  </div>

                                  {/* CONFIG CHECKBOX OPTIONS */}
                                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                                    <label className="flex items-center space-x-2 bg-slate-950/45 p-1.5 rounded-md border border-slate-950 cursor-pointer text-slate-300 hover:text-white hover:bg-slate-950/60">
                                      <input 
                                        type="checkbox"
                                        checked={genUpper}
                                        onChange={(e) => setGenUpper(e.target.checked)}
                                        className="rounded border-slate-800 bg-[#090b11] text-emerald-500 focus:ring-0 cursor-pointer h-3.5 w-3.5"
                                      />
                                      <span className="font-sans leading-none font-bold">A-Z (Maiúsculas)</span>
                                    </label>

                                    <label className="flex items-center space-x-2 bg-slate-950/45 p-1.5 rounded-md border border-slate-950 cursor-pointer text-slate-300 hover:text-white hover:bg-slate-950/60">
                                      <input 
                                        type="checkbox"
                                        checked={genLower}
                                        onChange={(e) => setGenLower(e.target.checked)}
                                        className="rounded border-slate-800 bg-[#090b11] text-emerald-500 focus:ring-0 cursor-pointer h-3.5 w-3.5"
                                      />
                                      <span className="font-sans leading-none font-bold">a-z (Minúsculas)</span>
                                    </label>

                                    <label className="flex items-center space-x-2 bg-slate-950/45 p-1.5 rounded-md border border-slate-950 cursor-pointer text-slate-300 hover:text-white hover:bg-slate-950/60">
                                      <input 
                                        type="checkbox"
                                        checked={genNumbers}
                                        onChange={(e) => setGenNumbers(e.target.checked)}
                                        className="rounded border-slate-800 bg-[#090b11] text-emerald-500 focus:ring-0 cursor-pointer h-3.5 w-3.5"
                                      />
                                      <span className="font-sans leading-none font-bold">0-9 (Algarismos)</span>
                                    </label>

                                    <label className="flex items-center space-x-2 bg-slate-950/45 p-1.5 rounded-md border border-slate-950 cursor-pointer text-slate-300 hover:text-white hover:bg-slate-950/60">
                                      <input 
                                        type="checkbox"
                                        checked={genSymbols}
                                        onChange={(e) => setGenSymbols(e.target.checked)}
                                        className="rounded border-slate-800 bg-[#090b11] text-emerald-500 focus:ring-0 cursor-pointer h-3.5 w-3.5"
                                      />
                                      <span className="font-sans leading-none font-bold">@#$ (Especiais)</span>
                                    </label>
                                  </div>

                                  {/* APPLY TO FORM RESPONSE BUTTON */}
                                  {genResult && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setNewAnswer(genResult);
                                        setShowGenerator(false);
                                      }}
                                      className="w-full py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 text-emerald-400 rounded-lg text-[10px] font-sans font-bold uppercase cursor-pointer transition select-none flex items-center justify-center space-x-1"
                                    >
                                      <span>✓ Usar como Senha</span>
                                    </button>
                                  )}
                                </motion.div>
                              )}
                            </div>

                            <div className="p-3 bg-[#090b11]/80 border border-slate-800/80 rounded-xl shadow-inner">
                              <div className="flex items-center space-x-2.5">
                                <input 
                                  type="checkbox"
                                  id="req-pass-checkbox"
                                  checked={requirePasswordToReveal}
                                  onChange={(e) => setRequirePasswordToReveal(e.target.checked)}
                                  className="rounded border-slate-800 bg-[#090b11] text-emerald-500 focus:ring-0 cursor-pointer h-4 w-4"
                                />
                                <label htmlFor="req-pass-checkbox" className="text-xs font-bold text-slate-200 cursor-pointer leading-none">
                                  Exigir senha mestra
                                </label>
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
                              <span>Salvar Registro Encriptado</span>
                            </button>
                          </form>
                        </div>
                      )}

                      {/* TAB 3: KEY VAULT RECORD LIST MANAGER */}
                      {activeTab === 'records' && (
                        <div className="space-y-4 text-left" id="tab-records">
                          <div className="flex justify-between items-center bg-[#090b11]/40 p-2 rounded-xl border border-slate-900/40">
                            <div>
                              <h3 className="text-xs font-mono font-bold tracking-wider text-emerald-400 uppercase">Todos os Registros Armazenados</h3>
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
                              <p className="text-[10px] text-slate-600 max-w-[240px] mx-auto leading-normal">Selecione "+ Novo" acima para cadastrar seus registros e senhas e testar a criptografia!</p>
                            </div>
                          ) : (
                            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1" id="records-overflow">
                              {decryptedRecords.map(item => {
                                const isLocked = item.requireMasterPasswordToReveal && !revealedSecureRecords[item.id];
                                const isRevealed = revealedInCofre[item.id];
                                return (
                                  <div key={item.id} className="p-3.5 bg-[#090b11] border border-slate-900 rounded-xl space-y-1.5 relative hover:border-slate-800/60 transition-all duration-200 shadow-md">
                                    <div className="flex items-start justify-between pr-8">
                                      <div className="space-y-0.5">
                                        <div className="text-xs font-bold text-slate-200 select-all whitespace-pre-wrap">{item.question}</div>
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
                                      {isRevealed && !isLocked ? (
                                        <div className="space-y-2">
                                          <div className="text-emerald-300 font-mono text-[11px] whitespace-pre-wrap select-all break-all leading-normal bg-emerald-950/5 p-2 rounded-lg border border-emerald-950/15 shadow-inner">
                                            {item.answer}
                                          </div>
                                          <div className="flex items-center justify-between pt-0.5">
                                            <button
                                              onClick={() => handleCopyToClipboard(item.answer, item.id)}
                                              className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 font-mono uppercase tracking-wider flex items-center space-x-1 cursor-pointer"
                                              title="Copiar Senha"
                                              id={`copy-cofre-${item.id}`}
                                            >
                                              {copiedNotification?.id === item.id ? (
                                                <>
                                                  <Check className="h-3 w-3 text-cyan-400 animate-pulse" />
                                                  <span className="text-cyan-400 font-bold">Limpa em {copiedNotification.secondsLeft}s</span>
                                                </>
                                              ) : (
                                                <>
                                                  <Copy className="h-3 w-3" />
                                                  <span>Copiar</span>
                                                </>
                                              )}
                                            </button>

                                            <button
                                              onClick={() => {
                                                setRevealedInCofre(prev => ({ ...prev, [item.id]: false }));
                                                if (item.requireMasterPasswordToReveal) {
                                                  setRevealedSecureRecords(prev => ({ ...prev, [item.id]: false }));
                                                }
                                              }}
                                              className="text-[10px] font-bold text-red-400 hover:text-red-300 font-mono uppercase tracking-widest flex items-center space-x-1 cursor-pointer"
                                            >
                                              <EyeOff className="h-3 w-3" />
                                              <span>Ocultar</span>
                                            </button>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="flex items-center justify-between">
                                          <div className="text-[10px] text-slate-500 italic flex items-center font-medium font-mono uppercase tracking-wider">
                                            {isLocked ? (
                                              <>
                                                <Lock className="h-2.5 w-2.5 mr-1 text-amber-500" /> Requer senha
                                              </>
                                            ) : (
                                              <>
                                                <EyeOff className="h-2.5 w-2.5 mr-1" /> Oculto
                                              </>
                                            )}
                                          </div>
                                          <button
                                            onClick={() => {
                                              if (isLocked) {
                                                setActiveChallengeRecordId(item.id);
                                                setChallengePassword('');
                                                setChallengeError('');
                                              } else {
                                                setRevealedInCofre(prev => ({ ...prev, [item.id]: true }));
                                              }
                                            }}
                                            className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 font-mono uppercase tracking-widest cursor-pointer"
                                          >
                                            Revelar
                                          </button>
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
                        </div>
                      )}

                      {/* TAB 4: ALTERAR SENHA MESTRA */}
                      {activeTab === 'profile' && (
                        <div className="space-y-4 text-left animate-fade-in pb-12" id="tab-profile">
                          <div className="flex justify-between items-center bg-[#090b11]/40 p-3 rounded-xl border border-slate-900/40">
                            <div>
                              <h3 className="text-xs font-sans font-bold tracking-wider text-emerald-400 uppercase">Segurança</h3>
                              <p className="text-[9px] text-slate-400 font-semibold leading-tight font-sans">Alteração da Senha Mestra</p>
                            </div>
                            <span className="text-[8px] px-2 py-0.5 bg-[#090b11] border border-slate-800/80 text-emerald-400 rounded-full font-mono font-bold">
                              LOCAL
                            </span>
                          </div>

                          {/* Change Master Password form */}
                          <div className="space-y-3.5 p-3.5 bg-[#090b11]/80 border border-slate-900 rounded-xl text-left shadow-md">
                            <h4 className="text-xs font-bold text-white font-sans flex items-center gap-1.5 uppercase tracking-wider text-emerald-400">
                              <KeyRound className="h-4 w-4 text-emerald-400" />
                              <span>Alterar Senha Mestra</span>
                            </h4>
                            <p className="text-[10px] text-slate-400 leading-relaxed font-sans">
                              Ao alterar sua Senha Mestra, todos os seus registros armazenados localmente serão descriptografados com a senha atual e criptografados novamente com a nova senha.
                            </p>

                            <form onSubmit={handleChangeMasterPassword} className="space-y-3 pt-1">
                              <div>
                                <label className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-400 block mb-1">
                                  Senha Mestra Atual
                                </label>
                                <input
                                  type="password"
                                  required
                                  value={currentMasterPassword}
                                  onChange={(e) => setCurrentMasterPassword(e.target.value)}
                                  placeholder="Digite sua senha mestra atual"
                                  className="w-full bg-[#05070a] border border-slate-900 text-slate-200 text-[11px] p-2.5 rounded-lg focus:outline-none focus:border-emerald-500/40"
                                />
                              </div>

                              <div>
                                <label className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-400 block mb-1">
                                  Nova Senha Mestra
                                </label>
                                <input
                                  type="password"
                                  required
                                  value={newMasterPassword}
                                  onChange={(e) => setNewMasterPassword(e.target.value)}
                                  placeholder="Digite a nova senha mestra (mín. 6 caracteres)"
                                  className="w-full bg-[#05070a] border border-slate-900 text-slate-200 text-[11px] p-2.5 rounded-lg focus:outline-none focus:border-emerald-500/40"
                                />
                              </div>

                              <div>
                                <label className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-400 block mb-1">
                                  Confirmar Nova Senha Mestra
                                </label>
                                <input
                                  type="password"
                                  required
                                  value={confirmNewMasterPassword}
                                  onChange={(e) => setConfirmNewMasterPassword(e.target.value)}
                                  placeholder="Repita a nova senha mestra"
                                  className="w-full bg-[#05070a] border border-slate-900 text-slate-200 text-[11px] p-2.5 rounded-lg focus:outline-none focus:border-emerald-500/40"
                                />
                              </div>

                              {changePasswordError && (
                                <div className="p-2.5 bg-red-950/20 border border-red-500/30 text-red-400 text-[10px] rounded-lg text-center font-sans">
                                  {changePasswordError}
                                </div>
                              )}

                              {changePasswordSuccess && (
                                <div className="p-2.5 bg-emerald-950/20 border border-emerald-500/30 text-emerald-400 text-[10px] rounded-lg text-center font-sans">
                                  {changePasswordSuccess}
                                </div>
                              )}

                              <button
                                type="submit"
                                disabled={isChangingPassword}
                                className="w-full py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-50 text-slate-950 text-[10px] font-mono font-bold uppercase tracking-wider rounded-lg transition flex items-center justify-center space-x-1.5 shadow-md cursor-pointer"
                              >
                                {isChangingPassword ? (
                                  <RefreshCw className="h-3 w-3 animate-spin text-slate-950" />
                                ) : (
                                  <KeyRound className="h-3 w-3 text-slate-950" />
                                )}
                                <span>Atualizar Senha Mestra</span>
                              </button>
                            </form>
                          </div>
                        </div>
                      )}

                    </div>



                  </motion.div>
                )}

              </AnimatePresence>
            </div>
            
            {/* Elegant Modern Web Console Navigation Bar */}
            {isUnlocked && (
              <div 
                className="absolute bottom-0 inset-x-0 bg-[#090c13]/98 flex flex-col justify-between border-t border-slate-900/80 select-none text-slate-500 py-3.5 shadow-[0_-8px_30px_rgba(0,0,0,0.7)] z-40 transition-all duration-300"
                id="android-nav-bar"
              >
                <div className="flex items-center justify-around w-full max-w-2xl mx-auto px-4" id="nav-buttons-container">
                  <button 
                    onClick={() => {
                      if(isUnlocked) {
                        setActiveTab('search');
                      }
                    }}
                    className={`flex flex-col items-center justify-center transition-all duration-200 cursor-pointer ${activeTab === 'search' && isUnlocked ? 'text-emerald-400 font-extrabold scale-105' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    <Search className="h-4.5 w-4.5 text-inherit" />
                    <span className="text-[9.5px] font-mono tracking-widest uppercase mt-1">Buscar</span>
                  </button>
                  
                  <button 
                    onClick={() => {
                      if(isUnlocked) {
                        setActiveTab('add');
                      }
                    }}
                    className={`flex flex-col items-center justify-center transition-all duration-200 cursor-pointer ${activeTab === 'add' && isUnlocked ? 'text-emerald-400 font-extrabold scale-105' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    <Plus className="h-4.5 w-4.5 text-inherit" />
                    <span className="text-[9.5px] font-mono tracking-widest uppercase mt-1">Adicionar</span>
                  </button>

                  <button 
                    onClick={() => {
                      if(isUnlocked) {
                        setActiveTab('records');
                      }
                    }}
                    className={`flex flex-col items-center justify-center transition-all duration-200 cursor-pointer ${activeTab === 'records' && isUnlocked ? 'text-emerald-400 font-extrabold scale-105' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    <Database className="h-4.5 w-4.5 text-inherit" />
                    <span className="text-[9.5px] font-mono tracking-widest uppercase mt-1">Cofre</span>
                  </button>

                  <button 
                    onClick={() => {
                      if(isUnlocked) {
                        setActiveTab('profile');
                      }
                    }}
                    className={`flex flex-col items-center justify-center transition-all duration-200 cursor-pointer ${activeTab === 'profile' && isUnlocked ? 'text-emerald-400 font-extrabold scale-105' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    <User className="h-4.5 w-4.5 text-inherit" />
                    <span className="text-[9.5px] font-mono tracking-widest uppercase mt-1">Perfil</span>
                  </button>
                </div>

                <div className="w-full text-center pt-2.5 border-t border-slate-900/60 mt-2" id="nav-footer-text">
                  <span className="text-[8.5px] text-slate-500 font-semibold font-mono uppercase tracking-wider block">
                    Sua privacidade é inegociável • Dados E2E 256 bits • Criptografia em cliente Zero-Knowledge
                  </span>
                </div>
              </div>
            )}

            {/* SETTINGS AND SECURITY OVERLAY PANEL */}
            <AnimatePresence>
              {isUnlocked && showSettings && (
                <motion.div 
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 28, stiffness: 240 }}
                  className="absolute inset-0 bg-[#080a0f] z-50 flex flex-col pt-4 pb-4 px-2 sm:px-4 rounded-3xl"
                  id="settings-overlay-panel"
                >
                  {/* HEADER */}
                  <div className="flex items-center justify-between px-4.5 py-4 border-b border-slate-900/60" id="settings-header">
                    <div className="flex items-center space-x-2.5">
                      <div className="p-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl">
                        <Settings className="h-4 w-4 animate-[spin_8s_linear_infinite]" />
                      </div>
                      <div>
                        <h2 className="text-xs font-display font-extrabold text-white leading-none tracking-tight">Configurações e Segurança</h2>
                        <span className="text-[9px] text-emerald-400 tracking-wider font-mono">RECURSOS DE SEGURANÇA</span>
                      </div>
                    </div>
                    
                    <button 
                      onClick={() => setShowSettings(false)}
                      className="p-1.5 bg-slate-900/60 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800/80 rounded-xl cursor-pointer transition flex items-center justify-center shadow-sm"
                      title="Fechar Configurações"
                      id="close-settings-btn"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* BODY CONTENT - Scrollable */}
                  <div className="flex-grow overflow-y-auto px-4.5 py-4 space-y-5 scrollbar-none" id="settings-body">
                    
                    {/* CARD 1: JSON BACKUP MANAGEMENT */}
                    <div className="space-y-2" id="json-backup-section">
                      <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Backup Local</div>
                      <div className="grid grid-cols-2 gap-2">
                        {/* EXPORT BUTTON */}
                        <button
                          onClick={handleExportBackup}
                          className="py-2.5 bg-[#090b11] hover:bg-slate-900 text-slate-300 text-[10px] border border-slate-800/80 rounded-xl cursor-pointer transition flex items-center justify-center space-x-1.5 font-bold shadow-sm w-full"
                          id="settings-export-btn"
                        >
                          <Download className="h-3.5 w-3.5 text-emerald-400" />
                          <span>Exportar JSON</span>
                        </button>

                        {/* IMPORT BUTTON */}
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="py-2.5 bg-[#090b11] hover:bg-slate-900 text-slate-300 text-[10px] border border-slate-800/80 rounded-xl cursor-pointer transition flex items-center justify-center space-x-1.5 font-bold shadow-sm w-full"
                          id="settings-import-btn"
                        >
                          <Upload className="h-3.5 w-3.5 text-blue-400" />
                          <span>Importar JSON</span>
                        </button>
                      </div>

                      <div className="text-center pt-1">
                        <button
                          type="button"
                          onClick={() => setShowPastedImportSettings(!showPastedImportSettings)}
                          className="text-[9px] text-slate-400 hover:text-slate-300 underline font-mono cursor-pointer"
                        >
                          {showPastedImportSettings ? '✕ Ocultar colar texto' : 'Ou restaurar colando o texto do JSON'}
                        </button>
                      </div>

                      {showPastedImportSettings && (
                        <div className="space-y-1.5 pt-1.5 text-left bg-[#05070a]/60 p-2.5 rounded-xl border border-slate-900 animate-fade-in">
                          <textarea
                            rows={4}
                            value={pastedJsonSettings}
                            onChange={(e) => setPastedJsonSettings(e.target.value)}
                            placeholder='Cole aqui todo o conteúdo de texto do seu arquivo .json de backup exportado...'
                            className="w-full bg-[#05070a] border border-slate-800 text-[10px] font-mono p-2 rounded-lg focus:outline-none focus:border-emerald-500/50 text-slate-300 placeholder:text-slate-600"
                          />
                          <button
                            type="button"
                            onClick={() => handleImportPastedJSON(pastedJsonSettings)}
                            className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-[10px] rounded-lg cursor-pointer transition uppercase"
                          >
                            Validar e Restaurar por Texto
                          </button>
                        </div>
                      )}
                    </div>

                    {/* CARD 2: GOOGLE DRIVE CLOUD BACKUP */}
                    <div className="space-y-2.5" id="gdrive-backup-section">
                      <div 
                        onClick={() => setGdriveCollapsed(!gdriveCollapsed)}
                        className="flex items-center justify-between p-3 bg-[#090b11]/80 hover:bg-slate-900 border border-slate-900/80 rounded-xl cursor-pointer transition duration-150 select-none"
                      >
                        <div className="text-[10px] uppercase font-bold text-slate-300 tracking-wider flex items-center space-x-1.5 flex-wrap gap-1 font-sans">
                          <Cloud className={`h-3.5 w-3.5 ${gdriveAccessToken ? 'text-emerald-400' : 'text-slate-500'}`} />
                          <span>Backup na Nuvem (Google Drive)</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          {gdriveAccessToken ? (
                            <span className="text-[9px] text-emerald-400 bg-emerald-950/30 px-2 py-0.5 rounded-full border border-emerald-900/30 font-semibold font-mono animate-pulse">
                              Conectado
                            </span>
                          ) : (
                            <span className="text-[9px] text-slate-500 bg-slate-950/40 px-2 py-0.5 rounded-full border border-slate-900/60 font-semibold font-mono font-bold">
                              Desconectado
                            </span>
                          )}
                          {gdriveCollapsed ? (
                            <ChevronDown className="h-4 w-4 text-slate-500" />
                          ) : (
                            <ChevronUp className="h-4 w-4 text-emerald-400" />
                          )}
                        </div>
                      </div>

                      {/* GDrive status info / instructions */}
                      {!gdriveCollapsed && (
                        <div className="space-y-2.5 animate-fade-in">
                          {gdriveAccessToken ? (
                            <div className="bg-[#090b11]/60 border border-emerald-950/20 p-3 rounded-xl space-y-2.5 text-left">
                              <div className="flex justify-between items-start">
                                <div>
                                  <div className="text-[10px] text-slate-400">Conta conectada:</div>
                                  <div className="text-xs font-semibold text-emerald-300 font-mono select-all truncate max-w-[180px]">{gdriveUserEmail}</div>
                                </div>
                                <button 
                                  onClick={handleDisconnectGDrive}
                                  className="text-[9px] font-bold text-red-400 hover:underline hover:text-red-300 uppercase tracking-wider font-mono flex items-center space-x-1 cursor-pointer"
                                >
                                  <span>Desconectar</span>
                                </button>
                              </div>

                              {gdriveLastSync && (
                                <div className="text-[9px] text-slate-500 font-mono">
                                  Último Sincronismo: <span className="text-slate-400 font-semibold">{gdriveLastSync}</span>
                                </div>
                              )}

                              {gdriveIsSyncing && gdriveStatusMessage && (
                                <div className="text-[10px] text-emerald-400 font-mono flex items-center space-x-1.5 animate-pulse bg-emerald-950/10 p-1.5 rounded-lg border border-emerald-900/10">
                                  <RefreshCw className="h-3 w-3 animate-spin text-emerald-400" />
                                  <span>{gdriveStatusMessage}</span>
                                </div>
                              )}

                              <div className="grid grid-cols-2 gap-2 pt-1">
                                <button
                                  onClick={handleGDriveBackup}
                                  disabled={gdriveIsSyncing}
                                  className="py-2.5 bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/20 text-emerald-400 text-[10px] rounded-lg font-bold transition flex items-center justify-center space-x-1 disabled:opacity-50 cursor-pointer text-center"
                                >
                                  <RefreshCw className={`h-3 w-3 ${gdriveIsSyncing ? 'animate-spin' : ''}`} />
                                  <span>Salvar Nuvem</span>
                                </button>
                                <button
                                  onClick={handleGDriveRestore}
                                  disabled={gdriveIsSyncing}
                                  className="py-2.5 bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/20 text-blue-400 text-[10px] rounded-lg font-bold transition flex items-center justify-center space-x-1 disabled:opacity-50 cursor-pointer text-center"
                                >
                                  <Download className="h-3 w-3" />
                                  <span>Baixar Nuvem</span>
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="p-3 bg-[#090b11]/60 border border-slate-900 rounded-xl space-y-3 text-left">
                              <p className="text-[10px] text-slate-400 leading-relaxed font-sans">
                                Salve e sincronize seus dados criptografados AES-256 com segurança de ponta-a-ponta na sua conta Google Drive pessoal.
                              </p>

                              {Capacitor.isNativePlatform() && (
                                <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px] rounded-xl font-sans leading-relaxed mb-3">
                                  ⚠️ <strong>Aviso do App Instalado (APK):</strong> O login do Google Drive necessita de popups do navegador e não é suportado no aplicativo móvel. Por favor, utilize o <strong>Firebase Cloud Sync (E-mail e Senha)</strong> logo abaixo, que é 100% suportado e sincroniza em tempo real!
                                </div>
                              )}

                              <button
                                onClick={() => handleConnectGDrive()}
                                disabled={Capacitor.isNativePlatform()}
                                className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:hover:bg-emerald-500 disabled:cursor-not-allowed text-slate-950 text-[10.5px] rounded-lg font-extrabold transition flex items-center justify-center space-x-1.5 shadow-md cursor-pointer"
                              >
                                <Cloud className="h-3.5 w-3.5" />
                                <span>{Capacitor.isNativePlatform() ? 'Indisponível no APK' : 'Autenticar & Conectar'}</span>
                              </button>

                              <div className="pt-1.5 border-t border-slate-900/60">
                                <button
                                  onClick={() => setShowGDriveClientSetup(!showGDriveClientSetup)}
                                  className="w-full text-center text-[9px] text-slate-500 hover:text-slate-400 uppercase font-bold tracking-wider font-mono py-1 cursor-pointer"
                                >
                                  {showGDriveClientSetup ? 'Ocultar ID do Cliente Google ✕' : 'Ver ID do Cliente Google &rarr;'}
                                </button>

                                {showGDriveClientSetup && (
                                  <motion.div 
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    className="space-y-2 pt-2 text-left"
                                  >
                                    <div className="space-y-1">
                                      <label className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-400 block mb-1">
                                        Google OAuth 2.0 Client ID
                                      </label>
                                      <input
                                        type="text"
                                        value={gdriveClientId}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setGdriveClientId(val);
                                          localStorage.setItem('secure_google_client_id', val);
                                        }}
                                        placeholder="Ex: 749364...apps.googleusercontent.com"
                                        className="w-full bg-[#05070a] border border-slate-900 text-slate-300 text-[10px] font-mono p-1.5 rounded-lg focus:outline-none focus:border-slate-800"
                                      />
                                    </div>
                                    <p className="text-[9px] text-slate-500 leading-normal font-sans">
                                      Usamos o escopo seguro e restrito <span className="font-mono text-slate-400 font-semibold bg-slate-950/65 px-1.5 py-0.5 rounded border border-slate-900">drive.file</span>. O backup fica completamente restrito a esta sessão de usuário, sem qualquer acesso amplo ou invasivo aos seus demais arquivos particulares.
                                    </p>
                                  </motion.div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* CARD 3: FIREBASE CLOUD SYNC */}
                    <div className="space-y-2.5" id="firebase-sync-section">
                      <div 
                        onClick={() => setFirebaseCollapsed(!firebaseCollapsed)}
                        className="flex items-center justify-between p-3 bg-[#090b11]/80 hover:bg-slate-900 border border-slate-900/80 rounded-xl cursor-pointer transition duration-150 select-none"
                      >
                        <div className="text-[10px] uppercase font-bold text-slate-300 tracking-wider flex items-center space-x-1.5 flex-wrap gap-1 font-sans">
                          <Cloud className={`h-4 w-4 ${fbUser ? 'text-emerald-400' : 'text-slate-500'}`} />
                          <span>Backup na Nuvem (Firebase)</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          {fbUser ? (
                            <span className="text-[9px] text-emerald-400 bg-emerald-950/30 px-2 py-0.5 rounded-full border border-emerald-900/30 font-semibold font-mono animate-pulse">
                              Conectado
                            </span>
                          ) : (
                            <span className="text-[9px] text-slate-500 bg-slate-950/40 px-2 py-0.5 rounded-full border border-slate-900/60 font-semibold font-mono font-bold">
                              Desconectado
                            </span>
                          )}
                          {firebaseCollapsed ? (
                            <ChevronDown className="h-4 w-4 text-slate-500" />
                          ) : (
                            <ChevronUp className="h-4 w-4 text-emerald-400" />
                          )}
                        </div>
                      </div>

                      {/* Firebase sync panel */}
                      {!firebaseCollapsed && (
                        <div className="space-y-2.5 animate-fade-in">
                          {fbUser ? (
                            <div className="bg-[#090b11]/60 border border-emerald-950/20 p-3 rounded-xl space-y-2.5 text-left">
                              <div className="flex justify-between items-start">
                                <div>
                                  <div className="text-[10px] text-slate-400">Conta sincronizada:</div>
                                  <div className="text-xs font-semibold text-emerald-300 font-mono select-all truncate max-w-[180px]">{fbUser.email}</div>
                                </div>
                                <button 
                                  onClick={handleFbLogout}
                                  disabled={fbIsLoading}
                                  className="text-[9px] font-bold text-red-400 hover:underline hover:text-red-300 uppercase tracking-wider font-mono flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                                >
                                  <span>Sair</span>
                                </button>
                              </div>

                              {fbLastSync && (
                                <div className="text-[9px] text-slate-500 font-mono">
                                  Último Sincronismo: <span className="text-slate-400 font-semibold">{fbLastSync}</span>
                                </div>
                              )}

                              {fbIsLoading && (
                                <div className="text-[10px] text-emerald-400 font-mono flex items-center space-x-1.5 animate-pulse bg-emerald-950/10 p-1.5 rounded-lg border border-emerald-900/10">
                                  <RefreshCw className="h-3 w-3 animate-spin text-emerald-400" />
                                  <span>Sincronizando dados com Firebase...</span>
                                </div>
                              )}

                              <div className="grid grid-cols-2 gap-2 pt-1">
                                <button
                                  onClick={handleFbBackup}
                                  disabled={fbIsLoading}
                                  className="py-2.5 bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/20 text-emerald-400 text-[10px] rounded-lg font-bold transition flex items-center justify-center space-x-1 disabled:opacity-50 cursor-pointer text-center"
                                >
                                  <RefreshCw className={`h-3 w-3 ${fbIsLoading ? 'animate-spin' : ''}`} />
                                  <span>Salvar Nuvem</span>
                                </button>
                                <button
                                  onClick={handleFbRestore}
                                  disabled={fbIsLoading}
                                  className="py-2.5 bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/20 text-blue-400 text-[10px] rounded-lg font-bold transition flex items-center justify-center space-x-1 disabled:opacity-50 cursor-pointer text-center"
                                >
                                  <Download className="h-3 w-3" />
                                  <span>Baixar Nuvem</span>
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="p-3 bg-[#090b11]/60 border border-slate-900 rounded-xl space-y-3 text-left">
                              <p className="text-[10px] text-slate-400 leading-relaxed font-sans">
                                Crie sua conta ou faça login para sincronizar e salvar com segurança o seu cofre end-to-end criptografado (AES-256) na nuvem do Firebase.
                              </p>

                              <form onSubmit={fbMode === 'login' ? handleFbLogin : handleFbRegister} className="space-y-3">
                                <div className="space-y-2">
                                  <div>
                                    <label className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-400 block mb-1">
                                      E-mail
                                    </label>
                                    <input
                                      type="email"
                                      required
                                      value={fbEmail}
                                      onChange={(e) => setFbEmail(e.target.value)}
                                      placeholder="Digite seu e-mail"
                                      className="w-full bg-[#05070a] border border-slate-900 text-slate-300 text-[11px] p-2 rounded-lg focus:outline-none focus:border-slate-800"
                                    />
                                  </div>

                                  <div>
                                    <label className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-400 block mb-1">
                                      Senha do Firebase Sync
                                    </label>
                                    <input
                                      type="password"
                                      required
                                      value={fbPassword}
                                      onChange={(e) => setFbPassword(e.target.value)}
                                      placeholder="Ao menos 6 caracteres"
                                      className="w-full bg-[#05070a] border border-slate-900 text-slate-300 text-[11px] p-2 rounded-lg focus:outline-none focus:border-slate-800"
                                    />
                                  </div>
                                </div>

                                <button
                                  type="submit"
                                  disabled={fbIsLoading}
                                  className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 text-[10.5px] rounded-lg font-extrabold transition flex items-center justify-center space-x-1.5 shadow-md cursor-pointer"
                                >
                                  {fbIsLoading ? (
                                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Cloud className="h-3.5 w-3.5" />
                                  )}
                                  <span>{fbMode === 'login' ? 'Entrar & Sincronizar' : 'Criar Conta & Sincronizar'}</span>
                                </button>
                              </form>

                              {!Capacitor.isNativePlatform() ? (
                                <>
                                  <div className="relative my-3">
                                    <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                      <div className="w-full border-t border-slate-900"></div>
                                    </div>
                                    <div className="relative flex justify-center text-xs uppercase font-mono">
                                      <span className="bg-[#0b0e14] px-2 text-slate-500 font-semibold text-[9px]">ou use</span>
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={handleGoogleSignIn}
                                    disabled={fbIsLoading}
                                    className="w-full py-2 bg-[#05070a] hover:bg-slate-950/80 border border-slate-900 hover:border-slate-800 text-slate-200 text-[10.5px] rounded-lg font-bold transition flex items-center justify-center space-x-2 shadow-sm cursor-pointer disabled:opacity-50"
                                  >
                                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24">
                                      <path
                                        fill="currentColor"
                                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                      />
                                      <path
                                        fill="currentColor"
                                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                      />
                                      <path
                                        fill="currentColor"
                                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z"
                                      />
                                      <path
                                        fill="currentColor"
                                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z"
                                      />
                                    </svg>
                                    <span>Entrar com o Google</span>
                                  </button>
                                </>
                              ) : (
                                <div className="p-2.5 bg-emerald-950/15 border border-emerald-900/20 text-emerald-400 text-[10px] rounded-lg text-center leading-relaxed font-mono">
                                  ✓ Sincronização em nuvem via E-mail &amp; Senha 100% ativa e segura no app!
                                </div>
                              )}

                              <div className="text-center pt-2.5 border-t border-slate-900 flex items-center justify-center space-x-2 text-[9.5px] text-slate-400">
                                <span>{fbMode === 'login' ? 'Não possui conta?' : 'Já possui conta?'}</span>
                                <button
                                  type="button"
                                  onClick={() => setFbMode(fbMode === 'login' ? 'register' : 'login')}
                                  className="font-bold text-emerald-400 hover:underline uppercase tracking-wider font-mono cursor-pointer"
                                >
                                  {fbMode === 'login' ? 'Cadastrar' : 'Entrar'}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>



                    {/* CARD: CONFIGURAÇÕES GLOBAIS DE SEGURANÇA */}
                    <div className="space-y-3 p-3.5 bg-[#090b11]/80 border border-slate-900 rounded-xl text-left" id="global-security-settings-section">
                      <div className="flex items-center space-x-1.5 uppercase font-bold text-slate-400 text-[10px] tracking-wider font-sans">
                        <Shield className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
                        <span>Parâmetros de Segurança Avançada</span>
                      </div>

                      <div className="space-y-4 pt-1">
                        {/* Auto Lock Timeout Select */}
                        <div className="space-y-1">
                          <label className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-400 block">
                            Auto-Bloqueio por Inatividade
                          </label>
                          <select
                            value={autoLockTimeout}
                            onChange={(e) => {
                              const val = e.target.value;
                              setAutoLockTimeout(val);
                              localStorage.setItem('secure_autolock_timeout', val);
                            }}
                            className="w-full bg-[#05070a] border border-slate-900 text-slate-300 text-[11px] font-mono p-2 rounded-xl focus:outline-none focus:border-slate-800 cursor-pointer"
                          >
                            <option value="1">1 Minuto</option>
                            <option value="2">2 Minutos</option>
                            <option value="5">5 Minutos (Recomendado)</option>
                            <option value="10">10 Minutos</option>
                            <option value="30">30 Minutos</option>
                            <option value="0">⚠️ Desativar Auto-Bloqueio</option>
                          </select>
                          <p className="text-[9px] text-slate-500 leading-tight">
                            O vault trancará a tela automaticamente e limpará a memória RAM do app se nenhuma atividade for detectada.
                          </p>
                        </div>

                        {/* Clipboard Auto Clear Timeout Select */}
                        <div className="space-y-1">
                          <label className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-400 block">
                            Limpeza da Área de Transferência
                          </label>
                          <select
                            value={clipboardTimeout}
                            onChange={(e) => {
                              const val = e.target.value;
                              setClipboardTimeout(val);
                              localStorage.setItem('secure_clipboard_timeout', val);
                            }}
                            className="w-full bg-[#05070a] border border-slate-900 text-slate-300 text-[11px] font-mono p-2 rounded-xl focus:outline-none focus:border-slate-800 cursor-pointer"
                          >
                            <option value="15">15 Segundos</option>
                            <option value="30">30 Segundos (Recomendado)</option>
                            <option value="45">45 Segundos</option>
                            <option value="60">60 Segundos</option>
                            <option value="0">⚠️ Desativar Auto-Limpeza</option>
                          </select>
                          <p className="text-[9px] text-slate-500 leading-tight">
                            Apaga automaticamente os dados copiados do clipboard após o tempo configurado para evitar vazamentos.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* CARD: CRIPTOGRAFIA E DETALHES TECNICOS */}
                    <div className="p-3.5 bg-[#090b11]/80 border border-slate-900 rounded-xl text-left" id="crypto-spec-section">
                      <button 
                        onClick={() => setCryptoCollapsed(!cryptoCollapsed)}
                        type="button"
                        className="w-full flex items-center justify-between text-left focus:outline-none cursor-pointer"
                      >
                        <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center space-x-1.5 font-sans">
                          <Shield className="h-3.5 w-3.5 text-emerald-400" />
                          <span>AES-GCM-256 E2E Ativa</span>
                        </div>
                        <div className="flex items-center space-x-1.5">
                          <span className="text-[9px] text-emerald-400 bg-emerald-950/30 px-1.5 py-0.5 rounded border border-emerald-500/20 font-semibold font-mono">
                            MILITAR
                          </span>
                          {cryptoCollapsed ? (
                            <ChevronDown className="h-4 w-4 text-slate-500 hover:text-slate-300 transition-colors" />
                          ) : (
                            <ChevronUp className="h-4 w-4 text-emerald-400 hover:text-emerald-300 transition-colors" />
                          )}
                        </div>
                      </button>
                      
                      {!cryptoCollapsed && (
                        <div className="space-y-3 pt-3 animate-fade-in border-t border-slate-950 mt-3">
                          <div className="space-y-1.5">
                            <h3 className="text-xs font-display font-extrabold text-white leading-none tracking-tight">Cofre de Senhas</h3>
                            <p className="text-[10px] text-slate-400 leading-relaxed font-sans">
                              Armazene registros e senhas com segurança inviolável de ponta-a-ponta. Seus dados são salvos localmente e codificados com cifra militar direto no navegador do computador ou do smartphone.
                            </p>
                          </div>

                          <div className="pt-2.5 border-t border-slate-900/80 space-y-2">
                            <div className="text-[9px] font-mono text-slate-400 font-bold uppercase tracking-wider">Especificações da Criptografia</div>
                            
                            <div className="space-y-2 text-[10px] text-slate-400 leading-relaxed">
                              <div className="flex items-start space-x-1.5">
                                <span className="text-emerald-400 font-bold font-mono text-xs mt-[-2px]">•</span>
                                <span><strong className="text-slate-300 font-bold">Zero Knowledge local:</strong> Nenhum servidor externo possui acesso às suas chaves ou textos salvos.</span>
                              </div>
                              <div className="flex items-start space-x-1.5">
                                <span className="text-emerald-400 font-bold font-mono text-xs mt-[-2px]">•</span>
                                <span><strong className="text-slate-300 font-bold">Busca Rápida Instantânea:</strong> Suporta consulta instantânea offline conforme digita o termo.</span>
                              </div>
                              <div className="flex items-start space-x-1.5">
                                <span className="text-emerald-400 font-bold font-mono text-xs mt-[-2px]">•</span>
                                <span><strong className="text-slate-300 font-bold">Modo Duplo Blindado:</strong> Marque itens sensíveis para exigir nova confirmação da senha mestra.</span>
                              </div>
                            </div>
                          </div>

                          <div className="pt-2 px-0.5 border-t border-slate-900/80 flex items-center justify-between font-mono text-[9px] text-slate-500 uppercase tracking-wider font-bold">
                            <span>SERVIDOR INTEGRADO</span>
                            <span className="text-emerald-400 font-bold">PORTA 3000</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* DANGER ZONE */}
                    <div className="space-y-2 pt-2" id="danger-settings-section">
                      <div className="text-[10px] uppercase font-bold text-red-500 tracking-wider">Zona de Risco</div>
                      
                      <button
                        onClick={handlePurgeVault}
                        className="w-full py-2.5 bg-red-950/20 hover:bg-red-950/30 border border-red-900/30 text-red-400 text-[10px] rounded-xl cursor-pointer transition flex items-center justify-center space-x-1.5 font-bold"
                        id="settings-purge-btn"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        <span>Deletar Todo o Cofre (Apagar Dados)</span>
                      </button>
                    </div>

                    {/* IMPORT STATUS FEEDBACK */}
                    {importStatus && (
                      <div className={`p-2.5 border text-[10px] text-center rounded-xl font-mono ${
                        importStatus.success ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-400' : 'bg-red-950/20 border-red-500/20 text-red-400'
                      }`}>
                        {importStatus.message}
                      </div>
                    )}

                  </div>



                </motion.div>
              )}
            </AnimatePresence>

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
                  Redigite sua chave mestra para confirmar sua identidade e ler este registro seguro.
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

      {/* CUSTOM CONFIRM DIALOG MODAL */}
      <AnimatePresence>
        {confirmDialog.isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center z-50 p-4"
            id="confirm-modal-overlay"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="bg-[#0c0e14] border border-slate-800 p-6 rounded-2xl max-w-sm w-full space-y-4 shadow-[0_10px_50px_rgba(0,0,0,0.8)] relative text-center"
              id="confirm-modal-card"
            >
              <div className="text-center space-y-2">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-2 shadow-inner ${
                  confirmDialog.isDanger ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                }`}>
                  {confirmDialog.isDanger ? <AlertTriangle className="h-6 w-6 animate-pulse" /> : <Shield className="h-6 w-6" />}
                </div>
                <h3 className="font-mono font-bold tracking-wider text-white text-sm uppercase">{confirmDialog.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {confirmDialog.message}
                </p>
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                  className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-850 text-slate-300 text-xs rounded-xl font-bold transition duration-200 cursor-pointer active:scale-[0.98]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmDialog.onConfirm}
                  className={`flex-1 py-2.5 text-xs rounded-xl font-black transition duration-200 cursor-pointer uppercase tracking-wider font-mono active:scale-[0.98] ${
                    confirmDialog.isDanger 
                      ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white shadow-[0_2px_15px_rgba(239,68,68,0.25)]' 
                      : 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-900 shadow-[0_2px_15px_rgba(16,185,129,0.25)]'
                  }`}
                >
                  {confirmDialog.confirmText || 'Confirmar'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CUSTOM ALERT DIALOG MODAL */}
      <AnimatePresence>
        {alertDialog.isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center z-50 p-4"
            id="alert-modal-overlay"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="bg-[#0c0e14] border border-slate-800 p-6 rounded-2xl max-w-sm w-full space-y-4 shadow-[0_10px_50px_rgba(0,0,0,0.8)] relative text-center"
              id="alert-modal-card"
            >
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center justify-center mx-auto mb-2 shadow-inner">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <h3 className="font-mono font-bold tracking-wider text-white text-sm uppercase">{alertDialog.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {alertDialog.message}
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setAlertDialog(prev => ({ ...prev, isOpen: false }))}
                  className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs rounded-xl font-black transition duration-200 cursor-pointer shadow-[0_2px_15px_rgba(245,158,11,0.25)] uppercase tracking-wider font-mono active:scale-[0.98]"
                >
                  OK
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* GLOBAL HIDDEN FILE INPUT (Shared across setup and unlocked screens) */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleImportBackup} 
        accept=".json" 
        className="hidden" 
        id="global-import-file-input"
      />

    </div>
  );
}
