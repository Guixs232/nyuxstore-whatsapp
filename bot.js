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

let pairingCode = null;        // Código de pareamento
let qrCodeDataURL = null;      // QR Code (backup)
let botConectado = false;
let sockGlobal = null;
let tentativasConexao = 0;
let reconectando = false;

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
                    .btn {
                        background: #00d9ff;
                        color: #1a1a2e;
                        padding: 15px 30px;
                        text-decoration: none;
                        border-radius: 25px;
                        font-weight: bold;
                        display: inline-block;
                        margin: 10px;
                    }
                    .info {
                        background: rgba(255,255,255,0.1);
                        padding: 20px;
                        border-radius: 15px;
                        margin: 20px auto;
                        max-width: 600px;
                        text-align: left;
                    }
                    .info ol {
                        padding-left: 20px;
                        line-height: 2;
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
                        ✅ Bot Conectado!<br>
                        <small>Número: ${BOT_NUMBER}</small>
                    </div>
                ` : (pairingCode ? `
                    <div class="status waiting">
                        ⏳ Aguardando conexão...
                    </div>
                    <div class="pairing-box">
                        <h2>🔑 Código de Pareamento</h2>
                        <div class="pairing-code">${pairingCode}</div>
                        <p>Digite este código no seu WhatsApp</p>
                    </div>
                    <div class="info">
                        <h3>📱 Como conectar:</h3>
                        <ol>
                            <li>Abra o <strong>WhatsApp</strong> no celular</li>
                            <li>Toque em <strong>Configurações</strong> (⋮)</li>
                            <li>Selecione <strong>Dispositivos Conectados</strong></li>
                            <li>Toque em <strong>Conectar um dispositivo</strong></li>
                            <li>Escolha <strong>"Conectar com número de telefone"</strong></li>
                            <li>Digite o código acima: <strong>${pairingCode}</strong></li>
                        </ol>
                    </div>
                ` : (qrCodeDataURL ? `
                    <div class="status waiting">
                        📱 QR Code disponível
                    </div>
                    <img src="${qrCodeDataURL}" style="max-width: 300px; background: white; padding: 20px; border-radius: 20px;">
                    <br><br>
                    <p>Ou aguarde o código de pareamento...</p>
                ` : `
                    <div class="status offline">
                        ⏳ Iniciando conexão...<br>
                        <small>Tentativa: ${tentativasConexao}</small>
                    </div>
                `))}
                
                <div class="info" style="text-align: center; margin-top: 30px;">
                    <p><strong>🤖 Bot:</strong> +${BOT_NUMBER}</p>
                    <p><strong>👑 Admin:</strong> +${ADMIN_NUMBER}</p>
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
        console.log(`📱 Versão Baileys: ${version.join('.')}`);
        
        // Limpa credenciais se necessário
        if (tentativasConexao > 3) {
            console.log('🧹 Limpando credenciais...');
            try {
                fs.rmSync('auth_info_baileys', { recursive: true, force: true });
                tentativasConexao = 0;
            } catch (e) {}
        }
        
        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
        
        console.log('🔌 Criando socket...\n');
        
        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false, // Desativa QR no terminal
            auth: state,
            browser: ['Chrome (Linux)', '', ''],
            markOnlineOnConnect: true,
            syncFullHistory: false,
            shouldIgnoreJid: jid => jid?.includes('newsletter'),
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 30000,
            // IMPORTANTE: Ativa pairing code
            generateHighQualityLinkPreview: true
        });

        sockGlobal = sock;

        // SOLICITA PAIRING CODE ASSIM QUE O SOCKET ESTÁ PRONTO
        if (!sock.authState.creds.registered) {
            console.log('📱 Solicitando código de pareamento...');
            console.log(`📱 Para o número: +${BOT_NUMBER}\n`);
            
            try {
                // Aguarda um pouco para o socket estar pronto
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Solicita o pairing code
                const code = await sock.requestPairingCode(BOT_NUMBER);
                pairingCode = code;
                
                console.log('╔════════════════════════════════════════╗');
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
                console.log(`   5. Digite: ${code}\n`);
                
                console.log(`🌐 Ou acesse: http://localhost:${PORT}\n`);
                
            } catch (err) {
                console.log('⚠️  Erro ao solicitar pairing code:', err.message);
                console.log('   Tentando QR Code como fallback...\n');
            }
        }

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            // Se receber QR Code (fallback)
            if (qr && !pairingCode) {
                console.log('📱 QR Code recebido (fallback)...');
                const QRCode = require('qrcode');
                qrCodeDataURL = await QRCode.toDataURL(qr, { width: 400 });
                
                console.log('\n╔══════════════════════════════════════╗');
                console.log('║      📱 QR CODE (Fallback)           ║');
                console.log('╚══════════════════════════════════════╝\n');
                qrcode.generate(qr, { small: false });
            }
            
            if (connection === 'close') {
                botConectado = false;
                pairingCode = null;
                reconectando = false;
                
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                
                console.log(`\n❌ CONEXÃO FECHADA! Código: ${statusCode}`);
                
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut 
                    && statusCode !== 405;
                
                if (shouldReconnect) {
                    console.log(`⏳ Reconectando em ${delayMs/1000}s...\n`);
                    setTimeout(connectToWhatsApp, delayMs);
                } else {
                    console.log('🚫 Não reconectando. Verifique o número.\n');
                }
            }
            else if (connection === 'open') {
                botConectado = true;
                pairingCode = null;
                qrCodeDataURL = null;
                reconectando = false;
                tentativasConexao = 0;
                
                console.log('\n✅✅✅ BOT CONECTADO! ✅✅✅');
                console.log('📱 Número:', sock.user?.id?.split(':')[0]);
                console.log('👤 Nome:', sock.user?.name, '\n');
            }
            else if (connection === 'connecting') {
                console.log('⏳ Conectando...');
            }
        });

        sock.ev.on('creds.update', saveCreds);

        // MENSAGENS
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
            const userState = userStates.get(sender) || { step: 'menu' };

            try {
                if (text === 'admin') {
                    if (isAdmin) {
                        userStates.set(sender, { step: 'admin_menu' });
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
        console.error('❌ Erro:', err.message);
        reconectando = false;
        setTimeout(connectToWhatsApp, 10000);
    }
}

console.log('🚀 Iniciando NyuxStore com Pairing Code...\n');
console.log('📱 O código de 8 dígitos aparecerá aqui em breve!\n');

connectToWhatsApp();
