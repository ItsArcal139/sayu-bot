import { GuildChannel, TextChannel } from 'discord.js';
import * as fs from 'fs';
import { Logger } from './utils/logger';

const CONFIG_FILE_NAME: string = 'config.json';
const GUILD_DIR_NAME: string = 'guilds';

type BotGuildConfigData = typeof BotGuildConfig.DEFAULT & {
    [key: string]: any
};

export class BotGuildConfig {
    public static readonly DEFAULT = {
        version: 2,
        kaboom: {
            enabled: false,
            kaboomReaction: {
                name: "<empty>",
                id: "<empty>",
                animated: false
            },

            activeSchedule: null as string | null,
            activeRole: "<role indicates that member is being active>",
            activeAnnounceMsg: null as string | null,
            activeCheckMsg: null as string | null,
            channels: {
                logger: "<empty>",
                announcement: "<empty>",
                checker: "<empty>",
            },
            kickThresholdRole: "<empty>",
            ignoredRoles: [] as string[],
            validChannels: [] as string[],
            forceKickRole: "<empty>",
            lockedForceKickMembers: [] as string[]
        },
        speak: {
            volume: 0.5,
            language: "ja-JP"
        },
        player: {
            volume: 0.1,
            lastTextChannel: "<empty>",
            lastPlayingMessage: null as string | null
        }
    };
    public data: BotGuildConfigData = { ...BotGuildConfig.DEFAULT };
    public id: string;

    constructor(guildId: string) {
        this.id = guildId;
        this.load();
    }

    public load() {
        Logger.log("Loading config for guild: " + this.id)

        if(!fs.existsSync(GUILD_DIR_NAME)) {
            fs.mkdirSync(GUILD_DIR_NAME);
        }

        if(!fs.existsSync(GUILD_DIR_NAME + "/" + this.id)) {
            fs.mkdirSync(GUILD_DIR_NAME + "/" + this.id);
        }

        if(!fs.existsSync(GUILD_DIR_NAME + "/" + this.id + "/" + CONFIG_FILE_NAME)) {
            fs.writeFileSync(GUILD_DIR_NAME + "/" + this.id + "/" + CONFIG_FILE_NAME, "{}");
        }

        this.data = {
            ...BotGuildConfig.DEFAULT,
            ...JSON.parse(fs.readFileSync(GUILD_DIR_NAME + "/" + this.id + "/" + CONFIG_FILE_NAME).toString())
        };
        
        this.upgrade();
        this.save();
    }

    public upgrade() {
        if(this.data.version == 1) {
            this.data.speak.language = BotGuildConfig.DEFAULT.speak.language;
            this.data.version = 2;
        }
    }

    public save() {
        fs.writeFileSync(GUILD_DIR_NAME + "/" + this.id + "/" + CONFIG_FILE_NAME, JSON.stringify(this.data, null, 4));
    }
}