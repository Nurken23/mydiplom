import formidable from 'formidable' // Подключение модуля formidable для обработки формы
import { exec } from 'child_process' // Подключение функции exec из модуля child_process для выполнения команд в оболочке
import fs from 'fs' // Подключение модуля fs для работы с файловой системой
import path from 'path' // Подключение модуля path для работы с путями к файлам и директориям

import { chat, whisper, speech } from '../../services/openai' // Подключение функций chat, whisper, speech из модуля openai для взаимодействия с OpenAI API
import MongoDB from '~~/services/mongodb' // Подключение модуля MongoDB для работы с базой данных

import { trim_array } from '../../lib/utils' // Подключение функции trim_array из утилитарного модуля utils

import add_calendar_entry from '../../lib/add_calendar_entry.json' // Импорт данных о функции добавления записи в календарь
import get_calendar_entry from '../../lib/get_calendar_entry.json' // Импорт данных о функции получения записи из календаря
import delete_calendar_entry from '../../lib/delete_calendar_entry.json' // Импорт данных о функции удаления записи из календаря
import edit_calendar_entry from '../../lib/edit_calendar_entry.json' // Импорт данных о функции редактирования записи в календаре

import save_new_memory from '../../lib/save_new_memory.json' // Импорт данных о функции сохранения новой информации в память
import get_info_from_memory from '../../lib/get_info_from_memory.json' // Импорт данных о функции получения информации из памяти

import contacts from '../../assets/contacts.json' // Импорт контактов
import user_info from '../../assets/user.json' // Импорт информации о пользователе

export default defineEventHandler(async (event) => { // Экспорт обработчика событий по умолчанию

    const mongoDb = new MongoDB() // Создание экземпляра MongoDB
    await mongoDb.initialize() // Инициализация соединения с базой данных

    let selPerson = null // Инициализация переменной для выбранного пользователя

    const form = formidable({ multiples: true }) // Создание экземпляра формы formidable

    let data = await new Promise((resolve, reject) => { // Создание обещания для обработки данных формы
    
        form.parse(event.req, (err, fields, files) => { // Разбор данных формы
        
            if (err) { // Если произошла ошибка
                reject(err) // Отклонить обещание с ошибкой
            }

            let isAudioExist = true // Инициализация переменной для наличия аудиофайла

            if (!files.file) { // Если файл не загружен
                isAudioExist = false // Установить флаг отсутствия аудиофайла
            }
            
            selPerson = contacts.items.find(item => item.name.toLowerCase() === fields.name.toLowerCase()) // Выбор пользователя из контактов по имени

            if(isAudioExist) { // Если аудиофайл загружен

                if (files.file.mimetype.startsWith("application/octet-stream")) { // Если MIME-тип файла является аудио
                    // Генерация уникального имени файла
                    let filename = Date.now() + Math.round(Math.random() * 100000) + files.file.originalFilename
                    let newPath = `${path.join("public", "upload", filename)}`
                    let oldPath = files.file.filepath
                    
                    // Копирование файла на новый путь
                    fs.copyFileSync(oldPath, newPath)
                    
                    resolve({
                        status: "ok",
                        file: filename,
                    })
    
                } else {
    
                    resolve({
                        status: "error",
                        message: "File not audio data",
                    })
    
                }

            } else { // Если аудиофайл не загружен

                resolve({
                    status: "ok",
                    text: fields.message // Возврат текстового сообщения
                })

            }

        })

    })

    if(data.status === "error") { // Если произошла ошибка при загрузке файла

        return {
            status: "error"
        }

    }

    let user_message = data.text ? data.text : '' // Инициализация текстового сообщения

    if(data.file) { // Если загружен аудиофайл

        const outputDir = path.join("public", "upload") // Путь к директории для выходных файлов
        const filename = `${outputDir}/${data.file}` // Путь к исходному аудиофайлу
        const outFile = `${outputDir}/out-${data.file}` // Путь к выходному аудиофайлу
        
        // Удаление тишины из аудиофайла
        const retval = await new Promise((resolve, reject) => {
            // Команда для выполнения в оболочке для удаления тишины из аудиофайла
            const sCommand = `ffmpeg -i ${filename} -af silenceremove=stop_periods=-1:stop_duration=1:stop_threshold=-50dB ${outFile}`
    
            // Выполнение команды в оболочке
            exec(sCommand, (error, stdout, stderr) => {
                
                if (error) { // Если произошла ошибка
                    resolve({
                        status: 'error',
                    })
    
                } else { // Если успешно выполнено
                    resolve({
                        status: 'success',
                        error: stderr,
                        out: stdout,
                    })
    
                }
                
            })
    
        })

        let sfilename = filename // Установка пути к файлу по умолчанию

        if(retval.status === 'success') { // Если успешно удалена тишина из аудиофайла
            sfilename = outFile // Установка пути к выходному файлу
        }

        let sizeKB = 0 // Инициализация переменной для размера файла в килобайтах

        try {
            // Получение информации о размере файла
            const stats = fs.statSync(sfilename)
            const fileSizeInBytes = stats.size
            sizeKB = fileSizeInBytes / 1024 // Размер файла в килобайтах

        } catch (err) {
            // Вывод ошибки в случае возникновения
            console.error(err.name, err.message)

        }

        if(sizeKB < 16) { // Если размер файла меньше 16 КБ

            return {
                status: 'error' // Возврат статуса ошибки
            }

        }
        
        const lang = selPerson.hasOwnProperty("lang") && selPerson.lang ? selPerson.lang : "en" // Язык сообщения
        
        // Транскрипция аудиофайла
        const transcription = await whisper({
            file: fs.createReadStream(sfilename), // Чтение аудиофайла
            language: lang, // Язык сообщения
            response_format: 'text', // Формат ответа - текст
            temperature: 0, // Температура генерации текста
        })

        if(transcription.trim().length === 0) { // Если транскрипция пуста

            return {
                status: "error" // Возврат статуса ошибки
            }

        }

        user_message = transcription // Установка транскрипции как текстового сообщения

    }

    if(user_message.trim().length === 0) { // Если текстовое сообщение пусто

        return {
            status: "error" // Возврат статуса ошибки
        }

    }

    const today = new Date() // Текущая дата и время

    // Формирование системного промпта для диалога
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
        `Always be concise and brief in your replies.\n\n` +

        `# User\n` +
        `As for me, in this simulation I am known as ${user_info.name}.\n` +
        `${user_info.prompt}\n\n` +
        
        `# Today\n` +
        `Today is ${today}.\n`
        

    let messages = [
        { role: 'system', content: system_prompt } // Добавление системного промпта в список сообщений
    ]

    let message_items = await mongoDb.getMessages() // Получение сообщений из базы данных

    if(message_items.length > 0) { // Если есть сообщения в базе данных

        const history_context = (trim_array(message_items.filter((v) => v.uid === selPerson.id))).map((v) => ({ role: v.role, content: v.content })) // Формирование контекста истории сообщений

        messages = messages.concat(history_context) // Добавление истории сообщений к текущему диалогу

    }

    console.log('user', user_message, (new Date()).toLocaleTimeString()) // Вывод сообщения пользователя в консоль

    const new_usermessage = { uid: selPerson.id, role: 'user', content: user_message } // Создание нового сообщения пользователя
    await mongoDb.addMessage(new_usermessage) // Добавление сообщения пользователя в базу данных

    messages.push({ role: new_usermessage.role, content: new_usermessage.content }) // Добавление сообщения пользователя к текущему диалогу

    let result_message = null // Инициализация переменной для результирующего сообщения
    let result_file = null // Инициализация переменной для результирующего аудиофайла

    try {
        
        let result = await chat({ // Генерация ответа на сообщение пользователя
            temperature: 0.3, // Температура генерации текста
            messages, // Список сообщений в диалоге
            tools: [
                { type: 'function', function: add_calendar_entry }, // Функция добавления записи в календарь
                { type: 'function', function: get_calendar_entry }, // Функция получения записи из календаря
                { type: 'function', function: edit_calendar_entry }, // Функция редактирования записи в календаре
                { type: 'function', function: delete_calendar_entry }, // Функция удаления записи из календаря
                { type: 'function', function: save_new_memory }, // Функция сохранения новой информации в память
                { type: 'function', function: get_info_from_memory } // Функция получения информации из памяти
            ]
        })
        

        result_message = result.message // Получение ответного сообщения

        console.log('assistant1', result_message) // Вывод ответного сообщения в консоль
        
        if(result.message.content) { // Если есть контент в ответном сообщении

            const new_botmessage = { uid: selPerson.id, role: 'assistant', content: result.message.content } // Создание нового сообщения ассистента
            await mongoDb.addMessage(new_botmessage) // Добавление сообщения ассистента в базу данных

            let filename = 'voice' + Date.now() + Math.round(Math.random() * 100000) + '.mp3' // Генерация имени аудиофайла
            const audioFile = path.join('public', 'upload', filename) // Путь к аудиофайлу

            let text_speak = result.message.content.replace(/\n/g, '') // Форматирование текста для синтеза речи
            
            await speech({ // Синтез речи
                voice: selPerson.voice.name || 'alloy', // Голос для синтеза
                input: text_speak, // Вводной текст для синтеза
                filename: audioFile, // Имя аудиофайла
            })

            result_file = `/upload/${filename}` // Установка пути к аудиофайлу
            
        }

    } catch(error) { // Обработка ошибок
        console.log(error.name, error.message) // Вывод ошибки в консоль

    }
    
    return { // Возврат результата выполнения обработчика
        status: "ok", // Статус выполнения - успешно
        output: result_message, // Вывод результата работы
        file: result_file, // Путь к аудиофайлу, если он сгенерирован
    }

})
