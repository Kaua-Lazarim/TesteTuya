// index.js (Projeto Simplificado com Rota Toggle Inteligente)

// 1. Carrega as variáveis de ambiente do arquivo .env
require('dotenv').config();

// 2. Importa as bibliotecas necessárias
const express = require('express');
const { TuyaContext } = require('@tuya/tuya-connector-nodejs');
const cors = require('cors');

// 3. Inicializa o aplicativo Express
const app = express();
const port = process.env.PORT || 3001;

// 4. Configura os middlewares
app.use(cors());
app.use(express.json());

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

// Rota para listar os dispositivos Tuya (com a correção do TypeError)
app.get('/devices/tuya', async (req, res) => {
    try {
        const response = await tuyaContext.request({
            method: 'GET',
            path: `/v1.0/users/${process.env.TUYA_UID}/devices`,
        });

        if (response.success) {
            const devices = response.result || [];

            // --- LÓGICA ATUALIZADA ---
            const sanitizedDevices = devices.map(device => {
                if (device.status && Array.isArray(device.status)) {
                    device.status = device.status.map(statusItem => {
                        if (statusItem.value !== null && statusItem.value !== undefined) {
                            
                            // A MÁGICA ACONTECE AQUI:
                            // Se o código for de voltagem ou potência, já fazemos o cálculo!
                            if (statusItem.code === 'cur_voltage' || statusItem.code === 'cur_power') {
                                const numericValue = parseFloat(statusItem.value);
                                if (!isNaN(numericValue)) {
                                    // Divide por 10 e formata com 1 casa decimal
                                    statusItem.value = (numericValue / 10).toFixed(1);
                                }
                            }
                            
                            // Converte o resultado final para string, por segurança
                            statusItem.value = statusItem.value.toString();
                        }
                        return statusItem;
                    });
                }
                return device;
            });

            res.json(sanitizedDevices);

        } else {
            res.status(500).json({ message: 'Erro ao buscar dispositivos Tuya', error: response.msg });
        }
    } catch (error) {
        res.status(500).json({ message: 'Erro crítico ao conectar com a Tuya', error: error.message });
    }
});

// Rota antiga para enviar comandos (ainda útil, mas não para o nosso Switch)
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


// --- ROTA NOVA E INTELIGENTE (que vamos usar no FlutterFlow) ---
app.post('/devices/tuya/:deviceId/toggle', async (req, res) => {
  try {
    const { deviceId } = req.params;
    console.log(`[Tuya] Recebida requisição de toggle para o deviceId: ${deviceId}`);

    // 1. Pega o estado ATUAL do dispositivo na nuvem da Tuya
    const statusResponse = await tuyaContext.request({
      method: 'GET',
      path: `/v1.0/devices/${deviceId}/status`,
    });

    if (!statusResponse.success) {
      return res.status(500).json({ message: 'Falha ao obter status atual do dispositivo da Tuya.' });
    }

    // 2. Encontra o estado do switch e calcula o oposto
    const switchStatusObject = statusResponse.result.find(s => s.code === 'switch_1');
    if (!switchStatusObject) {
      return res.status(404).json({ message: 'Dispositivo não possui um interruptor controlável (switch_1).' });
    }
    
    const currentState = switchStatusObject.value; // ex: true
    const newState = !currentState;             // ex: false

    console.log(`[Tuya] Estado atual: ${currentState}. Enviando comando para: ${newState}`);

    // 3. Envia o comando para a Tuya com o NOVO estado
    const commandResponse = await tuyaContext.request({
      method: 'POST',
      path: `/v1.0/devices/${deviceId}/commands`,
      body: {
        commands: [{ code: 'switch_1', value: newState }],
      },
    });

    if (commandResponse.success) {
      res.json({ success: true, message: `Dispositivo alternado para ${newState}` });
    } else {
      res.status(500).json({ message: 'Falha ao enviar comando de toggle para a Tuya.' });
    }

  } catch (error) {
    res.status(500).json({ message: 'Erro crítico na rota de toggle', error: error.message });
  }
});

app.get('/devices/tuya/:deviceId/status', async (req, res) => {
  try {
    const { deviceId } = req.params;
    console.log(`[Tuya] Buscando status detalhado para o deviceId: ${deviceId}`);

    // A API da Tuya usa este endpoint para pegar todos os status atuais
    const response = await tuyaContext.request({
      method: 'GET',
      path: `/v1.0/devices/${deviceId}/status`,
    });

    if (response.success) {
      
      const statusList = response.result || [];
      const sanitizedStatusList = statusList.map(statusItem => {
        if (statusItem.value !== null && statusItem.value !== undefined) {
          statusItem.value = statusItem.value.toString();
        }
        return statusItem;
      });

      res.json({ result: sanitizedStatusList }); 

    } else {
      res.status(500).json({ message: 'Falha ao obter status do dispositivo da Tuya.', error: response.msg });
    }
  } catch (error) {
    res.status(500).json({ message: 'Erro crítico na rota de status', error: error.message });
  }
});

// index.js

// ... (todo o seu código existente, como /devices/tuya, /toggle, etc.) ...

// --- NOVA ROTA PARA O RELATÓRIO DE ENERGIA DIÁRIO ---
app.get('/devices/tuya/:deviceId/daily-energy', async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    // Pega a data de hoje no formato que a API da Tuya espera (YYYYMMDD)
    const today = new Date();
    const formattedDate = today.getFullYear().toString() + 
                        ('0' + (today.getMonth() + 1)).slice(-2) + 
                        ('0' + today.getDate()).slice(-2);

    console.log(`[Tuya] Buscando energia diária para o device ${deviceId} na data ${formattedDate}`);

    // Este é o endpoint da Tuya para estatísticas diárias
   const response = await tuyaContext.request({
  method: 'GET',
  path: `/v1.0/devices/${deviceId}/statistics/days`,
  query: {
    // ATENÇÃO: vamos pedir TODOS os códigos disponíveis, não apenas 'add_ele'
    code: 'kwh,cur_power,add_ele', // Pedimos vários para ver o que vem
    start_day: formattedDate,
    end_day: formattedDate,
  }
});

// 👇 ADICIONE ESTA LINHA AQUI 👇
console.log('[DEBUG] Resposta BRUTA da Tuya Stats:', JSON.stringify(response, null, 2));

if (response.success && response.result) {
      // A resposta vem em um formato complexo, precisamos extrair o valor
      const stats = response.result;
      const values = JSON.parse(stats.values || '{}');
      
      // Pega o valor para o dia de hoje
      const todayValueWh = values[formattedDate] || 0;
      
      // Converte de Wh para kWh
      const todayValueKWh = todayValueWh / 1000;

      res.json({
        daily_kwh: todayValueKWh.toFixed(2), // Formata com 2 casas decimais
        unit: 'kWh'
      });
    } else {
      console.error('[Tuya] Erro ao buscar estatísticas:', response);
      res.status(500).json({ message: 'Falha ao obter estatísticas da Tuya.', error: response.msg });
    }
  } catch (error) {
    console.error('[Tuya] Erro crítico na rota de energia diária:', error);
    res.status(500).json({ message: 'Erro crítico na rota de energia diária', error: error.message });
  }
});


// 7. Inicia o servidor
app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});