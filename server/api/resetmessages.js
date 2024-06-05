import MongoDB from '~~/services/mongodb' // Подключение модуля MongoDB для работы с базой данных

export default defineEventHandler(async (event) => {

    const { id } = await readBody(event) // Получение идентификатора из тела запроса

    const mongoDb = new MongoDB() // Создание экземпляра MongoDB
    await mongoDb.initialize() // Инициализация соединения с базой данных

    let retdel = await mongoDb.deleteMessages(id) // Удаление сообщений из базы данных по идентификатору

    return { // Возврат статуса операции удаления
        status: retdel.deletedCount > 0 ? 'ok' : 'error'
    }

})
