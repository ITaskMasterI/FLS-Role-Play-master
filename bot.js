require("dotenv").config();
const { Client, GatewayIntentBits, EmbedBuilder, Partials, PermissionsBitField } = require("discord.js");
const inventory = require("./inventory");
const statusCommand = require('./status.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

client.once("ready", () => {
  console.log(`✅ Бот запущен как ${client.user.tag}`);
  statusCommand.restoreTimers();
});

const games = new Map();

client.on("messageCreate", async (msg) => {
  try {
    if (msg.author.bot) return;

    if (msg.content.startsWith('!status')) {
      const args = msg.content.slice('!status'.length).trim().split(/ +/);
      return statusCommand.execute(msg, args);
    }

    const args = msg.content.trim().split(/\s+/);
    const cmd = args.shift().toLowerCase();

    if (cmd === "!help") {
      const helpEmbed = new EmbedBuilder()
        .setColor(0xe67e22)
        .setTitle(`Привет, ${msg.author.username}! Это меню помощи`)
        .setDescription("Я создан, чтобы оптимизировать RP процесс.\nВерсия: **1.8.0**\nВот список доступных команд:")
        .addFields(
          { name: "!ping", value: "Проверка отклика бота" },
          { name: "!updates", value: "Показывает changelog" },
          { name: "!say", value: "Повторяет ваше сообщение" },
          { name: "!roll", value: "Бросок кубика `!roll {число}` или `!roll 1d20 + 1d30`" },
          { name: "!atc", value: "Проверка урона `!atc` выдает урон от 1 до 20, `!atc {число}` — модификатор урона, `{число}` — модификатор урона врага, `{true}` — шанс удачной атаки" },
          { name: "!mg", value: "Мини-Игра\n`!mg start`: Начать Мини-игру\n`!mg prog {число}`: Увеличить прогресс на рандомное количество до `{число}`\n`!mg decr`: Уменьшить\n`!mg stop` Принудительно остановить Мини-Игру" },
          { name: "!status", value: "Управление статусами\n`!status ready` - Готов (сброс через 12ч)\n`!status notready` - Не готов\n`!status check` - Показать готовых" },
          {
            name: "Система инвентаря",
            value: "**!setinvsys** - Вкл/выкл систему (админы)\n" +
              "**!store reg/unreg @user** - Назначить/удалить GM\n" +
              "**!store add @user предмет=количество** - Добавить предметы\n" +
              "**!store remove @user предмет=количество** - Удалить предметы\n" +
              "**!store delete @user предмет** - Полное удаление\n" +
              "**!store check @user** - Проверить инвентарь\n" +
              "**!inv show** - Показать свой инвентарь\n" +
              "**!inv give @user предмет=количество** - Передать предмет"
          }
        );
      return msg.channel.send({ embeds: [helpEmbed] });
    }

    if (cmd === "!updates") {
      const updatesEmbed = new EmbedBuilder()
        .setColor(0xe67e22)
        .setTitle(`Change log`)
        .setDescription("Текущая версия 1.8.0")
        .addFields(
          { name: "1.4.0", value: "Добавлена система инвентаря" },
          { name: "1.6.0", value: 
            "Переработана система инвентаря\n" +
            "Добавлена функция просмотра инвентаря игрока ГМом\n" +
            "Добавлена функция передачи предметов"
          },
          { name: "1.7.0", value: 
            "Добавлена система статусов\n" +
            "Автоматический сброс статуса через 12 часов\n" +
            "Сохранение статусов между перезапусками"
	   }
        );
      return msg.channel.send({ embeds: [updatesEmbed] });
    }

    if (cmd === "!ping") {
      return msg.reply(`🏓 Понг! Задержка: **${Date.now() - msg.createdTimestamp}ms**`);
    }

    if (cmd === "!roll") {
      if (args.length === 0) {
        return msg.reply("🎲 Укажи бросок, например: `!roll 2d20 + 1d6` или `!roll 20`.");
      }

      let total = 0;
      let results = [];
      let expression = args.join(" ").replace(/\s+/g, "");

      if (/^\d+$/.test(expression)) {
        const max = parseInt(expression);
        if (isNaN(max) || max <= 1 || max > 1000) {
          return msg.reply("❌ Введи корректное число (от 2 до 1000).");
        }
        const roll = Math.floor(Math.random() * max) + 1;
        return msg.reply(`🎲 Результат:\n **${roll}**`);
      }

      expression = expression.replace(/(\d+)d(\d+)/g, (match, num, sides) => {
        num = parseInt(num);
        sides = parseInt(sides);
        if (isNaN(num) || isNaN(sides) || num < 1 || sides < 2 || sides > 1000) {
          return match;
        }

        let rolls = [];
        for (let i = 0; i < num; i++) {
          rolls.push(Math.floor(Math.random() * sides) + 1);
        }

        results.push(`${num}d${sides}: [${rolls.join(", ")}]`);
        total += rolls.reduce((sum, val) => sum + val, 0);
        return rolls.reduce((sum, val) => sum + val, 0);
      });

      try {
        total = eval(expression);
      } catch (e) {
        return msg.reply("❌ Ошибка в выражении. Пример: `!roll 2d6 + 1d20 - 3`");
      }

      return msg.reply(`🎲 Броски:\n${results.join("\n")}\n**Итого: ${total}**`);
    }

    if (cmd === "!atc") {
      const atcr = Math.floor(Math.random() * 20) + 1;
      const atcre = Math.floor(Math.random() * 20) + 1;

      const mod = parseInt(args[0]);
      const emod = parseInt(args[1]);
      const luckEnabled = args[2] === "true";

      const modr = isNaN(mod) || mod <= 1 ? 0 : Math.floor(Math.random() * mod) + 1;
      const emodr = isNaN(emod) || emod <= 1 ? 0 : Math.floor(Math.random() * emod) + 1;

      let result = `Ваша атака: ${atcr}${modr ? ` + ${modr} = ${atcr + modr}` : ""}\n`;

      if (luckEnabled) {
        const luckRoll1 = Math.floor(Math.random() * 6) + 1;
        result += `🎲 Удача: **${luckRoll1}**\n`;
      }

      result += `Атака врага: ${atcre}${emodr ? ` + ${emodr} = ${atcre + emodr}` : ""}`;

      if (luckEnabled) {
        const luckRoll2 = Math.floor(Math.random() * 6) + 1;
        result += `\n🎲 Удача: **${luckRoll2}**`;
      }

      return msg.reply(result);
    }

    if (cmd === "!say") {
      return msg.reply(args.join(" "));
    }

    if (cmd === "!mg") {
      let channelId = String(msg.channel.id);

      if (args[0] === "start") {
        if (games.has(channelId)) {
          return msg.reply("Игра уже запущена в этом канале!");
        }

        games.set(channelId, 0);
        return msg.reply("Мини-игра начата!\nПрогресс: 0%");
      }

      if (args[0] === "prog") {
        if (!games.has(channelId)) {
          return msg.reply("Игра ещё не запущена! Используйте `!mg start`.");
        }

        let maxIncrease = parseInt(args[1]);
        if (isNaN(maxIncrease) || maxIncrease <= 0) {
          return msg.reply("Ошибка: укажите корректное число после `!mg prog`.");
        }

        let progress = games.get(channelId);
        let randomIncrease = Math.floor(Math.random() * maxIncrease) + 1;
        progress += randomIncrease;

        if (progress >= 100) {
          games.delete(channelId);
          return msg.reply("Игра завершена! Прогресс: 100%");
        }

        games.set(channelId, progress);
        return msg.reply(`Прогресс: ${progress}%`);
      }

      if (args[0] === "decr") {
        if (!games.has(channelId)) {
          return msg.reply("Игра ещё не запущена! Используйте `!mg start`.");
        }

        let maxDecrease = parseInt(args[1]);
        if (isNaN(maxDecrease) || maxDecrease <= 0) {
          return msg.reply("Ошибка: укажите корректное число после `!mg decr`.");
        }

        let progress = games.get(channelId);
        let randomDecrease = Math.floor(Math.random() * maxDecrease) + 1;
        progress -= randomDecrease;

        if (progress < 0) progress = 0;

        games.set(channelId, progress);
        return msg.reply(`Прогресс уменьшен: ${progress}%`);
      }

      if (args[0] === "stop") {
        if (!games.has(channelId)) {
          return msg.reply("Игра не запущена, чтобы её остановить!");
        }

        games.delete(channelId);
        return msg.reply("Мини-игра остановлена.");
      }
    }

    if (cmd === "!setinvsys") {
      if (!msg.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        return msg.reply("❌ У вас нет прав для использования этой команды.");
      }

      const enabled = inventory.toggleSystem(msg.guild.id, msg.channel.id);
      return msg.reply(`✅ Система инвентаря ${enabled ? "включена" : "выключена"} для этого канала.`);
    }

    if (!inventory.isSystemEnabled(msg.guild.id, msg.channel.id)) return;

    if (cmd === "!store") {
      const subCmd = args.shift().toLowerCase();

      if (subCmd === "reg") {
        if (!msg.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
          return msg.reply("❌ У вас нет прав для назначения GM.");
        }

        const target = msg.mentions.users.first() || msg.author;
        inventory.registerGM(msg.guild.id, msg.channel.id, target.id);
        return msg.reply(`✅ <@${target.id}> теперь GM в этом канале.`);
      }

      if (subCmd === "unreg") {
        if (!msg.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
          return msg.reply("❌ У вас нет прав для удаления GM.");
        }

        const target = msg.mentions.users.first() || msg.author;
        inventory.unregisterGM(msg.guild.id, msg.channel.id, target.id);
        return msg.reply(`✅ <@${target.id}> больше не GM в этом канале.`);
      }

      if (!inventory.isGM(msg.guild.id, msg.channel.id, msg.author.id)) {
        return msg.reply("❌ Только GM могут использовать команды store.");
      }

      if (subCmd === "add") {
        const targetUser = msg.mentions.users.first();
        if (!targetUser) {
          return msg.reply("❌ Укажите пользователя для добавления предметов.");
        }

        const itemsArgs = args.filter(arg => !arg.startsWith('<@'));
        const items = inventory.parseItemsArgs(itemsArgs);

        if (Object.keys(items).length === 0) {
          return msg.reply("❌ Укажите предметы для добавления в формате: предмет=количество");
        }

        inventory.addItems(msg.guild.id, msg.channel.id, targetUser.id, items);
        return msg.reply(`✅ Предметы успешно добавлены в инвентарь <@${targetUser.id}>.`);
      }

      if (subCmd === "remove") {
        const targetUser = msg.mentions.users.first();
        if (!targetUser) {
          return msg.reply("❌ Укажите пользователя для удаления предметов.");
        }

        const itemsArgs = args.filter(arg => !arg.startsWith('<@'));
        const items = inventory.parseItemsArgs(itemsArgs);

        if (Object.keys(items).length === 0) {
          return msg.reply("❌ Укажите предметы для удаления в формате: предмет=количество");
        }

        inventory.removeItems(msg.guild.id, msg.channel.id, targetUser.id, items);
        return msg.reply(`✅ Предметы успешно удалены из инвентаря <@${targetUser.id}>.`);
      }

      if (subCmd === "delete") {
        const targetUser = msg.mentions.users.first();
        if (!targetUser) {
          return msg.reply("❌ Укажите пользователя для удаления предметов.");
        }

        const itemsArgs = args.filter(arg => !arg.startsWith('<@'));
        const items = inventory.parseDeleteArgs(itemsArgs);

        if (items.length === 0) {
          return msg.reply("❌ Укажите предметы для полного удаления.");
        }

        inventory.deleteItems(msg.guild.id, msg.channel.id, targetUser.id, items);
        return msg.reply(`✅ Предметы полностью удалены из инвентаря <@${targetUser.id}>.`);
      }

      if (subCmd === "check") {
        const targetUser = msg.mentions.users.first();
        if (!targetUser) {
          return msg.reply("❌ Укажите пользователя для проверки инвентаря.");
        }

        const targetInventory = inventory.getInventory(msg.guild.id, msg.channel.id, targetUser.id);

        if (Object.keys(targetInventory).length === 0) {
          return msg.reply(`ℹ️ Инвентарь <@${targetUser.id}> пуст.`);
        }

        const inventoryList = Object.entries(targetInventory)
          .map(([item, quantity]) => `• ${item}: ${quantity}`)
          .join('\n');

        const embed = new EmbedBuilder()
          .setTitle(`Инвентарь <@${targetUser.id}>`)
          .setDescription(inventoryList)
          .setColor('#0099ff');

        return msg.channel.send({ embeds: [embed] });
      }
    }

    if (cmd === "!inv") {
      const subCmd = args.shift().toLowerCase();

      if (subCmd === "show") {
        const userInventory = inventory.getInventory(msg.guild.id, msg.channel.id, msg.author.id);

        if (Object.keys(userInventory).length === 0) {
          return msg.reply("ℹ️ Ваш инвентарь пуст.");
        }

        const inventoryList = Object.entries(userInventory)
          .map(([item, quantity]) => `• ${item}: ${quantity}`)
          .join('\n');

        const embed = new EmbedBuilder()
          .setTitle('Ваш инвентарь')
          .setDescription(inventoryList)
          .setColor('#0099ff');

        return msg.channel.send({ embeds: [embed] });
      }

      if (subCmd === "give") {
        const targetUser = msg.mentions.users.first();
        if (!targetUser) {
          return msg.reply("❌ Укажите пользователя для передачи предметов.");
        }

        if (targetUser.id === msg.author.id) {
          return msg.reply("❌ Вы не можете передать предметы самому себе.");
        }

        const itemsArgs = args.filter(arg => !arg.startsWith('<@'));
        const items = inventory.parseItemsArgs(itemsArgs);

        if (Object.keys(items).length === 0) {
          return msg.reply("❌ Укажите предметы для передачи в формате: предмет=количество");
        }

        try {
          inventory.transferItems(msg.guild.id, msg.channel.id, msg.author.id, targetUser.id, items);
          return msg.reply(`✅ Предметы успешно переданы <@${targetUser.id}>.`);
        } catch (error) {
          return msg.reply(`❌ Ошибка: ${error.message}`);
        }
      }
    }

  } catch (err) {
    console.error("❌ Ошибка в обработке сообщения:", err);
  }
});

client.login(process.env.TOKEN);
