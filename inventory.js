const fs = require("fs");
const path = require("path");
const { PermissionsBitField } = require("discord.js");

const INVENTORY_PATH = "./files/inventory";
const SETTINGS_FILE = path.join(INVENTORY_PATH, "settings.json");

if (!fs.existsSync(INVENTORY_PATH)) {
  fs.mkdirSync(INVENTORY_PATH, { recursive: true });
}

let inventorySettings = {};
if (fs.existsSync(SETTINGS_FILE)) {
  try {
    inventorySettings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
  } catch (err) {
    console.error("Ошибка загрузки настроек:", err);
  }
}

function saveSettings() {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(inventorySettings, null, 2));
  } catch (err) {
    console.error("Ошибка сохранения настроек:", err);
  }
}

function loadData(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf8");
      return JSON.parse(data);
    }
    return {};
  } catch (err) {
    console.error(`Ошибка загрузки данных из ${filePath}:`, err);
    return {};
  }
}

function saveData(filePath, data) {
  try {
    if (Object.keys(data).length === 0) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } else {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.error(`Ошибка сохранения данных в ${filePath}:`, err);
  }
}

function isInventoryEnabled(channelId) {
  return inventorySettings[channelId] === true;
}

function isGM(channelId, userId) {
  const gmFile = path.join(INVENTORY_PATH, `${channelId}_gm.json`);
  const gmData = loadData(gmFile);
  return gmData[userId] === true;
}

// Включение/отключение системы инвентаря
function setInventorySystem(msg) {
  try {
    if (!msg.member) {
      return msg.reply("⛔ Команда доступна только на сервере.");
    }

    const channelId = msg.channel.isThread() ? msg.channel.parentId : msg.channel.id;

    // Проверка прав: администратор или модератор
    const isAdmin = msg.member.permissions.has(PermissionsBitField.Flags.Administrator);
    const isModerator = msg.channel.permissionsFor(msg.member).has(PermissionsBitField.Flags.ManageChannels);

    if (!isAdmin && !isModerator) {
      return msg.reply("⛔ У вас нет прав для изменения системы инвентаря.");
    }

    // Включение/отключение системы
    inventorySettings[channelId] = !inventorySettings[channelId];
    saveSettings();
    return msg.reply(
      inventorySettings[channelId]
        ? "✅ Система инвентаря включена."
        : "❌ Система инвентаря отключена."
    );
  } catch (err) {
    console.error("Ошибка в setInventorySystem:", err);
  }
}

// Показать инвентарь (только для себя)
function showInventory(msg) {
  try {
    const channelId = msg.channel.isThread() ? msg.channel.parentId : msg.channel.id;
    if (!isInventoryEnabled(channelId)) {
      return msg.reply("⚠️ Инвентарь не активирован (`!setinvsys`).");
    }

    const inventoryFile = path.join(INVENTORY_PATH, `${channelId}_${msg.author.id}.json`);
    const inventory = loadData(inventoryFile);

    if (Object.keys(inventory).length === 0) {
      return msg.reply("📦 Ваш инвентарь пуст.");
    }

    // Формируем список предметов
    const inventoryList = Object.entries(inventory)
      .map(([item, count]) => `- **${item}**: ${count} шт.`)
      .join("\n");

    return msg.reply(`📦 **Ваш инвентарь:**\n${inventoryList}`);
  } catch (err) {
    console.error("Ошибка в showInventory:", err);
  }
}

// Передать предмет (для игроков)
function giveItem(msg, args) {
  try {
    const channelId = msg.channel.isThread() ? msg.channel.parentId : msg.channel.id;
    if (!isInventoryEnabled(channelId)) {
      return msg.reply("⚠️ Инвентарь не активирован (`!setinvsys`).");
    }

    // Проверка, указан ли получатель
    if (!msg.mentions.users.size) {
      return msg.reply("⚠️ Укажите пользователя через `@`.");
    }

    const targetUser = msg.mentions.users.first(); // Получатель
    const targetId = targetUser.id;

    // Проверка, что игрок не пытается передать предмет самому себе
    if (targetId === msg.author.id) {
      return msg.reply("⛔ Вы не можете передать предмет самому себе.");
    }

    // Убираем упоминание пользователя из аргументов
    const cleanedArgs = args.filter(arg => !arg.startsWith("<@"));
    if (cleanedArgs.length < 2) {
      return msg.reply("⚠️ Используйте: `!inv give @user предмет количество`.");
    }

    // Название предмета (все аргументы, кроме последнего)
    const itemName = cleanedArgs.slice(0, -1).join(" ").trim();

    // Количество (последний аргумент)
    const count = parseInt(cleanedArgs[cleanedArgs.length - 1]);
    if (isNaN(count) || count <= 0) {
      return msg.reply("⚠️ Количество должно быть положительным числом.");
    }

    if (!itemName) {
      return msg.reply("⚠️ Укажите название предмета.");
    }

    // Инвентарь отправителя
    const senderInventoryFile = path.join(INVENTORY_PATH, `${channelId}_${msg.author.id}.json`);
    const senderInventory = loadData(senderInventoryFile);

    // Проверка, есть ли у отправителя достаточно предметов
    if (!senderInventory[itemName] || senderInventory[itemName] < count) {
      return msg.reply(`❌ У вас недостаточно предметов **${itemName}**.`);
    }

    // Инвентарь получателя
    const targetInventoryFile = path.join(INVENTORY_PATH, `${channelId}_${targetId}.json`);
    const targetInventory = loadData(targetInventoryFile);

    // Уменьшаем количество у отправителя
    senderInventory[itemName] -= count;
    if (senderInventory[itemName] <= 0) {
      delete senderInventory[itemName]; // Удаляем предмет, если количество стало 0
    }

    // Увеличиваем количество у получателя
    targetInventory[itemName] = (targetInventory[itemName] || 0) + count;

    // Сохраняем изменения
    saveData(senderInventoryFile, senderInventory);
    saveData(targetInventoryFile, targetInventory);

    return msg.reply(
      `✅ Вы передали **${count}**x **${itemName}** игроку **${targetUser.username}**.`
    );
  } catch (err) {
    console.error("Ошибка в giveItem:", err);
  }
}

// Добавить предмет (для ГМов)
function addItem(msg, args) {
  try {
    const channelId = msg.channel.isThread() ? msg.channel.parentId : msg.channel.id;
    if (!isInventoryEnabled(channelId)) {
      return msg.reply("⚠️ Инвентарь не активирован (`!setinvsys`).");
    }

    // Проверка, является ли пользователь ГМом
    if (!isGM(channelId, msg.author.id)) {
      return msg.reply("⛔ Только ГМ может добавлять предметы.");
    }

    if (!msg.mentions.users.size) {
      return msg.reply("⚠️ Укажите пользователя через `@`.");
    }

    const target = msg.mentions.users.first();
    const targetId = target.id;
    const inventoryFile = path.join(INVENTORY_PATH, `${channelId}_${targetId}.json`);
    let inventory = loadData(inventoryFile);

    if (args.length < 2) {
      return msg.reply("⚠️ Укажите название предмета и количество.");
    }

    const count = parseInt(args.pop());
    if (isNaN(count) || count <= 0) {
      return msg.reply("⚠️ Количество должно быть положительным числом.");
    }

    // Убираем упоминание пользователя из названия предмета
    const itemName = args.join(" ").trim().replace(/<@\d+>/g, "").trim();

    if (!itemName) {
      return msg.reply("⚠️ Название предмета не может быть пустым.");
    }

    inventory[itemName] = (inventory[itemName] || 0) + count;

    saveData(inventoryFile, inventory);
    return msg.reply(`✅ Добавлено **${count}**x **${itemName}** игроку **${target.username}**.`);
  } catch (err) {
    console.error("Ошибка в addItem:", err);
  }
}

// Удалить предмет (для ГМов)
function removeItem(msg, args) {
  try {
    const channelId = msg.channel.isThread() ? msg.channel.parentId : msg.channel.id;
    if (!isInventoryEnabled(channelId)) {
      return msg.reply("⚠️ Инвентарь не активирован (`!setinvsys`).");
    }

    // Проверка, является ли пользователь ГМом
    if (!isGM(channelId, msg.author.id)) {
      return msg.reply("⛔ Только ГМ может удалять предметы.");
    }

    if (!msg.mentions.users.size) {
      return msg.reply("⚠️ Укажите пользователя через `@`.");
    }

    const target = msg.mentions.users.first();
    const targetId = target.id;
    const inventoryFile = path.join(INVENTORY_PATH, `${channelId}_${targetId}.json`);
    let inventory = loadData(inventoryFile);

    if (args.length < 2) {
      return msg.reply("⚠️ Укажите название предмета и количество.");
    }

    const count = parseInt(args.pop());
    if (isNaN(count) || count <= 0) {
      return msg.reply("⚠️ Количество должно быть положительным числом.");
    }

    // Убираем упоминание пользователя из названия предмета
    const itemName = args.join(" ").trim().replace(/<@\d+>/g, "").trim();

    if (!inventory[itemName] || inventory[itemName] < count) {
      return msg.reply("❌ У игр��ка недостаточно предметов.");
    }

    inventory[itemName] -= count;
    if (inventory[itemName] <= 0) {
      delete inventory[itemName];
    }

    saveData(inventoryFile, inventory);
    return msg.reply(`✅ Удалено **${count}**x **${itemName}** у игрока **${target.username}**.`);
  } catch (err) {
    console.error("Ошибка в removeItem:", err);
  }
}

// Полностью удалить предмет (для ГМов)
function deleteItem(msg, args) {
  try {
    const channelId = msg.channel.isThread() ? msg.channel.parentId : msg.channel.id;
    if (!isInventoryEnabled(channelId)) {
      return msg.reply("⚠️ Инвентарь не активирован (`!setinvsys`).");
    }

    // Проверка, является ли пользователь ГМом
    if (!isGM(channelId, msg.author.id)) {
      return msg.reply("⛔ Только ГМ может удалять предметы.");
    }

    if (!msg.mentions.users.size) {
      return msg.reply("⚠️ Укажите пользователя через `@`.");
    }

    const target = msg.mentions.users.first();
    const targetId = target.id;
    const inventoryFile = path.join(INVENTORY_PATH, `${channelId}_${targetId}.json`);
    let inventory = loadData(inventoryFile);

    if (args.length < 1) {
      return msg.reply("⚠️ Укажите название предмета.");
    }

    // Убираем упоминание пользователя из названия предмета
    const itemName = args.join(" ").trim().replace(/<@\d+>/g, "").trim();

    if (!inventory[itemName]) {
      return msg.reply("❌ У игрока нет такого предмета.");
    }

    delete inventory[itemName];
    saveData(inventoryFile, inventory);
    return msg.reply(`🗑️ Полностью удалён предмет **${itemName}** у игрока **${target.username}**.`);
  } catch (err) {
    console.error("Ошибка в deleteItem:", err);
  }
}

// Назначить ГМа
function registerGM(msg, args) {
  try {
    const channelId = msg.channel.isThread() ? msg.channel.parentId : msg.channel.id;
    if (!isInventoryEnabled(channelId)) {
      return msg.reply("⚠️ Инвентарь не активирован (`!setinvsys`).");
    }

    // Проверка прав: администратор или модератор
    const isAdmin = msg.member.permissions.has(PermissionsBitField.Flags.Administrator);
    const isModerator = msg.channel.permissionsFor(msg.member).has(PermissionsBitField.Flags.ManageChannels);

    if (!isAdmin && !isModerator) {
      return msg.reply("⛔ Только администраторы и модераторы могут назначать ГМа.");
    }

    // Определяем, кого назначить ГМом
    const target = msg.mentions.users.first() || msg.author;
    const targetId = target.id;

    // Загружаем данные о ГМах
    const gmFile = path.join(INVENTORY_PATH, `${channelId}_gm.json`);
    let gmData = loadData(gmFile);

    // Проверяем, есть ли уже ГМ в этом канале
    if (Object.keys(gmData).length > 0) {
      const currentGMId = Object.keys(gmData)[0];
      const currentGM = msg.guild.members.cache.get(currentGMId);
      return msg.reply(`❌ В этом канале уже есть ГМ: **${currentGM.user.username}**.`);
    }

    // Назначаем нового ГМа
    gmData[targetId] = true;
    saveData(gmFile, gmData);
    return msg.reply(`✅ Игрок **${target.username}** назначен ГМом.`);
  } catch (err) {
    console.error("Ошибка в registerGM:", err);
  }
}

// Снять ГМа
function unregisterGM(msg, args) {
  try {
    const channelId = msg.channel.isThread() ? msg.channel.parentId : msg.channel.id;
    if (!isInventoryEnabled(channelId)) {
      return msg.reply("⚠️ Инвентарь не активирован (`!setinvsys`).");
    }

    // Проверка прав: администратор, модератор или текущий ГМ
    const isAdmin = msg.member.permissions.has(PermissionsBitField.Flags.Administrator);
    const isModerator = msg.channel.permissionsFor(msg.member).has(PermissionsBitField.Flags.ManageChannels);
    const isCurrentGM = isGM(channelId, msg.author.id);

    if (!isAdmin && !isModerator && !isCurrentGM) {
      return msg.reply("⛔ Только администраторы, модераторы или текущий ГМ могут снимать ГМа.");
    }

    // Определяем, кого снять
    const target = msg.mentions.users.first() || msg.author;
    const targetId = target.id;

    // Загружаем данные о ГМах
    const gmFile = path.join(INVENTORY_PATH, `${channelId}_gm.json`);
    let gmData = loadData(gmFile);

    // Проверяем, есть ли ГМ в этом канале
    const currentGMId = Object.keys(gmData)[0];
    if (!currentGMId) {
      return msg.reply("❌ В этом канале нет ГМа.");
    }

    // Проверяем, что снимают текущего ГМа
    if (targetId !== currentGMId) {
      return msg.reply("❌ Вы можете снять только текущего ГМа.");
    }

    // Снимаем ГМа
    delete gmData[targetId];
    saveData(gmFile, gmData);
    return msg.reply(`✅ Игрок **${target.username}** больше не ГМ.`);
  } catch (err) {
    console.error("Ошибка в unregisterGM:", err);
  }
}

// Проверить инвентарь (для ГМов)
function checkInventory(msg, args) {
  try {
    const channelId = msg.channel.isThread() ? msg.channel.parentId : msg.channel.id;
    if (!isInventoryEnabled(channelId)) {
      return msg.reply("⚠️ Инвентарь не активирован (`!setinvsys`).");
    }

    // Проверка, является ли пользователь ГМом
    if (!isGM(channelId, msg.author.id)) {
      return msg.reply("⛔ Только ГМ может проверять инвентарь других игроков.");
    }

    if (!msg.mentions.users.size) {
      return msg.reply("⚠️ Укажите пользователя через `@`.");
    }

    const target = msg.mentions.users.first();
    const targetId = target.id;
    const inventoryFile = path.join(INVENTORY_PATH, `${channelId}_${targetId}.json`);
    const inventory = loadData(inventoryFile);

    if (Object.keys(inventory).length === 0) {
      return msg.reply("📦 Инвентарь пуст.");
    }

    // Формируем список предметов
    const inventoryList = Object.entries(inventory)
      .map(([item, count]) => `- **${item}**: ${count} шт.`)
      .join("\n");

    return msg.reply(`📦 **Инвентарь игрока ${target.username}:**\n${inventoryList}`);
  } catch (err) {
    console.error("Ошибка в checkInventory:", err);
  }
}

// Управление инвентарем (для ГМов)
function manageStore(msg, args) {
  try {
    const channelId = msg.channel.isThread() ? msg.channel.parentId : msg.channel.id;
    if (!isInventoryEnabled(channelId)) {
      return msg.reply("⚠️ Инвентарь не активирован (`!setinvsys`).");
    }

    if (!args.length) {
      return msg.reply("⚠️ Используйте: `!store {действие}`");
    }

    const subCmd = args.shift().toLowerCase();
    if (subCmd === "delete") {
      return deleteItem(msg, args);
    } else if (subCmd === "add") {
      return addItem(msg, args);
    } else if (subCmd === "remove") {
      return removeItem(msg, args);
    } else if (subCmd === "reg") {
      return registerGM(msg, args);
    } else if (subCmd === "unreg") {
      return unregisterGM(msg, args);
    } else if (subCmd === "check") {
      return checkInventory(msg, args);
    } else {
      return msg.reply(
        "⚠️ Неизвестная команда. Используйте: `!store delete`, `!store add`, `!store remove`, `!store reg`, `!store unreg`, `!store check`."
      );
    }
  } catch (err) {
    console.error("Ошибка в manageStore:", err);
  }
}

// Управление инвентарем (для игроков)
function manageInventory(msg, args) {
  try {
    const channelId = msg.channel.isThread() ? msg.channel.parentId : msg.channel.id;
    if (!isInventoryEnabled(channelId)) {
      return msg.reply("⚠️ Инвентарь не активирован (`!setinvsys`).");
    }

    if (!args.length) {
      return msg.reply("⚠️ Используйте: `!inv {действие}`");
    }

    const subCmd = args.shift().toLowerCase();
    if (subCmd === "show") {
      return showInventory(msg);
    } else if (subCmd === "give") {
      return giveItem(msg, args);
    } else {
      return msg.reply("⚠️ Неизвестная команда. Используйте: `!inv show`, `!inv give`.");
    }
  } catch (err) {
    console.error("Ошибка в manageInventory:", err);
  }
}

module.exports = {
  setInventorySystem,
  manageStore,
  manageInventory,
  isInventoryEnabled,
  saveSettings,
  loadData,
  saveData,
  showInventory,
  giveItem,
  addItem,
  removeItem,
  deleteItem,
  registerGM,
  unregisterGM,
  checkInventory,
};
