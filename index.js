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

app.get('/devices/tuya/:deviceId/daily-energy', async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    // Define o início e o fim do dia de hoje em milissegundos (timestamp)
    const now = new Date();
    const startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).getTime();
    const endTime = now.getTime();

    console.log(`[Tuya] Buscando histórico de energia para o device ${deviceId}`);

    // Este é o endpoint correto para buscar o histórico de um status
    const response = await tuyaContext.request({
      method: 'GET',
      path: `/v1.0/devices/${deviceId}/logs/timer`,
      query: {
        codes: 'add_ele', // O código do "odômetro" de energia
        type: '7', // Tipo de log padrão para dados de status
        start_time: startTime,
        end_time: endTime,
      }
    });

    if (response.success && response.result && response.result.logs.length > 0) {
      const logs = response.result.logs;
      
      // Encontra a primeira e a última leitura do dia
      const firstReading = parseInt(logs[logs.length - 1].value); // O mais antigo vem por último
      const lastReading = parseInt(logs[0].value); // O mais recente vem primeiro
      
      // Calcula a diferença e converte de Wh para kWh
      const consumedWh = lastReading - firstReading;
      const consumedKWh = consumedWh / 1000;

      res.json({
        daily_kwh: consumedKWh.toFixed(3), // Formata com 3 casas decimais para precisão
        unit: 'kWh'
      });
    } else {
      // Se não houver logs ou a resposta falhar, retorna 0
      res.json({ daily_kwh: "0.00", unit: 'kWh' });
    }
  } catch (error) {
    console.error('[Tuya] Erro crítico na rota de energia diária:', error);
    res.status(500).json({ message: 'Erro crítico na rota de energia diária', error: error.message });
  }
});


app.get('/devices/tuya/:deviceId/specifications', async (req, res) => {
  try {
    const { deviceId } = req.params;
    console.log(`[DEBUG] Buscando especificações para o deviceId: ${deviceId}`);

    // Este é o endpoint da Tuya que retorna todas as funções e status de um dispositivo
    const response = await tuyaContext.request({
      method: 'GET',
      path: `/v1.0/devices/${deviceId}/specifications`,
    });

    res.json(response); // Retorna a resposta bruta e completa

  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar especificações.', error: error.message });
  }
});



// 7. Inicia o servidor
app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});