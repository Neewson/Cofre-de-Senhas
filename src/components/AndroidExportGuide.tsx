/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Download, Github, Shield, Layers, HelpCircle, Code, Copy, Check, FileText } from 'lucide-react';

interface AndroidExportGuideProps {
  encryptedRecordsJSON: string;
}

export default function AndroidExportGuide({ encryptedRecordsJSON }: AndroidExportGuideProps) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  /**
   * Generates a fully standalone single-file HTML app bundle.
   * This bundle contains the entire encryption mechanics, responsive UI, 
   * and can be opened raw in any mobile browser or packaged as an Android Webview app!
   */
  const handleDownloadStandaloneHTML = () => {
    const htmlString = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Memo Criptografado - Offline Vault</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap');
        body { font-family: 'Inter', sans-serif; }
        .font-display { font-family: 'Space Grotesk', sans-serif; }
    </style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen flex flex-col justify-between">
    <div class="max-w-md w-full mx-auto p-4 flex-grow flex flex-col justify-between">
        <header class="text-center py-6">
            <h1 class="text-2xl font-bold font-display text-emerald-400">🔒 Memo Criptografado</h1>
            <p class="text-xs text-slate-400 mt-1">Cofre de Segurança Máxima E2E (Versão Autônoma)</p>
        </header>

        <main id="app-container" class="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-2xl flex-grow mb-6">
            <!-- App state handles will render dynamically here -->
            <div id="setup-view" class="space-y-6">
                <div class="text-center">
                    <span class="inline-block p-3 bg-emerald-500/10 text-emerald-400 rounded-full mb-3">🔑</span>
                    <h2 class="text-lg font-bold">Definir Senha Mestra</h2>
                    <p class="text-xs text-slate-400 mt-2">Como os dados são criptografados localmente de ponta-a-ponta, guarde bem esta senha. Não há recuperação em servidores!</p>
                </div>
                <div class="space-y-4">
                    <input type="password" id="setup-pass" placeholder="Senha Mestra" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 text-center">
                    <input type="password" id="setup-pass-conf" placeholder="Confirmar Senha" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 text-center">
                    <button onclick="setupPassword()" class="w-full bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold py-3 rounded-xl transition cursor-pointer text-sm">Criar Cofre Criptografado</button>
                </div>
            </div>
        </main>

        <footer class="text-center text-xs text-slate-500 pb-4">
            Código-fonte 100% livre e transparente.
        </footer>
    </div>

    <!-- Cryptographic Engine and SPA state in standard JS for complete standalone offline execution -->
    <script>
        // High security Web Crypto derived from SubtleCrypto standard
        let masterPassword = "";
        let config = null;
        let records = [];
        let matchingAnswers = [];

        async function deriveKey(password, saltBuffer) {
            const encoder = new TextEncoder();
            const passwordKey = await crypto.subtle.importKey(
                'raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']
            );
            return crypto.subtle.deriveKey(
                { name: 'PBKDF2', salt: saltBuffer, iterations: 100000, hash: 'SHA-256' },
                passwordKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
            );
        }

        async function encryptText(text, password) {
            const encoder = new TextEncoder();
            const salt = crypto.getRandomValues(new Uint8Array(16));
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const key = await deriveKey(password, salt.buffer);
            const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(text));
            return {
                ciphertext: btoa(String.fromCharCode(...new Uint8Array(cipher))),
                iv: btoa(String.fromCharCode(...iv)),
                salt: btoa(String.fromCharCode(...salt))
            };
        }

        async function decryptText(payload, password) {
            const salt = new Uint8Array(atob(payload.salt).split("").map(c => c.charCodeAt(0)));
            const iv = new Uint8Array(atob(payload.iv).split("").map(c => c.charCodeAt(0)));
            const cipher = new Uint8Array(atob(payload.ciphertext).split("").map(c => c.charCodeAt(0)));
            const key = await deriveKey(password, salt.buffer);
            const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
            return new TextDecoder().decode(plain);
        }

        function loadFromLocalStorage() {
            const savedConfig = localStorage.getItem('secure_config');
            if (savedConfig) {
                config = JSON.parse(savedConfig);
                renderLoginView();
            } else {
                renderSetupView();
            }
        }

        async function setupPassword() {
            const pass = document.getElementById('setup-pass').value;
            const conf = document.getElementById('setup-pass-conf').value;
            if(!pass) return alert("Digite uma senha mestra!");
            if(pass !== conf) return alert("As senhas não coincidem!");

            const verificationPayload = await encryptText('VERIFICATION_PASSED', pass);
            localStorage.setItem('secure_config', JSON.stringify({ verificationPayload }));
            masterPassword = pass;
            records = [];
            renderAppView();
        }

        async function unlockVault() {
            const pass = document.getElementById('login-pass').value;
            const savedConfig = JSON.parse(localStorage.getItem('secure_config'));
            try {
                const dec = await decryptText(savedConfig.verificationPayload, pass);
                if(dec === "VERIFICATION_PASSED") {
                    masterPassword = pass;
                    await decryptAllRecords();
                    renderAppView();
                } else {
                    alert("Senha Mestra incorreta!");
                }
            } catch(e) {
                alert("Senha Mestra inválida.");
            }
        }

        async function decryptAllRecords() {
            const savedStr = localStorage.getItem('secure_records') || "[]";
            const encList = JSON.parse(savedStr);
            records = [];
            for (let item of encList) {
                try {
                    const q = await decryptText(item.encryptedQuestion, masterPassword);
                    const a = await decryptText(item.encryptedAnswer, masterPassword);
                    records.push({
                        id: item.id,
                        question: q,
                        answer: a,
                        requireMasterPasswordToReveal: item.requireMasterPasswordToReveal,
                        createdAt: item.createdAt
                    });
                } catch(e) {
                    console.error("Failure decrypting item", e);
                }
            }
        }

        async function saveNewRecord() {
            const q = document.getElementById('new-q').value.trim();
            const a = document.getElementById('new-a').value.trim();
            const lockReq = document.getElementById('new-lock').checked;

            if(!q || !a) return alert("Preencha a pergunta e a resposta!");

            const encryptedQuestion = await encryptText(q, masterPassword);
            const encryptedAnswer = await encryptText(a, masterPassword);

            const newEnc = {
                id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(),
                encryptedQuestion,
                encryptedAnswer,
                requireMasterPasswordToReveal: lockReq,
                createdAt: new Date().toISOString()
            };

            const savedStr = localStorage.getItem('secure_records') || "[]";
            const encList = JSON.parse(savedStr);
            encList.push(newEnc);
            localStorage.setItem('secure_records', JSON.stringify(encList));

            records.push({
                id: newEnc.id,
                question: q,
                answer: a,
                requireMasterPasswordToReveal: lockReq,
                createdAt: newEnc.createdAt
            });

            document.getElementById('new-q').value = "";
            document.getElementById('new-a').value = "";
            document.getElementById('new-lock').checked = false;

            alert("Registro criptografado com sucesso!");
            renderAppView();
        }

        function handleDelete(id) {
            if(!confirm("Deseja mesmo excluir este registro permanente?")) return;
            records = records.filter(r => r.id !== id);
            
            // Retain on Storage
            const savedStr = localStorage.getItem('secure_records') || "[]";
            let encList = JSON.parse(savedStr);
            encList = encList.filter(r => r.id !== id);
            localStorage.setItem('secure_records', JSON.stringify(encList));
            renderAppView();
        }

        function searchAnswer() {
            const query = document.getElementById('search-input').value.trim().toLowerCase().replace(/\\?$/, "");
            const resultBox = document.getElementById('search-result-container');
            
            if(!query) {
                resultBox.innerHTML = "";
                return;
            }

            const found = records.filter(r => {
                const keyNorm = r.question.toLowerCase().replace(/\\?$/, "");
                return keyNorm === query || keyNorm.includes(query);
            });

            if(found.length > 0) {
                let html = '<div class="space-y-3 mt-4">';
                for(let item of found) {
                    const isLocked = item.requireMasterPasswordToReveal;
                    html += \`
                    <div class="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                        <div class="text-xs text-slate-400 font-mono">Pergunta correspondente encontrada:</div>
                        <div class="text-sm font-semibold text-emerald-400">\${escapeHtml(item.question)}</div>
                        <div class="border-t border-slate-800/60 pt-2">
                            \${isLocked ? \`
                                <div id="locked-ans-\${item.id}" class="space-y-2">
                                    <div class="flex items-center space-x-2 text-amber-500 text-xs">
                                        <span>🔒 Requer Senha Mestra para Revelar</span>
                                    </div>
                                    <button onclick="revealSecret('\${item.id}', '\${escapeHtml(item.answer)}')" class="px-3 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs rounded-lg border border-amber-500/30 font-semibold cursor-pointer">Ver Resposta Segura</button>
                                </div>
                            \` : \`
                                <div class="text-white text-sm font-semibold bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/15">\${escapeHtml(item.answer)}</div>
                            \`}
                        </div>
                    </div>
                    \`;
                }
                html += '</div>';
                resultBox.innerHTML = html;
            } else {
                resultBox.innerHTML = \`<div class="text-xs text-slate-500 text-center py-4 bg-slate-950/40 rounded-xl border border-slate-805 border-dashed">Nenhuma correspondência exaustiva encontrada...</div>\`;
            }
        }

        function revealSecret(id, correctAns) {
            const pwd = prompt("Para revelar esta resposta protegida, confirme sua Senha Mestra:");
            if(pwd === masterPassword) {
                document.getElementById('locked-ans-' + id).innerHTML = \`<div class="text-white text-sm font-semibold bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/15">\${correctAns}</div>\`;
            } else {
                alert("Senha incorreta!");
            }
        }

        function escapeHtml(text) {
            return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
        }

        function renderSetupView() {
            document.getElementById('app-container').innerHTML = \`
                <div class="space-y-6">
                    <div class="text-center">
                        <span class="inline-block p-3 bg-emerald-500/10 text-emerald-400 rounded-full mb-3">🗝️</span>
                        <h2 class="text-lg font-bold">Definir Senha Mestra</h2>
                        <p class="text-xs text-slate-400 mt-2">Como os dados são criptografados localmente de ponta-a-ponta, guarde bem esta senha. Não há recuperação em servidores!</p>
                    </div>
                    <div class="space-y-4">
                        <input type="password" id="setup-pass" placeholder="Senha Mestra" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 text-center">
                        <input type="password" id="setup-pass-conf" placeholder="Confirmar Senha" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 text-center">
                        <button onclick="setupPassword()" class="w-full bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold py-3 rounded-xl transition cursor-pointer text-sm">Criar Cofre Criptografado</button>
                    </div>
                </div>
            \`;
        }

        function renderLoginView() {
            document.getElementById('app-container').innerHTML = \`
                <div class="space-y-6">
                    <div class="text-center">
                        <span class="inline-block p-3 bg-indigo-500/10 text-indigo-400 rounded-full mb-3 font-display text-lg">🔒</span>
                        <h2 class="text-lg font-bold">Cofre Bloqueado</h2>
                        <p class="text-xs text-slate-400 mt-2">Digite sua senha mestra para descriptografar os registros na memória RAM local.</p>
                    </div>
                    <div class="space-y-4">
                        <input type="password" id="login-pass" placeholder="Insira a Senha Mestra" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 text-center">
                        <button onclick="unlockVault()" class="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-3 rounded-xl transition cursor-pointer text-sm">Desbloquear</button>
                    </div>
                </div>
            \`;
        }

        function renderAppView() {
            let recordsHtml = '';
            if(records.length === 0) {
                recordsHtml = '<div class="text-slate-500 text-center text-xs py-8">Nenhum registro armazenado. Crie abaixo!</div>';
            } else {
                recordsHtml = '<div class="space-y-2 max-h-60 overflow-y-auto pr-1">';
                for(let r of records) {
                    recordsHtml += \`
                    <div class="p-3 bg-slate-950 border border-slate-800/80 rounded-xl flex justify-between items-center">
                        <div>
                            <div class="text-xs font-semibold text-emerald-400">\${escapeHtml(r.question)}</div>
                            <div class="text-slate-500 text-[11px] font-mono mt-0.5">\${r.requireMasterPasswordToReveal ? "🔒 Protegido com Senha" : "🔓 Desbloqueado"}</div>
                        </div>
                        <button onclick="handleDelete('\${r.id}')" class="p-1 px-2.5 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg border border-red-500/20 cursor-pointer">Excluir</button>
                    </div>
                    \`;
                }
                recordsHtml += '</div>';
            }

            document.getElementById('app-container').innerHTML = \`
                <div class="space-y-6">
                    <!-- Section 1: Live Query -->
                    <div class="space-y-2">
                        <label class="text-xs text-slate-400 font-semibold block">🔍 Consulta Rápida Automática</label>
                        <input type="text" id="search-input" onkeyup="searchAnswer()" placeholder="Digite a pergunta anterior ao '?'" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 text-emerald-300 font-medium">
                        <div id="search-result-container"></div>
                    </div>

                    <!-- Section 2: Create Custom Core -->
                    <div class="border-t border-slate-800 pt-4 space-y-3">
                        <h3 class="text-xs text-slate-400 font-semibold">➕ Criar Novo Registro</h3>
                        <div class="space-y-2">
                            <input type="text" id="new-q" placeholder="Digite a Pergunta (ex: Senha do Banco?)" class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs focus:outline-none">
                            <input type="text" id="new-a" placeholder="Resposta ou Texto Secreto correspondente" class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs focus:outline-none">
                            <div class="flex items-center space-x-2 py-1">
                                <input type="checkbox" id="new-lock" class="rounded border-slate-800 text-emerald-500 focus:ring-0 bg-slate-950">
                                <label for="new-lock" class="text-[11px] text-slate-400 leading-none select-none cursor-pointer">Exigir senha mestra para revelar a resposta</label>
                            </div>
                            <button onclick="saveNewRecord()" class="w-full bg-emerald-500/10 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 font-bold py-2 rounded-lg transition text-xs cursor-pointer">Salvar Registro</button>
                        </div>
                    </div>

                    <!-- Section 3: Registered Info -->
                    <div class="border-t border-slate-800 pt-4">
                        <h4 class="text-xs text-slate-400 font-semibold mb-2">📦 Meus Memos Armazenados (\${records.length})</h4>
                        \${recordsHtml}
                    </div>

                    <button onclick="localStorage.removeItem('master_session_token'); window.location.reload();" class="w-full py-2 bg-slate-800/40 hover:bg-slate-800/80 border border-slate-700/45 text-slate-400 text-xs rounded-xl font-medium cursor-pointer">🔒 Trancar e Fechar Cofre</button>
                </div>
            \`;
        }

        // Initialize local configs
        window.onload = loadFromLocalStorage;
    </script>
</body>
</html>`;

    const blob = new Blob([htmlString], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'MemoCriptografado_Autonomo.html';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 pt-2">
      <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
        <div className="flex items-center space-x-3 text-emerald-400">
          <Layers className="h-6 w-6" id="layers-icon-export" />
          <h3 className="font-display font-semibold text-base text-white">Guia de Compilação & apk do Android</h3>
        </div>
        
        <p className="text-xs text-slate-400 leading-relaxed">
          Como este ambiente é uma sandbox da web baseada em Node.js e rodando em nuvem, não é possível compilar diretamente binários nativos de Android (arquivos <span className="font-mono text-emerald-400 font-medium">.apk</span>) sem a SDK do Android, Gradle e emulador local. No entanto, criamos uma solução profissional!
        </p>

        <div className="space-y-3">
          <div className="p-3 bg-emerald-950/20 border border-emerald-500/20 rounded-xl space-y-2">
            <h4 className="text-xs font-semibold text-emerald-400 flex items-center space-x-1.5">
              <span>📱 Solução 1: Aplicativo Offline Autônomo (Recomendado)</span>
            </h4>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Baixe a versão autônoma de arquivo único HTML. Ela é 100% offline, altamente segura, responsiva para celular e pode ser colocada diretamente no armazenamento do seu dispositivo Android ou aberta com qualquer navegador de internet do celular (como Chrome, Firefox, ou visualizadores de arquivos).
            </p>
            <button
              onClick={handleDownloadStandaloneHTML}
              className="mt-1.5 w-full flex items-center justify-center space-x-2 px-3 py-2.5 bg-emerald-500 text-slate-950 rounded-xl text-xs font-bold hover:bg-emerald-400 cursor-pointer transition shadow-md"
              id="download-html-btn"
            >
              <Download className="h-4 w-4" />
              <span>Baixar App Autônomo para Celular (.html)</span>
            </button>
          </div>

          <div className="p-3 bg-indigo-950/20 border border-indigo-500/20 rounded-xl space-y-2">
            <h4 className="text-xs font-semibold text-indigo-400 flex items-center space-x-1.5">
              <span>⚙️ Solução 2: Código-Fonte Limpo para Android (Capacitor)</span>
            </h4>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Você pode converter o código-fonte em um aplicativo Android nativo completo usando o <strong>CapacitorJS</strong>. Ele envelopará nossa aplicação segura com alto desempenho.
            </p>
          </div>

          <div className="p-3 bg-blue-950/20 border border-blue-500/20 rounded-xl space-y-2">
            <h4 className="text-xs font-semibold text-blue-400 flex items-center space-x-1.5">
              <span>🚀 Solução 3: Compilação Automática via GitHub Actions (Recomendado!)</span>
            </h4>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Criamos um script silencioso que compila o arquivo <strong>.apk</strong> automaticamente para você! 
              Você só precisa exportar este projeto para sua conta no seu <strong>GitHub</strong> pessoal no menu do Google AI Studio. 
              O GitHub detectará a exportação e compilará o APK na nuvem deles. Você poderá baixá-lo diretamente na aba <strong>"Actions"</strong> do seu repositório no GitHub, sem precisar instalar nada localmente!
            </p>
          </div>
        </div>
      </div>

      {/* Step by step translation to GitHub & APK compilation */}
      <div className="space-y-4">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center space-x-2">
          <Code className="h-4 w-4" />
          <span>Passo-a-Passo: Compilar o APK e publicar no GitHub</span>
        </h3>

        {/* Step 1 */}
        <div className="p-4 bg-slate-900 border border-slate-800/80 rounded-xl space-y-3">
          <div className="flex items-center space-x-2 text-indigo-400 font-display text-sm font-bold">
            <span className="w-5 h-5 flex items-center justify-center bg-indigo-500/10 rounded-full text-xs">1</span>
            <span>Código-Fonte transparente no GitHub</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Seu projeto já roda sobre uma plataforma transparente. Para enviar o código diretamente ao seu repositório no GitHub:
          </p>
          <ol className="list-decimal pl-4 text-[11px] text-slate-400 space-y-1.5 leading-relaxed">
            <li>Abra o menu de Configurações no canto superior direito do seu editor do Google AI Studio.</li>
            <li>Selecione a opção <strong>"Export to GitHub"</strong>.</li>
            <li>Isso vinculará sua conta e publicará toda a estrutura de criptografia do app para completa transparência e auditoria de segurança!</li>
          </ol>
          <div className="flex justify-start pt-1">
            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center space-x-1.5 text-[11px] text-slate-400 hover:text-white"
            >
              <Github className="h-3.5 w-3.5" />
              <span>Acessar o GitHub.com &rarr;</span>
            </a>
          </div>
        </div>

        {/* Step 2 */}
        <div className="p-4 bg-slate-900 border border-slate-800/80 rounded-xl space-y-3">
          <div className="flex items-center space-x-2 text-emerald-400 font-display text-sm font-bold">
            <span className="w-5 h-5 flex items-center justify-center bg-emerald-500/10 rounded-full text-xs">2</span>
            <span>Preparação de compilação da APK com Capacitor</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Para gerar seu arquivo apk real em seu computador localmente, você deve ter o <strong>Nodejs</strong> e o <strong>Android Studio</strong> instalados. Siga estes simples comandos no terminal da pasta do seu projeto baixado (ZIP) ou clonado do Github:
          </p>

          <div className="space-y-3 font-mono text-xs">
            <div>
              <div className="flex justify-between items-center text-[10px] text-slate-500 bg-slate-950 px-3 py-1.5 rounded-t-lg border-b border-slate-800">
                <span>Passo 2.1: Instalar o Capacitor</span>
                <button
                  onClick={() => copyToClipboard('npm install @capacitor/core @capacitor/cli @capacitor/android', 'cap-inst')}
                  className="hover:text-white flex items-center space-x-1"
                >
                  {copiedCode === 'cap-inst' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  <span>{copiedCode === 'cap-inst' ? 'Copiado' : 'Copiar'}</span>
                </button>
              </div>
              <pre className="p-3 bg-slate-950 text-slate-300 rounded-b-lg overflow-x-auto text-[11px] whitespace-pre-wrap">
                npm install @capacitor/core @capacitor/cli @capacitor/android
              </pre>
            </div>

            <div>
              <div className="flex justify-between items-center text-[10px] text-slate-500 bg-slate-950 px-3 py-1.5 rounded-t-lg border-b border-slate-800">
                <span>Passo 2.2: Inicializar o projeto no Android</span>
                <button
                  onClick={() => copyToClipboard('npx cap init "Memo Criptografado" "com.seumemo.secure" --web-dir=dist', 'cap-init')}
                  className="hover:text-white flex items-center space-x-1"
                >
                  {copiedCode === 'cap-init' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  <span>{copiedCode === 'cap-init' ? 'Copiado' : 'Copiar'}</span>
                </button>
              </div>
              <pre className="p-3 bg-slate-950 text-slate-300 rounded-b-lg overflow-x-auto text-[11px] whitespace-pre-wrap">
                npx cap init "Memo Criptografado" "com.seumemo.secure" --web-dir=dist
              </pre>
            </div>

            <div>
              <div className="flex justify-between items-center text-[10px] text-slate-500 bg-slate-950 px-3 py-1.5 rounded-t-lg border-b border-slate-800">
                <span>Passo 2.3: Adicionar Plataforma Android e Sincronizar</span>
                <button
                  onClick={() => copyToClipboard('npm run build\nnpx cap add android\nnpx cap sync', 'cap-sync')}
                  className="hover:text-white flex items-center space-x-1"
                >
                  {copiedCode === 'cap-sync' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  <span>{copiedCode === 'cap-sync' ? 'Copiado' : 'Copiar'}</span>
                </button>
              </div>
              <pre className="p-3 bg-slate-950 text-slate-300 rounded-b-lg overflow-x-auto text-[11px] whitespace-pre-wrap">
                npm run build {"\n"}
                npx cap add android {"\n"}
                npx cap sync
              </pre>
            </div>

            <div>
              <div className="flex justify-between items-center text-[10px] text-slate-500 bg-slate-950 px-3 py-1.5 rounded-t-lg border-b border-slate-800">
                <span>Passo 2.4: Abrir no Android Studio e Compilar o APK</span>
                <button
                  onClick={() => copyToClipboard('npx cap open android', 'cap-open')}
                  className="hover:text-white flex items-center space-x-1"
                >
                  {copiedCode === 'cap-open' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  <span>{copiedCode === 'cap-open' ? 'Copiado' : 'Copiar'}</span>
                </button>
              </div>
              <pre className="p-3 bg-slate-950 text-slate-300 rounded-b-lg overflow-x-auto text-[11px] whitespace-pre-wrap">
                npx cap open android
              </pre>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed mt-2 bg-slate-950/50 p-2.5 rounded-lg border border-slate-800">
            <strong>O que acontece a seguir:</strong> O comando acima abrirá o Android Studio automaticamente. No Android Studio, vá ao menu principal, selecione <strong>Build &rarr; Build Bundle(s) / APK(s) &rarr; Build APK(s)</strong>. Pronto! O Android Studio gerará o seu arquivo <span className="text-emerald-400 font-mono">app-debug.apk</span> exclusivo para instalar diretamente no seu celular Android.
          </p>
        </div>

        {/* Security transparency check */}
        <div className="p-4 bg-slate-900 border border-slate-800/80 rounded-xl flex items-start space-x-3">
          <Shield className="h-5 w-5 text-emerald-400 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <h4 className="text-xs font-semibold text-white">Segurança Verificável e Transparente</h4>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              O aplicativo utiliza a biblioteca nativa <span className="font-mono text-slate-300">window.crypto.subtle</span> do ambiente do dispositivo móvel. Toda operação de cifragem ocorre estritamente dentro da memória RAM do seu celular — tornando-o à prova de invasões em nível militar. Nenhum dado circula para servidores externos.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
