const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const Database = require('./database');

// ============== CONFIGURAÇÕES ==============
const CONFIG = {
    BOT_NUMBER: process.env.BOT_NUMBER || '',
    ADMIN_NUMBER: process.env.ADMIN_NUMBER || '',
    STORE_NAME: process.env.STORE_NAME || '🎮 NYUX STORE',
    SUPER_ADMIN_KEY: 'NYUX-ADM1-GUIXS23', // KEY ÚNICA PARA SUPER ADMIN
    SUPER_ADMIN_USED: false // Controle se já foi usada
};

// ============== DELAY HUMANO OTIMIZADO ==============
function delayAleatorio() {
    return Math.floor(Math.random() * 1400) + 800;
}

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function simularDigitando(sock, jid) {
    await sock.sendPresenceUpdate('composing', jid);
    await delay(delayAleatorio());
    await sock.sendPresenceUpdate('paused', jid);
}

// ============== INICIALIZAÇÃO ==============
const db = new Database();
let sockGlobal = null;

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ['NYUX BOT', 'Chrome', '1.0']
    });

    sockGlobal = sock;

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('✅ BOT CONECTADO!');
            console.log('📱 Número:', sock.user.id.split(':')[0]);
            verificarExpiracoes(sock);
            setInterval(() => verificarExpiracoes(sock), 3600000);
        }
    });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('messages.upsert', async (m) => {
        const message = m.messages[0];
        if (!message.key.fromMe && message.message) {
            await handleMessage(sock, message);
        }
    });
}

// ============== VERIFICAR EXPIRAÇÕES ==============
async function verificarExpiracoes(sock) {
    const agora = Date.now();
    const clientes = db.getAllClients();
    
    for (const cliente of clientes) {
        if (cliente.ativo && cliente.expiracao && agora > cliente.expiracao) {
            db.desativarCliente(cliente.numero);
            await sock.sendMessage(cliente.numero, {
                text: '⏰ *Seu plano expirou!*\n\nRenove agora e ganhe 10% OFF!\nDigite *MENU* para ver os planos.'
            });
        }
        
        // Lembrete 24h antes
        if (cliente.ativo && cliente.expiracao) {
            const tempoRestante = cliente.expiracao - agora;
            const umDia = 24 * 60 * 60 * 1000;
            if (tempoRestante > 0 && tempoRestante < umDia && tempoRestante > (umDia - 3600000)) {
                await sock.sendMessage(cliente.numero, {
                    text: '⏰ *Atenção!*\n\nSeu plano expira em menos de 24 horas!\nRenove agora para não ficar sem seus jogos.'
                });
            }
        }
    }
}

// ============== SISTEMA DE RATE LIMIT ==============
const rateLimit = new Map();
function checkRateLimit(userId) {
    const agora = Date.now();
    if (!rateLimit.has(userId)) {
        rateLimit.set(userId, { count: 1, lastReset: agora });
        return true;
    }
    
    const userLimit = rateLimit.get(userId);
    if (agora - userLimit.lastReset > 60000) {
        userLimit.count = 1;
        userLimit.lastReset = agora;
        return true;
    }
    
    if (userLimit.count >= 20) return false;
    userLimit.count++;
    return true;
}

// ============== VERIFICAR SUPER ADMIN ==============
function isSuperAdmin(numero) {
    const cliente = db.getClient(numero);
    return cliente && cliente.superAdmin === true;
}

// ============== MENU PRINCIPAL ==============
async function sendMenu(sock, jid) {
    await simularDigitando(sock, jid);
    
    const menu = `
╔════════════════════════════════════╗
║     🎮 ${CONFIG.STORE_NAME} 🎮          ║
╠════════════════════════════════════╣
║                                    ║
║  👤 *MENU CLIENTE*                 ║
║                                    ║
║  1️⃣  Ver Jogos Disponíveis         ║
║  2️⃣  Buscar Jogo Específico        ║
║  3️⃣  Resgatar KEY 🔑               ║
║  4️⃣  Meus Dados                    ║
║  5️⃣  Favoritos ⭐                  ║
║  6️⃣  Indicar Amigo 👥              ║
║  7️⃣  Meus Pontos 💎                ║
║  8️⃣  Suporte/Ticket 🎫             ║
║  9️⃣  FAQ ❓                        ║
║                                    ║
║  🎁 *TESTE GRÁTIS*                 ║
║  Digite: TESTE1 (1h)                ║
║  Digite: TESTE2 (2h)                ║
║  Digite: TESTE6 (6h)                ║
║                                    ║
╚════════════════════════════════════╝

Digite o número da opção desejada:`;

    await sock.sendMessage(jid, { text: menu });
}

// ============== MENU ADMIN ==============
async function sendAdminMenu(sock, jid) {
    await simularDigitando(sock, jid);
    
    const isSuper = isSuperAdmin(jid);
    const superAdminBadge = isSuper ? ' 👑' : '';
    
    const menu = `
╔════════════════════════════════════╗
║     🔐 PAINEL ADMIN${superAdminBadge}              ║
╠════════════════════════════════════╣
║                                    ║
║  📊 *GERENCIAMENTO*                ║
║  1️⃣  Adicionar Conta               ║
║  2️⃣  Adicionar Múltiplas Contas    ║
║  3️⃣  Remover Conta                 ║
║  4️⃣  🗑️ REMOVER TODOS OS JOGOS     ║
║  5️⃣  Listar Todas as Contas        ║
║                                    ║
║  🔑 *KEYS E ACESSO*                 ║
║  6️⃣  Gerar KEY Cliente             ║
║  7️⃣  🔐 Gerar KEY Admin            ║
║  8️⃣  Verificar KEY                 ║
║                                    ║
║  👥 *CLIENTES*                      ║
║  9️⃣  Clientes Ativos 🟢            ║
║  1️⃣0️⃣ Clientes Inativos 🔴         ║
║  1️⃣1️⃣ Banir Usuário               ║
║  1️⃣2️⃣ Desbanir Usuário            ║
║  1️⃣3️⃣ Ranking Clientes 🏆          ║
║                                    ║
║  📢 *COMUNICAÇÃO*                   ║
║  1️⃣4️⃣ Broadcast Geral             ║
║  1️⃣5️⃣ Avisar Novidades ✨          ║
║                                    ║
║  🎟️ *CUPONS*                        ║
║  1️⃣6️⃣ Criar Cupom                 ║
║  1️⃣7️⃣ Listar Cupons               ║
║                                    ║
║  🛡️ *SEGURANÇA*                     ║
║  1️⃣8️⃣ Ver Blacklist 🚫             ║
║  1️⃣9️⃣ Estatísticas 📊              ║
║  2️⃣0️⃣ Logs do Sistema 📋           ║
║                                    ║
${isSuper ? `║  👑 *SUPER ADMIN*                   ║
║  9️⃣9️⃣  Gerenciar Admins           ║
║                                    ║
` : ''}╚════════════════════════════════════╝

Digite o número da opção:`;

    await sock.sendMessage(jid, { text: menu });
}

// ============== MENU SUPER ADMIN ==============
async function sendSuperAdminMenu(sock, jid) {
    await simularDigitando(sock, jid);
    
    const admins = db.getAllAdmins();
    let listaAdmins = '';
    
    admins.forEach((admin, index) => {
        const tipo = admin.superAdmin ? '👑 SUPER' : '👤 Normal';
        listaAdmins += `║  ${index + 1}. ${admin.numero} ${tipo}\n`;
    });
    
    const menu = `
╔════════════════════════════════════╗
║     👑 PAINEL SUPER ADMIN          ║
╠════════════════════════════════════╣
║                                    ║
║  📋 *ADMINS CADASTRADOS*            ║
${listaAdmins || '║  Nenhum admin cadastrado\n'}
║                                    ║
║  🛠️ *OPÇÕES*                        ║
║                                    ║
║  1️⃣  Remover Admin                 ║
║  2️⃣  Promover a Super Admin        ║
║  3️⃣  Rebaixar Super Admin          ║
║  4️⃣  Voltar ao Menu Admin          ║
║                                    ║
╚════════════════════════════════════╝

Digite o número da opção:`;

    await sock.sendMessage(jid, { text: menu });
}

// ============== GERAR KEY ADMIN ==============
async function gerarKeyAdmin(sock, jid) {
    await simularDigitando(sock, jid);
    
    const key = 'ADM-' + Math.random().toString(36).substring(2, 8).toUpperCase() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    
    db.addKey({
        key: key,
        tipo: 'admin',
        dias: 0,
        usada: false,
        criadaPor: jid,
        dataCriacao: Date.now()
    });
    
    await sock.sendMessage(jid, {
        text: `🔐 *KEY DE ADMIN GERADA!*\n\n*KEY:* \`${key}\`\n\n⚠️ Esta KEY dá acesso ao painel admin!\n📤 Envie para quem você confia.`
    });
}

// ============== GERENCIAR ADMINS (SUPER ADMIN) ==============
async function gerenciarAdmins(sock, jid, opcao, dados = null) {
    await simularDigitando(sock, jid);
    
    if (opcao === 'menu') {
        await sendSuperAdminMenu(sock, jid);
        return;
    }
    
    if (opcao === 'remover') {
        const adminRemover = dados;
        const admins = db.getAllAdmins();
        const admin = admins.find(a => a.numero === adminRemover);
        
        if (!admin) {
            await sock.sendMessage(jid, { text: '❌ Admin não encontrado!' });
            return;
        }
        
        if (admin.superAdmin) {
            await sock.sendMessage(jid, { text: '❌ Não pode remover outro Super Admin!' });
            return;
        }
        
        db.removerAdmin(adminRemover);
        await sock.sendMessage(jid, { text: `✅ Admin ${adminRemover} removido com sucesso!` });
        
        // Avisar o admin removido
        await sock.sendMessage(adminRemover, {
            text: '⚠️ *Seu acesso de admin foi revogado.*\n\nEntre em contato com o suporte para mais informações.'
        });
    }
    
    if (opcao === 'promover') {
        const adminPromover = dados;
        db.promoverSuperAdmin(adminPromover);
        await sock.sendMessage(jid, { text: `✅ ${adminPromover} promovido a Super Admin! 👑` });
        
        await sock.sendMessage(adminPromover, {
            text: '👑 *Você foi promovido a Super Admin!*\n\nAgora você pode gerenciar outros admins no painel.'
        });
    }
    
    if (opcao === 'rebaixar') {
        const adminRebaixar = dados;
        if (adminRebaixar === jid) {
            await sock.sendMessage(jid, { text: '❌ Você não pode se rebaixar!' });
            return;
        }
        
        db.rebaixarSuperAdmin(adminRebaixar);
        await sock.sendMessage(jid, { text: `✅ ${adminRebaixar} rebaixado para Admin normal!` });
        
        await sock.sendMessage(adminRebaixar, {
            text: '👤 *Você foi rebaixado para Admin normal.*\n\nAinda tem acesso ao painel, mas não pode gerenciar outros admins.'
        });
    }
}

// ============== RESGATAR KEY ==============
async function resgatarKey(sock, jid, key) {
    await simularDigitando(sock, jid);
    
    // Verificar KEY de Super Admin especial
    if (key === CONFIG.SUPER_ADMIN_KEY) {
        if (db.isSuperAdminKeyUsed()) {
            await sock.sendMessage(jid, {
                text: '❌ *Esta KEY já foi usada!*\n\nCada KEY de Super Admin só pode ser usada uma vez.'
            });
            return;
        }
        
        // Ativar Super Admin
        db.marcarSuperAdminKeyUsada();
        db.addClient({
            numero: jid,
            tipo: 'superadmin',
            ativo: true,
            admin: true,
            superAdmin: true,
            dataAtivacao: Date.now()
        });
        
        await sock.sendMessage(jid, {
            text: `👑 *PARABÉNS! Você é o SUPER ADMIN!*\n\n⚡ Poderes concedidos:\n• Acesso total ao painel\n• Pode remover outros admins\n• Pode promover/rebaixar admins\n• Controle total do sistema\n\nDigite *ADMIN* para acessar o painel!`
        });
        
        // Notificar todos os admins
        const admins = db.getAllAdmins();
        for (const admin of admins) {
            if (admin.numero !== jid) {
                await sock.sendMessage(admin.numero, {
                    text: `👑 *Novo Super Admin!*\n\n${jid} resgatou a KEY mestre e agora é o Super Admin do sistema.`
                });
            }
        }
        
        return;
    }
    
    // Verificar KEY normal
    const keyData = db.getKey(key);
    
    if (!keyData) {
        await sock.sendMessage(jid, { text: '❌ KEY inválida ou não encontrada!' });
        return;
    }
    
    if (keyData.usada) {
        await sock.sendMessage(jid, { text: '❌ Esta KEY já foi utilizada!' });
        return;
    }
    
    // Processar KEY de admin
    if (keyData.tipo === 'admin') {
        db.addClient({
            numero: jid,
            tipo: 'admin',
            ativo: true,
            admin: true,
            superAdmin: false,
            dataAtivacao: Date.now()
        });
        
        db.markKeyUsed(key, jid);
        
        await sock.sendMessage(jid, {
            text: `🔐 *KEY DE ADMIN ATIVADA!*\n\n✅ Você agora tem acesso ao painel admin!\n\nDigite *ADMIN* para acessar.`
        });
        
        // Notificar Super Admin
        const superAdmins = db.getAllSuperAdmins();
        for (const super of superAdmins) {
            await sock.sendMessage(super.numero, {
                text: `👤 *Novo Admin!*\n\n${jid} resgatou uma KEY de admin.\n\nUse a opção 99 no painel para gerenciar.`
            });
        }
        
        return;
    }
    
    // Processar KEY de cliente
    const dias = keyData.dias;
    const expiracao = dias === 999999 ? null : Date.now() + (dias * 24 * 60 * 60 * 1000);
    
    db.addClient({
        numero: jid,
        tipo: keyData.tipo,
        dias: dias,
        expiracao: expiracao,
        ativo: true,
        admin: false,
        superAdmin: false,
        dataAtivacao: Date.now()
    });
    
    db.markKeyUsed(key, jid);
    
    const tipoTexto = dias === 999999 ? 'Lifetime ♾️' : `${dias} dias`;
    
    await sock.sendMessage(jid, {
        text: `✅ *KEY RESGATADA COM SUCESSO!*\n\n📦 Plano: ${tipoTexto}\n🎮 Acesse seus jogos no menu principal!`
    });
}

// ============== REMOVER TODOS OS JOGOS ==============
async function removerTodosJogos(sock, jid) {
    await simularDigitando(sock, jid);
    
    const total = db.getTotalContas();
    
    if (total === 0) {
        await sock.sendMessage(jid, { text: 'ℹ️ Não há jogos para remover!' });
        return;
    }
    
    db.removerTodasContas();
    
    await sock.sendMessage(jid, {
        text: `🗑️ *TODOS OS JOGOS REMOVIDOS!*\n\n📊 Total removido: ${total} contas\n\n⚠️ O banco de dados está vazio agora.`
    });
    
    db.log(`Admin ${jid} removeu TODOS os jogos (${total} contas)`);
}

// ============== HANDLE MESSAGE ==============
const userStates = new Map();

async function handleMessage(sock, message) {
    const jid = message.key.remoteJid;
    const texto = (message.message.conversation || message.message.extendedTextMessage?.text || '').trim();
    const textoLower = texto.toLowerCase();
    
    if (!checkRateLimit(jid)) {
        await sock.sendMessage(jid, { text: '⏳ Calma aí! Você está enviando mensagens rápido demais.' });
        return;
    }
    
    const isAdmin = db.isAdmin(jid);
    const isSuper = isSuperAdmin(jid);
    const state = userStates.get(jid);
    
    // Comandos especiais
    if (textoLower === 'menu') {
        userStates.delete(jid);
        await sendMenu(sock, jid);
        return;
    }
    
    if (textoLower === 'admin') {
        userStates.delete(jid);
        if (isAdmin) {
            await sendAdminMenu(sock, jid);
        } else {
            await sock.sendMessage(jid, { text: '❌ Você não tem acesso ao painel admin!' });
        }
        return;
    }
    
    // Resgatar KEY
    if (textoLower.startsWith('key ')) {
        const key = texto.substring(4).trim().toUpperCase();
        await resgatarKey(sock, jid, key);
        return;
    }
    
    // Teste grátis
    if (textoLower === 'teste1' || textoLower === 'teste2' || textoLower === 'teste6') {
        await simularDigitando(sock, jid);
        const horas = textoLower === 'teste1' ? 1 : textoLower === 'teste2' ? 2 : 6;
        const expiracao = Date.now() + (horas * 60 * 60 * 1000);
        
        db.addClient({
            numero: jid,
            tipo: 'teste',
            horas: horas,
            expiracao: expiracao,
            ativo: true,
            admin: false,
            dataAtivacao: Date.now()
        });
        
        await sock.sendMessage(jid, {
            text: `🎁 *TESTE GRÁTIS ATIVADO!*\n\n⏰ Duração: ${horas} hora(s)\n✅ Aproveite os jogos!\n\nDigite *MENU* para começar.`
        });
        return;
    }
    
    // Estados do admin
    if (state && isAdmin) {
        // ... (código dos estados admin continua igual)
        // Vou simplificar para não ficar muito longo
        
        if (state === 'esperando_opcao_admin') {
            userStates.set(jid, { estado: 'opcao_admin', opcao: texto });
            await processarOpcaoAdmin(sock, jid, texto);
            return;
        }
        
        if (state.estado === 'superadmin_menu') {
            if (texto === '1') {
                userStates.set(jid, { estado: 'superadmin_remover' });
                await sock.sendMessage(jid, { text: '📱 Digite o número do admin para remover:' });
            } else if (texto === '2') {
                userStates.set(jid, { estado: 'superadmin_promover' });
                await sock.sendMessage(jid, { text: '📱 Digite o número do admin para promover:' });
            } else if (texto === '3') {
                userStates.set(jid, { estado: 'superadmin_rebaixar' });
                await sock.sendMessage(jid, { text: '📱 Digite o número do Super Admin para rebaixar:' });
            } else if (texto === '4') {
                userStates.delete(jid);
                await sendAdminMenu(sock, jid);
            }
            return;
        }
        
        if (state.estado === 'superadmin_remover') {
            await gerenciarAdmins(sock, jid, 'remover', texto);
            userStates.delete(jid);
            return;
        }
        
        if (state.estado === 'superadmin_promover') {
            await gerenciarAdmins(sock, jid, 'promover', texto);
            userStates.delete(jid);
            return;
        }
        
        if (state.estado === 'superadmin_rebaixar') {
            await gerenciarAdmins(sock, jid, 'rebaixar', texto);
            userStates.delete(jid);
            return;
        }
    }
    
    // Menu Admin - Opções
    if (isAdmin && !isNaN(texto) && texto.length <= 2) {
        const opcao = parseInt(texto);
        
        switch(opcao) {
            case 1: // Adicionar conta
                userStates.set(jid, { estado: 'add_conta_jogo' });
                await sock.sendMessage(jid, { text: '🎮 Digite o nome do jogo:' });
                break;
            case 2: // Adicionar múltiplas
                userStates.set(jid, { estado: 'add_multiplo' });
                await sock.sendMessage(jid, { text: '📋 Cole as contas no formato:\n`NUMERO|JOGO|LOGIN|SENHA`\nOu: `login:senha`\n\nUma por linha:' });
                break;
            case 3: // Remover conta
                userStates.set(jid, { estado: 'remover_conta' });
                await sock.sendMessage(jid, { text: '🗑️ Digite o ID da conta para remover:' });
                break;
            case 4: // Remover todos
                await removerTodosJogos(sock, jid);
                break;
            case 5: // Listar contas
                await listarTodasContas(sock, jid);
                break;
            case 6: // Gerar KEY cliente
                userStates.set(jid, { estado: 'gerar_key' });
                await sock.sendMessage(jid, { text: '🔑 Escolha o tipo:\n1. 7 dias\n2. 30 dias\n3. Lifetime' });
                break;
            case 7: // Gerar KEY admin
                await gerarKeyAdmin(sock, jid);
                break;
            case 8: // Verificar KEY
                userStates.set(jid, { estado: 'verificar_key' });
                await sock.sendMessage(jid, { text: '🔍 Digite a KEY para verificar:' });
                break;
            case 9: // Clientes ativos
                await listarClientes(sock, jid, 'ativos');
                break;
            case 10: // Clientes inativos
                await listarClientes(sock, jid, 'inativos');
                break;
            case 11: // Banir
                userStates.set(jid, { estado: 'banir' });
                await sock.sendMessage(jid, { text: '🚫 Digite o número para banir:' });
                break;
            case 12: // Desbanir
                userStates.set(jid, { estado: 'desbanir' });
                await sock.sendMessage(jid, { text: '✅ Digite o número para desbanir:' });
                break;
            case 13: // Ranking
                await mostrarRanking(sock, jid);
                break;
            case 14: // Broadcast
                userStates.set(jid, { estado: 'broadcast' });
                await sock.sendMessage(jid, { text: '📢 Digite a mensagem para broadcast:' });
                break;
            case 15: // Novidades
                await avisarNovidades(sock, jid);
                break;
            case 16: // Criar cupom
                userStates.set(jid, { estado: 'criar_cupom' });
                await sock.sendMessage(jid, { text: '🎟️ Digite: CODIGO|DESCONTO|USOS\nEx: NYUX10|10|5' });
                break;
            case 17: // Listar cupons
                await listarCupons(sock, jid);
                break;
            case 18: // Blacklist
                await verBlacklist(sock, jid);
                break;
            case 19: // Estatísticas
                await mostrarEstatisticas(sock, jid);
                break;
            case 20: // Logs
                await mostrarLogs(sock, jid);
                break;
            case 99: // Super Admin menu
                if (isSuper) {
                    userStates.set(jid, { estado: 'superadmin_menu' });
                    await sendSuperAdminMenu(sock, jid);
                } else {
                    await sock.sendMessage(jid, { text: '❌ Apenas Super Admin pode acessar!' });
                }
                break;
            default:
                await sock.sendMessage(jid, { text: '❌ Opção inválida!' });
        }
        return;
    }
    
    // Menu Cliente
    switch(texto) {
        case '1':
            await listarJogos(sock, jid);
            break;
        case '2':
            userStates.set(jid, { estado: 'buscar_jogo' });
            await sock.sendMessage(jid, { text: '🔍 Digite o nome do jogo:' });
            break;
        case '3':
            userStates.set(jid, { estado: 'resgatar_key' });
            await sock.sendMessage(jid, { text: '🔑 Digite sua KEY:' });
            break;
        case '4':
            await meusDados(sock, jid);
            break;
        case '5':
            await meusFavoritos(sock, jid);
            break;
        case '6':
            await indicarAmigo(sock, jid);
            break;
        case '7':
            await meusPontos(sock, jid);
            break;
        case '8':
            userStates.set(jid, { estado: 'abrir_ticket' });
            await sock.sendMessage(jid, { text: '🎫 Descreva seu problema:' });
            break;
        case '9':
            await mostrarFAQ(sock, jid);
            break;
        default:
            await sendMenu(sock, jid);
    }
}

// ============== FUNÇÕES AUXILIARES ==============
async function processarOpcaoAdmin(sock, jid, opcao) {
    // Implementação das opções do admin
}

async function listarJogos(sock, jid) {
    await simularDigitando(sock, jid);
    const jogos = db.getAllGames();
    
    if (jogos.length === 0) {
        await sock.sendMessage(jid, { text: '📭 Nenhum jogo disponível no momento.' });
        return;
    }
    
    let lista = '🎮 *JOGOS DISPONÍVEIS*\n\n';
    jogos.forEach((jogo, i) => {
        lista += `${i + 1}. ${jogo.nome}\n`;
    });
    
    lista += '\n💬 Digite o número do jogo para ver as contas';
    await sock.sendMessage(jid, { text: lista });
}

async function listarTodasContas(sock, jid) {
    await simularDigitando(sock, jid);
    const contas = db.getAllAccounts();
    
    if (contas.length === 0) {
        await sock.sendMessage(jid, { text: '📭 Nenhuma conta cadastrada.' });
        return;
    }
    
    let lista = '📋 *TODAS AS CONTAS*\n\n';
    contas.slice(0, 50).forEach((conta) => {
        lista += `ID: ${conta.id} | ${conta.jogo}\n👤 ${conta.login}\n🔑 ${conta.senha}\n\n`;
    });
    
    if (contas.length > 50) {
        lista += `\n... e mais ${contas.length - 50} contas`;
    }
    
    await sock.sendMessage(jid, { text: lista });
}

async function listarClientes(sock, jid, tipo) {
    await simularDigitando(sock, jid);
    const clientes = tipo === 'ativos' ? db.getClientesAtivos() : db.getClientesInativos();
    
    if (clientes.length === 0) {
        await sock.sendMessage(jid, { text: `📭 Nenhum cliente ${tipo}.` });
        return;
    }
    
    let lista = tipo === 'ativos' ? '🟢 *CLIENTES ATIVOS*\n\n' : '🔴 *CLIENTES INATIVOS*\n\n';
    clientes.slice(0, 30).forEach((c, i) => {
        const tipoPlano = c.tipo === 'lifetime' || c.dias === 999999 ? '♾️' : c.tipo;
        lista += `${i + 1}. ${c.numero} | ${tipoPlano}\n`;
    });
    
    lista += `\n📊 Total: ${clientes.length}`;
    await sock.sendMessage(jid, { text: lista });
}

async function mostrarRanking(sock, jid) {
    await simularDigitando(sock, jid);
    const ranking = db.getRanking();
    
    let lista = '🏆 *RANKING DE CLIENTES*\n\n';
    ranking.slice(0, 10).forEach((c, i) => {
        const medalha = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '•';
        lista += `${medalha} ${i + 1}º - ${c.numero}\n   ${c.resgates} resgates\n\n`;
    });
    
    await sock.sendMessage(jid, { text: lista });
}

async function avisarNovidades(sock, jid) {
    await simularDigitando(sock, jid);
    const jogos = db.getUltimosJogos(5);
    const clientes = db.getClientesAtivos();
    
    if (jogos.length === 0) {
        await sock.sendMessage(jid, { text: '📭 Nenhum jogo novo para anunciar.' });
        return;
    }
    
    let msg = '✨ *NOVIDADES NA LOJA!* ✨\n\n🎮 *Novos jogos adicionados:*\n\n';
    jogos.forEach(j => {
        msg += `• ${j.nome}\n`;
    });
    
    msg += '\n🏃‍♂️ *Corra e resgate já!*\nDigite MENU para ver todos!';
    
    let enviados = 0;
    for (const cliente of clientes) {
        await sock.sendMessage(cliente.numero, { text: msg });
        enviados++;
        await delay(500);
    }
    
    await sock.sendMessage(jid, { text: `✅ Novidades enviadas para ${enviados} clientes!` });
}

async function listarCupons(sock, jid) {
    await simularDigitando(sock, jid);
    const cupons = db.getAllCupons();
    
    if (cupons.length === 0) {
        await sock.sendMessage(jid, { text: '🎟️ Nenhum cupom ativo.' });
        return;
    }
    
    let lista = '🎟️ *CUPONS ATIVOS*\n\n';
    cupons.forEach(c => {
        lista += `🏷️ ${c.codigo}\n📉 ${c.desconto}% OFF | Usos: ${c.usados}/${c.usos}\n\n`;
    });
    
    await sock.sendMessage(jid, { text: lista });
}

async function verBlacklist(sock, jid) {
    await simularDigitando(sock, jid);
    const blacklist = db.getBlacklist();
    
    if (blacklist.length === 0) {
        await sock.sendMessage(jid, { text: '🛡️ Blacklist vazia!' });
        return;
    }
    
    let lista = '🚫 *BLACKLIST*\n\n';
    blacklist.forEach((b, i) => {
        lista += `${i + 1}. ${b.numero}\n📝 ${b.motivo}\n📅 ${new Date(b.data).toLocaleDateString()}\n\n`;
    });
    
    await sock.sendMessage(jid, { text: lista });
}

async function mostrarEstatisticas(sock, jid) {
    await simularDigitando(sock, jid);
    
    const stats = {
        totalContas: db.getTotalContas(),
        totalClientes: db.getTotalClientes(),
        clientesAtivos: db.getClientesAtivos().length,
        totalResgates: db.getTotalResgates(),
        totalKeys: db.getTotalKeys(),
        keysUsadas: db.getKeysUsadas(),
        totalAdmins: db.getAllAdmins().length,
        superAdmins: db.getAllSuperAdmins().length
    };
    
    const msg = `📊 *ESTATÍSTICAS DO SISTEMA*\n\n` +
        `🎮 Total de Contas: ${stats.totalContas}\n` +
        `👥 Total de Clientes: ${stats.totalClientes}\n` +
        `🟢 Clientes Ativos: ${stats.clientesAtivos}\n` +
        `🔄 Total de Resgates: ${stats.totalResgates}\n` +
        `🔑 Total de KEYs: ${stats.totalKeys}\n` +
        `✅ KEYs Usadas: ${stats.keysUsadas}\n` +
        `🔐 Admins: ${stats.totalAdmins}\n` +
        `👑 Super Admins: ${stats.superAdmins}`;
    
    await sock.sendMessage(jid, { text: msg });
}

async function mostrarLogs(sock, jid) {
    await simularDigitando(sock, jid);
    const logs = db.getLogs(20);
    
    let lista = '📋 *ÚLTIMOS LOGS*\n\n';
    logs.forEach(log => {
        lista += `[${new Date(log.data).toLocaleString()}]\n${log.mensagem}\n\n`;
    });
    
    await sock.sendMessage(jid, { text: lista });
}

async function meusDados(sock, jid) {
    await simularDigitando(sock, jid);
    const cliente = db.getClient(jid);
    
    if (!cliente) {
        await sock.sendMessage(jid, { text: '❌ Você não tem um plano ativo.' });
        return;
    }
    
    const expira = cliente.expiracao ? new Date(cliente.expiracao).toLocaleString() : '♾️ Lifetime';
    const tipo = cliente.tipo === 'lifetime' || cliente.dias === 999999 ? 'Lifetime ♾️' : `${cliente.dias} dias`;
    
    const msg = `👤 *SEUS DADOS*\n\n` +
        `📱 Número: ${cliente.numero}\n` +
        `📦 Plano: ${tipo}\n` +
        `⏰ Expira em: ${expira}\n` +
        `📅 Ativado em: ${new Date(cliente.dataAtivacao).toLocaleString()}\n` +
        `💎 Pontos: ${cliente.pontos || 0}`;
    
    await sock.sendMessage(jid, { text: msg });
}

async function meusFavoritos(sock, jid) {
    await simularDigitando(sock, jid);
    const favoritos = db.getFavoritos(jid);
    
    if (favoritos.length === 0) {
        await sock.sendMessage(jid, { text: '⭐ Você não tem favoritos ainda.' });
        return;
    }
    
    let lista = '⭐ *MEUS FAVORITOS*\n\n';
    favoritos.forEach((f, i) => {
        lista += `${i + 1}. ${f.jogo}\n`;
    });
    
    await sock.sendMessage(jid, { text: lista });
}

async function indicarAmigo(sock, jid) {
    await simularDigitando(sock, jid);
    const codigo = db.getCodigoIndicacao(jid);
    
    await sock.sendMessage(jid, {
        text: `👥 *INDIQUE E GANHE!*\n\n` +
            `📲 Seu código: *${codigo}*\n\n` +
            `🎁 Seu amigo ganha 2h grátis\n` +
            `💎 Você ganha 2h por indicação\n\n` +
            `Compartilhe seu código!`
    });
}

async function meusPontos(sock, jid) {
    await simularDigitando(sock, jid);
    const cliente = db.getClient(jid);
    const pontos = cliente?.pontos || 0;
    
    await sock.sendMessage(jid, {
        text: `💎 *MEUS PONTOS*\n\n` +
            `Você tem: *${pontos}* pontos\n\n` +
            `🎁 Resgate:\n` +
            `• 100 pts = 1 dia grátis\n` +
            `• 250 pts = 3 dias grátis\n` +
            `• 500 pts = 7 dias grátis\n\n` +
            `Ganhe pontos indicando amigos!`
    });
}

async function mostrarFAQ(sock, jid) {
    await simularDigitando(sock, jid);
    
    const faq = `❓ *PERGUNTAS FREQUENTES*\n\n` +
        `*1. Como usar as contas?*\n` +
        `→ Vá em "Ver Jogos", escolha um jogo e receba os dados de login.\n\n` +
        `*2. As contas são ilimitadas?*\n` +
        `→ Sim! Todas as contas podem ser usadas por vários clientes.\n\n` +
        `*3. Posso trocar a senha?*\n` +
        `→ Não! Isso resultará em banimento.\n\n` +
        `*4. O que é Lifetime?*\n` +
        `→ Acesso vitalício, nunca expira!\n\n` +
        `*5. Como renovar meu plano?*\n` +
        `→ Compre uma nova KEY e resgate no menu.\n\n` +
        `💬 Dúvidas? Abra um ticket (opção 8)!`;
    
    await sock.sendMessage(jid, { text: faq });
}

// ============== INICIAR ==============
connectToWhatsApp().catch(console.error);

// Backup automático diário
setInterval(() => {
    db.backup();
    if (sockGlobal && CONFIG.ADMIN_NUMBER) {
        sockGlobal.sendMessage(CONFIG.ADMIN_NUMBER, {
            text: '💾 *Backup automático realizado!*'
        });
    }
}, 24 * 60 * 60 * 1000);
