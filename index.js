const express = require('express');
const cors = require('cors');
const { Client } = require('discord.js-selfbot-v13');
const { joinVoiceChannel } = require('@discordjs/voice');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

const sessions = new Map();

app.get('/', (req, res) => {
    res.send('Backend rodando com sucesso!');
});

app.post('/api/servers', async (req, res) => {
    const { token } = req.body;
    if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'Token inválido ou não fornecido.' });
    }

    const cleanToken = token.trim().replace(/^"|"$/g, '');

    let session = sessions.get(cleanToken);

    if (session && session.client && session.client.readyTimestamp) {
        return sendGuildsResponse(session.client, res);
    }

    const client = new Client({
        checkUpdate: false,
        syncStatus: false,
        ws: {
            properties: {
                os: 'Windows',
                browser: 'Discord Client',
                release_channel: 'stable'
            }
        }
    });

    let hasResponded = false;

    const timeout = setTimeout(() => {
        if (!hasResponded) {
            hasResponded = true;
            client.destroy();
            return res.status(504).json({ error: 'O Discord demorou para responder ao login. Tente novamente.' });
        }
    }, 25000);

    client.once('ready', () => {
        if (!hasResponded) {
            hasResponded = true;
            clearTimeout(timeout);
            sessions.set(cleanToken, { client });
            sendGuildsResponse(client, res);
        }
    });

    try {
        await client.login(cleanToken);
    } catch (err) {
        if (!hasResponded) {
            hasResponded = true;
            clearTimeout(timeout);
            client.destroy();
            return res.status(401).json({ error: 'Token recusado pelo Discord: ' + err.message });
        }
    }
});

function sendGuildsResponse(client, res) {
    try {
        const guilds = client.guilds.cache.map(guild => ({
            id: guild.id,
            name: guild.name,
            channels: guild.channels.cache
                .filter(c => c.type === 'GUILD_VOICE' || c.type === 2)
                .map(c => ({ id: c.id, name: c.name }))
        }));

        return res.json({ guilds });
    } catch (err) {
        return res.status(500).json({ error: 'Erro ao processar lista de servidores.' });
    }
}

app.post('/api/connect', async (req, res) => {
    const { token, guildId, channelId } = req.body;
    if (!token) return res.status(400).json({ error: 'Token não fornecido.' });

    const cleanToken = token.trim().replace(/^"|"$/g, '');
    const session = sessions.get(cleanToken);

    if (!session || !session.client) {
        return res.status(400).json({ error: 'Sessão expirada. Carregue os servidores novamente.' });
    }

    const guild = session.client.guilds.cache.get(guildId);
    if (!guild) {
        return res.status(404).json({ error: 'Servidor não encontrado.' });
    }

    try {
        const connection = joinVoiceChannel({
            channelId,
            guildId,
            adapterCreator: guild.voiceAdapterCreator,
            selfMute: false,
            selfDeaf: false
        });

        session.connection = connection;
        return res.json({ success: true, message: 'Conectado à call com sucesso!' });
    } catch (err) {
        return res.status(500).json({ error: 'Erro ao entrar no canal de voz: ' + err.message });
    }
});

app.post('/api/disconnect', (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token não fornecido.' });

    const cleanToken = token.trim().replace(/^"|"$/g, '');
    const session = sessions.get(cleanToken);

    if (session) {
        if (session.connection) session.connection.destroy();
        if (session.client) session.client.destroy();
        sessions.delete(cleanToken);
        return res.json({ success: true, message: 'Desconectado da call.' });
    }

    return res.status(400).json({ error: 'Nenhuma conexão ativa encontrada para este token.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend rodando na porta ${PORT}`));
    
