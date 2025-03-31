const fs = require('fs');
const path = require('path');

class InventorySystem {
    constructor() {
        this.invsysPath = './files/invsysstat';
        this.basePath = './files';
    }

    // Проверка включена ли система инвентаря в канале
    isSystemEnabled(guildId, channelId) {
        const filePath = this.getChannelStatusPath(guildId, channelId);
        return fs.existsSync(filePath);
    }

    // Переключение системы инвентаря
    toggleSystem(guildId, channelId) {
        const filePath = this.getChannelStatusPath(guildId, channelId);
        
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return false;
        } else {
            this.ensureDirectoryExists(filePath);
            fs.writeFileSync(filePath, 'enabled');
            return true;
        }
    }

    // Регистрация GM
    registerGM(guildId, channelId, userId) {
        const gmPath = this.getGMPath(guildId, channelId);
        this.ensureDirectoryExists(gmPath);
        
        const gms = this.getGMs(guildId, channelId);
        if (!gms.includes(userId)) {
            gms.push(userId);
            fs.writeFileSync(gmPath, JSON.stringify(gms));
        }
    }

    // Удаление GM
    unregisterGM(guildId, channelId, userId) {
        const gmPath = this.getGMPath(guildId, channelId);
        const gms = this.getGMs(guildId, channelId);
        
        const index = gms.indexOf(userId);
        if (index !== -1) {
            gms.splice(index, 1);
            if (gms.length === 0) {
                fs.unlinkSync(gmPath);
            } else {
                fs.writeFileSync(gmPath, JSON.stringify(gms));
            }
        }
    }

    // Проверка является ли пользователь GM
    isGM(guildId, channelId, userId) {
        const gms = this.getGMs(guildId, channelId);
        return gms.includes(userId);
    }

    // Добавление предметов в инвентарь
    addItems(guildId, channelId, userId, items) {
        const invPath = this.getInventoryPath(guildId, channelId, userId);
        let inventory = this.getInventory(guildId, channelId, userId);
        
        for (const [item, quantity] of Object.entries(items)) {
            if (inventory[item]) {
                inventory[item] += quantity;
            } else {
                inventory[item] = quantity;
            }
        }
        
        this.saveInventory(guildId, channelId, userId, inventory);
    }

    // Удаление предметов из инвентаря
    removeItems(guildId, channelId, userId, items) {
        const invPath = this.getInventoryPath(guildId, channelId, userId);
        let inventory = this.getInventory(guildId, channelId, userId);
        let changed = false;
        
        for (const [item, quantity] of Object.entries(items)) {
            if (inventory[item]) {
                inventory[item] -= quantity;
                
                if (inventory[item] <= 0) {
                    delete inventory[item];
                }
                
                changed = true;
            }
        }
        
        if (changed) {
            if (Object.keys(inventory).length === 0) {
                fs.unlinkSync(invPath);
            } else {
                this.saveInventory(guildId, channelId, userId, inventory);
            }
        }
    }

    // Полное удаление предмета
    deleteItems(guildId, channelId, userId, items) {
        const invPath = this.getInventoryPath(guildId, channelId, userId);
        let inventory = this.getInventory(guildId, channelId, userId);
        let changed = false;
        
        for (const item of items) {
            if (inventory[item]) {
                delete inventory[item];
                changed = true;
            }
        }
        
        if (changed) {
            if (Object.keys(inventory).length === 0) {
                fs.unlinkSync(invPath);
            } else {
                this.saveInventory(guildId, channelId, userId, inventory);
            }
        }
    }

    // Передача предметов между игроками
    transferItems(guildId, channelId, fromUserId, toUserId, items) {
        const fromInventory = this.getInventory(guildId, channelId, fromUserId);
        let toInventory = this.getInventory(guildId, channelId, toUserId);
        let fromChanged = false;
        
        // Проверка наличия предметов у отправителя
        for (const [item, quantity] of Object.entries(items)) {
            if (!fromInventory[item] || fromInventory[item] < quantity) {
                throw new Error(`Недостаточно предметов: ${item}`);
            }
        }
        
        // Удаление у отправителя
        for (const [item, quantity] of Object.entries(items)) {
            fromInventory[item] -= quantity;
            
            if (fromInventory[item] <= 0) {
                delete fromInventory[item];
            }
            
            fromChanged = true;
        }
        
        // Добавление получателю
        for (const [item, quantity] of Object.entries(items)) {
            if (toInventory[item]) {
                toInventory[item] += quantity;
            } else {
                toInventory[item] = quantity;
            }
        }
        
        // Сохранение изменений
        if (fromChanged) {
            if (Object.keys(fromInventory).length === 0) {
                fs.unlinkSync(this.getInventoryPath(guildId, channelId, fromUserId));
            } else {
                this.saveInventory(guildId, channelId, fromUserId, fromInventory);
            }
        }
        
        this.saveInventory(guildId, channelId, toUserId, toInventory);
    }

    // Получение инвентаря игрока
    getInventory(guildId, channelId, userId) {
        const invPath = this.getInventoryPath(guildId, channelId, userId);
        
        if (fs.existsSync(invPath)) {
            return JSON.parse(fs.readFileSync(invPath));
        }
        
        return {};
    }

    // Получение списка GM
    getGMs(guildId, channelId) {
        const gmPath = this.getGMPath(guildId, channelId);
        
        if (fs.existsSync(gmPath)) {
            return JSON.parse(fs.readFileSync(gmPath));
        }
        
        return [];
    }

    // Сохранение инвентаря
    saveInventory(guildId, channelId, userId, inventory) {
        const invPath = this.getInventoryPath(guildId, channelId, userId);
        this.ensureDirectoryExists(invPath);
        fs.writeFileSync(invPath, JSON.stringify(inventory));
    }

    // Вспомогательные методы для путей
    getChannelStatusPath(guildId, channelId) {
        return path.join(this.invsysPath, `${guildId}_${channelId}.json`);
    }

    getGMPath(guildId, channelId) {
        return path.join(this.basePath, `${guildId}_${channelId}`, 'gm.json');
    }

    getInventoryPath(guildId, channelId, userId) {
        return path.join(this.basePath, `${guildId}_${channelId}`, 'inventory', `${userId}.json`);
    }

    ensureDirectoryExists(filePath) {
        const dirname = path.dirname(filePath);
        if (!fs.existsSync(dirname)) {
            fs.mkdirSync(dirname, { recursive: true });
        }
    }

    // Парсинг аргументов предметов
    parseItemsArgs(args) {
        const items = {};
        
        for (const arg of args) {
            if (arg.includes('=')) {
                const [item, quantityStr] = arg.split('=');
                const quantity = parseInt(quantityStr);
                
                if (!isNaN(quantity) && quantity > 0) {
                    items[item.trim()] = quantity;
                }
            }
        }
        
        return items;
    }

    // Парсинг аргументов для delete
    parseDeleteArgs(args) {
        return args.map(arg => arg.trim()).filter(arg => arg.length > 0);
    }
}

module.exports = new InventorySystem();
