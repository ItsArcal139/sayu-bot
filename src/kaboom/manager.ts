import { SayuBot } from "../bot";
import * as cron from "node-cron";
import { Logger } from "../utils/logger";
import { DMChannel, EmbedField, Guild, GuildMember, Interaction, Message, MessageEmbed, MessageEmbedOptions, NewsChannel, OverwriteResolvable, PermissionString, TextChannel, ThreadChannel } from "discord.js";
import { SayuGuildManager } from "../guildManager";
import { OnDutyProvider, ProviderBase, TestProvider } from "./providers";
import * as util from "util";
import { KTextColor, LiteralText, TranslateText } from "../utils/texts";

export class KaboomManager {
    private guildManager: SayuGuildManager;
    private static readonly debugTest = false;

    private provider: ProviderBase;
    private activeTask: cron.CronTask | null = null;
    private interactionHandler = async (interaction: Interaction) => {
        await this.handleInteraction(interaction);
    };

    private messageHandler = async (message: Message) => {
        await this.handleMessage(message);
    }

    public get bot() {
        return this.guildManager.bot;
    }

    public get config() {
        return this.guildManager.config.data.kaboom;
    }

    public get guild() {
        return this.guildManager.guild;
    }

    constructor(guildManager: SayuGuildManager) {
        this.guildManager = guildManager;
        this.provider = KaboomManager.debugTest ? new TestProvider(this.bot) : new OnDutyProvider(this.bot);
        
        this.bot.api.on("interactionCreate", this.interactionHandler);

        (async () => {
            const g = this.guild;
            Logger.info("Fetching the guild members...");
            Logger.info(`The guild has ${g?.memberCount ?? 0} member(s)`);
            try {
                await g?.members.fetch();
                Logger.info("Cached the guild members.");
            } catch(_) {
                Logger.warn("Failed to fetch the guild members!!");
            }
        })();

        this.bot.api.on("message", this.messageHandler);
    }

    private async handleMessage(msg: Message) {
        if(!this.config.enabled) return;
        if(msg.guild?.id != this.guild.id) return;
        if(msg.author.id == this.bot.api.user?.id) return;
        if(msg.channel instanceof DMChannel) return;
        if(!(msg.channel instanceof TextChannel) && !(msg.channel instanceof NewsChannel)) return;
        if(msg.member?.roles.cache.map(r => r.id).indexOf(this.config.forceKickRole) == -1) return;

        if(this.config.validChannels.indexOf(msg.channel.id) == -1) {
            Logger.info(`Force kick pending member ${msg.author.tag} is sending messages to ignored channel ${msg.channel.name} (#${msg.channel.id})`);
            return;
        }

        if(this.config.lockedForceKickMembers.indexOf(msg.author.id) == -1) {
            this.provider.removeRole(msg.member!!, this.config.forceKickRole);
            Logger.info(`Removed force kick role from ${msg.author.tag}`);
        } else {
            Logger.info(`Cannot remove force kick role from ${msg.author.tag} because they are banned from doing this.`);
        }
    }

    public dispose() {
        this.bot.api.off("interactionCreate", this.interactionHandler);
    }

    public async update() {
        var g = this.guild;
        var chns = this.config.channels;
        var c = await g.channels.resolve(chns.announcement) as TextChannel;
        var c2 = await g.channels.resolve(chns.checker) as TextChannel;
        const announceMsg = this.config.activeAnnounceMsg!!;
        const checkerMsg = this.config.activeCheckMsg!!;
        const aEmbed = this.getAnnounceEmbed();
        const cEmbed = this.getCheckerEmbed();

        this.provider.editMessageAt(c, announceMsg, {
            embeds: [ aEmbed ]
        });
        this.provider.editMessageAt(c2, checkerMsg, {
            embeds: [ cEmbed ]
        });

        var spl = this.config.activeSchedule?.split(" ");
        if(!spl) spl = ["0","0","0","0"];

        var min = spl[0];
        var mind = min.length == 1 ? "0" + min : min;
        var hr = spl[1];
        var day = spl[2];
        var month = spl[3];

        this.provider.setChannelTopic(c2, `${month}月${day}日 ${hr}:${mind} 截止`, "更新截止日期。");
    }

    private async handleInteraction(interaction: Interaction) {
        if(!interaction.isButton()) return;
        if(interaction.message.id != this.config.activeCheckMsg) return;
        if(interaction.customId != "divecheck_pass") return;
        if(interaction.guild?.id != this.guild.id) return;

        let g = this.guild;
        let ml = await g.members.fetch();
        let m = await ml.get(interaction.user.id);
        if(!m) {
            Logger.error(`Member with ID ${interaction.user.id} not found?`);
            return;
        }

        var hasBaseRole = m.roles.cache.map(r => r.id).indexOf(this.config.kickThresholdRole) != -1;
        if(!hasBaseRole) {
            Logger.warn(
                TranslateText.of("%s doesn't have the resident role!")
                    .addWith(LiteralText.of(m.user.tag).setColor(KTextColor.gold))
            );
        }

        let embed = this.bot.getExtendedEmbed({
            title: hasBaseRole ? "完成！" : `你還沒有 <@&${this.config.kickThresholdRole}> 身分組！`,
            description: hasBaseRole ? "感謝你！沒有潛水，超棒的！" : `取得 <@&${this.config.kickThresholdRole}> 身分組之後才能通過潛水檢查。`,
            author: {
                name: interaction.user.username,
                iconURL: interaction.user.avatarURL() ?? undefined
            },
            timestamp: new Date()
        }, interaction.guild);

        let alreadyChecked = m.roles.cache.map(r => r.id).indexOf(this.config.activeRole) != -1;
        if(alreadyChecked) {
            embed.title = "你已經通過潛水檢查了！";
            embed.description = "請不要重複簽到唷！";
            embed.footer = undefined;
        }

        interaction.reply({
            ephemeral: true,
            embeds: [ embed ]
        });

        // Give him the role.
        if(hasBaseRole && !alreadyChecked) {
            var r = await g.roles.fetch(this.config.activeRole);
            if(r) {
                m?.roles.add(r, "點選了潛水檢查的按鈕。").then(async (_) => {
                    var cid = this.config.channels.logger;
                    if(!cid) return;

                    var c = await g.channels.resolve(cid);
                    if(c instanceof TextChannel) {
                        let e2 = this.bot.getExtendedEmbed({
                            title: "通過潛水檢查",
                            fields: [
                                {
                                    name: "成員",
                                    value: `<@${m?.id}>\n${m?.id}`
                                }
                            ],
                            timestamp: new Date(),
                            author: {
                                name: interaction.user.tag,
                                iconURL: interaction.user.avatarURL() ?? undefined
                            }
                        }, interaction.guild);
                        this.provider.sendToChannel(c, { embeds: [ e2 ]});
                    }
                });
            }
        }
    }

    private getDateTimeDetails() {
        var spl = this.config.activeSchedule?.split(" ");
        if(!spl) spl = ["0","0","0","0"];

        var min = spl[0];
        var mind = min.length == 1 ? "0" + min : min;
        var hr = spl[1];
        var day = spl[2];
        var month = spl[3];

        return {
            min, minD: mind, hour: hr, day, month
        };
    }  

    private getCheckerEmbed() {
        const {
            minD: mind, hour: hr, day, month
        } = this.getDateTimeDetails();
        
        let embed = this.guildManager.getEmbedBase();
        embed.title = "潛水檢查";
        embed.description = `請在這條訊息下方按下按鈕，以通過潛水檢查，否則 <@&${this.config.kickThresholdRole}> 身分組將會被移除；\n`
            + `原先即無 <@&${this.config.kickThresholdRole}> 身分組者會被踢除！`;
        embed.fields = [{
            name: "截止日期",
            value: `${month}月${day}日 ${hr}:${mind}`
        }];
        return embed;
    }

    private getAnnounceEmbed() {
        const {
            minD: mind, hour: hr, day, month
        } = this.getDateTimeDetails();
                    
        let embed = this.guildManager.getEmbedBase();
        embed.title = "清除潛水者公告";
        embed.description = `沒有在 <#${this.config.channels.checker}> 點選按鈕的成員，<@&${this.config.kickThresholdRole}> 身分組將會被移除；\n`
            + `原先即無 <@&${this.config.kickThresholdRole}> 身分組者會被踢除！`;
        embed.fields = [{
            name: "可排除潛水檢查的身分組",
            value: this.config.ignoredRoles.map(r => `<@&${r}>`).join("\n")
        }, {
            name: "截止日期",
            value: `${month}月${day}日 ${hr}:${mind}`
        }];
        return embed;
    }

    public async schedule(month: number, date: number, hour: number = 0, minute: number = 0) {
        let chns = this.config.channels;
        var g = this.guild;
        let announceRID = null as string | null;
        let checkerRID = null as string | null;
        
        let schedule = `${minute} ${hour} ${date} ${month} *`;
        this.config.activeSchedule = schedule;

        var c = await g.channels.resolve(chns.announcement);
        if(c instanceof TextChannel || c instanceof NewsChannel) {
            const embed = this.getAnnounceEmbed();
            const r = await this.provider.sendToChannel(c, {
                embeds: [ embed ]
            });
            announceRID = r.id;
        }

        // Announce
        let c2 = await g.channels.resolve(chns.checker);
        if(c2 instanceof TextChannel || c2 instanceof NewsChannel) {
            const embed = this.getCheckerEmbed();

            const msg = await this.provider.sendToChannel(c2, {
                embeds: [ embed ], 
                components: [
                    {
                        type: 1,
                        components: [
                            {
                                type: 2,
                                style: 2,
                                label: "我沒有潛水！",
                                emoji: this.config.kaboomReaction, /* {
                                    name: "meme_phoque",
                                    id: "766825219306291231",
                                    animated: false
                                } */
                                customId: "divecheck_pass",
                            }
                        ]
                    }
                ]
            });

            var mind = (minute < 10 ? "0" : "") + minute;

            // Set the topic
            this.provider.setChannelTopic(c2, `${month}月${date}日 ${hour}:${mind} 截止`, "更新截止日期。");

            // Store the checker message by Snowflake.
            checkerRID = msg.id;
        }
        this.guildManager.config.save();
        await this.internalSchedule(schedule);

        if(c2 instanceof TextChannel || c2 instanceof NewsChannel) {
            var everyone = c2.guild.roles.everyone.id;
            c2.permissionOverwrites.set(this.getCheckerPermissionOverwrite(everyone, false));
        }

        this.config.activeAnnounceMsg = announceRID;
        this.config.activeCheckMsg = checkerRID;
        this.guildManager.config.save();
    }

    private async internalSchedule(time: string) {
        await this.cancel();
        this.config.activeSchedule = time;
        this.activeTask = cron.schedule(time, async () => {
            await this.execute();
            this.activeTask?.stop();
            this.config.activeSchedule = null;
            this.guildManager.config.save();
        });
    }

    private getCheckerPermissionOverwrite(everyone: string, hideEv: boolean): OverwriteResolvable[] {
        var evp: OverwriteResolvable = {
            id: everyone
        };

        var deny: PermissionString[] = [
            "SEND_MESSAGES", "ADD_REACTIONS"
        ];

        if(hideEv) {
            deny = [
                ...deny,
                "VIEW_CHANNEL"
            ];
        }
        evp.deny = deny;

        return [
            evp,
            {
                id: this.config.activeRole,
                deny: [
                    "VIEW_CHANNEL"
                ]
            }
        ];
    }

    public async execute() {
        if(!this.config.enabled) return;

        Logger.info("Started to compact inactive members...");
        if(KaboomManager.debugTest) {
            Logger.info("-- Debug mode is activated. That means the bot should not perform any real actions. --");
        }

        const g = this.guildManager.guild;
        var chns = this.config.channels;
        var cm = this.config.activeCheckMsg;
        if(cm != null) {
            var checkerChn = g?.channels.resolve(chns.checker);
            if(checkerChn instanceof TextChannel) {
                var everyone = checkerChn.guild.roles.everyone.id;
                checkerChn.permissionOverwrites.set(this.getCheckerPermissionOverwrite(everyone, true));
                if(cm != "<debug>") {
                    checkerChn.messages.delete(cm).finally(() => {});
                }
            }
        }

        var members = await g?.members.fetch();
        var count = 0;
        var kicked = 0;
        var pendKick: GuildMember[] = [];
        members?.forEach(m => {
            var shouldIgnore = false;
            
            if(m.user.bot || m.user.id == g?.ownerId) {
                // Ignore bots and server owner.
                return;
            }

            this.config.ignoredRoles.forEach(rid => {
                if(m.roles.cache.map(r => r.id).indexOf(rid) != -1) {
                    shouldIgnore = true;
                }
            });

            if(shouldIgnore) {
                return;
            }

            var toKick = false;

            const roles = m.roles.cache.map(r => r.id);
            if(roles.indexOf(this.config.forceKickRole) != -1) {
                // Force kick role exists, so we kick the member.
                toKick = true;
            }

            if(!toKick) {
                if(roles.indexOf(this.config.activeRole) == -1) {
                    // Didn't have the active role.

                    // Check if this inactive member has the kick threshold role.
                    var kr = this.config.kickThresholdRole;

                    if(roles.indexOf(kr) == -1) {
                        // Kick ones without that role.
                        toKick = true;
                    }

                    // Check if this inactive member will be kicked.
                    if(!toKick) {
                        // Remove the threshold role.
                        this.provider.removeRole(m, kr);
                    }
                    count++;
                } else {
                    // Remove the active role.
                    this.provider.removeRole(m, this.config.activeRole);
                }
            }

            if(toKick) {
                if(pendKick.indexOf(m) == -1) {
                    pendKick.push(m);
                }
            }
        });

        pendKick.forEach(async (m) => {
            let embed = {
                title: "您因為潛水已被踢除",
                description: `您因為於潛水檢查時沒有 <@&${this.config.kickThresholdRole}> 身分組，機器人已自動將您踢除。`,
                fields: [] as EmbedField[]
            } as MessageEmbedOptions;

            const isForceKick = m.roles.cache.map(r => r.id).indexOf(this.config.forceKickRole) != -1;
            if(isForceKick) {
                embed.description = "由於您被手動標記為潛水，您已被機器人直接踢出。";
            }

            embed.fields?.push({
                name: "伺服器連結",
                value: "[連結](https://discord.gg/pWPNVqXRGy)",
                inline: false
            });
            embed = this.bot.getExtendedEmbed(embed, this.guild);
            
            this.provider.sendToMember(m, { embeds: [ embed ] }).finally(() => {
                this.provider.kickMember(m, isForceKick ? "潛水檢查時被手動標記為潛水，已自動踢除。" : "潛水檢查時沒有最低要求身分組，已自動踢除。");
            });
            kicked++;
        });

        Logger.warn(`Cleared roles of ${count} members.`);
        Logger.info("kaboom() done.");

        var c = await g?.channels.resolve(chns.announcement);
        if(c instanceof TextChannel) {
            let embed = {
                title: "潛水檢查完畢",
                description: `原先無 <@&${this.config.kickThresholdRole}> 身分組的成員已被踢除；\n`
                    + `有 <@&${this.config.kickThresholdRole}> 身分組的潛水成員，<@&${this.config.kickThresholdRole}> 身分組已被移除。`,
                fields: [] as EmbedField[]
            } as MessageEmbedOptions;

            embed.fields?.push({
                name: "潛水人數",
                value: `${count}人`,
                inline: true
            }, {
                name: "踢除人數",
                value: `${kicked}人`,
                inline: true
            });
            embed = this.bot.getExtendedEmbed(embed, this.guild);

            this.provider.sendToChannel(c, { embeds: [ embed ] });
        }
    }

    public async cancel() {
        this.activeTask?.stop();

        const g = this.guildManager.guild;
        var chns = this.config.channels;
        var cm = this.config.activeCheckMsg;

        var checkerChn = g?.channels.resolve(chns.checker);
        if(checkerChn instanceof TextChannel) {
            var everyone = checkerChn.guild.roles.everyone.id;
            await checkerChn.permissionOverwrites.set(this.getCheckerPermissionOverwrite(everyone, true));
            if(cm != "<debug>" && cm != null) {
                await checkerChn.messages.delete(cm).catch(_ => {}).finally(() => {});
            }
        }
    }
}