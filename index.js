
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
    if (!token) {
        return res.status(400).json({ error: 'Token não fornecido.' });
    }

    let session = sessions.get(token);

    if (!session || !session.client) {
        const client = new Client({
            checkUpdate: false,
            ws: { properties: { os: 'Windows', browser: 'Discord Client' } }
        });

        try {
            await Promise.race([
                client.login(token),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Tempo limite excedido ao conectar ao Discord.')), 15000))
            ]);
            session = { client };
            sessions.set(token, session);
        } catch (err) {
            console.error('Erro de Login:', err.message);
            return res.status(400).json({ error: 'Falha no login: ' + err.message });
        }
    }

    try {
        const guilds = session.client.guilds.cache.map(guild => ({
            id: guild.id,
            name: guild.name,
            channels: guild.channels.cache
                .filter(c => c.type === 'GUILD_VOICE' || c.type === 2)
                .map(c => ({ id: c.id, name: c.name }))
        }));

        return res.json({ guilds });
    } catch (e) {
        return res.status(500).json({ error: 'Erro ao mapear servidores do Discord.' });
    }
});

app.post('/api/connect', async (req, res) => {
    const { token, guildId, channelId } = req.body;
    const session = sessions.get(token);

    if (!session || !session.client) {
        return res.status(400).json({ error: 'Sessão não encontrada. Faça login novamente.' });
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
        return res.status(500).json({ error: 'Erro ao conectar à call: ' + err.message });
    }
});

app.post('/api/disconnect', (req, res) => {
    const { token } = req.body;
    const session = sessions.get(token);

    if (session) {
        if (session.connection) session.connection.destroy();
        if (session.client) session.client.destroy();
        sessions.delete(token);
        return res.json({ success: true, message: 'Desconectado com sucesso.' });
    }

    return res.status(400).json({ error: 'Nenhuma conexão ativa encontrada.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
        
