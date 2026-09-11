const express = require('express');
const cors = require('cors');
const { Client } = require('discord.js-selfbot-v13');
const { joinVoiceChannel } = require('@discordjs/voice');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// Armazena as sessões ativas dos usuários por token
const sessions = new Map();

// Rota de Healthcheck do Render
app.get('/', (req, res) => {
    res.status(200).send('Backend rodando com sucesso!');
});

// Helper para padronizar o cabeçalho do Discord simulando navegador
function getDiscordHeaders(token) {
    const cleanToken = token.trim().replace(/^["']|["']$/g, '');
    return {
        'Authorization': cleanToken,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
    };
}

// 1. CARREGAR SERVIDORES E CANAIS DE VOZ
app.post('/api/servers', async (req, res) => {
    const { token } = req.body;
    if (!token) {
        return res.status(400).json({ error: 'Token não fornecido.' });
    }

    const cleanToken = token.trim().replace(/^["']|["']$/g, '');
    const headers = getDiscordHeaders(cleanToken);

    try {
        // Busca a lista de guildas do usuário
        const guildsRes = await fetch('https://discord.com/api/v9/users/@me/guilds', { headers });

        if (!guildsRes.ok) {
            if (guildsRes.status === 401) {
                return res.status(401).json({ error: 'Token do Discord inválido ou expirado.' });
            }
            if (guildsRes.status === 429) {
                const retryAfter = guildsRes.headers.get('Retry-After') || 5;
                return res.status(429).json({ error: `Bloqueio temporário (Rate Limit). Aguarde ${retryAfter} segundos e tente novamente.` });
            }
            return res.status(guildsRes.status).json({ error: `Erro do Discord: Status ${guildsRes.status}` });
        }

        const userGuilds = await guildsRes.json();

        // Para cada servidor, busca os canais de voz
        const guildsWithChannels = await Promise.all(
            userGuilds.map(async (guild) => {
                try {
                    const channelsRes = await fetch(`https://discord.com/api/v9/guilds/${guild.id}/channels`, { headers });
                    if (!channelsRes.ok) return { id: guild.id, name: guild.name, channels: [] };

                    const channels = await channelsRes.json();
                    
                    // Filtra apenas canais de voz (tipo 2 = GUILD_VOICE, tipo 13 = GUILD_STAGE_VOICE)
                    const voiceChannels = channels
                        .filter(c => c.type === 2 || c.type === 13)
                        .map(c => ({ id: c.id, name: c.name }));

                    return {
                        id: guild.id,
                        name: guild.name,
                        channels: voiceChannels
                    };
                } catch {
                    return { id: guild.id, name: guild.name, channels: [] };
                }
            })
        );

        return res.json({ guilds: guildsWithChannels });
    } catch (err) {
        return res.status(500).json({ error: 'Erro interno no backend: ' + err.message });
    }
});

// 2. CONECTAR AO CANAL DE VOZ
app.post('/api/connect', async (req, res) => {
    const { token, guildId, channelId } = req.body;
    if (!token || !guildId || !channelId) {
        return res.status(400).json({ error: 'Parâmetros ausentes (token, guildId ou channelId).' });
    }

    const cleanToken = token.trim().replace(/^["']|["']$/g, '');
    let session = sessions.get(cleanToken);

    try {
        if (!session || !session.client) {
            const client = new Client({ checkUpdate: false, syncStatus: false });
            
            await client.login(cleanToken);
            session = { client };
            sessions.set(cleanToken, session);
        }

        const guild = await session.client.guilds.fetch(guildId);
        if (!guild) return res.status(404).json({ error: 'Servidor não encontrado no cliente.' });

        // Desconecta de conexão anterior se existir
        if (session.connection) {
            try { session.connection.destroy(); } catch {}
        }

        const connection = joinVoiceChannel({
            channelId,
            guildId,
            adapterCreator: guild.voiceAdapterCreator,
            selfMute: false,
            selfDeaf: false
        });

        session.connection = connection;
        return res.json({ success: true, message: 'Conectado com sucesso ao canal de voz!' });
    } catch (err) {
        return res.status(500).json({ error: 'Erro ao conectar no canal de voz: ' + err.message });
    }
});

// 3. DESCONECTAR DO CANAL DE VOZ
app.post('/api/disconnect', (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token não fornecido.' });

    const cleanToken = token.trim().replace(/^["']|["']$/g, '');
    const session = sessions.get(cleanToken);

    if (session) {
        if (session.connection) {
            try { session.connection.destroy(); } catch {}
        }
        if (session.client) {
            try { session.client.destroy(); } catch {}
        }
        sessions.delete(cleanToken);
        return res.json({ success: true, message: 'Desconectado com sucesso.' });
    }

    return res.status(400).json({ error: 'Nenhuma sessão ativa encontrada para este token.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
        
