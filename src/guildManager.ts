import { Guild } from "discord.js";
import { SayuBot } from "./bot";
import { BotGuildConfig } from "./guildConfig";
import { KaboomManager } from "./kaboom/manager";
import { PlayerManager } from "./player/manager";
import { VoiceController } from "./voiceController";

export class SayuGuildManager {
    public bot: SayuBot;
    public guild: Guild;
    public config: BotGuildConfig;
    public rootPath: string;

    public kaboom: KaboomManager;
    public voiceController = new VoiceController();
    public player: PlayerManager;

    constructor(bot: SayuBot, guild: Guild) {
        this.bot = bot;
        this.guild = guild;
        this.rootPath = "guilds/" + guild.id + "/";
        this.config = new BotGuildConfig(guild);

        this.kaboom = new KaboomManager(this);
        this.player = new PlayerManager(this);
    }

    public dispose() {
        this.kaboom.dispose();
        this.player.dispose();
    }

    public getMainColor() {
        let m = this.guild.members.cache.get(this.bot.api.user!!.id);
        return m?.roles.color?.color;
    }

    public getEmbedBase() {
        return this.bot.getExtendedEmbed({
            author: {
                name: this.guild.name,
                iconURL: this.guild.iconURL() ?? undefined
            },
            color: this.getMainColor()
        });
    }
}