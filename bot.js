const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const http = require('http');
const path = require('path');
const Database = require('./database');
const moment = require('moment');

// Configurações
const BOT_NUMBER = process.env.BOT_NUMBER || '556183040115';
const ADMIN_NUMBER = process.env.ADMIN_NUMBER || '5518997972598';
const STORE_NAME = process.env.STORE_NAME || 'NyuxStore';
const PORT = process.env.PORT || 8080;

const ADMIN_MASTER_KEY = 'NYUX-ADM1-GUIXS23';

console.log('🔧 Configurações carregadas:');
console.log('👑 Admin:', ADMIN_NUMBER);
console.log('🤖 Bot:', BOT_NUMBER);

const db = new Database();
const userStates = new Map();

const mensagensProcessadas = new Set();
const TEMPO_LIMPEZA_MS = 5 * 60 * 1000;

let pairingCode = null;
let pairingCodeError = null;
let qrCodeDataURL = null;
let qrCodeRaw = null;
let botConectado = false;
let sockGlobal = null;
let tentativasConexao = 0;
let reconectando = false;
let useQRFallback = false; // Força QR se pairing falhar

setInterval(() => {
    mensagensProcessadas.clear();
    console.log('🧹 Cache de mensagens limpo');
}, TEMPO_LIMPEZA_MS);

// ===== SERVIDOR WEB =====
const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    const url = req.url;

    if (url === '/api/status') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
            conectado: botConectado,
            temPairingCode: !!pairingCode,
            temQR: !!qrCodeDataURL,
            erro: pairingCodeError,
            timestamp: new Date().toISOString()
        }));
        return;
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    if (url === '/') {
        res.end(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>${STORE_NAME} - Bot WhatsApp</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <meta http-equiv="refresh" content="3">
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        text-align: center; 
                        padding: 50px; 
                        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                        color: white;
                        min-height: 100vh;
                        margin: 0;
                    }
                    .status { 
                        padding: 20px; 
                        border-radius: 15px; 
                        margin: 20px auto;
                        font-size: 20px;
                        max-width: 500px;
                    }
                    .online { background: #4CAF50; }
                    .offline { background: #f44336; }
                    .waiting { background: #ff9800; animation: pulse 2s infinite; }
                    .error { background: #f44336; color: white; }
                    h1 { color: #00d9ff; }
                    .pairing-box {
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        padding: 30px;
                        border-radius: 20px;
                        margin: 20px auto;
                        max-width: 400px;
                        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                    }
                    .pairing-code {
                        font-size: 48px;
                        font-weight: bold;
                        letter-spacing: 10px;
                        color: #fff;
                        text-shadow: 0 0 20px rgba(255,255,255,0.5);
                        margin: 20px 0;
                    }
                    .qr-fallback {
                        background: white;
                        padding: 20px;
                        border-radius: 20px;
                        margin: 20px auto;
                        max-width: 350px;
                    }
                    .qr-fallback img {
                        width: 100%;
                    }
                    .info {
                        background: rgba(255,255,255,0.1);
                        padding: 20px;
                        border-radius: 15px;
                        margin: 20px auto;
                        max-width: 600px;
                        text-align: left;
                    }
                    .info ol { padding-left: 20px; line-height: 2; }
                    .erro-box {
                        background: rgba(244,67,54,0.3);
                        border: 2px solid #f44336;
                        padding: 20px;
                        border-radius: 15px;
                        margin: 20px auto;
                        max-width: 500px;
                    }
                    @keyframes pulse {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0.7; }
                    }
                </style>
            </head>
            <body>
                <h1>🎮 ${STORE_NAME} Bot</h1>
                
                ${botConectado ? `
                    <div class="status online">
                        ✅ Bot Conectado!
                    </div>
                ` : (pairingCode ? `
                    <div class="status waiting">
                        ⏳ Use o código abaixo
                    </div>
                    <div class="pairing-box">
                        <h2>🔑 Código de Pareamento</h2>
                        <div class="pairing-code">${pairingCode}</div>
                        <p>Válido por 2 minutos</p>
                    </div>
                    <div class="info">
                        <h3>📱 Como conectar:</h3>
                        <ol>
                            <li>Abra o <strong>WhatsApp</strong> no celular</li>
                            <li>Configurações → <strong>Dispositivos Conectados</strong></li>
                            <li><strong>Conectar um dispositivo</strong></li>
                            <li>Escolha <strong>"Conectar com número"</strong></li>
                            <li>Digite: <strong style="font-size:20px;">${pairingCode}</strong></li>
                        </ol>
                    </div>
                ` : (qrCodeDataURL ? `
                    <div class="status waiting">
                        📱 Escaneie o QR Code
                    </div>
                    <div class="qr-fallback">
                        <img src="${qrCodeDataURL}" alt="QR Code">
                    </div>
                    <p>Ou aguarde novo código...</p>
                ` : (pairingCodeError ? `
                    <div class="erro-box">
                        <h3>⚠️ ${pairingCodeError}</h3>
                        <p>Tentando método alternativo...</p>
                        <p>Tentativa: ${tentativasConexao}</p>
                    </div>
                ` : `
                    <div class="status offline">
                        ⏳ Iniciando...<br>
                        <small>Tentativa: ${tentativasConexao}</small>
                    </div>
                `)))}
                
                <div class="info" style="text-align: center;">
                    <p>🤖 Bot: +${BOT_NUMBER}</p>
                    <p>👑 Admin: +${ADMIN_NUMBER}</p>
                </div>
            </body>
            </html>
        `);
    }
    else {
        res.writeHead(302, { 'Location': '/' });
        res.end();
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Servidor: http://localhost:${PORT}\n`);
});

async function gerarPairingCode(sock) {
    try {
        console.log('📱 Solicitando novo código de pareamento...');
        
        // Remove código antigo
        pairingCode = null;
        pairingCodeError = null;
        
        // Aguarda socket pronto
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Gera código
        const code = await sock.requestPairingCode(BOT_NUMBER);
        
        if (!code || code.length !== 8) {
            throw new Error('Código inválido retornado');
        }
        
        pairingCode = code;
        
        console.log('\n╔════════════════════════════════════════╗');
        console.log('║     🔑 CÓDIGO DE PAREAMENTO            ║');
        console.log('╠════════════════════════════════════════╣');
        console.log(`║                                        ║`);
        console.log(`║         ${code}              ║`);
        console.log(`║                                        ║`);
        console.log('╚════════════════════════════════════════╝\n');
        
        console.log('📱 Como usar:');
        console.log('   1. Abra WhatsApp no celular');
        console.log('   2. Configurações → Dispositivos Conectados');
        console.log('   3. Conectar um dispositivo');
        console.log('   4. Escolha "Conectar com número de telefone"');
        console.log(`   5. Digite: ${code}`);
        console.log('\n⏳ Válido por 2 minutos...\n');
        
        // Auto-renova após 90 segundos
        setTimeout(() => {
            if (!botConectado && pairingCode === code) {
                console.log('\n🔄 Código expirando, gerando novo...\n');
                gerarPairingCode(sock);
            }
        }, 90000);
        
        return true;
        
    } catch (err) {
        console.log('\n❌ Erro no pairing code:', err.message);
        pairingCodeError = 'Código indisponível para este número';
        return false;
    }
}

async function gerarQRCode(qr) {
    try {
        console.log('📱 Gerando QR Code (fallback)...');
        qrCodeRaw = qr;
        
        const QRCode = require('qrcode');
        qrCodeDataURL = await QRCode.toDataURL(qr, { width: 400 });
        
        // Salva arquivo
        await QRCode.toFile('qrcode.png', qr, { width: 400 });
        
        console.log('\n╔══════════════════════════════════════╗');
        console.log('║      📱 QR CODE (Método 2)           ║');
        console.log('╚══════════════════════════════════════╝\n');
        qrcode.generate(qr, { small: false });
        
        console.log('\n📁 Arquivo salvo: qrcode.png');
        console.log(`🌐 http://localhost:${PORT}\n`);
        
    } catch (err) {
        console.error('❌ Erro QR:', err.message);
    }
}

function verificarAdmin(sender) {
    const numeroLimpo = sender.replace('@s.whatsapp.net', '').replace('@g.us','').split(':')[0];
    if (numeroLimpo === ADMIN_NUMBER) return true;
    return db.isAdminMaster(numeroLimpo);
}

function getMenuPrincipal(nome) {
    return `🎮 *${STORE_NAME}*

Olá, ${nome}! 👋

*Escolha uma opção:*

1️⃣ *Comprar Key* 💰
2️⃣ *Resgatar Key* 🎁
3️⃣ *Buscar Jogo* 🔍
4️⃣ *Ver Jogos* 📋
5️⃣ *Meu Perfil* 👤
6️⃣ *Key Teste Grátis* 🎉

0️⃣ *Falar com Atendente* 💬

_Digite o número_`;
}

function getMenuAdmin() {
    return `🔧 *PAINEL ADMIN*

*Escolha uma opção:*

1️⃣ *Adicionar Conta* ➕
2️⃣ *Gerar Key* 🔑
3️⃣ *Gerar Key Teste* 🎁
4️⃣ *Importar Contas* 📄
5️⃣ *Estatísticas* 📊
6️⃣ *Listar Jogos* 📋
7️⃣ *Broadcast* 📢
8️⃣ *Remover Conta* ❌
9️⃣ *Entrar em Grupo* 👥

0️⃣ *Voltar ao Menu*`;
}

async function connectToWhatsApp() {
    if (reconectando) return;
    
    reconectando = true;
    tentativasConexao++;
    
    const delayMs = Math.min(5000 * Math.pow(2, tentativasConexao - 1), 60000);
    
    console.log(`\n🔌 TENTATIVA #${tentativasConexao}\n`);
    
    try {
        const { 
            default: makeWASocket, 
            DisconnectReason, 
            useMultiFileAuthState,
            fetchLatestBaileysVersion 
        } = await import('@whiskeysockets/baileys');
        
        const { version } = await fetchLatestBaileysVersion();
        console.log(`📱 Versão: ${version.join('.')}`);
        
        // Limpa tudo se falhou antes
        if (tentativasConexao > 2) {
            console.log('🧹 Limpando credenciais...');
            try {
                fs.rmSync('auth_info_baileys', { recursive: true, force: true });
                pairingCode = null;
                qrCodeDataURL = null;
                useQRFallback = false;
            } catch (e) {}
        }
        
        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
        
        console.log('🔌 Criando conexão...\n');
        
        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            auth: state,
            browser: ['Chrome (Linux)', '', ''],
            markOnlineOnConnect: true,
            syncFullHistory: false,
            shouldIgnoreJid: jid => jid?.includes('newsletter'),
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 30000,
        });

        sockGlobal = sock;

        // Tenta pairing code se não estiver registrado
        if (!sock.authState.creds.registered && !useQRFallback) {
            const sucesso = await gerarPairingCode(sock);
            
            if (!sucesso) {
                console.log('⚠️  Pairing code falhou, aguardando QR Code...\n');
                useQRFallback = true;
            }
        }

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            // QR Code como fallback
            if (qr && (useQRFallback || !pairingCode)) {
                await gerarQRCode(qr);
            }
            
            if (connection === 'close') {
                botConectado = false;
                reconectando = false;
                
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const erroMsg = lastDisconnect?.error?.message || '';
                
                console.log(`\n❌ CONEXÃO FECHADA!`);
                console.log(`   Código: ${statusCode}`);
                console.log(`   Erro: ${erroMsg}`);
                
                // Se deu "invalid pairing code", tenta QR na próxima
                if (erroMsg.includes('pairing') || erroMsg.includes('code')) {
                    console.log('   🔄 Código inválido, tentando QR Code na próxima...');
                    useQRFallback = true;
                }
                
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                
                if (shouldReconnect) {
                    console.log(`⏳ Reconectando em ${delayMs/1000}s...\n`);
                    setTimeout(connectToWhatsApp, delayMs);
                }
            }
            else if (connection === 'open') {
                botConectado = true;
                pairingCode = null;
                qrCodeDataURL = null;
                pairingCodeError = null;
                reconectando = false;
                tentativasConexao = 0;
                useQRFallback = false;
                
                // Limpa arquivos
                try {
                    if (fs.existsSync('qrcode.png')) fs.unlinkSync('qrcode.png');
                } catch (e) {}
                
                console.log('\n✅✅✅ BOT CONECTADO! ✅✅✅');
                console.log('📱 Número:', sock.user?.id?.split(':')[0], '\n');
            }
            else if (connection === 'connecting') {
                console.log('⏳ Conectando...');
            }
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('messages.upsert', async (m) => {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const sender = msg.key.remoteJid;
            const isGroup = sender.endsWith('@g.us');
            const pushName = msg.pushName || 'Cliente';
            
            let text = msg.message.conversation || 
                      msg.message.extendedTextMessage?.text || '';
            text = text.toLowerCase().trim();
            
            if (isGroup && !text.startsWith('!')) return;
            if (isGroup) text = text.substring(1).trim();

            const isAdmin = verificarAdmin(sender);

            try {
                if (text === 'admin') {
                    if (isAdmin) {
                        await sock.sendMessage(sender, { text: getMenuAdmin() });
                    } else {
                        await sock.sendMessage(sender, { text: '⛔ Acesso Negado' });
                    }
                    return;
                }

                if (text === 'menu' || text === 'start') {
                    await sock.sendMessage(sender, { text: getMenuPrincipal(pushName) });
                }
                
            } catch (error) {
                console.error('❌ Erro:', error.message);
            }
        });

    } catch (err) {
        console.error('❌ Erro fatal:', err.message);
        reconectando = false;
        setTimeout(connectToWhatsApp, 10000);
    }
}

console.log('🚀 Iniciando com Pairing Code + QR Fallback...\n');
console.log('📱 O código aparecerá em alguns segundos...\n');

connectToWhatsApp();
