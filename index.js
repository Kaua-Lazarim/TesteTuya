// A PRIMEIRA LINHA DEVE SER ESTA!
require('dotenv').config();

// =================================================================
//                    INÍCIO DO NOSSO TESTE DE DEBUG
// =================================================================
console.log('--- Iniciando teste de variáveis de ambiente ---');
console.log('Valor de TUYA_ACCESS_ID:', process.env.TUYA_ACCESS_ID);
console.log('Valor de TUYA_ACCESS_SECRET:', process.env.TUYA_ACCESS_SECRET);
console.log('Valor de TUYA_API_BASE_URL:', process.env.TUYA_API_BASE_URL);
console.log('Valor de TUYA_UID:', process.env.TUYA_UID);
console.log('--- Fim do teste ---');
// =================================================================

const express = require('express');
const { TuyaContext } = require('@tuya/tuya-connector-nodejs');

// O resto do seu código continua igual...
const app = express();
const port = process.env.PORT || 3001;
app.use(express.json());

const tuyaContext = new TuyaContext({
  baseUrl: process.env.TUYA_API_BASE_URL,
  accessKey: process.env.TUYA_ACCESS_ID,
  secretKey: process.env.TUYA_ACCESS_SECRET,
});

// ... Seus endpoints (app.get, app.post) ...
app.get('/', (req, res) => {
    res.send('Olá, mundo! Meu backend solar está no ar!');
});

app.get('/devices/tuya', async (req, res) => {
    try {
        const response = await tuyaContext.request({
            method: 'GET',
            path: `/v1.0/users/${process.env.TUYA_UID}/devices`,
        });
        if (response.success) {
            res.json(response.result);
        } else {
            res.status(500).json({ message: 'Erro ao buscar dispositivos Tuya', error: response.msg });
        }
    } catch (error) {
        res.status(500).json({ message: 'Erro crítico no servidor', error: error.message });
    }
});

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
        res.status(500).json({ message: 'Erro crítico no servidor', error: error.message });
    }
});


app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});