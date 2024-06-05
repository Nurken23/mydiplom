import MongoDB from '~~/services/mongodb' // Подключение модуля MongoDB для работы с базой данных

export default defineEventHandler(async (event) => {

    const mongoDb = new MongoDB() // Создание экземпляра MongoDB
    await mongoDb.initialize() // Инициализация соединения с базой данных

    let message_items = await mongoDb.getMessages() // Получение сообщений из базы данных

    return { // Возврат списка сообщений
        items: message_items
    }

})
