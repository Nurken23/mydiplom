import formidable from 'formidable' // Подключение модуля formidable для обработки данных формы
import fs from 'fs' // Подключение модуля fs для работы с файловой системой
import path from 'path' // Подключение модуля path для работы с путями к файлам

import { trim_array, chunkText } from '../../lib/utils' // Подключение вспомогательных функций из utils

import { chat, embedding, speech } from '../../services/openai' // Подключение функций API OpenAI
import MongoDB from '~~/services/mongodb' // Подключение MongoDB для работы с базой данных

// Импорт JSON-файлов с предварительно определенными операциями API
import add_calendar_entry from '../../lib/add_calendar_entry.json'
import get_calendar_entry from '../../lib/get_calendar_entry.json'
import delete_calendar_entry from '../../lib/delete_calendar_entry.json'
import edit_calendar_entry from '../../lib/edit_calendar_entry.json'
import save_new_memory from '../../lib/save_new_memory.json'
import get_info_from_memory from '../../lib/get_info_from_memory.json'

import contacts from '../../assets/contacts.json' // Импорт данных контактов
import user_info from '../../assets/user.json' // Импорт информации о пользователе

export default defineEventHandler(async (event) => {

    const mongoDb = new MongoDB() // Создание экземпляра MongoDB для работы с базой данных
    await mongoDb.initialize() // Инициализация соединения с базой данных

    let selPerson = null // Инициализация переменной для хранения выбранного контакта

    const form = formidable({ multiples: true }) // Создание объекта formidable для обработки данных формы

    let data = await new Promise((resolve, reject) => {
    
        form.parse(event.req, (err, fields, files) => { // Парсинг данных формы
            
            if (err) { // Обработка ошибок при парсинге данных формы
                reject(err)
            }

            selPerson = contacts.items.find(item => item.name.toLowerCase() === fields.name.toLowerCase()) // Поиск контакта в списке контактов
            
            if(fields.tools) { // Если в данных формы присутствует информация о вызываемой функции API
                resolve({ // Возврат объекта с данными для вызова соответствующей функции
                    status: "ok",
                    count: fields.count,
                    response: fields.tools
                })
            } else { // Если вызываемая функция API не указана в данных формы
                resolve({ // Возврат объекта с ошибкой
                    status: "error"
                })
            }

        })

    })

    console.log(`LoopCount: ${data.count}`) // Вывод информации о количестве вызовов функции в консоль

    const MAX_LOOP_COUNT = 5 // Максимальное количество вызовов функции
    if(data.status === "error" || data.count >= MAX_LOOP_COUNT) { // Проверка на ошибки или превышение лимита вызовов функции
        return { // Возврат статуса ошибки
            status: "error"
        }
    }

    console.log("data-response", data.response.tool_calls) // Вывод в консоль информации о вызываемых функциях

    console.log("isArray", Array.isArray(data.response.tool_calls)) // Проверка, является ли вызываемая функция массивом

    if(!Array.isArray(data.response.tool_calls)) { // Если вызываемая функция не является массивом
        return { // Возврат статуса ошибки
            status: "error"
        }
    }

    let function_return = data.response // Сохранение возвращенных данных вызываемой функции
    let api_outputs = [] // Инициализация массива для хранения выходных данных API

    for(const tool of function_return.tool_calls) { // Цикл по каждой вызываемой функции
        
        let function_name = tool.function.name // Получение имени вызываемой функции
        let function_args = JSON.parse(tool.function.arguments) // Получение аргументов вызываемой функции

        let api_output = {} // Инициализация объекта для хранения результата вызываемой функции API

        if(function_name === 'add_calendar_entry') { // Если вызываемая функция - добавление события в календарь

            // Вызов функции API для добавления события в календарь
            const retadd = await mongoDb.addCalendarEntry(function_args)

            // Формирование объекта с результатом вызова функции API
            api_output = { status: retadd.status, message: retadd.status === 'error' ? 'Event already existing' : 'New event added', event: function_args.event }

        } else if(function_name === 'get_calendar_entry') { // Если вызываемая функция - получение события из календаря

            // Вызов функции API для получения событий из календаря по дате
            const calendar_entries = await mongoDb.getCalendarEntryByDate(function_args.date)

            // Формирование объекта с результатом вызова функции API
            api_output = calendar_entries.length > 0 ? { message: `Found ${calendar_entries.length} entries`, items: calendar_entries } : { message: 'No entries found' }

        } else if(function_name === 'edit_calendar_entry') { // Если вызываемая функция - редактирование события в календаре

            // Вызов функции API для редактирования события в календаре
            const editret = await mongoDb.editCalendarEntry(function_args)

            // Обработка результатов вызова функции API и формирование объекта с результатом
            if(!editret) {
                api_output = { message: 'Failed to edit entry', name: function_args.event }
            }

            api_output = editret.modifiedCount > 0 ? { message: 'Entry edited', name: function_args.event } : { message: 'Entry not found' }

        } else if(function_name === 'delete_calendar_entry') { // Если вызываемая функция - удаление события из календаря

            // Вызов функции API для удаления события из календаря
            const delret = await mongoDb.deleteCalendarEntry(function_args)

            // Обработка результатов вызова функции API и формирование объекта с результатом
            if(!delret) {
                api_output = { message: 'Failed to delete entry', name: function_args.event }
            }

            if(delret.message) {
                api_output = delret.message
            }

            api_output = { name: function_args.event, message: delret.deletedCount > 0 ? 'Entry deleted' : 'Failed to delete entry' }

        } else if(function_name === 'save_new_memory') { // Если вызываемая функция - сохранение новой информации в память

            // Формирование текста для встраивания в память
            let embedding_text = `title: ${function_args.memory_title}\n` +
                `detail: ${function_args.memory_detail}\n`
            
            if(function_args.memory_date) embedding_text += `date: ${function_args.memory_date}\n`
            if(function_args.memory_tags) embedding_text += `tags: ${function_args.memory_tags.join(',')}`

            // Разделение текста на части для обработки пакетами
            let maxCharLength = 250 * 4
            let batchSize = 20
            const text_chunks = chunkText({ text: embedding_text, maxCharLength })

            const batches = []; // Инициализация массива для хранения пакетов текста
            for (let i = 0; i < text_chunks.length; i += batchSize) { // Цикл разделения текста на пакеты
                batches.push(text_chunks.slice(i, i + batchSize))
            }

            let text_embeddings = [] // Инициализация массива для хранения вложений текста

            console.log('input', batches) // Вывод в консоль информации о входных данных

            try {
                // Вызов функции API для встраивания текста
                const batch_promises = batches.map((batch) => embedding({ input: batch }))
                const embeddings = (await Promise.all(batch_promises)).flat() // Объединение результатов обработки пакетов текста

                console.log('embeddings', embeddings) // Вывод в консоль информации о вложениях текста

                text_embeddings = embeddings.map((embedding, index) => ({ // Формирование массива с вложениями текста
                    embedding,
                    text: text_chunks[index],
                }))

                await mongoDb.addEntry(text_embeddings) // Добавление вложений текста в базу данных

                api_output = { message: 'New memory saved' } // Формирование объекта с результатом вызова функции API

            } catch(error) { // Обработка ошибок при вызове функции API

                console.log(error.name, error.message) // Вывод информации об ошибке в консоль

                api_output = { message: 'Failed to save memory' } // Формирование объекта с результатом вызова функции API

            }

        } else if(function_name === 'get_info_from_memory') { // Если вызываемая функция - получение информации из памяти

            let text_result = '' // Инициализация переменной для хранения результата

            const record_count = await mongoDb.getCount() // Получение количества записей в базе данных

            if(record_count > 0) { // Если в базе данных есть записи

                try {
                    // Вызов функции API для встраивания запроса
                    const query_embedding_response = await embedding({
                        input: function_args.search.join(','),
                    })

                    const query_embedding = query_embedding_response.length > 0 ? query_embedding_response[0] : [] // Получение вложений запроса

                    text_result = await mongoDb.searchEntry(query_embedding) // Поиск записей по запросу в базе данных

                    api_output = { message: `Retrieved related info for ${function_args.search}`, result: text_result } // Формирование объекта с результатом вызова функции API

                } catch(error) { // Обработка ошибок при вызове функции API

                    console.log(error.name, error.message) // Вывод информации об ошибке в консоль

                    api_output = { message: 'Failed to retrieve info from memory' } // Формирование объекта с результатом вызова функции API

                }

            } else { // Если в базе данных нет записей

                api_output = { message: 'Memory is empty' } // Формирование объекта с результатом вызова функции API

            }

        } else { // Если вызываемая функция не найдена

            api_output = { message: 'function not found' } // Формирование объекта с результатом вызова функции API

        }

        api_outputs.push({ tool_call_id: tool.id, role: 'tool', name: tool.function.name, content: JSON.stringify(api_output, null, 2) }) // Добавление результата вызова функции API в массив выходных данных
        
    }

    if(api_outputs.length === 0) { // Если массив выходных данных пуст

        return { // Возврат статуса ошибки
            status: "error"
        }

    }
    
    console.log('api-output', api_outputs) // Вывод в консоль информации о выходных данных API

    const today = new Date() // Получение текущей даты

    // Формирование системного приветственного сообщения
    let system_prompt = `In this session, we will simulate a voice conversation between two friends.\n\n` +
        
        `# Persona\n` +
        `You will act as ${selPerson.name}.\n` +
        `${selPerson.prompt}\n\n` +
        `Please ensure that your responses are consistent with this persona.\n\n` +

        `# Instructions\n` +
        `The user is talking to you over voice on their phone, and your response will be read out loud with realistic text-to-speech (TTS) technology.\n` +
        `Use natural, conversational language that are clear and easy to follow (short sentences, simple words).\n` +
        `Keep the conversation flowing.\n` +
        `Sometimes the user might just want to chat. Ask them relevant follow-up questions.\n\n` +
        
        `# Functions\n` +
        `You have the following functions that you can call depending on the situation.\n` +
        `add_calendar_entry, to add a new event.\n` +
        `get_calendar_entry, to get the event at a particular date.\n` +
        `edit_calendar_entry, to edit or update existing event.\n` +
        `delete_calendar_entry, to delete an existing event.\n` +
        `save_new_memory, to save new information to memory.\n` +
        `get_info_from_memory, to retrieve information from memory.\n\n` +

        `When you present the result from the function, only mention the relevant details for the user query.\n` +
        `Omit information that is redundant and not relevant to the query.\n` +
        `Always be concise and brief in your replies.\n` +
        `When you received an error status or message on function output, please stop function calling and inform the user.\n\n` +

        `# User\n` +
        `As for me, in this simulation I am known as ${user_info.name}.\n` +
        `${user_info.prompt}\n\n` +
        
        `# Today\n` +
        `Today is ${today}.\n`
        

    let messages = [ // Инициализация массива для хранения сообщений

        { role: 'system', content: system_prompt } // Добавление системного приветственного сообщения в массив

    ]

    let message_items = await mongoDb.getMessages() // Получение сообщений из базы данных

    if(message_items.length > 0) { // Если в базе данных есть сообщения
        
        const history_context = (trim_array(message_items.filter((v) => v.uid === selPerson.id))).map((v) => ({ role: v.role, content: v.content })) // Получение контекста истории сообщений
        
        messages = messages.concat(history_context) // Добавление контекста истории сообщений в массив сообщений

    }
    
    messages.push(function_return) // Добавление результатов вызова функции в массив сообщений

    for(const api_output_item of api_outputs) { // Цикл по каждому элементу выходных данных API
        messages.push(api_output_item) // Добавление элемента в массив сообщений
    }

    let result_message = null // Инициализация переменной для хранения результирующего сообщения
    let result_file = null // Инициализация переменной для хранения ссылки на аудиофайл

    try {

        let result = await chat({ // Вызов функции API для общения с ботом
            temperature: 0.3,
            messages,
            tools: [
                { type: 'function', function: add_calendar_entry },
                { type: 'function', function: get_calendar_entry },
                { type: 'function', function: edit_calendar_entry },
                { type: 'function', function: delete_calendar_entry },
                { type: 'function', function: save_new_memory },
                { type: 'function', function: get_info_from_memory }
            ]
        })

        result_message = result.message // Сохранение результирующего сообщения
        
        console.log('assistant2', result_message) // Вывод в консоль информации о результирующем сообщении

        if(result.message.content) { // Если результирующее сообщение содержит текст
            
            const new_botmessage = { uid: selPerson.id, role: 'assistant', content: result.message.content } // Создание нового сообщения от бота
            await mongoDb.addMessage(new_botmessage) // Добавление сообщения в базу данных

            let filename = 'voice' + Date.now() + Math.round(Math.random() * 100000) + '.mp3' // Генерация имени аудиофайла
            const audioFile = path.join('public', 'upload', filename) // Формирование пути к файлу
            
            let text_speak = result.message.content.replace(/\n/g, '') // Удаление символов переноса строки из текста сообщения
            
            await speech({ // Вызов функции API для генерации аудиофайла из текста сообщения
                voice: selPerson.voice.name || 'alloy',
                input: text_speak,
                filename: audioFile,
            })

            result_file = `/upload/${filename}` // Формирование ссылки на аудиофайл
            
        }

    } catch(error) { // Обработка ошибок

        console.log(error.name, error.message) // Вывод информации об ошибке в консоль

    }

    return { // Возврат результата обработки события
        status: "ok",
        output: result_message, // Результирующее сообщение
        file: result_file, // Ссылка на аудиофайл
    }

})
