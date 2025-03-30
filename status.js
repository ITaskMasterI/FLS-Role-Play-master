const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const STATUS_DURATION = 12 * 60 * 60 * 1000; // 12 часов
const STATUS_DIR = './statuses';

// Создаем папку для статусов, если её нет
if (!fs.existsSync(STATUS_DIR)) {
    fs.mkdirSync(STATUS_DIR);
}

const activeTimers = new Map();

function getStatusFilePath(channelId) {
    return path.join(STATUS_DIR, `${channelId}.json`);
}

function loadChannelStatuses(channelId) {
    const filePath = getStatusFilePath(channelId);
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error(`Ошибка загрузки статусов для канала ${channelId}:`, error);
    }
    return {};
}

function saveChannelStatuses(channelId, statuses) {
    const filePath = getStatusFilePath(channelId);
    try {
        // Удаляем файл если нет статусов ready
        const hasReady = Object.values(statuses).some(s => s.status === 'ready');
        if (!hasReady) {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            return;
        }
        
        fs.writeFileSync(filePath, JSON.stringify(statuses, null, 2));
    } catch (error) {
        console.error(`Ошибка сохранения статусов для канала ${channelId}:`, error);
    }
}

function setStatus(userId, channelId, status) {
    const statuses = loadChannelStatuses(channelId);
    const userKey = userId.toString();
    const timerKey = `${channelId}_${userId}`;
    
    // Очищаем предыдущий таймер
    if (activeTimers.has(timerKey)) {
        clearTimeout(activeTimers.get(timerKey));
        activeTimers.delete(timerKey);
    }

    if (status === 'notready') {
        // Полное удаление данных пользователя
        if (statuses[userKey]) {
            delete statuses[userKey];
            saveChannelStatuses(channelId, statuses);
        }
    } else if (status === 'ready') {
        // Устанавливаем новый статус с таймером
        statuses[userKey] = { 
            status: 'ready',
            timestamp: Date.now(),
            username: null // Заполнится при проверке
        };

        const timer = setTimeout(() => {
            const currentStatuses = loadChannelStatuses(channelId);
            if (currentStatuses[userKey] && currentStatuses[userKey].status === 'ready') {
                delete currentStatuses[userKey]; // Полное удаление по таймеру
                saveChannelStatuses(channelId, currentStatuses);
            }
            activeTimers.delete(timerKey);
        }, STATUS_DURATION);
        
        activeTimers.set(timerKey, timer);
        saveChannelStatuses(channelId, statuses);
    }
}

async function checkReadyStatuses(message) {
    const channelId = message.channel.id;
    const statuses = loadChannelStatuses(channelId);
    const readyUsers = [];
    
    for (const [userId, statusData] of Object.entries(statuses)) {
        if (statusData.status === 'ready') {
            try {
                const user = await message.guild.members.fetch(userId);
                readyUsers.push(user.displayName);
                // Обновляем имя пользователя
                statuses[userId].username = user.displayName;
            } catch (error) {
                console.error(`Пользователь не найден: ${userId}`);
                delete statuses[userId]; // Удаляем если пользователь не найден
            }
        }
    }
    
    saveChannelStatuses(channelId, statuses);
    return readyUsers;
}

function restoreTimers() {
    if (!fs.existsSync(STATUS_DIR)) return;

    const files = fs.readdirSync(STATUS_DIR);
    
    files.forEach(file => {
        if (file.endsWith('.json')) {
            const channelId = file.replace('.json', '');
            const statuses = loadChannelStatuses(channelId);
            
            for (const [userId, statusData] of Object.entries(statuses)) {
                if (statusData.status === 'ready') {
                    const elapsed = Date.now() - statusData.timestamp;
                    const remaining = STATUS_DURATION - elapsed;
                    
                    if (remaining > 0) {
                        const timerKey = `${channelId}_${userId}`;
                        const timer = setTimeout(() => {
                            const currentStatuses = loadChannelStatuses(channelId);
                            if (currentStatuses[userId] && currentStatuses[userId].status === 'ready') {
                                delete currentStatuses[userId]; // Полное удаление
                                saveChannelStatuses(channelId, currentStatuses);
                            }
                            activeTimers.delete(timerKey);
                        }, remaining);
                        
                        activeTimers.set(timerKey, timer);
                    } else {
                        // Время вышло - удаляем
                        delete statuses[userId];
                        saveChannelStatuses(channelId, statuses);
                    }
                }
            }
        }
    });
}

module.exports = {
    name: 'status',
    description: 'Управление статусами готовности',
    
    async execute(message, args) {
        if (args.length === 0) {
            return message.reply('Используйте: !status <ready/notready/check>');
        }

        const subCommand = args[0].toLowerCase();
        const userId = message.author.id;
        const channelId = message.channel.id;

        switch (subCommand) {
            case 'ready':
                setStatus(userId, channelId, 'ready');
                return message.reply('✅ Статус установлен: Готов (автосброс через 12 часов)');
                
            case 'notready':
                setStatus(userId, channelId, 'notready');
                return message.reply('✅ Статус установлен: Не готов');
                
            case 'check':
                const readyUsers = await checkReadyStatuses(message);
                const embed = new EmbedBuilder()
                    .setTitle('Статусы готовности')
                    .setColor(0x00FF00)
                    .setDescription(readyUsers.length > 0 
                        ? `✅ Готовы (${readyUsers.length}):\n${readyUsers.join('\n')}`
                        : '❌ Нет готовых участников');
                return message.channel.send({ embeds: [embed] });
                
            default:
                return message.reply('❌ Неверная команда. Используйте: !status ready/notready/check');
        }
    },
    
    // Вспомогательные функции
    setStatus,
    getStatus: (userId, channelId) => {
        const statuses = loadChannelStatuses(channelId);
        return statuses[userId]?.status || 'notready';
    },
    checkReadyStatuses,
    restoreTimers
};
