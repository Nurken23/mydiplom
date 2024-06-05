// Обработчик событий для редактирования данных, полученных из формы
import formidable from 'formidable'; // Импорт библиотеки formidable для обработки форм
import fs from 'fs'; // Импорт модуля fs для работы с файловой системой
import path from 'path'; // Импорт модуля path для работы с путями к файлам

export default defineEventHandler(async (event) => {

    const form = formidable({ multiples: true }); // Создание экземпляра формы с возможностью загрузки нескольких файлов

    let data = await new Promise((resolve, reject) => {
    
        form.parse(event.req, (err, fields) => { // Парсинг данных формы из запроса
            
            if (err) {
                reject(err); // В случае ошибки, отклонить промис с ошибкой
            }

            resolve({ // В случае успеха, разрешить промис с данными формы
                status: "ok",
                type: fields.type,
                id: fields.id,
                name: fields.name,
                prompt: fields.prompt,
            });

        });

    });

    let error_flag = false; // Флаг ошибки, по умолчанию false

    const filename = data.type === 'user' ? path.join("assets", "user.json") : path.join("assets", "contacts.json"); // Путь к файлу на основе типа данных

    try {
        
        let raw_data = fs.readFileSync(filename, 'utf8'); // Чтение содержимого файла
        let objdata = JSON.parse(raw_data); // Преобразование содержимого файла в объект

        if(data.type === 'user') { // Если тип данных - пользователь

            objdata.name = data.name; // Обновление имени в объекте данных
            objdata.prompt = data.prompt; // Обновление подсказки в объекте данных

        } else { // Если тип данных - контакты

            objdata.items = objdata.items.map((item) => { // Обновление элемента в массиве контактов
                return {
                    ...item,
                    name: item.id === data.id ? data.name : item.name, // Если ID совпадает, обновить имя
                    prompt: item.id === data.id ? data.prompt : item.prompt, // Если ID совпадает, обновить подсказку
                };
            });

        }

        raw_data = JSON.stringify(objdata); // Преобразование объекта данных обратно в JSON

        fs.writeFileSync(filename, raw_data); // Запись обновленных данных в файл

    } catch(error) {

        console.log(error.name, error.message); // Вывод ошибки в консоль

        error_flag = true; // Установка флага ошибки в true

    }

    return {
        status: error_flag ? "error" : "ok", // Возвращение статуса операции в зависимости от наличия ошибки
    };

})
