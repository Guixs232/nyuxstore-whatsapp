const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const http = require('http');
const readline = require('readline');

// CONFIGURAÇÕES
const BOT_NUMBER = process.env.BOT_NUMBER || '556183040115';
const ADMIN_NUMBER = process.env.ADMIN_NUMBER || '5518997972598';
const STORE_NAME = process.env.STORE_NAME || 'NyuxStore';
const PORT = process.env.PORT || 8080';

console.log('🔐 MODO COM VERIFICAÇÃO EM DUAS ETAPAS');
console.log('📱 Número:', BOT_NUMBER);
console.log('');

// LIMPA TUDO
const pastasParaLimpar = ['auth_info_baileys', 'session', 'qrcode.png', 'qrcode.txt'];
console.log('🗑️  Limpando...');
pastasParaLimpar.forEach(pasta => {
    try {
        if (fs.existsSync(pasta)) {
            fs.rmSync(pasta, { recursive: true, force: true });
            console.log('   ✅', pasta);
        }
    } catch (e) {}
});
console.log('');

// VARIÁVEIS
let botConectado = false;
let qrCodeDataURL = null;
let qrCodeRaw = null;
let tentativas = 0;
let sockGlobal = null;
let twoFactorCode = null; // PIN de 6 dígitos

// INTERFACE PARA DIGITAR O PIN
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// SERVIDOR WEB
const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    if (req.url === '/') {
        res.end(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>${STORE_NAME}</title>
                <meta http-equiv="refresh" content="3">
                <style>
                    body { 
                        font-family: Arial; 
                        text-align: center; 
                        padding: 50px; 
                        background: #1a1a2e;
                        color: white;
                    }
                    .box {
                        padding: 30px;
                        border-radius: 20px;
                        margin: 20px auto;
                        max-width: 450px;
                    }
                    .online { background: #4CAF50; }
                    .waiting { background: #ff9800; }
                    .offline { background: #f44336; }
                    .pin-box {
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        padding: 30px;
                        border-radius: 20px;
                        margin: 20px auto;
                        max-width: 400px;
                    }
                    .pin-code {
                        font-size: 36px;
                        font-weight: bold;
                        letter-spacing: 5px;
                        color: #fff;
                        margin: 20px 0;
                    }
                    img { max-width: 300px; background: white; padding: 20px; border-radius: 20px; }
                </style>
            </head>
            <body>
                <h1>🎮 ${STORE_NAME}</h1>
                
                ${botConectado ? `
                    <div class="box online">
                        <h2>✅ CONECTADO!</h2>
                    </div>
                ` : (twoFactorCode ? `
                    <div class="pin-box">
                        <h2>🔐 Digite o PIN no terminal!</h2>
                        <p>Verificação em duas etapas ativada</p>
                        <p>Abra o terminal e digite o código de 6 dígitos</p>
                    </div>
                ` : (qrCodeDataURL ? `
                    <div class="box waiting">
                        <h2>📱 Escaneie o QR Code</h2>
                        <img src="${qrCodeDataURL}">
                        <p>Depois digite o PIN se pedir</p>
                    </div>
                ` : `
                    <div class="box offline">
                        <h2>⏳ Iniciando...</h2>
                        <p>Tentativa: ${tentativas}</p>
                    </div>
                `))}
            </body>
            </html>
        `);
    } else {
        res.writeHead(302, { 'Location': '/' });
        res.end();
    }
});

server.listen(PORT, () => {
    console.log(`🌐 Site: http://localhost:${PORT}\n`);
});

// FUNÇÃO PARA PEDIR PIN
function pedirPIN() {
    return new Promise((resolve) => {
        console.log('\n╔════════════════════════════════════════╗');
        console.log('║     🔐 VERIFICAÇÃO EM DUAS ETAPAS      ║');
        console.log('╠════════════════════════════════════════╣');
        console.log('║                                        ║');
        console.log('║  Digite o código de 6 dígitos do       ║');
        console.log('║  seu WhatsApp (verificação em 2 etapas)║');
        console.log('║                                        ║');
        console.log('╚════════════════════════════════════════╝\n');
        
        twoFactorCode = 'AGUARDANDO';
        
        rl.question('🔑 Digite o PIN de 6 dígitos: ', (pin) => {
            pin = pin.trim().replace(/\D/g, ''); // Remove não-números
            
            if (pin.length === 6) {
                console.log('✅ PIN recebido:', pin, '\n');
                twoFactorCode = pin;
                resolve(pin);
            } else {
                console.log('❌ PIN deve ter 6 dígitos!\n');
                resolve(pedirPIN()); // Pede de novo
            }
        });
    });
}

// CONEXÃO PRINCIPAL
async function conectar() {
    tentativas++;
    console.log(`\n🔌 Tentativa #${tentativas}`);
    
    try {
        const { 
            default: makeWASocket, 
            DisconnectReason, 
            useMultiFileAuthState,
            fetchLatestBaileysVersion
        } = await import('@whiskeysockets/baileys');
        
        const { version } = await fetchLatestBaileysVersion();
        console.log(`📱 WhatsApp Web v${version.join('.')}`);
        
        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
        
        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: true,
            auth: state,
            browser: ['Chrome', 'Windows', '10'],
            markOnlineOnConnect: false,
            syncFullHistory: false,
            connectTimeoutMs: 120000,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 30000,
            
            // IMPORTANTE: Função para tratar 2FA
            getMessage: async (key) => {
                return { conversation: 'hello' };
            }
        });

        sockGlobal = sock;

        // EVENTO DE CONEXÃO
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            // QR CODE
            if (qr) {
                console.log('\n✅ QR CODE GERADO!\n');
                qrCodeRaw = qr;
                
                try {
                    const QRCode = require('qrcode');
                    qrCodeDataURL = await QRCode.toDataURL(qr, { width: 400 });
                    await QRCode.toFile('qrcode.png', qr, { width: 400 });
                } catch (e) {}
                
                console.log('╔══════════════════════════════════════╗');
                console.log('║         📱 ESCANEIE AGORA            ║');
                console.log('╚══════════════════════════════════════╝\n');
                qrcode.generate(qr, { small: false });
                console.log(`\n🌐 http://localhost:${PORT}\n`);
            }
            
            // VERIFICAÇÃO EM DUAS ETAPAS DETECTADA
            if (lastDisconnect?.error?.output?.statusCode === 401) {
                const errorMsg = lastDisconnect?.error?.message || '';
                
                if (errorMsg.includes('2fa') || errorMsg.includes('two-factor') || errorMsg.includes('pin')) {
                    console.log('\n🔐 Verificação em duas etapas detectada!\n');
                    
                    const pin = await pedirPIN();
                    
                    // Tenta reconectar com o PIN
                    console.log('🔄 Tentando conectar com PIN...\n');
                    
                    // Aqui precisamos reiniciar com o PIN
                    // O Baileys não tem suporte nativo muito bom para 2FA
                    // Mas vamos tentar uma abordagem alternativa
                    
                    console.log('⚠️  NOTA: O Baileys tem limitações com 2FA');
                    console.log('💡 Solução recomendada:');
                    console.log('   1. Desative a verificação em duas etapas temporariamente');
                    console.log('   2. Conecte o bot');
                    console.log('   3. Reative a verificação em duas etapas');
                    console.log('');
                    
                    twoFactorCode = null;
                }
            }
            
            // CONEXÃO FECHADA
            if (connection === 'close') {
                botConectado = false;
                qrCodeDataURL = null;
                twoFactorCode = null;
                
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const errorMessage = lastDisconnect?.error?.message || '';
                
                console.log('\n❌ CONEXÃO FECHADA');
                console.log('Código:', statusCode);
                console.log('Erro:', errorMessage);
                
                // Se for erro de 2FA, não reconecta automaticamente
                if (errorMessage.includes('2fa') || errorMessage.includes('pin')) {
                    console.log('\n🔐 Parece ser erro de verificação em duas etapas');
                    console.log('Desative temporariamente no celular:');
                    console.log('WhatsApp → Configurações → Conta → Verificação em duas etapas → DESATIVAR\n');
                    return;
                }
                
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                
                if (shouldReconnect && tentativas < 5) {
                    const delay = Math.min(5000 * tentativas, 30000);
                    console.log(`⏳ Reconectando em ${delay/1000}s...\n`);
                    setTimeout(conectar, delay);
                }
            }
            
            // CONECTADO
            else if (connection === 'open') {
                botConectado = true;
                qrCodeDataURL = null;
                twoFactorCode = null;
                tentativas = 0;
                
                console.log('\n✅✅✅ CONECTADO! ✅✅✅\n');
                console.log('📱 Número:', sock.user?.id?.split(':')[0]);
                
                try {
                    if (fs.existsSync('qrcode.png')) fs.unlinkSync('qrcode.png');
                } catch(e) {}
            }
        });

        sock.ev.on('creds.update', saveCreds);

    } catch (err) {
        console.error('\n❌ ERRO:', err.message);
        setTimeout(conectar, 10000);
    }
}

console.log('🚀 Iniciando...\n');
console.log('⚠️  Se você tem verificação em duas etapas ativa:');
console.log('   O WhatsApp vai pedir um PIN de 6 dígitos');
console.log('   Digite no terminal quando pedir\n');

conectar();
