const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const http = require('http');
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

let qrCodeDataURL = null;
let botConectado = false;
let sockGlobal = null;

setInterval(() => {
    mensagensProcessadas.clear();
    console.log('🧹 Cache de mensagens limpo');
}, TEMPO_LIMPEZA_MS);

// ===== SERVIDOR WEB CORRIGIDO =====
const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    const url = req.url;

    if (url === '/') {
        res.end(`
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                <title>${STORE_NAME} - Bot WhatsApp</title>
                <style>
                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                    }
                    
                    body { 
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        text-align: center; 
                        padding: 20px; 
                        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
                        color: white;
                        min-height: 100vh;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                    }
                    
                    .container {
                        width: 100%;
                        max-width: 600px;
                        padding: 20px;
                    }
                    
                    h1 { 
                        color: #00d9ff; 
                        text-shadow: 0 0 20px rgba(0,217,255,0.5);
                        font-size: 2.5rem;
                        margin-bottom: 10px;
                        word-wrap: break-word;
                    }
                    
                    .subtitle {
                        color: #a0a0a0;
                        font-size: 1.1rem;
                        margin-bottom: 30px;
                    }
                    
                    .status { 
                        padding: 20px; 
                        border-radius: 15px; 
                        margin: 20px auto;
                        font-size: 1.2rem;
                        font-weight: bold;
                        max-width: 100%;
                        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
                        transition: all 0.3s ease;
                        word-wrap: break-word;
                    }
                    
                    .online { 
                        background: linear-gradient(135deg, #00b894, #00a085);
                        border: 2px solid #00d9a3;
                    }
                    
                    .offline { 
                        background: linear-gradient(135deg, #e17055, #d63031);
                        border: 2px solid #ff7675;
                    }
                    
                    .btn {
                        background: linear-gradient(135deg, #00d9ff, #0099cc);
                        color: #1a1a2e;
                        padding: 18px 40px;
                        text-decoration: none;
                        border-radius: 50px;
                        font-weight: bold;
                        font-size: 1.1rem;
                        display: inline-block;
                        margin: 20px 10px;
                        box-shadow: 0 8px 25px rgba(0,217,255,0.4);
                        transition: all 0.3s ease;
                        border: none;
                        cursor: pointer;
                    }
                    
                    .btn:hover {
                        transform: translateY(-3px);
                        box-shadow: 0 12px 35px rgba(0,217,255,0.6);
                    }
                    
                    .btn-success {
                        background: linear-gradient(135deg, #00b894, #00a085);
                        color: white;
                        box-shadow: 0 8px 25px rgba(0,184,148,0.4);
                    }
                    
                    .info-box {
                        background: rgba(255,255,255,0.1);
                        backdrop-filter: blur(10px);
                        padding: 25px;
                        border-radius: 20px;
                        margin: 30px auto;
                        max-width: 100%;
                        border: 1px solid rgba(255,255,255,0.2);
                    }
                    
                    .info-box p {
                        margin: 10px 0;
                        font-size: 1rem;
                        word-wrap: break-word;
                    }
                    
                    .pulse {
                        animation: pulse 2s infinite;
                    }
                    
                    @keyframes pulse {
                        0%, 100% { opacity: 1; transform: scale(1); }
                        50% { opacity: 0.8; transform: scale(0.98); }
                    }
                    
                    .icon {
                        font-size: 3rem;
                        margin-bottom: 15px;
                    }
                    
                    /* Responsivo */
                    @media (max-width: 480px) {
                        h1 { font-size: 1.8rem; }
                        .subtitle { font-size: 0.9rem; }
                        .status { font-size: 1rem; padding: 15px; }
                        .btn { padding: 15px 30px; font-size: 1rem; width: 90%; margin: 10px auto; }
                        .icon { font-size: 2.5rem; }
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="icon">🎮</div>
                    <h1>${STORE_NAME}</h1>
                    <p class="subtitle">Bot WhatsApp Automatizado</p>
                    
                    <div class="status ${botConectado ? 'online' : 'offline'} ${!botConectado ? 'pulse' : ''}">
                        ${botConectado ? '✅ Bot Conectado e Online!' : '⏳ Aguardando Conexão...'}
                    </div>
                    
                    ${!botConectado ? `
                        <a href="/qr" class="btn">📱 Escanear QR Code</a>
                        <br>
                        <a href="/qr" class="btn" style="background: linear-gradient(135deg, #fdcb6e, #e17055); color: white;">🔄 Atualizar Página</a>
                    ` : '<div class="btn btn-success">🚀 Sistema Online!</div>'}
                    
                    <div class="info-box">
                        <p><strong>🤖 Bot:</strong> +${BOT_NUMBER}</p>
                        <p><strong>👑 Suporte:</strong> +${ADMIN_NUMBER}</p>
                        <p style="margin-top: 15px; font-size: 0.9rem; color: #b0b0b0;">
                            ${!botConectado ? 'Clique no botão acima para ver o QR Code' : 'Sistema operando normalmente'}
                        </p>
                    </div>
                </div>
            </body>
            </html>
        `);
    }
    else if (url === '/qr') {
        if (botConectado) {
            res.end(`
                <!DOCTYPE html>
                <html lang="pt-BR">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                    <title>Conectado - ${STORE_NAME}</title>
                    <style>
                        * { margin: 0; padding: 0; box-sizing: border-box; }
                        body { 
                            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                            text-align: center; 
                            padding: 20px; 
                            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                            color: white;
                            min-height: 100vh;
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            justify-content: center;
                        }
                        .success { 
                            background: linear-gradient(135deg, #00b894, #00a085);
                            padding: 40px; 
                            border-radius: 25px; 
                            margin: 20px;
                            max-width: 90%;
                            box-shadow: 0 15px 50px rgba(0,0,0,0.3);
                            border: 2px solid #00d9a3;
                        }
                        h1 { font-size: 2rem; margin-bottom: 15px; }
                        p { font-size: 1.2rem; opacity: 0.9; }
                        .icon { font-size: 4rem; margin-bottom: 20px; }
                        a { color: #00d9ff; text-decoration: none; margin-top: 20px; display: inline-block; }
                    </style>
                </head>
                <body>
                    <div class="success">
                        <div class="icon">✅</div>
                        <h1>Bot Já Conectado!</h1>
                        <p>O sistema está online e funcionando.</p>
                        <a href="/">← Voltar ao início</a>
                    </div>
                </body>
                </html>
            `);
        } else if (qrCodeDataURL) {
            res.end(`
                <!DOCTYPE html>
                <html lang="pt-BR">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                    <meta http-equiv="refresh" content="8">
                    <title>QR Code - ${STORE_NAME}</title>
                    <style>
                        * { margin: 0; padding: 0; box-sizing: border-box; }
                        
                        body { 
                            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                            text-align: center; 
                            padding: 15px; 
                            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
                            color: white;
                            min-height: 100vh;
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            justify-content: flex-start;
                            padding-top: 20px;
                        }
                        
                        .container {
                            width: 100%;
                            max-width: 500px;
                            padding: 10px;
                        }
                        
                        h1 { 
                            color: #00d9ff; 
                            font-size: 1.8rem;
                            margin-bottom: 5px;
                            text-shadow: 0 0 15px rgba(0,217,255,0.5);
                        }
                        
                        h2 {
                            font-size: 1.3rem;
                            margin-bottom: 20px;
                            color: #e0e0e0;
                        }
                        
                        .qr-wrapper {
                            background: white;
                            padding: 25px;
                            border-radius: 25px;
                            box-shadow: 0 15px 50px rgba(0,0,0,0.4);
                            margin: 20px auto;
                            max-width: 320px;
                            width: 90%;
                            position: relative;
                        }
                        
                        .qr-wrapper::before {
                            content: '📱';
                            position: absolute;
                            top: -15px;
                            left: 50%;
                            transform: translateX(-50%);
                            font-size: 2rem;
                            background: #00d9ff;
                            width: 50px;
                            height: 50px;
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            box-shadow: 0 5px 15px rgba(0,217,255,0.4);
                        }
                        
                        .qr-wrapper img { 
                            width: 100%;
                            max-width: 280px;
                            height: auto;
                            display: block;
                            margin: 10px auto;
                        }
                        
                        .info-box {
                            background: rgba(255,255,255,0.1);
                            backdrop-filter: blur(10px);
                            padding: 20px;
                            border-radius: 20px;
                            margin: 25px auto;
                            max-width: 100%;
                            border: 1px solid rgba(255,255,255,0.2);
                            text-align: left;
                        }
                        
                        .info-box h3 {
                            color: #00d9ff;
                            margin-bottom: 15px;
                            text-align: center;
                            font-size: 1.1rem;
                        }
                        
                        .info-box ol {
                            padding-left: 20px;
                            line-height: 1.8;
                        }
                        
                        .info-box li {
                            margin-bottom: 8px;
                            font-size: 0.95rem;
                        }
                        
                        .atualizando {
                            color: #fdcb6e;
                            animation: pulse 1.5s infinite;
                            font-weight: bold;
                            margin-top: 15px;
                            font-size: 0.9rem;
                        }
                        
                        .timer {
                            color: #a0a0a0;
                            font-size: 0.8rem;
                            margin-top: 10px;
                        }
                        
                        @keyframes pulse {
                            0%, 100% { opacity: 1; }
                            50% { opacity: 0.6; }
                        }
                        
                        .btn-voltar {
                            background: rgba(255,255,255,0.2);
                            color: white;
                            padding: 12px 30px;
                            text-decoration: none;
                            border-radius: 25px;
                            margin-top: 20px;
                            display: inline-block;
                            border: 1px solid rgba(255,255,255,0.3);
                            transition: all 0.3s ease;
                        }
                        
                        .btn-voltar:hover {
                            background: rgba(255,255,255,0.3);
                        }
                        
                        /* Responsivo */
                        @media (max-width: 480px) {
                            h1 { font-size: 1.5rem; }
                            h2 { font-size: 1.1rem; }
                            .qr-wrapper { padding: 20px; max-width: 280px; }
                            .qr-wrapper img { max-width: 220px; }
                            .info-box { padding: 15px; }
                            .info-box li { font-size: 0.85rem; }
                        }
                        
                        @media (max-width: 320px) {
                            .qr-wrapper { max-width: 240px; }
                            .qr-wrapper img { max-width: 180px; }
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>🎮 ${STORE_NAME}</h1>
                        <h2>Escaneie o QR Code</h2>
                        
                        <div class="qr-wrapper">
                            <img src="${qrCodeDataURL}" alt="QR Code WhatsApp">
                        </div>
                        
                        <div class="atualizando">🔄 Atualizando automaticamente...</div>
                        <div class="timer">A página recarrega em 8 segundos</div>
                        
                        <div class="info-box">
                            <h3>📖 Como conectar:</h3>
                            <ol>
                                <li>Abra o <strong>WhatsApp</strong> no celular</li>
                                <li>Toque em <strong>Configurações</strong> (ou ⋮)</li>
                                <li>Selecione <strong>WhatsApp Web</strong></li>
                                <li>Aponte a câmera para o QR Code acima</li>
                                <li>Aguarde a conexão ser estabelecida</li>
                            </ol>
                        </div>
                        
                        <a href="/" class="btn-voltar">← Voltar ao início</a>
                    </div>
                </body>
                </html>
            `);
        } else {
            res.end(`
                <!DOCTYPE html>
                <html lang="pt-BR">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                    <meta http-equiv="refresh" content="3">
                    <title>Gerando - ${STORE_NAME}</title>
                    <style>
                        * { margin: 0; padding: 0; box-sizing: border-box; }
                        body { 
                            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                            text-align: center; 
                            padding: 20px; 
                            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                            color: white;
                            min-height: 100vh;
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            justify-content: center;
                        }
                        .loading { 
                            font-size: 1.5rem; 
                            animation: pulse 1.5s infinite;
                            margin-top: 20px;
                        }
                        .spinner {
                            width: 60px;
                            height: 60px;
                            border: 5px solid rgba(255,255,255,0.1);
                            border-top: 5px solid #00d9ff;
                            border-radius: 50%;
                            animation: spin 1s linear infinite;
                            margin: 20px auto;
                        }
                        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
                        h1 { color: #00d9ff; margin-bottom: 10px; }
                        p { color: #a0a0a0; }
                    </style>
                </head>
                <body>
                    <h1>🎮 ${STORE_NAME}</h1>
                    <div class="spinner"></div>
                    <p class="loading">Gerando QR Code...</p>
                    <p>Aguarde alguns segundos</p>
                </body>
                </html>
            `);
        }
    }
    else if (url === '/api/status') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
            conectado: botConectado,
            numero: botConectado ? BOT_NUMBER : null,
            temQR: !!qrCodeDataURL,
            timestamp: new Date().toISOString()
        }));
    }
    else if (url === '/health') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ status: 'ok', bot: botConectado }));
    }
    else {
        res.writeHead(302, { 'Location': '/' });
        res.end();
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Servidor web rodando na porta ${PORT}`);
    console.log(`📱 QR Code disponível em: http://localhost:${PORT}/qr`);
});

async function atualizarQRCode(qr) {
    try {
        const QRCode = require('qrcode');
        qrCodeDataURL = await QRCode.toDataURL(qr, {
            width: 400,
            margin: 2,
            color: { dark: '#000000', light: '#FFFFFF' }
        });
        console.log('📱 QR Code atualizado na web!');
        qrcode.generate(qr, { small: true });
    } catch (err) {
        console.error('Erro ao gerar QR Code:', err);
    }
}

function verificarAdmin(sender) {
    const numeroLimpo = sender.replace('@s.whatsapp.net', '').replace('@g.us', '').split(':')[0];
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

_Digite o número da opção_`;
}

function getMenuAdmin() {
    return `🔧 *PAINEL ADMIN*

*Escolha uma opção:*

1️⃣ *Adicionar Conta* ➕
2️⃣ *Gerar Key* 🔑
3️⃣ *Gerar Key Teste* 🎁
4️⃣ *Importar Contas (TXT)* 📄
5️⃣ *Estatísticas* 📊
6️⃣ *Listar Jogos* 📋
7️⃣ *Broadcast* 📢
8️⃣ *Remover Conta* ❌
9️⃣ *Entrar em Grupo* 👥

0️⃣ *Voltar ao Menu*

_Digite o número_`;
}

// FUNÇÃO PARA CALCULAR TEMPO DE USO
function calcularTempoUso(dataRegistro) {
    if (!dataRegistro) return 'Novo usuário';
    
    const agora = new Date();
    const registro = new Date(dataRegistro);
    const diffMs = agora - registro;
    
    const segundos = Math.floor(diffMs / 1000);
    const minutos = Math.floor(segundos / 60);
    const horas = Math.floor(minutos / 60);
    const dias = Math.floor(horas / 24);
    const meses = Math.floor(dias / 30);
    const anos = Math.floor(dias / 365);
    
    if (anos > 0) return `${anos} ano${anos > 1 ? 's' : ''}`;
    if (meses > 0) return `${meses} mês${meses > 1 ? 'es' : ''}`;
    if (dias > 0) return `${dias} dia${dias > 1 ? 's' : ''}`;
    if (horas > 0) return `${horas} hora${horas > 1 ? 's' : ''}`;
    if (minutos > 0) return `${minutos} minuto${minutos > 1 ? 's' : ''}`;
    return 'Agora mesmo';
}

async function connectToWhatsApp() {
    const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, delay } = await import('@whiskeysockets/baileys');
    
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: ['NyuxStore Bot', 'Chrome', '1.0']
    });

    sockGlobal = sock;

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) await atualizarQRCode(qr);
        
        if (connection === 'close') {
            botConectado = false;
            qrCodeDataURL = null;
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) setTimeout(connectToWhatsApp, 5000);
        } else if (connection === 'open') {
            botConectado = true;
            qrCodeDataURL = null;
            console.log('✅ Bot conectado!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const msgId = msg.key.id;
        const participant = msg.key.participant || msg.key.remoteJid;
        const uniqueId = `${msgId}_${participant}`;
        
        if (mensagensProcessadas.has(uniqueId)) return;
        mensagensProcessadas.add(uniqueId);
        if (mensagensProcessadas.size > 1000) {
            const iterator = mensagensProcessadas.values();
            mensagensProcessadas.delete(iterator.next().value);
        }

        const sender = msg.key.remoteJid;
        const isGroup = sender.endsWith('@g.us');
        const pushName = msg.pushName || 'Cliente';
        
        let text = '';
        if (msg.message.conversation) text = msg.message.conversation;
        else if (msg.message.extendedTextMessage) text = msg.message.extendedTextMessage.text;
        else if (msg.message.buttonsResponseMessage) text = msg.message.buttonsResponseMessage.selectedButtonId;
        else if (msg.message.listResponseMessage) text = msg.message.listResponseMessage.singleSelectReply.selectedRowId;
        else if (msg.message.documentMessage) text = '[documento]';

        text = text.toLowerCase().trim();
        
        console.log(`\n📩 ${pushName} (${sender}): "${text}"`);
        
        if (isGroup) {
            const isCommand = text.startsWith('!');
            if (!isCommand) return;
            if (isCommand) text = text.substring(1).trim();
        }

        const isAdmin = verificarAdmin(sender);
        const perfil = db.getPerfil(sender);
        const testeExpirado = perfil.usouTeste && !perfil.temAcesso;
        const userState = userStates.get(sender) || { step: 'menu' };

        try {
            // COMANDO ADMIN
            if (text === 'admin' || text === 'adm') {
                if (isAdmin) {
                    userStates.set(sender, { step: 'admin_menu' });
                    await sock.sendMessage(sender, { text: getMenuAdmin() });
                } else {
                    await sock.sendMessage(sender, { text: '⛔ *Acesso Negado*' });
                }
                return;
            }

            // MENU PRINCIPAL
            if (userState.step === 'menu') {
                if (testeExpirado && !isAdmin) {
                    if (text === '1') {
                        await sock.sendMessage(sender, { text: `💰 Preços:\n• 7 dias: R$ 10\n• 1 mês: R$ 25\n• Lifetime: R$ 80\n\n💬 +${ADMIN_NUMBER}` });
                    } else if (text === '2') {
                        await sock.sendMessage(sender, { text: '👑 Chamando admin...' });
                        await sock.sendMessage(ADMIN_NUMBER + '@s.whatsapp.net', { text: `🚨 CLIENTE QUER COMPRAR!\n\n${pushName}\n${sender.replace('@s.whatsapp.net', '').split(':')[0]}` });
                    } else {
                        await sock.sendMessage(sender, { text: `😢 *Teste Expirado*\n\n1️⃣ Comprar Key\n2️⃣ Falar com Admin\n\n0️⃣ Atendente` });
                    }
                    return;
                }

                if (text === '1') {
                    await sock.sendMessage(sender, { text: `💰 Preços:\n• 7 dias: R$ 10\n• 1 mês: R$ 25\n• Lifetime: R$ 80\n\n💬 +${ADMIN_NUMBER}` });
                } else if (text === '2') {
                    userStates.set(sender, { step: 'resgatar_key' });
                    await sock.sendMessage(sender, { text: '🎁 Digite sua key no formato:\n*NYUX-XXXX-XXXX*\n\n_Exemplo: NYUX-AB12-CD34_' });
                } else if (text === '3') {
                    if (!db.verificarAcesso(sender)) {
                        await sock.sendMessage(sender, { text: '❌ Precisa de key! Digite 2 ou 6' });
                        return;
                    }
                    const jogos = db.getJogosDisponiveisPorCategoria();
                    let msg = '🎮 *Jogos:*\n\n';
                    for (const [cat, lista] of Object.entries(jogos)) {
                        msg += `${cat}\n`;
                        lista.slice(0, 5).forEach((j, i) => msg += `${i + 1}. ${j.jogo}\n`);
                        if (lista.length > 5) msg += `...e mais ${lista.length - 5}\n`;
                        msg += '\n';
                    }
                    msg += '🔍 Digite o nome do jogo:';
                    userStates.set(sender, { step: 'buscar_jogo' });
                    await sock.sendMessage(sender, { text: msg });
                } else if (text === '4') {
                    if (!db.verificarAcesso(sender)) {
                        await sock.sendMessage(sender, { text: '❌ Precisa de key! Digite 2 ou 6' });
                        return;
                    }
                    const jogos = db.getJogosDisponiveisPorCategoria();
                    let msg = '📋 *Lista:*\n\n';
                    let total = 0;
                    for (const [cat, lista] of Object.entries(jogos)) {
                        msg += `${cat} (${lista.length})\n`;
                        lista.forEach((j, i) => msg += `    ${i + 1}. ${j.jogo}\n`);
                        total += lista.length;
                    }
                    msg += `\n🎮 Total: ${total}`;
                    await sock.sendMessage(sender, { text: msg });
                } else if (text === '5') {
                    // PERFIL ATUALIZADO
                    const p = db.getPerfil(sender);
                    const numLimpo = sender.replace('@s.whatsapp.net', '').split(':')[0];
                    
                    const tempoUso = calcularTempoUso(p.dataRegistro);
                    const jogosResgatados = p.keysResgatadas ? p.keysResgatadas.length : 0;
                    
                    let msg = `👤 *MEU PERFIL*\n\n`;
                    msg += `🪪 *Nome:* ${p.nome || pushName}\n`;
                    msg += `📱 *Número:* ${numLimpo}\n`;
                    msg += `⏱️ *Status:* ${p.temAcesso ? '✅ Ativo' : '❌ Inativo'}\n`;
                    msg += `🎮 *Keys Resgatadas:* ${jogosResgatados}\n`;
                    msg += `📅 *Cliente há:* ${tempoUso}\n`;
                    
                    if (p.keyInfo) {
                        msg += `\n🔑 *Última Key:* ${p.keyInfo.key}\n`;
                        msg += `📆 *Expira:* ${p.keyInfo.expira}\n`;
                    }
                    
                    if (p.usouTeste && !p.temAcesso) {
                        msg += `\n😢 *Seu teste expirou!*\nCompre uma key para continuar.`;
                    }
                    
                    if (p.acessoPermanente) {
                        msg += `\n👑 *Você é Admin Premium!* 🌟`;
                    }
                    
                    await sock.sendMessage(sender, { text: msg });
                    
                } else if (text === '6') {
                    userStates.set(sender, { step: 'resgatar_key_teste' });
                    await sock.sendMessage(sender, { text: '🎉 *Teste Grátis*\n\n1️⃣ 1 hora\n2️⃣ 2 horas\n3️⃣ 6 horas\n\n⚠️ Só 1 por pessoa!\n\nDigite:' });
                } else if (text === '0') {
                    await sock.sendMessage(sender, { text: '💬 Aguarde...' });
                    await sock.sendMessage(ADMIN_NUMBER + '@s.whatsapp.net', { text: `📩 ${pushName}\n${sender.replace('@s.whatsapp.net', '').split(':')[0]}` });
                } else {
                    await sock.sendMessage(sender, { text: getMenuPrincipal(pushName) });
                }
            }
            // RESGATAR KEY
            else if (userState.step === 'resgatar_key') {
                const key = text.toUpperCase().replace(/\s/g, '');
                
                if (key === ADMIN_MASTER_KEY) {
                    const resultado = db.resgatarMasterKey(key, sender, pushName);
                    if (resultado.sucesso) {
                        userStates.set(sender, { step: 'menu' });
                        await sock.sendMessage(sender, { 
                            text: `👑 *MASTER KEY ATIVADA!*\n\n🎉 Parabéns ${pushName}!\nVocê agora é ADMINISTRADOR PERMANENTE!\n\n⚠️ Esta key foi bloqueada.\n\n🔧 Digite: *admin*` 
                        });
                        await sock.sendMessage(ADMIN_NUMBER + '@s.whatsapp.net', {
                            text: `🚨 *MASTER KEY USADA!*\n\n👤 ${pushName}\n📱 ${sender.replace('@s.whatsapp.net', '').split(':')[0]}\n⏰ ${new Date().toLocaleString()}`
                        });
                    } else {
                        await sock.sendMessage(sender, { text: `❌ *${resultado.erro}*` });
                    }
                    return;
                }
                
                if (!key.match(/^NYUX-[A-Z0-9]{4}-[A-Z0-9]{4}$/)) {
                    await sock.sendMessage(sender, { text: '❌ *Formato inválido!*\n\nFormato: *NYUX-XXXX-XXXX*' });
                    return;
                }
                
                const resultado = db.resgatarKey(key, sender, pushName);
                if (resultado.sucesso) {
                    userStates.set(sender, { step: 'menu' });
                    await sock.sendMessage(sender, { 
                        text: `✅ *Key Resgatada!*\n\n🎆 Plano: ${resultado.plano}\n⏱️ Duração: ${resultado.duracao}\n📅 Expira: ${resultado.expira}\n\n🎮 Acesso liberado!` 
                    });
                } else {
                    await sock.sendMessage(sender, { text: `❌ *Erro:* ${resultado.erro}` });
                }
            }
            // TESTE GRÁTIS
            else if (userState.step === 'resgatar_key_teste') {
                let dur, hrs;
                if (text === '1') { dur = '1 hora'; hrs = 1; }
                else if (text === '2') { dur = '2 horas'; hrs = 2; }
                else if (text === '3') { dur = '6 horas'; hrs = 6; }
                else {
                    await sock.sendMessage(sender, { text: '❌ Digite 1, 2 ou 3:' });
                    return;
                }
                
                if (db.verificarTesteUsado(sender)) {
                    userStates.set(sender, { step: 'menu' });
                    await sock.sendMessage(sender, { text: '❌ Já usou teste!\n\nCompre:\n• 7 dias: R$ 10\n• 1 mês: R$ 25\n• Lifetime: R$ 80' });
                    return;
                }
                
                const key = `TESTE-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
                const r = db.criarKeyTeste(key, dur, hrs, sender, pushName);
                
                if (r.sucesso) {
                    userStates.set(sender, { step: 'menu' });
                    await sock.sendMessage(sender, { text: `🎉 *Teste Ativado!*\n\n🔑 ${key}\n⏱️ ${dur}\n📅 ${r.expira}\n\n✅ Acesso liberado!` });
                }
            }
            // BUSCAR JOGO
            else if (userState.step === 'buscar_jogo') {
                const conta = db.buscarConta(text);
                if (conta) {
                    userStates.set(sender, { step: 'menu' });
                    await sock.sendMessage(sender, {
                        text: `🎮 *${conta.jogo}*\n📂 ${conta.categoria}\n\n👤 ${conta.login}\n🔒 ${conta.senha}\n\n⚠️ Modo Offline!\n🔒 Não altere a senha!`
                    });
                } else {
                    await sock.sendMessage(sender, { text: `❌ "${text}" não encontrado` });
                }
            }
            // MENU ADMIN
            else if (userState.step === 'admin_menu' && isAdmin) {
                if (text === '1') {
                    userStates.set(sender, { step: 'admin_add_nome', tempConta: {} });
                    await sock.sendMessage(sender, { text: '➕ Nome do jogo:' });
                } else if (text === '2') {
                    userStates.set(sender, { step: 'admin_gerar_key' });
                    await sock.sendMessage(sender, { text: '🔑 Duração:\n1️⃣ 7 dias\n2️⃣ 1 mês\n3️⃣ Lifetime' });
                } else if (text === '3') {
                    userStates.set(sender, { step: 'admin_gerar_teste' });
                    await sock.sendMessage(sender, { text: '🎁 Teste:\n1️⃣ 1h\n2️⃣ 2h\n3️⃣ 6h' });
                } else if (text === '4') {
                    userStates.set(sender, { step: 'admin_importar' });
                    await sock.sendMessage(sender, { text: '📄 Envie o arquivo .txt com as contas' });
                } else if (text === '5') {
                    const s = db.getEstatisticas();
                    await sock.sendMessage(sender, { text: `📊 Estatísticas:\n🎮 ${s.totalJogos} jogos\n✅ ${s.disponiveis} disponíveis\n🔑 ${s.keysAtivas} keys\n👥 ${s.totalClientes} clientes\n🔐 Master Key: ${s.masterKeyUsada}` });
                } else if (text === '6') {
                    const jogos = db.getTodosJogosDisponiveis();
                    let msg = '📋 Jogos:\n\n';
                    jogos.forEach(j => msg += `• ${j.jogo}\n`);
                    await sock.sendMessage(sender, { text: msg });
                } else if (text === '7') {
                    userStates.set(sender, { step: 'admin_broadcast' });
                    await sock.sendMessage(sender, { text: '📢 Digite a mensagem:' });
                } else if (text === '8') {
                    userStates.set(sender, { step: 'admin_remover_lista', tempLista: db.getTodosJogosDisponiveis() });
                    const jogos = db.getTodosJogosDisponiveis();
                    let msg = '❌ *Remover Conta*\n\n';
                    jogos.slice(0, 20).forEach((j, i) => {
                        msg += `${i + 1}. ${j.jogo}\n`;
                    });
                    if (jogos.length > 20) msg += `\n...e mais ${jogos.length - 20} jogos\n`;
                    msg += '\nDigite o número da conta para remover\nou digite o nome do jogo:';
                    await sock.sendMessage(sender, { text: msg });
                } else if (text === '9') {
                    await sock.sendMessage(sender, { text: `👥 *Entrar em Grupo*\n\n1️⃣ Adicione +${BOT_NUMBER} no grupo\n2️⃣ Dê permissão de ADMIN\n3️⃣ Digite !menu no grupo` });
                } else if (text === '0' || text === 'menu') {
                    userStates.set(sender, { step: 'menu' });
                    await sock.sendMessage(sender, { text: getMenuPrincipal(pushName) });
                } else {
                    await sock.sendMessage(sender, { text: getMenuAdmin() });
                }
            }
            // ADMIN: REMOVER CONTA
            else if (userState.step === 'admin_remover_lista' && isAdmin) {
                const escolha = parseInt(text);
                const lista = userState.tempLista || db.getTodosJogosDisponiveis();
                
                if (!isNaN(escolha) && escolha > 0 && escolha <= lista.length) {
                    const conta = lista[escolha - 1];
                    userStates.set(sender, { 
                        step: 'admin_remover_confirmar', 
                        tempConta: conta,
                        tempLista: lista 
                    });
                    await sock.sendMessage(sender, { 
                        text: `❌ *Confirmar remoção?*\n\n🎮 ${conta.jogo}\n👤 ${conta.login}\n\nDigite *sim* para confirmar ou *não* para cancelar:` 
                    });
                } else {
                    const resultado = db.buscarConta(text);
                    if (resultado) {
                        userStates.set(sender, { 
                            step: 'admin_remover_confirmar', 
                            tempConta: resultado,
                            tempLista: lista 
                        });
                        await sock.sendMessage(sender, { 
                            text: `❌ *Confirmar remoção?*\n\n🎮 ${resultado.jogo}\n👤 ${resultado.login}\n\nDigite *sim* para confirmar ou *não* para cancelar:` 
                        });
                    } else {
                        await sock.sendMessage(sender, { text: '❌ Conta não encontrada. Digite o número ou nome correto:' });
                    }
                }
            }
            else if (userState.step === 'admin_remover_confirmar' && isAdmin) {
                if (text === 'sim' || text === 's') {
                    const conta = userState.tempConta;
                    const resultado = db.removerConta(conta.jogo, conta.login);
                    if (resultado.sucesso) {
                        userStates.set(sender, { step: 'admin_menu' });
                        await sock.sendMessage(sender, { 
                            text: `✅ *Conta removida!*\n\n🎮 ${conta.jogo}\n👤 ${conta.login}\n\nTotal restante: ${resultado.totalRestante} contas` 
                        });
                    } else {
                        await sock.sendMessage(sender, { text: `❌ Erro: ${resultado.erro}` });
                    }
                } else {
                    userStates.set(sender, { step: 'admin_menu' });
                    await sock.sendMessage(sender, { text: '✅ Cancelado. Voltando ao menu admin...' });
                }
            }
            // ADMIN: ADICIONAR CONTA
            else if (userState.step === 'admin_add_nome' && isAdmin) {
                const temp = userState.tempConta || {};
                temp.jogo = text;
                userStates.set(sender, { step: 'admin_add_cat', tempConta: temp });
                
                const cats = ['🗡️ Assassins Creed', '🔫 Call of Duty', '🧟 Resident Evil', '⚽ Esportes', '🏎️ Corrida', '🚗 Rockstar Games', '🦸 Super-Heróis', '⚔️ Soulslike', '🐺 CD Projekt Red', '🚜 Simuladores', '👻 Terror', '🎲 RPG', '🥊 Luta', '🕵️ Stealth', '🧠 Estratégia', '🌲 Survival', '🍄 Nintendo', '💙 Sega', '💣 Guerra', '🎮 Ação/Aventura'];
                let msg = '➕ Escolha categoria:\n\n';
                cats.forEach((c, i) => msg += `${i + 1}. ${c}\n`);
                await sock.sendMessage(sender, { text: msg });
            }
            else if (userState.step === 'admin_add_cat' && isAdmin) {
                const cats = ['🗡️ Assassins Creed', '🔫 Call of Duty', '🧟 Resident Evil', '⚽ Esportes', '🏎️ Corrida', '🚗 Rockstar Games', '🦸 Super-Heróis', '⚔️ Soulslike', '🐺 CD Projekt Red', '🚜 Simuladores', '👻 Terror', '🎲 RPG', '🥊 Luta', '🕵️ Stealth', '🧠 Estratégia', '🌲 Survival', '🍄 Nintendo', '💙 Sega', '💣 Guerra', '🎮 Ação/Aventura'];
                const escolha = parseInt(text) - 1;
                if (escolha >= 0 && escolha < cats.length) {
                    const temp = userState.tempConta || {};
                    temp.categoria = cats[escolha];
                    userStates.set(sender, { step: 'admin_add_login', tempConta: temp });
                    await sock.sendMessage(sender, { text: '➕ Digite o *LOGIN*:' });
                } else {
                    await sock.sendMessage(sender, { text: '❌ Digite 1-20:' });
                }
            }
            else if (userState.step === 'admin_add_login' && isAdmin) {
                const temp = userState.tempConta || {};
                temp.login = text;
                userStates.set(sender, { step: 'admin_add_senha', tempConta: temp });
                await sock.sendMessage(sender, { text: '➕ Digite a *SENHA*:' });
            }
            else if (userState.step === 'admin_add_senha' && isAdmin) {
                const temp = userState.tempConta || {};
                temp.senha = text;
                db.addConta(temp.jogo, temp.categoria, temp.login, temp.senha);
                userStates.set(sender, { step: 'admin_menu' });
                await sock.sendMessage(sender, {
                    text: `✅ *Conta adicionada!*\n\n🎮 ${temp.jogo}\n📂 ${temp.categoria}\n👤 ${temp.login}`
                });
            }
            // ADMIN: GERAR KEYS
            else if (userState.step === 'admin_gerar_key' && isAdmin) {
                let duracao, dias;
                if (text === '1') { duracao = '7 dias'; dias = 7; }
                else if (text === '2') { duracao = '1 mês'; dias = 30; }
                else if (text === '3') { duracao = 'Lifetime'; dias = 99999; }
                else {
                    await sock.sendMessage(sender, { text: '❌ Digite 1, 2 ou 3:' });
                    return;
                }
                const key = `NYUX-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
                db.criarKey(key, duracao, dias);
                userStates.set(sender, { step: 'admin_menu' });
                await sock.sendMessage(sender, {
                    text: `🔑 *Key Gerada!*\n\n${key}\n⏱️ ${duracao}\n\nCopie e envie!`
                });
            }
            else if (userState.step === 'admin_gerar_teste' && isAdmin) {
                let duracao, horas;
                if (text === '1') { duracao = '1 hora'; horas = 1; }
                else if (text === '2') { duracao = '2 horas'; horas = 2; }
                else if (text === '3') { duracao = '6 horas'; horas = 6; }
                else {
                    await sock.sendMessage(sender, { text: '❌ Digite 1, 2 ou 3:' });
                    return;
                }
                const key = `TESTE-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
                db.criarKey(key, duracao, horas, true);
                userStates.set(sender, { step: 'admin_menu' });
                await sock.sendMessage(sender, {
                    text: `🎁 *Key Teste!*\n\n${key}\n⏱️ ${duracao}\n\nEnvie para o cliente!`
                });
            }
            // ADMIN: IMPORTAR TXT
            else if (userState.step === 'admin_importar' && isAdmin) {
                if (msg.message.documentMessage) {
                    await sock.sendMessage(sender, { text: '⏳ Processando arquivo...' });
                    try {
                        const stream = await sock.downloadContentFromMessage(msg.message.documentMessage, 'document');
                        let buffer = Buffer.from([]);
                        for await (const chunk of stream) {
                            buffer = Buffer.concat([buffer, chunk]);
                        }
                        const texto = buffer.toString('utf-8');
                        
                        const resultado = db.importarTXTInteligente(texto);
                        
                        userStates.set(sender, { step: 'admin_menu' });
                        
                        if (resultado.sucesso && resultado.adicionadas > 0) {
                            await sock.sendMessage(sender, {
                                text: `✅ *Importação Concluída!*\n\n📊 ${resultado.adicionadas} contas adicionadas\n🎮 ${resultado.jogosUnicos} jogos únicos\n📂 ${resultado.categoriasDetectadas} categorias\n\n⚠️ ${resultado.ignoradas} entradas ignoradas\n❌ ${resultado.erros} erros\n\nAs contas foram adicionadas 1 por 1 em ordem!`
                            });
                        } else {
                            await sock.sendMessage(sender, { 
                                text: `⚠️ Nenhuma conta foi adicionada.\n\nPossíveis causas:\n• Formato do arquivo não reconhecido\n• Todas as contas já existem\n• Erro de parsing\n\nTente verificar o formato do arquivo.` 
                            });
                        }
                    } catch (err) {
                        console.error('Erro importação:', err);
                        await sock.sendMessage(sender, { text: '❌ Erro ao processar arquivo. Verifique se é um arquivo .txt válido.' });
                    }
                } else {
                    await sock.sendMessage(sender, { text: '📄 Envie o arquivo .txt:' });
                }
            }
            // ADMIN: BROADCAST
            else if (userState.step === 'admin_broadcast' && isAdmin) {
                const clientes = db.getTodosClientes();
                let enviados = 0;
                await sock.sendMessage(sender, { text: `📢 Enviando para ${clientes.length} clientes...` });
                for (const cliente of clientes) {
                    try {
                        await sock.sendMessage(cliente.numero, {
                            text: `📢 *NyuxStore*\n\n${text}`
                        });
                        enviados++;
                        await delay(1000);
                    } catch (e) {
                        console.log('Erro:', cliente.numero);
                    }
                }
                userStates.set(sender, { step: 'admin_menu' });
                await sock.sendMessage(sender, { text: `✅ Enviado: ${enviados}/${clientes.length}` });
            }

            // MENU
            if (text === 'menu' || text === 'voltar') {
                userStates.set(sender, { step: 'menu' });
                const perfilAtual = db.getPerfil(sender);
                if (perfilAtual.usouTeste && !perfilAtual.temAcesso && !isAdmin) {
                    await sock.sendMessage(sender, { text: `😢 *Teste Expirado*\n\n1️⃣ Comprar Key\n2️⃣ Falar com Admin\n\n0️⃣ Atendente` });
                } else {
                    await sock.sendMessage(sender, { text: getMenuPrincipal(pushName) });
                }
            }

        } catch (error) {
            console.error('❌ Erro:', error);
        }
    });

    return sock;
}

console.log('🚀 Iniciando NyuxStore...');
connectToWhatsApp();
