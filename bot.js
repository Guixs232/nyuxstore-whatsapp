const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const http = require('http');
const path = require('path');
const Database = require('./database');
const moment = require('moment');

// ==========================================
// CONFIGURACOES
// ==========================================
const BOT_NUMBER = process.env.BOT_NUMBER || '556183040115';
const ADMIN_NUMBER = process.env.ADMIN_NUMBER || '5518997972598';
const STORE_NAME = process.env.STORE_NAME || 'NyuxStore';
const PORT = process.env.PORT || 8080;
const ADMIN_MASTER_KEY = 'NYUX-ADM1-GUIXS23';

// ==========================================
// DELAY HUMANO - Anti-detecao (5-15 segundos)
// ==========================================
function delayHumano() {
    return Math.floor(Math.random() * 10000) + 5000;
}

async function esperarDelay() {
    const tempo = delayHumano();
    console.log(`⏳ Delay humano: ${tempo/1000}s...`);
    await new Promise(resolve => setTimeout(resolve, tempo));
}

console.log('🚀 Iniciando NyuxStore...');
console.log('📱 Bot:', BOT_NUMBER);
console.log('👑 Admin:', ADMIN_NUMBER);
console.log('⏱️ Delay humano: 5-15s ativado');
console.log('');

// ==========================================
// LIMPEZA INICIAL
// ==========================================
const pastasParaLimpar = ['auth_info_baileys', 'qrcode.png', 'qrcode.txt'];
console.log('🧹 Limpando arquivos antigos...');
pastasParaLimpar.forEach(pasta => {
    try {
        if (fs.existsSync(pasta)) {
            fs.rmSync(pasta, { recursive: true, force: true });
            console.log('  ✅', pasta);
        }
    } catch (e) {}
});
console.log('');

// ==========================================
// PARSER DE CONTAS STEAM
// ==========================================
class ContasSteamParser {
    constructor() {
        this.contas = [];
        this.contasRemovidas = [];
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
        const linhas = texto.split('\n').filter(l => l.trim());
        const resultados = { adicionadas: [], removidas: [], erros: [] };
        for (const linha of linhas) {
            const conta = this.parseLinhaSimples(linha.trim());
            if (conta) {
                const verificacao = this.verificarContaProblematica(conta);
                if (verificacao.problema) {
                    resultados.removidas.push({ numero: conta.numero, jogo: conta.jogo, motivo: verificacao.motivo });
                } else {
                    resultados.adicionadas.push(conta);
                }
            } else {
                resultados.erros.push(linha.trim());
            }
        }
        return resultados;
    }

    parseLinhaSimples(linha) {
        linha = linha.replace(/^[🔢🎮👤🔒✅❌📱\s]+/g, '').trim();
        if (linha.includes('|')) {
            const partes = linha.split('|').map(p => p.trim());
            if (partes.length >= 4) {
                return { numero: partes[0], jogo: partes[1], login: partes[2], senha: partes[3], categoria: this.detectarCategoria(partes[1]) };
            }
        }
        if (linha.includes(' - ')) {
            const partes = linha.split(' - ').map(p => p.trim());
            if (partes.length >= 4) {
                return { numero: partes[0], jogo: partes[1], login: partes[2], senha: partes[3], categoria: this.detectarCategoria(partes[1]) };
            }
        }
        const partes = linha.split(/\s+/);
        if (partes.length >= 4) {
            if (/^\d{1,4}$/.test(partes[0])) {
                const numero = partes[0];
                const senha = partes[partes.length - 1];
                const login = partes[partes.length - 2];
                const jogo = partes.slice(1, -2).join(' ');
                if (numero && jogo && login && senha) {
                    return { numero, jogo, login, senha, categoria: this.detectarCategoria(jogo) };
                }
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
const TEMPO_LIMPEZA_MS = 5 * 60 * 1000;
let botConectado = false;
let qrCodeDataURL = null;
let qrCodeRaw = null;
let qrCodeFilePath = null;
let sockGlobal = null;
let tentativasConexao = 0;
let reconectando = false;

setInterval(() => { mensagensProcessadas.clear(); console.log('🧹 Cache limpo'); }, TEMPO_LIMPEZA_MS);

// ==========================================
// SERVIDOR WEB
// ==========================================
const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const url = req.url;
    
    if (url === '/api/status') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ conectado: botConectado, temQR: !!qrCodeDataURL, timestamp: new Date().toISOString() }));
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
        res.end(`<!DOCTYPE html><html><head><title>${STORE_NAME} - Bot WhatsApp</title><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="refresh" content="3"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;text-align:center;padding:40px 20px;background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);color:white;min-height:100vh}h1{color:#00d9ff;font-size:2.5rem;margin-bottom:10px;text-shadow:0 0 20px rgba(0,217,255,0.3)}.status{padding:25px;border-radius:20px;margin:30px auto;font-size:1.3rem;max-width:500px;box-shadow:0 10px 30px rgba(0,0,0,0.3)}.online{background:linear-gradient(135deg,#4CAF50,#45a049)}.offline{background:linear-gradient(135deg,#f44336,#da190b)}.waiting{background:linear-gradient(135deg,#ff9800,#f57c00);animation:pulse 2s infinite}@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.02)}}.qr-container{background:white;padding:30px;border-radius:25px;margin:30px auto;max-width:400px;box-shadow:0 20px 60px rgba(0,0,0,0.5)}.qr-container img{width:100%;max-width:350px;border-radius:10px}.btn{background:linear-gradient(135deg,#00d9ff,#0099cc);color:#1a1a2e;padding:18px 40px;text-decoration:none;border-radius:30px;font-weight:bold;font-size:1.1rem;display:inline-block;margin:15px;box-shadow:0 5px 20px rgba(0,217,255,0.4);transition:transform 0.3s}.btn:hover{transform:translateY(-3px)}.info{background:rgba(255,255,255,0.1);backdrop-filter:blur(10px);padding:25px;border-radius:20px;margin:30px auto;max-width:500px;border:1px solid rgba(255,255,255,0.1)}.info p{margin:10px 0;font-size:1.1rem}.tentativa{color:#aaa;margin-top:20px}</style></head><body><h1>🎮 ${STORE_NAME}</h1>${botConectado ? `<div class="status online"><h2>✅ Bot Conectado!</h2><p>Sistema operacional</p></div><div class="info"><p>🤖 Bot: +${BOT_NUMBER}</p><p>👑 Admin: +${ADMIN_NUMBER}</p></div>` : (qrCodeDataURL ? `<div class="status waiting"><h2>📱 Escaneie o QR Code</h2></div><div class="qr-container"><img src="${qrCodeDataURL}" alt="QR Code WhatsApp"></div><a href="/qr.png" class="btn" download>💾 Baixar QR Code</a><div class="info"><h3>📖 Como conectar:</h3><p>1. Abra WhatsApp no celular</p><p>2. Toque em ⋮ → <strong>WhatsApp Web</strong></p><p>3. Toque em <strong>Conectar dispositivo</strong></p><p>4. Aponte a camera para o QR Code acima</p></div>` : `<div class="status offline"><h2>⏳ Iniciando conexao...</h2></div><p class="tentativa">Tentativa: ${tentativasConexao}</p><div class="info"><p>Aguarde o QR Code aparecer...</p><p>Isso pode levar alguns segundos</p></div>`)}</body></html>`);
    } else {
        res.writeHead(302, { 'Location': '/' });
        res.end();
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Servidor: http://localhost:${PORT}`);
    console.log(`🖼️ QR Code: http://localhost:${PORT}/qr.png\n`);
});

// ==========================================
// FUNCOES AUXILIARES
// ==========================================
async function salvarQRCode(qr) {
    try {
        console.log('💾 Processando QR Code...');
        qrCodeRaw = qr;
        const QRCode = require('qrcode');
        qrCodeDataURL = await QRCode.toDataURL(qr, { width: 500, margin: 2, color: { dark: '#000000', light: '#FFFFFF' } });
        qrCodeFilePath = path.join(__dirname, 'qrcode.png');
        await QRCode.toFile(qrCodeFilePath, qr, { width: 500, margin: 2 });
        fs.writeFileSync('qrcode.txt', qr);
        console.log('✅ QR Code salvo');
        console.log('\n╔════════════════════════════════════════╗');
        console.log('║         📱 QR CODE PRONTO              ║');
        console.log('╚════════════════════════════════════════╝\n');
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

function getMenuPrincipal(nome) {
    return `🎮 *${STORE_NAME}*

Ola, ${nome}! 👋

*Escolha uma opcao:*

1️⃣ *Comprar Key* 💰
2️⃣ *Resgatar Key* 🎁
3️⃣ *Buscar Jogo* 🔍
4️⃣ *Ver Jogos* 📋
5️⃣ *Meu Perfil* 👤
6️⃣ *Historico* 📜
7️⃣ *Favoritos* ⭐
8️⃣ *Indicar Amigo* 👥
9️⃣ *Ajuda* ❓
0️⃣ *Falar com Atendente* 💬

_Digite o numero da opcao_`;
}

function getMenuAdmin() {
    return `🔧 *PAINEL ADMIN*

*Escolha uma opcao:*

1️⃣ *Adicionar Conta* ➕
2️⃣ *Gerar Key* 🔑
3️⃣ *Gerar Key Teste* 🎁
4️⃣ *Importar Contas (TXT)* 📄
5️⃣ *Importar Multiplas* 📋
6️⃣ *Estatisticas* 📊
7️⃣ *Ver Logs* 📜
8️⃣ *Clientes Ativos* 🟢
9️⃣ *Clientes Inativos* 🔴
🔟 *Banir Usuario* ⛔
1️⃣1️⃣ *Desbanir Usuario* ✅
1️⃣2️⃣ *Broadcast* 📢
1️⃣3️⃣ *Remover Conta* ❌
1️⃣4️⃣ *Entrar em Grupo* 👥

0️⃣ *Voltar ao Menu*`;
}

function calcularTempoRestante(dataExpiracao) {
    if (!dataExpiracao) return 'N/A';
    const agora = new Date();
    const expira = new Date(dataExpiracao);
    const diffMs = expira - agora;
    if (diffMs <= 0) return '⛔ EXPIRADO';
    const dias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const horas = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutos = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (dias > 0) return `${dias}d ${horas}h ${minutos}m`;
    if (horas > 0) return `${horas}h ${minutos}m`;
    return `${minutos}m`;
}

function calcularTempoUso(dataRegistro) {
    if (!dataRegistro) return 'Novo usuario';
    const agora = new Date();
    const registro = new Date(dataRegistro);
    const diffMs = agora - registro;
    const dias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const horas = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const meses = Math.floor(dias / 30);
    if (meses > 0) return `${meses} mes${meses > 1 ? 'es' : ''}`;
    if (dias > 0) return `${dias} dia${dias > 1 ? 's' : ''}`;
    if (horas > 0) return `${horas} hora${horas > 1 ? 's' : ''}`;
    return 'Agora mesmo';
}

// ==========================================
// CONEXAO WHATSAPP
// ==========================================
async function connectToWhatsApp() {
    if (reconectando) return;
    reconectando = true;
    tentativasConexao++;
    const delayMs = Math.min(5000 * Math.pow(2, tentativasConexao - 1), 60000);
    
    console.log(`\n🔌 TENTATIVA #${tentativasConexao}\n`);
    
    try {
        const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } = await import('@whiskeysockets/baileys');
        const { version } = await fetchLatestBaileysVersion();
        console.log(`📱 Versao WhatsApp Web: ${version.join('.')}`);
        
        if (tentativasConexao > 3) {
            console.log('🧹 Limpando credenciais antigas...');
            try { fs.rmSync('auth_info_baileys', { recursive: true, force: true }); tentativasConexao = 0; } catch (e) {}
        }
        
        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
        console.log('🔌 Criando conexao...\n');
        
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
                const erroMsg = lastDisconnect?.error?.message || '';
                console.log(`\n❌ CONEXAO FECHADA!`);
                console.log(`   Codigo: ${statusCode}`);
                console.log(`   Erro: ${erroMsg}`);
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) {
                    console.log(`\n⏳ Reconectando em ${delayMs/1000}s...\n`);
                    setTimeout(connectToWhatsApp, delayMs);
                } else {
                    console.log('\n🚫 Logout detectado. Nao reconectando.\n');
                }
            } else if (connection === 'open') {
                botConectado = true;
                qrCodeDataURL = null;
                qrCodeRaw = null;
                tentativasConexao = 0;
                reconectando = false;
                try {
                    if (fs.existsSync('qrcode.png')) fs.unlinkSync('qrcode.png');
                    if (fs.existsSync('qrcode.txt')) fs.unlinkSync('qrcode.txt');
                } catch (e) {}
                console.log('\n✅✅✅ BOT CONECTADO COM SUCESSO! ✅✅✅');
                console.log('📱 Numero:', sock.user?.id?.split(':')[0]);
                console.log('👤 Nome:', sock.user?.name || 'Bot');
                console.log('');
            } else if (connection === 'connecting') {
                console.log('⏳ Conectando...');
            }
        });
        
        sock.ev.on('creds.update', saveCreds);

        // ==========================================
        // PROCESSAMENTO DE MENSAGENS COM DELAY HUMANO
        // ==========================================
        sock.ev.on('messages.upsert', async (m) => {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;
            
            const msgId = msg.key.id;
            const participant = msg.key.participant || msg.key.remoteJid;
            const uniqueId = `${msgId}_${participant}`;
            
            if (mensagensProcessadas.has(uniqueId)) {
                console.log(`⏩ Mensagem ${msgId} ja processada`);
                return;
            }
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
            
            const textOriginal = text;
            text = text.toLowerCase().trim();
            
            console.log(`\n📩 ${pushName} (${sender.split('@')[0]}): "${text.substring(0, 50)}..."`);
            
            if (isGroup) {
                if (!text.startsWith('!')) return;
                text = text.substring(1).trim();
            }
            
            const isAdmin = verificarAdmin(sender);
            const perfil = db.getPerfil(sender);
            const userState = userStates.get(sender) || { step: 'menu' };
            
            if (db.isBanido(sender)) {
                await sock.sendMessage(sender, { text: '⛔ *Voce foi banido do sistema.*\n\nEntre em contato com o administrador.' });
                return;
            }
            
            let respostaEnviada = false;
            
            async function enviarResposta(destino, mensagem) {
                if (respostaEnviada) return;
                respostaEnviada = true;
                await esperarDelay();
                await sock.sendMessage(destino, mensagem);
            }
            
            try {
                // ========== COMANDO AJUDA ==========
                if (text === 'ajuda' || text === 'help' || text === '9') {
                    const msgAjuda = `❓ *CENTRAL DE AJUDA*

*Como usar o bot:*

1️⃣ *Comprar Key* - Veja precos e fale com admin
2️⃣ *Resgatar Key* - Ative sua key de acesso
3️⃣ *Buscar Jogo* - Procure um jogo especifico
4️⃣ *Ver Jogos* - Lista todos os jogos disponiveis
5️⃣ *Meu Perfil* - Veja seu status e informacoes
6️⃣ *Historico* - Jogos que voce ja pegou
7️⃣ *Favoritos* - Seus jogos favoritos
8️⃣ *Indicar Amigo* - Ganhe horas extras

*Dicas:*
• Use *menu* a qualquer momento para voltar
• Busque por nome do jogo ou categoria
• Favorite jogos para achar rapido depois

*Problemas?* Digite 0 para falar com atendente`;
                    await enviarResposta(sender, { text: msgAjuda });
                    return;
                }
                
                // ========== COMANDO ADMIN ==========
                if (text === 'admin' || text === 'adm') {
                    if (isAdmin) {
                        userStates.set(sender, { step: 'admin_menu' });
                        await enviarResposta(sender, { text: getMenuAdmin() });
                    } else {
                        await enviarResposta(sender, { text: '⛔ *Acesso Negado*' });
                    }
                    return;
                }
                
                // ========== MENU PRINCIPAL ==========
                if (userState.step === 'menu') {
                    switch(text) {
                        case '1':
                            await enviarResposta(sender, { text: `💰 *Precos:*\n\n• 7 dias: R$ 10\n• 1 mes: R$ 25\n• Lifetime: R$ 80\n\n💬 Para comprar, fale com:\n+${ADMIN_NUMBER}` });
                            break;
                            
                        case '2':
                            userStates.set(sender, { step: 'resgatar_key' });
                            await enviarResposta(sender, { text: '🎁 Digite sua key:\n*NYUX-XXXX-XXXX*' });
                            break;
                            
                        case '3':
                            if (!db.verificarAcesso(sender)) {
                                await enviarResposta(sender, { text: '❌ Precisa de key ativa!\n\nDigite 2 para resgatar ou 8 para teste gratis.' });
                                return;
                            }
                            userStates.set(sender, { step: 'buscar_jogo' });
                            await enviarResposta(sender, { text: '🔍 Digite o nome do jogo que procura:\n\n_Exemplo: GTA, FIFA, Minecraft_' });
                            break;
                            
                        case '4':
                            if (!db.verificarAcesso(sender)) {
                                await enviarResposta(sender, { text: '❌ Precisa de key ativa! Digite 2 ou 8' });
                                return;
                            }
                            const todosJogos = db.getTodosJogosDisponiveis();
                            if (todosJogos.length === 0) {
                                await enviarResposta(sender, { text: '📋 *Nenhum jogo cadastrado ainda.*' });
                                return;
                            }
                            const jogosPorPagina = 15;
                            const totalPaginas = Math.ceil(todosJogos.length / jogosPorPagina);
                            let msgLista = `📋 *TODOS OS JOGOS*\n\n`;
                            msgLista += `🎮 Total: ${todosJogos.length} jogos\n`;
                            msgLista += `📄 Pagina 1/${totalPaginas}\n\n`;
                            const jogosPagina = todosJogos.slice(0, jogosPorPagina);
                            jogosPagina.forEach((jogo, index) => {
                                msgLista += `${index + 1}. *${jogo.jogo}*\n`;
                                msgLista += `   📂 ${jogo.categoria}\n`;
                                msgLista += `   👤 ${jogo.login}\n\n`;
                            });
                            if (totalPaginas > 1) msgLista += `\n📄 Digite *mais* para proxima pagina\n`;
                            msgLista += `\n🔍 Digite o nome do jogo para buscar`;
                            userStates.set(sender, { step: 'ver_jogos_pagina', paginaAtual: 1, totalPaginas, todosJogos });
                            await enviarResposta(sender, { text: msgLista });
                            break;
                            
                        case '5':
                            const p = db.getPerfil(sender);
                            const numLimpo = sender.split('@')[0];
                            const tempoUso = calcularTempoUso(p.dataRegistro);
                            let tempoRestante = '⛔ Sem plano ativo';
                            let expiraEm = 'N/A';
                            if (p.temAcesso && p.keyInfo) {
                                tempoRestante = calcularTempoRestante(p.keyInfo.dataExpiracao);
                                expiraEm = p.keyInfo.expira || 'N/A';
                            }
                            const jogosResgatados = p.jogosResgatados ? p.jogosResgatados.length : 0;
                            const keysResgatadas = p.keysResgatadas ? p.keysResgatadas.length : 0;
                            const favoritos = p.jogosFavoritos ? p.jogosFavoritos.length : 0;
                            let tipoPlano = '❌ Sem acesso';
                            if (p.temAcesso) {
                                if (p.acessoPermanente) tipoPlano = '👑 ADMIN LIFETIME';
                                else if (p.keyInfo && p.keyInfo.plano) tipoPlano = `✅ ${p.keyInfo.plano.toUpperCase()}`;
                                else tipoPlano = '✅ ATIVO';
                            } else if (p.usouTeste) tipoPlano = '⛔ TESTE EXPIRADO';
                            
                            let msgPerfil = `👤 *MEU PERFIL*\n\n`;
                            msgPerfil += `🪪 *Nome:* ${p.nome || pushName}\n`;
                            msgPerfil += `📱 *Numero:* ${numLimpo}\n\n`;
                            msgPerfil += `⏱️ *Status do Plano:*\n${tipoPlano}\n`;
                            if (p.temAcesso && p.keyInfo) {
                                msgPerfil += `\n📅 *Expira em:* ${expiraEm}\n`;
                                msgPerfil += `⏳ *Tempo restante:* ${tempoRestante}\n`;
                            }
                            msgPerfil += `\n📊 *Estatisticas:*\n`;
                            msgPerfil += `🎮 Jogos resgatados: ${jogosResgatados}\n`;
                            msgPerfil += `⭐ Favoritos: ${favoritos}\n`;
                            msgPerfil += `🔑 Keys resgatadas: ${keysResgatadas}\n`;
                            msgPerfil += `📅 *Cliente ha:* ${tempoUso}\n`;
                            if (p.indicacoes > 0) {
                                msgPerfil += `\n🎁 *Indicacoes:* ${p.indicacoes} amigos\n`;
                                msgPerfil += `⏰ *Bonus:* ${p.horasBonus}h extras\n`;
                            }
                            if (p.usouTeste && !p.temAcesso) {
                                msgPerfil += `\n😢 *Seu teste expirou!*\n💰 Compre uma key para continuar:\n• 7 dias: R$ 10\n• 1 mes: R$ 25\n• Lifetime: R$ 80\n`;
                            }
                            if (p.acessoPermanente) msgPerfil += `\n\n👑 *Voce e Administrador!* 🌟`;
                            await enviarResposta(sender, { text: msgPerfil });
                            break;
                            
                        case '6':
                            if (!db.verificarAcesso(sender)) {
                                await enviarResposta(sender, { text: '❌ Precisa de key ativa!' });
                                return;
                            }
                            const historico = db.getPerfil(sender).jogosResgatados || [];
                            if (historico.length === 0) {
                                await enviarResposta(sender, { text: '📜 *Historico vazio*\n\nVoce ainda nao resgatou nenhum jogo.\n\nUse opcao 3 para buscar ou 4 para ver todos.' });
                                return;
                            }
                            let msgHist = `📜 *SEU HISTORICO*\n\nTotal: ${historico.length} jogos\n\n`;
                            historico.slice(0, 10).forEach((jogo, index) => {
                                const data = new Date(jogo.dataResgate).toLocaleDateString('pt-BR');
                                msgHist += `${index + 1}. *${jogo.jogo}*\n   📂 ${jogo.categoria}\n   👤 ${jogo.login}\n   🔒 ${jogo.senha}\n   📅 ${data}\n\n`;
                            });
                            if (historico.length > 10) msgHist += `...e mais ${historico.length - 10} jogos\n`;
                            await enviarResposta(sender, { text: msgHist });
                            break;
                            
                        case '7':
                            if (!db.verificarAcesso(sender)) {
                                await enviarResposta(sender, { text: '❌ Precisa de key ativa!' });
                                return;
                            }
                            const meusFavoritos = db.getFavoritos(sender);
                            if (meusFavoritos.length === 0) {
                                await enviarResposta(sender, { text: '⭐ *Favoritos vazio*\n\nPara adicionar um jogo aos favoritos, busque o jogo (opcao 3) e digite *favoritar*.' });
                                return;
                            }
                            let msgFav = `⭐ *MEUS FAVORITOS*\n\nTotal: ${meusFavoritos.length} jogos\n\n`;
                            meusFavoritos.forEach((jogo, index) => {
                                msgFav += `${index + 1}. *${jogo.jogo}*\n   📂 ${jogo.categoria}\n   👤 ${jogo.login}\n\n`;
                            });
                            msgFav += `Para remover, busque o jogo e digite *desfavoritar*`;
                            await enviarResposta(sender, { text: msgFav });
                            break;
                            
                        case '8':
                            await enviarResposta(sender, { text: `👥 *INDICAR AMIGO*\n\nPeca para seu amigo digitar quando entrar no bot:\n*indicado ${sender.split('@')[0]}*\n\nVoce ganhara *2 horas extras* no seu plano atual!\n\n⚠️ So funciona se o amigo nunca usou o bot.` });
                            break;
                            
                        case '0':
                            await enviarResposta(sender, { text: '💬 Chamando atendente... Aguarde.' });
                            await sock.sendMessage(ADMIN_NUMBER + '@s.whatsapp.net', { text: `📩 Cliente solicitou atendente:\n\n*${pushName}*\n${sender.split('@')[0]}\n\nDigite para responder.` });
                            break;
                            
                        default:
                            await enviarResposta(sender, { text: getMenuPrincipal(pushName) });
                    }
                }

                // ========== PAGINACAO DE JOGOS ==========
                else if (userState.step === 'ver_jogos_pagina') {
                    if (text === 'mais' || text === 'proxima' || text === 'proxima') {
                        const proximaPagina = userState.paginaAtual + 1;
                        if (proximaPagina > userState.totalPaginas) {
                            await enviarResposta(sender, { text: '✅ Voce ja viu todos os jogos!\n\nDigite *menu* para voltar.' });
                            userStates.set(sender, { step: 'menu' });
                            return;
                        }
                        const jogosPorPagina = 15;
                        const inicio = (proximaPagina - 1) * jogosPorPagina;
                        const fim = inicio + jogosPorPagina;
                        const jogosPagina = userState.todosJogos.slice(inicio, fim);
                        let msgLista = `📋 *TODOS OS JOGOS*\n\n🎮 Total: ${userState.todosJogos.length} jogos\n📄 Pagina ${proximaPagina}/${userState.totalPaginas}\n\n`;
                        jogosPagina.forEach((jogo, index) => {
                            const numReal = inicio + index + 1;
                            msgLista += `${numReal}. *${jogo.jogo}*\n   📂 ${jogo.categoria}\n   👤 ${jogo.login}\n\n`;
                        });
                        if (proximaPagina < userState.totalPaginas) msgLista += `\n📄 Digite *mais* para proxima pagina\n`;
                        msgLista += `\n🔍 Digite o nome do jogo para buscar`;
                        userStates.set(sender, { ...userState, step: 'ver_jogos_pagina', paginaAtual: proximaPagina });
                        await enviarResposta(sender, { text: msgLista });
                    } else if (text === 'menos' || text === 'anterior') {
                        const paginaAnterior = userState.paginaAtual - 1;
                        if (paginaAnterior < 1) {
                            await enviarResposta(sender, { text: '❌ Voce esta na primeira pagina!' });
                            return;
                        }
                        const jogosPorPagina = 15;
                        const inicio = (paginaAnterior - 1) * jogosPorPagina;
                        const fim = inicio + jogosPorPagina;
                        const jogosPagina = userState.todosJogos.slice(inicio, fim);
                        let msgLista = `📋 *TODOS OS JOGOS*\n\n🎮 Total: ${userState.todosJogos.length} jogos\n📄 Pagina ${paginaAnterior}/${userState.totalPaginas}\n\n`;
                        jogosPagina.forEach((jogo, index) => {
                            const numReal = inicio + index + 1;
                            msgLista += `${numReal}. *${jogo.jogo}*\n   📂 ${jogo.categoria}\n   👤 ${jogo.login}\n\n`;
                        });
                        msgLista += `\n📄 Digite *mais* para proxima pagina\n📄 Digite *menos* para pagina anterior`;
                        userStates.set(sender, { ...userState, step: 'ver_jogos_pagina', paginaAtual: paginaAnterior });
                        await enviarResposta(sender, { text: msgLista });
                    } else {
                        userStates.set(sender, { step: 'menu' });
                        const conta = db.buscarConta(textOriginal);
                        if (conta) {
                            db.registrarJogoResgatado(sender, conta);
                            let msgResposta = `🎮 *${conta.jogo}*\n📂 ${conta.categoria}\n\n👤 *Login:* ${conta.login}\n🔒 *Senha:* ${conta.senha}\n\n⚠️ *IMPORTANTE:*\n• Use modo OFFLINE\n• NAO altere a senha\n• NAO compartilhe esta conta\n\nDigite *favoritar* para salvar\nDigite *menu* para voltar`;
                            userStates.set(sender, { step: 'pos_resgate', contaAtual: conta, veioDePagina: true });
                            await enviarResposta(sender, { text: msgResposta });
                        } else {
                            await enviarResposta(sender, { text: getMenuPrincipal(pushName) });
                        }
                    }
                }
                
                // ========== POS RESGATE (FAVORITAR) ==========
                else if (userState.step === 'pos_resgate') {
                    if (text === 'favoritar' || text === 'fav') {
                        const resultado = db.toggleFavorito(sender, userState.contaAtual.id);
                        const msg = resultado.adicionado ? `⭐ *Adicionado aos favoritos!*\n\nTotal: ${resultado.total} favoritos` : `❌ *Removido dos favoritos!*\n\nTotal: ${resultado.total} favoritos`;
                        await enviarResposta(sender, { text: msg });
                        if (userState.veioDePagina) userStates.set(sender, { step: 'ver_jogos_pagina', ...userState });
                        else userStates.set(sender, { step: 'menu' });
                    } else if (text === 'desfavoritar' || text === 'desfav') {
                        const resultado = db.toggleFavorito(sender, userState.contaAtual.id);
                        await enviarResposta(sender, { text: `❌ *Removido dos favoritos!*\n\nTotal: ${resultado.total} favoritos` });
                        userStates.set(sender, { step: 'menu' });
                    } else {
                        userStates.set(sender, { step: 'menu' });
                        await enviarResposta(sender, { text: getMenuPrincipal(pushName) });
                    }
                }
                
                // ========== RESGATAR KEY ==========
                else if (userState.step === 'resgatar_key') {
                    const key = text.toUpperCase().replace(/\s/g, '');
                    if (key === ADMIN_MASTER_KEY) {
                        const resultado = db.resgatarMasterKey(key, sender, pushName);
                        if (resultado.sucesso) {
                            userStates.set(sender, { step: 'menu' });
                            await enviarResposta(sender, { text: `👑 *ADMIN ATIVADO!*\n\nDigite: *admin*` });
                        } else {
                            await enviarResposta(sender, { text: `❌ *${resultado.erro}*` });
                        }
                        return;
                    }
                    if (!key.match(/^NYUX-[A-Z0-9]{4}-[A-Z0-9]{4}$/)) {
                        await enviarResposta(sender, { text: '❌ Formato invalido! Use NYUX-XXXX-XXXX' });
                        return;
                    }
                    const resultado = db.resgatarKey(key, sender, pushName);
                    if (resultado.sucesso) {
                        userStates.set(sender, { step: 'menu' });
                        await enviarResposta(sender, { text: `✅ *KEY ATIVADA!*\n\nPlano: ${resultado.plano}\nExpira: ${resultado.expira}` });
                    } else {
                        await enviarResposta(sender, { text: `❌ *Erro:* ${resultado.erro}` });
                    }
                }
                
                // ========== BUSCAR JOGO ==========
                else if (userState.step === 'buscar_jogo') {
                    if (text.startsWith('indicado')) {
                        const numeroIndicador = text.replace('indicado', '').trim();
                        if (numeroIndicador) {
                            const resultado = db.registrarIndicacao(numeroIndicador + '@s.whatsapp.net', sender);
                            await enviarResposta(sender, { text: `🎉 *Indicacao registrada!*\n\nSeu amigo ganhou ${resultado.horasGanhas}h extras!` });
                            await sock.sendMessage(numeroIndicador + '@s.whatsapp.net', { text: `🎁 *Voce ganhou bonus!*\n\n${pushName} usou seu codigo de indiacao!\n⏰ +${resultado.horasGanhas} horas extras adicionadas!` });
                        } else {
                            await enviarResposta(sender, { text: '❌ Formato invalido. Use: indicado 5518999999999' });
                        }
                        userStates.set(sender, { step: 'menu' });
                        return;
                    }
                    
                    const conta = db.buscarContaAleatoria(textOriginal);
                    if (conta) {
                        db.registrarJogoResgatado(sender, conta);
                        let msgResposta = `🎮 *${conta.jogo}*\n📂 ${conta.categoria}\n\n👤 *Login:* ${conta.login}\n🔒 *Senha:* ${conta.senha}\n\n⚠️ *IMPORTANTE:*\n• Use modo OFFLINE\n• NAO altere a senha\n• NAO compartilhe esta conta\n\nDigite *favoritar* para salvar\nDigite *menu* para voltar`;
                        userStates.set(sender, { step: 'pos_resgate', contaAtual: conta, veioDePagina: false });
                        await enviarResposta(sender, { text: msgResposta });
                    } else {
                        const similares = db.buscarContasSimilares(textOriginal, 3);
                        let msgErro = `❌ Jogo *"${textOriginal}"* nao encontrado.\n\n`;
                        if (similares.length > 0) {
                            msgErro += `🔍 Voce quis dizer:\n`;
                            similares.forEach((s, i) => { msgErro += `${i + 1}. ${s.jogo}\n`; });
                            msgErro += `\nTente um desses ou digite *4* para ver todos.`;
                        } else {
                            msgErro += `🔍 Tente digitar o nome exato ou digite *4* para ver a lista completa.`;
                        }
                        await enviarResposta(sender, { text: msgErro });
                    }
                }

                // ========== MENU ADMIN ==========
                else if (userState.step === 'admin_menu' && isAdmin) {
                    switch(text) {
                        case '1':
                            userStates.set(sender, { step: 'admin_add_nome', tempConta: {} });
                            await enviarResposta(sender, { text: '➕ *Adicionar Conta*\n\nDigite o nome do jogo:' });
                            break;
                        case '2':
                            userStates.set(sender, { step: 'admin_gerar_key' });
                            await enviarResposta(sender, { text: '🔑 *Gerar Key*\n\nEscolha o plano:\n\n1️⃣ 7 dias - R$ 10\n2️⃣ 1 mes - R$ 25\n3️⃣ Lifetime - R$ 80\n\nDigite o numero:' });
                            break;
                        case '3':
                            userStates.set(sender, { step: 'admin_gerar_teste' });
                            await enviarResposta(sender, { text: '🎁 *Gerar Key Teste*\n\nEscolha a duracao:\n\n1️⃣ 1 hora\n2️⃣ 2 horas\n3️⃣ 6 horas\n\nDigite o numero:' });
                            break;
                        case '4':
                            userStates.set(sender, { step: 'admin_importar_parser' });
                            await enviarResposta(sender, { text: '📄 *Importar arquivo TXT*\n\nEnvie o arquivo ou digite AUTO' });
                            break;
                        case '5':
                            userStates.set(sender, { step: 'admin_importar_multiplas' });
                            await enviarResposta(sender, { text: `📋 *IMPORTAR MULTIPLAS CONTAS*\n\nCole as contas no formato:\n\n*NUMERO JOGO LOGIN SENHA*\n\nExemplo:\`\`\`\n331 Assassins Creed Shadows usuario1 senha123\n332 Black Myth Wukong usuario2 senha456\n333 Farming Simulator usuario3 senha789\`\`\`\n\n⚡ O bot vai separar automaticamente!\n\nDigite as contas agora:` });
                            break;
                        case '6':
                            const stats = db.getEstatisticas();
                            let msgStats = `📊 *ESTATISTICAS GERAIS*\n\n`;
                            msgStats += `🎮 Total de jogos: ${stats.totalJogos}\n`;
                            msgStats += `✅ Disponiveis: ${stats.disponiveis}\n`;
                            msgStats += `🔑 Keys ativas: ${stats.keysAtivas}\n`;
                            msgStats += `🔑 Keys disponiveis: ${stats.keysDisponiveis}\n`;
                            msgStats += `👥 Total clientes: ${stats.totalClientes}\n`;
                            msgStats += `🟢 Clientes ativos: ${stats.clientesAtivos}\n`;
                            msgStats += `🔴 Clientes inativos: ${stats.clientesInativos}\n`;
                            msgStats += `⛔ Banidos: ${stats.banidos}\n`;
                            msgStats += `🔐 Master Key: ${stats.masterKeyUsada ? 'Usada' : 'Disponivel'}\n`;
                            msgStats += `📝 Total logs: ${stats.totalLogs}\n\n`;
                            msgStats += `Digite *7* para ver logs detalhados`;
                            await enviarResposta(sender, { text: msgStats });
                            break;
                        case '7':
                            const logs = db.getLogs({}, 20);
                            let msgLogs = `📜 *ULTIMOS LOGS*\n\n`;
                            if (logs.length === 0) msgLogs += `Nenhum log registrado ainda.`;
                            else {
                                logs.forEach((log, i) => {
                                    const data = new Date(log.data).toLocaleString('pt-BR');
                                    msgLogs += `${i + 1}. [${log.tipo}]\n   👤 ${log.numero}\n   🕐 ${data}\n\n`;
                                });
                            }
                            msgLogs += `\nDigite *logs TIPO* para filtrar\nExemplo: logs RESGATAR_JOGO`;
                            userStates.set(sender, { step: 'admin_ver_logs' });
                            await enviarResposta(sender, { text: msgLogs });
                            break;
                        case '8':
                            const { ativos, expirando } = db.getClientesPorStatus();
                            let msgAtivos = `🟢 *CLIENTES ATIVOS*\n\nTotal: ${ativos.length}\n\n`;
                            if (ativos.length === 0) msgAtivos += `Nenhum cliente ativo.`;
                            else {
                                ativos.slice(0, 15).forEach((c, i) => {
                                    msgAtivos += `${i + 1}. ${c.nome || 'Sem nome'}\n   📱 ${c.numero}\n   📦 ${c.plano}\n   📅 ${c.expira}\n\n`;
                                });
                                if (ativos.length > 15) msgAtivos += `...e mais ${ativos.length - 15}\n`;
                            }
                            if (expirando.length > 0) {
                                msgAtivos += `\n⚠️ *EXPIRANDO EM 24H:*\n`;
                                expirando.forEach(c => { msgAtivos += `• ${c.nome} (${c.horas}h restantes)\n`; });
                            }
                            await enviarResposta(sender, { text: msgAtivos });
                            break;
                        case '9':
                            const { inativos } = db.getClientesPorStatus();
                            let msgInativos = `🔴 *CLIENTES INATIVOS*\n\nTotal: ${inativos.length}\n\n`;
                            if (inativos.length === 0) msgInativos += `Nenhum cliente inativo.`;
                            else {
                                inativos.slice(0, 15).forEach((c, i) => {
                                    msgInativos += `${i + 1}. ${c.nome || 'Sem nome'}\n   📱 ${c.numero}\n   📦 ${c.plano}\n   📅 Expirou: ${c.expira}\n\n`;
                                });
                                if (inativos.length > 15) msgInativos += `...e mais ${inativos.length - 15}\n`;
                            }
                            await enviarResposta(sender, { text: msgInativos });
                            break;
                        case '10':
                            userStates.set(sender, { step: 'admin_banir' });
                            await enviarResposta(sender, { text: '⛔ *Banir Usuario*\n\nDigite o numero do usuario:\n(Exemplo: 5518999999999)' });
                            break;
                        case '11':
                            userStates.set(sender, { step: 'admin_desbanir' });
                            await enviarResposta(sender, { text: '✅ *Desbanir Usuario*\n\nDigite o numero do usuario:\n(Exemplo: 5518999999999)' });
                            break;
                        case '12':
                            userStates.set(sender, { step: 'admin_broadcast' });
                            await enviarResposta(sender, { text: '📢 *Broadcast*\n\nDigite a mensagem que sera enviada para *todos* os clientes:' });
                            break;
                        case '13':
                            userStates.set(sender, { step: 'admin_remover_lista', tempLista: db.getTodosJogosDisponiveis() });
                            const jogosRemover = db.getTodosJogosDisponiveis();
                            let msgRemover = '❌ *Remover Conta*\n\n';
                            jogosRemover.slice(0, 15).forEach((j, i) => { msgRemover += `${i + 1}. ${j.jogo}\n`; });
                            if (jogosRemover.length > 15) msgRemover += `...e mais ${jogosRemover.length - 15}\n`;
                            msgRemover += '\nDigite o *numero* ou *nome* do jogo:';
                            await enviarResposta(sender, { text: msgRemover });
                            break;
                        case '14':
                            await enviarResposta(sender, { text: `👥 *Entrar em Grupo*\n\n1️⃣ Adicione o numero *+${BOT_NUMBER}* no grupo\n2️⃣ De permissao de *ADMIN*\n3️⃣ Digite *!menu* no grupo\n\n⚠️ O bot so responde comandos que comecam com ! em grupos` });
                            break;
                        case '0':
                        case 'menu':
                            userStates.set(sender, { step: 'menu' });
                            await enviarResposta(sender, { text: getMenuPrincipal(pushName) });
                            break;
                        default:
                            await enviarResposta(sender, { text: getMenuAdmin() });
                    }
                }

                // ========== ADMIN: VER LOGS COM FILTRO ==========
                else if (userState.step === 'admin_ver_logs' && isAdmin) {
                    if (text.startsWith('logs ')) {
                        const tipo = text.replace('logs ', '').trim().toUpperCase();
                        const logsFiltrados = db.getLogs({ tipo }, 20);
                        let msgLogs = `📜 *LOGS: ${tipo}*\n\n`;
                        if (logsFiltrados.length === 0) msgLogs += `Nenhum log encontrado para este tipo.`;
                        else {
                            logsFiltrados.forEach((log, i) => {
                                const data = new Date(log.data).toLocaleString('pt-BR');
                                msgLogs += `${i + 1}. 👤 ${log.numero}\n   🕐 ${data}\n`;
                                if (log.detalhes) msgLogs += `   📝 ${JSON.stringify(log.detalhes).substring(0, 50)}\n`;
                                msgLogs += `\n`;
                            });
                        }
                        await enviarResposta(sender, { text: msgLogs });
                    } else {
                        userStates.set(sender, { step: 'admin_menu' });
                        await enviarResposta(sender, { text: getMenuAdmin() });
                    }
                }
                
                // ========== ADMIN: BANIR ==========
                else if (userState.step === 'admin_banir' && isAdmin) {
                    const numeroBanir = text.replace(/\D/g, '');
                    if (numeroBanir.length < 10) {
                        await enviarResposta(sender, { text: '❌ Numero invalido!' });
                        userStates.set(sender, { step: 'admin_menu' });
                        return;
                    }
                    userStates.set(sender, { step: 'admin_banir_confirmar', numeroBanir });
                    await enviarResposta(sender, { text: `⛔ *Confirmar banimento*\n\nNumero: ${numeroBanir}\n\nDigite o *motivo* do banimento ou *cancelar* para voltar:` });
                }
                else if (userState.step === 'admin_banir_confirmar' && isAdmin) {
                    if (text === 'cancelar') {
                        userStates.set(sender, { step: 'admin_menu' });
                        await enviarResposta(sender, { text: '✅ Cancelado.' });
                        return;
                    }
                    const numero = userState.numeroBanir;
                    const motivo = textOriginal;
                    db.banirUsuario(numero + '@s.whatsapp.net', motivo);
                    await sock.sendMessage(numero + '@s.whatsapp.net', { text: `⛔ *VOCE FOI BANIDO*\n\nMotivo: ${motivo}\n\nEntre em contato com o administrador se achar que houve um erro.` });
                    userStates.set(sender, { step: 'admin_menu' });
                    await enviarResposta(sender, { text: `⛔ *Usuario ${numero} banido!*\n\nMotivo: ${motivo}` });
                }
                
                // ========== ADMIN: DESBANIR ==========
                else if (userState.step === 'admin_desbanir' && isAdmin) {
                    const numeroDesbanir = text.replace(/\D/g, '');
                    if (numeroDesbanir.length < 10) {
                        await enviarResposta(sender, { text: '❌ Numero invalido!' });
                        userStates.set(sender, { step: 'admin_menu' });
                        return;
                    }
                    const resultado = db.desbanirUsuario(numeroDesbanir + '@s.whatsapp.net');
                    if (resultado) {
                        await sock.sendMessage(numeroDesbanir + '@s.whatsapp.net', { text: `✅ *VOCE FOI DESBANIDO!*\n\nPode usar o bot normalmente agora.\nDigite *menu* para comecar.` });
                        await enviarResposta(sender, { text: `✅ *Usuario ${numeroDesbanir} desbanido!*` });
                    } else {
                        await enviarResposta(sender, { text: `❌ *Usuario nao estava banido.*` });
                    }
                    userStates.set(sender, { step: 'admin_menu' });
                }
                
                // ========== ADMIN: BROADCAST ==========
                else if (userState.step === 'admin_broadcast' && isAdmin) {
                    const clientes = db.getTodosClientes();
                    let enviados = 0, falhas = 0;
                    await enviarResposta(sender, { text: `📢 Enviando para ${clientes.length} clientes...\n\nAguarde...` });
                    for (const cliente of clientes) {
                        try {
                            await esperarDelay();
                            await sock.sendMessage(cliente.numero, { text: `📢 *MENSAGEM DO ADMIN*\n\n${textOriginal}` });
                            enviados++;
                        } catch (e) { falhas++; }
                    }
                    userStates.set(sender, { step: 'admin_menu' });
                    await enviarResposta(sender, { text: `✅ *Broadcast concluido!*\n\n📤 Enviados: ${enviados}\n❌ Falhas: ${falhas}` });
                }
                
                // ========== ADMIN: GERAR KEY ==========
                else if (userState.step === 'admin_gerar_key' && isAdmin) {
                    let plano, dias, preco;
                    if (text === '1') { plano = '7dias'; dias = 7; preco = 'R$ 10'; }
                    else if (text === '2') { plano = '1mes'; dias = 30; preco = 'R$ 25'; }
                    else if (text === '3') { plano = 'lifetime'; dias = 36500; preco = 'R$ 80'; }
                    else {
                        await enviarResposta(sender, { text: '❌ Opcao invalida! Digite 1, 2 ou 3:' });
                        return;
                    }
                    const key = `NYUX-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
                    const resultado = db.gerarKey(key, plano, dias, sender);
                    if (resultado.sucesso) {
                        userStates.set(sender, { step: 'admin_menu' });
                        await enviarResposta(sender, { text: `✅ *KEY GERADA!*\n\n🔑 Key: *${key}*\n📦 Plano: ${plano}\n💰 Preco: ${preco}\n📅 Valida por: ${dias === 36500 ? 'Lifetime' : dias + ' dias'}` });
                    } else {
                        await enviarResposta(sender, { text: `❌ Erro: ${resultado.erro}` });
                    }
                }
                
                // ========== ADMIN: GERAR KEY TESTE ==========
                else if (userState.step === 'admin_gerar_teste' && isAdmin) {
                    let duracao, horas;
                    if (text === '1') { duracao = '1 hora'; horas = 1; }
                    else if (text === '2') { duracao = '2 horas'; horas = 2; }
                    else if (text === '3') { duracao = '6 horas'; horas = 6; }
                    else {
                        await enviarResposta(sender, { text: '❌ Opcao invalida! Digite 1, 2 ou 3:' });
                        return;
                    }
                    const keyTeste = `TESTE-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
                    const resultado = db.gerarKeyTesteAdmin(keyTeste, duracao, horas, sender);
                    if (resultado.sucesso) {
                        userStates.set(sender, { step: 'admin_menu' });
                        await enviarResposta(sender, { text: `🎁 *KEY TESTE GERADA!*\n\n🔑 Key: *${keyTeste}*\n⏱️ Duracao: ${duracao}\n📅 Expira em: ${resultado.expira}` });
                    } else {
                        await enviarResposta(sender, { text: `❌ Erro: ${resultado.erro}` });
                    }
                }
                
                // ========== ADMIN: ADICIONAR CONTA ==========
                else if (userState.step === 'admin_add_nome' && isAdmin) {
                    userStates.set(sender, { step: 'admin_add_login', tempConta: { jogo: textOriginal } });
                    await enviarResposta(sender, { text: `🎮 Jogo: *${textOriginal}*\n\nDigite o login:` });
                }
                else if (userState.step === 'admin_add_login' && isAdmin) {
                    userStates.set(sender, { step: 'admin_add_senha', tempConta: { ...userState.tempConta, login: textOriginal } });
                    await enviarResposta(sender, { text: `👤 Login: *${textOriginal}*\n\nDigite a senha:` });
                }
                else if (userState.step === 'admin_add_senha' && isAdmin) {
                    const conta = { ...userState.tempConta, senha: textOriginal, categoria: new ContasSteamParser().detectarCategoria(userState.tempConta.jogo) };
                    const resultado = db.adicionarConta(conta);
                    userStates.set(sender, { step: 'admin_menu' });
                    await enviarResposta(sender, { text: `✅ *CONTA ADICIONADA!*\n\n🎮 ${conta.jogo}\n👤 ${conta.login}\n🔒 ${conta.senha}\n📂 ${conta.categoria}` });
                }
                
                // ========== ADMIN: IMPORTAR MULTIPLAS CONTAS ==========
                else if (userState.step === 'admin_importar_multiplas' && isAdmin) {
                    const parser = new ContasSteamParser();
                    const resultado = parser.processarMultiplasContas(textOriginal);
                    let adicionadasCount = 0;
                    for (const conta of resultado.adicionadas) {
                        const r = db.adicionarConta(conta);
                        if (r.sucesso) adicionadasCount++;
                    }
                    userStates.set(sender, { step: 'admin_menu' });
                    let msgResultado = `📋 *IMPORTACAO CONCLUIDA*\n\n✅ Adicionadas: ${adicionadasCount}\n❌ Removidas (problemas): ${resultado.removidas.length}\n⚠️ Erros: ${resultado.erros.length}\n\n`;
                    if (resultado.removidas.length > 0) {
                        msgResultado += `*Removidas:*\n`;
                        resultado.removidas.slice(0, 5).forEach(r => { msgResultado += `• ${r.jogo} - ${r.motivo}\n`; });
                    }
                    await enviarResposta(sender, { text: msgResultado });
                }
                
                // ========== ADMIN: REMOVER CONTA ==========
                else if (userState.step === 'admin_remover_lista' && isAdmin) {
                    const jogos = userState.tempLista;
                    const escolha = parseInt(text);
                    let contaRemover = null;
                    if (!isNaN(escolha) && escolha >= 1 && escolha <= jogos.length) contaRemover = jogos[escolha - 1];
                    else contaRemover = jogos.find(c => c.jogo.toLowerCase() === text.toLowerCase());
                    
                    if (contaRemover) {
                        db.removerConta(contaRemover.id);
                        userStates.set(sender, { step: 'admin_menu' });
                        await enviarResposta(sender, { text: `✅ *Conta removida!*\n\n🎮 ${contaRemover.jogo}` });
                    } else {
                        await enviarResposta(sender, { text: '❌ Conta nao encontrada! Digite o numero ou nome exato.' });
                    }
                }
                
                // ========== ADMIN: IMPORTAR ARQUIVO ==========
                else if (userState.step === 'admin_importar_parser' && isAdmin) {
                    if (text.toLowerCase() === 'auto') {
                        if (fs.existsSync('contas.txt')) {
                            const conteudo = fs.readFileSync('contas.txt', 'utf8');
                            const parser = new ContasSteamParser();
                            const resultado = parser.processarMultiplasContas(conteudo);
                            let adicionadasCount = 0;
                            for (const conta of resultado.adicionadas) {
                                const r = db.adicionarConta(conta);
                                if (r.sucesso) adicionadasCount++;
                            }
                            userStates.set(sender, { step: 'admin_menu' });
                            await enviarResposta(sender, { text: `📄 *IMPORTACAO AUTO*\n\n✅ Adicionadas: ${adicionadasCount}\n❌ Removidas: ${resultado.removidas.length}\n⚠️ Erros: ${resultado.erros.length}` });
                        } else {
                            await enviarResposta(sender, { text: '❌ Arquivo contas.txt nao encontrado!' });
                        }
                    } else {
                        await enviarResposta(sender, { text: 'Envie o arquivo .txt ou digite AUTO para procurar contas.txt' });
                    }
                }
                
                // ========== DOCUMENTO RECEBIDO ==========
                if (msg.message.documentMessage && isAdmin && userState.step === 'admin_importar_parser') {
                    try {
                        const buffer = await sock.downloadMediaMessage(msg);
                        const conteudo = buffer.toString('utf8');
                        const parser = new ContasSteamParser();
                        const resultado = parser.processarMultiplasContas(conteudo);
                        let adicionadasCount = 0;
                        for (const conta of resultado.adicionadas) {
                            const r = db.adicionarConta(conta);
                            if (r.sucesso) adicionadasCount++;
                        }
                        userStates.set(sender, { step: 'admin_menu' });
                        await enviarResposta(sender, { text: `📄 *ARQUIVO IMPORTADO!*\n\n✅ Adicionadas: ${adicionadasCount}\n❌ Removidas: ${resultado.removidas.length}\n⚠️ Erros: ${resultado.erros.length}` });
                    } catch (e) {
                        await enviarResposta(sender, { text: '❌ Erro ao processar arquivo!' });
                    }
                }
                
            } catch (error) {
                console.error('❌ Erro:', error);
                try {
                    await esperarDelay();
                    await sock.sendMessage(sender, { text: '❌ *Ocorreu um erro!*\n\nTente novamente ou digite *menu*.' });
                } catch (e) {}
            }
        });
        
    } catch (err) {
        console.error('❌ Erro na conexao:', err);
        reconectando = false;
        console.log(`\n⏳ Reconectando em ${delayMs/1000}s...\n`);
        setTimeout(connectToWhatsApp, delayMs);
    }
}

// ==========================================
// INICIALIZACAO
// ==========================================
console.log('╔════════════════════════════════════════╗');
console.log('║         🎮 NYUX STORE BOT              ║');
console.log('║         Delay Humano: 5-15s            ║');
console.log('╚════════════════════════════════════════╝\n');

connectToWhatsApp();
