import OpenAI from 'openai'
import fs from 'fs'

const openai = new OpenAI({
    apiKey: useRuntimeConfig().openaiApiKey, // Использование API ключа из конфигурации
    maxRetries: 3, // Максимальное количество повторных попыток
    timeout: 60 * 1000 // Таймаут запроса (60 секунд)
})

export async function embedding({
    input,
    model = 'text-embedding-3-small', //'text-embedding-3-small', //'text-embedding-ada-002',
    encoding_format = 'float'
}) {

    try {

        const result = await openai.embeddings.create({
            model,
            input,
            encoding_format
        })
        
        return result.data.map((d) => d.embedding)

    } catch(error) {

        console.log(error.name, error.message) // Вывод ошибки в консоль

        throw error // Выброс исключения

    }
}

export async function chat({
    model = 'gpt-3.5-turbo-1106', //'gpt-3.5-turbo-0613',
    max_tokens = 2048, //1024
    temperature = 0,
    messages,
    tools,
    functions,
    function_call = 'auto',
}) {

    let options = { messages, model, temperature, max_tokens }

    if(functions) {

        options.functions = functions

        if(function_call) {
            options.function_call = function_call
        }
    
    }

    if(tools) {

        options.tools = tools

    }

    try {

        const result = await openai.chat.completions.create(options) // Запрос завершения чата

        console.log('chat', result) // Вывод результата чата в консоль

        return result.choices[0] // Возвращение первого варианта завершения

    } catch(error) {
        
        console.log(error.name, error.message) // Вывод ошибки в консоль

        throw error // Выброс исключения

    }

}

export async function whisper({
    file,
    model = 'whisper-1',
    prompt = '',
    response_format = 'json',
    temperature = 0,
    language = 'en',
}) {

    try {

        const resp = await openai.audio.transcriptions.create({
            file,
            model,
            prompt,
            response_format,
            temperature,
            language,
        })

        return resp

    } catch(error) {
        
        console.log(error.name, error.message) // Вывод ошибки в консоль

        throw error // Выброс исключения
        
    }
}

export async function speech({
    model = 'tts-1',
    voice = 'alloy',
    input,
    filename,
}) {

    try {

        const mp3 = await openai.audio.speech.create({
            model,
            voice,
            input,
        })

        const buffer = Buffer.from(await mp3.arrayBuffer());
        await fs.promises.writeFile(filename, buffer);

    } catch(error) {

        console.log(error.name, error.message) // Вывод ошибки в консоль

        throw error // Выброс исключения

    }

}
