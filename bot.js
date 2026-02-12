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

let qrCodeDataURL = null;
let qrCodeFilePath = null; // Caminho do arquivo PNG
let botConectado = false;
let sockGlobal = null;
let tentativasConexao = 0;
let qrCodeRaw = null;
let reconectando = false;

setInterval(() => {
    mensagensProcessadas.clear();
    console.log('🧹 Cache de mensagens limpo');
}, TEMPO_LIMPEZA_MS);

// ===== SERVIDOR WEB =====
const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    const url = req.url;

    // API STATUS
    if (url === '/api/status') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
            conectado: botConectado,
            temQR: !!qrCodeDataURL,
            temArquivo: !!qrCodeFilePath && fs.existsSync(qrCodeFilePath),
            timestamp: new Date().toISOString()
        }));
        return;
    }

    // QR CODE COMO TEXTO PURO
    if (url === '/qrcode.txt') {
        res.setHeader('Content-Type', 'text/plain');
        if (qrCodeRaw) {
            res.end(qrCodeRaw);
        } else {
            res.end('QR Code ainda não gerado. Aguarde...');
        }
        return;
    }

    // QR CODE COMO IMAGEM PNG DIRETA
    if (url === '/qr.png' || url === '/qrcode.png') {
        if (qrCodeFilePath && fs.existsSync(qrCodeFilePath)) {
            res.setHeader('Content-Type', 'image/png');
            fs.createReadStream(qrCodeFilePath).pipe(res);
        } else {
            res.statusCode = 404;
            res.end('QR Code não encontrado');
        }
        return;
    }

    // PÁGINA COM LINKS ALTERNATIVOS
    if (url === '/alternativas') {
        res.end(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Alternativas QR - ${STORE_NAME}</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        text-align: center; 
                        padding: 30px; 
                        background: #1a1a2e;
                        color: white;
                    }
                    h1 { color: #00d9ff; }
                    .opcao {
                        background: rgba(255,255,255,0.1);
                        padding: 20px;
                        margin: 20px auto;
                        border-radius: 15px;
                        max-width: 500px;
                    }
                    a {
                        color: #00d9ff;
                        text-decoration: none;
                        font-size: 18px;
                    }
                    .code {
                        background: #000;
                        color: #0f0;
                        padding: 10px;
                        border-radius: 5px;
                        font-family: monospace;
                        word-break: break-all;
                        font-size: 12px;
                        margin: 10px 0;
                    }
                </style>
            </head>
            <body>
                <h1>📱 Opções para ver o QR Code</h1>
                
                <div class="opcao">
                    <h2>1️⃣ Imagem PNG Direta</h2>
                    <p>Clique direto na imagem:</p>
                    <a href="/qr.png" target="_blank">🖼️ Ver QR Code (PNG)</a>
                    <p style="font-size: 12px; color: #aaa;">ou acesse: http://localhost:${PORT}/qr.png</p>
                </div>

                <div class="opcao">
                    <h2>2️⃣ Texto do QR Code</h2>
                    <p>Copie o texto e gere em qualquer site:</p>
                    <a href="/qrcode.txt" target="_blank">📄 Ver texto do QR Code</a>
                    <p style="font-size: 12px; color: #aaa;">Cole em: qr-code-generator.com</p>
                </div>

                <div class="opcao">
                    <h2>3️⃣ Data URL (Base64)</h2>
                    <p>Copie e cole no navegador:</p>
                    <div class="code" id="dataurl">Aguardando QR Code...</div>
                    <button onclick="copiarDataURL()">📋 Copiar</button>
                </div>

                <script>
                    async function atualizar() {
                        try {
                            const res = await fetch('/api/status');
                            const data = await res.json();
                            if (data.temQR) {
                                const imgRes = await fetch('/qr.png');
                                const blob = await imgRes.blob();
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                    document.getElementById('dataurl').textContent = reader.result.substring(0, 100) + '...';
                                    window.dataURLCompleto = reader.result;
                                };
                                reader.readAsDataURL(blob);
                            }
                        } catch(e) {}
                    }
                    function copiarDataURL() {
                        if (window.dataURLCompleto) {
                            navigator.clipboard.writeText(window.dataURLCompleto);
                            alert('Data URL copiado! Cole na barra do navegador.');
                        }
                    }
                    atualizar();
                    setInterval(atualizar, 3000);
                </script>
            </body>
            </html>
        `);
        return;
    }

    if (url === '/health') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ status: 'ok', bot: botConectado }));
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
                        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                    }
                    .online { background: linear-gradient(135deg, #4CAF50, #45a049); }
                    .offline { background: linear-gradient(135deg, #f44336, #da190b); }
                    .waiting { background: linear-gradient(135deg, #ff9800, #f57c00); animation: pulse 2s infinite; }
                    h1 { color: #00d9ff; text-shadow: 0 0 10px rgba(0,217,255,0.5); }
                    .btn {
                        background: linear-gradient(135deg, #00d9ff, #0099cc);
                        color: #1a1a2e;
                        padding: 20px 40px;
                        text-decoration: none;
                        border-radius: 30px;
                        font-weight: bold;
                        font-size: 18px;
                        display: inline-block;
                        margin: 10px;
                        box-shadow: 0 4px 15px rgba(0,217,255,0.4);
                    }
                    .btn-alternativa {
                        background: linear-gradient(135deg, #ff9800, #f57c00);
                        color: #1a1a2e;
                    }
                    @keyframes pulse {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0.7; }
                    }
                    .info {
                        background: rgba(255,255,255,0.1);
                        padding: 20px;
                        border-radius: 15px;
                        margin: 20px auto;
                        max-width: 600px;
                    }
                </style>
            </head>
            <body>
                <h1>🎮 ${STORE_NAME} Bot</h1>
                <div class="status ${botConectado ? 'online' : (qrCodeDataURL ? 'waiting' : 'offline')}">
                    ${botConectado ? '✅ Bot Conectado!' : (qrCodeDataURL ? '📱 QR Code Pronto!' : '⏳ Aguardando QR Code...')}
                </div>
                
                ${!botConectado && qrCodeDataURL ? `
                    <a href="/qr.png" class="btn">🖼️ Ver QR Code (PNG)</a>
                    <a href="/alternativas" class="btn btn-alternativa">⚙️ Outras Opções</a>
                ` : ''}
                
                ${!botConectado && !qrCodeDataURL ? `
                    <p style="color: #aaa;">Tentativa: ${tentativasConexao}</p>
                    <p style="color: #888; font-size: 14px;">Aguarde ou verifique o terminal</p>
                ` : ''}
                
                ${botConectado ? '<div class="btn" style="background: #4CAF50;">🚀 Online!</div>' : ''}
                
                <div class="info">
                    <p><strong>🤖 Bot:</strong> +${BOT_NUMBER}</p>
                    <p><strong>👑 Admin:</strong> +${ADMIN_NUMBER}</p>
                    <p style="margin-top: 15px; color: #aaa; font-size: 14px;">
                        ${!botConectado && !qrCodeDataURL ? 'Conectando ao WhatsApp...' : 'Atualizando automaticamente...'}
                    </p>
                </div>
            </body>
            </html>
        `);
    }
    else if (url === '/qr') {
        if (botConectado) {
            res.end(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Conectado - ${STORE_NAME}</title>
                    <meta http-equiv="refresh" content="3">
                    <style>
                        body { font-family: Arial; text-align: center; padding: 50px; background: #1a1a2e; color: white; }
                        .success { background: #4CAF50; padding: 40px; border-radius: 20px; margin: 50px auto; max-width: 500px; }
                    </style>
                </head>
                <body>
                    <div class="success">
                        <h1>✅ Bot Já Conectado!</h1>
                        <p>O bot está online.</p>
                        <a href="/" style="color: white;">← Voltar</a>
                    </div>
                </body>
                </html>
            `);
        } else if (qrCodeDataURL) {
            res.end(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>QR Code - ${STORE_NAME}</title>
                    <meta http-equiv="refresh" content="10">
                    <style>
                        body { 
                            font-family: Arial; 
                            text-align: center; 
                            padding: 20px; 
                            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                            color: white;
                            min-height: 100vh;
                            margin: 0;
                        }
                        .qr-container {
                            background: white;
                            padding: 30px;
                            border-radius: 25px;
                            box-shadow: 0 10px 40px rgba(0,0,0,0.5);
                            margin: 20px auto;
                            max-width: 450px;
                        }
                        .qr-container img { width: 100%; max-width: 400px; }
                        .info {
                            background: rgba(255,255,255,0.1);
                            padding: 25px;
                            border-radius: 15px;
                            margin: 30px auto;
                            max-width: 500px;
                        }
                        .atualizando {
                            color: #ffd700;
                            animation: pulse 1.5s infinite;
                            font-weight: bold;
                        }
                        @keyframes pulse {
                            0%, 100% { opacity: 1; }
                            50% { opacity: 0.7; }
                        }
                    </style>
                </head>
                <body>
                    <h1>🎮 ${STORE_NAME}</h1>
                    <h2>📱 Escaneie o QR Code</h2>
                    <div class="qr-container">
                        <img src="${qrCodeDataURL}" alt="QR Code WhatsApp">
                    </div>
                    <div class="info">
                        <p class="atualizando">🔄 Atualizando automaticamente...</p>
                        <p>1. Abra o WhatsApp no celular</p>
                        <p>2. Configurações → WhatsApp Web</p>
                        <p>3. Aponte a câmera para o QR Code</p>
                    </div>
                    <a href="/alternativas" style="color: #ff9800;">⚙️ Não consegue ver? Tente outras opções</a>
                    <br><br>
                    <a href="/" style="color: #00d9ff;">← Voltar ao início</a>
                </body>
                </html>
            `);
        } else {
            res.end(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Gerando - ${STORE_NAME}</title>
                    <meta http-equiv="refresh" content="3">
                    <style>
                        body { font-family: Arial; text-align: center; padding: 50px; background: #1a1a2e; color: white; }
                        .loading { font-size: 28px; animation: pulse 1s infinite; }
                        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
                    </style>
                </head>
                <body>
                    <h1>⏳ Gerando QR Code...</h1>
                    <p class="loading">Aguarde...</p>
                    <p>Tentativa: ${tentativasConexao}</p>
                </body>
                </html>
            `);
        }
    }
    else {
        res.writeHead(302, { 'Location': '/' });
        res.end();
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Servidor web rodando na porta ${PORT}`);
    console.log(`📱 Acesse: http://localhost:${PORT}`);
    console.log(`🖼️  QR PNG: http://localhost:${PORT}/qr.png`);
    console.log(`📄 QR Texto: http://localhost:${PORT}/qrcode.txt`);
    console.log(`⚙️  Alternativas: http://localhost:${PORT}/alternativas\n`);
});

async function atualizarQRCode(qr) {
    try {
        console.log('✅ QR Code recebido! Processando...');
        qrCodeRaw = qr;

        const QRCode = require('qrcode');
        
        // Gera Data URL para a página web
        qrCodeDataURL = await QRCode.toDataURL(qr, {
            width: 500,
            margin: 2,
            color: { dark: '#000000', light: '#FFFFFF' }
        });
        
        // SALVA COMO ARQUIVO PNG LOCAL
        qrCodeFilePath = path.join(__dirname, 'qrcode.png');
        await QRCode.toFile(qrCodeFilePath, qr, {
            width: 500,
            margin: 2,
            color: { dark: '#000000', light: '#FFFFFF' }
        });
        
        console.log('✅ QR Code salvo em:', qrCodeFilePath);
        console.log('✅ Data URL gerada! Tamanho:', qrCodeDataURL.length);
        
        // Mostra no terminal também (garantido)
        console.log('\n╔════════════════════════════════════════════════════╗');
        console.log('║         📱 ESCANEIE O QR CODE NO TERMINAL          ║');
        console.log('╚════════════════════════════════════════════════════╝\n');
        
        // Força a exibição no terminal
        qrcode.generate(qr, { small: false }, (qterminal) => {
            console.log(qterminal);
        });
        
        // Também mostra o texto para copiar
        console.log('\n📋 TEXTO DO QR CODE (copie e cole em qr-code-generator.com):');
        console.log('─'.repeat(60));
        console.log(qr);
        console.log('─'.repeat(60));
        console.log('\n🌐 OU ACESSE NO NAVEGADOR:');
        console.log(`   → http://localhost:${PORT}/qr.png`);
        console.log(`   → http://localhost:${PORT}/qrcode.txt`);
        console.log(`   → http://localhost:${PORT}/alternativas\n`);
        
    } catch (err) {
        console.error('❌ Erro ao gerar QR Code:', err.message);
        qrCodeDataURL = null;
        qrCodeFilePath = null;
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
    if (reconectando) {
        console.log('⏳ Já reconectando, aguardando...');
        return;
    }
    
    reconectando = true;
    tentativasConexao++;
    
    const delayMs = Math.min(5000 * Math.pow(2, Math.min(tentativasConexao - 1, 4)), 60000);
    
    console.log(`\n🔌 TENTATIVA #${tentativasConexao} (delay: ${delayMs}ms)\n`);
    
    const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, delay } = await import('@whiskeysockets/baileys');
    
    if (tentativasConexao > 5) {
        console.log('⚠️ Muitas falhas! Limpando credenciais...');
        try {
            fs.rmSync('auth_info_baileys', { recursive: true, force: true });
            console.log('✅ Credenciais limpas!');
            tentativasConexao = 0;
        } catch (e) {
            console.log('ℹ️ Pasta auth_info_baileys não existe');
        }
    }
    
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    console.log('📱 Criando socket...');
    console.log('📂 Auth state:', Object.keys(state.creds).length > 0 ? 'Existente' : 'Novo');
    
    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: ['NyuxStore', 'Safari', '16.0'],
        printQRInTerminal: false,
        markOnlineOnConnect: false,
        syncFullHistory: false,
        shouldIgnoreJid: jid => jid?.includes('broadcast'),
        defaultQueryTimeoutMs: 60000,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        emitOwnEvents: true,
        version: [2, 3000, 1015901307]
    });

    sockGlobal = sock;

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        console.log('\n📡 EVENTO:', connection, '| QR:', !!qr);
        
        if (qr) {
            console.log('✅ QR CODE RECEBIDO!');
            await atualizarQRCode(qr);
            tentativasConexao = 0;
        }
        
        if (connection === 'close') {
            botConectado = false;
            qrCodeDataURL = null;
            reconectando = false;
            
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            
            console.log(`❌ CONEXÃO FECHADA! Código: ${statusCode}`);
            
            if (shouldReconnect) {
                console.log(`⏳ Reconectando em ${delayMs/1000}s...`);
                setTimeout(connectToWhatsApp, delayMs);
            }
        } else if (connection === 'open') {
            botConectado = true;
            qrCodeDataURL = null;
            qrCodeRaw = null;
            tentativasConexao = 0;
            reconectando = false;
            
            // Remove o arquivo QR quando conecta
            if (qrCodeFilePath && fs.existsSync(qrCodeFilePath)) {
                fs.unlinkSync(qrCodeFilePath);
                qrCodeFilePath = null;
            }
            
            console.log('✅ BOT CONECTADO!');
            console.log('📱 Número:', sock.user?.id?.split(':')[0]);
        } else if (connection === 'connecting') {
            console.log('⏳ Conectando...');
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
        
        console.log(`\n📩 ${pushName}: "${text}"`);
        
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
                        await sock.sendMessage(ADMIN_NUMBER + '@s.whatsapp.net', { text: `🚨 CLIENTE QUER COMPRAR!\n\n${pushName}` });
                    } else {
                        await sock.sendMessage(sender, { text: `😢 *Teste Expirado*\n\n1️⃣ Comprar Key\n2️⃣ Falar com Admin\n\n0️⃣ Atendente` });
                    }
                    return;
                }

                if (text === '1') {
                    await sock.sendMessage(sender, { text: `💰 Preços:\n• 7 dias: R$ 10\n• 1 mês: R$ 25\n• Lifetime: R$ 80\n\n💬 +${ADMIN_NUMBER}` });
                } else if (text === '2') {
                    userStates.set(sender, { step: 'resgatar_key' });
                    await sock.sendMessage(sender, { text: '🎁 Digite sua key:\n*NYUX-XXXX-XXXX*' });
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
                        lista.forEach((j, i) => msg += `      ${i + 1}. ${j.jogo}\n`);
                        total += lista.length;
                    }
                    msg += `\n🎮 Total: ${total}`;
                    await sock.sendMessage(sender, { text: msg });
                } else if (text === '5') {
                    const p = db.getPerfil(sender);
                    const tempoUso = calcularTempoUso(p.dataRegistro);
                    const jogosResgatados = p.keysResgatadas ? p.keysResgatadas.length : 0;
                    
                    let msg = `👤 *MEU PERFIL*\n\n`;
                    msg += `🪪 *Nome:* ${p.nome || pushName}\n`;
                    msg += `📱 *Número:* ${sender.split('@')[0]}\n`;
                    msg += `⏱️ *Status:* ${p.temAcesso ? '✅ Ativo' : '❌ Inativo'}\n`;
                    msg += `🎮 *Keys:* ${jogosResgatados}\n`;
                    msg += `📅 *Cliente há:* ${tempoUso}\n`;
                    
                    if (p.keyInfo) {
                        msg += `\n🔑 *Última Key:* ${p.keyInfo.key}\n`;
                        msg += `📆 *Expira:* ${p.keyInfo.expira}\n`;
                    }
                    
                    await sock.sendMessage(sender, { text: msg });
                    
                } else if (text === '6') {
                    userStates.set(sender, { step: 'resgatar_key_teste' });
                    await sock.sendMessage(sender, { text: '🎉 *Teste Grátis*\n\n1️⃣ 1 hora\n2️⃣ 2 horas\n3️⃣ 6 horas\n\n⚠️ Só 1 por pessoa!\n\nDigite:' });
                } else if (text === '0') {
                    await sock.sendMessage(sender, { text: '💬 Aguarde...' });
                    await sock.sendMessage(ADMIN_NUMBER + '@s.whatsapp.net', { text: `📩 ${pushName}\n${sender.split('@')[0]}` });
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
                            text: `👑 *MASTER KEY ATIVADA!*\n\n🎉 Parabéns ${pushName}!\nVocê agora é ADMINISTRADOR!\n\n🔧 Digite: *admin*` 
                        });
                    } else {
                        await sock.sendMessage(sender, { text: `❌ *${resultado.erro}*` });
                    }
                    return;
                }
                
                if (!key.match(/^NYUX-[A-Z0-9]{4}-[A-Z0-9]{4}$/)) {
                    await sock.sendMessage(sender, { text: '❌ *Formato inválido!*\n\n*NYUX-XXXX-XXXX*' });
                    return;
                }
                
                const resultado = db.resgatarKey(key, sender, pushName);
                if (resultado.sucesso) {
                    userStates.set(sender, { step: 'menu' });
                    await sock.sendMessage(sender, { 
                        text: `✅ *Key Resgatada!*\n\n🎆 Plano: ${resultado.plano}\n⏱️ ${resultado.duracao}\n📅 ${resultado.expira}` 
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
                        text: `🎮 *${conta.jogo}*\n📂 ${conta.categoria}\n\n👤 ${conta.login}\n🔒 ${conta.senha}\n\n⚠️ Modo Offline!` 
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
                    await sock.sendMessage(sender, { text: '📄 Envie o arquivo .txt' });
                } else if (text === '5') {
                    const s = db.getEstatisticas();
                    await sock.sendMessage(sender, { text: `📊 Estatísticas:\n🎮 ${s.totalJogos} jogos\n✅ ${s.disponiveis} disponíveis\n🔑 ${s.keysAtivas} keys\n👥 ${s.totalClientes} clientes` });
                } else if (text === '6') {
                    const jogos = db.getTodosJogosDisponiveis();
                    let msg = '📋 Jogos:\n\n';
                    jogos.forEach(j => msg += `•  ${j.jogo}\n`);
                    await sock.sendMessage(sender, { text: msg });
                } else if (text === '7') {
                    userStates.set(sender, { step: 'admin_broadcast' });
                    await sock.sendMessage(sender, { text: '📢 Digite a mensagem:' });
                } else if (text === '8') {
                    userStates.set(sender, { step: 'admin_remover_lista', tempLista: db.getTodosJogosDisponiveis() });
                    const jogos = db.getTodosJogosDisponiveis();
                    let msg = '❌ *Remover Conta*\n\n';
                    jogos.slice(0, 20).forEach((j, i) => msg += `${i + 1}. ${j.jogo}\n`);
                    msg += '\nDigite o número ou nome:';
                    await sock.sendMessage(sender, { text: msg });
                } else if (text === '9') {
                    await sock.sendMessage(sender, { text: `👥 *Entrar em Grupo*\n\n1️⃣ Adicione +${BOT_NUMBER}\n2️⃣ Dê permissão de ADMIN\n3️⃣ Digite !menu` });
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
                        text: `❌ *Confirmar remoção?*\n\n🎮 ${conta.jogo}\n👤 ${conta.login}\n\nDigite *sim* ou *não*:` 
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
                            text: `❌ *Confirmar remoção?*\n\n🎮 ${resultado.jogo}\n👤 ${resultado.login}\n\nDigite *sim* ou *não*:` 
                        });
                    } else {
                        await sock.sendMessage(sender, { text: '❌ Conta não encontrada.' });
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
                            text: `✅ *Conta removida!*\n\n🎮 ${conta.jogo}\nTotal: ${resultado.totalRestante} contas` 
                        });
                    }
                } else {
                    userStates.set(sender, { step: 'admin_menu' });
                    await sock.sendMessage(sender, { text: '✅ Cancelado.' });
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
                    text: `✅ *Conta adicionada!*\n\n🎮 ${temp.jogo}\n📂 ${temp.categoria}` 
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
                    text: `🔑 *Key Gerada!*\n\n${key}\n⏱️ ${duracao}` 
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
                    text: `🎁 *Key Teste!*\n\n${key}\n⏱️ ${duracao}` 
                });
            }
            // ADMIN: IMPORTAR TXT
            else if (userState.step === 'admin_importar' && isAdmin) {
                if (msg.message.documentMessage) {
                    await sock.sendMessage(sender, { text: '⏳ Processando...' });
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
                                text: `✅ *Importação Concluída!*\n\n📊 ${resultado.adicionadas} contas\n🎮 ${resultado.jogosUnicos} jogos` 
                            });
                        } else {
                            await sock.sendMessage(sender, { 
                                text: `⚠️ Nenhuma conta adicionada.` 
                            });
                        }
                    } catch (err) {
                        await sock.sendMessage(sender, { text: '❌ Erro ao processar arquivo.' });
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
                    } catch (e) {}
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

console.log('🚀 Iniciando NyuxStore...\n');

// Inicia
connectToWhatsApp();
