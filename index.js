// index.js (Projeto Simplificado - Apenas Tuya)

// 1. Carrega as variáveis de ambiente do arquivo .env
require('dotenv').config();

// 2. Importa as bibliotecas necessárias
const express = require('express');
const { TuyaContext } = require('@tuya/tuya-connector-nodejs');
const cors = require('cors'); // Importa a biblioteca CORS

// 3. Inicializa o aplicativo Express
const app = express();
const port = process.env.PORT || 3001;

// 4. Configura os middlewares
app.use(cors()); // Habilita o CORS para permitir que o FlutterFlow Web acesse a API
app.use(express.json()); // Habilita o Express para entender corpos de requisição em JSON

// 5. Configura a conexão com a API da Tuya
const tuyaContext = new TuyaContext({
  baseUrl: process.env.TUYA_API_BASE_URL,
  accessKey: process.env.TUYA_ACCESS_ID,
  secretKey: process.env.TUYA_ACCESS_SECRET,
});

// 6. Define os endpoints (rotas) da sua API

// Rota de teste
app.get('/', (req, res) => {
    res.send('API da Tuya está no ar!');
});

// Rota para listar os dispositivos Tuya (COM A CORREÇÃO DO TYPEERROR)
app.get('/devices/tuya', async (req, res) => {
    try {
        const response = await tuyaContext.request({
            method: 'GET',
            path: `/v1.0/users/${process.env.TUYA_UID}/devices`,
        });

        if (response.success) {
            const devices = response.result || [];

            // --- CORREÇÃO DEFINITIVA PARA O TYPEERROR NO FLUTTERFLOW ---
            // Garante que todos os campos 'value' dentro de 'status' sejam strings
            const sanitizedDevices = devices.map(device => {
                if (device.status && Array.isArray(device.status)) {
                    device.status = device.status.map(statusItem => {
                        if (statusItem.value !== null && statusItem.value !== undefined) {
                            statusItem.value = statusItem.value.toString();
                        }
                        return statusItem;
                    });
                }
                return device;
            });

            res.json(sanitizedDevices); // Envia a lista com os dados já "limpos"

        } else {
            res.status(500).json({ message: 'Erro ao buscar dispositivos Tuya', error: response.msg });
        }
    } catch (error) {
        res.status(500).json({ message: 'Erro crítico ao conectar com a Tuya', error: error.message });
    }
});

// Rota para enviar comandos para um dispositivo Tuya
app.post('/devices/tuya/:deviceId/commands', async (req, res) => {
    const { deviceId } = req.params;
    const { commands } = req.body;
    try {
        const response = await tuyaContext.request({
            method: 'POST',
            path: `/v1.0/devices/${deviceId}/commands`,
            body: { commands },
        });
        if(response.success) {
            res.json({ success: true, message: 'Comando enviado!' });
        } else {
            res.status(500).json({ message: 'Erro ao enviar comando Tuya', error: response.msg });
        }
    } catch (error) {
        res.status(500).json({ message: 'Erro crítico ao enviar comando para a Tuya', error: error.message });
    }
});

// 7. Inicia o servidor
app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});