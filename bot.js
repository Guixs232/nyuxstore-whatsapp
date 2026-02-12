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
// DELAY HUMANO - Anti-deteccao (5-15 segundos)
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
        const resultados = {
            adicionadas: [],
            removidas: [],
            erros: []
        };
        for (const linha of linhas) {
            const conta = this.parseLinhaSimples(linha.trim());
            if (conta) {
                const verificacao = this.verificarContaProblematica(conta);
                if (verificacao.problema) {
                    resultados.removidas.push({
                        numero: conta.numero,
                        jogo: conta.jogo,
                        motivo: verificacao.motivo
                    });
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
                return {
                    numero: partes[0],
                    jogo: partes[1],
                    login: partes[2],
                    senha: partes[3],
                    categoria: this.detectarCategoria(partes[1])
                };
            }
        }
        if (linha.includes(' - ')) {
            const partes = linha.split(' - ').map(p => p.trim());
            if (partes.length >= 4) {
                return {
                    numero: partes[0],
                    jogo: partes[1],
                    login: partes[2],
                    senha: partes[3],
                    categoria: this.detectarCategoria(partes[1])
                };
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
                    return {
                        numero: numero,
                        jogo: jogo,
                        login: login,
                        senha: senha,
                        categoria: this.detectarCategoria(jogo)
                    };
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

    extrairContas(conteudo) {
        const linhas = conteudo.split('\n');
        let contaAtual = null;
        let bufferLinhas = [];
        for (let i = 0; i < linhas.length; i++) {
            const linha = this.limparTexto(linhas[i]);
            if (linha.match(/^CONTA\s\*\d+/i)) {
                if (contaAtual) this.processarConta(contaAtual, bufferLinhas);
                const matchNumero = linha.match(/CONTA\s\*(\d+)/i);
                contaAtual = {
                    id: matchNumero ? parseInt(matchNumero[1]) : null,
                    jogo: '',
                    categoria: '',
                    login: '',
                    senha: '',
                    plataforma: 'Steam',
                    observacoes: [],
                    videoTutorial: null,
                    pinCode: null,
                    denuvo: false,
                    modoOffline: true
                };
                bufferLinhas = [];
                continue;
            }
            if (!contaAtual) continue;
            bufferLinhas.push(linha);
        }
        if (contaAtual) this.processarConta(contaAtual, bufferLinhas);
        return this.contas;
    }

    processarConta(conta, linhas) {
        for (const linha of linhas) {
            if (linha.match(/https?:\/\//)) {
                conta.videoTutorial = linha.match(/https?:\/\/[^\s]+/)?.[0];
            }
            else if (linha.match(/^Steam:/i)) conta.plataforma = 'Steam';
            else if (linha.match(/^Ubisoft:/i)) conta.plataforma = 'Ubisoft';
            else if (linha.match(/^Rockstar:/i)) conta.plataforma = 'Rockstar';
            else if (linha.match(/^(User|Usuario|Account|ACC|ID):\s\*/i)) {
                conta.login = linha.replace(/^(User|Usuario|Account|ACC|ID):\s\*/i, '').trim();
            }
            else if (linha.match(/^(Seguranca|Senha|Password|Segurancaword|PW):\s\*/i)) {
                conta.senha = linha.replace(/^(Seguranca|Senha|Password|Segurancaword|PW):\s\*/i, '').trim();
            }
            else if (linha.match(/^(Jogo|Game|Games):\s\*/i)) {
                conta.jogo = linha.replace(/^(Jogo|Game|Games):\s\*/i, '').trim();
            }
        }
        if (!conta.jogo && conta.id) {
            conta.jogo = 'Conta Steam ' + conta.id;
        }
        conta.categoria = this.detectarCategoria(conta.jogo);
        if (conta.login && conta.senha && conta.login.length > 2 && conta.senha.length > 2) {
            this.contas.push(conta);
        }
    }

    limparTexto(texto) {
        return texto
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .replace(/\t/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    gerarResumo() {
        return {
            total: this.contas.length + this.contasRemovidas.length,
            aprovadas: this.contas.length,
            removidas: this.contasRemovidas.length,
            porCategoria: this.contas.reduce((acc, c) => {
                acc[c.categoria] = (acc[c.categoria] || 0) + 1;
                return acc;
            }, {})
        };
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

setInterval(() => {
    mensagensProcessadas.clear();
    console.log('🧹 Cache limpo');
}, TEMPO_LIMPEZA_MS);

// ==========================================
// SERVIDOR WEB
// ==========================================
const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const url = req.url;
    if (url === '/api/status') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
            conectado: botConectado,
            temQR: !!qrCodeDataURL,
            timestamp: new Date().toISOString()
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
        res.end(`
<!DOCTYPE html>
<html>
<head>
<title>${STORE_NAME} - Bot WhatsApp</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="3">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
font-family: 'Segoe UI', Arial, sans-serif;
text-align: center;
padding: 40px 20px;
background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
color: white;
min-height: 100vh;
}
h1 {
color: #00d9ff;
font-size: 2.5rem;
margin-bottom: 10px;
text-shadow: 0 0 20px rgba(0,217,255,0.3);
}
.status {
padding: 25px;
border-radius: 20px;
margin: 30px auto;
font-size: 1.3rem;
max-width: 500px;
box-shadow: 0 10px 30px rgba(0,0,0,0.3);
}
.online {
background: linear-gradient(135deg, #4CAF50, #45a049);
}
.offline {
background: linear-gradient(135deg, #f44336, #da190b);
}
.waiting {
background: linear-gradient(135deg, #ff9800, #f57c00);
animation: pulse 2s infinite;
}
@keyframes pulse {
0%, 100% { transform: scale(1); }
50% { transform: scale(1.02); }
}
.qr-container {
background: white;
padding: 30px;
border-radius: 25px;
margin: 30px auto;
max-width: 400px;
box-shadow: 0 20px 60px rgba(0,0,0,0.5);
}
.qr-container img {
width: 100%;
max-width: 350px;
border-radius: 10px;
}
.btn {
background: linear-gradient(135deg, #00d9ff, #0099cc);
color: #1a1a2e;
padding: 18px 40px;
text-decoration: none;
border-radius: 30px;
font-weight: bold;
font-size: 1.1rem;
display: inline-block;
margin: 15px;
box-shadow: 0 5px 20px rgba(0,217,255,0.4);
transition: transform 0.3s;
}
.btn:hover { transform: translateY(-3px); }
.info {
background: rgba(255,255,255,0.1);
backdrop-filter: blur(10px);
padding: 25px;
border-radius: 20px;
margin: 30px auto;
max-width: 500px;
border: 1px solid rgba(255,255,255,0.1);
}
.info p { margin: 10px 0; font-size: 1.1rem; }
.tentativa { color: #aaa; margin-top: 20px; }
</style>
</head>
<body>
<h1>🎮 ${STORE_NAME}</h1>
${botConectado ? `
<div class="status online">
<h2>✅ Bot Conectado!</h2>
<p>Sistema operacional</p>
</div>
<div class="info">
<p>🤖 Bot: +${BOT_NUMBER}</p>
<p>👑 Admin: +${ADMIN_NUMBER}</p>
</div>
` : (qrCodeDataURL ? `
<div class="status waiting">
<h2>📱 Escaneie o QR Code</h2>
</div>
<div class="qr-container">
<img src="${qrCodeDataURL}" alt="QR Code WhatsApp">
</div>
<a href="/qr.png" class="btn" download>💾 Baixar QR Code</a>
<div class="info">
<h3>📖 Como conectar:</h3>
<p>1. Abra WhatsApp no celular</p>
<p>2. Toque em ⋮ → <strong>WhatsApp Web</strong></p>
<p>3. Toque em <strong>Conectar dispositivo</strong></p>
<p>4. Aponte a camera para o QR Code acima</p>
</div>
` : `
<div class="status offline">
<h2>⏳ Iniciando conexao...</h2>
</div>
<p class="tentativa">Tentativa: ${tentativasConexao}</p>
<div class="info">
<p>Aguarde o QR Code aparecer...</p>
<p>Isso pode levar alguns segundos</p>
</div>
`)}
</body>
</html>
`);
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
// FUNCOES AUXILIARES COM DELAY HUMANO
// ==========================================
async function salvarQRCode(qr) {
    try {
        console.log('💾 Processando QR Code...');
        qrCodeRaw = qr;
        const QRCode = require('qrcode');
        qrCodeDataURL = await QRCode.toDataURL(qr, {
            width: 500,
            margin: 2,
            color: { dark: '#000000', light: '#FFFFFF' }
        });
        qrCodeFilePath = path.join(__dirname, 'qrcode.png');
        await QRCode.toFile(qrCodeFilePath, qr, {
            width: 500,
            margin: 2
        });
        fs.writeFileSync('qrcode.txt', qr);
        console.log('✅ QR Code salvo');
        console.log('\n╔════════════════════════════════════════╗');
        console.log('║ 📱 QR CODE PRONTO                      ║');
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
        const {
            default: makeWASocket,
            DisconnectReason,
            useMultiFileAuthState,
            fetchLatestBaileysVersion,
            delay
        } = await import('@whiskeysockets/baileys');
        const { version } = await fetchLatestBaileysVersion();
        console.log(`📱 Versao WhatsApp Web: ${version.join('.')}`);
        if (tentativasConexao > 3) {
            console.log('🧹 Limpando credenciais antigas...');
            try {
                fs.rmSync('auth_info_baileys', { recursive: true, force: true });
                tentativasConexao = 0;
            } catch (e) {}
        }
        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
        console.log('🔌 Criando conexao...\n');
        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            auth: state,
            browser: ['Chrome', 'Windows', '10.0.19042'],
            markOnlineOnConnect: true,
            syncFullHistory: false,
            shouldIgnoreJid: jid => jid?.includes('newsletter') || jid?.includes('broadcast'),
            connectTimeoutMs: 120000,
            defaultQuer
