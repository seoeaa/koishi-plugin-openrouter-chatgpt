import { h, Context, Schema, Session } from 'koishi'
import { Configuration, OpenAIApi } from 'openai';
import {} from 'koishi-plugin-puppeteer'
import axios from 'axios';

export const name = 'openrouter-chatgpt'

export interface Config {
  apiKey: string
  apiAddress: string
  model: string
  temperature: number
  maxTokens: number
  topP: number
  frequencyPenalty: number
  presencePenalty: number
  stop: string[]
  errorMessage: string
  triggerWord: string
  pictureMode: boolean
  defaultHeaders: {
    "HTTP-Referer": string;
    "X-Title": string;
  }
}

async function getAvailableModels() {
  try {
    const response = await axios.get('https://openrouter.ai/api/v1/models');
    const models = response.data.data.map(model => model.id);
    return models;
  } catch (error) {
    console.error('Error fetching models:', error.message);
    // Возвращайте стандартные модели в случае ошибки
    return ['gpt-3.5-turbo', 'google/gemini-pro'];
  }
}

export const Config: Schema<Config> = Schema.object({
  apiKey: Schema.string().required().description("OpenAI API Key: https://openrouter.ai/keys"),
  apiAddress: Schema.string().required().default("https://openrouter.ai/api/v1").description("API Запросить адрес."),
  triggerWord: Schema.string().default("chat").description("Ключевые слова, которые вызывают ответ бота."),
  model: Schema.union(['gpt-3.5-turbo', 'google/gemini-pro', 'nousresearch/nous-capybara-7b', 'mistralai/mistral-7b-instruct', 'openchat/openchat-7b', 'rwkv/rwkv-5-world-3b']).default('gpt-3.5-turbo'),
  temperature: Schema.number().default(1).description("Температура, более высокие значения означают, что модель будет подвергаться большему риску. Для более творческих приложений попробуйте 0,9, а для приложений, где есть четкий ответ, попробуйте 0 (выборка argmax)."),
  maxTokens: Schema.number().default(100).description("Максимальное количество сгенерированных токенов."),
  topP: Schema.number().default(1),
  frequencyPenalty: Schema.number().default(0).description('Значение находится в диапазоне от -2,0 до 2,0. Положительные значения наказывают новые токены на основе их существующей частоты в тексте, уменьшая вероятность того, что модель будет дословно повторять одну и ту же строку.'),
  presencePenalty: Schema.number().default(0).description('Значение находится в диапазоне от -2,0 до 2,0. Положительные значения штрафуют новые токены на основе их существующей частоты в тексте, уменьшая вероятность того, что модель будет дословно повторять одну и ту же строку.'),
  stop: Schema.array(Schema.string()).default(null).description('Сгенерированный текст остановится при обнаружении любого маркера остановки.'),
  errorMessage: Schema.string().default("В ответе ошибка, свяжитесь с администратором.。").description("Подсказка при ответе на ошибку."),
  pictureMode: Schema.boolean().default(false).description("Включите режим изображения."),
  defaultHeaders: Schema.object({
    "HTTP-Referer": Schema.string(),
    "X-Title": Schema.string(),
  }).default({
    "HTTP-Referer": "https://github.com",
    "X-Title": "koishi-plugin",
  }),
})

export async function apply(ctx: Context, config: Config) {


  const models = await getAvailableModels();

  const configuration = new Configuration({
    apiKey: config.apiKey,
    basePath: config.apiAddress,
  });

  const openai = new OpenAIApi(configuration);

  ctx.before('send', async (session) => {
    if (config.pictureMode === true) {
      const html = `
      <html>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/core@1.0.0-beta17/dist/css/tabler.min.css">
      <style> body { background-color: white; } </style>
      <div class="toast show" id="message">
        <div class="toast-header">
          <span class="avatar avatar-xs me-2" style="background-image: url(https://pic.sky390.cn/pics/2023/03/09/6409690ebc4df.png)"></span>
          <strong class="me-auto">ChatGPT</strong>
        </div>
        <div class="toast-body">
          ${ session.content.replace(/\n/g, '<br>').replace(/<\/*template>/g, '') }
        </div>
      </div>
      <script>
        const message = document.getElementById('message');
        document.getElementsByTagName('html')[0].style.height = message.offsetHeight;
        document.getElementsByTagName('html')[0].style.width = message.offsetWidth;
      </script>
      </html>`;
      session.content = await ctx.puppeteer.render(html);
    }
  })
  ctx.command(config.triggerWord + ' <message:text>').action(async ({ session }, message) => {
    const q = message;
    session.send("Запрос продолжается, пожалуйста, подождите...");
    try {

      const completion = await openai.createChatCompletion({
        model: config.model,
        messages: [
          {"role": "system", 'content': "Ты полезный помошник поэт."},
          { "role": "user", 'content': q }
        ],
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        top_p: config.topP,
        frequency_penalty: config.frequencyPenalty,
        presence_penalty: config.presencePenalty,
        stop: config.stop,
      });
      return completion.data.choices[0].message.content;
    } catch (error) {
      if (error.response) {
        console.log(error.response.status);
        console.log(error.response.data);
      } else {
        console.log(error.message);
      }
      return config.errorMessage;
    }
  })
}
