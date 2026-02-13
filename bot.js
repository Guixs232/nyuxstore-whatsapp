const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const http = require('http');
const path = require('path');
const Database = require('./database');

// ==========================================
// CONFIGURACOES
// ==========================================
const BOT_NUMBER = process.env.BOT_NUMBER || '556183040115';
const ADMIN_NUMBER = process.env.ADMIN_NUMBER || '5518997972598';
const STORE_NAME = process.env.STORE_NAME || 'NyuxStore';
const PORT = process.env.PORT || 8080;
const ADMIN_MASTER_KEY = 'NYUX-ADM1-GUIXS23';

// ==========================================
// ANTI-BAN INTELIGENTE
// ==========================================
const mensagensPorMinuto = new Map();
const MAX_MSG_POR_MINUTO = 20;

function delayInteligente() {
    return Math.floor(Math.random() * 1400) + 800;
}

async function antiBanDelay(sock, destino) {
    const tempo = delayInteligente();
    try { await sock.sendPresenceUpdate('composing', destino); } catch (e) {}
    await new Promise(resolve => setTimeout(resolve, tempo));
    try { await sock.sendPresenceUpdate('paused', destino); } catch (e) {}
}

function verificarTaxaMensagens(numero) {
    const agora = Date.now();
    const umMinutoAtras = agora - 60000;
    if (!mensagensPorMinuto.has(numero)) mensagensPorMinuto.set(numero, []);
    const historico = mensagensPorMinuto.get(numero).filter(t => t > umMinutoAtras);
    mensagensPorMinuto.set(numero, historico);
    if (historico.length >= MAX_MSG_POR_MINUTO) {
        console.log(`⚠️ Taxa limite atingida para ${numero}`);
        return false;
    }
    historico.push(agora);
    return true;
}

console.log('🚀 Iniciando NyuxStore MEGA v2.0...');

// ==========================================
// PARSER DE CONTAS
// ==========================================
class ContasSteamParser {
    constructor() {
        this.palavrasBloqueadas = [
            'mande mensagem', 'manda mensagem', 'whatsapp para conseguir',
            'chamar no whatsapp', 'solicitar acesso', 'pedir acesso',
            'contato para liberar', 'liberado manualmente', 'enviar mensagem',
            'precisa pedir', 'so funciona com', 'nao funciona sem',
            'contato obrigatorio', 'precisa de autorizacao', 'liberacao manual',
            'comprado em:', 'ggmax', 'pertenece', 'perfil/', 'claigames',
            'ggmax.com.br', 'seekkey', 'nyuxstore', 'confirmacao',
            'precisa confirmar', 'aguardar confirmacao'
        ];
        this.categorias = {
            '🗡️ Assassins Creed': ['assassin', 'creed'],
            '🔫 Call of Duty': ['call of duty', 'cod', 'modern warfare', 'black ops'],
            '🧟 Resident Evil': ['resident evil', 're2', 're3', 're4', 're5', 're6', 're7', 're8', 'village'],
            '🐺 CD Projekt Red': ['witcher', 'cyberpunk'],
            '🚗 Rockstar Games': ['gta', 'grand theft auto', 'red dead', 'rdr2'],
            '🌲 Survival': ['sons of the forest', 'the forest', 'dayz', 'scum', 'green hell'],
            '🎮 Acao/Aventura': ['batman', 'spider-man', 'spiderman', 'marvel', 'hitman'],
            '🏎️ Corrida': ['forza', 'need for speed', 'nfs', 'f1', 'dirt', 'euro truck'],
            '🎲 RPG': ['elden ring', 'dark souls', 'sekiro', 'persona', 'final fantasy', 'baldur'],
            '🎯 Simuladores': ['farming simulator', 'flight simulator', 'cities skylines'],
            '👻 Terror': ['outlast', 'phasmophobia', 'dead by daylight', 'dying light'],
            '🥊 Luta': ['mortal kombat', 'mk1', 'mk11', 'street fighter', 'tekken'],
            '🦸 Super-Herois': ['batman', 'spider-man', 'marvel', 'avengers'],
            '🔫 Tiro/FPS': ['cs2', 'counter-strike', 'apex', 'pubg', 'battlefield'],
            '🎭 Estrategia': ['civilization', 'age of empires', 'hearts of iron'],
            '🎬 Mundo Aberto': ['gta', 'red dead', 'witcher', 'cyberpunk', 'elden ring'],
            '🎾 Esportes': ['fifa', 'nba', 'pes', 'efootball'],
            '🎸 Indie': ['hollow knight', 'cuphead', 'hades', 'stardew valley'],
            '🎪 Outros': []
        };
    }

    detectarCategoria(nomeJogo) {
        const jogoLower = nomeJogo.toLowerCase();
        for (const [categoria, keywords] of Object.entries(this.categorias)) {
            for (const keyword of keywords) {
                if (jogoLower.includes(keyword)) return categoria;
            }
        }
        return '🎮 Acao/Aventura';
    }

    processarMultiplasContas(texto) {
        const linhas = texto.split(/\r?\n/).filter(l => l.trim());
        const resultados = { adicionadas: [], removidas: [], erros: [] };
        
        for (let i = 0; i < linhas.length; i++) {
            const linha = linhas[i].trim();
            if (!linha || linha.startsWith('//') || linha.startsWith('#')) continue;
            
            const conta = this.parseLinhaSimples(linha, i);
            
            if (conta) {
                if (!conta.login || !conta.senha || conta.login.length < 2 || conta.senha.length < 2) {
                    resultados.erros.push(`Linha ${i+1}: Login/senha muito curto`);
                    continue;
                }
                
                const verificacao = this.verificarContaProblematica(conta);
                if (verificacao.problema) {
                    resultados.removidas.push({ numero: conta.numero, jogo: conta.jogo, motivo: verificacao.motivo });
                } else {
                    resultados.adicionadas.push(conta);
                }
            } else {
                if (linha.length > 5) {
                    resultados.erros.push(`Linha ${i+1}: Formato nao reconhecido`);
                }
            }
        }
        
        return resultados;
    }

    parseLinhaSimples(linha, index = 0) {
        linha = linha.replace(/^[🔢🎮👤🔒✅❌📱⚡✨🎯🎲🏆⭐💎🎁🔑\s]+/g, '').trim();
        if (!linha || linha.startsWith('//') || linha.startsWith('#')) return null;
        
        let numero = (index + 1).toString();
        let jogo = '';
        let login = '';
        let senha = '';
        
        // Formato PIPE
        if (linha.includes('|')) {
            const partes = linha.split('|').map(p => p.trim()).filter(p => p);
            if (partes.length >= 4) {
                return { 
                    numero: partes[0].replace(/\D/g, '') || numero, 
                    jogo: partes[1], 
                    login: partes[2], 
                    senha: partes[3], 
                    categoria: this.detectarCategoria(partes[1]) 
                };
            }
            if (partes.length === 2) {
                return { 
                    numero, 
                    jogo: 'Conta Steam ' + numero, 
                    login: partes[0], 
                    senha: partes[1], 
                    categoria: '🎮 Acao/Aventura' 
                };
            }
        }
        
        // Formato DOIS PONTOS
        if (linha.includes(':') && !linha.includes('http')) {
            const partes = linha.split(':').map(p => p.trim()).filter(p => p);
            if (partes.length >= 2) {
                return { 
                    numero, 
                    jogo: 'Conta Steam ' + numero, 
                    login: partes[0], 
                    senha: partes.slice(1).join(':'), 
                    categoria: '🎮 Acao/Aventura' 
                };
            }
        }
        
        // Formato PONTO E VIRGULA
        if (linha.includes(';')) {
            const partes = linha.split(';').map(p => p.trim()).filter(p => p);
            if (partes.length >= 2) {
                return { 
                    numero, 
                    jogo: 'Conta Steam ' + numero, 
                    login: partes[0], 
                    senha: partes[1], 
                    categoria: '🎮 Acao/Aventura' 
                };
            }
        }
        
        // Formato ESPACO com numero
        const partes = linha.split(/\s+/).filter(p => p);
        if (partes.length >= 4 && /^\d+$/.test(partes[0])) {
            const senha = partes[partes.length - 1];
            const login = partes[partes.length - 2];
            const jogo = partes.slice(1, -2).join(' ');
            if (jogo && login && senha) {
                return { 
                    numero: partes[0], 
                    jogo, 
                    login, 
                    senha, 
                    categoria: this.detectarCategoria(jogo) 
                };
            }
        }
        
        // So login e senha (2 partes)
        if (partes.length === 2 && partes[0].length > 2 && partes[1].length > 2) {
            return { 
                numero, 
                jogo: 'Conta Steam ' + numero, 
                login: partes[0], 
                senha: partes[1], 
                categoria: '🎮 Acao/Aventura' 
            };
        }
        
        // Email
        const emailMatch = linha.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/);
        if (emailMatch) {
            const login = emailMatch[1];
            const depoisEmail = linha.substring(linha.indexOf(login) + login.length).trim();
            const senha = depoisEmail.replace(/^[:;|\-\s]+/, '').trim();
            if (senha) {
                return { 
                    numero, 
                    jogo: 'Conta Steam ' + numero, 
                    login, 
                    senha, 
                    categoria: '🎮 Acao/Aventura' 
                };
            }
        }
        
        return null;
    }

    verificarContaProblematica(conta) {
        const textoCompleto = `${conta.jogo} ${conta.login} ${conta.senha}`.toLowerCase();
        for (const palavra of this.palavrasBloqueadas) {
            if (textoCompleto.includes(palavra)) {
                return { problema: true, motivo: `Contem: "${palavra}"` };
            }
        }
        return { problema: false };
    }
}

// ==========================================
// VARIAVEIS GLOBAIS
// ==========================================
const db = new Database();
const userStates = new Map();
const mensagensProcessadas = new Set();
let botConectado = false;
let qrCodeDataURL = null;
let qrCodeFilePath = null;
let sockGlobal = null;
let tentativasConexao = 0;
let reconectando = false;

setInterval(() => { 
    mensagensProcessadas.clear(); 
}, 5 * 60 * 1000);


// ==========================================
// SERVIDOR WEB
// ==========================================
const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const url = req.url;
    
    if (url === '/api/status') {
        res.setHeader('Content-Type', 'application/json');
        const stats = db.getEstatisticas();
        res.end(JSON.stringify({ 
            conectado: botConectado, 
            temQR: !!qrCodeDataURL, 
            timestamp: new Date().toISOString(),
            stats: stats
        }));
        return;
    }
    
    if (url === '/qr.png') {
        if (qrCodeFilePath && fs.existsSync(qrCodeFilePath)) {
            res.setHeader('Content-Type', 'image/png');
            fs.createReadStream(qrCodeFilePath).pipe(res);
        } else {
            res.statusCode = 404;
            res.end('QR Code nao encontrado');
        }
        return;
    }
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (url === '/') {
        const stats = db.getEstatisticas();
        res.end(`<!DOCTYPE html>
<html>
<head>
<title>${STORE_NAME} - Bot WhatsApp</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="5">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Arial,sans-serif;text-align:center;padding:40px 20px;background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);color:white;min-height:100vh}
h1{color:#00d9ff;font-size:2.5rem;margin-bottom:10px}
.status{padding:25px;border-radius:20px;margin:30px auto;font-size:1.3rem;max-width:500px}
.online{background:linear-gradient(135deg,#4CAF50,#45a049)}
.offline{background:linear-gradient(135deg,#f44336,#da190b)}
.waiting{background:linear-gradient(135deg,#ff9800,#f57c00);animation:pulse 2s infinite}
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.02)}}
.qr-container{background:white;padding:30px;border-radius:25px;margin:30px auto;max-width:400px}
.qr-container img{width:100%;max-width:350px;border-radius:10px}
.btn{background:linear-gradient(135deg,#00d9ff,#0099cc);color:#1a1a2e;padding:18px 40px;text-decoration:none;border-radius:30px;font-weight:bold;font-size:1.1rem;display:inline-block;margin:15px}
.info{background:rgba(255,255,255,0.1);padding:25px;border-radius:20px;margin:30px auto;max-width:500px}
.stats{display:grid;grid-template-columns:repeat(2,1fr);gap:15px;max-width:500px;margin:20px auto}
.stat-box{background:rgba(255,255,255,0.1);padding:15px;border-radius:15px}
.stat-box h3{color:#00d9ff;font-size:2rem}
</style>
</head>
<body>
<h1>🎮 ${STORE_NAME}</h1>
${botConectado ? `
<div class="status online"><h2>✅ Bot Conectado!</h2></div>
<div class="stats">
<div class="stat-box"><h3>${stats.totalJogos}</h3><p>Jogos</p></div>
<div class="stat-box"><h3>${stats.clientesAtivos}</h3><p>Clientes</p></div>
<div class="stat-box"><h3>${stats.keysAtivas}</h3><p>Keys</p></div>
<div class="stat-box"><h3>R$ ${stats.totalVendas || 0}</h3><p>Vendas</p></div>
</div>
<div class="info"><p>🤖 Bot: +${BOT_NUMBER}</p><p>👑 Admin: +${ADMIN_NUMBER}</p></div>
` : (qrCodeDataURL ? `
<div class="status waiting"><h2>📱 Escaneie o QR Code</h2></div>
<div class="qr-container"><img src="${qrCodeDataURL}" alt="QR Code"></div>
<a href="/qr.png" class="btn" download>💾 Baixar QR Code</a>
` : `
<div class="status offline"><h2>⏳ Iniciando...</h2></div>
<p style="color:#aaa;margin-top:20px;">Tentativa: ${tentativasConexao}</p>
`)}</body></html>`);
    } else {
        res.writeHead(302, { 'Location': '/' });
        res.end();
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Servidor: http://localhost:${PORT}`);
});

// ==========================================
// FUNCOES AUXILIARES
// ==========================================
async function salvarQRCode(qr) {
    try {
        const QRCode = require('qrcode');
        qrCodeDataURL = await QRCode.toDataURL(qr, { width: 500, margin: 2 });
        qrCodeFilePath = path.join(__dirname, 'qrcode.png');
        await QRCode.toFile(qrCodeFilePath, qr, { width: 500, margin: 2 });
        fs.writeFileSync('qrcode.txt', qr);
        console.log('✅ QR Code salvo');
        qrcode.generate(qr, { small: false });
    } catch (err) {
        console.error('❌ Erro ao salvar QR:', err.message);
    }
}

function verificarAdmin(sender) {
    const numeroLimpo = sender.replace('@s.whatsapp.net', '').replace('@g.us','').split(':')[0];
    if (numeroLimpo === ADMIN_NUMBER) return true;
    return db.isAdminMaster(numeroLimpo);
}

function getMenuPrincipal(nome, temAcesso) {
    let menu = `🎮 *${STORE_NAME}*\n\nOla, ${nome}! 👋\n`;
    if (!temAcesso) menu += `\n⚠️ *Voce nao tem acesso ativo!*\n`;
    menu += `\n*Escolha uma opcao:*\n\n`;
    menu += `1️⃣ Comprar Key 💰\n`;
    menu += `2️⃣ Resgatar Key 🎁\n`;
    menu += `3️⃣ Buscar Jogo 🔍\n`;
    menu += `4️⃣ Ver Jogos 📋\n`;
    menu += `5️⃣ Meu Perfil 👤\n`;
    menu += `6️⃣ Historico 📜\n`;
    menu += `7️⃣ Favoritos ⭐\n`;
    menu += `8️⃣ Indicar Amigo 👥\n`;
    menu += `9️⃣ Meus Pontos 💎\n`;
    menu += `🔟 Suporte/Ticket 🎫\n`;
    menu += `1️⃣1️⃣ FAQ/Ajuda ❓\n`;
    menu += `0️⃣ Falar com Atendente 💬\n\n`;
    menu += `_Digite o numero_`;
    return menu;
}

function getMenuAdmin() {
    return `🔧 *PAINEL ADMIN MEGA*\n\n` +
    `📊 GERENCIAMENTO\n` +
    `1️⃣ Adicionar Conta ➕\n` +
    `2️⃣ Gerar Key 🔑\n` +
    `3️⃣ Gerar Key Teste 🎁\n` +
    `4️⃣ Importar Contas 📄\n` +
    `5️⃣ Importar Multiplas 📋\n` +
    `6️⃣ Remover Conta ❌\n` +
    `7️⃣ 🗑️ REMOVER TODOS\n\n` +
    `📈 RELATORIOS\n` +
    `8️⃣ Estatisticas 📊\n` +
    `9️⃣ Ver Logs 📜\n` +
    `🔟 Clientes Ativos 🟢\n` +
    `1️⃣1️⃣ Clientes Inativos 🔴\n` +
    `1️⃣2️⃣ Ranking 🏆\n\n` +
    `🛡️ MODERACAO\n` +
    `1️⃣3️⃣ Banir ⛔\n` +
    `1️⃣4️⃣ Desbanir ✅\n` +
    `1️⃣5️⃣ Blacklist 🚫\n\n` +
    `📢 COMUNICACAO\n` +
    `1️⃣6️⃣ Broadcast 📢\n` +
    `1️⃣7️⃣ Novidades ✨\n\n` +
    `⚙️ CONFIG\n` +
    `1️⃣8️⃣ Criar Cupom 🎟️\n` +
    `1️⃣9️⃣ Backup 💾\n\n` +
    `0️⃣ Voltar`;
}

function calcularTempoRestante(dataExpiracao) {
    if (!dataExpiracao) return 'N/A';
    const agora = new Date();
    const expira = new Date(dataExpiracao);
    const diffMs = expira - agora;
    if (diffMs <= 0) return '⛔ EXPIRADO';
    const dias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const horas = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (dias > 0) return `${dias}d ${horas}h`;
    return `${horas}h`;
}


// ==========================================
// LEMBRETES AUTOMATICOS
// ==========================================
setInterval(async () => {
    if (!sockGlobal || !botConectado) return;
    
    const clientes = db.getTodosClientes();
    const agora = new Date();
    
    for (const cliente of clientes) {
        if (!cliente.temAcesso || cliente.acessoPermanente) continue;
        if (!cliente.keyInfo?.dataExpiracao) continue;
        
        const expira = new Date(cliente.keyInfo.dataExpiracao);
        const diffHoras = (expira - agora) / (1000 * 60 * 60);
        
        if (diffHoras > 23 && diffHoras < 24 && !cliente.lembrete24h) {
            cliente.lembrete24h = true;
            db.saveJson(db.clientesFile, db.clientes);
            try {
                await antiBanDelay(sockGlobal, cliente.numero);
                await sockGlobal.sendMessage(cliente.numero, { 
                    text: `⏰ *LEMBRETE!*\n\nSeu plano expira em *24 horas*!\n\n💰 Renove e ganhe 10% OFF:\n• 7 dias: R$ 9\n• 1 mes: R$ 22\n• Lifetime: R$ 72\n\n💬 Fale com: +${ADMIN_NUMBER}` 
                });
            } catch (e) {}
        }
    }
}, 60 * 60 * 1000);

// ==========================================
// BACKUP AUTOMATICO
// ==========================================
setInterval(() => {
    const agora = new Date();
    if (agora.getHours() === 3 && agora.getMinutes() === 0) {
        const backupDir = './backups';
        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
        
        const data = agora.toISOString().split('T')[0];
        const backupFile = path.join(backupDir, `backup-${data}.json`);
        
        const backup = {
            data: agora.toISOString(),
            contas: db.contas,
            keys: db.keys,
            clientes: db.clientes,
            logs: db.logs.slice(0, 100)
        };
        
        fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
        console.log(`💾 Backup: ${backupFile}`);
        
        if (sockGlobal && botConectado) {
            sockGlobal.sendMessage(ADMIN_NUMBER + '@s.whatsapp.net', {
                text: `💾 *BACKUP AUTOMATICO*\n\n📅 ${data}\n🎮 ${db.contas.length} jogos\n👥 ${Object.keys(db.clientes).length} clientes`
            }).catch(() => {});
        }
    }
}, 60 * 1000);

// ==========================================
// CONEXAO WHATSAPP
// ==========================================
async function connectToWhatsApp() {
    if (reconectando) return;
    reconectando = true;
    tentativasConexao++;
    
    console.log(`\n🔌 TENTATIVA #${tentativasConexao}\n`);
    
    try {
        const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } = await import('@whiskeysockets/baileys');
        const { version } = await fetchLatestBaileysVersion();
        console.log(`📱 Versao: ${version.join('.')}`);
        
        if (tentativasConexao > 3) {
            try { fs.rmSync('auth_info_baileys', { recursive: true, force: true }); tentativasConexao = 0; } catch (e) {}
        }
        
        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
        
        const sock = makeWASocket({
            version, logger: pino({ level: 'silent' }), printQRInTerminal: false, auth: state,
            browser: ['Chrome', 'Windows', '10.0.19042'], markOnlineOnConnect: true, syncFullHistory: false,
            shouldIgnoreJid: jid => jid?.includes('newsletter') || jid?.includes('broadcast'),
            connectTimeoutMs: 120000, defaultQueryTimeoutMs: 60000, keepAliveIntervalMs: 30000,
            retryRequestDelayMs: 2000, maxMsgRetryCount: 5
        });
        
        sockGlobal = sock;
        
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                console.log('✅ QR Code recebido!');
                await salvarQRCode(qr);
                tentativasConexao = 0;
            }
            
            if (connection === 'close') {
                botConectado = false;
                qrCodeDataURL = null;
                reconectando = false;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                if (statusCode !== DisconnectReason.loggedOut) {
                    setTimeout(connectToWhatsApp, 10000);
                }
            } else if (connection === 'open') {
                botConectado = true;
                qrCodeDataURL = null;
                tentativasConexao = 0;
                reconectando = false;
                try {
                    if (fs.existsSync('qrcode.png')) fs.unlinkSync('qrcode.png');
                    if (fs.existsSync('qrcode.txt')) fs.unlinkSync('qrcode.txt');
                } catch (e) {}
                console.log('\n✅ BOT CONECTADO!');
                console.log('📱 Numero:', sock.user?.id?.split(':')[0]);
            }
        });
        
        sock.ev.on('creds.update', saveCreds);


        // ==========================================
        // PROCESSAMENTO DE MENSAGENS
        // ==========================================
        sock.ev.on('messages.upsert', async (m) => {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;
            
            const msgId = msg.key.id;
            const participant = msg.key.participant || msg.key.remoteJid;
            const uniqueId = `${msgId}_${participant}`;
            
            if (mensagensProcessadas.has(uniqueId)) return;
            mensagensProcessadas.add(uniqueId);
            
            const sender = msg.key.remoteJid;
            const isGroup = sender.endsWith('@g.us');
            const pushName = msg.pushName || 'Cliente';
            
            let text = '';
            if (msg.message.conversation) text = msg.message.conversation;
            else if (msg.message.extendedTextMessage) text = msg.message.extendedTextMessage.text;
            else if (msg.message.buttonsResponseMessage) text = msg.message.buttonsResponseMessage.selectedButtonId;
            else if (msg.message.listResponseMessage) text = msg.message.listResponseMessage.singleSelectReply.selectedRowId;
            else if (msg.message.documentMessage) text = '[documento]';
            
            const textOriginal = text;
            text = text.toLowerCase().trim();
            
            console.log(`\n📩 ${pushName}: "${text.substring(0, 40)}..."`);
            
            if (isGroup) {
                if (!text.startsWith('!')) return;
                text = text.substring(1).trim();
            }
            
            const isAdmin = verificarAdmin(sender);
            const perfil = db.getPerfil(sender);
            const temAcesso = db.verificarAcesso(sender);
            const userState = userStates.get(sender) || { step: 'menu' };
            
            if (db.isBanido(sender)) {
                await sock.sendMessage(sender, { text: '⛔ Voce foi banido.' });
                return;
            }
            
            let respostaEnviada = false;
            
            async function enviarResposta(destino, mensagem) {
                if (respostaEnviada) return;
                respostaEnviada = true;
                if (!verificarTaxaMensagens(destino)) {
                    await sock.sendMessage(destino, { text: '⏳ Aguarde um momento...' });
                    await new Promise(r => setTimeout(r, 5000));
                }
                await antiBanDelay(sock, destino);
                await sock.sendMessage(destino, mensagem);
            }
            
            try {
                // COMANDO STATUS
                if (text === '!status' || text === 'status') {
                    const stats = db.getEstatisticas();
                    await enviarResposta(sender, { text: 
                        `🌐 *STATUS*\n\n` +
                        `${botConectado ? '🟢 Online' : '🔴 Offline'}\n` +
                        `🎮 ${stats.totalJogos} jogos\n` +
                        `👥 ${stats.clientesAtivos} ativos\n` +
                        `🔑 ${stats.keysAtivas} keys\n` +
                        `💰 R$ ${stats.totalVendas || 0} vendas`
                    });
                    return;
                }
                
                // COMANDO FAQ
                if (text === 'faq' || text === 'ajuda' || text === '11') {
                    await enviarResposta(sender, { text: 
                        `❓ *FAQ*\n\n` +
                        `*1. Como usar?*\n→ Baixe o jogo na Steam\n→ Entre com login/senha\n→ Use modo OFFLINE\n\n` +
                        `*2. Posso alterar senha?*\n→ ⛔ NAO! Banimento imediato.\n\n` +
                        `*3. Posso compartilhar?*\n→ ⛔ NAO! Cada um tem sua conta.\n\n` +
                        `*4. Nao funciona?*\n→ Digite 0 para suporte.\n\n` +
                        `*5. Como indicar?*\n→ Peça: indicado SEUNUMERO\n→ Ganhe 2h extras!`
                    });
                    return;
                }
                
                // COMANDO ADMIN
                if (text === 'admin' || text === 'adm') {
                    if (isAdmin) {
                        userStates.set(sender, { step: 'admin_menu' });
                        await enviarResposta(sender, { text: getMenuAdmin() });
                    } else {
                        await enviarResposta(sender, { text: '⛔ Acesso Negado' });
                    }
                    return;
                }
                
                // MENU PRINCIPAL
                if (userState.step === 'menu') {
                    switch(text) {
                        case '1':
                            await enviarResposta(sender, { text: 
                                `💰 *PRECOS*\n\n` +
                                `🥉 7 Dias: R$ 10\n` +
                                `🥈 1 Mes: R$ 25\n` +
                                `👑 Lifetime: R$ 80\n\n` +
                                `💬 Para comprar:\n+${ADMIN_NUMBER}\n\n` +
                                `🎟️ Tem cupom? Use na hora!`
                            });
                            break;
                            
                        case '2':
                            userStates.set(sender, { step: 'resgatar_key' });
                            await enviarResposta(sender, { text: '🎁 Digite sua key:\n*NYUX-XXXX-XXXX*' });
                            break;
                            
                        case '3':
                            if (!temAcesso) {
                                await enviarResposta(sender, { text: '❌ Precisa de key ativa! Digite 2' });
                                return;
                            }
                            userStates.set(sender, { step: 'buscar_jogo' });
                            await enviarResposta(sender, { text: '🔍 Digite o nome do jogo:' });
                            break;
                            
                        case '4':
                            if (!temAcesso) {
                                await enviarResposta(sender, { text: '❌ Precisa de key ativa!' });
                                return;
                            }
                            const jogos = db.getTodosJogosDisponiveis();
                            if (jogos.length === 0) {
                                await enviarResposta(sender, { text: '📋 Nenhum jogo cadastrado.' });
                                return;
                            }
                            let msg = `📋 *JOGOS* (${jogos.length})\n\n`;
                            jogos.slice(0, 15).forEach((j, i) => {
                                msg += `${i+1}. ${j.jogo}\n`;
                            });
                            if (jogos.length > 15) msg += `...e mais ${jogos.length - 15}\n`;
                            msg += `\n🔍 Digite o nome para buscar`;
                            userStates.set(sender, { step: 'ver_jogos', jogos });
                            await enviarResposta(sender, { text: msg });
                            break;
                            
                        case '5':
                            const p = db.getPerfil(sender);
                            const tempoRestante = p.keyInfo?.dataExpiracao ? calcularTempoRestante(p.keyInfo.dataExpiracao) : 'N/A';
                            let tipo = '❌ Sem acesso';
                            if (p.temAcesso) tipo = p.acessoPermanente ? '👑 LIFETIME' : '✅ ATIVO';
                            else if (p.usouTeste) tipo = '⛔ TESTE EXPIRADO';
                            
                            await enviarResposta(sender, { text: 
                                `👤 *PERFIL*\n\n` +
                                `Nome: ${p.nome || pushName}\n` +
                                `Status: ${tipo}\n` +
                                `Expira: ${tempoRestante}\n\n` +
                                `🎮 Jogos: ${(p.jogosResgatados || []).length}\n` +
                                `⭐ Favoritos: ${(p.jogosFavoritos || []).length}\n` +
                                `💎 Pontos: ${p.pontos || 0}\n` +
                                `🎁 Indicacoes: ${p.indicacoes || 0}`
                            });
                            break;
                            
                        case '6':
                            if (!temAcesso) {
                                await enviarResposta(sender, { text: '❌ Precisa de key ativa!' });
                                return;
                            }
                            const hist = (db.getPerfil(sender).jogosResgatados || []);
                            if (hist.length === 0) {
                                await enviarResposta(sender, { text: '📜 Historico vazio' });
                                return;
                            }
                            let msgHist = `📜 *HISTORICO* (${hist.length})\n\n`;
                            hist.slice(0, 10).forEach((j, i) => {
                                msgHist += `${i+1}. ${j.jogo}\n`;
                            });
                            await enviarResposta(sender, { text: msgHist });
                            break;
                            
                        case '7':
                            if (!temAcesso) {
                                await enviarResposta(sender, { text: '❌ Precisa de key ativa!' });
                                return;
                            }
                            const favs = db.getFavoritos(sender);
                            if (favs.length === 0) {
                                await enviarResposta(sender, { text: '⭐ Favoritos vazio. Busque um jogo e digite *favoritar*' });
                                return;
                            }
                            let msgFav = `⭐ *FAVORITOS* (${favs.length})\n\n`;
                            favs.forEach((j, i) => {
                                msgFav += `${i+1}. ${j.jogo}\n`;
                            });
                            await enviarResposta(sender, { text: msgFav });
                            break;
                            
                        case '8':
                            await enviarResposta(sender, { text: 
                                `👥 *INDICAR*\n\n` +
                                `Peça para digitar:\n*indicado ${sender.split('@')[0]}*\n\n` +
                                `✅ Voce ganha 2h extras!\n` +
                                `✅ Amigo ganha 10% OFF!`
                            });
                            break;
                            
                        case '9':
                            const pts = db.getPerfil(sender).pontos || 0;
                            await enviarResposta(sender, { text: 
                                `💎 *PONTOS: ${pts}*\n\n` +
                                `Como ganhar:\n` +
                                `• Compra: 10 pts/R$\n` +
                                `• Indicar: 50 pts\n\n` +
                                `Trocar:\n` +
                                `• 50 pts = 1 dia\n` +
                                `• 100 pts = 3 dias\n` +
                                `• 200 pts = 7 dias\n\n` +
                                (pts >= 50 ? `Digite *trocar pontos*` : `Junte mais pontos!`)
                            });
                            break;
                            
                        case '10':
                            userStates.set(sender, { step: 'ticket_tipo' });
                            await enviarResposta(sender, { text: 
                                `🎫 *SUPORTE*\n\n` +
                                `1️⃣ Conta nao funciona\n` +
                                `2️⃣ Problema pagamento\n` +
                                `3️⃣ Duvida\n` +
                                `4️⃣ Outro\n\n` +
                                `Digite o numero:`
                            });
                            break;
                            
                        case '0':
                            await enviarResposta(sender, { text: '💬 Chamando atendente... Aguarde!' });
                            await sock.sendMessage(ADMIN_NUMBER + '@s.whatsapp.net', { 
                                text: `🚨 *ATENDIMENTO*\n\n*Cliente:* ${pushName}\n*Numero:* ${sender.split('@')[0]}` 
                            });
                            break;
                            
                        default:
                            await enviarResposta(sender, { text: getMenuPrincipal(pushName, temAcesso) });
                    }
                }

                
                // TICKET
                else if (userState.step === 'ticket_tipo') {
                    const tipos = { '1': 'Conta nao funciona', '2': 'Problema pagamento', '3': 'Duvida', '4': 'Outro' };
                    if (tipos[text]) {
                        userStates.set(sender, { step: 'ticket_desc', tipo: tipos[text] });
                        await enviarResposta(sender, { text: `✅ *${tipos[text]}*\n\nDescreva o problema:` });
                    } else {
                        await enviarResposta(sender, { text: '❌ Opcao invalida! Digite 1-4:' });
                    }
                }
                else if (userState.step === 'ticket_desc') {
                    const ticket = db.criarTicket({
                        numero: sender,
                        nome: pushName,
                        tipo: userState.tipo,
                        descricao: textOriginal
                    });
                    
                    await sock.sendMessage(ADMIN_NUMBER + '@s.whatsapp.net', {
                        text: `🎫 *NOVO TICKET ${ticket.id}*\n\n*Cliente:* ${pushName}\n*Tipo:* ${userState.tipo}\n\n*Descricao:*\n${textOriginal}`
                    });
                    
                    userStates.set(sender, { step: 'menu' });
                    await enviarResposta(sender, { text: `✅ *Ticket ${ticket.id} aberto!*\n\nResponderemos em breve.` });
                }
                
                // TROCAR PONTOS
                else if (text === 'trocar pontos' && userState.step === 'menu') {
                    const pts = db.getPerfil(sender).pontos || 0;
                    if (pts >= 50) {
                        userStates.set(sender, { step: 'trocar_pts', pts });
                        await enviarResposta(sender, { text: 
                            `💎 *TROCAR* (${pts} pts)\n\n` +
                            `1️⃣ 50 pts = 1 dia\n` +
                            `2️⃣ 100 pts = 3 dias\n` +
                            `3️⃣ 200 pts = 7 dias\n\n` +
                            `Digite:`
                        });
                    } else {
                        await enviarResposta(sender, { text: `❌ Precisa de 50 pts! Voce tem ${pts}` });
                    }
                }
                else if (userState.step === 'trocar_pts') {
                    const custos = { '1': [50, 1], '2': [100, 3], '3': [200, 7] };
                    if (custos[text] && userState.pts >= custos[text][0]) {
                        db.adicionarPontos(sender, -custos[text][0]);
                        db.adicionarDiasExtras(sender, custos[text][1]);
                        userStates.set(sender, { step: 'menu' });
                        await enviarResposta(sender, { text: `✅ Troca feita! +${custos[text][1]} dias!` });
                    } else {
                        await enviarResposta(sender, { text: '❌ Opcao invalida!' });
                        userStates.set(sender, { step: 'menu' });
                    }
                }
                
                // VER JOGOS
                else if (userState.step === 'ver_jogos') {
                    const conta = db.buscarContaIlimitada(textOriginal);
                    if (conta) {
                        db.registrarJogoResgatado(sender, conta);
                        userStates.set(sender, { step: 'pos_resgate', conta });
                        await enviarResposta(sender, { text: 
                            `🎮 *${conta.jogo}*\n\n` +
                            `👤 Login: ${conta.login}\n` +
                            `🔒 Senha: ${conta.senha}\n\n` +
                            `⚠️ Modo OFFLINE apenas!\n` +
                            `Digite *favoritar* ou *menu*`
                        });
                    } else {
                        await enviarResposta(sender, { text: '❌ Jogo nao encontrado!' });
                    }
                }
                
                // POS RESGATE
                else if (userState.step === 'pos_resgate') {
                    if (text === 'favoritar') {
                        const r = db.toggleFavorito(sender, userState.conta.id);
                        await enviarResposta(sender, { text: r.adicionado ? '⭐ Adicionado!' : '❌ Removido!' });
                    }
                    userStates.set(sender, { step: 'menu' });
                    await enviarResposta(sender, { text: getMenuPrincipal(pushName, temAcesso) });
                }
                
                // RESGATAR KEY
                else if (userState.step === 'resgatar_key') {
                    const key = text.toUpperCase().replace(/\s/g, '');
                    
                    // Verifica cupom
                    const cupom = db.verificarCupom(key);
                    if (cupom.valido) {
                        userStates.set(sender, { step: 'cupom_plano', cupom });
                        await enviarResposta(sender, { text: 
                            `🎟️ *CUPOM ${cupom.desconto}% OFF!*\n\n` +
                            `1️⃣ 7 dias: R$ ${(10 * (1-cupom.desconto/100)).toFixed(0)}\n` +
                            `2️⃣ 1 mes: R$ ${(25 * (1-cupom.desconto/100)).toFixed(0)}\n` +
                            `3️⃣ Lifetime: R$ ${(80 * (1-cupom.desconto/100)).toFixed(0)}\n\n` +
                            `Digite para comprar:`
                        });
                        return;
                    }
                    
                    if (key === ADMIN_MASTER_KEY) {
                        db.resgatarMasterKey(key, sender, pushName);
                        userStates.set(sender, { step: 'menu' });
                        await enviarResposta(sender, { text: '👑 *ADMIN ATIVADO!* Digite: *admin*' });
                        return;
                    }
                    
                    const r = db.resgatarKey(key, sender, pushName);
                    if (r.sucesso) {
                        const pts = r.plano === '7dias' ? 100 : r.plano === '1mes' ? 250 : 800;
                        db.adicionarPontos(sender, pts);
                        userStates.set(sender, { step: 'menu' });
                        await enviarResposta(sender, { text: 
                            `✅ *KEY ATIVADA!*\n\n` +
                            `📦 ${r.plano}\n` +
                            `📅 ${r.expira}\n` +
                            `💎 +${pts} pontos!`
                        });
                    } else {
                        await enviarResposta(sender, { text: `❌ ${r.erro}` });
                    }
                }
                
                // CUPOM PLANO
                else if (userState.step === 'cupom_plano') {
                    const precos = { '1': 10, '2': 25, '3': 80 };
                    const planos = { '1': '7dias', '2': '1mes', '3': 'lifetime' };
                    if (precos[text]) {
                        const final = (precos[text] * (1 - userState.cupom.desconto/100)).toFixed(0);
                        userStates.set(sender, { step: 'menu' });
                        await enviarResposta(sender, { text: 
                            `🎟️ *CUPOM APLICADO*\n\n` +
                            `📦 ${planos[text]}\n` +
                            `💰 R$ ${final} (com ${userState.cupom.desconto}% OFF)\n\n` +
                            `💬 Fale com: +${ADMIN_NUMBER}\n` +
                            `Mencione: *${userState.cupom.codigo}*`
                        });
                    } else {
                        await enviarResposta(sender, { text: '❌ Opcao invalida!' });
                    }
                }
                
                // BUSCAR JOGO
                else if (userState.step === 'buscar_jogo') {
                    if (text.startsWith('indicado')) {
                        const num = text.replace('indicado', '').trim();
                        if (num) {
                            const r = db.registrarIndicacao(num + '@s.whatsapp.net', sender);
                            if (r.sucesso) {
                                await enviarResposta(sender, { text: `🎉 Indicacao feita! +${r.horasGanhas}h!` });
                                await sock.sendMessage(num + '@s.whatsapp.net', { text: `🎁 Bonus! +${r.horasGanhas}h extras!` });
                            } else {
                                await enviarResposta(sender, { text: `❌ ${r.erro}` });
                            }
                        }
                        userStates.set(sender, { step: 'menu' });
                        return;
                    }
                    
                    const conta = db.buscarContaIlimitada(textOriginal);
                    if (conta) {
                        db.registrarJogoResgatado(sender, conta);
                        userStates.set(sender, { step: 'pos_resgate', conta });
                        await enviarResposta(sender, { text: 
                            `🎮 *${conta.jogo}*\n\n` +
                            `👤 ${conta.login}\n` +
                            `🔒 ${conta.senha}\n\n` +
                            `⚠️ OFFLINE apenas!`
                        });
                    } else {
                        await enviarResposta(sender, { text: '❌ Jogo nao encontrado!' });
                    }
                }

                
                // ==========================================
                // MENU ADMIN
                // ==========================================
                else if (userState.step === 'admin_menu' && isAdmin) {
                    switch(text) {
                        case '1':
                            userStates.set(sender, { step: 'admin_add_jogo', temp: {} });
                            await enviarResposta(sender, { text: '➕ Nome do jogo:' });
                            break;
                        case '2':
                            userStates.set(sender, { step: 'admin_key_plano' });
                            await enviarResposta(sender, { text: '🔑 Plano:\n1️⃣ 7 dias\n2️⃣ 1 mes\n3️⃣ Lifetime' });
                            break;
                        case '3':
                            userStates.set(sender, { step: 'admin_teste_duracao' });
                            await enviarResposta(sender, { text: '🎁 Duracao:\n1️⃣ 1h\n2️⃣ 2h\n3️⃣ 6h' });
                            break;
                        case '4':
                            userStates.set(sender, { step: 'admin_importar_arquivo' });
                            await enviarResposta(sender, { text: '📄 Envie arquivo .txt ou digite AUTO' });
                            break;
                        case '5':
                            userStates.set(sender, { step: 'admin_importar_multiplas' });
                            await enviarResposta(sender, { text: '📋 Cole as contas (login:senha ou numero jogo login senha):' });
                            break;
                        case '6':
                            const jogos = db.getTodosJogosDisponiveis();
                            let msg = '❌ *Remover*\n\n';
                            jogos.slice(0, 10).forEach((j, i) => { msg += `${i+1}. ${j.jogo}\n`; });
                            msg += '\nDigite numero ou *TODOS*';
                            userStates.set(sender, { step: 'admin_remover', jogos });
                            await enviarResposta(sender, { text: msg });
                            break;
                        case '7':
                            const total = db.getTodosJogosDisponiveis().length;
                            userStates.set(sender, { step: 'admin_remover_todos_confirmar' });
                            await enviarResposta(sender, { text: `🗑️ REMOVER TODOS?\n\n⚠️ ${total} jogos serao apagados!\n\nDigite *CONFIRMAR* ou *CANCELAR*` });
                            break;
                        case '8':
                            const stats = db.getEstatisticas();
                            await enviarResposta(sender, { text: 
                                `📊 *ESTATISTICAS*\n\n` +
                                `🎮 Jogos: ${stats.totalJogos}\n` +
                                `👥 Clientes: ${stats.totalClientes}\n` +
                                `🟢 Ativos: ${stats.clientesAtivos}\n` +
                                `🔴 Inativos: ${stats.clientesInativos}\n` +
                                `🔑 Keys: ${stats.keysAtivas}\n` +
                                `💰 Vendas: R$ ${stats.totalVendas || 0}\n` +
                                `💎 Pontos: ${stats.totalPontos || 0}\n` +
                                `🎫 Tickets: ${stats.ticketsAbertos || 0}`
                            });
                            break;
                        case '9':
                            const logs = db.getLogs({}, 15);
                            let msgLogs = '📜 *LOGS*\n\n';
                            logs.forEach((l, i) => {
                                msgLogs += `${i+1}. [${l.tipo}] ${new Date(l.data).toLocaleTimeString()}\n`;
                            });
                            await enviarResposta(sender, { text: msgLogs });
                            break;
                        case '10':
                            const { ativos } = db.getClientesPorStatus();
                            let msgAtv = `🟢 *ATIVOS* (${ativos.length})\n\n`;
                            ativos.slice(0, 10).forEach((c, i) => {
                                msgAtv += `${i+1}. ${c.nome || 'Cliente'}\n   📱 ${c.numero?.split('@')[0]}\n`;
                            });
                            await enviarResposta(sender, { text: msgAtv });
                            break;
                        case '11':
                            const { inativos } = db.getClientesPorStatus();
                            let msgInat = `🔴 *INATIVOS* (${inativos.length})\n\n`;
                            inativos.slice(0, 10).forEach((c, i) => {
                                msgInat += `${i+1}. ${c.nome || 'Cliente'}\n`;
                            });
                            await enviarResposta(sender, { text: msgInat });
                            break;
                        case '12':
                            const rank = db.getRankingClientes(10);
                            let msgRank = `🏆 *RANKING*\n\n`;
                            rank.forEach((c, i) => {
                                const medal = i < 3 ? ['🥇','🥈','🥉'][i] : `${i+1}.`;
                                msgRank += `${medal} ${c.nome}\n   🎮 ${c.jogos} jogos\n`;
                            });
                            await enviarResposta(sender, { text: msgRank });
                            break;
                        case '13':
                            userStates.set(sender, { step: 'admin_banir' });
                            await enviarResposta(sender, { text: '⛔ Numero para banir:' });
                            break;
                        case '14':
                            userStates.set(sender, { step: 'admin_desbanir' });
                            await enviarResposta(sender, { text: '✅ Numero para desbanir:' });
                            break;
                        case '15':
                            const blacklist = db.getBlacklist();
                            let msgBl = `🚫 *BLACKLIST* (${blacklist.length})\n\n`;
                            blacklist.slice(0, 10).forEach((b, i) => {
                                msgBl += `${i+1}. ${b.login}\n`;
                            });
                            await enviarResposta(sender, { text: msgBl });
                            break;
                        case '16':
                            userStates.set(sender, { step: 'admin_broadcast' });
                            await enviarResposta(sender, { text: '📢 Digite a mensagem para todos:' });
                            break;
                        case '17':
                            const recentes = db.getJogosRecentes(5);
                            const clientesAtv = db.getTodosClientes().filter(c => c.temAcesso);
                            let msgNov = `✨ *NOVIDADES!*\n\n🎮 Novos jogos:\n`;
                            recentes.forEach((j, i) => { msgNov += `${i+1}. ${j.jogo}\n`; });
                            msgNov += '\nDigite 4 para ver todos!';
                            
                            let enviados = 0;
                            for (const c of clientesAtv) {
                                try {
                                    await antiBanDelay(sock, c.numero);
                                    await sock.sendMessage(c.numero, { text: msgNov });
                                    enviados++;
                                } catch (e) {}
                            }
                            await enviarResposta(sender, { text: `✅ Enviado para ${enviados} clientes!` });
                            break;
                        case '18':
                            userStates.set(sender, { step: 'admin_cupom_codigo' });
                            await enviarResposta(sender, { text: '🎟️ Codigo do cupom:' });
                            break;
                        case '19':
                            const backupDir = './backups';
                            if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
                            const data = new Date().toISOString().split('T')[0];
                            const backupFile = path.join(backupDir, `backup-${data}.json`);
                            fs.writeFileSync(backupFile, JSON.stringify({
                                data: new Date().toISOString(),
                                contas: db.contas,
                                keys: db.keys,
                                clientes: db.clientes
                            }, null, 2));
                            await enviarResposta(sender, { text: `💾 Backup criado!\n📁 ${backupFile}` });
                            break;
                        case '0':
                        case 'menu':
                            userStates.set(sender, { step: 'menu' });
                            await enviarResposta(sender, { text: getMenuPrincipal(pushName, temAcesso) });
                            break;
                        default:
                            await enviarResposta(sender, { text: getMenuAdmin() });
                    }
                }

                
                // ADMIN: ADICIONAR CONTA
                else if (userState.step === 'admin_add_jogo' && isAdmin) {
                    userStates.set(sender, { step: 'admin_add_login', temp: { jogo: textOriginal } });
                    await enviarResposta(sender, { text: `🎮 ${textOriginal}\n\nLogin:` });
                }
                else if (userState.step === 'admin_add_login' && isAdmin) {
                    userStates.set(sender, { step: 'admin_add_senha', temp: { ...userState.temp, login: textOriginal } });
                    await enviarResposta(sender, { text: `👤 ${textOriginal}\n\nSenha:` });
                }
                else if (userState.step === 'admin_add_senha' && isAdmin) {
                    const conta = { ...userState.temp, senha: textOriginal };
                    conta.categoria = new ContasSteamParser().detectarCategoria(conta.jogo);
                    db.adicionarConta(conta);
                    userStates.set(sender, { step: 'admin_menu' });
                    await enviarResposta(sender, { text: `✅ Adicionado!\n\n🎮 ${conta.jogo}\n👤 ${conta.login}` });
                }
                
                // ADMIN: GERAR KEY
                else if (userState.step === 'admin_key_plano' && isAdmin) {
                    const planos = { '1': ['7dias', 7], '2': ['1mes', 30], '3': ['lifetime', 36500] };
                    if (planos[text]) {
                        const key = `NYUX-${Math.random().toString(36).substring(2,6).toUpperCase()}-${Math.random().toString(36).substring(2,6).toUpperCase()}`;
                        db.gerarKey(key, planos[text][0], planos[text][1], sender);
                        userStates.set(sender, { step: 'admin_menu' });
                        await enviarResposta(sender, { text: `✅ *KEY GERADA!*\n\n🔑 ${key}\n📦 ${planos[text][0]}` });
                    } else {
                        await enviarResposta(sender, { text: '❌ Opcao invalida!' });
                    }
                }
                
                // ADMIN: KEY TESTE
                else if (userState.step === 'admin_teste_duracao' && isAdmin) {
                    const duracoes = { '1': ['1 hora', 1], '2': ['2 horas', 2], '3': ['6 horas', 6] };
                    if (duracoes[text]) {
                        const key = `TESTE-${Math.random().toString(36).substring(2,6).toUpperCase()}-${Math.random().toString(36).substring(2,8).toUpperCase()}`;
                        db.gerarKeyTeste(key, duracoes[text][0], duracoes[text][1]);
                        userStates.set(sender, { step: 'admin_menu' });
                        await enviarResposta(sender, { text: `🎁 *KEY TESTE!*\n\n🔑 ${key}\n⏱️ ${duracoes[text][0]}` });
                    }
                }
                
                // ADMIN: IMPORTAR MULTIPLAS
                else if (userState.step === 'admin_importar_multiplas' && isAdmin) {
                    const parser = new ContasSteamParser();
                    const resultado = parser.processarMultiplasContas(textOriginal);
                    let adicionadas = 0;
                    for (const conta of resultado.adicionadas) {
                        if (db.adicionarConta(conta).sucesso) adicionadas++;
                    }
                    userStates.set(sender, { step: 'admin_menu' });
                    await enviarResposta(sender, { text: 
                        `📋 *IMPORTACAO*\n\n` +
                        `✅ Adicionadas: ${adicionadas}\n` +
                        `❌ Removidas: ${resultado.removidas.length}\n` +
                        `⚠️ Erros: ${resultado.erros.length}`
                    });
                }
                
                // ADMIN: IMPORTAR ARQUIVO
                else if (userState.step === 'admin_importar_arquivo' && isAdmin) {
                    if (text.toLowerCase() === 'auto' && fs.existsSync('contas.txt')) {
                        const conteudo = fs.readFileSync('contas.txt', 'utf8');
                        const parser = new ContasSteamParser();
                        const resultado = parser.processarMultiplasContas(conteudo);
                        let adicionadas = 0;
                        for (const conta of resultado.adicionadas) {
                            if (db.adicionarConta(conta).sucesso) adicionadas++;
                        }
                        userStates.set(sender, { step: 'admin_menu' });
                        await enviarResposta(sender, { text: `✅ Auto: ${adicionadas} adicionadas` });
                    } else {
                        await enviarResposta(sender, { text: 'Envie arquivo .txt' });
                    }
                }
                
                // ADMIN: REMOVER
                else if (userState.step === 'admin_remover' && isAdmin) {
                    if (text.toLowerCase() === 'todos') {
                        userStates.set(sender, { step: 'admin_remover_todos_confirmar' });
                        await enviarResposta(sender, { text: `🗑️ REMOVER TODOS?\n\nDigite *CONFIRMAR* ou *CANCELAR*` });
                        return;
                    }
                    const escolha = parseInt(text);
                    let conta = null;
                    if (!isNaN(escolha) && escolha >= 1 && escolha <= userState.jogos.length) {
                        conta = userState.jogos[escolha - 1];
                    } else {
                        conta = userState.jogos.find(c => c.jogo.toLowerCase().includes(text.toLowerCase()));
                    }
                    if (conta) {
                        db.removerConta(conta.id);
                        userStates.set(sender, { step: 'admin_menu' });
                        await enviarResposta(sender, { text: `✅ Removido: ${conta.jogo}` });
                    } else {
                        await enviarResposta(sender, { text: '❌ Nao encontrado!' });
                    }
                }
                
                // ADMIN: REMOVER TODOS CONFIRMAR
                else if (userState.step === 'admin_remover_todos_confirmar' && isAdmin) {
                    if (text === 'confirmar' || text === 'CONFIRMAR') {
                        const total = db.removerTodasContas();
                        userStates.set(sender, { step: 'admin_menu' });
                        await enviarResposta(sender, { text: `🗑️ *${total} JOGOS REMOVIDOS!*` });
                    } else {
                        userStates.set(sender, { step: 'admin_menu' });
                        await enviarResposta(sender, { text: '✅ Cancelado.' });
                    }
                }
                
                // ADMIN: BANIR/DESBANIR
                else if (userState.step === 'admin_banir' && isAdmin) {
                    const num = text.replace(/\D/g, '');
                    db.banirUsuario(num + '@s.whatsapp.net', 'Banido pelo admin');
                    await sock.sendMessage(num + '@s.whatsapp.net', { text: '⛔ Voce foi banido.' }).catch(() => {});
                    userStates.set(sender, { step: 'admin_menu' });
                    await enviarResposta(sender, { text: `⛔ ${num} banido!` });
                }
                else if (userState.step === 'admin_desbanir' && isAdmin) {
                    const num = text.replace(/\D/g, '');
                    db.desbanirUsuario(num + '@s.whatsapp.net');
                    await sock.sendMessage(num + '@s.whatsapp.net', { text: '✅ Voce foi desbanido!' }).catch(() => {});
                    userStates.set(sender, { step: 'admin_menu' });
                    await enviarResposta(sender, { text: `✅ ${num} desbanido!` });
                }
                
                // ADMIN: BROADCAST
                else if (userState.step === 'admin_broadcast' && isAdmin) {
                    const clientes = db.getTodosClientes();
                    let enviados = 0;
                    for (const c of clientes) {
                        try {
                            await antiBanDelay(sock, c.numero);
                            await sock.sendMessage(c.numero, { text: `📢 *ADMIN*\n\n${textOriginal}` });
                            enviados++;
                        } catch (e) {}
                    }
                    userStates.set(sender, { step: 'admin_menu' });
                    await enviarResposta(sender, { text: `✅ Broadcast: ${enviados} enviados` });
                }
                
                // ADMIN: CUPOM
                else if (userState.step === 'admin_cupom_codigo' && isAdmin) {
                    const codigo = text.toUpperCase().replace(/\s/g, '');
                    userStates.set(sender, { step: 'admin_cupom_desc', codigo });
                    await enviarResposta(sender, { text: `🎟️ ${codigo}\n\nDesconto %:` });
                }
                else if (userState.step === 'admin_cupom_desc' && isAdmin) {
                    const desc = parseInt(text);
                    if (desc > 0 && desc <= 100) {
                        db.criarCupom(userState.codigo, desc, sender);
                        userStates.set(sender, { step: 'admin_menu' });
                        await enviarResposta(sender, { text: `✅ Cupom ${userState.codigo} criado! ${desc}% OFF` });
                    }
                }
                
                // DOCUMENTO RECEBIDO
                if (msg.message.documentMessage && isAdmin && userState.step === 'admin_importar_arquivo') {
                    try {
                        const buffer = await sock.downloadMediaMessage(msg);
                        const conteudo = buffer.toString('utf8');
                        const parser = new ContasSteamParser();
                        const resultado = parser.processarMultiplasContas(conteudo);
                        let adicionadas = 0;
                        for (const conta of resultado.adicionadas) {
                            if (db.adicionarConta(conta).sucesso) adicionadas++;
                        }
                        userStates.set(sender, { step: 'admin_menu' });
                        await enviarResposta(sender, { text: `📄 Arquivo: ${adicionadas} adicionadas` });
                    } catch (e) {
                        await enviarResposta(sender, { text: '❌ Erro no arquivo!' });
                    }
                }
                
            } catch (error) {
                console.error('❌ Erro:', error);
                try {
                    await antiBanDelay(sock, sender);
                    await sock.sendMessage(sender, { text: '❌ Erro! Digite *menu*' });
                } catch (e) {}
            }
        });
        
    } catch (err) {
        console.error('❌ Erro conexao:', err);
        reconectando = false;
        setTimeout(connectToWhatsApp, 10000);
    }
}

// ==========================================
// INICIALIZACAO
// ==========================================
console.log('╔════════════════════════════════════════╗');
console.log('║     🎮 NYUX STORE BOT - MEGA v2.0      ║');
console.log('║   Anti-Ban + Contas Ilimitadas + TUDO  ║');
console.log('╚════════════════════════════════════════╝\n');

connectToWhatsApp();
