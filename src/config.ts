import { GuildChannel, TextChannel } from 'discord.js';
import * as fs from 'fs';

const CONFIG_FILE_NAME: string = 'config.json';

type BotConfigData = typeof BotConfig.DEFAULT & {
    [key: string]: any
};

export class BotConfig {
    public static readonly DEFAULT = {
        version: 1,
        token: "<insert token here>",
        nickname: "早柚",
        commandName: "sayu",
        status: "idle" as "idle" | "online" | "dnd" | "invisible",
        activity: {
            name: "大家睡覺...zzZ",
            type: "WATCHING" as "LISTENING" | "PLAYING" | "STREAMING" | "WATCHING" | "CUSTOM" | "COMPETING" | undefined
        },
        repository: {
            provider: "GitHub",
            url: "https://github.com/ItsArcal139/sayu-bot"
        }
    };

    public data: BotConfigData = { ...BotConfig.DEFAULT };

    constructor() {
        this.load();
    }

    public get nickname() {
        return this.data.nickname ?? BotConfig.DEFAULT.nickname;
    }

    public get commandName() {
        return this.data.commandName ?? BotConfig.DEFAULT.commandName;
    }

    public get repository() {
        return {
            ...this.data.repository ?? BotConfig.DEFAULT.repository
        };
    }

    public load() {
        if(!fs.existsSync(CONFIG_FILE_NAME)) {
            fs.writeFileSync(CONFIG_FILE_NAME, "{}");
        }

        this.data = JSON.parse(fs.readFileSync(CONFIG_FILE_NAME).toString());
        this.data = {
            ...BotConfig.DEFAULT,
            ...this.data
        };
        
        fs.writeFileSync(CONFIG_FILE_NAME, JSON.stringify(this.data, null, 4));
    }

    public getToken(): string {
        return this.data.token;
    }
}