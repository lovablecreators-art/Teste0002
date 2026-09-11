const express = require('express');
const cors = require('cors');
const { Client } = require('discord.js-selfbot-v13');
const { joinVoiceChannel } = require('@discordjs/voice');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const sessions = new Map();

app.get('/', (req, res) => res.send('Backend rodando com sucesso!'));

app.post('/api/servers', async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token não fornecido.' });

    const cleanToken = token.trim().replace(/^["']|["']$/g, '');

    // Se a sessão já existe e está pronta, retorna imediatamente
    if (sessions.has(cleanToken)) {
        const activeClient = sessions.get(cleanToken).client;
        if (activeClient && activeClient.readyTimestamp) {
            return sendGuildsData(activeClient, res);
        }
    }

    const client = new Client({
        checkUpdate: false,
        syncStatus: false,
        ws: { properties: { os: 'Windows', browser: 'Discord Client' } }
    });

    let handled = false;

    const timeout = setTimeout(() => {
        if (!handled) {
            handled = true;
            client.destroy();
            return res.status(429).json({ error: 'O Discord bloqueou temporariamente por excesso de tentativas (Rate Limit). Aguarde 2 minutos e tente novamente.' });
        }
    }, 20000);

    client.once('ready', () => {
        if (!handled) {
            handled = true;
            clearTimeout(timeout);
            sessions.set(cleanToken, { client });
            sendGuildsData(client, res);
        }
    });

    try {
        await client.login(cleanToken);
    } catch (err) {
        if (!handled) {
            handled = true;
            clearTimeout(timeout);
            client.destroy();
            return res.status(401).json({ error: 'Falha na autenticação: ' + err.message });
        }
    }
});

function sendGuildsData(client, res) {
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
        return res.status(500).json({ error: 'Erro ao listar servidores e canais.' });
    }
}

app.post('/api/connect', async (req, res) => {
    const { token, guildId, channelId } = req.body;
    const cleanToken = token ? token.trim().replace(/^["']|["']$/g, '') : '';
    const session = sessions.get(cleanToken);

    if (!session || !session.client) {
        return res.status(400).json({ error: 'Sessão não encontrada. Recarregue os servidores.' });
    }

    try {
        const guild = session.client.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: 'Servidor não encontrado.' });

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
        return res.status(500).json({ error: 'Erro ao entrar na call: ' + err.message });
    }
});

app.post('/api/disconnect', (req, res) => {
    const { token } = req.body;
    const cleanToken = token ? token.trim().replace(/^["']|["']$/g, '') : '';
    const session = sessions.get(cleanToken);

    if (session) {
        if (session.connection) session.connection.destroy();
        if (session.client) session.client.destroy();
        sessions.delete(cleanToken);
        return res.json({ success: true, message: 'Desconectado com sucesso.' });
    }

    return res.status(400).json({ error: 'Nenhuma conexão ativa.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend rodando na porta ${PORT}`));
        
