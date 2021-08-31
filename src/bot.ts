import {
    ApplicationCommandData, ButtonInteraction, ChatInputApplicationCommandData,
    CommandInteraction, ContextMenuInteraction, DMChannel, Guild, GuildMember, 
    Message, MessageComponentInteraction, MessageEmbedOptions,
    SelectMenuInteraction, Client
} from 'discord.js';
import { BotConfig } from './config';
import { Logger } from './utils/logger';
import { EventEmitter } from 'stream';
import { SayuGuildManager } from './guildManager';
import { LoopMode } from './player/manager';
import * as util from "util";

export class SayuBot extends EventEmitter {
    public api: Client;
    public config: BotConfig;

    private activityInterval: NodeJS.Timer | null = null;
    private canAcceptConsoleInput = true;

    public static instance: SayuBot;
    public guildManagers = [] as SayuGuildManager[];

    constructor() {
        super();

        SayuBot.instance = this;
        this.config = new BotConfig();
        this.api = new Client({
            intents: [ "GUILDS", "GUILD_VOICE_STATES", "GUILD_MEMBERS" ],
            partials: ["MESSAGE", "CHANNEL"]
        });

        this.api.on('ready', async () => {
            const user = this.api.user;
            Logger.info(`Discord bot logged in as ${user?.username}#${user?.discriminator}`);

            const activityTimer = (async () => {
                await this.api.user?.setActivity({
                    ...this.config.data.activity
                });
                await this.api.user?.setStatus(this.config.data.status);
            });
            activityTimer();
            this.activityInterval = setInterval(activityTimer, 1000 * 60 * 2);
            this.emit("ready");

            await Promise.all(this.api.guilds.cache.map(async (g) => {
                this.guildManagers.push(new SayuGuildManager(this, g));
            }));
            await this.registerSlashCommands();
        });

        this.api.on("message", (msg: Message) => {
            if(msg.channel instanceof DMChannel && msg.author.id != this.api.user?.id) {
                Logger.info(msg.author.tag + ": " + msg.content);
            }
        })

        this.api.on("guildCreate", g => {
            this.guildManagers.push(new SayuGuildManager(this, g));
            this.registerGuildSlashCommands(g);
        });

        this.api.on("guildDelete", g => {
            let i = this.guildManagers.findIndex(m => {
                return m.guild.id == g.id;
            });
            if(i >= 0) {
                let m = this.guildManagers[i];
                m.dispose();
                this.guildManagers.splice(i, 1);
            }
        });

        this.api.on("voiceStateUpdate", (o, n) => {
            if(n.channel == null && n.member!!.id == this.api.user!!.id) {
                const g = o.channel!!.guild;
                const m = this.getGuildManager(g);
                try {
                    m?.player.reset();
                } catch(_) {}
            }
        });

        this.api.on("interactionCreate", async (interaction) => {
            if(interaction.isCommand()) {
                try {
                    await this.handleCommandInteraction(interaction);
                } catch(ex) {
                    interaction.reply({
                        embeds: [
                            this.getExtendedEmbed({
                                description: "喔不，失敗了...OHQ",
                                fields: [
                                    { name: "錯誤訊息", value: "`" + ex.toString() + "`" }
                                ]
                            }, interaction.guild)
                        ]
                    });
                }
                return;
            }

            if(interaction.isButton()) {
                await this.handleButtonInteraction(interaction);
                return;
            }

            if(interaction.isMessageComponent()) {
                await this.handleMessageComponentInteraction(interaction);
                return;
            }

            if(interaction.isContextMenu()) {
                await this.handleContextMenuInteraction(interaction);
                return;
            }
        });
    }

    public async login() {
        const token = this.config.getToken();
        if(!token || token == '') {
            throw new Error('Discord bot token is not set!');
        }

        await this.api.login(token);
    }

    public async registerSlashCommands() {
        await Promise.all(this.api.guilds.cache.map(async (g) => {
            await this.registerGuildSlashCommands(g);
        }));
    }

    public async registerGuildSlashCommands(guild: Guild) {
        Logger.log(`Registering command for guild: ${guild.name} (${guild.id})`);

        const nickName = this.config.nickname;
        const commands: ChatInputApplicationCommandData[] = [
            {
                name: this.config.commandName,
                description: `讓${nickName}起床工作...zzZ`,
                options: [
                    {
                        name: "help",
                        description: `${nickName}要讓你更加認識我！！`,
                        type: "SUB_COMMAND"
                    },
                    {
                        name: "play",
                        description: `${nickName}要來當 DJ！`,
                        type: "SUB_COMMAND",
                        options: [
                            {
                                name: "query",
                                description: `${nickName}要放什麼歌呢！？`,
                                type: "STRING",
                                required: true
                            }
                        ]
                    },
                    {
                        name: "skip",
                        description: `${nickName}要橫衝直撞跳過這首歌！！`,
                        type: "SUB_COMMAND"
                    },
                    {
                        name: "loop",
                        description: `${nickName}要無限循環這首歌！！`,
                        type: "SUB_COMMAND",
                        options: [
                            {
                                name: "mode",
                                description: `${nickName}可以很專一也可以很DD`,
                                type: "STRING",
                                choices: [ "queue", "track", "none" ].map(s => { return { name: s, value: s }; }),
                                required: true
                            }
                        ]
                    },
                    {
                        name: "leave",
                        description: `${nickName}要用風火輪的速度離開！！`,
                        type: "SUB_COMMAND"
                    },
                    {
                        name: "pause",
                        description: `${nickName}要施展時間暫停術——砸襪魯抖！！！`,
                        type: "SUB_COMMAND"
                    },
                    {
                        name: "resume",
                        description: `${nickName}要繼續嗨了！！`,
                        type: "SUB_COMMAND"
                    },
                    {
                        name: "list",
                        description: `${nickName}想看看你們都點了什麼！！`,
                        type: "SUB_COMMAND"
                    },
                    {
                        name: "remove",
                        description: `${nickName}不想放這首歌（怒`,
                        type: "SUB_COMMAND",
                        options: [
                            {
                                name: "index",
                                description: "啊...是哪首歌呢...",
                                type: "INTEGER",
                                required: true
                            }
                        ]
                    },
                    {
                        name: "clear",
                        description: `${nickName}可以掛著偷懶了嗎！！`,
                        type: "SUB_COMMAND"
                    },
                    {
                        name: "jump",
                        description: `${nickName}喜歡在歌單上滾來滾去！！`,
                        type: "SUB_COMMAND",
                        options: [
                            {
                                name: "index",
                                description: "嗯...要滾到哪首歌去呢...",
                                type: "INTEGER",
                                required: true
                            }
                        ]
                    }
                ]
            }
        ];

        const config = this.getGuildManager(guild)?.config;
        if(config?.data.kaboom.enabled) {
            commands[0].options?.unshift({
                name: "kaboom",
                description: `${nickName}要如何處置枯萎的豆芽呢！？`,
                type: "SUB_COMMAND_GROUP",
                options: [
                    {
                        name: "set",
                        description: `${nickName}要把枯萎的豆芽碾成豆漿啦啦啦——`,
                        type: "SUB_COMMAND",
                        options: [
                            {
                                name: "month",
                                description: `${nickName}要幾月的時候檢查各位豆芽呢！？`,
                                type: "INTEGER",
                                required: true
                            },
                            {
                                name: "date",
                                description: `${nickName}要幾號的時候檢查各位豆芽呢！？`,
                                type: "INTEGER",
                                required: true
                            },
                            {
                                name: "hour",
                                description: `${nickName}要幾點的時候檢查各位豆芽呢！？`,
                                type: "INTEGER",
                                required: false
                            },
                            {
                                name: "minute",
                                description: `${nickName}要幾分的時候檢查各位豆芽呢！？`,
                                type: "INTEGER",
                                required: false
                            }
                        ]
                    },
                    {
                        name: "cancel",
                        description: `${nickName}要放過那些枯萎的豆芽啦zzZ`,
                        type: "SUB_COMMAND"
                    },
                    {
                        name: "update",
                        description: `${nickName}要更正發布過的訊息啦...zzZ`,
                        type: "SUB_COMMAND"
                    }
                ]
            });
        }

        await Promise.all(commands.map(async(cmd: ApplicationCommandData) => {
            const old = guild.commands.cache.first();
            if(old) {
                await guild.commands.delete(old);
            }
            await guild.commands.create(cmd);
        }));
    }

    public async acceptConsoleInput(input: string) {
        if(!this.canAcceptConsoleInput) return;

        if(input.trim().split(" ")[0] == "reload") {
            Logger.info("Reloading...");
            this.reload();
        }

        if(input.trim().split(" ")[0] == "dump" && input.length >= 6) {
            let objs = input.trim().split(" ");
            if(objs.length < 3) return;

            try {
                const depth = parseInt(objs[1]);
                if(isNaN(depth)) throw new Error();

                objs.shift();
                objs.shift();

                let obj = objs.join(" ");
                if(objs.length == 0) return;

                if(!obj.startsWith("$")) return;
                if(obj.length > 1 && obj[1] != ".") return;
                obj = obj.substring(1);
    
                try {
                    const target = eval("SayuBot.instance" + obj);
                    Logger.info(util.inspect(target, false, depth, true));
                } catch(ex) {
                    Logger.error("Failed to dump");
                    Logger.error(ex.toString());
                }
            } catch(ex) {
                Logger.error(`depth "${objs[0]}" is not a number`);
            }
            return;
        }

        if(input.trim().split(" ")[0] == "exit") {
            await this.exit();
        }
    }
    
    public async handleCommandInteraction(interaction: CommandInteraction) {
        const options = interaction.options;
        if(interaction.commandName == this.config.commandName) {
            let sub = options.getSubcommandGroup(false);
            if(sub == "kaboom") {
                await this.executeKaboom(interaction);
                return;
            }

            sub = options.getSubcommand();

            if(sub == "help") {
                await this.executeHelp(interaction);
                return;
            }

            if(sub == "play") {
                await this.executePlay(interaction);
                return;
            }

            if(sub == "skip") {
                await this.executeSkip(interaction);
                return;
            }

            if(sub == "leave") {
                await this.executeLeave(interaction);
                return;
            }

            if(sub == "pause") {
                await this.executePause(interaction);
                return;
            }

            if(sub == "resume") {
                await this.executeResume(interaction);
                return;
            }

            if(sub == "loop") {
                await this.executeLoop(interaction);
                return;
            }

            if(sub == "list") {
                await this.executeList(interaction);
                return;
            }

            if(sub == "jump") {
                await this.executeJump(interaction);
                return;
            }

            if(sub == "clear") {
                await this.executeClear(interaction);
                return;
            }

            if(sub == "remove") {
                await this.executeRemove(interaction);
                return;
            }
        }
    }

    public getGuildManager(guild: Guild): SayuGuildManager | undefined
    public getGuildManager(guild: null): undefined
    public getGuildManager(guild: Guild | null): SayuGuildManager | undefined {
        if(!guild) return undefined;
        return this.guildManagers.find(m => m.guild.id == guild.id);
    }

    public async replyWithInsufficientPermission(interaction: MessageComponentInteraction | CommandInteraction) {
        interaction.reply({
            ephemeral: true,
            embeds: [
                this.getExtendedEmbed({
                    description: `${this.config.nickname}覺得不能幫你做這種事...zzZ`
                }, interaction.guild)
            ]
        });
    }

    public async executeHelp(interaction: CommandInteraction) {
        interaction.reply({
            embeds: [
                this.getExtendedEmbed({
                    description: `${this.config.nickname}要讓你更認識我！！[快過去看看！！](https://github.com/ItsArcal139/sayu-bot/blob/master/docs/help.md)`
                }, interaction.guild)
            ]
        });
    }

    public async executeKaboom(interaction: CommandInteraction) {
        const options = interaction.options;

        const member = interaction.member as GuildMember;
        if(!member.permissions.has("MANAGE_GUILD")) {
            this.replyWithInsufficientPermission(interaction);
            return;
        }

        const guildManager = this.getGuildManager(interaction.guild!!)!!;
        const sub = options.getSubcommand(true);
        if(sub == "cancel") {
            guildManager.kaboom.cancel();
            guildManager.config.data.kaboom.activeSchedule = null;
            guildManager.config.save();
            interaction.reply({
                ephemeral: true,
                embeds: [
                    this.getExtendedEmbed({
                        description: "取消現有的潛水檢查了...zzZ"
                    }, interaction.guild)
                ]
            });
            return;
        }

        if(sub == "update") {
            guildManager.kaboom.update();
            interaction.reply({
                ephemeral: true,
                embeds: [
                    this.getExtendedEmbed({
                        description: "已經更正現有的潛水檢查訊息了...zzZ"
                    }, interaction.guild)
                ]
            });
            return;
        }

        const month = options.getInteger("month", true);
        const date = options.getInteger("date", true);
        const hour = options.getInteger("hour", false) ?? 0;
        const minute = options.getInteger("minute", false) ?? 0;

        guildManager.kaboom.schedule(month, date, hour, minute);
        interaction.reply({
            ephemeral: true,
            embeds: [
                this.getExtendedEmbed({
                    description: "設定好新的潛水檢查了...zzZ"
                }, interaction.guild)
            ]
        });
    }

    private async playerCommandCheckPermission(interaction: CommandInteraction) {
        const guildManager = this.getGuildManager(interaction.guild!!)!!;
        const member = interaction.member!! as GuildMember;
        const channel = member.voice.channel;
        if(!channel) {
            await interaction.reply({
                embeds: [
                    this.getExtendedEmbed({
                        description: `${this.config.nickname}發現你沒在語音頻道內，覺得不想做事（躺`
                    }, interaction.guild)
                ]
            });
            return false;
        }

        const botMember = guildManager.guild.members.cache.get(this.api.user!!.id)!!;
        if(botMember.voice.channel && botMember.voice.channel.id != channel.id) {
            interaction.editReply({
                embeds: [
                    this.getExtendedEmbed({
                        description: `你需要和${this.config.nickname}在同個頻道才可以用這個指令！`
                    }, interaction.guild)
                ]
            });
            return false;
        }

        return true;
    }

    public async executePlay(interaction: CommandInteraction) {
        if(!this.playerCommandCheckPermission(interaction)) return;

        const guildManager = this.getGuildManager(interaction.guild!!)!!;
        const voiceController = guildManager.voiceController;

        const options = interaction.options;
        const query = options.getString("query", true);

        const member = interaction.member!! as GuildMember;
        const channel = member.voice.channel!!;
        guildManager.config.data.player.lastTextChannel = interaction.channelId;
        voiceController.joinChannel(channel);

        const queue = await guildManager.player.queueYouTube(query, member);
        interaction.reply({
            embeds: [
                this.getExtendedEmbed({
                    description: `Queued [${queue.meta.title}](${queue.meta.url}) [<@${queue.member.id}>]`
                }, interaction.guild)
            ]
        });
    }

    public async executeSkip(interaction: CommandInteraction) {
        if(!this.playerCommandCheckPermission(interaction)) return;

        const guildManager = this.getGuildManager(interaction.guild!!)!!;
        guildManager.player.skip();

        interaction.reply({
            embeds: [
                this.getExtendedEmbed({
                    description: `${this.config.nickname}幫你跳過了！！！`
                }, interaction.guild)
            ]
        });
    }

    public async executeLeave(interaction: CommandInteraction) {
        if(!this.playerCommandCheckPermission(interaction)) return;

        const guildManager = this.getGuildManager(interaction.guild!!)!!;
        guildManager.player.reset();

        interaction.reply({
            embeds: [
                this.getExtendedEmbed({
                    description: "咻———"
                }, interaction.guild)
            ]
        });
    }

    public async executePause(interaction: CommandInteraction) {
        if(!this.playerCommandCheckPermission(interaction)) return;

        const guildManager = this.getGuildManager(interaction.guild!!)!!;
        guildManager.player.pause();

        interaction.reply({
            embeds: [
                this.getExtendedEmbed({
                    description: "砸襪魯抖——！！"
                }, interaction.guild)
            ]
        });
    }

    public async executeResume(interaction: CommandInteraction) {
        if(!this.playerCommandCheckPermission(interaction)) return;

        const guildManager = this.getGuildManager(interaction.guild!!)!!;
        guildManager.player.resume();

        interaction.reply({
            embeds: [
                this.getExtendedEmbed({
                    description: "繼續嗨起來吧——"
                }, interaction.guild)
            ]
        });
    }

    public async executeLoop(interaction: CommandInteraction) {
        if(!this.playerCommandCheckPermission(interaction)) return;

        const guildManager = this.getGuildManager(interaction.guild!!)!!;
        const options = interaction.options;
        const mode = options.getString("mode", true) as "none" | "queue" | "track";

        guildManager.player.loopMode = LoopMode[mode];

        const loopModeMessages = {
            none: `${this.config.nickname}要停止無限循環播放了（睡`,
            queue: `${this.config.nickname}要當個 DD 全部一起無限循環啦——`,
            track: `${this.config.nickname}要很專一的無限循環播放單首啦！！`
        };

        interaction.reply({
            embeds: [
                this.getExtendedEmbed({
                    description: loopModeMessages[mode]
                }, interaction.guild)
            ]
        });
    }

    public async executeList(interaction: CommandInteraction) {
        if(!this.playerCommandCheckPermission(interaction)) return;

        const guildManager = this.getGuildManager(interaction.guild!!)!!;
        const player = guildManager.player;

        let queue = player.queue.items.map((item, i) => {
            let result = `${i+1}. ${item.meta.title}`;
            if(player.currentPlaying == i) {
                result = "  現在播放 ⤵︎\n" + result + "\n  現在播放 ⤶";
            }
            return result;
        }).join("\n");

        if(queue.length == 0) {
            queue = "沒有人點歌...O_Q";
        } else {
            queue = "```" + queue + "```";
        }

        interaction.reply({
            embeds: [
                this.getExtendedEmbed({
                    description: queue
                }, interaction.guild)
            ]
        });
    }

    public async executeClear(interaction: CommandInteraction) {
        if(!this.playerCommandCheckPermission(interaction)) return;

        const guildManager = this.getGuildManager(interaction.guild!!)!!;
        guildManager.player.clearQueue();

        interaction.reply({
            embeds: [
                this.getExtendedEmbed({
                    description: `耶！！${this.config.nickname}要掛著偷懶懶（翻滾`
                }, interaction.guild)
            ]
        });
    }

    public async executeRemove(interaction: CommandInteraction) {
        if(!this.playerCommandCheckPermission(interaction)) return;

        const guildManager = this.getGuildManager(interaction.guild!!)!!;
        const options = interaction.options;
        const index = options.getInteger("index", true) - 1;

        if(index < 0 || index + 1 > guildManager.player.queue.count) {
            interaction.reply({
                embeds: [
                    this.getExtendedEmbed({
                        description: `${this.config.nickname}辦不到..OHQ`
                    }, interaction.guild)
                ]
            });
            return;
        }

        guildManager.player.removeQueue(index);

        interaction.reply({
            embeds: [
                this.getExtendedEmbed({
                    description: `好耶！！${this.config.nickname}決定把這首歌丟掉——`
                }, interaction.guild)
            ]
        });
    }

    public async executeJump(interaction: CommandInteraction) {
        if(!this.playerCommandCheckPermission(interaction)) return;

        const guildManager = this.getGuildManager(interaction.guild!!)!!;
        const options = interaction.options;
        const index = options.getInteger("index", true) - 1;

        if(index < 0 || index + 1 > guildManager.player.queue.count) {
            interaction.reply({
                embeds: [
                    this.getExtendedEmbed({
                        description: `${this.config.nickname}辦不到..OHQ`
                    }, interaction.guild)
                ]
            });
            return;
        }

        guildManager.player.jumpTo(index);

        interaction.reply({
            embeds: [
                this.getExtendedEmbed({
                    description: `${this.config.nickname}要出發滾到那首歌去啦——`
                }, interaction.guild)
            ]
        });
    }

    public async handleMessageComponentInteraction(interaction: MessageComponentInteraction) {
        if(interaction.isButton()) {
            await this.handleButtonInteraction(interaction);
            return;
        }

        if(interaction.isSelectMenu()) {
            await this.handleSelectMenuInteraction(interaction);
            return;
        }
    }

    public async handleButtonInteraction(interaction: ButtonInteraction) {

    }

    public async handleSelectMenuInteraction(interaction: SelectMenuInteraction) {
        
    }

    public async handleContextMenuInteraction(interaction: ContextMenuInteraction) {

    }

    public async reload() {
        this.config.load();

        this.guildManagers.forEach(m => {
            m.config.load();
            this.registerGuildSlashCommands(m.guild);
        });
    }

    public getThemeColor(guild: Guild | null = null): number {
        if(!guild) return 0xd8993b;
        return this.getGuildManager(guild)?.getMainColor() ?? 0xd8993b;
    }

    public getEmbedBase(guild: Guild | null = null): MessageEmbedOptions {
        return {
            color: this.getThemeColor(guild),
            author: {
                name: this.api.user?.username,
                icon_url: this.api.user?.avatarURL() ?? undefined
            }
        };
    }

    public getExtendedEmbed(embed: MessageEmbedOptions, guild: Guild | null = null): MessageEmbedOptions {
        return {
            ...this.getEmbedBase(guild),
            ...embed
        };
    }

    public async exit() {
        this.canAcceptConsoleInput = false;
        if(this.activityInterval) {
            clearInterval(this.activityInterval);
            this.activityInterval = null;
        }

        Logger.info("Exiting...");
        this.api.destroy();
        process.exit(0);
    }

    public failedToSendMessage(name: string) {
        return (ex: any) => {
            Logger.error("Failed to send " + name + " message");
            console.log(ex);
        };
    }

    public failedToEditMessage(name: string) {
        return (ex: any) => {
            Logger.error("Failed to edit " + name + " message");
            console.log(ex);
        };
    }

    public failedToDeleteMessage(name: string) {
        return (ex: any) => {
            Logger.error("Failed to delete " + name + " message");
            console.log(ex);
        };
    }

    public failedToDeleteChannel(name: string) {
        return (ex: any) => {
            Logger.error("Failed to delete " + name + " channel");
            console.log(ex);
        };
    }

    public failedToCreateThread(name: string) {
        return (ex: any) => {
            Logger.error("Failed to create " + name + " thread");
            console.log(ex);
        };
    }

    public failedToAddThreadMember(name: string) {
        return (ex: any) => {
            Logger.error("Failed to sadd " + name + " thread member");
            console.log(ex);
        };
    }
}