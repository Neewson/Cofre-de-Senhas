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
  AlertTriangle,
  Cloud,
  CloudOff
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
  const [activeTab, setActiveTab] = useState<'search' | 'add' | 'records'>('search');

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
    localStorage.getItem('secure_google_client_id') || (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || ''
  );
  const [showGDriveClientSetup, setShowGDriveClientSetup] = useState<boolean>(false);

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
      triggerAlert('Campos Vazios', 'Por favor, digite tanto a pergunta/frase quanto a resposta protegida.');
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
    link.download = `Cofre_Backup_Senhas_${new Date().toISOString().slice(0, 10)}.json`;
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
      });

      if (client) {
        client.requestAccessToken({ prompt: 'consent' });
      } else {
        triggerAlert('Biblioteca Não Carregada', 'A biblioteca do Google Identity não foi totalmente carregada no navegador. Tente em alguns instantes.');
      }
    } catch (err: any) {
      console.error(err);
      triggerAlert('Erro de Login', 'Não foi possível iniciar a autenticação de segurança do Google.');
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
            Cofre <span className="relative inline-block"><span className="absolute -inset-1 rounded-lg bg-emerald-500/10 blur-sm"></span><span className="relative text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">de Senhas</span></span>
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
                      C
                    </div>
                    <div>
                      <h2 className="text-xs font-display font-extrabold text-white leading-none tracking-tight">Cofre de Senhas</h2>
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

                          </div>

                          {/* DYNAMIC SEARCH RESULT WINDOW */}
                          <div className="space-y-3 pt-2" id="search-results-viewport">
                            {searchTerm.trim().length === 0 ? (
                              <div className="p-8 text-center text-slate-600 bg-[#090b11]/20 border border-slate-900 border-dashed rounded-2xl space-y-2 select-none">
                                <Search className="h-10 w-10 mx-auto opacity-20 text-emerald-400" />
                                <div className="text-xs font-semibold">Aguardando busca automatizada...</div>
                                <div className="text-[10px] text-slate-600 leading-normal">Ao digitar algo correspondente a um Registro, a resposta correspondente será revelada imediatamente na tela!</div>
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
                                    <p className="text-[10px] text-slate-500 max-w-[280px] mx-auto mt-1 leading-normal">Gostaria de criar um novo registro para responder a essa pergunta?</p>
                                    <button
                                      onClick={() => {
                                        setNewQuestion(searchTerm);
                                        setActiveTab('add');
                                      }}
                                      className="mt-2.5 text-[10px] font-bold text-emerald-400 hover:underline uppercase tracking-wider font-mono"
                                    >
                                      Criar registro com "{searchTerm}" &rarr;
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
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">PERGUNTA (Sem ponto)</label>
                              <textarea 
                                placeholder="..."
                                value={newQuestion}
                                onChange={(e) => setNewQuestion(e.target.value)}
                                rows={3}
                                className="w-full bg-[#090b11] border border-slate-800/80 hover:border-slate-700/80 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 focus:outline-none rounded-xl px-4 py-3 text-xs text-slate-200 transition-all duration-200 shadow-inner"
                                id="new-record-question"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">RESPOSTA</label>
                              <textarea
                                placeholder="..."
                                value={newAnswer}
                                onChange={(e) => setNewAnswer(e.target.value)}
                                rows={3}
                                className="w-full bg-[#090b11] border border-slate-800/80 hover:border-slate-700/80 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 focus:outline-none rounded-xl px-4 py-3 text-xs text-slate-200 transition-all duration-200 shadow-inner"
                                id="new-record-answer"
                              />
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
                              <p className="text-[10px] text-slate-600 max-w-[240px] mx-auto leading-normal">Selecione "+ Novo" acima para preencher suas perguntas e respostas e testar a criptografia!</p>
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
                                          <div className="flex justify-end">
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

                          {/* Vault backups & complete management (Only visible when unlocked) */}
                          <div className="pt-4 border-t border-slate-900/60 space-y-3">
                            <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Configurações e Segurança</div>
                            
                            <div className="grid grid-cols-2 gap-2">
                              {/* EXPORT BUTTON */}
                              <button
                                onClick={handleExportBackup}
                                className="py-2.5 bg-[#090b11] hover:bg-slate-900 text-slate-300 text-[10px] border border-slate-800/80 rounded-xl cursor-pointer transition flex items-center justify-center space-x-1.5 font-bold shadow-sm"
                                id="btn-export-records"
                              >
                                <Download className="h-3.5 w-3.5 text-emerald-400" />
                                <span>Exportar JSON</span>
                              </button>

                              {/* IMPORT BUTTON */}
                              <button
                                onClick={() => fileInputRef.current?.click()}
                                className="py-2.5 bg-[#090b11] hover:bg-slate-900 text-slate-300 text-[10px] border border-slate-800/80 rounded-xl cursor-pointer transition flex items-center justify-center space-x-1.5 font-bold shadow-sm"
                                id="btn-import-records-unlocked"
                              >
                                <Upload className="h-3.5 w-3.5 text-blue-400" />
                                <span>Importar JSON</span>
                              </button>
                            </div>

                            {/* GOOGLE DRIVE CLOUD BACKUP SECTION */}
                            <div className="pt-3 border-t border-slate-900/40 space-y-2.5">
                              <div className="flex items-center justify-between">
                                <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center space-x-1">
                                  <Cloud className="h-3 w-3 text-emerald-400" />
                                  <span>Backup na Nuvem (Google Drive)</span>
                                </div>
                                {gdriveAccessToken ? (
                                  <span className="text-[9px] text-emerald-400 bg-emerald-950/30 px-2 py-0.5 rounded-full border border-emerald-900/30 font-semibold font-mono animate-pulse">
                                    Conectado
                                  </span>
                                ) : (
                                  <span className="text-[9px] text-slate-500 bg-slate-950/40 px-2 py-0.5 rounded-full border border-slate-900/60 font-semibold font-mono">
                                    Desconectado
                                  </span>
                                )}
                              </div>

                              {/* GDrive status info / instructions */}
                              {gdriveAccessToken ? (
                                <div className="bg-[#090b11]/60 border border-emerald-950/20 p-3 rounded-xl space-y-2 text-left">
                                  <div className="flex justify-between items-start">
                                    <div>
                                      <div className="text-[10px] text-slate-400">Conta conectada:</div>
                                      <div className="text-xs font-semibold text-emerald-300 font-mono select-all truncate max-w-[180px]">{gdriveUserEmail}</div>
                                    </div>
                                    <button 
                                      onClick={handleDisconnectGDrive}
                                      className="text-[9px] font-bold text-red-400 hover:underline uppercase tracking-wider font-mono flex items-center space-x-1"
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

                                  <div className="grid grid-cols-2 gap-2 pt-1.5">
                                    <button
                                      onClick={handleGDriveBackup}
                                      disabled={gdriveIsSyncing}
                                      className="py-2 bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/20 text-emerald-400 text-[10px] rounded-lg font-bold transition flex items-center justify-center space-x-1 disabled:opacity-50 cursor-pointer"
                                    >
                                      <RefreshCw className={`h-3 w-3 ${gdriveIsSyncing ? 'animate-spin' : ''}`} />
                                      <span>Salvar na Nuvem</span>
                                    </button>
                                    <button
                                      onClick={handleGDriveRestore}
                                      disabled={gdriveIsSyncing}
                                      className="py-2 bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/20 text-blue-400 text-[10px] rounded-lg font-bold transition flex items-center justify-center space-x-1 disabled:opacity-50 cursor-pointer"
                                    >
                                      <Download className="h-3 w-3" />
                                      <span>Baixar da Nuvem</span>
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="p-3 bg-[#090b11]/30 border border-slate-900 rounded-xl space-y-2 text-left bg-[#090b11]/60">
                                  <p className="text-[10px] text-slate-400 leading-relaxed">
                                    Salve seus dados criptografados com segurança de ponta-a-ponta na sua própria nuvem.
                                  </p>

                                  <button
                                    onClick={() => handleConnectGDrive()}
                                    className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-[10px] rounded-lg font-extrabold transition flex items-center justify-center space-x-1.5 shadow-sm cursor-pointer"
                                  >
                                    <Cloud className="h-3.5 w-3.5" />
                                    <span>Autenticar & Conectar</span>
                                  </button>

                                  <div className="pt-1.5 border-t border-slate-900/60">
                                    <button
                                      onClick={() => setShowGDriveClientSetup(!showGDriveClientSetup)}
                                      className="w-full text-center text-[9px] text-slate-500 hover:text-slate-400 uppercase font-bold tracking-wider font-mono py-1 cursor-pointer"
                                    >
                                      {showGDriveClientSetup ? 'Ocultar Configurações de API ✕' : 'Ver ID do Cliente Google &rarr;'}
                                    </button>

                                    {showGDriveClientSetup && (
                                      <motion.div 
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        className="space-y-2 pt-2 text-left"
                                      >
                                        <div className="space-y-1">
                                          <label className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-400 block">
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
                                            className="w-full bg-[#05070a] border border-slate-900 focus:border-slate-800 text-slate-300 text-[10px] font-mono p-1.5 rounded-lg focus:outline-none"
                                          />
                                        </div>
                                        <p className="text-[9px] text-slate-500 leading-normal font-sans">
                                          Nós usamos o escopo seguro e limitado <span className="font-mono text-slate-400 font-semibold bg-slate-950/65 px-1.5 py-0.5 rounded border border-slate-900">drive.file</span>. O backup fica completamente restrito a esta sessão de usuário, sem qualquer acesso amplo ou invasivo aos seus demais arquivos particulares.
                                        </p>
                                      </motion.div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* PURGE VAULT BUTTON */}
                            <button
                              onClick={handlePurgeVault}
                              className="w-full py-2.5 bg-red-950/20 hover:bg-red-950/30 border border-red-900/30 text-red-400 text-[10px] rounded-xl cursor-pointer transition flex items-center justify-center space-x-1.5 font-bold"
                              id="btn-purge-records-unlocked"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-500" />
                              <span>Deletar Todo o Cofre (Apagar Dados)</span>
                            </button>

                            {/* Live Import Status Message */}
                            {importStatus && (
                              <div className={`p-2.5 border text-[10px] text-center rounded-xl font-mono ${
                                importStatus.success ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-400' : 'bg-red-950/20 border-red-500/20 text-red-400'
                              }`}>
                                {importStatus.message}
                              </div>
                            )}
                          </div>
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
